// MIDI notes: build, humanise, write to .mid on disk, push into a Live clip.
import fs from "node:fs";
import path from "node:path";
import type { Ableton } from "ableton-js";
import type { Track } from "ableton-js/ns/track";
import { OUT } from "./paths.js";

export interface Note {
  pitch: number;
  time: number; // beats
  duration: number; // beats
  velocity: number; // 1..127
  muted?: boolean;
}

// General MIDI-style pad map that Live's factory Drum Racks follow.
export const DRUM = { kick: 36, rim: 37, snare: 38, clap: 39, chat: 42, perc: 41, ohat: 46, tom: 45, crash: 49, ride: 51 } as const;

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_TO_SHARP: Record<string, string> = { Db: "C#", Eb: "D#", Fb: "E", Gb: "F#", Ab: "G#", Bb: "A#", Cb: "B" };
/** "F#1" / "Gb1" -> 42 (C3 = 60, Live convention). Flats normalize to their sharp equivalent. */
export function pitch(name: string): number {
  const m = /^([A-G][#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note "${name}"`);
  const norm = FLAT_TO_SHARP[m[1]] ?? m[1];
  return NOTE_NAMES.indexOf(norm) + (Number(m[2]) + 2) * 12;
}

const rnd = mulberry(1);
export function seed(n: number) {
  Object.assign(rnd, mulberry(n));
}
function mulberry(a: number) {
  const f = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return f;
}
export const rand = () => rnd();

/** Velocity jitter and micro-timing. Keep small: +-8 vel, +-10ms feel at 140 is ~0.02 beats. */
export function humanise(notes: Note[], vel = 8, time = 0.015): Note[] {
  return notes.map((n) => ({
    ...n,
    velocity: Math.max(1, Math.min(127, Math.round(n.velocity + (rand() * 2 - 1) * vel))),
    time: Math.max(0, n.time + (n.time === 0 ? 0 : (rand() * 2 - 1) * time)),
  }));
}

/** Swing 16ths: 0.5 = straight, 0.58 = MPC-ish. Delays every second 16th. */
export function swing(notes: Note[], amount = 0.56): Note[] {
  const shift = (amount - 0.5) * 0.5; // in beats, per off-16th
  return notes.map((n) => {
    const pos16 = Math.round(n.time * 4);
    const isOff = pos16 % 2 === 1 && Math.abs(n.time * 4 - pos16) < 0.01;
    return isOff ? { ...n, time: n.time + shift } : n;
  });
}

export function hit(pitch: number, time: number, velocity = 100, duration = 0.25): Note {
  return { pitch, time, duration, velocity };
}

// ---- Standard MIDI File writer (type 0, one track). No dependency.
export function writeMidi(file: string, notes: Note[], bpm = 120, ppq = 480) {
  const events: { tick: number; bytes: number[] }[] = [];
  for (const n of notes) {
    if (n.muted) continue;
    const on = Math.round(n.time * ppq);
    const off = Math.round((n.time + n.duration) * ppq);
    events.push({ tick: on, bytes: [0x90, n.pitch, n.velocity] });
    events.push({ tick: Math.max(off, on + 1), bytes: [0x80, n.pitch, 0] });
  }
  events.sort((a, b) => a.tick - b.tick || a.bytes[0] - b.bytes[0]); // offs before ons at same tick
  const body: number[] = [];
  const tempo = Math.round(60_000_000 / bpm);
  body.push(0x00, 0xff, 0x51, 0x03, (tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255);
  let last = 0;
  for (const e of events) {
    body.push(...vlq(e.tick - last), ...e.bytes);
    last = e.tick;
  }
  body.push(0x00, 0xff, 0x2f, 0x00);
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (ppq >> 8) & 255, ppq & 255];
  const trk = [0x4d, 0x54, 0x72, 0x6b, (body.length >>> 24) & 255, (body.length >> 16) & 255, (body.length >> 8) & 255, body.length & 255];
  const out = path.isAbsolute(file) ? file : path.join(OUT, file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from([...header, ...trk, ...body]));
  return out;
}
function vlq(n: number): number[] {
  const bytes = [n & 0x7f];
  while ((n >>= 7) > 0) bytes.unshift((n & 0x7f) | 0x80);
  return bytes;
}

// ---- Live

/** Put notes into session clip slot `slot` on `track`, replacing whatever is there. Returns the clip. */
export async function pushClip(live: Ableton, track: Track, slot: number, notes: Note[], lengthBeats: number, name?: string) {
  const slots = await track.get("clip_slots");
  const s = slots[slot];
  if (!s) throw new Error(`track has no clip slot ${slot}`);
  if (await s.get("has_clip")) {
    console.error(`pushClip: overwriting existing clip in slot ${slot} on "${await track.get("name")}"`);
    await s.deleteClip();
  }
  await s.createClip(lengthBeats);
  const clip = (await s.get("clip"))!;
  await clip.setNotes(notes.map((n) => ({ pitch: n.pitch, time: n.time, duration: n.duration, velocity: n.velocity, muted: n.muted ?? false })));
  if (name) await clip.set("name", name);
  return clip;
}

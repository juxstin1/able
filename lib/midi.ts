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

// ---- Standard MIDI File reader. Handles format 0/1 (all tracks flattened), running status,
// meta/sysex events skipped except tempo. No dependency, symmetric with writeMidi above.
export function readMidi(file: string): { notes: Note[]; ppq: number; bpm?: number } {
  const buf = fs.readFileSync(file);
  let pos = 0;
  const str = (n: number) => {
    const s = buf.toString("ascii", pos, pos + n);
    pos += n;
    return s;
  };
  const u8 = () => buf[pos++];
  const u16 = () => {
    const v = buf.readUInt16BE(pos);
    pos += 2;
    return v;
  };
  const u32 = () => {
    const v = buf.readUInt32BE(pos);
    pos += 4;
    return v;
  };
  const vlqRead = () => {
    let v = 0;
    for (;;) {
      const b = u8();
      v = (v << 7) | (b & 0x7f);
      if (!(b & 0x80)) return v;
    }
  };

  if (str(4) !== "MThd") throw new Error(`${file}: not a MIDI file (missing MThd)`);
  u32(); // header length, always 6
  u16(); // format - flattened regardless
  const numTracks = u16();
  const division = u16();
  if (division & 0x8000) throw new Error(`${file}: SMPTE time division not supported`);
  const ppq = division;

  let bpm: number | undefined;
  const notes: Note[] = [];
  for (let t = 0; t < numTracks; t++) {
    if (str(4) !== "MTrk") throw new Error(`${file}: expected MTrk`);
    // Read the length first: `pos + u32()` captures pos before u32 advances it, ending every
    // track 4 bytes early - harmless on single-track files, "expected MTrk" on format 1.
    const len = u32();
    const trackEnd = pos + len;
    let tick = 0;
    let running = 0;
    // A FIFO per pitch: a humanized hat can retrigger before its previous note-off, and a single
    // slot per pitch would silently drop the earlier hit.
    const active = new Map<number, { start: number; velocity: number }[]>();
    const close = (note: number, endTick: number) => {
      const a = active.get(note)?.shift();
      if (!a) return;
      notes.push({ pitch: note, time: a.start / ppq, duration: Math.max(endTick - a.start, 1) / ppq, velocity: a.velocity });
    };
    while (pos < trackEnd) {
      tick += vlqRead();
      let status = buf[pos];
      if (status & 0x80) {
        pos++;
        running = status;
      } else status = running;
      const type = status & 0xf0;
      if (status === 0xff) {
        const metaType = u8();
        const len = vlqRead();
        if (metaType === 0x51 && len === 3) bpm = 60_000_000 / ((buf[pos] << 16) | (buf[pos + 1] << 8) | buf[pos + 2]);
        pos += len;
      } else if (status === 0xf0 || status === 0xf7) {
        pos += vlqRead();
      } else if (type === 0x90 || type === 0x80) {
        const note = u8();
        const vel = u8();
        if (type === 0x90 && vel > 0) active.set(note, [...(active.get(note) ?? []), { start: tick, velocity: vel }]);
        else close(note, tick);
      } else if (type === 0xa0 || type === 0xb0 || type === 0xe0) {
        pos += 2;
      } else if (type === 0xc0 || type === 0xd0) {
        pos += 1;
      } else {
        throw new Error(`${file}: unhandled status byte 0x${status.toString(16)} at ${pos}`);
      }
    }
    pos = trackEnd;
  }
  notes.sort((a, b) => a.time - b.time);
  return { notes, ppq, bpm };
}

// GM-style drum note -> role, the inverse of DRUM above. For remapping an imported pattern
// (written against GM note numbers) onto a specific kit's actual pad notes via padsFor().
const GM_ROLE = new Map<number, keyof typeof DRUM>(Object.entries(DRUM).map(([role, note]) => [note, role as keyof typeof DRUM]));
export function remapDrumNotes(notes: Note[], pads: Record<keyof typeof DRUM, number>): Note[] {
  return notes.map((n) => {
    const role = GM_ROLE.get(n.pitch);
    return role ? { ...n, pitch: pads[role] } : n;
  });
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

/** Delete any Arrangement clip(s) on `track` that overlap [startBeat, startBeat + lengthBeats). */
export async function clearArrangementRange(track: Track, startBeat: number, lengthBeats: number) {
  const end = startBeat + lengthBeats;
  for (const c of await track.get("arrangement_clips")) {
    const cStart = await c.get("start_time");
    const cEnd = cStart + (await c.get("length"));
    if (cStart < end && cEnd > startBeat) await track.deleteClip(c.raw.id);
  }
}

/** Put notes into an Arrangement clip on `track` at `startBeat`, deleting any existing clip(s) that overlap the range first. */
export async function replaceArrangementClip(track: Track, startBeat: number, lengthBeats: number, notes: Note[], name?: string) {
  await clearArrangementRange(track, startBeat, lengthBeats);
  const clip = await track.createMidiClip(startBeat, lengthBeats);
  await clip.setNotes(notes.map((n) => ({ pitch: n.pitch, time: n.time, duration: n.duration, velocity: n.velocity, muted: n.muted ?? false })));
  if (name) await clip.set("name", name);
  return clip;
}

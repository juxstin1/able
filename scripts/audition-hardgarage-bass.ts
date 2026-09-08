// Put the approved teaser + rolling bass MIDI on the installed HardGarage preset,
// directly in Arrangement. Mute (do not delete) Serum, chords, and hook for a clean decision.
// usage: node_modules/.bin/tsx scripts/audition-hardgarage-bass.ts
import type { Track } from "ableton-js/ns/track";
import { withLive, print, track } from "../lib/live.js";
import { loadOnTrack } from "../lib/browser.js";
import { getOrCreateTrack } from "../lib/song.js";
import { hit, humanise, pitch, seed, swing, type Note } from "../lib/midi.js";

const NAME = "BASS ALT 1 - HardGarage";
const F = pitch("F1");
const AB = pitch("Ab1");
const C = pitch("C2");
const EB = pitch("Eb2");
const F2 = pitch("F2");

const shifted = (notes: Note[], beats: number): Note[] => notes.map((note) => ({ ...note, time: note.time + beats }));
const repeat = (notes: Note[], copies: number): Note[] => Array.from({ length: copies }, (_, i) => shifted(notes, i * 16)).flat();

function phrase(octave: boolean): Note[] {
  const notes: Note[] = [];
  for (let bar = 0; bar < 4; bar++) {
    const b = bar * 4;
    if (!octave) notes.push(
      hit(F, b, 112, 0.42), hit(F, b + 0.75, 92, 0.28), hit(bar % 2 ? AB : F2, b + 1.5, 98, 0.24),
      hit(C, b + 2, 106, 0.38), hit(EB, b + 2.75, 96, 0.26), hit(F, b + 3.5, 108, 0.34),
    );
    else notes.push(
      hit(F, b, 110, 0.36), hit(F, b + 0.5, 88, 0.24), hit(AB, b + 1.25, 98, 0.3),
      hit(C, b + 1.75, 104, 0.3), hit(F2, b + 2.5, 100, 0.24), hit(EB, b + 3, 96, 0.3),
      hit(bar === 3 ? F : C, b + 3.75, 106, 0.2),
    );
  }
  return swing(humanise(notes, 4, 0.004), 0.6);
}

async function place(t: Track, startBar: number, bars: number, notes: Note[], name: string) {
  const clip = await t.createMidiClip((startBar - 1) * 4, bars * 4);
  await clip.setNotes(notes.map((note) => ({ ...note, muted: false })));
  await clip.set("name", name);
  return { startBar, bars, name, notes: notes.length };
}

seed(83);
const tight = phrase(false);
seed(97);
const octave = phrase(true);
const teaser = Array.from({ length: 4 }, (_, bar) => hit(F, bar * 4, 88 + bar * 4, 0.75));
const outro = tight.filter((_, index) => index % 3 !== 1);

print(await withLive(async (live) => {
  const alt = await getOrCreateTrack(live, NAME, (t) =>
    loadOnTrack(live, t, "packs", ["Skitter and Step", "Sounds", "Bass", "HardGarage.adg"]),
  );
  const existing = await alt.get("arrangement_clips");
  if (existing.length) throw new Error(`${NAME} already has Arrangement clips; refusing to duplicate them`);
  const devices = await alt.get("devices");
  if (!devices.length) throw new Error("HardGarage preset did not load; refusing to mute the current instruments");

  const placed = [
    await place(alt, 13, 4, teaser, "TEASER - HardGarage Subtle"),
    await place(alt, 17, 8, repeat(tight, 2), "ROLLING A - HardGarage"),
    await place(alt, 25, 8, repeat(octave, 2), "ROLLING B - HardGarage Octaves"),
    await place(alt, 41, 8, repeat(octave, 2), "ROLLING C - HardGarage Push"),
    await place(alt, 49, 8, repeat(tight, 2), "ROLLING A - HardGarage Return"),
    await place(alt, 57, 4, outro, "ROLLING OUTRO - HardGarage"),
  ];

  const muted = [];
  for (const name of ["ARR Bass 2026-09-04", "ARR Chords 2026-09-04", "ARR Hook 2026-09-04"]) {
    const t = await track(live, name);
    await t.set("mute", true);
    muted.push(name);
  }
  await alt.set("mute", false);
  await live.song.stopAllClips();
  await live.song.safeStopPlaying();
  await live.song.set("current_song_time", 48); // bar 13
  await live.application.view.showView("Arranger");

  return {
    track: NAME,
    devices: await Promise.all(devices.map((device) => device.get("name"))),
    placed,
    muted,
    startBar: 13,
    view: "Arranger",
  };
}));

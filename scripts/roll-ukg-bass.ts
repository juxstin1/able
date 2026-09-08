// Preserve the subtle bars 13-16 teaser and replace only the full Arrangement
// bass sections with rolling F-minor phrases. The existing instrument is untouched.
// usage: node_modules/.bin/tsx scripts/roll-ukg-bass.ts
import type { Track } from "ableton-js/ns/track";
import { withLive, print, track } from "../lib/live.js";
import { hit, humanise, pitch, seed, swing, writeMidi, type Note } from "../lib/midi.js";

const DATE = "2026-09-04";
const BPM = 132;
const F = pitch("F1");
const AB = pitch("Ab1");
const C = pitch("C2");
const EB = pitch("Eb2");
const F2 = pitch("F2");

const shifted = (notes: Note[], beats: number): Note[] =>
  notes.map((note) => ({ ...note, time: note.time + beats }));

const repeat = (notes: Note[], copies: number): Note[] =>
  Array.from({ length: copies }, (_, i) => shifted(notes, i * 16)).flat();

function rollingPhrase(variant: "tight" | "octave"): Note[] {
  const notes: Note[] = [];
  for (let bar = 0; bar < 4; bar++) {
    const b = bar * 4;
    if (variant === "tight") {
      notes.push(
        hit(F, b, 112, 0.42),
        hit(F, b + 0.75, 92, 0.28),
        hit(bar % 2 ? AB : F2, b + 1.5, 98, 0.24),
        hit(C, b + 2, 106, 0.38),
        hit(EB, b + 2.75, 96, 0.26),
        hit(F, b + 3.5, 108, 0.34),
      );
    } else {
      notes.push(
        hit(F, b, 110, 0.36),
        hit(F, b + 0.5, 88, 0.24),
        hit(AB, b + 1.25, 98, 0.3),
        hit(C, b + 1.75, 104, 0.3),
        hit(F2, b + 2.5, 100, 0.24),
        hit(EB, b + 3, 96, 0.3),
        hit(bar === 3 ? F : C, b + 3.75, 106, 0.2),
      );
    }
  }
  return swing(humanise(notes, 4, 0.004), 0.6);
}

async function place(track: Track, startBar: number, bars: number, notes: Note[], name: string) {
  const clip = await track.createMidiClip((startBar - 1) * 4, bars * 4);
  await clip.setNotes(notes.map((note) => ({ ...note, muted: note.muted ?? false })));
  await clip.set("name", name);
  return { startBar, bars, name, noteCount: notes.length };
}

seed(83);
const tight = rollingPhrase("tight");
seed(97);
const octave = rollingPhrase("octave");
const outro = tight.filter((_, index) => index % 3 !== 1);

writeMidi(`ukg-rolling-bass-tight-${DATE}.mid`, tight, BPM);
writeMidi(`ukg-rolling-bass-octave-${DATE}.mid`, octave, BPM);

print(
  await withLive(async (live) => {
    const bass = await track(live, `ARR Bass ${DATE}`);
    const devices = await bass.get("devices");
    const instrumentNames = await Promise.all(devices.map((device) => device.get("name")));
    const preserved = [];
    const removed = [];
    for (const clip of await bass.get("arrangement_clips")) {
      const name = await clip.get("name");
      if (name === "BASS - Intro Teaser") {
        preserved.push(name);
        continue;
      }
      if (name.startsWith("BASS - ")) {
        removed.push(name);
        await bass.deleteClip(clip);
      }
    }

    const placed = [
      await place(bass, 17, 8, repeat(tight, 2), "ROLLING A - Tight First Drop"),
      await place(bass, 25, 8, repeat(octave, 2), "ROLLING B - Octave Second Phrase"),
      await place(bass, 41, 8, repeat(octave, 2), "ROLLING C - Breaky Drop Push"),
      await place(bass, 49, 8, repeat(tight, 2), "ROLLING A - Return"),
      await place(bass, 57, 4, outro, "ROLLING OUTRO - Reduced Tail"),
    ];

    await live.song.stopAllClips();
    await live.application.view.showView("Arranger");
    return { instrumentUntouched: instrumentNames, preserved, removed, placed, view: "Arranger" };
  }),
);

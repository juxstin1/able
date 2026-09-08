// Expand the 16-bar intro into a 64-bar Arrangement-only UKG draft.
// A/B/C remain the three authored drum variations and are placed as named clips.
// usage: node_modules/.bin/tsx scripts/arrange-ukg-song.ts
import type { Track } from "ableton-js/ns/track";
import { withLive, print } from "../lib/live.js";
import { loadOnTrack } from "../lib/browser.js";
import { getOrCreateTrack, setParams } from "../lib/song.js";
import { padsFor } from "../lib/kits.js";
import { hit, pitch, seed, writeMidi, type Note } from "../lib/midi.js";
import { kickSnare, straightHats } from "../lib/patterns.js";
import { OP_808, STYLES } from "../lib/styles.js";

const DATE = "2026-09-04";
const BPM = 132;
const KIT = "Garage Kit.adg";
const style = STYLES.ukg;
const { pads } = padsFor(KIT);

const shifted = (notes: Note[], beats: number): Note[] =>
  notes.map((note) => ({ ...note, time: note.time + beats }));

const repeat = (notes: Note[], copies: number, phraseBeats = 16): Note[] =>
  Array.from({ length: copies }, (_, i) => shifted(notes, i * phraseBeats)).flat();

async function existingOrCreate(
  live: Parameters<Parameters<typeof withLive>[0]>[0],
  currentName: string,
  previousName: string | undefined,
  init: (track: Track) => Promise<unknown>,
) {
  const tracks = await live.song.get("tracks");
  for (const track of tracks) {
    const name = await track.get("name");
    if (name === currentName) return track;
    if (previousName && name === previousName) {
      await track.set("name", currentName);
      return track;
    }
  }
  return getOrCreateTrack(live, currentName, init);
}

async function place(track: Track, startBar: number, bars: number, notes: Note[], name: string) {
  const clip = await track.createMidiClip((startBar - 1) * 4, bars * 4);
  await clip.setNotes(notes.map((note) => ({ ...note, muted: note.muted ?? false })));
  await clip.set("name", name);
  return { track: await track.get("name"), startBar, bars, name, notes: notes.length };
}

seed(7);
const drumsA = style.drums(4, pads);
seed(19);
const drumsB = [
  ...kickSnare({ bars: 4, style: "ukg", pads }),
  ...straightHats({ bars: 4, pads, base: 8, swingAmt: 0.62, accent: 108, ghost: 64 }),
];
seed(31);
const drumsC = [
  ...style.drums(4, pads),
  ...Array.from({ length: 4 }, (_, bar) => {
    const b = bar * 4;
    return [hit(pads.perc, b + 0.75, 72), hit(pads.perc, b + 2.25, 82), hit(pads.rim, b + 3.5, bar === 3 ? 98 : 74)];
  }).flat(),
];
seed(53);
const hatsBuild = straightHats({ bars: 4, pads, base: 16, swingAmt: 0.62, accent: 104, ghost: 54 });
const hatsOutro = straightHats({ bars: 4, pads, base: 8, swingAmt: 0.62, accent: 88, ghost: 45 });

seed(61);
const bassPhrase = style.bass(4, "F1");
const bassTeaser = Array.from({ length: 4 }, (_, bar) => hit(pitch("F1"), bar * 4, 88 + bar * 4, 0.75));

seed(71);
const chordPhrase = style.keys(4, "F1");
const chordBreak = style.keysCalm(8, "F1");

const hookPhrase = (bars: number, sparse = false): Note[] => {
  const tones = [pitch("F4"), pitch("Ab4"), pitch("C5"), pitch("Eb5")];
  const notes: Note[] = [];
  for (let bar = 0; bar < bars; bar++) {
    const b = bar * 4;
    const turn = bar % 4;
    notes.push(hit(tones[turn], b + 0.75, sparse ? 82 : 102, sparse ? 0.28 : 0.38));
    if (!sparse || bar % 2 === 1) notes.push(hit(tones[(turn + 2) % tones.length], b + 2.5, sparse ? 76 : 96, 0.32));
    if (!sparse && bar % 4 === 3) notes.push(hit(tones[3], b + 3.25, 108, 0.2), hit(tones[2], b + 3.5, 100, 0.2));
  }
  return notes;
};

writeMidi(`ukg-arrangement-bass-${DATE}.mid`, repeat(bassPhrase, 4), BPM);
writeMidi(`ukg-arrangement-chords-${DATE}.mid`, repeat(chordPhrase, 4), BPM);
writeMidi(`ukg-arrangement-hook-${DATE}.mid`, hookPhrase(16), BPM);

print(
  await withLive(async (live) => {
    await live.song.beginUndoStep();
    try {
      await live.song.set("tempo", BPM);
      await live.song.stopAllClips();
      await live.song.safeStopPlaying();

      const drums = await existingOrCreate(live, `ARR Drums ${DATE}`, `INTRO Drums ${DATE}`, (track) =>
        loadOnTrack(live, track, "drums", [KIT]),
      );
      const chords = await existingOrCreate(live, `ARR Chords ${DATE}`, `INTRO Keys ${DATE}`, (track) =>
        loadOnTrack(live, track, "instruments", style.keysDevice),
      );
      const bass = await existingOrCreate(live, `ARR Bass ${DATE}`, undefined, async (track) => {
        await loadOnTrack(live, track, "instruments", ["Operator"]);
        await setParams(track, "Operator", OP_808);
      });
      const hook = await existingOrCreate(live, `ARR Hook ${DATE}`, undefined, (track) =>
        loadOnTrack(live, track, "instruments", ["Drift"]),
      );

      const placed = [];

      placed.push(await place(drums, 17, 8, repeat(drumsA, 2), "DRUM A - Tight First Drop"));
      placed.push(await place(drums, 25, 8, repeat(drumsB, 2), "DRUM B - Sparse Second Phrase"));
      placed.push(await place(drums, 37, 4, hatsBuild, "BUILD - Hats to C"));
      placed.push(await place(drums, 41, 8, repeat(drumsC, 2), "DRUM C - Breaky Second Drop"));
      placed.push(await place(drums, 49, 8, repeat(drumsA, 2), "DRUM A - Return"));
      placed.push(await place(drums, 57, 4, drumsB, "DRUM B - Outro Phrase"));
      placed.push(await place(drums, 61, 4, hatsOutro, "OUTRO - Hats Strip"));

      placed.push(await place(bass, 13, 4, bassTeaser, "BASS - Intro Teaser"));
      placed.push(await place(bass, 17, 16, repeat(bassPhrase, 4), "BASS - Drop A to B"));
      placed.push(await place(bass, 41, 16, repeat(bassPhrase, 4), "BASS - Drop C to A"));
      placed.push(await place(bass, 57, 4, bassPhrase, "BASS - Outro Answer"));

      placed.push(await place(chords, 17, 16, repeat(chordPhrase, 4), "CHORDS - Drop Skank"));
      placed.push(await place(chords, 33, 8, chordBreak, "CHORDS - Breakdown Pad"));
      placed.push(await place(chords, 41, 16, repeat(chordPhrase, 4), "CHORDS - Second Drop Skank"));
      placed.push(await place(chords, 57, 8, chordBreak, "CHORDS - Outro Pad"));

      placed.push(await place(hook, 9, 8, hookPhrase(8, true), "HOOK - Intro Fragments"));
      placed.push(await place(hook, 17, 16, hookPhrase(16), "HOOK - Full First Drop"));
      placed.push(await place(hook, 33, 8, hookPhrase(8, true), "HOOK - Breakdown Echo"));
      placed.push(await place(hook, 41, 16, hookPhrase(16), "HOOK - Full Second Drop"));
      placed.push(await place(hook, 57, 4, hookPhrase(4, true), "HOOK - Outro Fragment"));

      await live.application.view.showView("Arranger");
      await live.song.set("current_song_time", 0);

      return {
        bpm: BPM,
        key: "F minor",
        arrangementBars: 64,
        tracks: [await drums.get("name"), await bass.get("name"), await chords.get("name"), await hook.get("name")],
        placed,
        sessionPlaybackStopped: !(await live.song.get("is_playing")),
        visibleView: "Arranger",
      };
    } finally {
      await live.song.endUndoStep();
    }
  }),
);

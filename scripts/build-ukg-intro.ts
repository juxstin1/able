// Build three drum-groove audition clips in appended Session scenes, then place a
// separate 16-bar UKG intro on new Arrangement tracks. Existing tracks/clips are
// never selected as write targets.
// usage: node_modules/.bin/tsx scripts/build-ukg-intro.ts
import { withLive, print } from "../lib/live.js";
import { loadOnTrack } from "../lib/browser.js";
import { pushClip, seed, writeMidi, hit, type Note } from "../lib/midi.js";
import { getOrCreateTrack, ensureScenes, fireScene } from "../lib/song.js";
import { padsFor } from "../lib/kits.js";
import { kickSnare, straightHats } from "../lib/patterns.js";
import { STYLES } from "../lib/styles.js";

const BPM = 132;
const BARS = 16;
const KIT = "Garage Kit.adg";
const DATE = "2026-09-04";
const style = STYLES.ukg;
const { pads, missing, file: kitFile } = padsFor(KIT);

const shifted = (notes: Note[], beats: number): Note[] =>
  notes.map((note) => ({ ...note, time: note.time + beats }));

seed(7);
const tight = style.drums(4, pads);

seed(19);
const sparse = [
  ...kickSnare({ bars: 4, style: "ukg", pads }),
  ...straightHats({ bars: 4, pads, base: 8, swingAmt: 0.62, accent: 108, ghost: 64 }),
];

seed(31);
const breaky = [
  ...style.drums(4, pads),
  ...Array.from({ length: 4 }, (_, bar) => {
    const b = bar * 4;
    return [
      hit(pads.perc, b + 0.75, 72),
      hit(pads.perc, b + 2.25, 82),
      hit(pads.rim, b + 3.5, bar === 3 ? 98 : 74),
    ];
  }).flat(),
];

seed(47);
const introKeys = style.keysCalm(BARS, "F1");
const introDrums: Note[] = [
  // Bars 5-8: a restrained swung 8th-note hat pulse.
  ...shifted(straightHats({ bars: 4, pads, base: 8, swingAmt: 0.62, accent: 96, ghost: 52 }), 16),
  // Bars 9-12: 16th hats plus the backbeat, but still no kick.
  ...shifted(straightHats({ bars: 4, pads, base: 16, swingAmt: 0.62, accent: 102, ghost: 54 }), 32),
  ...Array.from({ length: 4 }, (_, bar) => {
    const b = 32 + bar * 4;
    return [
      hit(pads.snare, b + 1, 96),
      hit(pads.clap, b + 1, 88),
      hit(pads.snare, b + 3, 102),
      hit(pads.clap, b + 3, 94),
      ...(bar === 3 ? [hit(pads.rim, b + 2.75, 78), hit(pads.rim, b + 3.5, 88)] : []),
    ];
  }).flat(),
  // Bars 13-16: reveal the full 2-step groove and point at a bar-17 drop.
  ...shifted(style.drums(4, pads), 48),
];

writeMidi(`ukg-audition-tight-${DATE}.mid`, tight, BPM);
writeMidi(`ukg-audition-sparse-${DATE}.mid`, sparse, BPM);
writeMidi(`ukg-audition-breaky-${DATE}.mid`, breaky, BPM);
writeMidi(`ukg-intro-keys-${DATE}.mid`, introKeys, BPM);
writeMidi(`ukg-intro-drums-${DATE}.mid`, introDrums, BPM);

print(
  await withLive(async (live) => {
    await live.song.set("tempo", BPM);

    const auditionTrack = await getOrCreateTrack(live, `AUDITION Drums ${DATE}`, (track) =>
      loadOnTrack(live, track, "drums", [KIT]),
    );
    const before = await live.song.get("scenes");
    const firstScene = before.length;
    const scenes = await ensureScenes(live, firstScene + 3);
    const auditions = [
      { name: "DRUM A - Tight 2-Step", notes: tight },
      { name: "DRUM B - Sparse Shuffle", notes: sparse },
      { name: "DRUM C - Breaky Perc", notes: breaky },
    ];
    for (let i = 0; i < auditions.length; i++) {
      await scenes[firstScene + i].set("name", auditions[i].name);
      await scenes[firstScene + i].set("tempo", BPM);
      await pushClip(live, auditionTrack, firstScene + i, auditions[i].notes, 16, auditions[i].name);
    }

    const introKeysTrack = await getOrCreateTrack(live, `INTRO Keys ${DATE}`, (track) =>
      loadOnTrack(live, track, "instruments", style.keysDevice),
    );
    const introDrumsTrack = await getOrCreateTrack(live, `INTRO Drums ${DATE}`, (track) =>
      loadOnTrack(live, track, "drums", [KIT]),
    );

    const keysClip = await introKeysTrack.createMidiClip(0, BARS * 4);
    await keysClip.setNotes(introKeys.map((n) => ({ ...n, muted: n.muted ?? false })));
    await keysClip.set("name", "INTRO 16 bars - F minor pads");

    const drumsClip = await introDrumsTrack.createMidiClip(0, BARS * 4);
    await drumsClip.setNotes(introDrums.map((n) => ({ ...n, muted: n.muted ?? false })));
    await drumsClip.set("name", "INTRO 16 bars - staged 2-step drums");

    await live.application.view.showView("Arranger");
    await live.song.set("current_song_time", 0);
    await fireScene(live, firstScene, auditions[0].name);

    return {
      bpm: BPM,
      key: "F minor",
      kit: KIT,
      kitFile,
      padsMissing: missing,
      auditionTrack: `AUDITION Drums ${DATE}`,
      auditionScenes: auditions.map((a, i) => ({ scene: firstScene + i + 1, name: a.name, bars: 4 })),
      intro: {
        bars: BARS,
        beats: BARS * 4,
        tracks: [`INTRO Keys ${DATE}`, `INTRO Drums ${DATE}`],
        landmarks: ["1-4 pads", "5-8 swung hats", "9-12 hats + backbeat", "13-16 full 2-step"],
      },
      playing: auditions[0].name,
    };
  }),
);

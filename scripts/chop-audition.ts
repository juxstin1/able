// Place the five long chops on their own tracks, each through a completely different chain, laid
// back to back in the Arrangement so it plays as one pass. Session view is not the interface here.
// usage: node_modules/.bin/tsx scripts/chop-audition.ts [--bpm 124]
//        node_modules/.bin/tsx scripts/chop-audition.ts --params
import fs from "node:fs";
import path from "node:path";
import { withLive, track as findTrack, print } from "../lib/live.js";
import { loadOnTrack } from "../lib/browser.js";
import { setParams } from "../lib/song.js";
import { ROOT } from "../lib/paths.js";

const args = process.argv.slice(2);
const BPM = Number(args.includes("--bpm") ? args[args.indexOf("--bpm") + 1] : 124);
const PARAMS_ONLY = args.includes("--params");
const man = JSON.parse(fs.readFileSync(path.resolve(ROOT, "out", "audition.json"), "utf8")) as {
  clips: { label: string; file: string; source: string; secs: number; why: string }[];
};

const BARS = 8; // per treatment
// hits: bar offsets within the section. Sparse where the tail is the point, dense where the
// rhythm is - a granular wash repeated every two bars just smears into itself.
// pitches: semitone transpose per hit. The one PROVEN claim in the store is that pitch has to be
// part of the target pattern rather than a property of whichever chop you grabbed - four identical
// hits is a texture demo, four pitched ones is a riff. That is the difference these three needed.
const TREATMENTS: Record<string, { track: string; fx: string[]; hits: number[]; pitches: number[]; idea: string }> = {
  gate:    { track: "Chop A Gate",    fx: ["Auto Pan-Tremolo", "EQ Eight", "Delay", "Reverb"],            hits: [0, 4],       pitches: [0, 7],           idea: "a sustained drone cut back into rhythm by a gate - Bicep's Apricots trick, done with Auto Pan because the sidechain source is not settable by API" },
  stretch: { track: "Chop B Stretch", fx: ["Spectral Time", "Reverb", "EQ Eight"],                hits: [0],          pitches: [0],              idea: "smeared into an ambient wash - one hit, all tail" },
  formant: { track: "Chop C Formant", fx: ["Auto Shift", "Chorus-Ensemble", "Reverb"],            hits: [0, 1, 2, 3, 4, 5, 6, 7], pitches: [0, 3, 7, 5, 0, 3, 10, 7], idea: "a riff, not a texture - eight hits pitched through E minor, formant-shifted up - the chipmunk aesthetic, deliberately" },
  crunch:  { track: "Chop D Crunch",  fx: ["Roar", "Redux", "Saturator", "EQ Eight"],             hits: [0, 2, 4, 6], pitches: [0, 0, -2, 0],    idea: "destroyed - Roar into bit reduction, the Space Laces end of the store" },
  harmony: { track: "Chop E Harmony", fx: ["Resonators", "Reverb", "EQ Eight"],                   hits: [0, 2, 4, 6], pitches: [0, -4, 3, 7],    idea: "follows the progression - Em, C, G, Bm, one per two bars, resonators tuned to E minor turn speech into pitched chords" },
};

const hz = (f: number) => Math.log(f / 10) / Math.log(2200);
const P: Record<string, Record<string, Record<string, number>>> = {
  "Chop A Gate": {
    // Auto Pan with both channels in phase stops being a panner and becomes a tremolo gate.
    // Mode FIRST - it is a Pan/Tremolo switch and the tremolo controls stay disabled until it
    // flips. Tremolo is amplitude, which is what cuts a 57-second held note into rhythm.
    "Auto Pan-Tremolo": { Mode: 1, Amount: 1, Waveform: 2, "Time Mode": 1, "16th": 1, "Tremolo Shape": 0.95, "Attack Time": 0, Phase: 0 },
    "EQ Eight": { "1 Filter On A": 1, "1 Filter Type A": 1, "1 Frequency A": hz(160) },
  },
  // Scale-aware and rooted on E so the shift stays in the key rather than fighting it.
  "Chop C Formant": { "Auto Shift": { "Pitch St.": 5, "Formant Shift": 0.63, "Scale Aware": 1, Root: 4, "Dry/Wet": 1 } },
  "Chop D Crunch": { Saturator: { Drive: 0.62, Output: 0.85 }, "EQ Eight": { "1 Filter On A": 1, "1 Filter Type A": 1, "1 Frequency A": hz(150) } },
  // Resonators tuned to an E minor triad - root, minor third, fifth, octave - so a spoken
  // syllable comes out as a chord rather than a pitch.
  "Chop E Harmony": { Resonators: { "I Note": 52, "II Pitch": 3, "III Pitch": 7, "IV Pitch": 12, Decay: 62, "Dry/Wet": 0.62 }, "EQ Eight": { "1 Filter On A": 1, "1 Filter Type A": 1, "1 Frequency A": hz(130) } },
  "Chop B Stretch": { "EQ Eight": { "1 Filter On A": 1, "1 Filter Type A": 1, "1 Frequency A": hz(200) } },
};

print(
  await withLive(async (live) => {
    if (PARAMS_ONLY) {
      const missing: Record<string, string[]> = {};
      for (const [trackName, devs] of Object.entries(P)) {
        const t = await findTrack(live, trackName);
        for (const [dev, vals] of Object.entries(devs)) missing[`${trackName}/${dev}`] = await setParams(t, dev, vals);
      }
      return { params: "applied", missing };
    }

    await live.song.set("tempo", BPM);
    const laid: Record<string, unknown>[] = [];
    for (const [i, c] of man.clips.entries()) {
      const spec = TREATMENTS[c.label];
      if (!spec) continue;
      let t = null;
      for (const x of await live.song.get("tracks")) if ((await x.get("name")) === spec.track) t = x;
      if (!t) {
        t = await live.song.createAudioTrack(-1);
        await t.set("name", spec.track);
      }
      // Load the chain when the track has none, not only when we just made it - a run that dies
      // partway leaves a named track with no devices, and "already exists" then skipped it forever.
      if ((await t.get("devices")).length === 0)
        for (const d of spec.fx) await loadOnTrack(live, t, "audio_effects", [d]);
      // Idempotent: clear this track's own clips first, or a second run stacks a duplicate on top
      // of every hit - doubled audio, +6 dB and flamming. Only ever our own tracks, never his.
      if ((await t.get("name")) === spec.track) for (const c of await t.get("arrangement_clips")) await t.deleteClip(c);

      const base = i * BARS * 4;
      for (const h of spec.hits) await t.createAudioClip(c.file, base + h * 4);
      // One-shots at recorded speed - never let Live warp a chop to a guessed tempo.
      const clips = (await t.get("arrangement_clips")).slice();
      const withStart = await Promise.all(clips.map(async (c2) => ({ c2, at: (await c2.get("start_time")) as number })));
      withStart.sort((a2, b2) => a2.at - b2.at);
      for (const [j, { c2 }] of withStart.entries()) {
        if (await c2.get("warping")) await c2.set("warping", false);
        const semis = spec.pitches[j] ?? 0;
        if (semis) await c2.set("pitch_coarse", semis);
      }
      laid.push({ bars: `${i * BARS + 1}-${(i + 1) * BARS}`, track: spec.track, source: c.source, hits: spec.hits.length, idea: spec.idea });
    }
    await live.application.view.showView("Arranger");
    await live.song.set("current_song_time", 0);
    return { bpm: BPM, laid };
  }),
);

// The Stardust "Music Sounds Better With You" chord loop, rebuilt from parts.
// Not a pad: a dense 16th chord chop that only *becomes* a pad once a resonant lowpass
// closes over it and a hammered compressor smears the transients together. Two chords,
// B dorian, one note moving (A -> G#). 2 bars, ~123 bpm.
// usage: node_modules/.bin/tsx scripts/stardust-pad.ts [--scene 1] [--bpm 123] [--seed 3] [--no-kick]
//        node_modules/.bin/tsx scripts/stardust-pad.ts --params [stock|treated]   (device params only, no playback)
import { withLive, track as findTrack, print } from "../lib/live.js";
import { loadOnTrack } from "../lib/browser.js";
import { pushClip, writeMidi, seed, humanise, swing, pitch, type Note } from "../lib/midi.js";
import { getOrCreateTrack, setParams, fireScene, ensureScenes } from "../lib/song.js";
import { padsFor } from "../lib/kits.js";

const args = process.argv.slice(2);
const flag = (n: string, d: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const SCENE = Number(flag("scene", "1")) - 1;
const BPM = Number(flag("bpm", "123"));
const SEED = Number(flag("seed", "3"));
const PARAMS_ONLY = args.includes("--params");
const PARAM_SET = (PARAMS_ONLY ? args[args.indexOf("--params") + 1] : "") || "stock";
const KIT = "909 Core Kit.adg";
const CHORDS = "FH Chords";
const KICK = "FH Kick";
const BARS = 2;
seed(SEED);

// --- the vamp -------------------------------------------------------------
// Cluster voicing, no root in the chord itself - the bass owns the root (garage/disco rule).
// Bm7 as D-F#-A-B, E9 as D-F#-G#-B: four notes, one of them moves a semitone. That stasis is
// the point; a two-chord disco vamp is supposed to sit still and let the filter do the moving.
const VOICINGS = [
  { root: pitch("B3"), tones: ["D4", "F#4", "A4", "B4"].map(pitch) }, // Bm7
  { root: pitch("E3"), tones: ["D4", "F#4", "G#4", "B4"].map(pitch) }, // E9
];
// Every 16th, accented on the & and the a, ghosted on the beat where the kick lives.
// Constant 16ths are what smear into a wash when the filter closes - gaps would read as stabs.
const VEL = [74, 60, 106, 88];
const SKIP = [[5], [1, 13]]; // one hole per bar so the loop breathes

function vamp(): Note[] {
  const out: Note[] = [];
  VOICINGS.forEach((chord, bar) => {
    const t0 = bar * 4;
    out.push({ pitch: chord.root, time: t0, duration: 0.9, velocity: 70 });
    for (let s = 0; s < 16; s++) {
      if (SKIP[bar].includes(s)) continue;
      const t = t0 + s / 4;
      const accent = s % 4 === 2;
      for (const p of chord.tones) out.push({ pitch: p, time: t, duration: accent ? 0.3 : 0.16, velocity: VEL[s % 4] });
    }
  });
  return humanise(swing(out, 0.54), 6, 0.008);
}

function kickPattern(kickPad: number): Note[] {
  const out: Note[] = [];
  for (let b = 0; b < BARS * 4; b++) out.push({ pitch: kickPad, time: b, duration: 0.25, velocity: 112 });
  return out;
}

// --- device settings ------------------------------------------------------
// Live reports frequency params normalised 0..1, never in Hz. The curve is f = 10 * 2200^x
// (confirmed against EQ Eight's own defaults landing on 30/200/1000/5000 Hz), so hz() below is
// the only honest way to write a cutoff down. Everything else is a real unit or an enum index.
const hz = (f: number) => Math.log(f / 10) / Math.log(2200);

// STOCK is every device's factory value for the params TREATED touches, captured off
// live-params.ts before anything was changed. It is the default for a reason: this is the version
// Justin heard and called sick - the chain doing its thing with nothing dialled in. Treating it
// made it worse. Keep STOCK as the reference and A/B against it before believing any change.
const STOCK: Record<string, Record<string, number>> = {
  Electric: {
    "F Tine Decay": 0.5, "F Tine Vol": 0.5, "F Tone Decay": 0.5, "Damp Amount": 0.5,
    "P Amp In": 0.41999998688697815, "P Amp Out": 0.41999998688697815, "Noise Amount": 0.5,
    Volume: 0.7047892212867737,
  },
  "EQ Eight": {
    "1 Filter On A": 1, "1 Filter Type A": 2, "1 Frequency A": 0.14274713397026062,
    "2 Filter On A": 1, "2 Filter Type A": 3, "2 Frequency A": 0.3892475962638855, "2 Gain A": 0, "2 Q A": 0.37666621804237366,
  },
  Saturator: { Drive: 0.5, Type: 0, "Color On": 1, Output: 1, "Dry/Wet": 1 },
  "Auto Filter": { "Filter Type": 0, "Filter Slope": 1, Frequency: 0.8996566534042358, Resonance: 0, Drive: 0, "LFO Amount": 0 },
  "Phaser-Flanger": {
    Mode: 0, Amount: 0.75, Notches: 2, Feedback: 0, "Mod Freq": 0.3253968358039856,
    Spread: 0.3515625, Warmth: 0, "Dry/Wet": 1,
  },
  Compressor: { Threshold: 0.85, Ratio: 0.75, Attack: 0.4, Release: 0.1569925993680954, Knee: 6, "Auto Release On/Off": 0, "Dry/Wet": 1 },
  Utility: { "Stereo Width": 1, "Bass Mono": 0, "Bass Freq": 0.3802112340927124 },
};

// The dialled-in version. Textbook French house on paper - and worse in the room. Kept so the
// difference stays visible rather than lost, not because it is the better setting.
const TREATED: Record<string, Record<string, number>> = {
  Electric: {
    "F Tine Decay": 0.34, "F Tine Vol": 0.62, "F Tone Decay": 0.28, "Damp Amount": 0.62,
    "P Amp In": 0.64, "P Amp Out": 0.46, "Noise Amount": 0.34, Volume: 0.62,
  },
  "EQ Eight": {
    "1 Filter On A": 1, "1 Filter Type A": 1, "1 Frequency A": hz(190),
    "2 Filter On A": 1, "2 Filter Type A": 3, "2 Frequency A": hz(450), "2 Gain A": -2.5, "2 Q A": 0.3,
  },
  Saturator: { Drive: 0.58, Type: 0, "Color On": 1, Output: 0.92, "Dry/Wet": 1 },
  "Auto Filter": { "Filter Type": 0, "Filter Slope": 1, Frequency: hz(2400), Resonance: 0.33, Drive: 0.2, "LFO Amount": 0 },
  "Phaser-Flanger": {
    Mode: 0, Amount: 0.5, Notches: 4, Feedback: 0.3, "Mod Freq": 0.12, Spread: 0.42, Warmth: 1, "Dry/Wet": 0.34,
  },
  Compressor: { Threshold: 0.55, Ratio: 0.85, Attack: 0.25, Release: 0.34, Knee: 0, "Auto Release On/Off": 0, "Dry/Wet": 1 },
  Utility: { "Stereo Width": 1.25, "Bass Mono": 1, "Bass Freq": hz(200) },
};

const P = PARAM_SET === "treated" ? TREATED : STOCK;

const CHAIN: [root: Parameters<typeof loadOnTrack>[2], segs: string[]][] = [
  ["audio_effects", ["EQ Eight"]],
  ["audio_effects", ["Saturator"]],
  ["audio_effects", ["Auto Filter"]],
  ["audio_effects", ["Phaser-Flanger"]],
  ["audio_effects", ["Compressor"]],
  ["audio_effects", ["Utility"]],
];

const notes = vamp();
writeMidi(`stardust-${SEED}-chords.mid`, notes, BPM);

print(
  await withLive(async (live) => {
    if (PARAMS_ONLY) {
      const t = await findTrack(live, CHORDS);
      const missing: Record<string, string[]> = {};
      for (const [dev, vals] of Object.entries(P)) if (Object.keys(vals).length) missing[dev] = await setParams(t, dev, vals);
      return { params: "applied", missing };
    }

    await ensureScenes(live, SCENE + 1);
    const { pads, missing, file } = padsFor(KIT);

    const tChords = await getOrCreateTrack(live, CHORDS, async (t) => {
      await loadOnTrack(live, t, "instruments", ["Electric"]);
      for (const [root, segs] of CHAIN) await loadOnTrack(live, t, root, segs);
    });
    await pushClip(live, tChords, SCENE, notes, BARS * 4, `stardust vamp Bm7-E9`);

    if (!args.includes("--no-kick")) {
      const tKick = await getOrCreateTrack(live, KICK, (t) => loadOnTrack(live, t, "drums", [KIT]));
      await pushClip(live, tKick, SCENE, kickPattern(pads.kick), BARS * 4, "four to the floor");
    }

    const scenes = await live.song.get("scenes");
    await scenes[SCENE].set("tempo", BPM);
    await live.song.set("tempo", BPM);
    await fireScene(live, SCENE, `stardust ${BPM}`);
    return { scene: SCENE + 1, bpm: BPM, seed: SEED, notes: notes.length, kit: file, padsMissing: missing };
  }),
);

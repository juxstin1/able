// Audition four pad characters against the same progression, one per scene, so they can be
// compared by firing scenes rather than soloing tracks. Each one is built from claims in
// learn/claims.yaml - the point is to find out which of them survive contact with a real track.
// usage: node_modules/.bin/tsx scripts/pad-audition.ts [--start 2] [--seed 5]
//        node_modules/.bin/tsx scripts/pad-audition.ts --arrangement   (all four back to back on the timeline)
//        node_modules/.bin/tsx scripts/pad-audition.ts --params   (device params only, no playback)
import { withLive, track as findTrack, print } from "../lib/live.js";
import { loadOnTrack, type Root } from "../lib/browser.js";
import { pushClip, seed, rand, pitch, type Note } from "../lib/midi.js";
import { getOrCreateTrack, setParams, ensureScenes } from "../lib/song.js";
import { padsFor } from "../lib/kits.js";

const args = process.argv.slice(2);
const flag = (n: string, d: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const START = Number(flag("start", "2")) - 1; // 0-based scene index of the first pad
const BPM = 124;
const BARS = 8;
const BEATS = BARS * 4;
const PARAMS_ONLY = args.includes("--params");
const ARRANGEMENT = args.includes("--arrangement");
seed(Number(flag("seed", "5")));

// E minor: Justin's measured best key alongside B minor, so this survives a vocal later.
// Four chords with extensions on everything - the store is consistent that a pad's density comes
// from minor 9 / major 9 / minor 7 voicings rather than from the synth. Two bars each.
const PROG: { name: string; root: number; tones: number[] }[] = [
  { name: "Em9", root: pitch("E2"), tones: ["G3", "B3", "D4", "F#4"].map(pitch) },
  { name: "Cmaj9", root: pitch("C2"), tones: ["E3", "G3", "B3", "D4"].map(pitch) },
  { name: "Gmaj9", root: pitch("G2"), tones: ["B3", "D4", "F#4", "A4"].map(pitch) },
  { name: "Bm7", root: pitch("B2"), tones: ["F#3", "B3", "D4", "A4"].map(pitch) },
];

/** Sustained chords, each running slightly past its bar so the tails overlap - the gap between
 *  chords is what breaks the illusion of a pad. */
function chords(): Note[] {
  const out: Note[] = [];
  PROG.forEach((c, i) => {
    const t = i * 8;
    out.push({ pitch: c.root, time: t, duration: 8.4, velocity: 72 });
    for (const p of c.tones) out.push({ pitch: p, time: t, duration: 8.4, velocity: 84 });
  });
  return out;
}

/** The Bicep move: a slow layer that stays in key but does NOT follow the chords, wandering so it
 *  fills the spectrum and stops the four-chord loop feeling static. Deliberately not chord tones. */
const EMIN = [4, 6, 7, 9, 11, 0, 2]; // E F# G A B C D
function glass(): Note[] {
  const out: Note[] = [];
  let deg = 3;
  for (let t = 0; t < BEATS; ) {
    deg = Math.max(0, Math.min(EMIN.length * 2 - 1, deg + Math.round((rand() * 2 - 1) * 2)));
    const oct = 5 + Math.floor(deg / EMIN.length); // C5 upwards - above the chords, never in them
    const p = EMIN[deg % EMIN.length] + (oct + 2) * 12;
    const dur = 3 + rand() * 4;
    out.push({ pitch: p, time: t, duration: dur + 1.2, velocity: 58 + Math.round(rand() * 18) });
    t += dur;
  }
  return out;
}

const kick = (pad: number): Note[] =>
  Array.from({ length: BEATS }, (_, b) => ({ pitch: pad, time: b, duration: 0.25, velocity: 110 }));

// Four characters, deliberately not four versions of one thing.
const PADS: { track: string; inst: [Root, string[]]; fx: string[]; note: string }[] = [
  { track: "Pad A Classic", inst: ["instruments", ["Wavetable"]], fx: ["EQ Eight", "Chorus-Ensemble", "Auto Filter", "Reverb", "Utility"],
    note: "saw unison detuned, retrigger off, ensemble chorus, band-passed" },
  { track: "Pad B Drift", inst: ["instruments", ["Drift"]], fx: ["EQ Eight", "Auto Filter", "Reverb", "Utility"],
    note: "stereo mode + drift, filter envelope shaped against the amp envelope, Wander LFO" },
  { track: "Pad C Glass", inst: ["sounds", ["Pad", "Glass Low Strings Pad.adv"]], fx: ["EQ Eight", "Reverb", "Utility"],
    note: "in key but not on the chords - the layer that stops the loop feeling static" },
  { track: "Pad D Operator", inst: ["instruments", ["Operator"]], fx: ["EQ Eight", "Chorus-Ensemble", "Auto Filter", "Reverb", "Utility"],
    note: "saw + square + noise in parallel, the rack-and-macro approach" },
];

const hz = (f: number) => Math.log(f / 10) / Math.log(2200);
// Only the devices whose parameter names are already known. The instruments get a second pass.
const P: Record<string, Record<string, number>> = {
  "EQ Eight": { "1 Filter On A": 1, "1 Filter Type A": 1, "1 Frequency A": hz(170) },
  "Auto Filter": { "Filter Type": 0, "Filter Slope": 1, Frequency: hz(3200), Resonance: 0.22 },
  Utility: { "Stereo Width": 1.15, "Bass Mono": 1, "Bass Freq": hz(180) },
};

// Per-instrument settings, each one a claim from the store being put in front of Justin's ears.
// Wavetable's Unison MODE is not exposed by the API - only the amount - so its chorusing comes
// from Chorus-Ensemble in the chain instead. That is Olean's own stated fallback, not a fudge.
const INST_P: Record<string, Record<string, Record<string, number>>> = {
  "Pad A Classic": { Wavetable: {
    "Unison Amount": 0.32, "Osc 2 On": 1, "Osc 2 Transp": -12, "Osc 2 Gain": 0.7,
    "Amp Attack": 0.42, "Amp Sustain": 0.88, "Amp Release": 0.62, Volume: 0.5,
  } },
  "Pad B Drift": { Drift: {
    // Amp envelope long; envelope 2 shaped deliberately against it so the filter moves on its own
    // timescale rather than tracking the volume. LFO retrigger stays off.
    "Env 1 Attack": 0.45, "Env 1 Sustain": 0.9, "Env 1 Release": 0.6,
    "Env 2 Attack": 0.55, "Env 2 Decay": 0.7, "Env 2 Sustain": 0.0, "Env 2 Release": 0.6,
    "LP Freq": 0.56, "LP Res": 0.16, "HP Freq": 0.17, "LP Mod Amt 1": 0.7,
    Drift: 0.5, Spread: 0.45, Thickness: 0.35, "LFO Retrig On": 0, "LFO Mod Amt": 0.35, Volume: 0.5,
  } },
  "Pad D Operator": { Operator: {
    Algorithm: 10, "Osc-A Wave": 1, "Osc-A Level": 0.85,
    "Osc-B On": 1, "Osc-B Wave": 2, "Osc-B Level": 0.5,
    "Ae Attack": 0.45, "Ae Sustain": 1, "Ae Release": 0.6, Volume: 0.42,
  } },
};

print(
  await withLive(async (live) => {
    if (PARAMS_ONLY) {
      const missing: Record<string, string[]> = {};
      for (const p of PADS) {
        const t = await findTrack(live, p.track);
        for (const [dev, vals] of Object.entries(P)) if (p.fx.includes(dev)) missing[`${p.track}/${dev}`] = await setParams(t, dev, vals);
        for (const [dev, vals] of Object.entries(INST_P[p.track] ?? {})) missing[`${p.track}/${dev}`] = await setParams(t, dev, vals);
      }
      return { params: "applied", missing };
    }

    if (ARRANGEMENT) {
      // Arrangement runs on the song tempo - scene tempos only apply when a scene is launched.
      await live.song.set("tempo", BPM);
      const { pads: kp } = padsFor("909 Core Kit.adg");
      const chordNotes = chords();
      const glassNotes = glass();
      const laid: string[] = [];
      for (let i = 0; i < PADS.length; i++) {
        const p = PADS[i];
        const startBeat = i * BEATS; // eight bars each, back to back, so play walks A -> B -> C -> D
        const t = await getOrCreateTrack(live, p.track, async (tr) => {
          await loadOnTrack(live, tr, p.inst[0], p.inst[1]);
          for (const d of p.fx) await loadOnTrack(live, tr, "audio_effects", [d]);
        });
        const clip = await t.createMidiClip(startBeat, BEATS);
        const notes = p.track === "Pad C Glass" ? glassNotes : chordNotes;
        await clip.setNotes(notes.map((n) => ({ pitch: n.pitch, time: n.time, duration: n.duration, velocity: n.velocity, muted: false })));
        await clip.set("name", `${String.fromCharCode(65 + i)} - ${p.track.replace("Pad ", "").slice(2)}`);
        laid.push(`bars ${i * BARS + 1}-${(i + 1) * BARS}: ${p.track}`);
      }
      // One kick across the whole thing so every pad is judged in the same context.
      const tKickArr = await findTrack(live, "FH Kick");
      const total = BEATS * PADS.length;
      const kClip = await tKickArr.createMidiClip(0, total);
      await kClip.setNotes(Array.from({ length: total }, (_, b) => ({ pitch: kp.kick, time: b, duration: 0.25, velocity: 110, muted: false })));
      await kClip.set("name", "four to the floor");
      await live.application.view.showView("Arranger");
      await live.song.set("current_song_time", 0);
      return { placement: "arrangement", key: "E minor", bpm: BPM, barsEach: BARS, totalBars: BARS * PADS.length, laid };
    }

    await ensureScenes(live, START + PADS.length);
    const { pads } = padsFor("909 Core Kit.adg");
    const chordNotes = chords();
    const glassNotes = glass();
    const tKick = await findTrack(live, "FH Kick");

    const built: string[] = [];
    for (let i = 0; i < PADS.length; i++) {
      const p = PADS[i];
      const scene = START + i;
      const t = await getOrCreateTrack(live, p.track, async (tr) => {
        await loadOnTrack(live, tr, p.inst[0], p.inst[1]);
        for (const d of p.fx) await loadOnTrack(live, tr, "audio_effects", [d]);
      });
      await pushClip(live, t, scene, p.track === "Pad C Glass" ? glassNotes : chordNotes, BEATS, p.note);
      await pushClip(live, tKick, scene, kick(pads.kick), BEATS, "four to the floor");
      const scenes = await live.song.get("scenes");
      await scenes[scene].set("tempo", BPM);
      await scenes[scene].set("name", `${String.fromCharCode(65 + i)} - ${p.note.slice(0, 34)}`);
      built.push(`scene ${scene + 1}: ${p.track}`);
    }
    return { key: "E minor", bpm: BPM, bars: BARS, progression: PROG.map((c) => c.name).join(" - "), built,
             next: "tsx scripts/pad-audition.ts --params, then fire a scene" };
  }),
);

// A sub under the E minor pad arrangement. Root notes only, offbeat 8ths.
// Offbeat rather than sustained on purpose: the sidechain Audio From chooser is not exposed by the
// API, so a sustained sub would sit under a four-to-floor kick with nothing ducking it. A pattern
// that already rests where the kick lands does not need the sidechain - docs/mixing-chain.md s0.
// usage: node_modules/.bin/tsx scripts/song-bass.ts [--bars 40]
import { withLive, print } from "../lib/live.js";
import { loadOnTrack } from "../lib/browser.js";
import { getOrCreateTrack, setParams } from "../lib/song.js";
import { pitch, type Note } from "../lib/midi.js";

const args = process.argv.slice(2);
const BARS = Number(args.includes("--bars") ? args[args.indexOf("--bars") + 1] : 40);
const TRACK = "Bass Sub";
// Same cycle the pads follow: Em9 - Cmaj9 - Gmaj9 - Bm7, two bars each, roots an octave down.
const ROOTS = ["E1", "C1", "G1", "B1"].map(pitch);

function bass(): Note[] {
  const out: Note[] = [];
  for (let bar = 0; bar < BARS; bar++) {
    const root = ROOTS[Math.floor(bar / 2) % 4];
    for (let beat = 0; beat < 4; beat++) {
      // The "and" of each beat - lands in the gaps a four-to-the-floor kick leaves.
      out.push({ pitch: root, time: bar * 4 + beat + 0.5, duration: 0.42, velocity: beat === 0 ? 104 : 92 });
    }
  }
  return out;
}

const hz = (f: number) => Math.log(f / 10) / Math.log(2200);

print(
  await withLive(async (live) => {
    const notes = bass();
    const t = await getOrCreateTrack(live, TRACK, async (tr) => {
      await loadOnTrack(live, tr, "instruments", ["Operator"]);
      for (const d of ["EQ Eight", "Utility"]) await loadOnTrack(live, tr, "audio_effects", [d]);
    });
    // Clean sine sub - no pitch envelope, so it does not slide like an 808.
    await setParams(t, "Operator", {
      "Osc-A Wave": 0, "Osc-A Level": 1, "Osc-B Level": 0,
      "Ae Attack": 0, "Ae Decay": 0.8, "Ae Sustain": 0.9, "Ae Release": 0.15,
      "Pe On": 0, "Glide On": 0, Volume: 0.42,
    });
    // Everything above 200 Hz off, per the brief. Mono below 250 so the low end has one position.
    await setParams(t, "EQ Eight", { "8 Filter On A": 1, "8 Filter Type A": 6, "8 Frequency A": hz(200) });
    await setParams(t, "Utility", { "Bass Mono": 1, "Bass Freq": hz(250) });

    const clip = await t.createMidiClip(0, BARS * 4);
    await clip.setNotes(notes.map((n) => ({ pitch: n.pitch, time: n.time, duration: n.duration, velocity: n.velocity, muted: false })));
    await clip.set("name", "sub - roots, offbeat 8ths");
    await live.application.view.showView("Arranger");
    return { track: TRACK, bars: BARS, notes: notes.length, roots: "E C G B, two bars each", pattern: "offbeat 8ths, dodges the kick" };
  }),
);

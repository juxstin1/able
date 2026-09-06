// Path Five (New West) - P I E R S T A N: the drum pattern, measured off the stems, not a genre preset.
// usage: node_modules/.bin/tsx scripts/pierstan-drums.ts [--start 1] [--bars 8] [--kit "909 Core Kit.adg"] [--seed 7]
//        node_modules/.bin/tsx scripts/pierstan-drums.ts --session [--scene 1] [--no-fire]
// Writes into the Arrangement timeline by default (that is where a track lives); --session puts
// the same 4 bars in a Session scene instead.
//
// Deliberately NOT a STYLES entry: this is one reference track's drum part, not a genre. If a
// second straight-128 reference shows up and wants the same skeleton, graduate it then.
// See docs/reference-pierstan.md for the measurements this encodes.
//
// What the analysis found, and what is therefore hard-coded here:
//   - 128.00 BPM exactly, first downbeat 461 ms in.
//   - DEAD STRAIGHT. Offbeat 8th sits at 49.0% of the beat (50.0 = straight). No swing() call.
//   - Kick four-on-the-floor, every beat, in every non-breakdown block.
//   - Clap on beats 2 and 4 only. The 180-500Hz hits on 1 and 3 are kick bleed, not a second clap.
//   - Hats are closed 8ths. Every hat decays in 22-36 ms (n~94 bars each) - there are NO open
//     hats anywhere in the track. The offbeat emphasis is velocity, not an open hat.
// Not encoded: hats measured ~10 ms ahead of the kick, but onset backtracking biases fast
// transients early, so that is probably an artifact. Left straight rather than baked in wrong.
import { withLive, print } from "../lib/live.js";
import { loadOnTrack } from "../lib/browser.js";
import { pushClip, writeMidi, seed, humanise, hit, type Note } from "../lib/midi.js";
import { getOrCreateTrack, fireScene, ensureScenes } from "../lib/song.js";
import { padsFor } from "../lib/kits.js";

const args = process.argv.slice(2);
const flag = (n: string, d: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const SESSION = args.includes("--session");
const SCENE = Number(flag("scene", "1")) - 1;
const START_BAR = Number(flag("start", "1"));
const BARS = Number(flag("bars", SESSION ? "4" : "8"));
const KIT = flag("kit", "909 Core Kit.adg");
const SEED = Number(flag("seed", "7"));
const FIRE = !args.includes("--no-fire");
const BPM = 128;
const TRACK = "PF Drums";
const TAG = "pierstan-path-five-drums";

seed(SEED);
const { pads, missing, file } = padsFor(KIT);

/** The measured bar: kick on every beat, clap on 2 and 4, closed hats on all 8 eighths. */
function pathFiveDrums(bars: number): Note[] {
  const out: Note[] = [];
  for (let bar = 0; bar < bars; bar++) {
    const t0 = bar * 4;
    for (let beat = 0; beat < 4; beat++) {
      out.push(hit(pads.kick, t0 + beat, 112, 0.25));
      if (beat === 1 || beat === 3) out.push(hit(pads.clap, t0 + beat, 104, 0.25));
      out.push(hit(pads.chat, t0 + beat, 72, 0.25)); // on the beat, ducked under the kick
      out.push(hit(pads.chat, t0 + beat + 0.5, 100, 0.25)); // the offbeat, accented - still closed
    }
  }
  // Machine-tight track: velocity moves a little, timing barely at all. No swing() by design.
  return humanise(out, 5, 0.004);
}

const notes = pathFiveDrums(BARS);
const midi = writeMidi(`${TAG}.mid`, notes, BPM);

print(
  await withLive(async (live) => {
    const t = await getOrCreateTrack(live, TRACK, (tr) => loadOnTrack(live, tr, "drums", [KIT]));
    await live.song.set("tempo", BPM);

    if (SESSION) {
      await ensureScenes(live, SCENE + 1);
      await pushClip(live, t, SCENE, notes, BARS * 4, TAG);
      const scenes = await live.song.get("scenes");
      await scenes[SCENE].set("tempo", BPM);
      if (FIRE) await fireScene(live, SCENE, "path five drums");
      return { placement: "session", track: TRACK, scene: SCENE + 1, bars: BARS, bpm: BPM, kit: KIT, padsMissing: missing, notes: notes.length, midi };
    }

    // Clear only a Session clip this script wrote itself - never one we did not create.
    const slots = await t.get("clip_slots");
    let clearedSession: number | null = null;
    for (let i = 0; i < slots.length; i++) {
      if (!(await slots[i].get("has_clip"))) continue;
      const c = await slots[i].get("clip");
      if (c && (await c.get("name")) === TAG) {
        await slots[i].deleteClip();
        clearedSession = i + 1;
      }
    }

    const startBeat = (START_BAR - 1) * 4;
    const clip = await t.createMidiClip(startBeat, BARS * 4);
    await clip.setNotes(notes.map((n) => ({ pitch: n.pitch, time: n.time, duration: n.duration, velocity: n.velocity, muted: n.muted ?? false })));
    await clip.set("name", TAG);
    await live.application.view.showView("Arranger");
    await live.song.set("current_song_time", startBeat);
    return {
      placement: "arrangement", track: TRACK, startBar: START_BAR, bars: BARS, bpm: BPM,
      swing: "none (straight)", kit: KIT, kitFile: file, padsMissing: missing,
      pads: { kick: pads.kick, clap: pads.clap, chat: pads.chat },
      notes: notes.length, midi, clearedSessionSlot: clearedSession,
    };
  }),
);

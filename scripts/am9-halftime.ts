// The Am9 half-time idea (78 BPM): chords, drums, and bass into one Session scene, from the source
// MIDI in project-files/Am9 Halftime - 78/. Drums are written against GM notes and remapped onto
// the kit's real pads. Clips loop at their own length (chords 8 bars, drums and bass 4).
// Does not fire the scene.
// usage: node_modules/.bin/tsx scripts/am9-halftime.ts [--scene N] [--chords main|bright|dark]
//        [--kit "808 Core Kit.adg"] [--bass "Analog Bass.adg"]
import path from "node:path";
import { withLive, print } from "../lib/live.js";
import { loadOnTrack } from "../lib/browser.js";
import { getOrCreateTrack, ensureScenes } from "../lib/song.js";
import { padsFor } from "../lib/kits.js";
import { pushClip, readMidi, remapDrumNotes, type Note } from "../lib/midi.js";
import { ROOT } from "../lib/paths.js";

const args = process.argv.slice(2);
const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const SCENE = Number(opt("--scene", "1")) - 1;
const CHORDS = opt("--chords", "main");
const KIT = opt("--kit", "808 Core Kit.adg");
const BASS = opt("--bass", "Analog Bass.adg");
const BPM = 78;
const DIR = path.join(ROOT, "project-files", "Am9 Halftime - 78");
const CHORD_FILES: Record<string, string> = { main: "chords.mid", bright: "chords-bright.mid", dark: "chords-dark.mid" };
if (!CHORD_FILES[CHORDS]) throw new Error(`--chords must be one of ${Object.keys(CHORD_FILES).join(", ")}`);

/** Whole bars covering every note start - humanized tails past the last bar line don't add a bar. */
const bars = (notes: Note[]) => Math.floor(Math.max(...notes.map((n) => n.time)) / 4) + 1;

const { pads, missing } = padsFor(KIT);
const parts = {
  chords: readMidi(path.join(DIR, CHORD_FILES[CHORDS])).notes,
  drums: remapDrumNotes(readMidi(path.join(DIR, "drums.mid")).notes, pads),
  bass: readMidi(path.join(DIR, "bass.mid")).notes,
};

print(
  await withLive(async (live) => {
    const tChords = await getOrCreateTrack(live, "Am9 Chords", (t) => loadOnTrack(live, t, "instruments", ["Electric"]));
    const tDrums = await getOrCreateTrack(live, "Am9 Drums", (t) => loadOnTrack(live, t, "drums", [KIT]));
    const tBass = await getOrCreateTrack(live, "Am9 Bass", (t) => loadOnTrack(live, t, "sounds", ["Bass", BASS]));
    const scenes = await ensureScenes(live, SCENE + 1);
    const out: Record<string, string> = {};
    for (const [name, track, notes] of [["chords", tChords, parts.chords], ["drums", tDrums, parts.drums], ["bass", tBass, parts.bass]] as const) {
      const n = bars(notes);
      await pushClip(live, track, SCENE, notes, n * 4, `am9 ${name === "chords" ? CHORDS : name}`);
      out[name] = `${n} bars, ${notes.length} notes`;
    }
    await scenes[SCENE].set("tempo", BPM);
    await scenes[SCENE].set("name", `am9 halftime ${BPM}`);
    return { scene: SCENE + 1, bpm: BPM, kit: KIT, kitMissing: missing, bass: BASS, ...out };
  }),
);

// Import a folder of found .mid patterns onto ONE track as sequential arrangement clips - one
// track total, not one per pattern, since these are patterns to audition (not sounds), and
// track count is the thing that's been making Live laggy. Drum patterns get remapped from GM
// note numbers onto the chosen kit's actual pads; melodic patterns (--tonal) play as written.
//   node_modules/.bin/tsx scripts/import-patterns.ts "Z:\Downloads\MiDi Patterns\hats" --track "Pattern Hats" --kit "Garage Kit.adg" --start 1
//   node_modules/.bin/tsx scripts/import-patterns.ts "Z:\Downloads\MiDi Patterns\pattern-pack\03_offbeat_bass" --track "Pattern Bass" --tonal --instrument Drift:Bass:"808 Pure.adg" --start 1
import fs from "node:fs";
import path from "node:path";
import { withLive, print } from "../lib/live.js";
import { loadOnTrack, type Root } from "../lib/browser.js";
import { replaceArrangementClip } from "../lib/midi.js";
import { readMidi, remapDrumNotes } from "../lib/midi.js";
import { getOrCreateTrack } from "../lib/song.js";
import { padsFor } from "../lib/kits.js";

const args = process.argv.slice(2);
const folder = args[0];
if (!folder) throw new Error('usage: import-patterns.ts <folder> --track "name" [--kit "X.adg" | --instrument "Dev:Cat:Preset.adg"] [--tonal] [--start N] [--gap 1]');
const flag = (n: string, d?: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const TRACK = flag("track", path.basename(folder))!;
const KIT = flag("kit");
const INSTRUMENT = flag("instrument"); // "Device:Category:Preset.adg", colon-separated path segments
const INSTRUMENT_ROOT = (flag("instrument-root", "instruments") as Root); // "instruments" for devices, "sounds" for the Pad/Bass/etc browser categories
const TONAL = args.includes("--tonal");
const START_BAR = Number(flag("start", "1"));
const GAP_BARS = Number(flag("gap", "1")); // silence between patterns, in bars
// Surgical note removal for an otherwise-good found pattern, e.g. --drop "46@15.75" drops the
// open hat at beat 15.75 (matched within 0.01 beat) regardless of which file it's in.
const DROPS = args
  .filter((_, i) => args[i - 1] === "--drop")
  .map((s) => {
    const [pitch, time] = s.split("@").map(Number);
    return { pitch, time };
  });

function findMidiFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findMidiFiles(p));
    else if (entry.name.toLowerCase().endsWith(".mid")) out.push(p);
  }
  return out.sort();
}

const files = findMidiFiles(folder);
if (!files.length) throw new Error(`no .mid files found under ${folder}`);

print(
  await withLive(async (live) => {
    const pads = KIT ? padsFor(KIT).pads : undefined;
    const t = await getOrCreateTrack(live, TRACK, async (tt) => {
      if (KIT) await loadOnTrack(live, tt, "drums", [KIT]);
      else if (INSTRUMENT) await loadOnTrack(live, tt, INSTRUMENT_ROOT, INSTRUMENT.split(":"));
    });

    let bar = START_BAR;
    const placed: unknown[] = [];
    for (const file of files) {
      const { notes, bpm } = readMidi(file);
      // Drops match against the file's own GM note numbers, before remapping onto the kit's
      // actual pads (a missing role can fall back to a totally different note, e.g. ohat->ride).
      const filtered = notes.filter((n) => !DROPS.some((d) => n.pitch === d.pitch && Math.abs(n.time - d.time) < 0.01));
      const mapped = !TONAL && pads ? remapDrumNotes(filtered, pads) : filtered;
      const maxEnd = Math.max(0.25, ...mapped.map((n) => n.time + n.duration));
      const bars = Math.max(1, Math.ceil(maxEnd / 4));
      const startBeat = (bar - 1) * 4;
      const label = path.basename(file, ".mid");
      await replaceArrangementClip(t, startBeat, bars * 4, mapped, label);
      placed.push({ file: label, bar, bars, notes: mapped.length, bpm });
      bar += bars + GAP_BARS;
    }
    await live.application.view.showView("Arranger");
    return { track: TRACK, count: files.length, placed, nextFreeBar: bar };
  }),
);

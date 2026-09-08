// Audition ostinato cells - short repeated melodic figures, the "oscillation guitar" thing - on
// one fixed instrument, one track, sequential clips. Covers the taxonomy: stepwise/arpeggio rising,
// 2-note rocking, 4-note runs, motorik 8ths. All loop with no resolve, on purpose.
//   node_modules/.bin/tsx scripts/ostinato-bank.ts --instrument "Guitar & Plucked:Oscillation Guitar.adg" --instrument-root sounds --root B3 --start 1
import { withLive, print } from "../lib/live.js";
import { loadOnTrack, type Root } from "../lib/browser.js";
import { replaceArrangementClip } from "../lib/midi.js";
import { getOrCreateTrack } from "../lib/song.js";
import { ostinato } from "../lib/patterns.js";

const CELLS: { label: string; cell: number[]; stepBeats?: number }[] = [
  { label: "3-note stepwise rising (0,2,4)", cell: [0, 2, 4] },
  { label: "3-note minor arpeggio rising (0,3,7)", cell: [0, 3, 7] },
  { label: "3-note major arpeggio rising (0,4,7)", cell: [0, 4, 7] },
  { label: "2-note rocking, root-5th (0,7)", cell: [0, 7] },
  { label: "4-note stepwise run (0,2,3,5)", cell: [0, 2, 3, 5] },
  { label: "4-note minor-7 arpeggio (0,3,7,10)", cell: [0, 3, 7, 10] },
  { label: "4-note rocking, not rising (0,7,3,7)", cell: [0, 7, 3, 7] },
  { label: "motorik 8ths, no swing (0,3,7,3)", cell: [0, 3, 7, 3], stepBeats: 0.5 },
];

const args = process.argv.slice(2);
const flag = (n: string, d?: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const INSTRUMENT = flag("instrument", "Guitar & Plucked:Oscillation Guitar.adg")!;
const INSTRUMENT_ROOT = flag("instrument-root", "sounds") as Root;
const ROOT_NOTE = flag("root", "B3")!;
const START_BAR = Number(flag("start", "1"));
const BARS = 8;

print(
  await withLive(async (live) => {
    const startBeat = (START_BAR - 1) * 4;
    const t = await getOrCreateTrack(live, "Pattern Ostinato", (tt) => loadOnTrack(live, tt, INSTRUMENT_ROOT, INSTRUMENT.split(":")));
    const placed: unknown[] = [];
    for (let i = 0; i < CELLS.length; i++) {
      const c = CELLS[i]!;
      const notes = ostinato({ bars: BARS, root: ROOT_NOTE, cell: c.cell, stepBeats: c.stepBeats });
      const name = `OSTINATO ${String(i + 1).padStart(2, "0")} - ${c.label}`;
      await replaceArrangementClip(t, startBeat + i * BARS * 4, BARS * 4, notes, name);
      placed.push({ name, bar: START_BAR + i * BARS });
    }
    await live.application.view.showView("Arranger");
    return { instrument: INSTRUMENT, root: ROOT_NOTE, placed };
  }),
);

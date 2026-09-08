// Export the kept ostinato cells to out/ as standalone .mid files - verdicts.yaml records the
// judgment, but the actual pattern should exist as a file too, same as every other generated thing.
import { writeMidi } from "../lib/midi.js";
import { ostinato } from "../lib/patterns.js";

const KEEPS: { file: string; cell: number[]; stepBeats?: number }[] = [
  { file: "ostinato-01-stepwise-rising.mid", cell: [0, 2, 4] },
  { file: "ostinato-02-minor-arp-rising.mid", cell: [0, 3, 7] },
  { file: "ostinato-03-major-arp-rising.mid", cell: [0, 4, 7] },
  { file: "ostinato-04-rocking-2note.mid", cell: [0, 7] },
  { file: "ostinato-05-stepwise-run.mid", cell: [0, 2, 3, 5] },
  { file: "ostinato-06-minor7-arp.mid", cell: [0, 3, 7, 10] },
  { file: "ostinato-07-rocking-4note.mid", cell: [0, 7, 3, 7] },
  { file: "ostinato-08-motorik.mid", cell: [0, 3, 7, 3], stepBeats: 0.5 },
];

for (const k of KEEPS) {
  const notes = ostinato({ bars: 8, root: "B3", cell: k.cell, stepBeats: k.stepBeats });
  const out = writeMidi(`patterns/${k.file}`, notes, 132);
  console.log(out);
}

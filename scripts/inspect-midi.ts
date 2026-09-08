import { readMidi } from "../lib/midi.js";
const [file] = process.argv.slice(2);
const { notes, ppq, bpm } = readMidi(file);
console.log(JSON.stringify({ ppq, bpm, count: notes.length, notes }, null, 2));

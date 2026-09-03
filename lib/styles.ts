// Per-genre style table: bpm, kit, track prefix, and the pattern-generator calls that make a
// full-density loop for that genre. Shared by loop.ts (single 4-bar loop) and section.ts
// (arrangement sections at varying density) so the genre definition lives in exactly one place.
import { trapHats, kickSnare, bassline, chords, straightHats, type Pads } from "./patterns.js";
import type { Note } from "./midi.js";

export interface Style {
  bpm: number;
  kit: string;
  prefix: string;
  drums: (bars: number, pads: Pads) => Note[];
  hats: (bars: number, pads: Pads) => Note[]; // drums minus the kick/snare skeleton - for sections that build without the low end yet
  bass: (bars: number, root: string) => Note[];
  keys: (bars: number, root: string) => Note[];
  keysCalm: (bars: number, root: string) => Note[]; // same progression, pad rhythm + triad - for intro/breakdown/outro
  bassInstrument: "operator-808" | "operator-pulse";
  keysDevice: string[];
  drumsDesc: string;
  bassDesc: string;
  keysDesc: string;
}

export const STYLES: Record<string, Style> = {
  trap: {
    bpm: 140, kit: "Slow Trap Kit.adg", prefix: "",
    drums: (bars, pads) => [...kickSnare({ bars, style: "trap", pads }), ...trapHats({ bars, pads })],
    hats: (bars, pads) => trapHats({ bars, pads }),
    bass: (bars, root) => bassline({ bars, root, style: "808" }),
    keys: (bars, root) => chords({ bars, key: root.replace(/\d/, "3"), progression: [0, 5, 3, 4], minor: true, voicing: "seventh", rhythm: "pad" }),
    keysCalm: (bars, root) => chords({ bars, key: root.replace(/\d/, "3"), progression: [0, 5, 3, 4], minor: true, voicing: "triad", rhythm: "pad" }),
    bassInstrument: "operator-808", keysDevice: ["Electric"],
    drumsDesc: "kickSnare trap + trapHats(rolls .15, triplets .35, open every 4)", bassDesc: "bassline 808 (root, 5th pickup, b6/b7, octave drop)", keysDesc: "chords i-VI-iv-v seventh pad",
  },
  boombap: {
    bpm: 92, kit: "Boom Bap Kit.adg", prefix: "BB ",
    drums: (bars, pads) => [...kickSnare({ bars, style: "boombap", pads }), ...straightHats({ bars, pads, base: 8, swingAmt: 0.6 })],
    hats: (bars, pads) => straightHats({ bars, pads, base: 8, swingAmt: 0.6 }),
    bass: (bars, root) => bassline({ bars, root, style: "walking" }),
    keys: (bars, root) => chords({ bars, key: root.replace(/\d/, "3"), progression: [0, 3, 4, 3], minor: true, voicing: "seventh", rhythm: "stab" }),
    keysCalm: (bars, root) => chords({ bars, key: root.replace(/\d/, "3"), progression: [0, 3, 4, 3], minor: true, voicing: "triad", rhythm: "pad" }),
    bassInstrument: "operator-808", keysDevice: ["Electric"],
    drumsDesc: "kickSnare boombap swing .58 + straightHats 8ths swing .6", bassDesc: "bassline walking (1-3-5-7)", keysDesc: "chords i-iv-v-iv seventh stab",
  },
  ukg: {
    bpm: 132, kit: "Garage Kit.adg", prefix: "UKG ",
    drums: (bars, pads) => [...kickSnare({ bars, style: "ukg", pads }), ...straightHats({ bars, pads, base: 16, swingAmt: 0.62, accent: 104, ghost: 58 })],
    hats: (bars, pads) => straightHats({ bars, pads, base: 16, swingAmt: 0.62, accent: 104, ghost: 58 }),
    bass: (bars, root) => bassline({ bars, root: root.replace(/\d/, "1"), style: "ukg" }),
    keys: (bars, root) => chords({ bars, key: root.replace(/\d/, "3"), progression: [0, 0, 3, 4], minor: true, voicing: "seventh", rhythm: "skank" }),
    keysCalm: (bars, root) => chords({ bars, key: root.replace(/\d/, "3"), progression: [0, 0, 3, 4], minor: true, voicing: "triad", rhythm: "pad" }),
    bassInstrument: "operator-808", keysDevice: ["Electric"],
    drumsDesc: "kickSnare ukg 2-step (kick 1 + and-of-2, clap+snare 2/4, rim fill bar 4) + straightHats 16ths swing .62", bassDesc: "bassline ukg (sub, octave flick, 5th, b7 answer)", keysDesc: "chords i-i-iv-v seventh skank (offbeat 8ths)",
  },
  house: {
    bpm: 124, kit: "909 Core Kit.adg", prefix: "House ",
    drums: (bars, pads) => [...kickSnare({ bars, style: "house", pads }), ...straightHats({ bars, pads, base: 16, swingAmt: 0.54, accent: 100, ghost: 60 })],
    hats: (bars, pads) => straightHats({ bars, pads, base: 16, swingAmt: 0.54, accent: 100, ghost: 60 }),
    bass: (bars, root) => bassline({ bars, root: root.replace(/\d/, "1"), style: "pulse" }),
    keys: (bars, root) => chords({ bars, key: root.replace(/\d/, "3"), progression: [0, 0, 5, 3, 0, 0, 5, 4], minor: true, voicing: "spread", rhythm: "stab" }),
    keysCalm: (bars, root) => chords({ bars, key: root.replace(/\d/, "3"), progression: [0, 0, 5, 3, 0, 0, 5, 4], minor: true, voicing: "triad", rhythm: "pad" }),
    bassInstrument: "operator-pulse", keysDevice: ["Electric"],
    drumsDesc: "kickSnare house + straightHats 16ths swing .54", bassDesc: "bassline pulse 8ths on root", keysDesc: "chords i-i-VI-iv spread stab, 2 per bar",
  },
};

export const OP_808 = {
  "Osc-A Wave": 0, "Osc-A Level": 1, "Osc-B Level": 0, "Osc-C Level": 0, "Osc-D Level": 0,
  "Ae Attack": 0, "Ae Decay": 0.85, "Ae Sustain": 0, "Ae Release": 0.4,
  "Pe On": 1, "Pe Init": 24, "Pe Peak": 0, "Pe Decay": 0.18, "Pe Sustain": 0, "Pe Amount": 1,
  "Glide On": 1, "Glide Time": 0.3, Volume: 0.5,
};
export const OP_PULSE = { ...OP_808, "Ae Decay": 0.45, "Ae Release": 0.2, "Pe On": 0, "Glide On": 0, "Osc-A Wave": 2, Volume: 0.45 };

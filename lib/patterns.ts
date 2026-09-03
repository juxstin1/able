// Pattern generators. Each returns Notes in beats, for `bars` bars of 4/4.
import { DRUM, hit, humanise, swing, rand, pitch, type Note } from "./midi.js";
import { SCALES } from "./scales.js";

export type Pads = Record<keyof typeof DRUM, number>;

export interface HatOpts {
  bars?: number;
  base?: 8 | 16; // base subdivision
  rolls?: number; // 0..1 chance per beat of a 32nd roll
  triplets?: number; // 0..1 chance per bar of a triplet fill on beat 4
  openEvery?: number; // open hat on the "and" of every Nth beat (0 = never)
  accent?: number; // velocity of downbeats
  ghost?: number; // velocity of off-hits
  pads?: Pads;
}

/** Trap hats: 16th grid with velocity contour, occasional 32nd rolls and triplet fills, open hat stabs. */
export function trapHats(o: HatOpts = {}): Note[] {
  const { bars = 4, base = 16, rolls = 0.15, triplets = 0.35, openEvery = 4, accent = 110, ghost = 70, pads: D = DRUM } = o;
  const out: Note[] = [];
  const step = 4 / base;
  for (let bar = 0; bar < bars; bar++) {
    for (let beat = 0; beat < 4; beat++) {
      const t0 = bar * 4 + beat;
      const tripletFill = beat === 3 && rand() < triplets;
      const roll = !tripletFill && rand() < rolls;
      if (tripletFill) {
        for (let i = 0; i < 6; i++) out.push(hit(D.chat, t0 + i / 6, ghost + Math.round((i / 5) * (accent - ghost)), 1 / 6));
        continue;
      }
      if (roll) {
        for (let i = 0; i < 8; i++) out.push(hit(D.chat, t0 + i / 8, i === 0 ? accent : ghost + i * 3, 1 / 8));
        continue;
      }
      for (let i = 0; i < 4 / base * 4; i++) {
        const t = t0 + i * step;
        const v = i === 0 ? accent : i === 2 ? accent - 20 : ghost;
        out.push(hit(D.chat, t, v, step));
      }
    }
    if (openEvery) for (let beat = openEvery - 1; beat < 4; beat += openEvery) out.push(hit(D.ohat, bar * 4 + beat + 0.5, 95, 0.5));
  }
  return humanise(out, 6, 0.008);
}

export interface StraightHatOpts {
  bars?: number;
  base?: 8 | 16;
  swingAmt?: number;
  accent?: number;
  ghost?: number;
  openOnAnd?: boolean; // open hat on the "and" of 2 and 4
  pads?: Pads;
}

/** Plain hat grid with swing. Boom-bap 8ths at 0.6, house 16ths at 0.54. */
export function straightHats(o: StraightHatOpts = {}): Note[] {
  const { bars = 4, base = 8, swingAmt = 0.56, accent = 105, ghost = 72, openOnAnd = true, pads: D = DRUM } = o;
  const out: Note[] = [];
  const step = 4 / base;
  for (let bar = 0; bar < bars; bar++)
    for (let i = 0; i < base; i++) {
      const t = bar * 4 + i * step;
      const onBeat = i % (base / 4) === 0;
      const isAnd = Math.abs((t % 1) - 0.5) < 0.01;
      const beat = Math.floor(t % 4);
      if (openOnAnd && isAnd && (beat === 1 || beat === 3) && D.ohat !== D.chat) out.push(hit(D.ohat, t, accent - 10, step));
      else out.push(hit(D.chat, t, onBeat ? accent : ghost + (rand() < 0.3 ? 10 : 0), step));
    }
  return swing(humanise(out, 6, 0.008), swingAmt);
}

export interface KickSnareOpts {
  bars?: number;
  style?: "trap" | "boombap" | "house" | "ukg";
  pads?: Pads;
}

/** Kick + snare/clap skeleton. Trap = snare on 3, syncopated kicks. Boom-bap = 2 & 4 with swing. House = 4 on the floor. */
export function kickSnare(o: KickSnareOpts = {}): Note[] {
  const { bars = 4, style = "trap", pads: D = DRUM } = o;
  const out: Note[] = [];
  for (let bar = 0; bar < bars; bar++) {
    const b = bar * 4;
    if (style === "house") {
      for (let i = 0; i < 4; i++) out.push(hit(D.kick, b + i, 120));
      out.push(hit(D.clap, b + 1, 105), hit(D.clap, b + 3, 105));
      for (let i = 0; i < 4; i++) out.push(hit(D.ohat, b + i + 0.5, 90, 0.4));
    } else if (style === "ukg") {
      // 2-step: kick on 1 and the "and" of 2 (skip 3), clap/snare on 2 and 4, extra kick pickup every other bar
      out.push(hit(D.kick, b, 120), hit(D.kick, b + 1.5, 112));
      if (bar % 2 === 1) out.push(hit(D.kick, b + 3.75, 96));
      out.push(hit(D.snare, b + 1, 108), hit(D.clap, b + 1, 100), hit(D.snare, b + 3, 112), hit(D.clap, b + 3, 104));
      if (bar % 4 === 3) out.push(hit(D.rim, b + 2.75, 84), hit(D.rim, b + 3.5, 80));
    } else if (style === "boombap") {
      out.push(hit(D.kick, b, 118), hit(D.kick, b + 1.75, 100), hit(D.kick, b + 2.5, 112));
      if (bar % 2 === 1) out.push(hit(D.kick, b + 3.75, 95));
      out.push(hit(D.snare, b + 1, 110), hit(D.snare, b + 3, 112));
    } else {
      // trap: half-time feel, snare on 3, kicks push into 1 and around 2.5 / 4.5
      out.push(hit(D.kick, b, 120));
      const variants = [
        [1.5, 3.5],
        [1.75, 3.25],
        [1.5, 2.75, 3.5],
        [0.75, 1.5, 3.75],
      ];
      for (const k of variants[bar % variants.length]) out.push(hit(D.kick, b + k, 108));
      out.push(hit(D.snare, b + 2, 118));
      if (bar % 4 === 3) out.push(hit(D.snare, b + 3.75, 80));
    }
  }
  return style === "boombap" ? swing(humanise(out, 5, 0.01), 0.58) : style === "ukg" ? swing(humanise(out, 4, 0.006), 0.6) : humanise(out, 4, 0.006);
}

export interface BassOpts {
  bars?: number;
  root?: string; // "F1"
  scale?: number[]; // semitone offsets
  style?: "808" | "walking" | "pulse" | "ukg";
}
/** 808 line following the kick: long notes on the root, a slide-worthy 5th/b7 on bar 2/4, octave drop at the turnaround. */
export function bassline(o: BassOpts = {}): Note[] {
  const { bars = 4, root = "F1", scale = SCALES.minor, style = "808" } = o;
  const r = pitch(root);
  const out: Note[] = [];
  for (let bar = 0; bar < bars; bar++) {
    const b = bar * 4;
    if (style === "pulse") {
      for (let i = 0; i < 8; i++) out.push(hit(r, b + i * 0.5, i % 2 ? 90 : 110, 0.45));
      continue;
    }
    if (style === "ukg") {
      // syncopated sub with gaps: root on 1, octave-up flick on the "and" of 2, 5th on the "a" of 3, rest on 4 (every other bar answers with b7)
      out.push(hit(r, b, 112, 0.7), hit(r + 12, b + 1.5, 96, 0.25), hit(r + scale[4], b + 2.75, 104, 0.45));
      if (bar % 2 === 0) out.push(hit(r, b + 3.5, 100, 0.4));
      else out.push(hit(r + scale[6] - 12, b + 3.25, 98, 0.25), hit(r + scale[6], b + 3.5, 104, 0.4));
      continue;
    }
    if (style === "walking") {
      const degs = [0, 2, 4, 6];
      degs.forEach((d, i) => out.push(hit(r + scale[d % scale.length], b + i, 100, 0.9)));
      continue;
    }
    // 808
    out.push(hit(r, b, 115, 1.4));
    if (bar % 2 === 0) {
      out.push(hit(r, b + 1.5, 105, 1.0));
      out.push(hit(r + scale[4], b + 3.5, 100, 0.5)); // 5th pickup
    } else {
      out.push(hit(r + scale[5], b + 1.75, 104, 0.75)); // b6
      out.push(hit(r + scale[6], b + 2.5, 100, 0.5)); // b7
      out.push(hit(r - 12, b + 3.5, 110, 0.5)); // octave drop into next bar
    }
  }
  return out;
}

export interface ChordOpts {
  bars?: number;
  key?: string; // "F3"
  progression?: number[]; // scale degrees, 0-based, one per bar (or per half bar if 8 given for 4 bars)
  minor?: boolean;
  voicing?: "triad" | "seventh" | "spread";
  rhythm?: "pad" | "stab" | "pulse" | "skank";
}
/** Diatonic chords from a progression of scale degrees. */
export function chords(o: ChordOpts = {}): Note[] {
  const { bars = 4, key = "F3", progression = [0, 5, 3, 4], minor = true, voicing = "seventh", rhythm = "pad" } = o;
  const sc = minor ? SCALES.minor : SCALES.major;
  const k = pitch(key);
  const out: Note[] = [];
  const perBar = progression.length / bars;
  const len = 4 / perBar;
  progression.forEach((deg, i) => {
    const t = i * len;
    const tones = [0, 2, 4, ...(voicing === "triad" ? [] : [6])].map((d) => k + sc[(deg + d) % 7] + 12 * Math.floor((deg + d) / 7));
    if (voicing === "spread") {
      tones[1] += 12;
      tones.push(tones[0] - 12);
    }
    const hits =
      rhythm === "pad" ? [[0, len]]
      : rhythm === "stab" ? [[0, 0.5], [1.5, 0.5], [3, 0.75]]
      : rhythm === "skank" ? [[0.5, 0.3], [1.5, 0.3], [2.5, 0.3], [3.5, 0.3]] // offbeat 8ths, short
      : [0, 1, 2, 3].map((x) => [x, 0.5]);
    for (const [off, dur] of hits) if (off < len) for (const p of tones) out.push(hit(p, t + off, rhythm === "pad" ? 85 : 100, Math.min(dur, len - off)));
  });
  return humanise(out, 5, 0.01);
}

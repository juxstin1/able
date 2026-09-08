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

export interface FillOpts {
  bars?: number; // total bars - the fill occupies the last `fillBeats` of the last bar, groove fills the rest
  fillBeats?: number; // 1 = fires on the last beat only; 2 = starts a beat earlier, twice as dense
  style?: "roll32" | "triplet" | "accelerando" | "stutter-gate";
  pads?: Pads;
  swingAmt?: number;
}

// Ramp velocity across n hits without ever leaving MIDI range - i/(n-1) in [0,1] scaled into [lo,hi].
const ramp = (i: number, n: number, lo: number, hi: number) => Math.round(lo + (n > 1 ? (i / (n - 1)) * (hi - lo) : 0));

// Full felt groove (kick + snare/clap + hats together), not just the one element being tested -
// a hat fill judged against hats alone has no pulse to swing against, same for a drum fill without
// hats on top. Both fill functions lock this as their context and only vary the fill itself.
function groove(bars: number, swingAmt: number, D: Pads): Note[] {
  return [...kickSnare({ bars, style: "ukg", pads: D }), ...straightHats({ bars, base: 16, swingAmt, pads: D })];
}

/** Hat fill: a full locked groove for context, the last `fillBeats` beats of the hats replaced by the named fill technique. */
export function hatFill(o: FillOpts = {}): Note[] {
  const { bars = 2, fillBeats = 1, style = "roll32", pads: D = DRUM, swingAmt = 0.62 } = o;
  const lastBar = (bars - 1) * 4;
  const preFillEnd = 4 - fillBeats;
  const context = groove(bars - 1, swingAmt, D);
  const lastBarGroove = groove(1, swingAmt, D).map((n) => ({ ...n, time: n.time + lastBar }));
  const preFill = lastBarGroove.filter((n) => n.time < lastBar + preFillEnd || n.pitch !== D.chat);
  const t0 = lastBar + preFillEnd;
  const fill: Note[] = [];
  if (style === "roll32") {
    const n = Math.round(8 * fillBeats);
    for (let i = 0; i < n; i++) fill.push(hit(D.chat, t0 + i / 8, ramp(i, n, 60, 118), 1 / 8));
  } else if (style === "triplet") {
    const n = Math.round(6 * fillBeats);
    for (let i = 0; i < n; i++) fill.push(hit(D.chat, t0 + i / 6, ramp(i, n, 60, 118), 1 / 6));
  } else if (style === "accelerando") {
    // subdivision doubles partway through the beat: 8ths -> 16ths -> 32nds, repeated once per fill beat
    const starts = [0, 0.25, 0.5, 0.625, 0.75, 0.8125, 0.875, 0.9375];
    const durs = [0.25, 0.25, 0.125, 0.125, 0.0625, 0.0625, 0.0625, 0.0625];
    for (let b = 0; b < fillBeats; b++) starts.forEach((s, i) => fill.push(hit(D.chat, t0 + b + s, ramp(i, starts.length, 60, 118), durs[i])));
  } else {
    // stutter-gate: paired hits with rests between, like a gate chopping a held note - repeated once per fill beat
    for (let b = 0; b < fillBeats; b++)
      [0, 0.25, 0.5, 0.75].forEach((s, i) => {
        fill.push(hit(D.chat, t0 + b + s, ramp(i, 4, 65, 105), 0.06));
        fill.push(hit(D.chat, t0 + b + s + 0.0625, ramp(i, 4, 55, 95), 0.06));
      });
  }
  fill.push(hit(D.ohat, t0 + fillBeats, 100, 0.4)); // land on an open hat
  // Rolls read as tight in the real world - humanise the groove normally but keep the fill itself
  // close to the grid (a few ms, not the 8ms/6vel jitter that would blur 32nds spaced 15-30ms apart).
  return [...humanise([...context, ...preFill], 6, 0.008), ...humanise(fill, 2, 0.002)];
}

export interface DrumFillOpts {
  bars?: number;
  fillBeats?: number; // 1 = fires on the last beat only; 2 = starts a beat earlier, twice as dense
  style?: "snare-buildup" | "perc-cascade" | "kick-snare-stutter" | "snare-roll-sim";
  pads?: Pads;
  swingAmt?: number;
}

/** Full-kit fill: a full locked groove for context, the last `fillBeats` beats entirely replaced by the named fill technique. */
export function drumFill(o: DrumFillOpts = {}): Note[] {
  const { bars = 2, fillBeats = 1, style = "snare-buildup", pads: D = DRUM, swingAmt = 0.62 } = o;
  const lastBar = (bars - 1) * 4;
  const preFillEnd = 4 - fillBeats;
  const context = groove(bars - 1, swingAmt, D);
  const preFill = groove(1, swingAmt, D)
    .filter((n) => n.time < preFillEnd)
    .map((n) => ({ ...n, time: n.time + lastBar }));
  const t0 = lastBar + preFillEnd;
  const fill: Note[] = [];
  if (style === "snare-buildup") {
    const n = Math.round(8 * fillBeats);
    for (let i = 0; i < n; i++) fill.push(hit(D.snare, t0 + i / 8, ramp(i, n, 65, 122), 1 / 8));
  } else if (style === "perc-cascade") {
    // a Drum Rack's pads aren't chromatically pitched (adjacent notes are different samples, not
    // pitch shifts), so a "descending" cascade has to move across distinct pads, bright to low.
    // Ends on tom, not kick - a kick landing on the last 16th before the downbeat collides with
    // the next bar's kick, which reads as mud rather than a resolve.
    for (let b = 0; b < fillBeats; b++) [D.perc, D.tom, D.tom].forEach((n, i) => fill.push(hit(n, t0 + b + i * (1 / 3), 100 - i * 8, 0.25)));
  } else if (style === "kick-snare-stutter") {
    for (let b = 0; b < fillBeats; b++)
      [0, 0.25, 0.5, 0.75].forEach((s) => {
        fill.push(hit(D.kick, t0 + b + s, 105, 0.2));
        fill.push(hit(D.snare, t0 + b + s + 0.125, 95, 0.15));
      });
  } else {
    // snare-roll-sim: rapid 32nds ramping in velocity, emulating a real snare roll
    const n = Math.round(16 * fillBeats);
    for (let i = 0; i < n; i++) fill.push(hit(D.snare, t0 + i / 16, ramp(i, n, 50, 120), 1 / 16));
  }
  // Rolls read as tight in the real world - keep the fill close to the grid, humanise the groove normally.
  return [...humanise([...context, ...preFill], 5, 0.008), ...humanise(fill, 2, 0.002)];
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
  style?: "808" | "walking" | "pulse" | "ukg" | "rolling" | "fullclip";
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
    if (style === "fullclip") {
      // one sustained note per bar, held almost the full bar and tied into the next via a
      // slight duration overlap (glide trigger) - a held sub wall instead of discrete hits.
      // Pitch only moves at bar boundaries, on a 4-bar cycle.
      const cycle = [0, 0, scale[4], scale[6] - 12];
      out.push(hit(r + cycle[bar % cycle.length], b, 105, 4.05));
      continue;
    }
    if (style === "rolling") {
      // long held notes, 2-3 per bar, each overlapping the next note's onset slightly so
      // the Operator's portamento (OP_808 Glide On) slides between them instead of
      // retriggering cleanly - the classic rolling speed-garage sub. 2-bar phrase.
      const A: [number, number, number][] = [
        [0, 0, 2.6],
        [scale[4], 2.5, 1.6],
      ];
      const B: [number, number, number][] = [
        [0, 0, 1.6],
        [scale[6] - 12, 1.5, 1.1],
        [scale[4], 2.5, 1.6],
      ];
      for (const [deg, start, dur] of bar % 2 === 0 ? A : B) out.push(hit(r + deg, b + start, 105, dur));
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

export interface OstinatoOpts {
  bars?: number; // total bars - the cell repeats to fill the length, never resolving
  root?: string; // "B3"
  cell?: number[]; // semitone offsets from root, one note per step
  stepBeats?: number; // duration of each step - 1 = quarters, 0.5 = 8ths
}

/** A short melodic cell repeated unchanged - an ostinato. No development, no resolve, just loop. */
export function ostinato(o: OstinatoOpts = {}): Note[] {
  const { bars = 8, root = "B3", cell = [0, 3, 7], stepBeats = 1 } = o;
  const r = pitch(root);
  const out: Note[] = [];
  const cellBeats = cell.length * stepBeats;
  const totalBeats = bars * 4;
  for (let t = 0; t < totalBeats; t += cellBeats)
    cell.forEach((iv, i) => {
      const time = t + i * stepBeats;
      if (time < totalBeats) out.push(hit(r + iv, time, 95, stepBeats * 0.92));
    });
  return humanise(out, 4, 0.006);
}

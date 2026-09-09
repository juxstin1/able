// Chords BEFORE anything else - the progression decides the track's pitch set, so it gets chosen
// first rather than inherited from whatever line happened to get written.
// usage: node_modules/.bin/tsx scripts/chords-first.ts [--root E] [--each 4] [--start 1]
//        [--rhythm trigger|pad] [--track Chords]
// Voicing is the garage one from learn/claims.yaml: seventh and ninth dropped an octave so the notes
// cluster inside one octave, third and fifth left on top. The semitone that falls between the ninth
// and the third is the crunch - and it is also what stops the set being a pentatonic.
import { withLive, print } from "../lib/live.js";
import { loadOnTrack } from "../lib/browser.js";
import { getOrCreateTrack } from "../lib/song.js";
import { writeMidi, pitch, humanise, type Note } from "../lib/midi.js";

const args = process.argv.slice(2);
const flag = (n: string, d: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const R = flag("root", "E");
const EACH = Number(flag("each", "4"));
const START = Number(flag("start", "1"));
const TRACK = flag("track", "Chords");
const RHYTHM = flag("rhythm", "trigger");

// Semitone sets from the chord root.
const Q: Record<string, number[]> = {
  m7: [0, 3, 7, 10], m9: [0, 3, 7, 10, 14], m11: [0, 3, 7, 10, 14, 17],
  maj7: [0, 4, 7, 11], maj9: [0, 4, 7, 11, 14],
  dom7: [0, 4, 7, 10], dom9: [0, 4, 7, 10, 14], m7b5: [0, 3, 6, 10],
};
type Chord = { deg: number; q: string; label: string };
const P: { name: string; note: string; chords: Chord[] }[] = [
  { name: "i9 - VI9 - iv11 - v7", note: "widest colour; C and F# both in, so the pentatonic is dead on arrival",
    chords: [{ deg: 0, q: "m9", label: "Em9" }, { deg: 8, q: "maj9", label: "Cmaj9" }, { deg: 5, q: "m11", label: "Am11" }, { deg: 2, q: "m7", label: "F#m7" }] },
  { name: "1-5-6 (Masters At Work)", note: "the garage chord ancestor - sevenths on everything, ninths on first and last",
    chords: [{ deg: 0, q: "m9", label: "Em9" }, { deg: 7, q: "m7", label: "Bm7" }, { deg: 8, q: "maj7", label: "Cmaj7" }, { deg: 8, q: "maj9", label: "Cmaj9" }] },
  { name: "1-2-5 majV (Sammy Virji)", note: "Find My Way shape - major five borrowed from harmonic minor",
    chords: [{ deg: 0, q: "m9", label: "Em9" }, { deg: 2, q: "m7b5", label: "F#m7b5" }, { deg: 7, q: "dom9", label: "B9" }, { deg: 0, q: "m9", label: "Em9" }] },
  { name: "i - VII - VI - V", note: "descending, resolves hardest onto the major five",
    chords: [{ deg: 0, q: "m9", label: "Em9" }, { deg: 10, q: "dom9", label: "D9" }, { deg: 8, q: "maj9", label: "Cmaj9" }, { deg: 7, q: "dom7", label: "B7" }] },
];

// Garage cluster: 7th and 9th (and 11th) pulled down an octave so everything bunches together.
const voice = (base: number, deg: number, q: string) =>
  Q[q].map((iv) => base + deg + (iv >= 10 ? iv - 12 : iv)).sort((a, b) => a - b);

function rhythm(tones: number[], bar: number): Note[] {
  const out: Note[] = [];
  if (RHYTHM === "pad") {
    // Held, to judge pitches alone - shortened so a gap of anticipation opens before the next chord.
    for (const p of tones) out.push({ pitch: p, time: bar * 4, duration: 3.6, velocity: 88 });
    return out;
  }
  // Bicep trigger-sequencer: two 16ths on, one off, whole chord each hit, swung hard.
  for (let s = 0; s < 16; s++) {
    if (s % 3 === 2) continue;
    const swing = s % 2 ? 0.055 : 0;
    for (const p of tones) out.push({ pitch: p, time: bar * 4 + s * 0.25 + swing, duration: 0.22, velocity: s % 3 === 0 ? 100 : 84 });
  }
  return out;
}

print(
  await withLive(async (live) => {
    const bpm = (await live.song.get("tempo")) as number;
    const base = pitch(`${R}3`);
    const t = await getOrCreateTrack(live, TRACK, (tr) => loadOnTrack(live, tr, "instruments", ["Operator"]));
    if ((await t.get("arrangement_clips")).length) throw new Error(`"${TRACK}" already has clips; delete them or pass --track`);

    const laid: Record<string, unknown>[] = [];
    for (const [i, prog] of P.entries()) {
      let notes: Note[] = [];
      const pcs = new Set<number>();
      prog.chords.slice(0, EACH).forEach((c, bar) => {
        const tones = voice(base, c.deg, c.q);
        tones.forEach((p) => pcs.add(((p % 12) + 12) % 12));
        notes = notes.concat(rhythm(tones, bar));
      });
      notes = humanise(notes, 5, 0.008);
      writeMidi(`chords-first-${i + 1}.mid`, notes, bpm);
      const bar = START + i * EACH;
      const clip = await t.createMidiClip((bar - 1) * 4, EACH * 4);
      await clip.setNotes(notes.map((n) => ({ pitch: n.pitch, time: n.time, duration: n.duration, velocity: n.velocity, muted: false })));
      await clip.set("name", `${i + 1}. ${prog.chords.map((c) => c.label).join(" ")}`);
      // A pitch set with no semitone anywhere IS a pentatonic - that is what sounded chinese.
      const sorted = [...pcs].sort((a, b) => a - b);
      const semitone = sorted.some((p, j) => sorted[(j + 1) % sorted.length] - p === 1 || (j === sorted.length - 1 && p + 1 - 12 === sorted[0]));
      laid.push({ n: i + 1, bars: `${bar}-${bar + EACH - 1}`, prog: prog.name, chords: prog.chords.map((c) => c.label).join(" - "),
                  note: prog.note, pitchClasses: sorted.length, hasSemitone: semitone, notes: notes.length });
    }
    await live.application.view.showView("Arranger");
    await live.song.set("current_song_time", (START - 1) * 4);
    return { key: `${R} minor`, bpm, track: TRACK, sound: "Operator (plain - pitches first)", rhythm: RHYTHM, progressions: laid };
  }),
);

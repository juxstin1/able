// Audition lead characters back to back in the Arrangement, one track and instrument each so they
// never overlap in time. banks.yaml sets the lead bar at "distinct" - adequate gets binned - so
// these are deliberately four different ideas, not four settings of one idea.
// usage: node_modules/.bin/tsx scripts/lead-audition.ts [--root E] [--each 4] [--start 1]
// Registers dodge the existing ostinato at E4/16ths: stabs sit below it, hooks above it.
import { withLive, track as findTrack, print } from "../lib/live.js";
import { loadOnTrack, type Root } from "../lib/browser.js";
import { getOrCreateTrack } from "../lib/song.js";
import { chords, ostinato } from "../lib/patterns.js";
import { writeMidi, type Note } from "../lib/midi.js";

const args = process.argv.slice(2);
const flag = (n: string, d: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const R = flag("root", "E");
const EACH = Number(flag("each", "4"));
const START = Number(flag("start", "1"));

const LEADS: { name: string; how: string; notes: Note[]; load: [Root, string[]] }[] = [
  { name: "Lead 1 Organ Skank", how: "offbeat 8th sevenths, the garage staple - rhythmically opposite the ostinato",
    notes: chords({ bars: EACH, key: `${R}3`, progression: [0, 0, 3, 4], voicing: "seventh", rhythm: "skank" }),
    load: ["instruments", ["Electric"]] },
  { name: "Lead 2 Spread Stabs", how: "wide spread voicing, punchy stabs on 1 / and-of-2 / 4 - Bicep-ish weight",
    notes: chords({ bars: EACH, key: `${R}3`, progression: [0, 5, 3, 4], voicing: "spread", rhythm: "stab" }),
    load: ["instruments", ["Analog"]] },
  { name: "Lead 3 High Hook", how: "sparse quarter-note hook an octave above the ostinato - space, not density",
    notes: ostinato({ bars: EACH, root: `${R}5`, cell: [0, 7, 3], stepBeats: 1 }),
    load: ["instruments", ["Wavetable"]] },
  { name: "Lead 4 Drive", how: "running 8th line low against the 16ths - the aggressive option",
    notes: ostinato({ bars: EACH, root: `${R}3`, cell: [0, 3, 5, 7, 5, 3], stepBeats: 0.5 }),
    load: ["instruments", ["Operator"]] },
];

print(
  await withLive(async (live) => {
    const bpm = (await live.song.get("tempo")) as number;
    const laid: Record<string, unknown>[] = [];
    for (const [i, L] of LEADS.entries()) {
      const bar = START + i * EACH;
      writeMidi(`${L.name.toLowerCase().replace(/\W+/g, "-")}.mid`, L.notes, bpm);
      const t = await getOrCreateTrack(live, L.name, (tr) => loadOnTrack(live, tr, L.load[0], L.load[1]));
      if ((await t.get("arrangement_clips")).length) { laid.push({ name: L.name, skipped: "already has clips" }); continue; }
      const clip = await t.createMidiClip((bar - 1) * 4, EACH * 4);
      await clip.setNotes(L.notes.map((n) => ({ pitch: n.pitch, time: n.time, duration: n.duration, velocity: n.velocity, muted: n.muted ?? false })));
      await clip.set("name", `${i + 1}. ${L.name.replace(/^Lead \d /, "")}`);
      laid.push({ n: i + 1, name: L.name, bars: `${bar}-${bar + EACH - 1}`, notes: L.notes.length, how: L.how });
    }
    // Stable backing while judging: the 16-bar rolling bass on, the rotating audition off.
    const flip: Record<string, string> = {};
    for (const [name, mute] of [["UKG Bass", false], ["Bass Patterns", true]] as [string, boolean][])
      try { const t = await findTrack(live, name); await t.set("mute", mute); flip[name] = mute ? "muted" : "unmuted"; } catch { /* absent */ }
    await live.application.view.showView("Arranger");
    await live.song.set("current_song_time", (START - 1) * 4);
    return { key: `${R} minor`, bpm, backing: flip, leads: laid };
  }),
);

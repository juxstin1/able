// Bass + ostinato in E minor over the bounced UKG drums, straight into Arrangement.
// usage: node_modules/.bin/tsx scripts/ukg-parts.ts [--root E] [--bars 16] [--start 1]
// Both parts are top picks from the banks: bassline "rolling" (his stated direction) and the
// minor-7 ostinato cell. E minor because it is his best-fitting vocal key, for chops later.
import { withLive, print } from "../lib/live.js";
import { loadOnTrack, type Root } from "../lib/browser.js";
import { getOrCreateTrack, setParams } from "../lib/song.js";
import { bassline, ostinato } from "../lib/patterns.js";
import { writeMidi } from "../lib/midi.js";
import { OP_808 } from "../lib/styles.js";

const args = process.argv.slice(2);
const flag = (n: string, d: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const ROOT = flag("root", "E");
const BARS = Number(flag("bars", "16"));
const START = Number(flag("start", "1"));
const startBeat = (START - 1) * 4;

const parts = [
  { name: "UKG Bass", notes: bassline({ bars: BARS, root: `${ROOT}1`, style: "rolling" }),
    load: ["instruments", ["Operator"]] as [Root, string[]], params: OP_808 },
  { name: "UKG Ostinato", notes: ostinato({ bars: BARS, root: `${ROOT}4`, cell: [0, 3, 7, 10], stepBeats: 0.25 }),
    load: ["sounds", ["Guitar & Plucked", "Oscillation Guitar.adg"]] as [Root, string[]], params: undefined },
];

print(
  await withLive(async (live) => {
    const bpm = (await live.song.get("tempo")) as number;
    const out: Record<string, unknown>[] = [];
    for (const p of parts) {
      writeMidi(`${p.name.toLowerCase().replace(/\W+/g, "-")}.mid`, p.notes, bpm);
      const t = await getOrCreateTrack(live, p.name, (tr) => loadOnTrack(live, tr, p.load[0], p.load[1]));
      const clash = (await t.get("arrangement_clips")).length;
      if (clash) { out.push({ track: p.name, skipped: `already has ${clash} Arrangement clip(s)` }); continue; }
      const clip = await t.createMidiClip(startBeat, BARS * 4);
      await clip.setNotes(p.notes.map((n) => ({ pitch: n.pitch, time: n.time, duration: n.duration, velocity: n.velocity, muted: n.muted ?? false })));
      await clip.set("name", `${p.name.toLowerCase().replace(/\W+/g, "-")}-${ROOT}min`);
      if (p.params) { const miss = await setParams(t, "Operator", p.params); if (miss.length) out.push({ track: p.name, unset: miss }); }
      out.push({ track: p.name, notes: p.notes.length, bars: BARS, startBar: START });
    }
    await live.application.view.showView("Arranger");
    return { key: `${ROOT} minor`, bpm, parts: out };
  }),
);

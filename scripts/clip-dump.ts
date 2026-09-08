// Read back what is actually in a track's clips - Arrangement and Session - as a bar/beat grid.
// Read-only: use it to look at a part before commenting on it, rather than assuming.
// usage: node_modules/.bin/tsx scripts/clip-dump.ts "<track name|i>" [--kit "909 Core Kit.adg"] [--grid]
import { withLive, track as findTrack, print } from "../lib/live.js";
import { padsFor } from "../lib/kits.js";
import { NOTE_NAMES } from "../lib/midi.js";

const args = process.argv.slice(2);
const flag = (n: string, d?: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const trackRef = args[0];
if (!trackRef) throw new Error('usage: clip-dump.ts "<track name|i>" [--kit "X.adg"] [--grid]');
const KIT = flag("kit");
const GRID = args.includes("--grid");

const roleOf = (pads: Record<string, number>, p: number) => Object.entries(pads).find(([, v]) => v === p)?.[0];
const nameOf = (p: number) => `${NOTE_NAMES[p % 12]}${Math.floor(p / 12) - 2}`;

print(
  await withLive(async (live) => {
    const t = await findTrack(live, trackRef);
    const pads = KIT ? padsFor(KIT).pads : ({} as Record<string, number>);
    const out: Record<string, unknown>[] = [];

    const dump = async (clip: { get: (k: never) => Promise<unknown> }, where: string) => {
      const name = (await clip.get("name" as never)) as string;
      const start = (await clip.get("start_time" as never)) as number;
      const len = (await clip.get("length" as never)) as number;
      // Audio clips have no notes and asking throws, so branch before reading them.
      const isMidi = (await clip.get("is_midi_clip" as never)) as boolean;
      if (!isMidi) {
        out.push({ where, name, startBeat: start, lengthBeats: len, bars: len / 4, kind: "audio",
                   file: (await clip.get("file_path" as never)) as string,
                   warping: await clip.get("warping" as never) });
        return;
      }
      const notes = (await clip.get("notes" as never)) as { pitch: number; time: number; duration: number; velocity: number }[];
      const rows = notes
        .slice()
        .sort((a, b) => a.time - b.time || a.pitch - b.pitch)
        .map((n) => ({
          bar: Math.floor(n.time / 4) + 1,
          beat: Number((n.time % 4).toFixed(3)),
          step16: Number((n.time * 4).toFixed(2)), // 16th index, fractional = off the grid
          pitch: roleOf(pads, n.pitch) ?? nameOf(n.pitch),
          vel: n.velocity,
          dur: Number(n.duration.toFixed(3)),
        }));
      const entry: Record<string, unknown> = { where, name, startBeat: start, lengthBeats: len, bars: len / 4, notes: rows.length };
      if (GRID) {
        // One line per sound, 16ths across a bar, so the pattern is visible instead of listed.
        const byPitch = new Map<string, string[]>();
        const steps = Math.round(len * 4);
        for (const r of rows) {
          const key = String(r.pitch);
          if (!byPitch.has(key)) byPitch.set(key, Array(steps).fill("."));
          const idx = Math.round(r.step16);
          const off = Math.abs(r.step16 - idx) > 0.02;
          if (idx < steps) byPitch.get(key)![idx] = off ? "~" : r.vel > 95 ? "X" : r.vel > 60 ? "x" : "o";
        }
        entry.grid = Object.fromEntries([...byPitch].map(([k, v]) => [k, v.join("").replace(/(.{16})/g, "$1|")]));
      } else entry.rows = rows;
      out.push(entry);
    };

    for (const c of await t.get("arrangement_clips")) await dump(c as never, "arrangement");
    for (const [i, slot] of (await t.get("clip_slots")).entries())
      if (await slot.get("has_clip")) await dump((await slot.get("clip")) as never, `session scene ${i + 1}`);

    return { track: await t.get("name"), kit: KIT ?? "(none - showing note names)", clips: out,
             legend: GRID ? "X loud, x mid, o ghost, ~ off-grid, . rest; | = bar" : undefined };
  }),
);

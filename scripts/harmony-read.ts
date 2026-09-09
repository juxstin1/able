// What notes are ACTUALLY in the set, per bar, across every MIDI track - so the chords that fit are
// derived from the track instead of guessed from genre. Read-only, starts no playback.
// usage: node_modules/.bin/tsx scripts/harmony-read.ts [--skip "UKG Chords"] [--bars 16]
import { withLive, print } from "../lib/live.js";

const args = process.argv.slice(2);
const flag = (n: string, d: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const SKIP = flag("skip", "UKG Chords").split(",").map((s) => s.trim()).filter(Boolean);
const BARS = Number(flag("bars", "16"));
const PC = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

print(
  await withLive(async (live) => {
    // weight[bar][pitchClass] = total sounding beats, so held notes count more than passing 16ths
    const weight: number[][] = Array.from({ length: BARS }, () => new Array(12).fill(0));
    const perTrack: Record<string, string[]> = {};
    const lowest: Record<number, number> = {};

    for (const t of await live.song.get("tracks")) {
      const name = (await t.get("name")) as string;
      if (SKIP.includes(name) || (await t.get("mute"))) continue;
      const seen = new Set<number>();
      for (const c of await t.get("arrangement_clips")) {
        if (!((await c.get("is_midi_clip" as never)) as boolean)) continue;
        const start = (await c.get("start_time" as never)) as number;
        const notes = (await c.get("notes" as never)) as { pitch: number; time: number; duration: number }[];
        for (const n of notes) {
          const bar = Math.floor((start + n.time) / 4);
          if (bar < 0 || bar >= BARS) continue;
          weight[bar][n.pitch % 12] += n.duration;
          seen.add(n.pitch % 12);
          if (lowest[bar] === undefined || n.pitch < lowest[bar]) lowest[bar] = n.pitch;
        }
      }
      if (seen.size) perTrack[name] = [...seen].sort((a, b) => a - b).map((p) => PC[p]);
    }

    const rows = weight.map((w, bar) => {
      const tot = w.reduce((a, b) => a + b, 0);
      const present = w.map((v, i) => ({ pc: PC[i], share: tot ? v / tot : 0 }))
        .filter((x) => x.share > 0.01).sort((a, b) => b.share - a.share);
      return { bar: bar + 1,
               bass: lowest[bar] !== undefined ? `${PC[lowest[bar] % 12]}${Math.floor(lowest[bar] / 12) - 2}` : "-",
               notes: present.map((x) => `${x.pc} ${(x.share * 100).toFixed(0)}%`).join("  ") };
    });
    const overall = new Array(12).fill(0);
    for (const w of weight) w.forEach((v, i) => (overall[i] += v));
    const tot = overall.reduce((a, b) => a + b, 0);
    return {
      perTrack,
      overall: overall.map((v, i) => ({ pc: PC[i], share: tot ? +(v / tot * 100).toFixed(1) : 0 }))
        .filter((x) => x.share > 0.5).sort((a, b) => b.share - a.share),
      perBar: rows,
    };
  }),
);

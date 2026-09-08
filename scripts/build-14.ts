// A steady groove from bar 14: a full run of snare with the bass drum sitting between them, and
// hats cycling closed-closed-open. Not a build - nothing accelerates and nothing drops.
// usage: node_modules/.bin/tsx scripts/build-14.ts [--start 14] [--bars 8]
import { withLive, track as findTrack, print } from "../lib/live.js";
import { loadOnTrack } from "../lib/browser.js";
import { getOrCreateTrack } from "../lib/song.js";
import { padsFor } from "../lib/kits.js";
import type { Note } from "../lib/midi.js";

const args = process.argv.slice(2);
const flag = (n: string, d: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const START_BAR = Number(flag("start", "14"));
const BARS = Number(flag("bars", "8"));
const TRACK = "Groove 14";
const HATS = "Hats";

/** Snare runs the whole way as steady 8ths, the kick sits in the gaps between snare groups, and
 *  the hats cycle closed-closed-open. No build, no roll, no acceleration - it just sits there. */
function groove(kick: number, snare: number): Note[] {
  const out: Note[] = [];
  for (let b = 0; b < BARS; b++) {
    const t = b * 4;
    // full run of snare, every 8th
    for (let e = 0; e < 8; e++)
      out.push({ pitch: snare, time: t + e * 0.5, duration: 0.2, velocity: e % 2 === 0 ? 104 : 78 });
    // bass drum in between - on 1 and 3, under the snare run
    out.push({ pitch: kick, time: t, duration: 0.3, velocity: 122 });
    out.push({ pitch: kick, time: t + 2, duration: 0.3, velocity: 118 });
  }
  return out;
}

/** closed, closed, open - a three-step cycle running over 8ths, so it walks against the 4/4. */
function hats(chat: number, ohat: number): Note[] {
  const out: Note[] = [];
  for (let e = 0; e < BARS * 8; e++) {
    const open = e % 3 === 2;
    out.push({ pitch: open ? ohat : chat, time: e * 0.5, duration: open ? 0.45 : 0.18, velocity: open ? 100 : 82 });
  }
  return out;
}

print(
  await withLive(async (live) => {
    const { pads } = padsFor("909 Core Kit.adg");
    const startBeat = (START_BAR - 1) * 4;

    // The bass synth was the wrong read - drop it out of this range so it does not fight the build.
    for (const name of ["Tough Bass", "Long Snare"]) {
      try {
        const old = await findTrack(live, name);
        for (const c of await old.get("arrangement_clips")) {
          const at = (await c.get("start_time")) as number;
          if (at >= startBeat && at < startBeat + BARS * 4) await old.deleteClip(c);
        }
      } catch { /* never made, fine */ }
    }

    const t = await getOrCreateTrack(live, TRACK, (tr) => loadOnTrack(live, tr, "drums", ["909 Core Kit.adg"]));
    const th = await getOrCreateTrack(live, HATS, (tr) => loadOnTrack(live, tr, "drums", ["909 Core Kit.adg"]));
    for (const [tr, notes, name] of [[t, groove(pads.kick, pads.snare), "snare run + kick between"], [th, hats(pads.chat, pads.ohat), "hats c c o"]] as const) {
      for (const c of await tr.get("arrangement_clips")) {
        const at = (await c.get("start_time")) as number;
        if (at >= startBeat && at < startBeat + BARS * 4) await tr.deleteClip(c);
      }
      const clip = await tr.createMidiClip(startBeat, BARS * 4);
      await clip.setNotes(notes.map((n) => ({ pitch: n.pitch, time: n.time, duration: n.duration, velocity: n.velocity, muted: false })));
      await clip.set("name", name);
    }
    await live.application.view.showView("Arranger");
    await live.song.set("current_song_time", startBeat);
    return { from: `bar ${START_BAR}`, bars: BARS, cell: "kick 1 / fast snare 2-3 / kick 4",
             pattern: "snare on every 8th throughout, kick on 1 and 3 between them, hats closed-closed-open" };
  }),
);

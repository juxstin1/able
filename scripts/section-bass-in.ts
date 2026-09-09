// Bass enters and the chords step out - the "just drums and bass" section.
// usage: node_modules/.bin/tsx scripts/section-bass-in.ts [--from 9] [--bars 8] [--root E]
//        [--style rolling] [--chords Chords]
// Chord clips in the range are MUTED, never deleted, so an unfinished audition survives.
import { withLive, track as findTrack, print } from "../lib/live.js";
import { loadOnTrack } from "../lib/browser.js";
import { getOrCreateTrack, setParams } from "../lib/song.js";
import { bassline } from "../lib/patterns.js";
import { writeMidi } from "../lib/midi.js";
import { OP_808 } from "../lib/styles.js";

const args = process.argv.slice(2);
const flag = (n: string, d: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const FROM = Number(flag("from", "9"));
const BARS = Number(flag("bars", "8"));
const R = flag("root", "E");
const STYLE = flag("style", "rolling") as "rolling" | "ukg" | "fullclip" | "pulse";
const CHORDS = flag("chords", "Chords");
const startBeat = (FROM - 1) * 4;
const endBeat = startBeat + BARS * 4;

print(
  await withLive(async (live) => {
    const bpm = (await live.song.get("tempo")) as number;
    const notes = bassline({ bars: BARS, root: `${R}1`, style: STYLE });
    writeMidi(`bass-in-${FROM}.mid`, notes, bpm);

    const t = await getOrCreateTrack(live, "UKG Bass", (tr) => loadOnTrack(live, tr, "instruments", ["Operator"]));
    const overlap = [];
    for (const c of await t.get("arrangement_clips")) {
      const s = (await c.get("start_time" as never)) as number;
      const e = s + ((await c.get("length" as never)) as number);
      if (s < endBeat && e > startBeat) overlap.push(s);
    }
    if (overlap.length) throw new Error(`UKG Bass already has clips overlapping bars ${FROM}-${FROM + BARS - 1}`);

    const clip = await t.createMidiClip(startBeat, BARS * 4);
    await clip.setNotes(notes.map((n) => ({ pitch: n.pitch, time: n.time, duration: n.duration, velocity: n.velocity, muted: n.muted ?? false })));
    await clip.set("name", `bass-${STYLE}-${R}min`);
    await setParams(t, "Operator", OP_808);

    // Chords out for the section - muted so the audition blocks are recoverable.
    const silenced: string[] = [];
    try {
      const ch = await findTrack(live, CHORDS);
      for (const c of await ch.get("arrangement_clips")) {
        const s = (await c.get("start_time" as never)) as number;
        const e = s + ((await c.get("length" as never)) as number);
        if (s < endBeat && e > startBeat) { await c.set("muted" as never, true as never); silenced.push(`${(await c.get("name" as never)) as string} (bar ${s / 4 + 1})`); }
      }
    } catch { /* no chord track */ }

    await live.application.view.showView("Arranger");
    await live.song.set("current_song_time", startBeat);
    return { section: `bars ${FROM}-${FROM + BARS - 1}`, atSeconds: +(startBeat / (bpm / 60)).toFixed(1),
             bass: { style: STYLE, root: `${R}1`, notes: notes.length }, chordClipsMuted: silenced };
  }),
);

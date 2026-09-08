// Audition chord PROGRESSIONS back to back - the harmony the track is missing, not a sound choice.
// One instrument, one voicing, one rhythm throughout so the only variable is where the chords go.
// usage: node_modules/.bin/tsx scripts/chord-audition.ts [--root E] [--each 4] [--start 1]
//        [--rhythm stab|skank|pad|pulse] [--track "UKG Chords"]
import { withLive, print } from "../lib/live.js";
import { loadOnTrack } from "../lib/browser.js";
import { getOrCreateTrack } from "../lib/song.js";
import { chords, type ChordOpts } from "../lib/patterns.js";
import { writeMidi } from "../lib/midi.js";

const args = process.argv.slice(2);
const flag = (n: string, d: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const R = flag("root", "E");
const EACH = Number(flag("each", "4"));
const START = Number(flag("start", "1"));
const TRACK = flag("track", "UKG Chords");
const RHYTHM = flag("rhythm", "stab") as ChordOpts["rhythm"];

// Scale degrees, 0-based, one per bar. Named by the roman numerals they give in a minor key.
const PROGS: { label: string; degrees: number[] }[] = [
  { label: "i-VI-III-VII  (Em C G D) - the classic lift, most movement", degrees: [0, 5, 2, 6] },
  { label: "i-VII-VI-v    (Em D C Bm) - descending, moody", degrees: [0, 6, 5, 4] },
  { label: "i-iv-VI-v     (Em Am C Bm) - minor-heavy, stays dark", degrees: [0, 3, 5, 4] },
  { label: "i-i-iv-v      (Em Em Am Bm) - the UKG default, least movement", degrees: [0, 0, 3, 4] },
];

print(
  await withLive(async (live) => {
    const bpm = (await live.song.get("tempo")) as number;
    const t = await getOrCreateTrack(live, TRACK, (tr) => loadOnTrack(live, tr, "instruments", ["Electric"]));
    const clash = (await t.get("arrangement_clips")).length;
    if (clash) throw new Error(`"${TRACK}" already has ${clash} clip(s); delete them or pass --track`);

    const laid: Record<string, unknown>[] = [];
    for (const [i, p] of PROGS.entries()) {
      // Below the ostinato at E4 so the harmony sits under the melody rather than fighting it.
      const notes = chords({ bars: EACH, key: `${R}3`, progression: p.degrees, minor: true, voicing: "seventh", rhythm: RHYTHM });
      writeMidi(`chords-${i + 1}.mid`, notes, bpm);
      const bar = START + i * EACH;
      const clip = await t.createMidiClip((bar - 1) * 4, EACH * 4);
      await clip.setNotes(notes.map((n) => ({ pitch: n.pitch, time: n.time, duration: n.duration, velocity: n.velocity, muted: n.muted ?? false })));
      await clip.set("name", `${i + 1}. ${p.label.split("  ")[0]}`);
      laid.push({ n: i + 1, bars: `${bar}-${bar + EACH - 1}`, prog: p.label, notes: notes.length });
    }
    await live.application.view.showView("Arranger");
    await live.song.set("current_song_time", (START - 1) * 4);
    return { key: `${R} minor`, bpm, track: TRACK, sound: "Electric", voicing: "seventh", rhythm: RHYTHM, progressions: laid };
  }),
);

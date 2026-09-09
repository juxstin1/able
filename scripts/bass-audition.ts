// Audition bass PATTERNS back to back in the Arrangement, 4 bars each, all on one sound so the
// only thing changing is the pattern. Sounds are a separate pass - changing both at once makes
// "that one's worse" impossible to attribute.
// usage: node_modules/.bin/tsx scripts/bass-audition.ts [--root E] [--each 4] [--start 1] [--track "Bass Patterns"]
import { withLive, track as findTrack, print } from "../lib/live.js";
import { loadOnTrack } from "../lib/browser.js";
import { getOrCreateTrack, setParams } from "../lib/song.js";
import { bassline } from "../lib/patterns.js";
import { writeMidi, type Note } from "../lib/midi.js";
import { OP_808 } from "../lib/styles.js";

const args = process.argv.slice(2);
const flag = (n: string, d: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const ROOT = flag("root", "E");
const EACH = Number(flag("each", "4"));
const START = Number(flag("start", "1"));
const TRACK = flag("track", "Bass Patterns");
const MUTE = flag("mute", "UKG Bass");

// boombap and walking are the wrong genre at 132; these four are the garage-viable ones.
const STYLES = ["rolling", "ukg", "fullclip", "pulse"] as const;

print(
  await withLive(async (live) => {
    const bpm = (await live.song.get("tempo")) as number;
    const t = await getOrCreateTrack(live, TRACK, (tr) => loadOnTrack(live, tr, "instruments", ["Operator"]));
    const clash = (await t.get("arrangement_clips")).length;
    if (clash) throw new Error(`"${TRACK}" already has ${clash} Arrangement clip(s); delete them or pass --track`);
    await setParams(t, "Operator", OP_808);

    const laid: Record<string, unknown>[] = [];
    for (const [i, style] of STYLES.entries()) {
      const notes = bassline({ bars: EACH, root: `${ROOT}1`, style }) as Note[];
      writeMidi(`bass-aud-${i + 1}-${style}.mid`, notes, bpm);
      const bar = START + i * EACH;
      const clip = await t.createMidiClip((bar - 1) * 4, EACH * 4);
      await clip.setNotes(notes.map((n) => ({ pitch: n.pitch, time: n.time, duration: n.duration, velocity: n.velocity, muted: n.muted ?? false })));
      await clip.set("name", `${i + 1}. ${style}`);
      laid.push({ n: i + 1, style, bars: `${bar}-${bar + EACH - 1}`, notes: notes.length });
    }

    // The existing bass would double every variant and muddy the comparison.
    let muted: string | undefined;
    try { const m = await findTrack(live, MUTE); await m.set("mute", true); muted = MUTE; } catch { /* not there */ }

    await live.application.view.showView("Arranger");
    await live.song.set("current_song_time", (START - 1) * 4);
    return { key: `${ROOT} minor`, bpm, track: TRACK, sound: "Operator OP_808", muted, variants: laid };
  }),
);

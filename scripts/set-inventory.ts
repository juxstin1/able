// What is actually in the open set: every track, its devices, mixer state and clips.
// Read-only and silent - it starts no playback. Pair it with levels.ts for peak metering.
// usage: node_modules/.bin/tsx scripts/set-inventory.ts [--clips]
import { withLive, print } from "../lib/live.js";

const SHOW_CLIPS = process.argv.slice(2).includes("--clips");
// Live's mixer fader is 0..1 with 0.85 at unity, not linear - report both so the number is readable.
const dbish = (v: number) => (v >= 0.999 ? "+6.0" : v <= 0 ? "-inf" : (40 * Math.log10(v / 0.85)).toFixed(1));

print(
  await withLive(async (live) => {
    const rows: Record<string, unknown>[] = [];
    for (const [i, t] of (await live.song.get("tracks")).entries()) {
      const mix = await t.get("mixer_device");
      const vol = (await (await mix.get("volume")).get("value")) as number;
      const pan = (await (await mix.get("panning")).get("value")) as number;
      const arr = await t.get("arrangement_clips");
      const clips: Record<string, unknown>[] = [];
      let notes = 0;
      for (const c of arr) {
        const isMidi = (await c.get("is_midi_clip" as never)) as boolean;
        const n = isMidi ? ((await c.get("notes" as never)) as unknown[]).length : 0;
        notes += n;
        if (SHOW_CLIPS)
          clips.push({ name: await c.get("name" as never), bar: ((await c.get("start_time" as never)) as number) / 4 + 1,
                       bars: ((await c.get("length" as never)) as number) / 4, kind: isMidi ? "midi" : "audio", notes: n });
      }
      rows.push({
        i, name: await t.get("name"),
        state: [(await t.get("mute")) ? "MUTED" : "on", (await t.get("solo")) ? "SOLO" : ""].filter(Boolean).join(" "),
        fader: `${vol.toFixed(3)} (${dbish(vol)} dB)`,
        pan: pan.toFixed(2),
        devices: (await t.get("devices")).map((d) => d.raw.name).join(" > ") || "(none)",
        clips: arr.length, notes,
        ...(SHOW_CLIPS ? { detail: clips } : {}),
      });
    }
    const m = await live.song.get("master_track");
    const mv = (await (await (await m.get("mixer_device")).get("volume")).get("value")) as number;
    return {
      bpm: await live.song.get("tempo"),
      playing: await live.song.get("is_playing"),
      tracks: rows.length,
      master: { fader: `${mv.toFixed(3)} (${dbish(mv)} dB)`, devices: (await m.get("devices")).map((d) => d.raw.name).join(" > ") || "(none)" },
      list: rows,
    };
  }),
);

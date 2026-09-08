// Remove only stray copies of our dated intro chord clip, preserving the intended bar-1 copy.
// usage: node_modules/.bin/tsx scripts/clean-ukg-chord-duplicates.ts
import { withLive, print, track } from "../lib/live.js";

print(
  await withLive(async (live) => {
    const chords = await track(live, "ARR Chords 2026-09-04");
    const removed = [];
    for (const clip of await chords.get("arrangement_clips")) {
      const name = await clip.get("name");
      const startBeat = await clip.get("start_time");
      if (name === "INTRO 16 bars - F minor pads" && startBeat !== 0) {
        removed.push({ name, startBar: startBeat / 4 + 1 });
        await chords.deleteClip(clip);
      }
    }
    await live.application.view.showView("Arranger");
    return { removed, transportLeftPlaying: await live.song.get("is_playing") };
  }),
);

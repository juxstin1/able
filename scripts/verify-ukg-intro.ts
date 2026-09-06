// Read-only proof for scripts/build-ukg-intro.ts.
// usage: node_modules/.bin/tsx scripts/verify-ukg-intro.ts
import { withLive, print, track } from "../lib/live.js";

const DATE = "2026-09-04";

print(
  await withLive(async (live) => {
    const audition = await track(live, `AUDITION Drums ${DATE}`);
    const keys = await track(live, `INTRO Keys ${DATE}`);
    const drums = await track(live, `INTRO Drums ${DATE}`);

    const sessionClips = [];
    for (const [index, slot] of (await audition.get("clip_slots")).entries()) {
      if (!(await slot.get("has_clip"))) continue;
      const clip = (await slot.get("clip"))!;
      sessionClips.push({
        scene: index + 1,
        name: await clip.get("name"),
        lengthBeats: await clip.get("length"),
        noteCount: (await clip.getNotesExtended(0, 0, 128, 128)).length,
      });
    }

    const arrangement = [];
    for (const t of [keys, drums]) {
      const name = await t.get("name");
      for (const clip of await t.get("arrangement_clips")) {
        arrangement.push({
          track: name,
          name: await clip.get("name"),
          startBeat: await clip.get("start_time"),
          lengthBeats: await clip.get("length"),
          noteCount: (await clip.getNotesExtended(0, 0, 128, 128)).length,
        });
      }
    }

    return {
      tempo: await live.song.get("tempo"),
      isPlaying: await live.song.get("is_playing"),
      sessionClips,
      arrangement,
      accepted:
        sessionClips.length === 3 &&
        sessionClips.every((clip) => clip.lengthBeats === 16 && clip.noteCount > 0) &&
        arrangement.length === 2 &&
        arrangement.every((clip) => clip.startBeat === 0 && clip.lengthBeats === 64 && clip.noteCount > 0),
    };
  }),
);

// Read-only proof for scripts/arrange-ukg-song.ts.
// usage: node_modules/.bin/tsx scripts/verify-ukg-arrangement.ts
import { withLive, print, track } from "../lib/live.js";

const DATE = "2026-09-04";
const names = ["Drums", "Bass", "Chords", "Hook"].map((part) => `ARR ${part} ${DATE}`);

print(
  await withLive(async (live) => {
    const clips = [];
    for (const trackName of names) {
      const t = await track(live, trackName);
      for (const clip of await t.get("arrangement_clips")) {
        const startBeat = await clip.get("start_time");
        const lengthBeats = await clip.get("length");
        clips.push({
          track: trackName,
          name: await clip.get("name"),
          startBar: startBeat / 4 + 1,
          bars: lengthBeats / 4,
          endBeat: startBeat + lengthBeats,
          noteCount: (await clip.getNotesExtended(0, 0, 128, 128)).length,
        });
      }
    }

    const drumNames = clips.filter((clip) => clip.track === names[0]).map((clip) => clip.name);
    const maxEnd = Math.max(...clips.map((clip) => clip.endBeat));
    return {
      tempo: await live.song.get("tempo"),
      isPlaying: await live.song.get("is_playing"),
      currentBar: (await live.song.get("current_song_time")) / 4 + 1,
      tracks: names,
      clipCount: clips.length,
      clips,
      maxEndBar: maxEnd / 4,
      accepted:
        (await live.song.get("tempo")) === 132 &&
        !(await live.song.get("is_playing")) &&
        drumNames.some((name) => name.startsWith("DRUM A")) &&
        drumNames.some((name) => name.startsWith("DRUM B")) &&
        drumNames.some((name) => name.startsWith("DRUM C")) &&
        maxEnd === 256 &&
        clips.every((clip) => clip.noteCount > 0),
    };
  }),
);

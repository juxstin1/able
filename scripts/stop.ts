// Stop the transport and all clips. Panic button - no arguments, no side effects beyond silence.
// usage: node_modules/.bin/tsx scripts/stop.ts
import { withLive, print } from "../lib/live.js";

print(
  await withLive(async (live) => {
    await live.song.stopAllClips();
    await live.song.stopPlaying();
    return { playing: await live.song.get("is_playing") };
  }),
);

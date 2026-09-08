// Unmute specific tracks by exact name, leaving every other track's mute state untouched.
// Used to turn a bank comparison (one unmuted at a time) into a layer test (several at once).
// usage: node_modules/.bin/tsx scripts/unmute.ts "Track A" "Track B" ...
import { withLive, print } from "../lib/live.js";

const names = process.argv.slice(2);
if (!names.length) throw new Error("usage: unmute.ts <trackName...>");

print(
  await withLive(async (live) => {
    const tracks = await live.song.get("tracks");
    const found: string[] = [];
    for (const t of tracks) {
      const name = await t.get("name");
      if (names.includes(name)) {
        await t.set("mute", false);
        found.push(name);
      }
    }
    const missing = names.filter((n) => !found.includes(n));
    return { unmuted: found, missing };
  }),
);

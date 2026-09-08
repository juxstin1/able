// Delete a range of tracks by index, highest first so earlier indices stay valid.
// usage: node_modules/.bin/tsx scripts/delete-tracks.ts <fromIndex> <toIndex>   (inclusive, 0-based)
import { withLive, print } from "../lib/live.js";

const [fromArg, toArg] = process.argv.slice(2);
const from = Number(fromArg);
const to = Number(toArg);
if (!Number.isInteger(from) || !Number.isInteger(to) || from > to) throw new Error("usage: delete-tracks.ts <fromIndex> <toIndex>");

print(
  await withLive(async (live) => {
    const deleted: string[] = [];
    for (let i = to; i >= from; i--) {
      const tracks = await live.song.get("tracks");
      const name = await tracks[i].get("name");
      await live.song.deleteTrack(i);
      deleted.push(name);
    }
    return deleted;
  }),
);

import { Ableton } from "ableton-js";

/** Open a connection, run fn, always close. Live must have the AbletonJS control surface enabled. */
export async function withLive<T>(fn: (live: Ableton) => Promise<T>): Promise<T> {
  const live = new Ableton({ logger: undefined });
  await live.start(8000);
  try {
    return await fn(live);
  } finally {
    await live.close();
  }
}

/** Find a track by exact name, 0-based index, or "master". */
export async function track(live: Ableton, ref: string | number) {
  if (ref === "master") return live.song.get("master_track");
  const tracks = await live.song.get("tracks");
  if (typeof ref === "number") return tracks[ref];
  for (const t of tracks) if ((await t.get("name")) === ref) return t;
  throw new Error(`no track "${ref}"`);
}

export const print = (x: unknown) => console.log(JSON.stringify(x, null, 2));

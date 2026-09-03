import { withLive, track, print } from "../lib/live.js";
const name = process.argv[2] ?? "Able Test";
print(await withLive(async (live) => {
  const t = await track(live, name);
  const out: Record<string, string[]> = {};
  for (const d of await t.get("devices")) {
    const ps = await d.get("parameters");
    out[await d.get("name")] = await Promise.all(ps.map(async (p) => `${await p.get("name")} [${await p.get("min")}..${await p.get("max")}]=${await p.get("value")}`));
  }
  return out;
}));

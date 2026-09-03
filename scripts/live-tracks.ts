// Smoke test: list tempo, tracks and their devices in the open Live set.
import { withLive, print } from "../lib/live.js";

print(
  await withLive(async (live) => {
    const tempo = await live.song.get("tempo");
    const rows = [];
    for (const t of await live.song.get("tracks")) {
      const devices = await t.get("devices");
      rows.push({
        i: rows.length,
        name: await t.get("name"),
        midi: await t.get("has_midi_input"),
        devices: await Promise.all(devices.map((d) => d.get("name"))),
      });
    }
    return { tempo, tracks: rows };
  }),
);

// Verify Serum Arrangement automation while the playhead is inside the recorded range.
// usage: node_modules/.bin/tsx scripts/verify-serum-automation.ts
import { withLive, print, track } from "../lib/live.js";

print(
  await withLive(async (live) => {
    const bass = await track(live, "ARR Bass 2026-09-04");
    const serum = (await bass.get("devices")).find((device) => device.raw.name === "Serum 2");
    if (!serum) throw new Error("Serum 2 is missing");
    const params = await serum.get("parameters");
    const wanted = params.filter((param) => ["Filter 1 Freq", "A WT Pos"].includes(param.raw.name));

    await live.song.safeStopPlaying();
    await live.song.set("current_song_time", 64); // bar 17
    await live.song.safeStartPlaying();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const states = await Promise.all(
      wanted.map(async (param) => ({
        name: await param.get("name"),
        value: await param.get("value"),
        automationState: await param.get("automation_state"),
      })),
    );
    await live.song.safeStopPlaying();
    await live.application.view.showView("Arranger");
    return { checkedAtBar: 17, states, recorded: states.every((state) => state.automationState === 1) };
  }),
);

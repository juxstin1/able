// Remove the temporary Session audition track only after proving A/B/C are in Arrangement.
// usage: node_modules/.bin/tsx scripts/remove-ukg-session-auditions.ts
import { withLive, print, track } from "../lib/live.js";

print(
  await withLive(async (live) => {
    const drums = await track(live, "ARR Drums 2026-09-04");
    const arrangementNames = await Promise.all(
      (await drums.get("arrangement_clips")).map((clip) => clip.get("name")),
    );
    for (const variation of ["DRUM A", "DRUM B", "DRUM C"]) {
      if (!arrangementNames.some((name) => name.startsWith(variation))) {
        throw new Error(`refusing to remove Session source: ${variation} is missing from Arrangement`);
      }
    }

    const tracks = await live.song.get("tracks");
    const names = await Promise.all(tracks.map((t) => t.get("name")));
    const index = names.indexOf("AUDITION Drums 2026-09-04");
    if (index >= 0) await live.song.deleteTrack(index);
    await live.song.stopAllClips();
    await live.application.view.showView("Arranger");

    return {
      removedTrack: index >= 0 ? "AUDITION Drums 2026-09-04" : null,
      preservedArrangementVariations: arrangementNames.filter((name) => /^DRUM [ABC]/.test(name)),
      view: "Arranger",
    };
  }),
);

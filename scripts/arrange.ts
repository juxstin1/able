// Sequence a song from scenes you've already built (loop.ts etc): fire each section's scene in
// order, run any automation for that section concurrently, and hold for the section's bar count
// before moving on. Doesn't generate content - build the scenes first, this just plays them in
// order. Tempo is read live per section (scenes can carry their own tempo, same as loop.ts sets).
// usage: node_modules/.bin/tsx scripts/arrange.ts <song.yaml>
//
// song.yaml:
//   sections:
//     - name: Intro
//       scene: 1          # 1-based scene index, matches loop.ts --scene
//       bars: 8
//       automation:       # optional, runs while the section plays - see automate.ts
//         - track: FX
//           device: Utility
//           param: Gain
//           points: [[0, 0], [8, 1]]
//           curve: exp    # optional, default linear
import fs from "node:fs";
import YAML from "yaml";
import { withLive, print } from "../lib/live.js";
import { fireScene, runAutomation, type AutomationOpts } from "../lib/song.js";

interface Section {
  name: string;
  scene: number;
  bars: number;
  automation?: Omit<AutomationOpts, "bpm">[];
}

const file = process.argv[2];
if (!file) throw new Error("usage: arrange.ts <song.yaml>");
const { sections } = YAML.parse(fs.readFileSync(file, "utf8")) as { sections: Section[] };

print(
  await withLive(async (live) => {
    const played: { name: string; scene: number; bpm: number }[] = [];
    for (const s of sections) {
      await fireScene(live, s.scene - 1, s.name);
      const bpm = await live.song.get("tempo");
      const sectionMs = s.bars * 4 * (60000 / bpm);
      const waits: Promise<unknown>[] = [new Promise((r) => setTimeout(r, sectionMs))];
      for (const a of s.automation ?? []) waits.push(runAutomation(live, { ...a, bpm }));
      await Promise.all(waits);
      played.push({ name: s.name, scene: s.scene, bpm });
    }
    return { played };
  }),
);

// Lay a song out in the real Arrangement timeline, from scenes you've already built (loop.ts /
// section.ts). Reads the same song.yaml shape as arrange.ts, but instead of firing scenes live
// it takes each track's Session clip for that scene and copies it into the Arrangement at the
// right bar, back to back. This is what actually shows up when you open Arrangement View -
// arrange.ts only performs the scenes in real time and never touches the timeline.
// usage: node_modules/.bin/tsx scripts/arrange-build.ts <song.yaml> [--start 1]
//
// song.yaml:
//   sections:
//     - name: Intro
//       scene: 1     # 1-based scene index, matches loop.ts/section.ts --scene
//       bars: 8
//
// --start is the 1-based bar the first section lands on (default bar 1 / beat 0). Sections are
// placed back to back after that in the order given, each `bars` long. Any track with no clip
// in a section's scene is skipped for that section - it just leaves a gap there, same as Session.
//
// Automation: Live's Arrangement automation lives on the track, not in a clip, and the API has
// no write path for it (see automate.ts's header - ableton-js's Clip.createAutomationEnvelope is
// an unimplemented stub, and even a working one only applies to Session clips; Arrangement clips
// return null for automation_envelope()). To bake a song.yaml `automation:` move into the
// Arrangement for real: arm the track, turn on arrangement overdub (Song.arrangement_overdub),
// position the transport at the section's start beat, start recording, and run automate.ts's
// runAutomation concurrently - Live's own recording captures the puppeteered moves as genuine
// automation. Not wired up here yet; ask for it if you want a section run that does this end to
// end (it needs the transport actually rolling in record mode, so it plays out in real time).
import fs from "node:fs";
import YAML from "yaml";
import { withLive, print } from "../lib/live.js";

interface Section {
  name: string;
  scene: number;
  bars: number;
}

const file = process.argv[2];
if (!file) throw new Error("usage: arrange-build.ts <song.yaml> [--start 1]");
const args = process.argv.slice(3);
const flag = (n: string, d: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const startBar = Number(flag("start", "1"));

const { sections } = YAML.parse(fs.readFileSync(file, "utf8")) as { sections: Section[] };

print(
  await withLive(async (live) => {
    const tracks = await live.song.get("tracks");
    const placed: { section: string; track: string; startBeat: number; bars: number }[] = [];
    const skipped: { section: string; track: string }[] = [];
    let cursor = (startBar - 1) * 4;

    for (const s of sections) {
      const sceneIndex = s.scene - 1;
      for (const t of tracks) {
        const slots = await t.get("clip_slots");
        const slot = slots[sceneIndex];
        const name = await t.get("name");
        if (!slot || !(await slot.get("has_clip"))) {
          skipped.push({ section: s.name, track: name });
          continue;
        }
        const clip = (await slot.get("clip"))!;
        await t.duplicateClipToArrangement(clip, cursor);
        placed.push({ section: s.name, track: name, startBeat: cursor, bars: s.bars });
      }
      cursor += s.bars * 4;
    }

    await live.application.view.showView("Arranger");
    await live.song.set("current_song_time", (startBar - 1) * 4);

    return { placed, skipped, endBeat: cursor, endBar: cursor / 4 + 1 };
  }),
);

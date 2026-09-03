// Auto gain-stage: play a scene, measure peaks, pull down any track (or master) that's clipping, repeat.
// Read-only on everything except each offending track's mixer volume fader.
//   tsx scripts/gain-stage.ts --scene 4 [--seconds 3] [--target 0.89] [--passes 5]
import { withLive } from "../lib/live.js";
import { peakLevels, fireScene, nudgeVolume } from "../lib/song.js";

const args = process.argv.slice(2);
const flag = (name: string, def?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const scene = flag("scene");
const seconds = Number(flag("seconds", "3"));
const target = Number(flag("target", "0.89")); // just under 0dBFS
const passes = Number(flag("passes", "5"));

withLive(async (live) => {
  const tracks = await live.song.get("tracks");

  for (let pass = 1; pass <= passes; pass++) {
    if (scene !== undefined) await fireScene(live, Number(scene) - 1);
    else if (!(await live.song.get("is_playing"))) await live.song.startPlaying();

    const peaks = await peakLevels(live, tracks, seconds * 1000);
    console.log(`\npass ${pass}:`);
    let clipped = false;
    for (const p of peaks) {
      const tag = p.peak >= 0.999 ? "CLIPPING" : p.peak >= 0.9 ? "hot" : "";
      console.log(`  ${p.name.padEnd(24)} ${p.peak.toFixed(3)}  ${tag}`);
      if (p.peak >= target && p.name !== "Master") {
        clipped = true;
        const factor = target / p.peak;
        const next = await nudgeVolume(p.track, factor);
        console.log(`    -> pulled ${p.name} fader down (x${factor.toFixed(3)}, now ${next.toFixed(3)})`);
      }
    }
    if (!clipped) {
      console.log("\nnothing over target. if master's still hot, that's the sum of everything at once - add a Limiter on master (catalog id: limiter) rather than pulling every track down further.");
      break;
    }
  }
});

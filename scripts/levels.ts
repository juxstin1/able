// Peak-meter check on whatever's playing (or fire a scene first).
//   tsx scripts/levels.ts [--scene 4] [--seconds 4]
import { withLive, print } from "../lib/live.js";
import { peakLevels, fireScene } from "../lib/song.js";

const args = process.argv.slice(2);
const flag = (name: string, def?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const scene = flag("scene");
const seconds = Number(flag("seconds", "4"));

withLive(async (live) => {
  const tracks = await live.song.get("tracks");
  if (scene !== undefined) await fireScene(live, Number(scene) - 1);
  else if (!(await live.song.get("is_playing"))) await live.song.startPlaying();

  const peaks = await peakLevels(live, tracks, seconds * 1000);
  print("");
  console.log(`Peak output level per track over ${seconds}s (1.0 = 0dBFS = clipping):`);
  for (const p of peaks) {
    const tag = p.peak >= 0.999 ? "CLIPPING" : p.peak >= 0.9 ? "hot" : "";
    console.log(`  ${p.name.padEnd(24)} ${p.peak.toFixed(3)}  ${tag}`);
  }
});

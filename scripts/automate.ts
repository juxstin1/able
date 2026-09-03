// Real-time parameter automation - risers, filter sweeps, anything that moves a knob over time.
// usage: node_modules/.bin/tsx scripts/automate.ts --track "<name>" --device "<name>" --param "<name>"
//        --points "[[0,0],[8,1]]" --bpm 130 [--scene 3] [--curve linear|exp]
// points are [beat, fraction 0..1 of the param's min..max], time counted from when this script starts.
// --scene fires that scene first (session view), then automation runs live while it plays.
// For a Rack's macro knobs, --device is the Rack's name and --param is "Macro 1".."Macro 8" -
// same mechanism as any other device parameter, nothing special needed.
//
// Checked and confirmed: ableton-js's Clip.createAutomationEnvelope is an unimplemented stub
// (returns nothing, does nothing) - there is no way to bake a real automation envelope into a
// clip over this API. This puppeteers the device parameter directly, in real time, at a fixed
// tick rate, while the transport plays. Nothing is "recorded" into the clip - rerun this
// alongside playback (or while recording the master bus) every time you want the move to happen.
import { withLive, print } from "../lib/live.js";
import { fireScene, runAutomation } from "../lib/song.js";

const args = process.argv.slice(2);
const flag = (n: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);
const trackRef = flag("track");
const device = flag("device");
const param = flag("param");
const pointsArg = flag("points");
const bpm = Number(flag("bpm") ?? "120");
const scene = flag("scene");
const curve = (flag("curve") ?? "linear") as "linear" | "exp";
if (!trackRef || !device || !param || !pointsArg) {
  throw new Error('usage: automate.ts --track "<name>" --device "<name>" --param "<name>" --points "[[0,0],[8,1]]" --bpm 130 [--scene 3] [--curve linear|exp]');
}
const points: [number, number][] = JSON.parse(pointsArg);

await withLive(async (live) => {
  if (scene !== undefined) await fireScene(live, Number(scene) - 1);
  await runAutomation(live, { track: /^\d+$/.test(trackRef) ? Number(trackRef) : trackRef, device, param, points, bpm, curve });
});

print({ track: trackRef, device, param, ranBeats: points[points.length - 1][0], bpm });

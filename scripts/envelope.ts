// Write a real, bakeable automation envelope into a Session clip - not the live-puppeteering
// trick in automate.ts. Needs remote-script/patch-automation.py run once first; if that method
// isn't reachable from a standard Control Surface script this throws AttributeError, and that's
// the real answer (see lib/envelope.ts header). Session clips only - Arrangement clips have no
// envelope to write into at all (automation there lives on the track's automation lane).
// usage: node_modules/.bin/tsx scripts/envelope.ts --track "<name>" --device "<name>"
//        --param "<name>" --scene N --steps "[[0,4,0],[4,4,1]]"
// steps are [beat, length in beats, value 0..1 of the param's min..max], relative to clip start.
import { withLive, print, track as findTrack } from "../lib/live.js";
import { writeEnvelope } from "../lib/envelope.js";

const args = process.argv.slice(2);
const flag = (n: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);
const trackRef = flag("track");
const device = flag("device");
const param = flag("param");
const scene = flag("scene");
const stepsArg = flag("steps");
if (!trackRef || !device || !param || !scene || !stepsArg) {
  throw new Error('usage: envelope.ts --track "<name>" --device "<name>" --param "<name>" --scene N --steps "[[0,4,0],[4,4,1]]"');
}
const steps: [number, number, number][] = JSON.parse(stepsArg);
const sceneIndex = Number(scene) - 1;

print(
  await withLive(async (live) => {
    const t = await findTrack(live, /^\d+$/.test(trackRef) ? Number(trackRef) : trackRef);
    const devices = await t.get("devices");
    let dev;
    for (const d of devices) if ((await d.get("name")) === device) dev = d;
    if (!dev) throw new Error(`no device "${device}" on track "${trackRef}"`);
    const params = await dev.get("parameters");
    let p;
    for (const q of params) if ((await q.get("name")).trim() === param) p = q;
    if (!p) throw new Error(`no param "${param}" on ${device}`);

    const slots = await t.get("clip_slots");
    const slot = slots[sceneIndex];
    if (!slot || !(await slot.get("has_clip"))) throw new Error(`no clip in scene ${scene} on track "${trackRef}"`);
    const clip = (await slot.get("clip"))!;

    await writeEnvelope(clip, p, steps);
    return { track: trackRef, device, param, scene, steps };
  }),
);

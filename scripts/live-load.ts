// Load a catalog entry (or a raw browser path) onto a track, creating the track if asked.
// usage: node_modules/.bin/tsx scripts/live-load.ts <catalog-id | root:Seg/Seg/Seg> --track "<name|index>" [--new-midi | --new-audio]
import { withLive, track as findTrack, print } from "../lib/live.js";
import { loadOnTrack, type Root } from "../lib/browser.js";
import { loadEntry } from "../lib/catalog.js";

const args = process.argv.slice(2);
const what = args[0];
const trackRef = args[args.indexOf("--track") + 1];
const newMidi = args.includes("--new-midi");
const newAudio = args.includes("--new-audio");
if (!what) throw new Error("usage: live-load <catalog-id | root:Seg/Seg> --track <name|index> [--new-midi|--new-audio]");

let root: Root;
let segs: string[];
if (what.includes(":")) {
  const [r, p] = what.split(":", 2);
  root = r as Root;
  segs = p.split("/");
} else {
  const e = loadEntry(what) as { load?: { root: Root; path: string[] } };
  if (!e.load) throw new Error(`catalog entry "${what}" has no load path yet; run scripts/browser-dump.ts`);
  root = e.load.root;
  segs = e.load.path;
}

print(
  await withLive(async (live) => {
    let t;
    if (newMidi || newAudio) {
      t = newMidi ? await live.song.createMidiTrack(-1) : await live.song.createAudioTrack(-1);
      if (trackRef) await t.set("name", trackRef);
    } else {
      const ref = /^\d+$/.test(trackRef ?? "") ? Number(trackRef) : trackRef;
      t = await findTrack(live, ref);
    }
    const uri = await loadOnTrack(live, t, root, segs);
    const devices = await t.get("devices");
    return { track: await t.get("name"), loaded: uri, devices: await Promise.all(devices.map((d) => d.get("name"))) };
  }),
);

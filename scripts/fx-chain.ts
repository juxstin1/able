// Build a device chain onto a track: load each ref in order, in slot order.
// usage: node_modules/.bin/tsx scripts/fx-chain.ts <ref:slot[:note]> [ref:slot ...] --track "<name|i>"
//        node_modules/.bin/tsx scripts/fx-chain.ts --id <chain-id> --track "<name|i>"
// Devices append to the track in the order given - put source before shape before dynamics etc.
// Judge it after: tsx scripts/chain.ts add "<context>" <ref:slot> ... --keep|--bin|--meh
import { withLive, track as findTrack, print } from "../lib/live.js";
import { loadOnTrack, type Root } from "../lib/browser.js";
import { loadEntry } from "../lib/catalog.js";
import { loadChains, validate, type ChainNode } from "../lib/graph.js";

const args = process.argv.slice(2);
const trackRef = args[args.indexOf("--track") + 1];
if (!trackRef) throw new Error('usage: fx-chain.ts <ref:slot[:note]> ... --track "<name|i>"  OR  fx-chain.ts --id <chain-id> --track "<name|i>"');

let nodes: ChainNode[];
const idIdx = args.indexOf("--id");
if (idIdx >= 0) {
  const id = args[idIdx + 1];
  const chain = loadChains().find((c) => c.id === id);
  if (!chain) throw new Error(`no chain "${id}"`);
  nodes = chain.nodes;
} else {
  nodes = args
    .filter((a, i) => a !== trackRef || args[i - 1] !== "--track")
    .filter((a) => a !== "--track" && !a.startsWith("--"))
    .map((s) => {
      const [ref, slot, ...note] = s.split(":");
      if (!slot) throw new Error(`node "${s}" needs ref:slot`);
      return { ref, slot: slot as ChainNode["slot"], note: note.length ? note.join(":") : undefined };
    });
}
const err = validate(nodes);
if (err) throw new Error(err);

print(
  await withLive(async (live) => {
    const ref = /^\d+$/.test(trackRef) ? Number(trackRef) : trackRef;
    const t = await findTrack(live, ref);
    const loaded: { ref: string; slot: string; note?: string; device: string }[] = [];
    const skipped: { ref: string; reason: string }[] = [];
    for (const n of nodes) {
      let entry;
      try {
        entry = loadEntry(n.ref) as { load?: { root: Root; path: string[] } };
      } catch {
        skipped.push({ ref: n.ref, reason: "not a catalog id" });
        continue;
      }
      if (!entry.load) {
        skipped.push({ ref: n.ref, reason: "no load path yet; run scripts/browser-dump.ts" });
        continue;
      }
      await loadOnTrack(live, t, entry.load.root, entry.load.path);
      const devices = await t.get("devices");
      const name = await devices[devices.length - 1].get("name");
      loaded.push({ ref: n.ref, slot: n.slot, note: n.note, device: name });
    }
    return { track: await t.get("name"), loaded, skipped };
  }),
);

// Classic EDM pump: duck a track under the kick via Compressor's sidechain.
// usage: node_modules/.bin/tsx scripts/sidechain.ts --track "<bass track|i>" [--depth classic|hard|subtle] [--kick "<kick track name, for the reminder only>"]
//
// The Live API does not expose the sidechain "Audio From" chooser (checked: nothing in
// ableton-js, nothing in the underlying Live Object Model this wraps). This script loads
// Compressor, turns S/C on, and dials threshold/ratio/attack/release/gain/mix. You still have
// to right-click the sidechain section in Live and pick "Audio From" -> the kick track once,
// by hand - after that it's saved with the set and everything else here stays scriptable.
//
// Attack/Release are normalized 0..1 (Live gives no ms readout over the API), so these are
// starting points to dial in by ear, not measured values. Judge with `chain.ts add ... --keep`.
import { withLive, track as findTrack, print } from "../lib/live.js";
import { loadOnTrack } from "../lib/browser.js";
import { setParams } from "../lib/song.js";

const DEPTHS: Record<string, Record<string, number>> = {
  subtle: { Threshold: 0.7, Ratio: 0.55, Attack: 0, Release: 0.22, "S/C On": 1, "S/C Gain": 0.3, "S/C Mix": 1 },
  classic: { Threshold: 0.55, Ratio: 0.75, Attack: 0, Release: 0.15, "S/C On": 1, "S/C Gain": 0.4, "S/C Mix": 1 },
  hard: { Threshold: 0.4, Ratio: 0.9, Attack: 0, Release: 0.1, "S/C On": 1, "S/C Gain": 0.5, "S/C Mix": 1 },
};

const args = process.argv.slice(2);
const flag = (n: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);
const trackRef = flag("track");
const depth = flag("depth") ?? "classic";
const kick = flag("kick");
if (!trackRef) throw new Error('usage: sidechain.ts --track "<bass track|i>" [--depth subtle|classic|hard] [--kick "<kick track>"]');
if (!DEPTHS[depth]) throw new Error(`depth must be one of ${Object.keys(DEPTHS).join(", ")}`);

print(
  await withLive(async (live) => {
    const ref = /^\d+$/.test(trackRef) ? Number(trackRef) : trackRef;
    const t = await findTrack(live, ref);
    const devices = await t.get("devices");
    let hasCompressor = false;
    for (const d of devices) if ((await d.get("name")) === "Compressor") hasCompressor = true;
    if (!hasCompressor) await loadOnTrack(live, t, "audio_effects", ["Compressor"]);
    const missing = await setParams(t, "Compressor", DEPTHS[depth]);
    return {
      track: await t.get("name"),
      depth,
      missing,
      reminder: kick
        ? `manual, one-time: right-click Compressor's sidechain section -> Audio From -> "${kick}"`
        : `manual, one-time: right-click Compressor's sidechain section -> Audio From -> your kick track`,
    };
  }),
);

// Dial the vocal-chop FX chain. The chops themselves are dry one-shots; this is the treatment
// that makes them sit - Justin's verdict on the untreated version was "sounds like ass".
// usage: first  node_modules/.bin/tsx scripts/fx-chain.ts eq-eight:shape roar:shape glue-compressor:dynamics echo:space valhallasupermassive:space utility:bus --track "PF Chops"
//        then   node_modules/.bin/tsx scripts/chops-fx.ts [--track "PF Chops"] [--wet 1.0]
// --wet scales the three wet controls together (echo mix, reverb mix, drive) so you can taste
// toward or away from it in one number instead of six.
//
// EQ Eight frequency is a normalized 0..1 param. The mapping is f = 10 * 2205^x - verified
// because it returns exactly 30 / 200 / 1000 / 5000 Hz for the four factory default bands.
// Filter type 1 = "High Pass 12dB" (read off the parameter's value_items, not guessed).
// Reverb/delay depth follows the reference: Path Five's vocal has a ~1.0 s tail (docs/reference-pierstan.md).
import { withLive, print, track } from "../lib/live.js";
import { setParams } from "../lib/song.js";

const args = process.argv.slice(2);
const flag = (n: string, d: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const TRACK = flag("track", "PF Chops");
const WET = Number(flag("wet", "1"));
const hz = (f: number) => Math.log(f / 10) / Math.log(2205); // EQ Eight normalized frequency
const w = (v: number) => Math.max(0, Math.min(1, v * WET));

print(
  await withLive(async (live) => {
    const t = await track(live, TRACK);
    const have = new Set<string>();
    for (const d of await t.get("devices")) have.add(await d.get("name"));
    const want = ["EQ Eight", "Roar", "Glue Compressor", "Echo", "ValhallaSupermassive", "Utility"];
    const missing = want.filter((d) => !have.has(d));
    if (missing.length) throw new Error(`missing devices on "${TRACK}": ${missing.join(", ")} - run the fx-chain.ts line in this file's header first`);

    const unknown: Record<string, string[]> = {};
    unknown["EQ Eight"] = await setParams(t, "EQ Eight", {
      "1 Filter On A": 1,
      "1 Filter Type A": 1,          // High Pass 12dB
      "1 Frequency A": hz(180),      // chops carry nothing useful below this
      "4 Gain A": 3,                 // 5 kHz high shelf, a little air
    });
    unknown["Roar"] = await setParams(t, "Roar", { Drive: w(0.32) });
    unknown["Glue Compressor"] = await setParams(t, "Glue Compressor", { Threshold: -16, Output: 2 });
    unknown["Echo"] = await setParams(t, "Echo", {
      "Dry Wet": w(0.28),            // was 0.7 by default - far too wet in series
      Feedback: w(0.32),
      "Stereo Width": 0.8,
    });
    unknown["ValhallaSupermassive"] = await setParams(t, "ValhallaSupermassive", {
      Mix: w(0.3), Feedback: w(0.55), Density: 0.65, Width: 1, LowCut: 0.25,
    });
    unknown["Utility"] = await setParams(t, "Utility", { "Stereo Width": 1.35 });

    return { track: TRACK, wet: WET, hp: "180 Hz", unknownParams: Object.fromEntries(Object.entries(unknown).filter(([, v]) => v.length)) };
  }),
);

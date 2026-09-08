// Audition fill techniques (not presets - generated patterns) against one kit: one track per
// style, each a 2-bar clip (groove for bar 1, the named fill on the last beat of bar 2), muted
// except the first. Solo through in Live the same way as a sound-bank.
//   node_modules/.bin/tsx scripts/fill-bank.ts hats  --kit "Garage Kit.adg" [--start 1]
//   node_modules/.bin/tsx scripts/fill-bank.ts drums --kit "Garage Kit.adg" [--start 1]
import { withLive, print } from "../lib/live.js";
import { loadOnTrack } from "../lib/browser.js";
import { replaceArrangementClip } from "../lib/midi.js";
import { getOrCreateTrack } from "../lib/song.js";
import { padsFor } from "../lib/kits.js";
import { hatFill, drumFill, type FillOpts, type DrumFillOpts } from "../lib/patterns.js";

const HAT_STYLES: FillOpts["style"][] = ["roll32", "triplet", "accelerando", "stutter-gate"];
const DRUM_STYLES: DrumFillOpts["style"][] = ["snare-buildup", "perc-cascade", "kick-snare-stutter", "snare-roll-sim"];

const args = process.argv.slice(2);
const kind = args[0]; // "hats" | "drums"
if (kind !== "hats" && kind !== "drums") throw new Error("usage: fill-bank.ts hats|drums --kit \"X.adg\" [--start N]");
const flag = (n: string, d: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const KIT = flag("kit", "Garage Kit.adg");
const START_BAR = Number(flag("start", "1"));
const startBeat = (START_BAR - 1) * 4;
const FILL_BEATS = Number(flag("fill-beats", "1"));
const BARS = 2;

print(
  await withLive(async (live) => {
    const { pads, missing } = padsFor(KIT);
    const styles = kind === "hats" ? HAT_STYLES : DRUM_STYLES;
    const results: unknown[] = [];
    for (let i = 0; i < styles.length; i++) {
      const style = styles[i]!;
      const name = `${kind.toUpperCase()}-FILL ${String(i + 1).padStart(2, "0")} - ${style} x${FILL_BEATS}b (${KIT.replace(".adg", "")})`;
      const notes =
        kind === "hats"
          ? hatFill({ bars: BARS, fillBeats: FILL_BEATS, style: style as FillOpts["style"], pads })
          : drumFill({ bars: BARS, fillBeats: FILL_BEATS, style: style as DrumFillOpts["style"], pads });
      const t = await getOrCreateTrack(live, name, (tt) => loadOnTrack(live, tt, "drums", [KIT]));
      await replaceArrangementClip(t, startBeat, BARS * 4, notes, name);
      await t.set("mute", i !== 0);
      results.push({ name, style, missing });
    }
    await live.application.view.showView("Arranger");
    return results;
  }),
);

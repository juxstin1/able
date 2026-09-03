// Bass only, full density, for a given style - reuses the same generator loop.ts uses.
// usage: node_modules/.bin/tsx scripts/bass.ts <trap|boombap|house|ukg> [--scene 1] [--seed 7] [--root F1] [--bars 4]
import { withLive, print } from "../lib/live.js";
import { loadOnTrack } from "../lib/browser.js";
import { pushClip, writeMidi, seed } from "../lib/midi.js";
import { getOrCreateTrack, setParams, fireScene, ensureScenes } from "../lib/song.js";
import { STYLES, OP_808, OP_PULSE } from "../lib/styles.js";

const args = process.argv.slice(2);
const style = STYLES[args[0]];
if (!style) throw new Error(`style must be one of ${Object.keys(STYLES).join(", ")}`);
const flag = (n: string, d: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const SEED = Number(flag("seed", "7"));
const ROOT = flag("root", "F1");
const SCENE = Number(flag("scene", "1")) - 1;
const BARS = Number(flag("bars", "4"));
seed(SEED);

const bass = style.bass(BARS, ROOT);
const tag = `${args[0]}-bass-${SEED}`;
writeMidi(`${tag}.mid`, bass, style.bpm);

print(
  await withLive(async (live) => {
    await ensureScenes(live, SCENE + 1);
    const t = await getOrCreateTrack(live, `${style.prefix}Bass`, async (tr) => {
      await loadOnTrack(live, tr, "instruments", ["Operator"]);
      await setParams(tr, "Operator", style.bassInstrument === "operator-808" ? OP_808 : OP_PULSE);
    });
    await pushClip(live, t, SCENE, bass, BARS * 4, `${tag} ${ROOT}`);
    const scenes = await live.song.get("scenes");
    await scenes[SCENE].set("tempo", style.bpm);
    await fireScene(live, SCENE, `${args[0]} bass`);
    return { style: args[0], track: `${style.prefix}Bass`, scene: SCENE + 1, bpm: style.bpm, root: ROOT, bassInstrument: style.bassInstrument };
  }),
);

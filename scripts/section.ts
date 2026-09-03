// Build one arrangement section (intro/build/drop/breakdown/outro) of a style into a scene -
// like loop.ts but at the density that section calls for, so a scene sequence built with this
// (then played back with arrange.ts) actually goes somewhere instead of repeating one loop.
// usage: node_modules/.bin/tsx scripts/section.ts <trap|boombap|house|ukg> <intro|build|drop|breakdown|outro>
//        --scene N [--seed 7] [--root F1] [--kit "X.adg"] [--bars N]
//
// Only touches the tracks/parts the archetype calls for; parts left out stay silent for this
// scene (fireScene stops all clips first, so an empty slot on a track just means that track
// doesn't play in this section). These are starting-point densities, not rules - judge each
// section by ear and log it: tsx scripts/verdict.ts "part:<tag>/<section>" keep|bin|meh
import { withLive, print } from "../lib/live.js";
import { loadOnTrack } from "../lib/browser.js";
import { pushClip, writeMidi, seed, type Note } from "../lib/midi.js";
import { getOrCreateTrack, setParams, ensureScenes } from "../lib/song.js";
import { padsFor } from "../lib/kits.js";
import { recordLoop } from "../lib/taste.js";
import { STYLES, OP_808, OP_PULSE } from "../lib/styles.js";

type Part = "drums" | "hats" | "bass" | "keys" | "keysCalm";
const ARCHETYPES: Record<string, { parts: Part[]; bars: number; desc: string }> = {
  intro: { parts: ["keysCalm"], bars: 8, desc: "pad only, triad voicing - establish the key" },
  build: { parts: ["hats", "keys"], bars: 8, desc: "hats + full chords, no kick/bass yet - climbing" },
  drop: { parts: ["drums", "bass", "keys"], bars: 4, desc: "full density - same as loop.ts" },
  breakdown: { parts: ["keysCalm"], bars: 8, desc: "strip percussion, pad only" },
  outro: { parts: ["keysCalm"], bars: 4, desc: "pad only, fading out" },
};

const args = process.argv.slice(2);
const style = STYLES[args[0]];
if (!style) throw new Error(`style must be one of ${Object.keys(STYLES).join(", ")}`);
const archetype = ARCHETYPES[args[1]];
if (!archetype) throw new Error(`section must be one of ${Object.keys(ARCHETYPES).join(", ")}`);
const flag = (n: string, d: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const SEED = Number(flag("seed", "7"));
const ROOT = flag("root", "F1");
const KIT = flag("kit", style.kit);
const SCENE = Number(flag("scene", "1")) - 1;
const BARS = Number(flag("bars", String(archetype.bars)));
seed(SEED);

const { pads, missing } = padsFor(KIT);
const have = new Set(archetype.parts);
const drums = have.has("drums") ? style.drums(BARS, pads) : have.has("hats") ? style.hats(BARS, pads) : null;
const bass = have.has("bass") ? style.bass(BARS, ROOT) : null;
const keys = have.has("keys") ? style.keys(BARS, ROOT) : have.has("keysCalm") ? style.keysCalm(BARS, ROOT) : null;

const tag = `${args[0]}-${args[1]}-${SEED}`;
if (drums) writeMidi(`${tag}-drums.mid`, drums, style.bpm);
if (bass) writeMidi(`${tag}-bass.mid`, bass, style.bpm);
if (keys) writeMidi(`${tag}-keys.mid`, keys, style.bpm);

print(
  await withLive(async (live) => {
    await ensureScenes(live, SCENE + 1);
    const p = style.prefix;
    const pushed: string[] = [];

    if (drums) {
      const t = await getOrCreateTrack(live, `${p}Drums`, (tr) => loadOnTrack(live, tr, "drums", [KIT]));
      await pushClip(live, t, SCENE, drums as Note[], BARS * 4, `${tag} drums`);
      pushed.push(have.has("drums") ? "drums" : "hats");
    }
    if (bass) {
      const t = await getOrCreateTrack(live, `${p}Bass`, async (tr) => {
        await loadOnTrack(live, tr, "instruments", ["Operator"]);
        await setParams(tr, "Operator", style.bassInstrument === "operator-808" ? OP_808 : OP_PULSE);
      });
      await pushClip(live, t, SCENE, bass as Note[], BARS * 4, `${tag} bass ${ROOT}`);
      pushed.push("bass");
    }
    if (keys) {
      const t = await getOrCreateTrack(live, `${p}Keys`, (tr) => loadOnTrack(live, tr, "instruments", style.keysDevice));
      await pushClip(live, t, SCENE, keys as Note[], BARS * 4, `${tag} keys`);
      pushed.push("keys");
    }
    const scenes = await live.song.get("scenes");
    await scenes[SCENE].set("tempo", style.bpm);
    await scenes[SCENE].set("name", `${args[0]} ${args[1]}`);

    recordLoop({
      id: tag, style: args[0], bpm: style.bpm, root: ROOT, kit: KIT, scene: SCENE + 1,
      parts: { section: args[1], seed: SEED, bars: BARS, pushed, archetype: archetype.desc },
      sounds: { drums: drums ? `drum-rack:${KIT}` : "-", bass: bass ? style.bassInstrument : "-", keys: keys ? `${style.keysDevice.join("/")} (default)` : "-" },
    });
    return { style: args[0], section: args[1], bpm: style.bpm, scene: SCENE + 1, bars: BARS, seed: SEED, root: ROOT, pushed, padsMissing: missing };
  }),
);

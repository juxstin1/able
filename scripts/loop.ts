// Build a loop of a given style: drums (kit read for pad roles) + bass + keys.
// usage: node_modules/.bin/tsx scripts/loop.ts <trap|boombap|house> [--scene 2] [--seed 7] [--root F1] [--kit "X.adg"] [--bars 4]
//        node_modules/.bin/tsx scripts/loop.ts <style> --arrangement [--start 1] [--bars 32] ...
// --arrangement writes straight into the Arrangement timeline (Track.createMidiClip) at bar
// --start (default 1) instead of a Session scene.
// --only drums,bass,keys (default all three) - build/replace just those parts. In
// --arrangement mode, parts left out have their clip in the target range cleared (not left
// stale), so you can build a loop up one part at a time.
import { withLive, print } from "../lib/live.js";
import { loadOnTrack } from "../lib/browser.js";
import { pushClip, replaceArrangementClip, clearArrangementRange, writeMidi, seed } from "../lib/midi.js";
import { getOrCreateTrack, setParams, fireScene, ensureScenes } from "../lib/song.js";
import { padsFor } from "../lib/kits.js";
import { recordLoop } from "../lib/taste.js";
import { STYLES, OP_808, OP_PULSE } from "../lib/styles.js";

const args = process.argv.slice(2);
const style = STYLES[args[0]];
if (!style) throw new Error(`style must be one of ${Object.keys(STYLES).join(", ")}`);
const flag = (n: string, d: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const ARRANGEMENT = args.includes("--arrangement");
const SEED = Number(flag("seed", "7"));
const ROOT = flag("root", "F1");
const KIT = flag("kit", style.kit);
const SCENE = Number(flag("scene", "1")) - 1;
const START_BAR = Number(flag("start", "1"));
const BARS = Number(flag("bars", "4"));
const ONLY = new Set(flag("only", "drums,bass,keys").split(","));
seed(SEED);

const { pads, missing, file } = padsFor(KIT);
const drums = style.drums(BARS, pads);
const bass = style.bass(BARS, ROOT);
const keys = style.keys(BARS, ROOT);
const tag = `${args[0]}-${SEED}`;
writeMidi(`${tag}-drums.mid`, drums, style.bpm);
writeMidi(`${tag}-bass.mid`, bass, style.bpm);
writeMidi(`${tag}-keys.mid`, keys, style.bpm);

print(
  await withLive(async (live) => {
    const p = style.prefix;
    const tDrums = await getOrCreateTrack(live, `${p}Drums`, (t) => loadOnTrack(live, t, "drums", [KIT]));
    const tBass = await getOrCreateTrack(live, `${p}Bass`, async (t) => {
      await loadOnTrack(live, t, "instruments", ["Operator"]);
      await setParams(t, "Operator", style.bassInstrument === "operator-808" ? OP_808 : OP_PULSE);
    });
    const tKeys = await getOrCreateTrack(live, `${p}Keys`, (t) => loadOnTrack(live, t, "instruments", style.keysDevice));
    await live.song.set("tempo", style.bpm);

    if (ARRANGEMENT) {
      const startBeat = (START_BAR - 1) * 4;
      const len = BARS * 4;
      if (ONLY.has("drums")) await replaceArrangementClip(tDrums, startBeat, len, drums, `${tag} drums`);
      else await clearArrangementRange(tDrums, startBeat, len);
      if (ONLY.has("bass")) await replaceArrangementClip(tBass, startBeat, len, bass, `${tag} bass ${ROOT}`);
      else await clearArrangementRange(tBass, startBeat, len);
      if (ONLY.has("keys")) await replaceArrangementClip(tKeys, startBeat, len, keys, `${tag} keys`);
      else await clearArrangementRange(tKeys, startBeat, len);
      await live.application.view.showView("Arranger");
      await live.song.set("current_song_time", startBeat);

      recordLoop({
        id: tag, style: args[0], bpm: style.bpm, root: ROOT, kit: KIT, scene: 0,
        parts: { seed: SEED, bars: BARS, drums: style.drumsDesc, bass: style.bassDesc, keys: style.keysDesc },
        sounds: { drums: `drum-rack:${KIT}`, bass: style.bassInstrument, keys: `${style.keysDevice.join("/")} (default)` },
      });
      return { style: args[0], bpm: style.bpm, arrangement: true, startBar: START_BAR, bars: BARS, seed: SEED, root: ROOT, kit: KIT, kitFile: file, padsMissing: missing, pads };
    }

    await ensureScenes(live, SCENE + 1);
    if (ONLY.has("drums")) await pushClip(live, tDrums, SCENE, drums, BARS * 4, `${tag} drums`);
    if (ONLY.has("bass")) await pushClip(live, tBass, SCENE, bass, BARS * 4, `${tag} bass ${ROOT}`);
    if (ONLY.has("keys")) await pushClip(live, tKeys, SCENE, keys, BARS * 4, `${tag} keys`);
    const scenes = await live.song.get("scenes");
    await scenes[SCENE].set("tempo", style.bpm);
    await fireScene(live, SCENE, `${args[0]} ${style.bpm}`);
    recordLoop({
      id: tag, style: args[0], bpm: style.bpm, root: ROOT, kit: KIT, scene: SCENE + 1,
      parts: { seed: SEED, bars: BARS, drums: style.drumsDesc, bass: style.bassDesc, keys: style.keysDesc },
      sounds: { drums: `drum-rack:${KIT}`, bass: style.bassInstrument, keys: `${style.keysDevice.join("/")} (default)` },
    });
    return { style: args[0], bpm: style.bpm, scene: SCENE + 1, seed: SEED, root: ROOT, kit: KIT, kitFile: file, padsMissing: missing, pads };
  }),
);

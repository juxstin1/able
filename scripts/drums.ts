// Drums only, full density, for a given style - reuses the same generator loop.ts uses.
// usage: node_modules/.bin/tsx scripts/drums.ts <trap|boombap|house|ukg> [--scene 1] [--seed 7] [--kit "X.adg"] [--bars 4]
//        node_modules/.bin/tsx scripts/drums.ts <style> --arrangement [--start 1] [--seed 7] [--kit "X.adg"] [--bars 4]
// --arrangement writes straight into the Arrangement timeline (Track.createMidiClip) at bar
// --start (default 1) instead of a Session scene - no scene/slot involved at all.
import { withLive, print } from "../lib/live.js";
import { loadOnTrack } from "../lib/browser.js";
import { pushClip, writeMidi, seed } from "../lib/midi.js";
import { getOrCreateTrack, fireScene, ensureScenes } from "../lib/song.js";
import { padsFor } from "../lib/kits.js";
import { STYLES } from "../lib/styles.js";

const args = process.argv.slice(2);
const style = STYLES[args[0]];
if (!style) throw new Error(`style must be one of ${Object.keys(STYLES).join(", ")}`);
const flag = (n: string, d: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const ARRANGEMENT = args.includes("--arrangement");
const SEED = Number(flag("seed", "7"));
const KIT = flag("kit", style.kit);
const SCENE = Number(flag("scene", "1")) - 1;
const START_BAR = Number(flag("start", "1"));
const BARS = Number(flag("bars", "4"));
seed(SEED);

const { pads, missing, file } = padsFor(KIT);
const drums = style.drums(BARS, pads);
const tag = `${args[0]}-drums-${SEED}`;
writeMidi(`${tag}.mid`, drums, style.bpm);

print(
  await withLive(async (live) => {
    const t = await getOrCreateTrack(live, `${style.prefix}Drums`, (tr) => loadOnTrack(live, tr, "drums", [KIT]));
    await live.song.set("tempo", style.bpm);

    if (ARRANGEMENT) {
      const startBeat = (START_BAR - 1) * 4;
      const clip = await t.createMidiClip(startBeat, BARS * 4);
      await clip.setNotes(drums.map((n) => ({ pitch: n.pitch, time: n.time, duration: n.duration, velocity: n.velocity, muted: n.muted ?? false })));
      await clip.set("name", tag);
      await live.application.view.showView("Arranger");
      await live.song.set("current_song_time", startBeat);
      return { style: args[0], track: `${style.prefix}Drums`, arrangement: true, startBar: START_BAR, bars: BARS, bpm: style.bpm, kit: KIT, kitFile: file, padsMissing: missing, pads };
    }

    await ensureScenes(live, SCENE + 1);
    await pushClip(live, t, SCENE, drums, BARS * 4, tag);
    const scenes = await live.song.get("scenes");
    await scenes[SCENE].set("tempo", style.bpm);
    await fireScene(live, SCENE, `${args[0]} drums`);
    return { style: args[0], track: `${style.prefix}Drums`, scene: SCENE + 1, bpm: style.bpm, kit: KIT, kitFile: file, padsMissing: missing, pads };
  }),
);

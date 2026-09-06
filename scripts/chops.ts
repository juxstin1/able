// Vocal chops from one of Justin's own recordings, placed into the Arrangement in time.
// usage: node_modules/.bin/tsx scripts/chops.ts [--start 1] [--track "PF Chops"] [--manifest out/chops-place.json]
//
// The chop WAVs and the manifest are cut by the python side first (onset detection, pitch
// snapping to the key, fades) - this only places them. Same generate-to-disk-then-push order as
// everything else here. Chops are real files under out/chops/, so the source recording is never
// touched; re-cut them and re-run this to change the pattern.
//
// Why files and not clip markers: Clip.start_marker silently refuses to be set on an arrangement
// audio clip (end_marker takes, start_marker reads back 0), and createAudioClip auto-warps the
// file to a tempo Live guesses, so marker beats do not map to sample seconds. Cutting real chops
// sidesteps both. Each clip gets warping off so it plays as a one-shot at its recorded speed.
import fs from "node:fs";
import path from "node:path";
import { withLive, print } from "../lib/live.js";
import { ROOT } from "../lib/paths.js";

const args = process.argv.slice(2);
const flag = (n: string, d: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const START_BAR = Number(flag("start", "1"));
const TRACK = flag("track", "PF Chops");
const MANIFEST = path.resolve(ROOT, flag("manifest", "out/chops-place.json"));
const CLEAR_ONLY = args.includes("--clear-only"); // release the wav files so they can be re-cut

interface Placement { file: string; beat: number; bar: number; lenBeats: number; shift: number; src: number }
const man = CLEAR_ONLY
  ? { bpm: 128, bars: 0, clips: [] as Placement[] }
  : (JSON.parse(fs.readFileSync(MANIFEST, "utf8")) as { bpm: number; bars: number; clips: Placement[] });
const missing = man.clips.filter((c) => !fs.existsSync(c.file));
if (missing.length) throw new Error(`${missing.length} chop files missing, first: ${missing[0].file}`);

print(
  await withLive(async (live) => {
    const tracks = await live.song.get("tracks");
    let t = null;
    for (const x of tracks) if ((await x.get("name")) === TRACK) t = x;
    const created = !t;
    if (!t) {
      if (CLEAR_ONLY) return { track: TRACK, clearedFirst: 0, clearOnly: true, note: "no such track" } as never;
      t = await live.song.createAudioTrack(-1);
      await t.set("name", TRACK);
    }
    await live.song.set("tempo", man.bpm);

    // Only ever clear our own track. Never touch clips on a track we did not make.
    let cleared = 0;
    if ((await t.get("name")) === TRACK) {
      for (const c of await t.get("arrangement_clips")) {
        await t.deleteClip(c);
        cleared++;
      }
    }

    if (CLEAR_ONLY) return { track: TRACK, clearedFirst: cleared, clearOnly: true };

    const offset = (START_BAR - 1) * 4;
    const placed: { beat: number; name: string }[] = [];
    for (const [i, c] of man.clips.entries()) {
      const at = offset + c.beat;
      await t.createAudioClip(c.file, at);
      placed.push({ beat: at, name: path.basename(c.file) });
      void i;
    }
    // Unwarp so each chop is a one-shot at its recorded speed, not stretched to a guessed tempo.
    let unwarped = 0;
    for (const c of await t.get("arrangement_clips")) {
      if (await c.get("warping")) {
        await c.set("warping", false);
        unwarped++;
      }
      await c.set("name", "chop");
    }
    await live.application.view.showView("Arranger");
    await live.song.set("current_song_time", offset);
    return { track: TRACK, createdTrack: created, clearedFirst: cleared, bpm: man.bpm, startBar: START_BAR, bars: man.bars, placed: placed.length, unwarped };
  }),
);

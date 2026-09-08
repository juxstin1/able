// Song-level helpers: idempotent track creation, param setting by name, scenes.
import type { Ableton } from "ableton-js";
import type { Track } from "ableton-js/ns/track";
import { track as findTrack } from "./live.js";

/** Return the track with this name, or create a MIDI track, name it, and run `init` on it once. */
export async function getOrCreateTrack(live: Ableton, name: string, init?: (t: Track) => Promise<unknown>): Promise<Track> {
  for (const t of await live.song.get("tracks")) if ((await t.get("name")) === name) return t;
  const t = await live.song.createMidiTrack(-1);
  await t.set("name", name);
  if (init) await init(t);
  return t;
}

/** Set device parameters by display name. Unknown names are reported, not thrown. */
export async function setParams(track: Track, deviceName: string, values: Record<string, number>) {
  const devices = await track.get("devices");
  let dev;
  for (const d of devices) if ((await d.get("name")) === deviceName) dev = d;
  if (!dev) throw new Error(`no device "${deviceName}" on track`);
  const params = await dev.get("parameters");
  const byName = new Map<string, (typeof params)[number]>();
  for (const p of params) byName.set((await p.get("name")).trim(), p);
  const missing: string[] = [];
  for (const [k, v] of Object.entries(values)) {
    const p = byName.get(k);
    if (!p) {
      missing.push(k);
      continue;
    }
    const min = await p.get("min");
    const max = await p.get("max");
    // A parameter can be present but disabled - Auto Pan-Tremolo's Tremolo Shape is dead while the
    // device is in Pan mode, for instance. Live throws on the write. One inapplicable knob should
    // not abort a whole chain, so collect it and carry on. Order matters when a mode switch gates
    // other params: set the mode first.
    try {
      await p.set("value", Math.max(min, Math.min(max, v)));
    } catch {
      missing.push(`${k} (disabled)`);
    }
  }
  if (missing.length) console.error(`setParams(${deviceName}): unknown ${missing.join(", ")}`);
  return missing;
}

/**
 * Name a scene and fire it exclusively, then make sure transport runs.
 * Session view only retriggers tracks that have a clip in the fired scene - any other
 * track keeps looping whatever it last played. Genre stacks (trap/boombap/house/ukg) live
 * on separate tracks, so without this every stack you've ever fired keeps summing into
 * master. Stop everything first so only the requested scene is audible.
 */
export async function fireScene(live: Ableton, index: number, name?: string) {
  const scenes = await live.song.get("scenes");
  const s = scenes[index];
  if (!s) throw new Error(`no scene ${index}`);
  if (name) await s.set("name", name);
  await live.song.stopAllClips();
  await s.fire();
  if (!(await live.song.get("is_playing"))) await live.song.startPlaying();
}

/**
 * Make sure at least n scenes exist. Adds exactly (n - current) scenes, computed once - does NOT
 * loop on a re-read of scene count. Live applies createScene on its own thread tick, a beat after
 * our socket read returns, so re-checking scenes.length per iteration is a race: the reread keeps
 * reporting the pre-create count and the loop runs away, spamming createScene until Live chokes.
 * Hit this for real 2026-09-03 - runaway scene creation took Live down. Never loop-and-reread here.
 */
export async function ensureScenes(live: Ableton, n: number) {
  if (n > 64) throw new Error(`ensureScenes(${n}): refusing - that's almost certainly a mistake, not a real scene count`);
  const scenes = await live.song.get("scenes");
  const need = n - scenes.length;
  for (let i = 0; i < need; i++) await live.song.createScene(-1);
  return need > 0 ? live.song.get("scenes") : scenes;
}

export interface PeakReading {
  name: string;
  track: Track;
  peak: number; // 1.0 = 0dBFS
}

/** Poll output meters for `ms` (whatever's currently playing) and return the peak per track, plus the master last. */
export async function peakLevels(live: Ableton, tracks: Track[], ms = 4000, intervalMs = 50): Promise<PeakReading[]> {
  const master = await live.song.get("master_track");
  const all = [...tracks, master];
  const names = await Promise.all(tracks.map((t) => t.get("name")));
  names.push("Master");
  const peaks = new Array(all.length).fill(0);
  const start = Date.now();
  while (Date.now() - start < ms) {
    await Promise.all(
      all.map(async (t, i) => {
        const lvl = await t.get("output_meter_level");
        if (lvl > peaks[i]) peaks[i] = lvl;
      }),
    );
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return all.map((t, i) => ({ name: names[i], track: t, peak: peaks[i] }));
}

/** Nudge a track's mixer volume fader down/up by a fraction of its current value (fader is a 0..1 normalized param; ~0.85 is unity). */
export async function nudgeVolume(track: Track, factor: number) {
  const mixer = await track.get("mixer_device");
  const p = await mixer.get("volume");
  const v = await p.get("value");
  const min = await p.get("min");
  const max = await p.get("max");
  const next = Math.max(min, Math.min(max, v * factor));
  await p.set("value", next);
  return next;
}

export interface AutomationOpts {
  track: string | number;
  device: string;
  param: string;
  points: [number, number][]; // [beat, fraction 0..1 of the param's min..max], from when this call starts
  bpm: number;
  curve?: "linear" | "exp";
  tickMs?: number;
}

/**
 * Puppeteer a device parameter in real time, tracked to wall-clock beats. Not a clip envelope -
 * see automate.ts header for why. Resolves once the last point's beat has passed. Blocks the
 * caller for the automation's full duration; run concurrently with other work via Promise.all.
 */
export async function runAutomation(live: Ableton, o: AutomationOpts) {
  const { points, bpm, curve = "linear", tickMs = 40 } = o;
  if (points.length < 2) throw new Error("runAutomation: need at least 2 points");
  const t = await findTrack(live, o.track);
  const devices = await t.get("devices");
  let dev;
  for (const d of devices) if ((await d.get("name")) === o.device) dev = d;
  if (!dev) throw new Error(`no device "${o.device}" on track "${o.track}"`);
  const params = await dev.get("parameters");
  let p;
  for (const q of params) if ((await q.get("name")).trim() === o.param) p = q;
  if (!p) throw new Error(`no param "${o.param}" on ${o.device}`);
  const min = await p.get("min");
  const max = await p.get("max");
  const msPerBeat = 60000 / bpm;
  const totalMs = points[points.length - 1][0] * msPerBeat;

  const valueAt = (beat: number): number => {
    let i = 0;
    while (i < points.length - 2 && points[i + 1][0] <= beat) i++;
    const [b0, v0] = points[i];
    const [b1, v1] = points[i + 1];
    let frac = b1 === b0 ? 1 : (beat - b0) / (b1 - b0);
    frac = Math.max(0, Math.min(1, frac));
    if (curve === "exp") frac = frac * frac;
    return v0 + (v1 - v0) * frac;
  };

  const start = Date.now();
  while (Date.now() - start < totalMs) {
    await p.set("value", min + (max - min) * valueAt((Date.now() - start) / msPerBeat));
    await new Promise((r) => setTimeout(r, tickMs));
  }
  await p.set("value", min + (max - min) * points[points.length - 1][1]);
}

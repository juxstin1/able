import fs from "node:fs";
import path from "node:path";
import type { Ableton } from "ableton-js";
import type { BrowserItem } from "ableton-js/ns/browser-item";
import type { Track } from "ableton-js/ns/track";
import { OUT } from "./paths.js";

const browser = (live: Ableton) => live.application.browser;

export interface BrowserRow {
  root: string; // instruments | audio_effects | midi_effects | drums | plugins | packs | user_library
  path: string[]; // names from the root down, e.g. ["Trap Drums by Sound Oracle", "Drum Racks", "Kit 1"]
  name: string;
  uri: string;
  loadable: boolean;
  device: boolean;
}

export const ROOTS = ["instruments", "sounds", "audio_effects", "midi_effects", "drums", "plugins", "packs", "user_library"] as const;
// Live reports is_folder=false on devices and packs that still have children, so expand by name instead.
const LEAF = /\.(adg|adv|amxd|wav|aif|aiff|mp3|flac|als|mid|vst3|dll)$/i;
export type Root = (typeof ROOTS)[number];
export const BROWSER_CACHE = path.join(OUT, "browser.json");

/** Walk one browser root breadth-first up to maxDepth. Each folder expansion is one round trip. */
export async function walkRoot(live: Ableton, root: Root, maxDepth: number, onRow?: (r: BrowserRow) => void) {
  const rows: BrowserRow[] = [];
  const top = (await (browser(live) as any).get(root)) as BrowserItem[]; // "sounds" exists in Live 12 but not in ableton-js typings
  const queue: { item: BrowserItem; path: string[]; depth: number }[] = top.map((item) => ({ item, path: [], depth: 0 }));
  while (queue.length) {
    const { item, path: p, depth } = queue.shift()!;
    const r = item.raw;
    const row: BrowserRow = { root, path: [...p, r.name], name: r.name, uri: r.uri, loadable: r.is_loadable, device: r.is_device };
    rows.push(row);
    onRow?.(row);
    if ((r.is_folder || !LEAF.test(r.name)) && depth < maxDepth) {
      const kids = (await item.get("children")) as BrowserItem[];
      for (const k of kids) queue.push({ item: k, path: row.path, depth: depth + 1 });
    }
  }
  return rows;
}

export function readCache(): BrowserRow[] {
  return JSON.parse(fs.readFileSync(BROWSER_CACHE, "utf8"));
}

/** Re-find a live BrowserItem by walking the cached path (ids are per-session, paths are stable). */
export async function findByPath(live: Ableton, root: Root, segs: string[]): Promise<BrowserItem> {
  let level = (await (browser(live) as any).get(root)) as BrowserItem[];
  let item: BrowserItem | undefined;
  for (const seg of segs) {
    item = level.find((i) => i.raw.name === seg);
    if (!item) throw new Error(`browser path not found at "${seg}" in ${root}/${segs.join("/")}`);
    if (seg !== segs[segs.length - 1]) level = (await item.get("children")) as BrowserItem[];
  }
  return item!;
}

/** Select the track, then load the browser item onto it. */
export async function loadOnTrack(live: Ableton, track: Track, root: Root, segs: string[]) {
  const item = await findByPath(live, root, segs);
  if (!item.raw.is_loadable) throw new Error(`not loadable: ${segs.join("/")}`);
  await live.song.view.set("selected_track", track.raw.id);
  await browser(live).loadItem(item);
  return item.raw.uri;
}

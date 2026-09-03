// Walk Live's browser, cache every item to out/browser.json, and write a `load` block
// (root + path + uri) into each catalog entry whose name matches a loadable item.
// usage: node_modules/.bin/tsx scripts/browser-dump.ts [maxDepth=3]
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { withLive, print } from "../lib/live.js";
import { ROOTS, walkRoot, BROWSER_CACHE, type BrowserRow } from "../lib/browser.js";
import { loadIndex, type Entry } from "../lib/catalog.js";
import { CATALOG } from "../lib/paths.js";

// --cached: skip the walk and relink from out/browser.json
const cached = process.argv.includes("--cached");
const maxDepth = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 3);
const norm = (s: string) =>
  s.toLowerCase().replace(/\.(adg|adv|amxd|vst3|dll)$/i, "").replace(/[^a-z0-9]+/g, " ").trim();

// --roots sounds,instruments  : walk only these roots and merge them into the existing cache
const rootsI = process.argv.indexOf("--roots");
const only = rootsI >= 0 ? (process.argv[rootsI + 1].split(",") as (typeof ROOTS)[number][]) : [...ROOTS];

let rows: BrowserRow[];
if (cached) {
  rows = JSON.parse(fs.readFileSync(BROWSER_CACHE, "utf8"));
} else {
  const fresh = await withLive(async (live) => {
    const all: BrowserRow[] = [];
    for (const root of only) {
      const depth = root === "drums" ? 1 : root === "plugins" ? 2 : maxDepth;
      const before = all.length;
      await walkRoot(live, root, depth, (r) => all.push(r));
      console.error(`${root}: ${all.length - before} items`);
    }
    return all;
  });
  const old: BrowserRow[] = fs.existsSync(BROWSER_CACHE) ? JSON.parse(fs.readFileSync(BROWSER_CACHE, "utf8")) : [];
  rows = [...old.filter((r) => !(only as string[]).includes(r.root)), ...fresh];
  fs.mkdirSync(path.dirname(BROWSER_CACHE), { recursive: true });
  fs.writeFileSync(BROWSER_CACHE, JSON.stringify(rows, null, 1));
}

// Match catalog entries to a loadable browser item. Keys tried, in order:
//   exact name; vendor-folder + name ("FabFilter" + "Pro-Q 4"); name with a leading word dropped ("Nils' K1v" -> "K1v").
// Prefer the shallowest hit in a root matching the entry kind; packs match by folder name.
const byName = new Map<string, BrowserRow[]>();
const put = (k: string, r: BrowserRow) => {
  if (!k) return;
  if (!byName.has(k)) byName.set(k, []);
  if (!byName.get(k)!.includes(r)) byName.get(k)!.push(r);
};
for (const r of rows) {
  const n = norm(r.name);
  put(n, r);
  const vendor = r.path.length >= 2 ? r.path[r.path.length - 2] : "";
  if (vendor && !/^vst3?$/i.test(vendor)) put(norm(`${vendor} ${r.name}`), r);
  const words = n.split(" ");
  if (words.length > 1) put(words.slice(1).join(" "), r);
  put(n.replace(/ /g, ""), r); // "Speedrum Lite" vs "SpeedrumLite"
}
const lookup = (name: string) => byName.get(norm(name)) ?? byName.get(norm(name).replace(/ /g, "")) ?? [];
const kindRoots: Record<string, string[]> = {
  instrument: ["instruments", "drums", "plugins"],
  effect: ["audio_effects", "plugins"],
  "midi-effect": ["midi_effects", "plugins"],
  pack: ["packs"],
};

let linked = 0;
const unmatched: string[] = [];
for (const row of Object.values(loadIndex())) {
  const file = path.join(CATALOG, row.path);
  const e: Entry & { load?: unknown } = YAML.parse(fs.readFileSync(file, "utf8"));
  const cands = lookup(e.name)
    .filter((r) => kindRoots[e.kind]?.includes(r.root))
    .filter((r) => e.kind === "pack" || r.loadable)
    .sort((a, b) => a.path.length - b.path.length);
  const hit = cands[0];
  if (!hit) {
    unmatched.push(e.id);
    continue;
  }
  e.load = { root: hit.root, path: hit.path, uri: hit.uri };
  fs.writeFileSync(file, YAML.stringify(e));
  linked++;
}
print({ items: rows.length, linked, unmatched });

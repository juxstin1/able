// Search the cached Live browser (out/browser.json) for loadable presets, kits, samples.
// usage: tsx scripts/browser-find.ts "808 pure" [--root sounds|instruments|packs|drums] [--cat Bass] [--limit 20]
// Output rows are ready for live-load:  root:Seg/Seg/Seg
import { readCache } from "../lib/browser.js";
import { print } from "../lib/live.js";

const args = process.argv.slice(2);
const flag = (n: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);
const q = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--")).join(" ").toLowerCase();
const terms = q.split(/\s+/).filter(Boolean);
const root = flag("root");
const cat = flag("cat")?.toLowerCase();
const limit = Number(flag("limit") ?? 25);

const rows = readCache()
  .filter((r) => r.loadable && (!root || r.root === root) && (!cat || r.path.some((p) => p.toLowerCase() === cat)))
  .map((r) => {
    const hay = r.path.join(" ").toLowerCase();
    const score = terms.filter((t) => hay.includes(t)).length + (terms.every((t) => r.name.toLowerCase().includes(t)) ? 1 : 0);
    return { r, score };
  })
  .filter((x) => terms.length === 0 || x.score > 0)
  .sort((a, b) => b.score - a.score || a.r.path.length - b.r.path.length)
  .slice(0, limit)
  .map(({ r }) => `${r.root}:${r.path.join("/")}`);
print(rows);

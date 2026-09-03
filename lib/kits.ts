// Read Drum Rack presets (.adg = gzipped XML) straight off disk to learn which pad holds what.
// Live stores ReceivingNote as 128 - midi note.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { FACTORY_PACKS, LIVE_CORE, USER_LIBRARY, OUT } from "./paths.js";
import { DRUM } from "./midi.js";

export type Pads = Record<keyof typeof DRUM, number>;
const CACHE = path.join(OUT, "kits.json");

/** name -> absolute path, cached in out/kits.json. */
export function kitFiles(refresh = false): Record<string, string> {
  if (!refresh && fs.existsSync(CACHE)) return JSON.parse(fs.readFileSync(CACHE, "utf8"));
  const map: Record<string, string> = {};
  const walk = (dir: string, depth: number) => {
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (depth < 6 && !/^(Samples|Ableton (Folder|Project) Info)$/.test(e.name)) walk(p, depth + 1);
      } else if (/\.adg$/i.test(e.name) && !(e.name in map)) map[e.name] = p;
    }
  };
  walk(path.join(LIVE_CORE, "Drum Racks"), 0);
  walk(path.join(LIVE_CORE, "Racks", "Drum Racks"), 0);
  walk(FACTORY_PACKS, 0);
  walk(path.join(USER_LIBRARY, "Presets"), 0);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify(map, null, 1));
  return map;
}

/** [{note, name}] for every pad in the kit. */
export function kitPads(file: string): { note: number; name: string }[] {
  const xml = zlib.gunzipSync(fs.readFileSync(file)).toString("utf8");
  const out: { note: number; name: string }[] = [];
  for (const m of xml.matchAll(/<DrumBranchPreset[^>]*>([\s\S]*?)<\/DrumBranchPreset>/g)) {
    const blk = m[1];
    const rn = /<ReceivingNote Value="(\d+)"/.exec(blk);
    const nm = /<(?:UserName|Name)[^>]*Value="([^"]{2,})"/.exec(blk);
    if (rn) out.push({ note: 128 - Number(rn[1]), name: nm?.[1] ?? "" });
  }
  return out.sort((a, b) => a.note - b.note);
}

const ROLE: [keyof typeof DRUM, RegExp][] = [
  ["kick", /kick|bd\b|808 ?(?!.*(hat|snare|clap))/i],
  ["snare", /snare|sd\b/i],
  ["clap", /clap/i],
  ["ohat", /open|oh\b|hat.*open/i],
  ["chat", /closed|hihat|hi-?hat|hat|ch\b/i],
  ["ride", /ride/i],
  ["crash", /crash|cymbal/i],
  ["rim", /rim|stick/i],
  ["tom", /tom/i],
  ["perc", /perc|shaker|tamb|conga|bongo|cowbell|block/i],
];

/** Role -> note for a kit, falling back to the GM-style map for roles the kit lacks. */
export function padsFor(kitName: string): { pads: Pads; missing: string[]; file?: string } {
  const file = kitFiles()[kitName] ?? kitFiles(true)[kitName];
  if (!file) return { pads: { ...DRUM }, missing: ["kit file not found; using GM map"] };
  const pads = kitPads(file);
  const out = { ...DRUM } as Pads;
  const missing: string[] = [];
  const used = new Set<number>();
  for (const [role, re] of ROLE) {
    const hit = pads.find((p) => re.test(p.name) && !used.has(p.note));
    if (hit) {
      out[role] = hit.note;
      used.add(hit.note);
    } else missing.push(role);
  }
  // no open hat? use the ride as the offbeat voice; no ride either? second closed hat velocity does the job
  if (missing.includes("ohat") && !missing.includes("ride")) out.ohat = out.ride;
  return { pads: out, missing, file };
}

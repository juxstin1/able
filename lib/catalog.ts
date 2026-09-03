import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { CATALOG } from "./paths.js";

export type Kind = "instrument" | "effect" | "midi-effect" | "pack";
export type Format = "native" | "vst3" | "vst2" | "m4l" | "pack";
export interface Entry {
  id: string;
  kind: Kind;
  format: Format;
  name: string;
  tags: string[];
  good_for: string;
  avoid: string;
  key_params: string[];
  presets: string[];
  notes: string;
  source?: string;
  unclassified?: boolean;
}
export const KIND_DIR: Record<Kind, string> = {
  instrument: "instruments",
  effect: "effects",
  "midi-effect": "midi-effects",
  pack: "packs",
};

export function stub(p: Partial<Entry> & Pick<Entry, "id" | "kind" | "format" | "name">): Entry {
  return { tags: [], good_for: "", avoid: "", key_params: [], presets: [], notes: "", ...p };
}

export function loadIndex(): Record<string, Entry & { path: string }> {
  return YAML.parse(fs.readFileSync(path.join(CATALOG, "index.yaml"), "utf8"));
}

export function loadEntry(id: string): Entry {
  const rel = loadIndex()[id]?.path;
  if (!rel) throw new Error(`no catalog entry "${id}"`);
  return YAML.parse(fs.readFileSync(path.join(CATALOG, rel), "utf8"));
}

/** Text/tag search over the index. */
export function find(query: string, kind?: Kind) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return Object.values(loadIndex())
    .filter((e) => !kind || e.kind === kind)
    .map((e) => {
      const hay = [e.id, e.name, ...(e.tags ?? []), e.good_for ?? ""].join(" ").toLowerCase();
      return { e, score: terms.filter((t) => hay.includes(t)).length };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ e }) => ({ id: e.id, kind: e.kind, format: e.format, name: e.name, tags: e.tags, good_for: e.good_for }));
}

// Refresh catalog stubs + index.yaml. Never overwrites an entry that already exists on disk.
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { CATALOG, LIVE_CORE, FACTORY_PACKS, VST3_DIRS, VST2_DIRS } from "../lib/paths.js";
import { stub, KIND_DIR, type Entry, type Kind, type Format } from "../lib/catalog.js";
import { print } from "../lib/live.js";

const KNOWN_INSTRUMENTS = [/^surge xt$/i, /^fabfilter (one|twin)/i, /^k1v/i, /^speedrum/i, /^drumtraqs/i];
const slug = (s: string) =>
  s.toLowerCase().replace(/\.(vst3|dll)$/i, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const clean = (s: string) => s.replace(/\.(vst3|dll)$/i, "").replace(/_x64$/i, "");
const ls = (dir: string) => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
};

function plugin(file: string, format: Format, source: string): Entry {
  const name = clean(file);
  const isInst = KNOWN_INSTRUMENTS.some((r) => r.test(name));
  const isComponent = /^(nectar|neutron|ozone) \d+ .+/i.test(name);
  const e = stub({ id: slug(name), kind: isInst ? "instrument" : "effect", format, name, source });
  if (isComponent) e.tags.push("component");
  if (!isInst && !isComponent) e.unclassified = true;
  return e;
}

const found: Entry[] = [];
const native: [string, Kind][] = [
  ["Instruments", "instrument"],
  ["Audio Effects", "effect"],
  ["MIDI Effects", "midi-effect"],
];
for (const [folder, kind] of native)
  for (const d of ls(path.join(LIVE_CORE, "Devices", folder)))
    if (d.isDirectory() && !d.name.startsWith("Ableton Folder") && d.name !== "Legacy")
      found.push(stub({ id: slug(d.name), kind, format: "native", name: d.name, source: "core-library" }));
found.push(stub({ id: "drum-rack", kind: "instrument", format: "native", name: "Drum Rack", source: "core-library" }));
found.push(stub({ id: "instrument-rack", kind: "instrument", format: "native", name: "Instrument Rack", source: "core-library" }));

for (const root of VST3_DIRS) {
  const walk = (dir: string, depth: number) => {
    for (const d of ls(dir)) {
      const full = path.join(dir, d.name);
      if (/\.vst3$/i.test(d.name)) found.push(plugin(d.name, "vst3", full));
      else if (d.isDirectory() && depth < 1) walk(full, depth + 1);
    }
  };
  walk(root, 0);
}
for (const root of VST2_DIRS)
  for (const d of ls(root)) {
    if (/\.dll$/i.test(d.name) && !/^iZ/.test(d.name)) found.push(plugin(d.name, "vst2", path.join(root, d.name)));
    else if (d.isDirectory())
      for (const f of ls(path.join(root, d.name)))
        if (/\.dll$/i.test(f.name)) found.push(plugin(f.name, "vst2", path.join(root, d.name, f.name)));
  }
for (const d of ls(FACTORY_PACKS))
  if (d.isDirectory())
    found.push(
      stub({ id: `pack-${slug(d.name)}`, kind: "pack", format: "pack", name: d.name, source: path.join(FACTORY_PACKS, d.name) }),
    );

const seen = new Map<string, Entry>();
for (const e of found) if (!seen.has(e.id)) seen.set(e.id, e);

let created = 0;
let kept = 0;
const index: Record<string, unknown> = {};
for (const e of seen.values()) {
  const rel = `${KIND_DIR[e.kind]}/${e.id}.yaml`;
  const file = path.join(CATALOG, rel);
  let final = e;
  if (fs.existsSync(file)) {
    final = YAML.parse(fs.readFileSync(file, "utf8"));
    kept++;
  } else {
    fs.writeFileSync(file, YAML.stringify(e));
    created++;
  }
  index[e.id] = {
    path: rel,
    id: e.id,
    kind: final.kind,
    format: final.format,
    name: final.name,
    tags: final.tags ?? [],
    good_for: final.good_for ?? "",
  };
}
fs.writeFileSync(path.join(CATALOG, "index.yaml"), YAML.stringify(index));
print({ created, kept, total: seen.size });

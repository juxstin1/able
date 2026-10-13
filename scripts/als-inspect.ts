// What is in a saved set, read off disk - Live does not need to be running. Tempo, time signature,
// scale, locators, and per track: top-level device chain, plugins (anywhere, racks included),
// Session + Arrangement clips with note counts / sample names. Counterpart to set-inventory.ts,
// which asks the open set. Good for "which VSTs does this project need" before opening it.
// usage: node_modules/.bin/tsx scripts/als-inspect.ts <set.als ...> [--json]
import fs from "node:fs";
import zlib from "node:zlib";

// ---- a small XML tree: Live sets are attribute-only (<Tag Value="x" />), no text content worth keeping.
interface El {
  tag: string;
  attrs: string;
  parent?: El;
  kids: El[];
}
function parse(xml: string): El {
  const root: El = { tag: "#root", attrs: "", kids: [] };
  let cur = root;
  for (const m of xml.matchAll(/<(\/?)([A-Za-z_][\w.-]*)((?:[^>"]|"[^"]*")*?)(\/?)>/g)) {
    const [, close, tag, attrs, selfClose] = m;
    if (close) {
      cur = cur.parent ?? root;
      continue;
    }
    const el: El = { tag, attrs, parent: cur, kids: [] };
    cur.kids.push(el);
    if (!selfClose) cur = el;
  }
  return root;
}
const attr = (e: El | undefined, name: string) => (e ? new RegExp(`\\b${name}="([^"]*)"`).exec(e.attrs)?.[1] : undefined);
const kid = (e: El | undefined, tag: string) => e?.kids.find((k) => k.tag === tag);
const val = (e: El | undefined, tag: string) => attr(kid(e, tag), "Value");
const num = (e: El | undefined, tag: string) => Number(val(e, tag) ?? 0);
function* walk(e: El): Generator<El> {
  for (const k of e.kids) {
    yield k;
    yield* walk(k);
  }
}
const first = (e: El, tag: string) => {
  for (const d of walk(e)) if (d.tag === tag) return d;
};

// ---- set structure
const TRACKS = new Set(["MidiTrack", "AudioTrack", "GroupTrack", "ReturnTrack", "MainTrack", "MasterTrack"]);
const NOTE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
/** Live stores the time signature as one enum: (numerator - 1) + 99 * log2(denominator). 201 = 4/4. */
const timeSig = (v: number) => `${(v % 99) + 1}/${2 ** Math.floor(v / 99)}`;

/** PluginDesc/<Vst3|Vst|Au>PluginInfo -> "Surge XT (VST3)". The name is a direct child of the
 *  *PluginInfo node (VST2: PlugName), after a preset blob that has its own <Name>, so search shallow. */
function plugin(desc: El | undefined) {
  const info = desc?.kids[0];
  const kind = info?.tag.replace(/PluginInfo$/, "");
  if (!info || kind === info.tag) return undefined;
  const fmt = ({ Vst: "VST2", Vst3: "VST3", Au: "AU" } as Record<string, string>)[kind!] ?? kind;
  return { name: val(info, "Name") ?? val(info, "PlugName") ?? "?", fmt };
}

function device(d: El) {
  const user = val(d, "UserName");
  const name = user || plugin(kid(d, "PluginDesc"))?.name;
  return name ? `${d.tag}: ${name}` : d.tag;
}

function clip(c: El, track: El) {
  // Classify by the nearest container under the track. Take-lane clips are alternate takes - skipped.
  let loc: "session" | "arrangement" | undefined;
  let scene: number | undefined;
  let prev = c;
  for (let a = c.parent; a && a !== track; prev = a, a = a.parent) {
    if (a.tag === "ArrangerAutomation") loc = "arrangement";
    else if (a.tag === "ClipSlotList") {
      loc = "session";
      scene = a.kids.filter((k) => k.tag === "ClipSlot").indexOf(prev) + 1;
    } else if (a.tag === "TakeLanes") return undefined;
    if (loc) break;
  }
  if (!loc) return undefined;
  const midi = c.tag === "MidiClip";
  let notes = 0;
  let sample: string | undefined;
  for (const d of walk(c)) {
    if (d.tag === "MidiNoteEvent") notes++;
    if (!sample && d.tag === "Path") sample = attr(d, "Value")?.split(/[\\/]/).pop();
  }
  return {
    kind: midi ? "midi" : "audio", loc, ...(scene ? { scene } : {}),
    name: val(c, "Name") ?? "", start: num(c, "CurrentStart"), end: num(c, "CurrentEnd"),
    notes: midi ? notes : undefined,
    sample: midi ? undefined : sample,
  };
}

function track(t: El) {
  const name = val(kid(t, "Name"), "EffectiveName") ?? "";
  // The first <Devices> in document order is the track's own chain; rack chains (drum pads)
  // nest inside it, so they don't flood the list.
  const devices = (first(t, "Devices")?.kids ?? []).map(device);
  const plugins = new Set<string>();
  const clips = [];
  for (const d of walk(t)) {
    if (d.tag === "PluginDesc") {
      const p = plugin(d);
      if (p) plugins.add(`${p.name} (${p.fmt})`);
    }
    if (d.tag === "MidiClip" || d.tag === "AudioClip") {
      const c = clip(d, t);
      if (c) clips.push(c);
    }
  }
  return { kind: t.tag, name, devices, plugins: [...plugins], clips };
}

function inspect(file: string) {
  const raw = fs.readFileSync(file);
  const xml = (raw[0] === 0x1f && raw[1] === 0x8b ? zlib.gunzipSync(raw) : raw).toString("utf8");
  const doc = parse(xml);
  const ableton = kid(doc, "Ableton")!;
  const set = kid(ableton, "LiveSet")!;
  const main = set.kids.find((k) => k.tag === "MainTrack" || k.tag === "MasterTrack");
  const manual = (param: string) => {
    const p = main && first(main, param);
    return p ? Number(val(p, "Manual")) : undefined;
  };
  const ts = manual("TimeSignature");
  const sc = kid(set, "ScaleInformation");
  const scaleIdx = val(sc, "Name");
  const tracks = [...(kid(set, "Tracks")?.kids ?? []), ...(main ? [main] : [])].filter((t) => TRACKS.has(t.tag));
  return {
    file,
    creator: attr(ableton, "Creator"),
    tempo: manual("Tempo"),
    timeSignature: ts === undefined ? undefined : timeSig(ts),
    // Name is an index into Live's scale list; only Major/Minor are mapped rather than guessing the rest.
    scale: sc && {
      root: NOTE[num(sc, "Root") % 12],
      name: scaleIdx === "0" ? "Major" : scaleIdx === "1" ? "Minor" : `scale #${scaleIdx}`,
      on: val(set, "InKey") === "true",
    },
    locators: (kid(kid(set, "Locators"), "Locators")?.kids ?? []).map((l) => ({ beat: num(l, "Time"), name: val(l, "Name") })),
    tracks: tracks.map(track),
  };
}

function text(r: ReturnType<typeof inspect>) {
  const head = [r.tempo && `${r.tempo} BPM`, r.timeSignature, r.scale && `${r.scale.root} ${r.scale.name}${r.scale.on ? "" : " (scale off)"}`, `${r.tracks.length} tracks`];
  console.log(`${r.file} - ${r.creator}\n  ${head.filter(Boolean).join(" · ")}`);
  for (const l of r.locators) console.log(`  locator bar ${l.beat / 4 + 1}: ${l.name}`);
  for (const t of r.tracks) {
    console.log(`  [${t.kind.replace("Track", "")}] ${t.name}${t.devices.length ? `  ${t.devices.join(" > ")}` : ""}`);
    if (t.plugins.length) console.log(`      plugins: ${t.plugins.join(", ")}`);
    for (const c of t.clips.slice(0, 6)) {
      const at = c.loc === "session" ? `scene ${c.scene}` : `bar ${c.start / 4 + 1}`;
      const what = c.kind === "midi" ? `${c.notes} notes` : c.sample;
      console.log(`      ${c.kind} ${at}: ${c.name || "(unnamed)"}, ${(c.end - c.start) / 4} bars, ${what}`);
    }
    if (t.clips.length > 6) console.log(`      ... ${t.clips.length - 6} more clips`);
  }
}

const args = process.argv.slice(2);
const files = args.filter((a) => a !== "--json");
if (!files.length) {
  console.error("usage: als-inspect.ts <set.als ...> [--json]");
  process.exit(2);
}
const reports = files.map(inspect);
if (args.includes("--json")) console.log(JSON.stringify(reports.length === 1 ? reports[0] : reports, null, 2));
else reports.forEach(text);

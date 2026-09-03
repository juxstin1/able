// Seed knowledge into catalog entries. Only fills fields that are still empty, so hand edits win.
// Re-runnable. Add to SEED as knowledge grows; run after catalog-scan.
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { CATALOG } from "../lib/paths.js";
import { loadIndex, type Entry } from "../lib/catalog.js";
import { print } from "../lib/live.js";

type Seed = Partial<Pick<Entry, "tags" | "good_for" | "avoid" | "key_params" | "notes" | "kind">>;

const SEED: Record<string, Seed> = {
  // ---- native instruments
  "drum-rack": {
    tags: ["drums", "sampler", "kit", "one-shots", "trap", "hip-hop", "house", "core"],
    good_for: "any sampled drum kit; 128 pads, per-pad chains, choke groups for open/closed hats",
    avoid: "melodic parts (use Simpler/Sampler)",
    key_params: ["pad chains", "choke group", "per-pad pitch", "per-pad send"],
    notes: "Pads map C1=36 kick, D1=38 snare, F#1=42 closed hat, A#1=46 open hat in GM-style kits. Factory kits from Drum Booth / Drum Essentials / Trap Drums / Golden Era load straight in.",
  },
  operator: {
    tags: ["fm", "synth", "bass", "808", "bells", "plucks", "keys", "core"],
    good_for: "808 sub bass (single sine osc + pitch env), FM bells and plucks, clean sine subs",
    avoid: "lush pads (Wavetable is easier)",
    key_params: ["osc A-D level", "algorithm", "pitch envelope", "filter", "feedback"],
    notes: "Classic 808: Osc A sine, pitch env +24 st decaying over 60-120 ms, long amp decay, slight Saturator after.",
  },
  wavetable: {
    tags: ["wavetable", "synth", "pads", "leads", "bass", "reese", "modern", "core"],
    good_for: "wide pads, growl/reese bass via unison + wavetable position, modern leads",
    avoid: "faithful analog emulation (use Analog or Drift)",
    key_params: ["wavetable position", "unison", "sub osc", "filter 1/2", "mod matrix"],
    notes: "Two oscillators + sub. Unison Classic 4 voices with detune ~20% for width.",
  },
  drift: {
    tags: ["analog", "synth", "bass", "leads", "keys", "warm", "simple", "core"],
    good_for: "fast warm analog bass and leads with minimal menu diving; MPE-ready",
    avoid: "complex modulation or FM",
    key_params: ["shape", "filter cutoff", "drive", "env 2 amount", "voice mode"],
  },
  analog: {
    tags: ["analog", "synth", "bass", "leads", "pads", "vintage", "core"],
    good_for: "vintage analog basses, brass-style leads, detuned 2-osc pads",
    key_params: ["osc shape", "filter type", "filter env", "LFO"],
  },
  meld: {
    tags: ["synth", "macro", "experimental", "bass", "textures", "mpe", "core"],
    good_for: "two-engine bipolar synth for unusual textures, moving basses, MPE leads",
    key_params: ["engine A/B", "mod matrix", "macros"],
  },
  simpler: {
    tags: ["sampler", "one-shot", "slice", "loops", "vocal chops", "core"],
    good_for: "one-shot playback, loop slicing to MIDI, quick chops; Warp modes for tempo lock",
    avoid: "multi-sample instruments (use Sampler)",
    key_params: ["mode classic/one-shot/slice", "warp", "filter", "amp env"],
  },
  sampler: {
    tags: ["sampler", "multisample", "keys", "orchestral", "core"],
    good_for: "multi-sampled instruments with key zones and velocity layers",
    key_params: ["zones", "filter", "mod matrix", "lfo"],
  },
  "surge-xt": {
    tags: ["synth", "hybrid", "wavetable", "fm", "bass", "leads", "pads", "free", "deep"],
    good_for: "anything; huge preset bank, 3 osc per scene, great for aggressive bass and lush pads",
    avoid: "when a quick native device would do; parameter names are not exposed cleanly to the Live API",
    key_params: ["scene A/B", "osc type", "filter 1/2", "fx chains"],
  },
  // ---- native effects
  saturator: {
    tags: ["saturation", "distortion", "warmth", "drive", "bass", "drums", "core"],
    good_for: "adding harmonics to 808s so they read on small speakers; gentle drive on drums",
    key_params: ["drive", "curve type", "color", "soft clip"],
  },
  "drum-buss": {
    tags: ["drums", "bus", "transient", "saturation", "boom", "glue", "core"],
    good_for: "drum bus glue; Boom for extra sub on kick, Crunch for grit, Transients for punch",
    key_params: ["drive", "crunch", "transients", "boom freq/amount", "damp"],
  },
  roar: {
    tags: ["distortion", "saturation", "multiband", "feedback", "aggressive", "core"],
    good_for: "aggressive multi-stage distortion with routing; big bass and lead colour",
    avoid: "subtle warmth (use Saturator or Saturn)",
    key_params: ["stage routing", "shaper type", "color", "feedback", "mix"],
  },
  "glue-compressor": {
    tags: ["compressor", "bus", "glue", "ssl", "master", "drums", "core"],
    good_for: "SSL-style bus glue on drums or master; 2:1, slow attack, auto release",
    key_params: ["threshold", "ratio", "attack", "release", "makeup", "range"],
  },
  compressor: {
    tags: ["compressor", "sidechain", "ducking", "dynamics", "core"],
    good_for: "sidechain ducking (bass under kick), per-track dynamics",
    key_params: ["threshold", "ratio", "attack", "release", "sidechain input"],
  },
  "eq-eight": {
    tags: ["eq", "surgical", "highpass", "mix", "core"],
    good_for: "surgical cuts, high-pass everything that is not bass, mid/side mode",
    key_params: ["8 bands", "filter type", "mode L/R M/S"],
  },
  echo: {
    tags: ["delay", "tape", "dub", "modulation", "core"],
    good_for: "dub and tape delays with filter and modulation; ping-pong; reverb tail built in",
    key_params: ["L/R time", "feedback", "filter", "modulation", "reverb"],
  },
  "hybrid-reverb": {
    tags: ["reverb", "convolution", "algorithmic", "space", "core"],
    good_for: "convolution + algorithmic blend; rooms, halls, shimmer; per-band EQ on tail",
    key_params: ["IR", "algorithm", "blend", "decay", "size", "eq"],
  },
  "auto-filter": {
    tags: ["filter", "sweep", "lfo", "envelope", "sidechain", "core"],
    good_for: "filter sweeps on builds, envelope-followed wah, sidechained filter ducking",
    key_params: ["cutoff", "resonance", "filter type", "lfo amount", "envelope"],
  },
  // ---- midi effects
  arpeggiator: {
    tags: ["arp", "midi", "sequencer", "plucks", "core"],
    good_for: "instant movement from held chords; rate 1/16 with gate ~50%",
    key_params: ["style", "rate", "gate", "steps", "distance"],
  },
  scale: {
    tags: ["midi", "key", "quantize", "core"],
    good_for: "forcing generated notes into the track key",
    key_params: ["base", "scale"],
  },
  // ---- FabFilter
  "fabfilter-pro-q-4": {
    tags: ["eq", "surgical", "dynamic-eq", "linear-phase", "mix", "master"],
    good_for: "the default EQ for everything; dynamic bands, spectrum grab, mid/side",
    key_params: ["bands", "dynamic range", "phase mode"],
  },
  "fabfilter-pro-c-2": {
    tags: ["compressor", "sidechain", "bus", "vocal", "mix"],
    good_for: "transparent or characterful compression; styles Clean/Vocal/Punch/Pumping/Bus/Mastering",
    key_params: ["style", "threshold", "ratio", "attack", "release", "sidechain"],
  },
  "fabfilter-pro-l-2": {
    tags: ["limiter", "master", "loudness", "true-peak"],
    good_for: "final limiter; Modern or Aggressive style for electronic",
    key_params: ["gain", "style", "lookahead", "oversampling", "true peak"],
  },
  "fabfilter-saturn-2": {
    tags: ["saturation", "multiband", "warmth", "distortion", "tape", "tube", "mix", "master"],
    good_for: "multiband saturation; warm bass low band while keeping highs clean; parallel warmth on a bus",
    avoid: "already-clipped material",
    key_params: ["drive", "mix", "dynamics", "band crossover", "style"],
  },
  "fabfilter-pro-r-2": {
    tags: ["reverb", "algorithmic", "space", "vocal", "mix"],
    good_for: "natural reverb with decay-rate EQ; vocals, snares, plates",
    key_params: ["space", "decay rate", "brightness", "distance", "mix"],
  },
  "fabfilter-pro-mb": {
    tags: ["multiband", "compressor", "dynamics", "master", "bass"],
    good_for: "taming low end or harsh highs without touching the rest",
    key_params: ["bands", "threshold", "range", "attack", "release"],
  },
  "fabfilter-timeless-3": {
    tags: ["delay", "modulation", "creative", "tape"],
    good_for: "creative delays with modulated filters and drive",
    key_params: ["time", "feedback", "filters", "mod"],
  },
  // ---- iZotope / others
  "ozone-12": {
    tags: ["mastering", "master", "limiter", "eq", "imager", "ai-assist"],
    good_for: "mastering chain on the master track; Master Assistant for a starting point",
    avoid: "individual tracks",
    key_params: ["modules", "maximizer threshold", "imager width"],
  },
  "neutron-5": {
    tags: ["mixing", "channel-strip", "eq", "compressor", "unmask", "ai-assist"],
    good_for: "per-track channel strip; Unmask to carve space between bass and kick",
    key_params: ["modules", "unmask", "sculptor"],
  },
  "nectar-4": {
    tags: ["vocal", "channel-strip", "pitch", "de-ess", "harmony"],
    good_for: "vocal chain in one device; pitch correction, breath control, backing voices",
    avoid: "non-vocal sources",
  },
  valhallasupermassive: {
    tags: ["reverb", "delay", "ambient", "huge", "free", "pads"],
    good_for: "enormous washes and clouds on pads and vocals; delay-into-reverb modes",
    avoid: "tight drum rooms",
    key_params: ["mode", "delay", "feedback", "density", "mix"],
  },
  "tdr-nova": {
    tags: ["dynamic-eq", "eq", "free", "mix"],
    good_for: "dynamic EQ when Pro-Q is overkill",
  },
  chowtapemodel: {
    tags: ["tape", "saturation", "wow-flutter", "lo-fi", "free"],
    good_for: "physical tape saturation and wobble; lo-fi hip-hop texture",
  },
  paulxstretch: {
    tags: ["stretch", "ambient", "textures", "granular", "free"],
    good_for: "extreme time-stretching any sample into a pad or drone",
    avoid: "rhythmic material",
  },
  "neutone-morpho": {
    tags: ["ai", "tone-transfer", "experimental", "textures"],
    good_for: "neural tone transfer; turn a hum into a violin, drums into a voice",
  },
  // ---- packs
  "pack-trap-drums-by-sound-oracle": { tags: ["trap", "drums", "808", "hats", "kits"], good_for: "trap kits, 808s, hi-hat one-shots" },
  "pack-golden-era-hip-hop-drums-by-sound-oracle": { tags: ["hip-hop", "boom-bap", "drums", "dusty", "kits"], good_for: "90s boom-bap kits and breaks" },
  "pack-drum-booth": { tags: ["acoustic", "drums", "live", "kits"], good_for: "acoustic drum kits recorded in a room" },
  "pack-drum-essentials": { tags: ["drums", "electronic", "kits", "house", "techno"], good_for: "general electronic kits across genres" },
  "pack-synth-essentials": { tags: ["synth", "presets", "bass", "leads", "pads"], good_for: "curated native synth presets by role" },
  "pack-electric-keyboards": { tags: ["keys", "rhodes", "wurlitzer", "clav", "sampled"], good_for: "sampled electric pianos and clav" },
  "pack-upright-piano-by-spitfire-audio": { tags: ["piano", "upright", "sampled", "intimate"], good_for: "intimate felt-style upright piano" },
  "pack-orchestral-strings": { tags: ["strings", "orchestral", "sampled", "cinematic"], good_for: "string sections and solo strings" },
  "pack-orchestral-brass": { tags: ["brass", "orchestral", "sampled", "cinematic"], good_for: "brass sections" },
  "pack-granulator-iii": { tags: ["granular", "m4l", "textures", "pads"], good_for: "granular pads and textures from any sample" },
  "pack-sequencers": { tags: ["m4l", "sequencer", "midi", "generative"], good_for: "step and generative MIDI sequencers" },
  "pack-build-and-drop": { tags: ["edm", "build", "risers", "drop", "fx"], good_for: "riser and drop effect racks" },
  "pack-chop-and-swing": { tags: ["hip-hop", "chop", "swing", "sampling", "lo-fi"], good_for: "sample-chopping racks and swung grooves" },
  "pack-drive-and-glow": { tags: ["saturation", "racks", "warmth", "distortion"], good_for: "saturation and warmth effect racks" },
  "pack-punch-and-tilt": { tags: ["drums", "racks", "transient", "eq"], good_for: "drum-shaping effect racks" },
};

const index = loadIndex();
let filled = 0;
const missing: string[] = [];
for (const [id, seed] of Object.entries(SEED)) {
  const row = index[id];
  if (!row) {
    missing.push(id);
    continue;
  }
  const file = path.join(CATALOG, row.path);
  const e: Entry = YAML.parse(fs.readFileSync(file, "utf8"));
  let touched = false;
  for (const [k, v] of Object.entries(seed) as [keyof Seed, unknown][]) {
    const cur = e[k] as unknown;
    const empty = cur === "" || cur === undefined || (Array.isArray(cur) && cur.length === 0);
    if (empty) {
      (e as unknown as Record<string, unknown>)[k] = v;
      touched = true;
    }
  }
  if (e.unclassified) {
    delete e.unclassified;
    touched = true;
  }
  if (touched) {
    fs.writeFileSync(file, YAML.stringify(e));
    filled++;
  }
}
print({ filled, missing });

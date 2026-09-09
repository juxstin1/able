// Build a "bank" of alternatives for one slot (kick, lead, bass...): one track per option, each
// loaded with its own device/kit, all holding the same short arrangement clip, muted except the
// first. Solo through tracks in Live to compare - this is the reusable "hop in and audition" rig,
// not a one-off. usage:
//   node_modules/.bin/tsx scripts/sound-bank.ts kick   [--start 1]
//   node_modules/.bin/tsx scripts/sound-bank.ts <bank> [--start N]   (banks defined below)
import { withLive, print } from "../lib/live.js";
import { loadOnTrack, type Root } from "../lib/browser.js";
import { replaceArrangementClip } from "../lib/midi.js";
import { getOrCreateTrack, setParams } from "../lib/song.js";
import { padsFor } from "../lib/kits.js";
import { swing, pitch, type Note } from "../lib/midi.js";

interface BankItem {
  label: string;
  kit?: string; // drums root, filename only
  path?: string[]; // full browser path e.g. ["Analog", "Synth Lead", "Clubber Lead.adg"]
  root?: Root; // root for `path` items - defaults to the bank's root (instruments); one-shots live under "sounds" or "drums"
  params?: Record<string, number>;
  notes?: Note[]; // override the bank's default phrase, e.g. re-auditioning a lead an octave down as a bass
  effects?: string[][]; // audio_effects root, full paths, loaded onto the track after the instrument - one link in a chain
}

type Hit = { time: number; duration: number; velocity: number }; // a rhythm shape, pitch filled in per kit pad

// Short motif for auditioning melodic presets - root, b3, 4th, 5th over one bar.
const motif = (root: number): Note[] => [root, root + 3, root + 5, root + 7].map((pitch, time) => ({ pitch, time, duration: 0.9, velocity: 100 }));
const MOTIF = motif(60); // lead register (C4)
const BASS_MOTIF = motif(36); // bass register (C2)
// One long hit filling the clip - for one-shots (risers, impacts) that aren't meant to be played melodically.
const oneShot = (beats: number): Note[] => [{ pitch: 60, time: 0, duration: beats, velocity: 100 }];
// A held triad, for pad presets - the point is the chord/harmony, not a melodic line.
const chordHold = (beats: number): Note[] => [0, 3, 7].map((iv) => ({ pitch: 60 + iv, time: 0, duration: beats, velocity: 95 }));
// Two short stabs with a long gap - for judging a reverb/delay tail, which needs silence to be heard in.
const SPACE_TEST: Note[] = [
  { pitch: 64, time: 0, duration: 0.3, velocity: 105 },
  { pitch: 67, time: 4, duration: 0.3, velocity: 100 },
];
// Straight quarters - the kick-bank default rhythm.
const QUARTERS: Hit[] = [0, 1, 2, 3].map((time) => ({ time, duration: 0.9, velocity: 110 }));
// Backbeat on 2 & 4 - claps/snares/rims.
const BACKBEAT: Hit[] = [1, 3].map((time) => ({ time, duration: 0.9, velocity: 110 }));
// Swung 8ths at .62 - matches the UKG swing amount in lib/styles.ts, for hats/shakers judged on groove not tone.
const swungHitsAt = (amount: number): Hit[] =>
  swing(
    [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((time, i) => ({ pitch: 0, time, duration: 0.2, velocity: i % 2 === 0 ? 105 : 75 })),
    amount,
  ).map(({ time, duration, velocity }) => ({ time, duration, velocity }));
const SWUNG_HATS = swungHitsAt(0.62);
const SWUNG_ONE_SHOT: Note[] = SWUNG_HATS.map((h) => ({ pitch: 60, ...h }));

// Same 10 kits used across kick/hat/clap/snare/rim banks - apples-to-apples per role, and it means
// a full kit picture (not just the kick) accumulates for every kit he's already judged.
const KIT_LIST: BankItem[] = [
  { label: "909 Core", kit: "909 Core Kit.adg" },
  { label: "707 Core", kit: "707 Core Kit.adg" },
  { label: "606 Core", kit: "606 Core Kit.adg" },
  { label: "808 Core", kit: "808 Core Kit.adg" },
  { label: "505 Core", kit: "505 Core Kit.adg" },
  { label: "909 Flavour", kit: "909 Flavour Kit.adg" },
  { label: "AG Techno", kit: "AG Techno Kit.adg" },
  { label: "Garage", kit: "Garage Kit.adg" },
  { label: "Big Room", kit: "Big Room Kit.adg" },
  { label: "707 Funky Beans", kit: "707 Funky Beans Kit.adg" },
];

const BANKS: Record<
  string,
  {
    root: "drums" | "instruments";
    role?: keyof ReturnType<typeof padsFor>["pads"];
    rhythm?: Hit[]; // kit-role banks only - defaults to QUARTERS
    baseNotes?: Note[];
    oneShot?: boolean;
    bars?: number;
    items: BankItem[];
  }
> = {
  kick: {
    root: "drums",
    role: "kick",
    items: KIT_LIST,
  },
  hats: {
    root: "drums",
    role: "chat",
    rhythm: SWUNG_HATS,
    items: KIT_LIST,
  },
  claps: {
    root: "drums",
    role: "clap",
    rhythm: BACKBEAT,
    items: KIT_LIST,
  },
  snares: {
    root: "drums",
    role: "snare",
    rhythm: BACKBEAT,
    items: KIT_LIST,
  },
  rims: {
    root: "drums",
    role: "rim",
    rhythm: BACKBEAT,
    items: KIT_LIST,
  },
  shakers: {
    root: "instruments",
    oneShot: true,
    baseNotes: SWUNG_ONE_SHOT,
    items: [
      { label: "A-Shaker 1 (drum hit)", path: ["Drum Hits", "Shaker", "A-Shaker 1.aif"], root: "drums" },
      { label: "Cabasa Mid Short (drum hit)", path: ["Drum Hits", "Shaker", "Cabasa Mid Short.aif"], root: "drums" },
      { label: "Shake Deep Fried (drum hit)", path: ["Drum Hits", "Shaker", "Shake Deep Fried.wav"], root: "drums" },
      { label: "Shaker 1b (drum hit)", path: ["Drum Hits", "Shaker", "SHAKER 1b.adv"], root: "drums" },
      { label: "Shaker Acoustic 2 (drum hit)", path: ["Drum Hits", "Shaker", "Shaker Acoustic 2.aif"], root: "drums" },
      { label: "Shaker Burned (drum hit)", path: ["Drum Hits", "Shaker", "Shaker Burned.aif"], root: "drums" },
      { label: "Shaker Electrified 06 (drum hit)", path: ["Drum Hits", "Shaker", "Shaker Electrified 06.aif"], root: "drums" },
      { label: "Shaker Live Vinyl (drum hit)", path: ["Drum Hits", "Shaker", "Shaker Live Vinyl.wav"], root: "drums" },
      { label: "Shaker Rattle SP (drum hit)", path: ["Drum Hits", "Shaker", "Shaker Rattle SP.wav"], root: "drums" },
      { label: "Shaker Tambo Layer (drum hit)", path: ["Drum Hits", "Shaker", "Shaker Tambo Layer.aif"], root: "drums" },
    ],
  },
  "snare-rolls": {
    // Real recorded rolls, not a generated fill technique - different texture than fill-bank.ts.
    root: "instruments",
    oneShot: true,
    bars: 2,
    items: [
      { label: "Snare Roll (drum hit)", path: ["Drum Hits", "Snare", "Snare Roll.aif"], root: "drums" },
      { label: "Snare Roll Taka (drum hit)", path: ["Drum Hits", "Snare", "Snare Roll Taka.wav"], root: "drums" },
      { label: "Snare Roll Taka Natural (drum hit)", path: ["Drum Hits", "Snare", "Snare Roll Taka Natural.wav"], root: "drums" },
      { label: "Snare Roll Plymouth (drum hit)", path: ["Drum Hits", "Snare", "Snare Roll Plymouth.wav"], root: "drums" },
      { label: "Snare Nat Roll (drum hit)", path: ["Drum Hits", "Snare", "Snare Nat Roll.aif"], root: "drums" },
      { label: "Snare Rolling (drum hit)", path: ["Drum Hits", "Snare", "Snare Rolling.wav"], root: "drums" },
      { label: "Snare Lot Roll (drum hit)", path: ["Drum Hits", "Snare", "Snare Lot Roll.wav"], root: "drums" },
      { label: "Perc Short Snare Roll (drum hit)", path: ["Drum Hits", "Misc Percussion", "Perc Short Snare Roll.aif"], root: "drums" },
    ],
  },
  lead: {
    root: "instruments",
    items: [
      { label: "Clubber (Analog)", path: ["Analog", "Synth Lead", "Clubber Lead.adg"] },
      { label: "Grime (Drift)", path: ["Drift", "Synth Lead", "Grime Lead.adg"] },
      { label: "Acid Fertig (Wavetable)", path: ["Wavetable", "Synth Lead", "Acid Fertig.adg"] },
      { label: "A Thick Wave (Wavetable)", path: ["Wavetable", "Synth Lead", "A Thick Wave.adv"] },
      { label: "Chiptune Dream (Meld)", path: ["Meld", "Synth Lead", "Chiptune Dream.adg"] },
      { label: "8-Bit Quack (Operator)", path: ["Operator", "Synth Lead", "8-Bit Quack.adg"] },
      { label: "Euphoria (Drift)", path: ["Drift", "Synth Lead", "Euphoria Lead.adv"] },
      { label: "Dreamscape (Meld)", path: ["Meld", "Synth Lead", "Dreamscape Lead.adg"] },
      { label: "Bell Airy (Collision)", path: ["Collision", "Mallets", "Bell Airy.adv"] },
      { label: "Metallic FM (Operator)", path: ["Operator", "Ambient & Evolving", "Metallic FM.adv"] },
    ],
  },
  bass: {
    root: "instruments",
    baseNotes: BASS_MOTIF,
    items: [
      { label: "Grime, octave down (Drift)", path: ["Drift", "Synth Lead", "Grime Lead.adg"], notes: motif(48) },
      { label: "Basic Reese (Wavetable)", path: ["Wavetable", "Bass", "Basic Reese Bass.adg"] },
      { label: "808 Pure (Drift)", path: ["Drift", "Bass", "808 Pure.adg"] },
      { label: "Basic Sub Sine (Operator)", path: ["Operator", "Bass", "Basic Sub Sine.adg"] },
      { label: "Itchy Sub (Meld)", path: ["Meld", "Bass", "Itchy Sub.adv"] },
      { label: "101 Sidechain Fuzz (Analog)", path: ["Analog", "Bass", "101 Bass Sidechain Fuzz.adg"] },
      { label: "Dub Wob (Drift)", path: ["Drift", "Bass", "Dub Wob Bass.adv"] },
      { label: "Myloacid (Meld)", path: ["Meld", "Bass", "Myloacid.adv"] },
      { label: "Basic FM House Bass (Wavetable)", path: ["Wavetable", "Bass", "Basic FM House Bass.adg"] },
      { label: "Basic Sub Boom (Tension)", path: ["Tension", "Bass", "Basic Sub Boom.adg"] },
    ],
  },
  "bass-layer": {
    root: "instruments",
    items: [
      { label: "Grime, octave down (Drift)", path: ["Drift", "Synth Lead", "Grime Lead.adg"], notes: motif(48) },
      { label: "808 Pure (Drift)", path: ["Drift", "Bass", "808 Pure.adg"], notes: motif(36) },
    ],
  },
  "bass-chain": {
    root: "instruments",
    baseNotes: BASS_MOTIF,
    items: [
      { label: "808 Pure baseline (Drift)", path: ["Drift", "Bass", "808 Pure.adg"] },
      { label: "808 Pure + Saturator", path: ["Drift", "Bass", "808 Pure.adg"], effects: [["Saturator"]] },
      { label: "808 Pure + Auto Filter", path: ["Drift", "Bass", "808 Pure.adg"], effects: [["Auto Filter"]] },
    ],
  },
  transitions: {
    root: "instruments",
    oneShot: true,
    items: [
      { label: "Riser Basic (sounds)", path: ["Effects", "Riser Basic.adg"], root: "sounds" },
      { label: "Riser Crisis (sounds)", path: ["Effects", "Riser Crisis.adg"], root: "sounds" },
      { label: "ENCOM Riser (sounds)", path: ["Effects", "ENCOM Riser.adg"], root: "sounds" },
      { label: "Boinky Saw Riser (Build and Drop)", path: ["Build and Drop", "Sounds", "Effects", "Boinky Saw Riser.adg"], root: "packs" },
      { label: "Cymbal Crash Reverse (drum hit)", path: ["Drum Hits", "Cymbal", "Cymbal Crash Reverse Gnirob.wav"], root: "drums" },
      { label: "Crash Kick Reverse (drum hit)", path: ["Drum Hits", "Cymbal", "Crash Kick Reverse.aif"], root: "drums" },
      { label: "Ballistic Boom (sounds)", path: ["Booms", "Ballistic Boom.adg"], root: "sounds" },
      { label: "Bending Boom (sounds)", path: ["Booms", "Bending Boom.adg"], root: "sounds" },
      { label: "Command Boom Kick (sounds)", path: ["Booms", "Command Boom Kick.adg"], root: "sounds" },
      { label: "Metal Impact Delay (sounds)", path: ["Effects", "Metal Impact Delay.adg"], root: "sounds" },
    ],
  },
  "air-risers": {
    // Split from `transitions` on purpose - a riser/whoosh is judged over its whole length, a
    // boom/impact in the first 100ms. Mixing the two timescales in one bank muddies the reactions.
    root: "instruments",
    oneShot: true,
    bars: 16, // risers need their full length to be heard - a 1-bar clip cuts them off
    items: [
      { label: "Riser White Noise (drum hit)", path: ["Drum Hits", "FX Hit", "Riser White Noise.wav"], root: "drums" },
      { label: "Riser Whoosh Up (drum hit)", path: ["Drum Hits", "FX Hit", "Riser Whoosh Up.wav"], root: "drums" },
      { label: "Whoosh Down Dark (drum hit)", path: ["Drum Hits", "FX Hit", "Whoosh Down Dark.wav"], root: "drums" },
      { label: "Sweep White Noise Fall (drum hit)", path: ["Drum Hits", "FX Hit", "Sweep White Noise Fall.wav"], root: "drums" },
      { label: "Siren Wind (drum hit)", path: ["Drum Hits", "FX Hit", "Siren Wind.wav"], root: "drums" },
      { label: "FX Sweeper Otherworldly (drum hit)", path: ["Drum Hits", "FX Hit", "FX Sweeper Otherworldly.aif"], root: "drums" },
      { label: "FX Sweep Shrill Noise (drum hit)", path: ["Drum Hits", "FX Hit", "FX Sweep Shrill Noise.aif"], root: "drums" },
      { label: "Riser Taka Breath (drum hit)", path: ["Drum Hits", "FX Hit", "Riser Taka Breath.wav"], root: "drums" },
      { label: "Riser Noise Gated (drum hit)", path: ["Drum Hits", "FX Hit", "Riser Noise Gated.wav"], root: "drums" },
      { label: "Square Sweep (sounds)", path: ["Ambient & Evolving", "Square Sweep.adv"], root: "sounds" },
      { label: "FX Stutter Sweep (drum hit)", path: ["Drum Hits", "FX Hit", "FX Stutter Sweep.wav"], root: "drums" },
      { label: "Sweep Shuddered (drum hit)", path: ["Drum Hits", "FX Hit", "Sweep Shuddered.wav"], root: "drums" },
    ],
  },
  downlifters: {
    // The arrival side, not the approach - post-drop landings and reverse-motion into a downbeat.
    root: "instruments",
    oneShot: true,
    bars: 16,
    items: [
      { label: "FX Noisefall (drum hit)", path: ["Drum Hits", "FX Hit", "FX Noisefall.aif"], root: "drums" },
      { label: "FX Hit Down (drum hit)", path: ["Drum Hits", "FX Hit", "FX Hit Down.aif"], root: "drums" },
      { label: "Downstairs Pad (sounds)", path: ["Ambient & Evolving", "Downstairs Pad.adv"], root: "sounds" },
      { label: "Before The Plunge (sounds)", path: ["Bass", "Before The Plunge.adv"], root: "sounds" },
      { label: "Tom Low Drop Reverb (drum hit)", path: ["Drum Hits", "Tom", "Tom Low Drop Reverb.aif"], root: "drums" },
      { label: "FX Perc Drop (drum hit)", path: ["Drum Hits", "FX Hit", "FX Perc Drop.aif"], root: "drums" },
      { label: "Snare Flange Down (drum hit)", path: ["Drum Hits", "Snare", "Snare Flange Down.aif"], root: "drums" },
      { label: "Foley Drop LDre (drum hit)", path: ["Drum Hits", "Misc Percussion", "Foley Drop LDre.wav"], root: "drums" },
      { label: "Drop Tunnel (drum hit)", path: ["Drum Hits", "Misc Percussion", "Drop Tunnel.aif"], root: "drums" },
      { label: "Acid Meltdown Bass (sounds)", path: ["Bass", "Acid Meltdown Bass.adv"], root: "sounds" },
    ],
  },
  "sustained-beds": {
    // Runs underneath rather than announcing anything - noise/room/tape/static texture, not a sweep.
    root: "instruments",
    oneShot: true,
    bars: 16,
    items: [
      { label: "ASMR Cave Texture (sounds)", path: ["Ambient & Evolving", "ASMR Cave Texture.adg"], root: "sounds" },
      { label: "Drone Tapes (sounds)", path: ["Ambient & Evolving", "Drone Tapes.adg"], root: "sounds" },
      { label: "Crackle Storm (sounds)", path: ["Effects", "Crackle Storm.adv"], root: "sounds" },
      { label: "Exoplanet Rain (sounds)", path: ["Ambient & Evolving", "Exoplanet Rain.adg"], root: "sounds" },
      { label: "Jarble Ambience (sounds)", path: ["Ambient & Evolving", "Jarble Ambience.adv"], root: "sounds" },
      { label: "Lab Ambient (sounds)", path: ["Ambient & Evolving", "Lab Ambient.adg"], root: "sounds" },
      { label: "Echoic Chamber (sounds)", path: ["Ambient & Evolving", "Echoic Chamber.adv"], root: "sounds" },
      { label: "Dark Swarm (sounds)", path: ["Ambient & Evolving", "Dark Swarm.adg"], root: "sounds" },
      { label: "Vinyl Rub (sounds)", path: ["Effects", "Vinyl Rub.adg"], root: "sounds" },
      { label: "Martian Ham Radio (sounds)", path: ["Ambient & Evolving", "Martian Ham Radio.adv"], root: "sounds" },
    ],
  },
  pads: {
    // Separate from `lead` on purpose - different register, different job. A held triad, not a
    // melodic phrase, because the point is the chord/harmony a pad carries, not its top-line tone.
    root: "instruments",
    baseNotes: chordHold(8),
    bars: 8,
    items: [
      { label: "Ambient Vocal (sounds)", path: ["Pad", "Ambient Vocal.adv"], root: "sounds" },
      { label: "Avantchord (sounds)", path: ["Pad", "Avantchord.adv"], root: "sounds" },
      { label: "Bender Chord (sounds)", path: ["Pad", "Bender Chord.adg"], root: "sounds" },
      { label: "5ths Filter Sweep Pad (sounds)", path: ["Pad", "5ths Filter Sweep Pad.adv"], root: "sounds" },
      { label: "Analog Rising Pad (sounds)", path: ["Pad", "Analog Rising Pad.adv"], root: "sounds" },
      { label: "Bell Pad (sounds)", path: ["Pad", "Bell Pad.adg"], root: "sounds" },
      { label: "Axis String Cluster (sounds)", path: ["Pad", "Axis String Cluster.adg"], root: "sounds" },
      { label: "Buzz Reso Stereo Pad (sounds)", path: ["Pad", "Buzz Reso Stereo Pad.adv"], root: "sounds" },
      { label: "Brain Teaser (sounds)", path: ["Pad", "Brain Teaser.adg"], root: "sounds" },
      { label: "Basic Saw Pad (sounds)", path: ["Pad", "Basic Saw Pad.adg"], root: "sounds" },
    ],
  },
  space: {
    // One fixed source (Operator "Metallic FM" - his top-rated, still-unplaced lead/pad keep),
    // reverbs then delays, each its own track with one effect. Two stabs with a long gap so the
    // tail is actually audible - judge these on decay, not on the source tone.
    // The catalog listed FabFilter/Neoverb as installed (2026-09-03 scan) but Justin doesn't
    // have them on this machine - dropped. He does have Valhalla; confirm before adding any
    // other VST3 back in, the catalog's install list can't be trusted as current.
    root: "instruments",
    baseNotes: SPACE_TEST,
    bars: 8,
    items: [
      { label: "Reverb (native)", path: ["Operator", "Ambient & Evolving", "Metallic FM.adv"], effects: [["Reverb"]] },
      { label: "Hybrid Reverb (native)", path: ["Operator", "Ambient & Evolving", "Metallic FM.adv"], effects: [["Hybrid Reverb"]] },
      { label: "Convolution Reverb (native)", path: ["Operator", "Ambient & Evolving", "Metallic FM.adv"], effects: [["Convolution Reverb"]] },
      { label: "Convolution Reverb Pro (native)", path: ["Operator", "Ambient & Evolving", "Metallic FM.adv"], effects: [["Convolution Reverb Pro"]] },
      { label: "Delay (native)", path: ["Operator", "Ambient & Evolving", "Metallic FM.adv"], effects: [["Delay"]] },
      { label: "Echo (native)", path: ["Operator", "Ambient & Evolving", "Metallic FM.adv"], effects: [["Echo"]] },
      { label: "Filter Delay (native)", path: ["Operator", "Ambient & Evolving", "Metallic FM.adv"], effects: [["Filter Delay"]] },
      { label: "Gated Delay (native)", path: ["Operator", "Ambient & Evolving", "Metallic FM.adv"], effects: [["Gated Delay"]] },
      { label: "Grain Delay (native)", path: ["Operator", "Ambient & Evolving", "Metallic FM.adv"], effects: [["Grain Delay"]] },
      { label: "Spectral Time (native)", path: ["Operator", "Ambient & Evolving", "Metallic FM.adv"], effects: [["Spectral Time"]] },
      { label: "ValhallaSupermassive", path: ["Operator", "Ambient & Evolving", "Metallic FM.adv"], effects: [["VST3", "Valhalla DSP", "ValhallaSupermassive"]] },
    ],
  },
};

const args = process.argv.slice(2);
const bankName = args[0];
const bank = BANKS[bankName];
if (!bank) throw new Error(`bank must be one of ${Object.keys(BANKS).join(", ")}`);
const flag = (n: string, d: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const START_BAR = Number(flag("start", "1"));
// Bank phrases are written around C (MIDI 60). A pad auditioned in the wrong key tells you nothing
// about whether it sits under THIS track, so shift the whole phrase to the track's root.
const ROOT_NOTE = flag("root", "");
const TRANSPOSE = ROOT_NOTE ? pitch(ROOT_NOTE) - 60 : 0;
const startBeat = (START_BAR - 1) * 4;
const FROM = Number(flag("from", "1")) - 1; // resume a bank build from item index N (1-based)
const LAYER = args.includes("--layer"); // leave every track unmuted (stack) instead of solo-one-at-a-time
const clipBeats = (bank.bars ?? 1) * 4;

print(
  await withLive(async (live) => {
    const results: unknown[] = [];
    for (let i = FROM; i < bank.items.length; i++) {
      const item = bank.items[i];
      const name = `${bankName.toUpperCase()} ${String(i + 1).padStart(2, "0")} - ${item.label}`;
      let notes: Note[];
      if (bank.root === "drums" && item.kit) {
        const { pads, missing } = padsFor(item.kit);
        const note = bank.role ? pads[bank.role] : pads.kick;
        notes = (bank.rhythm ?? QUARTERS).map((h) => ({ pitch: note, ...h }));
        const t = await getOrCreateTrack(live, name, (tt) => loadOnTrack(live, tt, "drums", [item.kit!]));
        await replaceArrangementClip(t, startBeat, clipBeats, notes, name);
        await t.set("mute", i !== 0);
        results.push({ name, kit: item.kit, note, missing });
      } else if (item.path) {
        notes = item.notes ?? bank.baseNotes ?? (bank.oneShot ? oneShot(clipBeats) : MOTIF);
        if (TRANSPOSE) notes = notes.map((n) => ({ ...n, pitch: n.pitch + TRANSPOSE }));
        const loadRoot = item.root ?? "instruments";
        const deviceName = item.path[0];
        const t = await getOrCreateTrack(live, name, async (tt) => {
          await loadOnTrack(live, tt, loadRoot, item.path!);
          if (item.params) await setParams(tt, deviceName, item.params);
          for (const fx of item.effects ?? []) await loadOnTrack(live, tt, fx[0] === "VST3" ? "plugins" : "audio_effects", fx);
        });
        await replaceArrangementClip(t, startBeat, clipBeats, notes, name);
        await t.set("mute", LAYER ? false : i !== 0);
        results.push({ name, path: item.path.join("/"), effects: item.effects?.map((e) => e.join("/")) });
      }
    }
    await live.application.view.showView("Arranger");
    return results;
  }),
);

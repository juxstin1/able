# Able - Design (v0, 2026-09-03)

Chat-driven track building in Ableton Live 12.4.5 Suite. Greenfield. Decide before building.

## What I found on the machine

- Live 12 Suite 12.4.5, Max for Live available.
- 27 factory packs (Drum Booth, Drum Essentials, Golden Era Hip-Hop, Trap Drums, Synth Essentials,
  Electric Keyboards, Upright Piano, Orchestral Brass/Strings, Granulator III, Sequencers, etc).
- VST3: FabFilter full suite, iZotope Ozone 12 / Neutron 5 / Nectar 4 / Neoverb / VocalSynth 2,
  Surge XT, Valhalla Supermassive, TDR Nova, CHOWTapeModel, PaulXStretch, Neutone Morpho, K1v.
- No OSC / remote bridge installed. User Library presets folder is empty.

## Principles (yours, restated)

1. No MCP yet. Files + a tiny CLI. Claude calls the CLI like any other shell tool.
2. Knowledge lives in plain files Claude can read, grep and edit. Nothing hidden in a DB.
3. Every generated thing is a file on disk first (MIDI, recipe, preset) so it can be replayed,
   versioned, and dragged into Live by hand if the bridge dies.
4. Grow by accretion: manifest gets richer, recipes get saved, skills get sharper.

## Layers

```
 you (chat)  -->  Claude  -->  able CLI  -->  bridge  -->  Live
                    |             |
                 skills/      catalog/ + recipes/ + out/
```

### 1. Catalog (the manifest - what you asked about)

`catalog/` is a folder, not one giant file. One YAML per thing, tagged.

```
catalog/
  instruments/   drum-rack-808.yaml, wavetable.yaml, operator.yaml, surge-xt.yaml ...
  effects/       pro-q-4.yaml, saturn-2.yaml, supermassive.yaml, ozone-12.yaml ...
  packs/         trap-drums-sound-oracle.yaml, drum-booth.yaml ...
  samples/       (indexed, not copied) folders of one-shots/loops with tags
  index.yaml     generated roll-up: id -> path, tags, kind
```

Entry shape (kept small on purpose):

```yaml
id: fabfilter-saturn-2
kind: effect            # instrument | effect | midi-effect | pack | sample-folder
format: vst3            # native | vst3 | vst2 | m4l
name: "FabFilter Saturn 2"
tags: [saturation, multiband, warmth, distortion, tape, tube, mix, master]
good_for: "adding harmonics to bass and drums; parallel warmth on a bus"
avoid: "on already-clipped material"
key_params: [drive, mix, dynamics, band-crossover]
presets: []             # filled as we save them
notes: |
  free-form, grows over time
```

Two ways to populate it:
- **Bootstrap script** scans VST3 dirs, Live's Core Library and Factory Packs, writes stub entries.
- **Claude fills in** `tags / good_for / avoid` from its own knowledge, you correct over time.

### 2. Recipes (saved know-how, the "presets" you mean)

`recipes/` = reusable moves in plain YAML/markdown. Two kinds:

- **Device recipes**: a chain + parameter values. "trap 808: Drum Rack + Saturn drive 30% + Pro-Q HP 30Hz".
  Serialised to `.adg/.adv` in the User Library when the bridge supports it, else as instructions.
- **Pattern recipes**: MIDI generators with parameters. "trap hats: 1/16 base, 1/32 rolls on bar 4,
  velocity curve X, swing 54%". Output is `.mid` in `out/`.

### 3. Bridge: ableton-js (decided 2026-09-03)

`ableton-js` (leolabs) = a MIDI Remote Script inside Live + a typed Node/TypeScript client.
Verified against Live 12.4.5: track/clip/note read+write, device + parameter control, transport,
Browser API (walk instruments / drums / plugins / user_library and `loadItem` onto a track),
`createMidiClip` in arrangement (needs 12.2+, we have 12.4.5).

Install: copy `node_modules/ableton-js/midi-script` to
`%APPDATA%/Ableton/User Library/Remote Scripts/AbletonJS`, enable "AbletonJS" as a Control
Surface in Preferences > Link/Tempo/MIDI, restart Live. No daemon.

Consequence: the CLI is TypeScript (Node 22 + pnpm present), not Python. Python stays for
one-off analysis (librosa via `track-breakdown` skill).

Fallbacks: `.mid` files in `out/` always written first; `.als` generation is a later export path.

### 4. CLI (`able`)

TypeScript, single package, thin, wraps ableton-js. Verbs Claude will actually call:

```
able catalog scan            # bootstrap / refresh stubs
able catalog find "warm bass"  # tag/text search -> ids
able midi gen hats --style trap --bars 4 --out out/hats.mid
able live tracks             # list tracks/clips (bridge)
able live add-track midi "Hats" --device "Drum Rack" --preset "Trap Drums/Kit 3"
able live put-clip 2 0 out/hats.mid
able live set-param 2 0 "Drive" 0.3
able recipe save "trap-808" --from-track 1
able recipe apply "trap-808" --track 3
```

### 5. Skills (how Claude uses it)

`.claude/skills/` in this repo: `hats`, `bassline`, `chords`, `arrange`, `mix-chain`. Each skill is
a short recipe of *which CLI calls in which order* plus musical rules. This is where "Claude makes
great hi-hats" gets captured instead of re-derived every chat.

## Build order

1. `able catalog scan` + hand-fill the 20 devices you use most.
2. `able midi gen` for hats / kick / bass / chords (works with no bridge at all).
3. Bridge install + `able live *` verbs.
4. Recipes save/apply.
5. Skills.

## Open questions (not blocking)

- Sample library location(s) to index.
- Do you want the catalog to also know your *hardware* (controllers, outboard)?

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Able

Chat-driven track building in Ableton Live 12.4.5 Suite. Claude talks to Live through
`ableton-js` (a Remote Script inside Live + a Node client). No MCP, no CLI framework, no tests,
no build step - every script in `scripts/` is a standalone `tsx` entry point with its usage in a
header comment. Read that header before running one.

## Commands

- Run anything: `node_modules/.bin/tsx scripts/<name>.ts`
  (`pnpm exec tsx` does not resolve from Git Bash on this machine; the direct bin path does).
- Typecheck: `node_modules/.bin/tsc --noEmit` - the only check that exists.
- Is the bridge alive: `node_modules/.bin/tsx scripts/live-tracks.ts` (tempo, tracks, devices).
- Setup: `pnpm install`, copy `node_modules/ableton-js/midi-script` into
  `Documents/Ableton/User Library/Remote Scripts/AbletonJS`, enable **AbletonJS** as a Control
  Surface (Preferences > Link, Tempo & MIDI).
- Two optional Remote Script patches, both idempotent and backing up first. Toggle the control
  surface off/on (or restart Live) after either - a soft toggle doesn't always take:
  - `python remote-script/patch.py` - groove pool read/write. `lib/groove.ts` needs it.
  - `python remote-script/patch-automation.py` - clip automation envelopes. `lib/envelope.ts`
    needs it. Confirmed working 2026-09-09 (`scripts/test-envelope.ts`): Session-clip envelopes
    ARE reachable from a standard Control Surface script - no ableton-js fork needed, since
    `Clip.sendCommand()` is already a generic passthrough.

## Architecture

Everything is generated to a file on disk first and pushed to Live second (`out/*.mid`,
`graph/*.yaml`, `songs/*.yaml`). `out/` is gitignored, so its caches (`browser.json`, `kits.json`)
rebuild on demand. Helpers live in `lib/`; graduate a script into a helper only after it has been
reused.

### Session vs Arrangement - the split that matters most

- `loop.ts` / `section.ts` / `bass.ts` build into **Session** scenes. Good for trying ideas, not
  where a track lives. Each scene carries its own tempo, set from the style's `bpm`.
- `drums.ts <style> --arrangement [--start N]` writes straight into the **Arrangement** timeline.
- `arrange-build.ts <song.yaml>` copies each section's Session clips into Arrangement, back to
  back. This is the thing that actually fills the timeline.
- `arrange.ts` does **not** touch Arrangement despite the name - it fires a scene sequence live and
  runs automation while it plays. Same `song.yaml` shape, different outcome.

### `lib/styles.ts` is the single genre definition

`STYLES` (trap, boombap, ukg, house) holds bpm, kit `.adg` name, track-name prefix, the generator
calls for each part (`drums`, `hats`, `bass`, `keys`, `keysCalm`), the bass instrument preset
(`OP_808` / `OP_PULSE`) and the keys device. `loop.ts` (one full-density 4-bar loop) and
`section.ts` (intro/build/drop/breakdown/outro at varying density) both read it, so a genre is
defined in exactly one place. Add a genre there, not in a script.

`lib/patterns.ts` holds the generators themselves (`trapHats`, `straightHats`, `kickSnare`,
`bassline`, `chords`), all taking a `pads` map; `lib/scales.ts` holds the scale-degree tables.
`lib/midi.ts` is the Note type, `pitch("F1")`, `humanise`, `swing`, a dependency-free SMF writer,
and `pushClip(live, track, slot, notes, beats)`.

### Catalog -> browser -> Live

Three layers, in this order:

1. `catalog/{instruments,effects,midi-effects,packs}/<id>.yaml` - one hand-taggable entry per
   device/pack (`tags`, `good_for`, `avoid`, `key_params`, `notes`). `catalog/index.yaml` is
   generated. Search via `lib/catalog.ts` `find()` or `scripts/catalog-find.ts "warm bass"`.
2. Each entry carries a generated `load: {root, path, uri}` block pointing into Live's browser
   (172/175 linked as of 2026-09-03; the 3 misses are the empty Max container devices). That block
   is what lets `live-load.ts` and `fx-chain.ts` take a bare catalog id.
3. `lib/browser.ts` walks Live's browser into `out/browser.json` and relinks those blocks.

- `scripts/catalog-scan.ts` rescans installed devices; never overwrites an existing entry.
- `scripts/catalog-seed.ts` fills only still-empty fields from its SEED table; hand edits win.
- `scripts/browser-dump.ts` walks Live (~6400 items, mostly drum kits) and relinks. `--cached`
  relinks from the JSON without walking. Rerun after installing packs.
- `scripts/browser-find.ts "808" --root sounds --cat Bass` searches the cache, so it needs
  `browser.json` to exist. Live's `sounds` root has 19 categories of `.adv/.adg` presets; devices
  and packs report `is_folder=false` but still have children, so expansion is by name, not by that flag.

### Taste graph - two separate stores

- `graph/chains.yaml` (`lib/graph.ts`, `scripts/chain.ts`) - device chains only. A chain is an
  ordered path of catalog ids through slots (`source > shape > dynamics > space > bus > master`,
  never backwards) in a named context, with appended verdicts. Edges are derived, never stored.
  Fewer than 3 chains behind an edge = `low_confidence`. `graph/README.md` has the learning rules.
  `learn/claims.yaml` (`lib`-less, `scripts/learn.ts`) is the third store: technique learned from video,
  gated on corroboration and pruned on a timer - `learn/README.md`.
- `graph/verdicts.yaml` + `graph/loops.yaml` (`lib/taste.ts`, `scripts/verdict.ts`) - everything
  that isn't a chain: loops, sounds, parts, scenes. Subjects are `kind:id` (`loop:trap-7`,
  `sound:operator-pulse`, `part:trap-7/hats`). `verdict.ts score <subject>` is recency-decayed.

### Drum kits

`lib/kits.ts` reads Drum Rack `.adg` files off disk (gzipped XML, `ReceivingNote = 128 - note`) and
maps roles (kick, snare, chat, ohat...) to pads for a named kit. Call `padsFor("X Kit.adg")` before
generating drums; never assume the GM layout in `DRUM`.

## Script index

| script | what |
|---|---|
| `live-tracks.ts` | smoke test against the open set |
| `live-params.ts "<track>"` | every device param name + range - run before `setParams` on a device you haven't touched |
| `live-load.ts <catalog-id \| root:Seg/Seg> --track <name\|i> [--new-midi]` | load a device or preset |
| `fx-chain.ts <ref:slot[:note]> ... --track "<n>"` or `--id <chain-id>` | build a whole chain in slot order |
| `sidechain.ts --track "<bass>" [--depth classic\|hard\|subtle]` | Compressor + S/C on; **Audio From still has to be picked by hand** |
| `loop.ts <style> --scene N [--seed S --root F1 --kit "X.adg"]` | full 4-bar loop into a scene |
| `section.ts <style> <intro\|build\|drop\|breakdown\|outro> --scene N` | one section at that density |
| `drums.ts` / `bass.ts <style>` | one part only, same generators |
| `arrange-build.ts <song.yaml> [--start 1]` | scenes -> real Arrangement timeline |
| `arrange.ts <song.yaml>` | performs the scene sequence live, with automation |
| `automate.ts --track --device --param --points "[[0,0],[8,1]]"` | real-time knob move while the transport plays; bakes nothing |
| `envelope.ts --track --device --param --scene N --steps "[[0,4,0]]"` | real clip envelope, Session only, needs the automation patch (confirmed working 2026-09-09) |
| `test-envelope.ts` | diagnostic: creates a throwaway track+clip and confirms the automation-envelope patch still works. Re-run after any ableton-js/Live upgrade |
| `groove.ts pool\|global\|dial\|apply\|clear\|show\|justin` | groove pool; needs `patch.py`. Justin's default is `groove.ts justin "<groove>" --tracks a,b` (timing 60%, global 100%) |
| `stop.ts` | stop the transport and all clips. Run it before handing back - never leave Live playing |
| `levels.ts --scene N` | peak per track + master (1.0 = 0dBFS). Run before trusting a mix by ear |
| `gain-stage.ts --scene N` | play, pull down clipping faders, repeat. Mixer volume only, never devices; a hot master once every track is clean means add a Limiter (catalog id `limiter`), not more turndown |
| `verdict.ts` / `chain.ts` | the capture step - see the taste graph above |
| `pierstan-drums.ts [--start N] [--bars N]` | the measured Path Five drum part into Arrangement (`--session` for a scene). See `docs/reference-pierstan.md` |
| `stardust-pad.ts [--scene N] [--bpm 123] [--no-kick]` | the French house filter-disco chord loop - Electric playing 16th cluster chops, closed 24 dB LP + hard-knee comp doing the pad-ing. `--params` re-applies device settings only |
| `chop-cut.py <recording.wav> [--key Dmin] [--bpm 128]` | cut vocal chops from a recording, snap to key, write `out/chops/` + manifest |
| `chops.ts [--start N] [--clear-only]` | place those chops into Arrangement as one-shots. `--clear-only` first if re-cutting (Live holds the wavs open) |
| `learn-fetch.py <url\|--search q> [--frames s,s] [--crop right]` | YouTube tutorial -> clean transcript + 1080p frames in `out/learn/`. Frames carry the settings the words don't |
| `learn.ts add\|corroborate\|tried\|prune\|stats` | the knowledge store. See `learn/README.md` for the four rules that stop it rotting |
| `learn.ts search "<q>" [--transcripts]` | lexical lookup over claims and video transcripts, returns source + timestamp. No vector db - see `learn/README.md` |
| `clip-dump.ts "<track>" [--kit "X.adg"] [--grid]` | read a track's clips back as a bar/beat grid, Arrangement and Session. Read-only - run it before commenting on a part instead of assuming |
| `pad-audition.ts [--start 2] [--seed 5]` | four pad characters over one progression, a scene each (`--arrangement` lays them back to back). Each is built from a `learn/claims.yaml` claim, to see which survive a real track |
| `chop-audition.py [--secs 3.0]` | ONE long chop per recording, for auditioning treatments. Deliberately not `chop-cut.py` - that slices many short chops for building a line |
| `chop-audition.ts [--bpm 124]` | those long chops onto their own tracks, each through a different chain, back to back in Arrangement. `--params` re-applies devices only |
| `build-sound-bed.ts [--bpm 123.70] [--files-only \| --check]` | eight-bar B minor bed to audition a sound against, rather than judging it dry and alone. `--check` meters one pass |
| `song-bass.ts [--bars 40]` | sub under the E minor pad arrangement. Offbeat 8ths on purpose: it already rests where the kick lands, so it needs no sidechain |
| `build-air-fx.py [--bpm 123.70]` | generate risers/swells/downlifters/impacts at tempo from scratch, no samples. Always a new timestamped folder - Live holds a handle on any wav a clip references |
| `stage-air-fx.ts` | place those FX after the song as draggable clips. Decides nothing about where they go |
| `audit-release-pair.py ORIG.wav REMASTER.wav OUT/` | local read-only original-vs-remaster audit. `audit-release-details.py` and `audit-release-mono-check.py` cross-check the mono losses. Measurements narrow what to listen to; they do not replace listening |
| `build-14.ts [--start 14] [--bars 8]` | a steady groove from bar 14 - snare run, kick between them, hats closed-closed-open. Not a build; nothing accelerates and nothing drops |
| `build-ambient-tonight.ts [--files-only]` | the 88-bar September Light ambient arrangement at 118 |
| `import-untitled5.ts` / `tune-untitled5.ts` / `inspect-u5-arrangement.ts` / `add-u5-mallet-layers.ts` | the Untitled5 study: import the source, finish the sounds and meter a loop, snapshot the set, then layer marimba + electric piano. The layer pass re-hashes the source clip notes and refuses if the arrangement moved under it |
| `am9-halftime.ts [--scene N] [--chords main\|bright\|dark] [--kit "X.adg"] [--bass "X.adg"]` | the Am9 / 78 half-time idea into one Session scene from `project-files/Am9 Halftime - 78/`: Electric chords (8 bars), GM drums remapped through `padsFor`, bass locked behind the kick. Does not fire the scene |
| `als-inspect.ts <set.als ...> [--json]` | a saved set read off disk, Live not needed: tempo, time sig, scale, locators, device chains, plugins (racks included), Session + Arrangement clips. Run it to see which VSTs a project needs before opening it |

`songs/*.yaml` are section lists (`name`, `scene`, `bars`) consumed by `arrange.ts` and
`arrange-build.ts`. `songs/ukg.yaml` is the worked example.

## What the Live API cannot do

Each of these was checked; don't spend time working around them:

- **No automation into Arrangement, at all.** Arrangement automation lives on the track's
  automation lane and that lane has no write API. The only route is moving the knob live while
  Arrangement records. `automate.ts` puppeteers the parameter in real time instead, and nothing
  is captured into the clip.
- `Clip.createAutomationEnvelope` in `ableton-js` is a dead stub, but irrelevant - `lib/envelope.ts`
  goes around it via the patched Remote Script and `Clip.sendCommand()`'s generic passthrough.
  Confirmed working 2026-09-09, Session clips only (Arrangement clips have no envelope at all,
  see above).
- The sidechain **Audio From** chooser is not exposed. `sidechain.ts` dials everything else; the
  source is picked once by hand, after which it saves with the set.
- Grooves cannot be added to the pool by API. They must already be in the set (`Grooves.als`).
- **Group tracks cannot be created.** `Song` exposes createMidiTrack/createAudioTrack/createReturnTrack
  and nothing else; `is_grouped` and `group_track` are read-only. Any "put these on a bus and filter them
  together" step is a hand step (select tracks, Ctrl+G), then load devices onto the group by name.
- **Audio clip markers are half-writable.** On an Arrangement audio clip `end_marker` sets fine but
  `start_marker` silently refuses (reads back 0), so you cannot window a clip onto a region of a
  longer file. `Track.createAudioClip` also warps the file to a tempo Live guesses on import - a
  34.2 s file came in as 64 beats, not its true 72.96 - so marker beats do not map to sample
  seconds either. Cut real one-shot files instead; that is what `chop-cut.py` does.
- Live keeps an open handle on every wav an existing clip references, so rewriting those files
  fails with `WinError 32` until the clips are gone (`chops.ts --clear-only`).
- Live answers slower than the reply arrives. Never poll it in a loop for "did that land yet"
  (e.g. scene count after adding a scene) - that loop spams real scenes into a real set.

## Rules

- Check `catalog/` before choosing a device; add tags/notes there when you learn something.
- Before pairing devices, run `chain.ts with <id>`. After building a chain in Live, log it with
  `chain.ts add`. When Justin says it works or it doesn't, log `keep` or `bin` immediately; a
  one-word verdict is the whole point. Never recommend off a `low_confidence` edge without saying so.
- `docs/profile.md` is Justin's taste profile - EDM, UK Garage, house, vocal chops; Fisher, Bicep,
  Sammy Virji, Fred again.., Space Laces for sound design. Read it before picking defaults. Trap at
  140 is a visitor, not home. The `boombap` bin was genre, not craft.
- `docs/mixing-chain.md` - device-to-slot map, plus (section 0) when the answer is levels or
  arrangement rather than a device at all. `docs/design.md` - the design and build order.
- Live may be open with other work. Never delete or overwrite tracks or clips you did not create
  in this session.
- `project-files/<name>/` is one Live project's working files, audio included: the `.als`, the
  source MIDI, the `score.json` a build wrote before touching Live, its receipts, bounced and
  consolidated `Samples/`, and the generated `FX Options/` renders. A clone is the whole project,
  not a project minus its sound. Only what Live rebuilds by itself is excluded - the timestamped
  `Backup/` autosaves and the `.asd` analysis caches.
- `releases/` holds finished masters, one wav per track - the deliverable, as distinct from the
  working files under `project-files/`. Audit one with `audit-master.py` before it goes out.
- Agents hub project: `obsidian-vault/agents/projects/able/`.

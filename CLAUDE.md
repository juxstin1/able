# Able

Chat-driven track building in Ableton Live 12.4.5 Suite. Claude talks to Live through
`ableton-js` (a Remote Script inside Live + a Node client). No MCP, no CLI framework.

## How to do things

- Write a short script in `scripts/`, run it: `node_modules/.bin/tsx scripts/<name>.ts`
  (`pnpm exec tsx` does not resolve from Git Bash on this machine; the direct bin path does).
- Helpers live in `lib/`. Graduate a script into a helper only after it has been reused.
- Every generated artifact is a file on disk first (`out/*.mid`, `recipes/*.yaml`), pushed to Live second.
- Typecheck: `node_modules/.bin/tsc --noEmit`.

## Layout

- `lib/live.ts` - `withLive(fn)`, `track(live, nameOrIndex)`, `print`.
- `lib/catalog.ts` - `find(query, kind?)`, `loadEntry(id)`, `loadIndex()`.
- `lib/paths.ts` - Live Core Library, User Library, Factory Packs, VST dirs.
- `catalog/{instruments,effects,midi-effects,packs}/<id>.yaml` - one tagged entry per device/pack. `catalog/index.yaml` is generated.
- `scripts/catalog-scan.ts` - rescan installed devices; never overwrites existing entries.
- `scripts/catalog-seed.ts` - fills empty fields from the SEED table; hand edits always win.
- `scripts/live-tracks.ts` - smoke test against the open Live set.
- `lib/browser.ts` + `scripts/browser-dump.ts` - walk Live's browser into `out/browser.json` and write a `load: {root, path, uri}` block into every catalog entry it can match. Run once after the bridge is up; rerun after installing packs. `--cached` relinks from the JSON without walking Live again (the walk is ~6400 items, mostly drum kits). Verified 2026-09-03: 172/175 linked, loads of Operator and Saturn 2 worked; the 3 misses are the empty Max container devices.
- `scripts/live-load.ts <catalog-id | root:Seg/Seg> --track <name|i> [--new-midi]` - load a device or preset onto a track.
- `scripts/browser-find.ts "808" --root sounds --cat Bass` - search the cached browser for presets/kits. Live's `sounds` root has 19 categories of `.adv/.adg` presets; devices and packs report `is_folder=false` but still have children.
- `scripts/verdict.ts <subject> keep|bin|meh ["Justin's words"] --context "house bass"` - log a verdict on a loop, sound or part into `graph/verdicts.yaml`. `verdict.ts score <subject>` gives the recency-decayed score. `lib/taste.ts` also keeps `graph/loops.yaml`, one record per loop built, enough to rebuild it.
- `lib/graph.ts` + `scripts/chain.ts` + `graph/chains.yaml` - the taste graph. Log a chain with `chain.ts add`, judge it with `chain.ts keep|bin|meh <id>`, ask `chain.ts with <id>` before choosing a pairing. See `graph/README.md`.
- `lib/midi.ts` - Note type, `pitch("F1")`, `humanise`, `swing`, `writeMidi` (own SMF writer, no dep), `pushClip(live, track, slot, notes, beats)`.
- `lib/patterns.ts` - generators: `trapHats`, `straightHats`, `kickSnare`, `bassline`, `chords`. All take a `pads` map so they hit the right pad per kit.
- `lib/kits.ts` - reads Drum Rack `.adg` files off disk (gzipped XML, ReceivingNote = 128 - note) and maps roles (kick, snare, chat, ohat...) to pads for a named kit. Use `padsFor("X Kit.adg")` before generating drums; never assume GM layout.
- `lib/song.ts` - `getOrCreateTrack`, `setParams(track, device, {name: value})`, `fireScene`, `ensureScenes`, `peakLevels`, `nudgeVolume`.
- `scripts/levels.ts --scene N` - peak-meter readout per track + master (1.0 = 0dBFS). Run this before trusting a mix by ear alone.
- `scripts/gain-stage.ts --scene N` - plays the scene, pulls down any track fader that's clipping, repeats until clean. Only touches mixer volume, never devices; a hot master after all tracks are clean means add a Limiter (catalog id: limiter), not more turndown.
- `scripts/loop.ts <trap|boombap|house> --scene N --seed S --root F1` - full 4-bar loop into a scene. Writes `.mid` to `out/` first. Scenes carry their own tempo.
- `scripts/live-params.ts "<track>"` - dump every device parameter name and range on a track; run it before `setParams` on a device you haven't touched.
- `lib/groove.ts` + `scripts/groove.ts` - groove pool: list, dial a groove's amounts, apply to clips per track/scene, global amount. Needs the patched Remote Script: `python remote-script/patch.py` (idempotent, backs up first), then toggle the control surface off/on. Justin's default: timing 60%, global 100% (`groove.ts justin "<groove>" --tracks a,b`). Live's API cannot add grooves to the pool; they must already be in the set (template).
- `recipes/` - saved device chains and pattern parameters (YAML).
- `docs/design.md` - the design and build order.
- `docs/mixing-chain.md` - curated device-to-slot map (source/shape/dynamics/space/bus/master) for building a full chain, when levels alone solve it, and the mastering chain through to export (manual, by Justin).

## Rules

- Check `catalog/` before choosing a device; add tags/notes there when you learn something.
- Before pairing devices, run `chain.ts with <id>`. After building a chain in Live, log it with `chain.ts add`. When Justin says it works or it doesn't, log `keep` or `bin` immediately; a one-word verdict is the whole point. Never recommend off a `low_confidence` edge without saying so.
- Live may be open with other work. Never delete or overwrite tracks or clips you did not create in this session.
- The AbletonJS Remote Script lives in `Documents/Ableton/User Library/Remote Scripts/AbletonJS`; it must be enabled as a Control Surface in Live (Preferences > Link, Tempo & MIDI).
- Agents hub project: `obsidian-vault/agents/projects/able/`.

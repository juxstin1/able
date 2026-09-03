# Able

Chat-driven track building in Ableton Live 12.4.5 Suite. Claude (or any LLM agent) talks to Live
through [`ableton-js`](https://github.com/leolabs/ableton-js) - a Remote Script inside Live plus a
typed Node/TypeScript client. No MCP server, no CLI framework - just scripts in `scripts/`, run
with `tsx`, that read/write the live Ableton session directly.

Every generated artifact is a file on disk first (`out/*.mid`, `recipes/*.yaml`), pushed to Live
second. Nothing is hidden in a database - the catalog, the taste graph, the song definitions, all
plain YAML you can read and edit by hand.

## Setup

1. Install deps: `pnpm install`
2. Copy the Remote Script into Live:
   `node_modules/ableton-js/midi-script` -> `Documents/Ableton/User Library/Remote Scripts/AbletonJS`
3. In Live: Preferences > Link, Tempo & MIDI, enable **AbletonJS** as a Control Surface.
4. Optional patches (idempotent, back up the installed script first):
   - `python remote-script/patch.py` - groove pool read/write.
   - `python remote-script/patch-automation.py` - clip automation-envelope writing (Session
     clips only; see that file's header for why Arrangement automation isn't possible via this
     API at all).
   - After either patch: toggle the AbletonJS control surface off/on in Live, or restart Live.
     Toggling alone does **not** reload changed `.py` files into Live's already-running Python
     process - only a full restart guarantees it.
5. Typecheck: `node_modules/.bin/tsc --noEmit`

## Quick start

```
node_modules/.bin/tsx scripts/live-tracks.ts                    # smoke test - lists tracks/devices
node_modules/.bin/tsx scripts/drums.ts ukg --arrangement         # 4-bar drum loop straight into Arrangement
node_modules/.bin/tsx scripts/loop.ts house --scene 2 --seed 7   # full loop (drums+bass+keys) into a Session scene
node_modules/.bin/tsx scripts/arrange-build.ts songs/ukg.yaml    # lay built scenes out in the real Arrangement timeline
```

`pnpm exec tsx` doesn't resolve from Git Bash on this machine - use the direct bin path above.

## Layout

- `lib/live.ts` - `withLive(fn)`, `track(live, nameOrIndex)`, `print`.
- `lib/midi.ts` - `Note`, `pitch()`, `humanise`, `swing`, `writeMidi` (own SMF writer), `pushClip` (writes into a Session clip slot).
- `lib/song.ts` - track/scene helpers, `fireScene`, `peakLevels`, `nudgeVolume`, `runAutomation` (real-time parameter puppeteering).
- `lib/envelope.ts` - real clip automation-envelope writing (needs `patch-automation.py`; Session clips only).
- `lib/patterns.ts` - pattern generators (`trapHats`, `kickSnare`, `bassline`, `chords`, ...).
- `lib/kits.ts` - reads Drum Rack `.adg` presets off disk to map roles (kick/snare/chat/ohat/...) to pads per kit.
- `lib/styles.ts` - per-genre style table (bpm, kit, pattern calls) shared by `loop.ts`/`section.ts`/`drums.ts`.
- `lib/catalog.ts`, `lib/paths.ts`, `lib/browser.ts` - the device/pack catalog, install paths, and Live's Browser API (search + load presets onto a track).
- `catalog/{instruments,effects,midi-effects,packs}/<id>.yaml` - one tagged entry per device/pack.
- `graph/` - the taste graph: `verdicts.yaml` (keep/bin/meh on loops/sounds/parts), `loops.yaml`, `chains.yaml` (device-chain pairings), see `graph/README.md`.
- `scripts/` - the actual CLI surface; see each file's header comment for usage.
- `recipes/` - saved device chains and pattern parameters (YAML).
- `songs/*.yaml` - section sequences consumed by `arrange.ts` / `arrange-build.ts`.
- `docs/design.md` - original design and build order. `docs/mixing-chain.md` - curated mixing chain reference.

## Session vs. Arrangement

Most early scripts (`loop.ts`, `section.ts`) build into **Session** clip slots and scenes -
useful for auditioning ideas, but not where a finished track lives. Two paths out of Session:

- `scripts/drums.ts <style> --arrangement [--start N]` and equivalents write straight into the
  Arrangement timeline via `Track.createMidiClip`, no scene involved.
- `scripts/arrange-build.ts <song.yaml>` takes scenes you've already built and copies each
  track's clip into the Arrangement timeline back to back, via `Track.duplicateClipToArrangement`.

`scripts/arrange.ts` is named misleadingly - it only *performs* a scene sequence live via
`setTimeout`s, it never touches the Arrangement timeline. Prefer `arrange-build.ts` for anything
that should actually show up when you open Arrangement view.

## Known limits

- **Arrangement automation cannot be written via the Live API**, full stop - it lives on the
  track's automation lane, not in a clip, and there's no write path to that lane in the Live
  Object Model (confirmed: it's a years-old open feature request on Ableton's own forum). The
  only way to get real automation baked into Arrangement is to puppeteer a parameter live
  (`lib/song.ts`'s `runAutomation`) while Live's own Arrangement recording captures it.
- Clip-level automation envelopes (`lib/envelope.ts`) only exist for **Session** clips -
  `Clip.automation_envelope()` returns `None` for Arrangement clips. Unverified whether it's even
  reachable from a standard Control Surface script at all - see that file's header.
- `ensureScenes` (`lib/song.ts`) adds exactly the scenes you ask for, computed once up front.
  Never loop-and-reread scene count after `createScene` - Live applies it a tick later than the
  socket read returns, and re-checking races into runaway scene creation. Hit this for real once;
  don't reintroduce it.

## Rules

- Check `catalog/` before choosing a device; add tags/notes there when you learn something.
- Before pairing devices, run `scripts/chain.ts with <id>`. Log `keep`/`bin` verdicts
  (`scripts/verdict.ts`) as soon as you have one - that's the whole point of the taste graph.
- Live may be open with other work in progress - never delete or overwrite tracks/clips you
  didn't create in this session.

# Able

![Live 12](https://img.shields.io/badge/Ableton-Live%2012%20Suite-000000?logo=abletonlive&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Bridge](https://img.shields.io/badge/bridge-ableton--js-1DB954)
![Status](https://img.shields.io/badge/status-personal%2C%20live-orange)

**Talk to Claude, get a track built - in Arrangement, where it actually counts.**

<p align="center">
  <a href="#setup">setup</a> ·
  <a href="#try-it">try it</a> ·
  <a href="#layout">layout</a> ·
  <a href="#session-vs-arrangement">session vs. arrangement</a> ·
  <a href="#what-the-live-api-just-wont-do">what the api won't do</a> ·
  <a href="#ground-rules">ground rules</a>
</p>

No plugin, no MCP server - `scripts/` are just TypeScript run with `tsx`, talking to a live
Ableton Live 12 session over [`ableton-js`](https://github.com/leolabs/ableton-js) (a Remote
Script + a Node client).

Everything lands on disk first (`out/*.mid`, `recipes/*.yaml`, `catalog/*.yaml`) and gets pushed
to Live second, so nothing's trapped in a database you can't read.

## Setup

```
pnpm install
```

Copy `node_modules/ableton-js/midi-script` into
`Documents/Ableton/User Library/Remote Scripts/AbletonJS`, then in Live: Preferences > Link,
Tempo & MIDI > enable **AbletonJS** as a Control Surface.

Two optional patches on top (both idempotent, both back up the installed script before touching it):

```
python remote-script/patch.py              # groove pool read/write
python remote-script/patch-automation.py   # clip automation envelopes (Session clips only)
```

After either one: toggle AbletonJS off/on in Live's prefs, or just restart Live - toggling alone
doesn't reload changed `.py` into Live's already-running Python.

## Try it

```
node_modules/.bin/tsx scripts/live-tracks.ts                     # is Live even listening
node_modules/.bin/tsx scripts/drums.ts ukg --arrangement          # 4 bars, straight into Arrangement
node_modules/.bin/tsx scripts/loop.ts house --scene 2 --seed 7    # full loop into a Session scene
node_modules/.bin/tsx scripts/arrange-build.ts songs/ukg.yaml     # scenes -> real Arrangement timeline
```

(`pnpm exec tsx` doesn't resolve from Git Bash here - use the bin path.)

## Layout

| | |
|---|---|
| `lib/live.ts` | `withLive`, `track`, `print` - the connection |
| `lib/midi.ts` | notes, humanise/swing, `.mid` writer, `pushClip` (Session) |
| `lib/song.ts` | tracks/scenes, `fireScene`, `peakLevels`, `runAutomation` (live parameter puppeteering) |
| `lib/envelope.ts` | real clip automation envelopes - needs the automation patch, Session only |
| `lib/patterns.ts` | `trapHats`, `kickSnare`, `bassline`, `chords`, ... |
| `lib/kits.ts` | reads `.adg` Drum Racks off disk, maps roles to pads per kit |
| `lib/styles.ts` | per-genre table (bpm/kit/pattern calls) shared by `loop`/`section`/`drums` |
| `catalog/` | one tagged YAML per instrument/effect/pack |
| `graph/` | the taste graph - `keep`/`bin`/`meh` verdicts, chain pairings |
| `songs/*.yaml` | section sequences for `arrange-build.ts` |
| `scripts/` | the actual CLI - read each file's header |

## Session vs. Arrangement

`loop.ts` / `section.ts` build into Session scenes - fine for auditioning, not where a track
lives. To actually land in Arrangement:

- `scripts/drums.ts <style> --arrangement [--start N]` writes straight in via `createMidiClip`.
- `scripts/arrange-build.ts <song.yaml>` copies already-built scene clips into the timeline back
  to back, via `duplicateClipToArrangement`.

`arrange.ts` is a trap - despite the name it only performs a scene sequence live with
`setTimeout`s, it never touches Arrangement. Use `arrange-build.ts`.

## What the Live API just won't do

- **No writing automation into Arrangement.** It lives on the track's automation lane, not in a
  clip - there is no API for that lane. Years-old open ask on Ableton's own forum, still open.
  The only real path: puppeteer the parameter live (`runAutomation`) while Arrangement recording
  captures it.
- Clip envelopes (`lib/envelope.ts`) only exist on **Session** clips - Arrangement clips return
  `null`. Whether it even works from a plain Control Surface script is unverified - try it.
- `ensureScenes` adds exactly what you ask for, computed once. Don't loop-and-reread the scene
  count after `createScene` - Live applies it a beat later than the socket read returns, and
  that race spammed real scenes into a real set once. Learned that one the hard way.

## Ground rules

- Check `catalog/` before picking a device. `chain.ts with <id>` before pairing two.
- Log verdicts (`verdict.ts keep|bin|meh`) the moment you have one - that's the whole point.
- Live's probably open with other stuff going on. Don't touch tracks/clips you didn't create.

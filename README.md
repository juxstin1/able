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
  <a href="#what-it-cant-do">what it can't do</a> ·
  <a href="#ground-rules">ground rules</a>
</p>

No plugin, nothing to install in Live beyond one small bridge. `scripts/` are plain TypeScript
files you run, and they talk straight to whatever's open in Live right now.

Everything gets written to disk first (`.mid` files, YAML) and pushed into Live second, so
nothing's hidden - you can always open the files and see exactly what got built.

## Setup

```
pnpm install
```

Copy `node_modules/ableton-js/midi-script` into
`Documents/Ableton/User Library/Remote Scripts/AbletonJS`, then turn it on in Live: Preferences >
Link, Tempo & MIDI > enable **AbletonJS**.

Two optional upgrades, both safe to run (they back up what's installed first):

```
python remote-script/patch.py              # lets scripts read/write your grooves
python remote-script/patch-automation.py   # lets scripts write real automation into a clip
```

After either one, flip AbletonJS off and back on in Live's settings - or just restart Live.
A soft toggle alone won't always pick up the change.

## Try it

```
node_modules/.bin/tsx scripts/live-tracks.ts                     # is Live even listening
node_modules/.bin/tsx scripts/drums.ts ukg --arrangement          # 4 bars, straight into Arrangement
node_modules/.bin/tsx scripts/loop.ts house --scene 2 --seed 7    # full loop into a Session scene
node_modules/.bin/tsx scripts/arrange-build.ts songs/ukg.yaml     # lines built scenes up in Arrangement
```

## Layout

| | |
|---|---|
| `lib/live.ts` | connects to Live |
| `lib/midi.ts` | builds notes, writes `.mid` files, drops clips into Session |
| `lib/song.ts` | tracks, scenes, live parameter moves |
| `lib/envelope.ts` | bakes real automation into a clip (Session only, needs the patch) |
| `lib/patterns.ts` | the drum, bass, and chord generators |
| `lib/kits.ts` | figures out which pad is the kick/snare/hat for a given kit |
| `lib/styles.ts` | one genre = one recipe: tempo, kit, which generators to call |
| `catalog/` | every instrument, effect, and pack you own, tagged |
| `graph/` | keep / bin / meh verdicts on loops, sounds, and chains |
| `songs/*.yaml` | track structures for `arrange-build.ts` |
| `scripts/` | the actual commands - check the top of each file for usage |

## Session vs. Arrangement

`loop.ts` / `section.ts` build into Session - good for trying ideas out, not where a real track
lives. To actually land in Arrangement:

- `scripts/drums.ts <style> --arrangement [--start N]` writes straight in.
- `scripts/arrange-build.ts <song.yaml>` takes scenes you've already built and lines them up in
  the real timeline, back to back.

Skip `arrange.ts` - despite the name it just performs a scene sequence live, it never actually
touches Arrangement.

## What it can't do

- **Can't write automation into Arrangement, at all.** Live just doesn't allow it - that's a
  years-old, still-open complaint on Ableton's own forum, not something we can code around. The
  only real workaround: move the knob live while Arrangement is recording, so Live captures it
  the normal way, same as if you'd done it by hand.
- Baked-in automation (`lib/envelope.ts`) only works in Session, never Arrangement. Might not
  even work at all - it's untested. Try it and see.
- Don't ask Live "how many scenes exist" right after adding one and loop until the number looks
  right - Live's a beat slower than the reply, and that loop can spam real scenes into a real
  set. Found that out the hard way.

## Ground rules

- Check `catalog/` before picking a device. `chain.ts with <id>` before pairing two.
- Log a verdict (`verdict.ts keep|bin|meh`) the moment you have one - that's the whole point.
- Live's probably open with other stuff going on. Don't touch tracks or clips you didn't create.

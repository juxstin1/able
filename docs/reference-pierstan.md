# Reference - P I E R S T A N, "Path Five (New West)"

Analysed 2026-09-05 from `Downloads/Path Five (New West).wav` (48 kHz) plus Live 12's
4-stem separation in `Documents/Ableton/Live Recordings/2026-09-05 202205 Temp Project/`.

## Who

- **P I E R S T A N** (handle `pierstan`), Edinburgh. "New West" is part of the title, not the artist.
- "Path Five (New West)", released 19 Jun 2025, ASODA / OWSLA. 3:47.
- Same handle on SoundCloud and SoundBetter, so the rig below is very likely theirs - but it is
  a handle match, not a confirmed one. Treat as strong, not certain.

## Documented rig (their own SoundBetter listing)

| | |
|---|---|
| DAW | **FL Studio 24** and **Ableton 12** |
| Interface | M-Audio AIR 192\|14 |
| Monitors | KRK Rokit 6 G3 |
| Headphones | Sennheiser HD 650 |
| Keys | Arturia KeyStep 32 |
| Self-described as | Oliver Tree, Killstation, **Fred again..** |
| Works in | dubstep, EDM, electronic, hip hop, house, trap |

No plugin list is published anywhere I could find. Everything below is what the audio itself says.

## What the track actually is

**128.00 BPM exactly**, **D minor**, first downbeat at 461 ms.

- **Straight. No swing at all.** Mean offbeat-8th position is 49.0% of the beat (50.0 = dead
  straight, 58-62 = swung, 66.7 = triplet). This is house, not garage - do not reach for
  `groove.ts` here.
- Four-on-the-floor kick, clap on 2 and 4, closed hats on straight 8ths with the offbeat accented.
- Drums and bass are near-mono (L/R correlation 0.985 and 0.98). Keys and vocal are wide
  (0.14 and 0.17). The whole width budget is spent above the bass.

### Kick

Peak at **50 Hz**, pitch envelope **79 Hz -> 53 Hz**, decay -12 dB in **73 ms**, -20 dB in 137 ms.
Only 3.9% of its energy above 2 kHz. Short, tuned, punchy, with a real pitch drop and a modest
click - not a long 909 tail.

Note the split: **kick body sits at ~50 Hz, bass root is D1 at 36.7 Hz.** They are deliberately
kept in different octaves rather than fighting. That is most of why this mix holds together loud.

### Hats

Decay to -20 dB in **48 ms**. Tight closed-hat sample, 808/909 length, not an acoustic kit.

Measured per-step, every hat decays in **22-36 ms** (n ~94 bars each). **There are no open hats in
the track at all** - the offbeat emphasis is velocity, not an open hat. Do not reach for `ohat`.

### Bass

Root **D1 (36.7 Hz)**, sits on D1/D#1, ranges D1..G#2. Harmonic series measured at the root:

```
h1  36.7Hz   +0.0    h2  73.4Hz   -7.4    h3 110.1Hz   -5.6
h4 146.8Hz  -15.2    h5 183.6Hz  -14.7    h6 220.3Hz  -19.6
```

**h3 is louder than h2, h5 louder than h4.** Odd harmonics dominate, so this is a
square/clipped-sine shape - a sub run into hard saturation or a clipper - **not a saw and not a
Reese.** Energy is gone by 600 Hz.

### Vocal

Median f0 **E4 (329 Hz)**, natural register, centroid/f0 ratio 6.5 - that is a **normal voice, not
formant-shifted and not pitched-up chops**. Sustained phrasing, not sliced. Post-note decay to
-20 dB takes **~1.0 s**: a big plate or hall, wet.

This is the Fred again.. move (a real vocal, drenched) rather than the Sammy Virji move
(chopped, formant-bent).

### Harmony

D minor throughout. **Corrected 2026-09-06: the sus4 reading in the first pass was an artifact of
my own chord estimator, not a feature of the track.** Re-tested against the chordal stem's
pitch-class content on the loudest quartile of frames:

- For a D chord the third (F, 0.27) is *stronger* than the fourth (G, 0.19). A sus4 requires the
  third to be absent. It is not absent, so this is not sus.
- Template fit ranks plain **Dm (D-F-A) top at +0.361**, ahead of Dsus4 (+0.323) and Gsus4 (+0.215).

The cause: D is overwhelmingly the strongest pitch class (1.00), and my scoring rewarded any
template merely *containing* D. Gsus4 contains D, so it kept winning. One dominant pitch class
dragging every template that includes it to the top is the failure mode - normalise against it.

Read the harmony as **plain D minor / Dm7**, and treat any chord estimate off a separated stem as
a hypothesis needing a third-presence check before it is written down.

### Arrangement (8-bar blocks)

```
bar   1   drums + light bass, no keys      DJ intro
bar   9   full
bar  17   drums OUT, vocal up              breakdown
bar  25   light drums back
bar  33   full                             drop 1
bar  49   full + keys
bar  57   drums out again                  breakdown 2
bar  65   bass down                        build
bar  73   full                             drop 2
bar  89   full, vocal drops out
bar  97   instrumental
bar 105   stripping
bar 113   drums only                       DJ outro
```

Drum-only head and tail, two breakdowns, vocal absent for the last third. Built for mixing.

### Master

RMS -10.1 dBFS, crest factor 10.1 dB, peak pinned at 0.0 dBFS. Heavily limited.

## Caveats

- The source file is a **lossy rip** - energy ceiling ~15.8 kHz. Nothing about air, top end or
  master quality can be judged from it.
- Stems are Live 12's separation, so there is cross-bleed. Kick/bass/hat envelopes and the bass
  harmonic series are reliable; the "Others" stem's band limits are an artifact, not a mix choice.

## Getting there with what is installed

Check `catalog/` before substituting. Ids below are real entries.

- **Kick** - `drum-rack` with a short tuned one-shot; if synthesising, `operator` sine with a fast
  pitch envelope 79->53 Hz and a ~140 ms amp decay. `drum-buss` for the click.
- **Bass** - `operator` or `wavetable` sine at D1 into `saturator` (or `roar`) driven hard enough to
  raise odd harmonics; confirm h3 > h2 on `spectrum`. `fabfilter-saturn-2` if you want to shape
  which band gets the drive. Keep it mono with `utility`.
- **Keep the split** - `eq-eight` high-pass the kick's sub so the bass owns 37 Hz and the kick owns
  50 Hz, or `fabfilter-pro-mb` if you would rather duck dynamically. `sidechain.ts` still needs its
  Audio From set by hand.
- **Vocal** - `hybrid-reverb` or `valhallasupermassive` for a ~1 s tail, `fabfilter-pro-r-2` if you
  want the decay dialled precisely. Do not chop it.
- **Keys** - wide and mid-range; `drift` or `meld`, width via `utility`, not on the bass.
- **Master** - `limiter` or `ozone-12-maximizer`. Run `levels.ts` before trusting any of it.

## Why this one matters for Able

128 BPM straight four-to-the-floor in D minor with a wet natural vocal is squarely in the house
lane of `docs/profile.md`, and it is the first reference here that is **explicitly not swung**.
`lib/styles.ts` has `house` at four-on-the-floor already; the gap this exposes is the
**sub-vs-kick octave split** and the **odd-harmonic saturated sub**, neither of which
`bassline()` in `lib/patterns.ts` currently does.

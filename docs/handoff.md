# Handoff - 2026-09-06

Written at the end of a long session. Read the first two sections and you can pick up cold.

## Do this first

1. **Open the Path Five project, then File > Collect All and Save.** It references 33 chop wavs in
   `out/chops/`, which is gitignored scratch. Nothing protects them today except that
   `chop-cut.py` no longer deletes by default. Collecting makes the set self-contained.
2. **The E minor chops are cut and waiting.** Source Recording (26), key E minor, register G3-G4,
   formants preserved. `out/chops-place.json` points at them. One command places them:
   ```
   node_modules/.bin/tsx scripts/chops.ts
   ```
   Blocked only because the set that was open (120 BPM, tracks `1-MIDI`/`3-Audio`) is not the
   Path Five project - it has no `PF Drums` or `PF Chops`. Do not place into it.

## Where things stand in Live

Path Five project, saved and closed, contains:
- `PF Drums` - 909 Core Kit, the measured Path Five pattern in Arrangement, duplicated out to 16 bars
- `PF Chops` - 33 audio clips over 8 bars + a six-device chain
  (`EQ Eight > Roar > Glue Compressor > Echo > ValhallaSupermassive > Utility`), dialled by
  `scripts/chops-fx.ts`. `--wet 0.5` pulls it all back, `--wet 1.4` pushes.
- `2-Electric` is Justin's own - never touched.

## Verdicts, and one correction worth keeping

| subject | verdict |
|---|---|
| `part:pierstan/chops` (dry, monotone, Recording 19) | **bin** |
| `part:pierstan/chops-treated` | **bin** |
| `part:pierstan/chops-melodic` (Recording 6, pitched onto Dm chord tones) | **keep** - "absolutely nuts", but "not perfect, workable" |
| chain `vocal-chops-128-dmin-004` | **bin, then keep** |

That chain carries both verdicts deliberately. It was binned, then kept with its settings
completely unchanged - only the material changed. It was never the processing. If you only read
the bin you would avoid a chain that was fine.

The proven lesson, now `technique:pitch-has-to-be-part-of-the` in the taste graph: **pitch has to
be part of the target pattern, not a property of whichever chop you happened to grab.**

## Built this session

| thing | what |
|---|---|
| `scripts/learn-fetch.py` | YouTube -> clean transcript + 1080p frames in `out/learn/` |
| `scripts/learn.ts` | the knowledge store: add / corroborate / tried / prune / search / stats |
| `learn/claims.yaml` | **90 claims, 36 channels, 12 first-hand** (now 241 - see the 2026-09-06b section below) |
| `scripts/chop-cut.py` | chop DSP: onsets, key transposition, octave fit, WORLD pitch shift |
| `scripts/chops.ts` | places chops into Arrangement |
| `scripts/chops-fx.ts` | dials the chop FX chain |
| `scripts/pierstan-drums.ts` | the measured Path Five drum part |
| `scripts/voice-profile.py` | measures a singer's range, tessitura, best keys, best takes |
| `docs/reference-pierstan.md` | full analysis of the reference track |
| `catalog/instruments/serum2.yaml` | Serum 2, incl. the BSOD_Square warning |

## Facts worth not re-deriving

- **Justin sings C3-D5, lives in E3-F#4, median G#3.** Best keys **E minor / B minor** (~71% of his
  notes already in scale). D minor - which every reference and chop build has used - is not in his
  top six. Irrelevant for chops (each is retuned individually), matters when he sings.
- **Path Five is 128.00 BPM, dead straight** (offbeat 8th at 49.0%), D minor, **no open hats
  anywhere** (every hat decays 22-36 ms), kick body ~50 Hz split an octave off a 36.7 Hz sub,
  bass is a clipped sine (odd harmonics dominant), vocal is natural-register with a ~1.0 s tail.
- **The harmony is plain D minor, not sus4.** The first pass said sus4; that was an artifact of my
  own chord estimator. Corrected in `docs/reference-pierstan.md` with the test that settles it.
- **John Summit's rolling bass is drawn pitch-bend in the clip**, not a patch. Operator, one saw,
  two notes.
- **Sammy Virji's signature chord sound is a single sine with chorus.**
- **BSOD_Square has square amplitudes but scrambled phases** - sounds like a square, will not
  behave like one under PWM/Sync/Bend. Verified by FFT against the installed file.

## Next, ranked

1. **Vowel/timbre diversity in chop selection.** The biggest unimplemented finding. 33 slots drawn
   from 13 sources with no timbre control - correct notes cut from the same vowel still sound like
   one sample retuned. k-means on MFCC 1-8 + LPC F1/F2, then MMR. `scripts/chop-cut.py`.
2. **Cut past the consonant into the vowel** for melodic chops. Currently backtracks to the onset,
   i.e. lands on the consonant every time. Corroborated by two independent sources.
3. **Raised-cosine fades**, not linear. Current 3 ms / 15 ms lengths are right, the curve is not.
4. **pyin + syllable-nucleus segmentation** to replace `librosa.yin` + onset detection. yin never
   abstains; `std(midi)` as a stability filter actively prefers monotone speech.
5. **A/B `--formants follow`** on the E minor chops. Chipmunk is genre-correct for speed garage.

Two research follow-ups are outstanding and will arrive as messages: the chords brief sections
2-6 (voicings, progressions, chord rhythm, sounds), and the Serum patch recipes (organ bass,
Reese, rolling tech house bass).

## Gotchas found the hard way

- **Live never releases a wav handle.** Deleting the clip does not do it. Rewriting a referenced
  wav fails with `WinError 32` while the set is open - and succeeds, destructively, once closed.
  `chop-cut.py` now timestamps filenames and deletes nothing without `--clean`.
- **`Clip.start_marker` silently refuses to set** on an arrangement audio clip (`end_marker` takes).
  `createAudioClip` also auto-warps to a guessed tempo. Cut real one-shot files instead.
- **`catalog-scan.ts` creates ~83 stubs** when run. Reverted this session. Run it deliberately.
- **`browser-dump.ts` rewrites all 155 catalog YAMLs as CRLF-only churn**, plus one real edit that
  repointed `drum-rack`. Reverted.
- **FabFilter is not reachable in Live's browser** on this machine - no vendor folder at all, so
  those catalog `load:` blocks are stale. Native substitutes used throughout.
- **`serum2`'s `load:` block is untested in Live.** Came from the browser cache, never loaded.
- **`--download-sections` is broken** against this ffmpeg build; `learn-fetch.py` pulls whole
  videos and seeks locally. YouTube 403s video streams without `curl_cffi`, which is why it calls
  `python -m yt_dlp` and not the `yt-dlp` binary on PATH.

## The one rule that matters for the knowledge store

Corroboration is counted **by distinct channel, and at least one source must be firsthand,
reputable or vendor.** The most numerically precise pages on production technique are unbylined
SEO with markers of LLM generation - two of those agreeing is not two witnesses. That gate caught
two claims this store had already promoted. See `learn/README.md`.


---

# Handoff - 2026-09-06b (later the same day)

Second session. Nothing in Live survives from it except one Session scene; the value is in the
knowledge store and a few tool fixes. Read "The correction that matters" before trusting anything
about the pad.

## The correction that matters

Justin called the Stardust pad "sick" **while every device on it was still at factory defaults.**
I then dialled it in the textbook French house way - high-pass 190 Hz, lowpass closed to 2.4 kHz
with resonance, hard-knee compressor slammed - and he said it "made it much worse". Restored.

So `scripts/stardust-pad.ts` holds both maps: `--params stock` (the default, and the version he
likes) and `--params treated`. The taste graph carries the correction:

| subject | verdict |
|---|---|
| chain `french-house-filtered-chords-005` | **keep** - but the second verdict says the keep is the chain at STOCK settings |
| `sound:stardust-vamp` | **keep** |
| `sound:stardust-vamp-treated` | **bin** - "sounded better before" |

The lesson generalises: **the chain was the win, the settings were not.** Do not read the first
keep note on that chain without reading the second.

## Built this session

| thing | what |
|---|---|
| `scripts/stardust-pad.ts` | French house filter-disco chord loop - Electric playing 16th cluster chops, Bm7-E9 in B dorian. Not a pad patch: a closed lowpass and a hard compressor smear 16th chops into one |
| `scripts/stop.ts` | stop the transport and all clips. **Run it before handing back, always** |

## Fixed

- **`levels.ts --scene` was 0-based** while every other script is 1-based. It silently metered an
  empty scene and reported plausible zeros. `gain-stage.ts` already had the `- 1`.
- **`learn-fetch.py` died on emoji in video titles** under Windows cp1252 - a search result could
  kill the run on a character.
- **`learn-fetch.py` could not fetch a video id starting with `-`** (yt-dlp parsed it as a flag).
  Bare ids are now promoted to a full watch URL.
- **`learn.ts` gained a `pads` topic**; `corroborate --class` is now documented in the usage header
  (it always existed, defaults to `generic`, and a generic second source cannot lift a claim past
  `unverified` - that silently held a claim back this session).

## Ranking legitimacy - `learn.ts rank`

The store could add and search but never **score**. Every input for judging a claim was already on
the row - source class, distinct channel count, status, whether it was ever tried - and nothing
combined them, so 241 claims sat in one undifferentiated pile.

```
node_modules/.bin/tsx scripts/learn.ts rank            # strongest first
node_modules/.bin/tsx scripts/learn.ts rank --bottom   # the verify/prune queue
```

Formula, printed with every run so it can be argued with:
`bestSourceClass * (1 + 0.3*(distinctChannels-1)) * statusWeight * ageDecay`.
Corroborated and tried claims stop decaying; untested single-witness ones fall toward the prune
date. It sorts sensibly - the SEO-only chop claims land at 0.2, the one `proven` claim near the top.

`learn.ts related` is the other half: it scans pairs of EXISTING claims for ones worth linking by
hand. `add` only ever hinted at duplicates for the row being written, which is why three research
runs piled up side by side instead of joining. Two bugs found while building it, both worth
knowing if you touch the scoring: plain token containment matches on boilerplate ("EQ the low end
out of the..."), so shared tokens are now IDF-weighted; and `hit/min(a,b)` makes short claims match
everything, so it is `hit/sqrt(a*b)` now.

**No vector database.** Legitimacy is not a similarity problem - embeddings would rank what is
*alike*, and two SEO pages generated from the same substrate are maximally alike and jointly
worthless. That is the exact failure `learn/README.md` rule 3b exists to stop. If a semantic index
is ever added, the case for it is the transcript corpus, not the claims.

## Knowledge store: 90 -> 241 claims

Three runs, all transcripts read in full, frames pulled where the numbers live:

| run | claims | the headline |
|---|---|---|
| pads | ~60 | unison voices must run free (retrigger off) or they cancel instead of chorusing |
| Bicep | ~38 | the stuttery vocal is a **gate sidechained from a 909 hi-hat**, not chopping. Corroborated |
| Space Laces | ~52 | the crunch is **Serum 2 Distortion, OVERDRIVE, STACK 14** - one module, not 14 plugins |

The single most transferable thing found, and it is genre-agnostic: **put a sub inside the layer
group, saturate the whole group, then cut the lows after the saturation.** The sub drives the
saturator and crunches every layer together. Corroborated across two channels.

## Facts worth not re-deriving

- **Live reports every frequency parameter normalised 0..1, never in Hz.** The curve is
  `f = 10 * 2200^x`. Confirmed against EQ Eight's own defaults landing exactly on 30/200/1000/5000
  Hz. `hz()` in `stardust-pad.ts` is the only written-down copy.
- **Group tracks cannot be created by the API.** `Song` exposes createMidiTrack/createAudioTrack/
  createReturnTrack and nothing else; `is_grouped` and `group_track` are read-only. Any "bus these
  and filter them together" step is a hand `Ctrl+G`. Now in CLAUDE.md's limits list.
- A **115-minute** video can have no usable captions at all, and a "studio interview" can be a
  **comedy sketch** (Bicep: In The Studio - "bro tools", protein powder). Check before mining.

## Next, ranked

1. **Test something.** 1 claim of 241 is `proven`. The store is almost entirely untested theory,
   and today's pad proved theory loses to the room. `learn.ts tried <id> keep|bin` is the tool.
   The Bicep gate trick is checkable against the existing chops in under an hour.
2. **220 of 241 claims are single-source `unverified`, added today, on a 45-day prune timer.**
   Nothing drops before ~2026-10-21. Corroborating the ones worth keeping is dated work.
3. **Fisher, Fred again.., Overmono: still 0 claims each** - all named in `docs/profile.md`.
   Space Laces was the biggest hole and is now filled; those three are next.
4. **arrangement: 6 claims, workflow: 6.** Thinnest topics, and arrangement is what turns the
   loops in this repo into tracks. `arrange-build.ts` and `songs/*.yaml` have tooling and no
   captured knowledge behind them.
5. Most of the Space Laces material is dubstep. Section 2 (group-sub saturation) transfers to UKG
   and house wholesale; the growl chain needs plugins not on this machine.

## Gotcha

**Never leave Live playing.** `loop.ts`, `section.ts`, `levels.ts` and `gain-stage.ts` all call
`fireScene`, which starts the transport as a side effect. A scene was left looping while Justin
was gaming this session and he had to ask twice. `scripts/stop.ts` exists now - use it.

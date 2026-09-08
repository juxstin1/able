# Untitled5 — 16-bar Live study

Built in the currently open Ableton set at **123.70 BPM**, 4/4, B minor.
Arrangement bars **1–16** contain the supplied Bm–G–D–A loop, one chord per bar.
Transport is stopped at bar 1; the 16-bar loop brace is enabled.

## Tracks

- **U5 Riff**: both supplied octave parts, 384 notes, Bright SAW Lead (Wavetable), EQ Eight, Chorus-Ensemble, Reverb.
- **U5 Chords**: 80 held pad notes, Johnny's Soft Pad (Analog), EQ Eight, Reverb.
- **U5 Bass**: 16 held root notes, Operator Saw D, Saturator, 48 dB/oct high-pass around 54 Hz plus low-pass around 950 Hz, mono Utility.
- **U5 Kick**: 64 four-on-the-floor notes, mapped to the 909 Core Kit kick.
- **U5 Clap**: 32 notes on beats 2 and 4, mapped to the kit clap, short Reverb.
- **U5 Hats optional**: 128 light triplet notes from the supplied file, separate low-level track. Mute to audition the nearly hat-free interpretation.

## Verification

All **704 notes** were read back from Live and matched source pitches, velocities, starts and durations after drum-pad mapping. Every clip starts at beat 0 and ends at beat 64. The source uses 220 PPQ, so its existing fractional-tick triplet rounding is preserved.

64 sound parameter writes were read back successfully. A full 32.5-second playback pass showed nonzero output on every part and no meter reaching 1.0. This is a Live meter check, not a rendered true-peak or loudness analysis. See `build-receipt.json`, `sound-settings.json`, and `mix-check.json`.

The sound patches are an initial approximation of the supplied description. The quoted bass harmonic ratios have **not** been matched or verified against the reference. The supplied rough preview is copied unchanged in `Source/preview_loop.wav`; it is not a render of these Live instruments.

## Saved files and next action

The source MIDI, rough preview and original README are copied into `Source/`, with SHA-256 hashes in `score.json`. `score.json` also contains every imported note and the chosen device chains.

The arrangement currently lives in the **open Live set**. An `.als` file has not been saved by the bridge. Press **Ctrl+Shift+S** in Live and save a new set in this folder when ready. Press **Space** from bar 1 to hear the loop.

Rebuild only in an empty set: `node_modules/.bin/tsx scripts/import-untitled5.ts`, then `node_modules/.bin/tsx scripts/tune-untitled5.ts`. Import refuses duplicate U5 tracks and refuses to change the tempo of a set containing existing clips. Tuning should not be rerun after making your own sound edits; `--meter-only` checks levels without resetting sounds.

Small correction to the supplied analysis: E over A is the fifth. D over A is the suspended fourth. No MIDI pitches were changed on that account.

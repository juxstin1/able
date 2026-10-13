# Am9 Halftime

78 BPM, 4/4, half-time feel (backbeat on 3 only). A minor. Load it with
`node_modules/.bin/tsx scripts/am9-halftime.ts --scene N`.

## chords.mid: the main loop, 8 bars (the 4-bar progression twice)

| Am9 | Fmaj7#11 | Dm9 | E7#9 |  i - VI - iv - V7alt

    Am9        A2  | E3  G3  B3  C4
    Fmaj7#11   F2  | E3  A3  B3
    Dm9        D2  | F3  A3  C4  E4
    E7#9       E2  | G#3 D4  G4

The E7#9 is the tension that makes the return to Am9 land. Don't smooth it into Em7.
Top line across the loop: C4 - B3 - E4 - G4. Whole-bar sustains on purpose; chop them.

- `chords-bright.mid`: | Emaj9 | C#m11 | Amaj9 | B9sus4 |, the same shape with a hopeful lift, for a chorus.
- `chords-dark.mid`: | Cm9 | Abmaj7 | Ebmaj7/G | Fm7 |, where the /G bass walks down instead of resetting. For a bridge.

## drums.mid: 4 bars, fill in bar 4

Written against the GM map (36 kick, 38 snare, 42 closed hat, 46 open hat). The script
remaps it onto the kit's real pads with `padsFor()`.

    Kick    1 . . . | . . . 2a | 3& . . . | (bar 2 adds 4e 4a)
    Snare   3 (hard) + ghosts on 2e, 3a, 4&
    Hats    swung 8ths (~57%), open hat on 4& of bar 2

Humanized ±7 ticks / ±5 velocity. Quantizing it kills the pocket.

## bass.mid: 4 bars

Locks to the kick (1, 2a, 3&) and sits 6-18 ticks behind it. Each bar ends on an
approach note into the next root:

    Am9       A1 . . A1  E2 . G1    -> F
    Fmaj7#11  F1 . . F1  C2 . C#2   -> D
    Dm9       D2 . . D2  A1 . D#2   -> E
    E7#9      E2 . . E2  B1 . G#1   -> back to A (leading tone)

Works from 72 to 84 BPM; under 72 it drags.

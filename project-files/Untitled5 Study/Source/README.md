# "Untitled (5)" — remake breakdown

Source: `C:\Users\juxxs\Downloads\Untitled (5).wav` (3:25, 48k/16-bit stereo).
Spectrum dies at 17.5 kHz and peak is -4.4 dBFS with no clipping → it's a **lossy rip of
someone else's track**, not a DAW bounce. Analysis is on demucs stems, not the mix.

## The numbers

| | |
|---|---|
| Tempo | **123.70 BPM** (measured over a 130 s baseline, 185/191 kick inliers, ±5 ms) |
| Key | **B minor** (A=440, +3 cents) |
| Metre | 4/4 kick, **triplet/12-8 shuffle** on everything melodic |
| Progression | **Bm – G – D – A**, one bar each — i–VI–III–VII, unchanged for the whole track |
| Bass register | B1 / G1 / D1 / A1, held whole bars |
| Grid anchor | first drop downbeat = **60.2246 s**, bar = 1.94022 s |

123.70 is not a rounding artifact — at 124 you'd drift 2/3 of a beat across the drop.
Build at **124** for a clean project; warp the reference to 123.70 if you want to A/B.

## The groove (this is the whole trick)

The drums are almost nothing: **kick on all four, clap on 2 and 4, no real hat pattern.**
All the motion comes from the synths playing **8th-note triplets — 3 per beat, 12 per bar**,
locked, every bar. That 4-on-the-floor-under-a-shuffle tension is the identity of the record.
If you program the riff in straight 16ths it will not sound like this.

## Sound design

**Bass** — harmonic profile on the D1 bar, relative to the fundamental:

    36.7 Hz   +0.0     73.4 Hz  +20.9     110.1 Hz +17.0     146.8 Hz  +7.5

The fundamental is *21 dB below* its own octave. So it's not a sub — it's a saw bass
driven hard into saturation with the bottom scooped out, sitting at 73–110 Hz. The kick
owns everything below 60 Hz. Recipe: saw → heavy drive/waveshaper → HPF ~50 Hz → mono.

**Lead** — pitch content smears across ±1 semitone in the CQT, i.e. **wide-detuned supersaw**,
played **in octaves** (B3+B4 etc.). Sits at E4–D5.

**Mix** — bass is mono below 120 Hz (side/mid 0.07), everything above is wide (~0.4).
Dark: 8–20 kHz sits 12 dB under 2–8 kHz.

**Vocals** — only three places, no full topline: a phrase around C#4 at 48–55 s (pre-drop 1),
the same at 148–155 s, and a higher chop around B4 over 160–172 s.

## Arrangement

| Time | Bars | Section |
|---|---|---|
| 0:03 – 0:21 | 9 | Intro — riff only, no kick, no sub |
| 0:21 – 0:52 | 16 | Build — bass in, full loop cycling, energy climbing |
| 0:52 – 1:00 | 4 | Pre-drop — bass out, vocal phrase, riser |
| **1:00 – 1:31** | **16** | **DROP 1** |
| 1:31 – 1:47 | 8 | Breakdown |
| **1:47 – 2:02** | **8** | **DROP 2** (short) |
| 2:02 – 2:18 | 8 | Breakdown 2 |
| 2:18 – 2:33 | 8 | Build |
| 2:33 – 2:37 | 2 | Riser, bass out |
| **2:37 – 3:07** | **16** | **DROP 3** (final, biggest) |
| 3:07 – 3:26 | 10 | Outro |

## The riff

4 bars, triplet 8ths, played in octaves. Bars 1–4 = Bm / G / D / A.

    Bm |  B4  B4  B4  |  B4  B4  C#5 |  D5  C#5 B4  |  A4  B4  E4  |
    G  | F#4 F#4 F#4  |  E4 F#4  A4  | F#4 F#4 F#4  | F#4 F#4  D4  |
    D  |  E4 F#4 F#4  |  E4 F#4  A4  | F#4 F#4  E4  | F#4  G4 F#4  |
    A  |  E4  E4  E4  |  E4  E4  D4  |  E4  E4  D4  |  E4 F#4  A4  |

Note the colour: F#4 over the G bar makes it **Gmaj7**, and E4 over the A bar makes it
**Asus4** resolving into the next Bm. That's where the lift comes from — not the chords,
which are plain, but the top line refusing to land on the root.

Drop 1 bars 9–16 develop this into a rising line (D4→E4→F#4→G4→A4→B4→C#5) instead of
repeating — worth stealing, it's what stops 16 bars of one loop getting boring.

## Files

| File | |
|---|---|
| `01_bass.mid` | B1–G1–D1–A1, whole bars, 16 bars |
| `02_lead_riff.mid` | the triplet riff, two tracks (unison + octave down) |
| `03_chords.mid` | pad voicings above the bass |
| `04_drums.mid` | kick 4/4 (36), clap 2+4 (39), triplet shaker (42) |
| `05_full_loop.mid` | all of the above in one 16-bar file |
| `preview_loop.wav` | rough render so you can hear the skeleton against the reference |

All written at 123.70 BPM. Drag `05_full_loop.mid` into Ableton and it lands in place.

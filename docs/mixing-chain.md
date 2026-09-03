# Mixing chain - 0 to export

A curated map of *where things go* and *when to reach for them*, not a re-description of the
catalog. Each device below has a full entry in `catalog/effects/<id>.yaml` (good_for, avoid,
key_params) and a taste history via `tsx scripts/chain.ts with <id>`. This doc is the layer above
that: which slot a device fills, and - more importantly - when the answer isn't a device at all.

Slots match `graph/README.md`: `source > shape > dynamics > space > bus > master`. A chain can
repeat a slot but never go backwards.

## 0. Levels first

Before any device: is this actually a levels or arrangement problem?

- Muddy low end -> check if two things share the same note range before reaching for EQ. Often
  it's an arrangement choice (voicing, octave), not a filter problem.
- Harsh top end -> check velocity/gain staging (`scripts/levels.ts`, `scripts/gain-stage.ts`)
  before reaching for a de-esser or EQ cut. A track running hot into the next device's input is a
  levels problem wearing an EQ costume.
- "Needs more punch" -> check if the transient is being masked by something else playing at the
  same instant before reaching for a transient shaper or compressor.
- Kick/bass clash in UKG -> `lib/patterns.ts`'s `ukg` bassline style already leaves rhythmic gaps
  for the kick (root on 1, flick on the "and" of 2, rest around the kick hits). If the pattern
  already dodges the kick, a sidechain compressor is redundant work fixing what arrangement
  already fixed. Reach for sidechain when the bass genuinely sustains through the kick (house
  `pulse`/`808` styles, pads, sustained leads) - not by default on everything.

If it's not a levels/arrangement problem, move down the chain.

## 1. Source

Instruments live in `catalog/instruments/`, not here. Sound design decisions (which oscillator,
which sample, pitch envelope) happen before this chain starts.

## 2. Shape - EQ and saturation/distortion

| id | when |
|---|---|
| `eq-eight` | default surgical EQ - high-pass everything that isn't bass, cut before you boost |
| `eq-three` | fast 3-band on drum busses, live-tweakable, not surgical |
| `channel-eq` | cheapest utility HP/LP + tilt, use when EQ Eight is overkill |
| `fabfilter-pro-q-4` | when you need dynamic EQ (duck a band only when it's loud) or M/S |
| `tdr-nova` | alternative dynamic EQ, good on vocals/leads that need band-specific control |
| `saturator` | subtle warmth, gluing a single element, cheap and fast |
| `drum-buss` | drum bus in one device: saturation + compression + transient, house/UKG drum group default |
| `fabfilter-saturn-2` | multiband saturation when different frequency ranges need different colour |
| `roar` | aggressive, multi-stage, routable distortion - big bass/lead colour, Space-Laces-style bass design. Avoid for subtle warmth (use Saturator/Saturn instead) |

## 3. Dynamics - compression, gating, sidechain

| id | when |
|---|---|
| `compressor` | per-track dynamics; native sidechain input for ducking (bass under kick) |
| `glue-compressor` | SSL-style bus glue on a drum group or the mix bus, 2:1 slow attack auto release |
| `gate` | cut bleed/tails, tighten a sample's decay |
| `fabfilter-pro-c-2` | when stock Compressor's character is wrong and you need more curve control |
| `fabfilter-pro-mb` / `multiband-dynamics` | frequency-split dynamics, e.g. controlling only sub energy |
| `neutron-5-transient-shaper` | punch/sustain without touching level |

**Sidechain setup**: load `compressor` on the element being ducked (bass/keys), route its
sidechain input from the kick track, fast attack, release synced to the groove (1/16-1/8 in
house/UKG). Check section 0 first - if the pattern already rests under the kick, skip this.

## 4. Space - reverb, delay

| id | when |
|---|---|
| `reverb` | stock, fine for most sends |
| `hybrid-reverb` | when you want a convolved space (real room/plate IR) |
| `echo` / `delay` | rhythmic delay, Echo has more character (analog/tape modes) |
| `fabfilter-timeless-3` | delay as a sound-design tool, not just a rhythmic echo |
| `valhallasupermassive` | huge ambient space, use sparingly, easy to swamp a house mix |
| `neoverb` | auto-reverb send tuned to source material, fast starting point |

Space almost always belongs on a return track, not inserted per-clip - keeps the mix bus from
carrying reverb tails that then need re-taming at the master stage.

## 5. Bus - group/glue

| id | when |
|---|---|
| `glue-compressor` | drum bus or full mix bus glue |
| `utility` | gain trim, mono-below-X, width - the boring but load-bearing one |
| `neutron-5-visual-mixer` | see masking across the whole bus at once before reaching for EQ per-track |

## 6. Master - 0 to export

Order: gain stage (levels/utility) -> tonal balance -> dynamics -> limiting -> metering.

| id | when |
|---|---|
| `tonal-balance-control-2` | reference curve check before you touch anything else |
| `ozone-12-equalizer` / `ozone-12-vintage-eq` | broad tonal correction |
| `ozone-12-dynamic-eq` | frequency-specific dynamics (harshness that only shows up when loud) |
| `ozone-12-vintage-compressor` / `glue-compressor` | master bus glue, light ratio, don't overdo it |
| `ozone-12-imager` | width/mono compatibility check |
| `fabfilter-pro-l-2` / `ozone-12-vintage-limiter` / `ozone-12-maximizer` | final loudness, last device before metering |
| `dpmeter5` | true peak / LUFS check - confirm you're not clipping before export |

**Export**: bounce/render happens in Live, done by you. Nothing in this repo automates that step.

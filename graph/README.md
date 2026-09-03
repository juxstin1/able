# graph/ - the taste graph

`chains.yaml` is the only stored thing. Edges are computed from it, never written.

A chain is an ordered path of catalog ids through slots, in a context, with verdicts:

```yaml
chains:
  - id: trap-808-001
    context: trap 808
    nodes:
      - { ref: operator, slot: source, note: "sine, pitch env +24st 80ms" }
      - { ref: saturator, slot: shape, note: "drive 8dB soft sine" }
      - { ref: fabfilter-pro-q-4, slot: shape, note: "HP 28Hz, +2dB @ 60" }
    verdicts:
      - { v: keep, date: 2026-09-03 }
```

Slots enforce the type layers: `source > shape > dynamics > space > bus > master`. Order can repeat a slot
but never go backwards, so a limiter in the middle is rejected at capture time.

Verdicts are `keep | bin | meh`, appended, never replaced. The latest one counts. Binning must be one
word so negatives actually get logged.

Confidence: any edge with fewer than 3 chains behind it is reported `low_confidence`. Recommend off it
only while saying so.

## How this is allowed to learn (Justin, 2026-09-03)

- Continuous, not batch. A verdict lands the moment he says it. No review sessions, no forms.
- Cheap capture or no capture. One word. If logging costs more than deleting the device, only positives get logged and the graph recommends everything.
- Context-scoped, not global. "Saturn kept on an 808" is an edge in context `trap 808`, not a rule about Saturn. Recommending a pairing outside the contexts it was kept in is a guess and must be labelled one. Overfitting is the failure mode he named, so an edge never generalises on its own.
- Recency-weighted. Old verdicts fade; a verdict from last month outweighs one from last year. Taste moves. Nothing here is stale-proof without decay. (Decay not implemented yet; verdicts carry dates so it can be.)
- Negatives count. `bin` is a first-class verdict and gets asked for as readily as `keep`.
- Growth by accretion. Same file, same shape, more rows. Never a migration that throws away verdicts.

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

## banks.yaml - the bar changes per bank

`verdict.ts` logs single subjects (`sound-bank.ts` builds banks of alternatives: kick, lead, bass...).
"Keep" doesn't mean the same thing in every bank - a lead is the thing people notice, so it has to
be distinct or it's dead weight; bass mostly does a structural job, so ten decent low-end options
that layer well beats two exceptional ones. `banks.yaml` writes that bar down per bank (`distinct` |
`functional`, plus a note) so a verdict row can be read correctly without re-deriving the judgment
call each time. Set when a bank is created or when the bar visibly shifts - not on every verdict.

## Pairings (`pair:` subjects)

A verdict subject is normally one thing. When two things were judged together (layered basslines,
a device stacked on a kick), log it as its own row instead of burying it in prose, so it survives as
a relation and not just a note: `verdict.ts pair:a+b keep "why" --context ctx --tag layer`. A subject
that keeps appearing on the left of multiple `pair:` rows (e.g. `pair:808-pure+x`) is behaving as a
foundation, not just another keep - `verdict.ts tag layer` surfaces the whole map.

A keep reason that's actually a pairing condition ("this hat works better with a boxy two-step
snare") isn't a real `pair:` row yet - there's no tested counterpart. Tag it `needs-pair` and put
the condition in the note; once the specific counterpart is found or built and actually tested
together, promote it to a real `pair:` row (`verdict.ts tag needs-pair` lists what's waiting).

## `misfiled` - a keep in the wrong bank

Sometimes the verdict is "keep, but this isn't what the bank says it is" - a hat that's really
ear-candy buildup material, a downlifter that's really unplaced ear candy. Tag these `misfiled`
(`verdict.ts tag misfiled`) instead of letting the reclassification live only in the note. It's
happened across leads→bass (Grime), bass→lead (Myloacid as a conditioning bell), and within a
single bank (a hat that isn't a hat) - common enough to be a real category, not a one-off.

## `lazy-pick` - when the curation itself was the problem

If a keep/bin round comes back weak, tag the weak items `lazy-pick` rather than just moving on -
it marks "this batch was under-curated" as distinct from "this category is genuinely thin." Seen
on a downlifters round where several picks were generic single-hit samples (a tom, a perc hit)
with no real movement, picked because they matched the category name rather than the job.

## How this is allowed to learn (Justin, 2026-09-03)

- Continuous, not batch. A verdict lands the moment he says it. No review sessions, no forms.
- Cheap capture or no capture. One word. If logging costs more than deleting the device, only positives get logged and the graph recommends everything.
- Context-scoped, not global. "Saturn kept on an 808" is an edge in context `trap 808`, not a rule about Saturn. Recommending a pairing outside the contexts it was kept in is a guess and must be labelled one. Overfitting is the failure mode he named, so an edge never generalises on its own.
- Recency-weighted. Old verdicts fade; a verdict from last month outweighs one from last year. Taste moves. Nothing here is stale-proof without decay. (Decay not implemented yet; verdicts carry dates so it can be.)
- Negatives count. `bin` is a first-class verdict and gets asked for as readily as `keep`.
- Growth by accretion. Same file, same shape, more rows. Never a migration that throws away verdicts.

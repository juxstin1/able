# learn/ - what we've picked up from video, and why it doesn't rot

`claims.yaml` is version-controlled. `out/learn/<videoId>/` (transcript, frames, meta) is not -
it rebuilds in about ten seconds, so there is no reason to carry it in git.

## The two scripts

```
python scripts/learn-fetch.py --search "ukg vocal chops ableton"     # find candidates
python scripts/learn-fetch.py <url>                                  # metadata + clean transcript
python scripts/learn-fetch.py <url> --frames 407,1603 --crop right   # + 1080p frames at those seconds
node_modules/.bin/tsx scripts/learn.ts add "<claim>" --topic chops --video <id> --channel "<name>" --t 407
node_modules/.bin/tsx scripts/learn.ts corroborate <claim-id> --video <id> --channel "<name>" [--replacing <dup-id>]
node_modules/.bin/tsx scripts/learn.ts tried <claim-id> keep|bin|meh ["note"]
node_modules/.bin/tsx scripts/learn.ts prune [--days 45] [--apply]
```

## Watch the frames, not just the transcript

Tutorials put the actual information **on screen**. The transcript says "bring the drive up a
bit"; the frame says Drive 32%, and the mixer reads -7.8 dB. This was measured, not assumed: at
1080p, track names, fader values and sample names are all legible; at 480p none of them are. So
frames are always pulled at 1080p, and the video file is deleted once they are cut.

Grab frames at the timestamps the transcript says something concrete is happening. A 28-minute
video costs ~70 MB and ~10 seconds.

## The four rules against garbage

1. **Claims, not summaries.** One atomic, checkable statement per row. "Video about garage chops"
   is worthless at the moment you need it. "Cut into the vowel, not the consonant" is not.
2. **Provenance is mandatory.** video + channel + timestamp, or the claim is rejected (a non-YouTube source puts its URL in the\n   video slot and the publication or paper in the channel slot). Every row
   can be re-watched at its source.
3. **Corroboration is counted by channel and linked by hand.** Two people describing the same
   technique share almost no vocabulary - "choke group so a new chop mutes the previous" and "each
   pad triggers its own sample MPC style" overlap on four words. Text similarity therefore only
   *suggests*; `corroborate` makes the link. Two videos from one channel is one person repeating
   himself, so `corroborated` needs two distinct channels.
3b. **Source class, because counting channels is not enough.** The most numerically precise pages
   on production technique are unbylined SEO articles with strong markers of LLM generation -
   internally coherent, musically plausible, no author, no attribution. Two of those agreeing is
   not corroboration; they may be generated from the same substrate. So a claim only reaches
   `corroborated` if at least one source is `firsthand`, `reputable` or `vendor`. Pass
   `--class firsthand|reputable|generic|seo|vendor` on `add` and `corroborate`.

   This rule immediately caught two claims this store had already promoted - reverb pre-delay and
   ducked reverb were each "confirmed" by two SEO sites and nothing else. Both went back to
   unverified.

4. **It decays.** `prune` deletes anything still `unverified` after 45 days with a single source.
   A store that only grows is the failure mode. Pruning is what makes adding cheap.

## Justin's ears outrank a YouTuber

`tried` is the promotion step: `keep` makes a claim `proven`, `bin` makes it `contradicted`, and
either way a verdict is written into `graph/verdicts.yaml` as `technique:<claim-id>`. The taste
graph stays the single record of what actually worked in this room, on these speakers. A claim
with ten sources and a `bin` is a binned claim.

Corollary worth remembering: a claim can explain a past failure. `ukg-vocal-chops-lean-dry-so-pull`
says UKG chops lean dry - which is the opposite of the drenched chain that got binned on
2026-09-06. That is evidence, but it is not a verdict until it has actually been tried.

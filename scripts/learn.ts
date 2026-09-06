// The knowledge store for things learned from video. Cheap to write to, and it prunes itself.
//   add:      tsx scripts/learn.ts add "<claim>" --topic chops --video <id> --channel "<name>" [--class firsthand|reputable|generic|seo|vendor] [--t 245] [--note "..."]
//   corrob:   tsx scripts/learn.ts corroborate <claim-id> --video <id> --channel "<name>" [--t 245]
//             [--class firsthand|reputable|generic|seo|vendor] - DEFAULTS TO generic, and a generic
//             second source cannot lift a claim past `unverified` (rule 3b), so pass it deliberately
//   list:     tsx scripts/learn.ts list [topic] [--status unverified|corroborated|proven|contradicted]
//   tried:    tsx scripts/learn.ts tried <claim-id> <keep|bin|meh> ["note"]   -> also logs a verdict
//   prune:    tsx scripts/learn.ts prune [--days 45] [--apply]                 (dry run by default)
//   search:   tsx scripts/learn.ts search "<query>" [--transcripts]     BM25-ish, no dependencies
//   rank:     tsx scripts/learn.ts rank [--topic bass] [--bottom] [--n 20]
//             legitimacy ranking: who said it, how many distinct people, did it survive a track
//   related:  tsx scripts/learn.ts related [--min 0.3] [--topic pads] [--n 25]
//             pairs of EXISTING claims worth linking - the step that turns a pile into a store
//
// Four rules keep this from turning into a swamp. They are the whole point of the file:
//
// 1. CLAIMS, NOT SUMMARIES. One atomic, checkable statement per row. "Video about garage chops"
//    is unusable at the moment you need it; "cut into the vowel, not the consonant" is not.
// 2. PROVENANCE IS MANDATORY. video id + channel + timestamp, so any claim can be re-watched.
//    A claim with no source cannot be added.
// 3. CORROBORATION, COUNTED BY CHANNEL, LINKED BY HAND. Two people describing the same technique
//    share almost no words ("choke group so a new chop mutes the previous" vs "each pad triggers
//    its own sample MPC style" overlap on 4 tokens), so text similarity CANNOT decide this - it
//    only suggests. Use `corroborate` to attach a second source deliberately. Two videos from the
//    same channel is one person repeating himself, so `corroborated` needs two distinct channels.
//    The store gets denser, not longer.
// 3b. SOURCE CLASS, BECAUSE COUNTING CHANNELS IS NOT ENOUGH. The most numerically precise pages
//    on production technique are unbylined SEO content with strong markers of LLM generation -
//    internally coherent, musically plausible, no author, no attribution. Two of those agreeing is
//    NOT corroboration; they may be generated from the same substrate. So a claim only reaches
//    `corroborated` if at least one source is `firsthand`, `reputable` or `vendor`. An seo-only
//    claim stays `unverified` however many sites repeat it, and `list` marks it seoOnly.
//    Classes: firsthand (the artist's own words) > reputable (Attack, MusicRadar, SOS, RBMA) >
//    vendor (Ableton/Xfer docs - authoritative for their own product only) > generic > seo.
//
// 4. IT DECAYS. Anything still `unverified` after --days with one lone source gets pruned. A store
//    that only ever grows is the failure mode; pruning is what makes adding cheap and safe.
//
// And the tiebreak that matters most: Justin's ears beat a YouTuber. `tried` promotes a claim to
// `proven` or drops it to `contradicted` and writes a matching verdict into the taste graph, so
// graph/verdicts.yaml stays the single record of what actually worked.
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { ROOT } from "../lib/paths.js";
import { print } from "../lib/live.js";
import { logVerdict, type Verdict } from "../lib/taste.js";

const NEWLINE = String.fromCharCode(10);
const FILE = path.join(ROOT, "learn", "claims.yaml");
const TOPICS = ["chops", "drums", "bass", "keys", "pads", "mix", "arrangement", "sound-design", "workflow"];

type SourceClass = "firsthand" | "reputable" | "generic" | "seo" | "vendor";
interface Source { video: string; channel: string; t?: number; cls?: SourceClass }
interface Claim {
  id: string; claim: string; topic: string;
  status: "unverified" | "corroborated" | "proven" | "contradicted";
  sources: Source[]; added: string; tried?: string; note?: string;
}

const load = (): Claim[] => (fs.existsSync(FILE) ? (YAML.parse(fs.readFileSync(FILE, "utf8")) ?? []) : []);
const save = (c: Claim[]) => {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, YAML.stringify(c));
};
const today = () => new Date().toISOString().slice(0, 10);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").split("-").slice(0, 7).join("-");
const STOP = new Set("the a an of to in on for with and or is are it its you your do not be at as by from that this if when".split(" "));
const toks = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
// Rarity-weighted overlap. Plain containment scores "EQ the low end out of the ..." against any
// other sentence containing those words, which buries the real pairs under boilerplate. Weighting
// each shared token by how rare it is in the store makes "overdrive" or "retrigger" count and
// "low"/"out"/"pad" barely count at all.
function similarWeighted(a: string, b: string, idf: (w: string) => number): number {
  const A = toks(a), B = toks(b);
  if (!A.size || !B.size) return 0;
  let hit = 0, tot = 0;
  for (const w of A) { const v = idf(w); tot += v; if (B.has(w)) hit += v; }
  const other = [...B].reduce((x, w) => x + idf(w), 0);
  // Cosine-ish, NOT hit/min(...). Containment against the smaller side means a six-word claim
  // scores high against everything it shares a word with, which floods the output with one short
  // row paired against the whole store. The geometric mean makes both sides pay for length.
  return tot && other ? hit / Math.sqrt(tot * other) : 0;
}
function similar(a: string, b: string): number {
  const A = toks(a), B = toks(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const w of A) if (B.has(w)) hit++;
  return hit / Math.min(A.size, B.size); // containment, so a terse restatement still matches
}
const channels = (c: Claim) => new Set(c.sources.map((s) => s.channel.toLowerCase().trim())).size;
const SOLID: string[] = ["firsthand", "reputable", "vendor"];
const hasSolid = (c: Claim) => c.sources.some((s) => SOLID.includes(s.cls ?? "generic"));
// two SEO pages are not two witnesses
const canCorroborate = (c: Claim) => channels(c) >= 2 && hasSolid(c);

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (n: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);
const claims = load();

if (cmd === "add") {
  const text = args[1];
  const topic = flag("topic") ?? "workflow";
  const video = flag("video"), channel = flag("channel");
  if (!text || text.startsWith("--")) throw new Error("need the claim as the first argument, in quotes");
  if (!video || !channel) throw new Error("every claim needs --video <id> and --channel \"<name>\" - provenance is not optional");
  if (!TOPICS.includes(topic)) throw new Error(`--topic must be one of ${TOPICS.join(", ")}`);
  const cls = (flag("class") ?? "generic") as SourceClass;
  if (!["firsthand", "reputable", "generic", "seo", "vendor"].includes(cls)) throw new Error("--class must be firsthand|reputable|generic|seo|vendor");
  const src: Source = { video, channel, cls, ...(flag("t") ? { t: Number(flag("t")) } : {}) };

  const dupe = claims.find((c) => c.topic === topic && similar(c.claim, text) >= 0.75);
  if (dupe) {
    if (dupe.sources.some((s) => s.video === video)) { print({ unchanged: dupe.id, reason: "this video is already a source for it" }); process.exit(0); }
    dupe.sources.push(src);
    if (dupe.status === "unverified" && canCorroborate(dupe)) dupe.status = "corroborated";
    save(claims);
    print({ corroborated: dupe.id, claim: dupe.claim, channels: channels(dupe), status: dupe.status });
  } else {
    let id = slug(text), n = 2;
    while (claims.some((c) => c.id === id)) id = `${slug(text)}-${n++}`;
    const c: Claim = { id, claim: text, topic, status: "unverified", sources: [src], added: today(), ...(flag("note") ? { note: flag("note") } : {}) };
    claims.push(c); save(claims);
    // Only a hint - the operator decides whether it is really the same claim.
    const near = claims.filter((x) => x.id !== id && x.topic === topic && similar(x.claim, text) >= 0.3)
      .map((x) => ({ id: x.id, claim: x.claim, similarity: Number(similar(x.claim, text).toFixed(2)) }));
    print({ added: id, status: "unverified", note: "needs a second channel, or a `tried` verdict, to count",
            ...(near.length ? { maybeSameAs: near, hint: "if one of these is the same technique: learn.ts corroborate <that-id> --video ... --channel ...  then delete this row" } : {}) });
  }
} else if (cmd === "corroborate") {
  const id = args[1];
  const video = flag("video"), channel = flag("channel");
  const c = claims.find((x) => x.id === id);
  if (!c) throw new Error(`no claim "${id}"`);
  if (!video || !channel) throw new Error("corroborate needs --video and --channel");
  if (c.sources.some((s) => s.video === video)) throw new Error(`${video} is already a source for ${id}`);
  c.sources.push({ video, channel, cls: (flag("class") ?? "generic") as SourceClass, ...(flag("t") ? { t: Number(flag("t")) } : {}) });
  if (c.status === "unverified" && canCorroborate(c)) c.status = "corroborated";
  // fold away the redundant row if one was added for the same thing
  const drop = flag("replacing");
  const kept = drop ? claims.filter((x) => x.id !== drop) : claims;
  save(kept);
  print({ id: c.id, status: c.status, channels: channels(c), sources: c.sources, ...(drop ? { removedDuplicateRow: drop } : {}) });
} else if (cmd === "list") {
  const topic = args[1] && !args[1].startsWith("--") ? args[1] : undefined;
  const st = flag("status");
  print(claims.filter((c) => (!topic || c.topic === topic) && (!st || c.status === st))
    .map((c) => ({ id: c.id, topic: c.topic, status: c.status, channels: channels(c),
                   ...(channels(c) >= 2 && !hasSolid(c) ? { seoOnly: true } : {}), claim: c.claim })));
} else if (cmd === "tried") {
  const [, id, v, note] = args;
  const c = claims.find((x) => x.id === id);
  if (!c) throw new Error(`no claim "${id}"`);
  if (!["keep", "bin", "meh"].includes(v)) throw new Error("usage: learn.ts tried <id> <keep|bin|meh> [note]");
  c.status = v === "keep" ? "proven" : v === "bin" ? "contradicted" : c.status;
  c.tried = today();
  save(claims);
  const subject = `technique:${c.id}`;
  logVerdict(subject, v as Verdict, note ?? c.claim, c.topic);
  print({ id: c.id, status: c.status, verdict: subject, note: "verdict written to the taste graph too" });
} else if (cmd === "prune") {
  const days = Number(flag("days") ?? 45);
  const apply = args.includes("--apply");
  const cutoff = Date.now() - days * 864e5;
  const dead = claims.filter((c) => c.status === "unverified" && channels(c) < 2 && !c.tried && Date.parse(c.added) < cutoff);
  if (apply) save(claims.filter((c) => !dead.includes(c)));
  print({ [apply ? "pruned" : "wouldPrune"]: dead.map((c) => ({ id: c.id, added: c.added, claim: c.claim })), kept: claims.length - dead.length, dryRun: !apply });
} else if (cmd === "search") {
  // Deliberately not embeddings. At this size, lexical scoring with IDF beats a vector index on
  // precision and costs nothing to keep in sync. Revisit when the transcript corpus is large -
  // that is the part where semantic search actually earns a dependency, not the claims.
  const q = toks(args[1] ?? "");
  if (!q.size) throw new Error('usage: learn.ts search "<query>" [--transcripts]');
  const docs = claims.map((c) => ({ c, t: toks(`${c.claim} ${c.topic} ${c.note ?? ""}`) }));
  const idf = (w: string) => Math.log(1 + docs.length / (1 + docs.filter((d) => d.t.has(w)).length));
  const scored = docs.map(({ c, t }) => ({ c, s: [...q].filter((w) => t.has(w)).reduce((a, w) => a + idf(w), 0) }))
    .filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 8);
  const out: Record<string, unknown> = {
    claims: scored.map((x) => ({ id: x.c.id, status: x.c.status, score: Number(x.s.toFixed(2)), claim: x.c.claim,
                                 sources: x.c.sources.map((s2) => `${s2.channel}${s2.t ? ` @${Math.floor(s2.t / 60)}:${String(s2.t % 60).padStart(2, "0")}` : ""}`) })),
  };
  if (args.includes("--transcripts")) {
    const dir = path.join(ROOT, "out", "learn");
    const hits: { video: string; at: string; line: string; score: number }[] = [];
    if (fs.existsSync(dir)) for (const v of fs.readdirSync(dir)) {
      const f = path.join(dir, v, "transcript.txt");
      if (!fs.existsSync(f)) continue;
      for (const raw of fs.readFileSync(f, "utf8").split(NEWLINE)) {
        const line = raw.trim();
        const lt = toks(line);
        const sc = [...q].filter((w) => lt.has(w)).reduce((a, w) => a + idf(w), 0);
        if (sc > 0) hits.push({ video: v, at: line.slice(1, 6), line: line.slice(8, 200), score: Number(sc.toFixed(2)) });
      }
    }
    out.transcripts = hits.sort((a, b) => b.score - a.score).slice(0, 8);
  }
  print(out);
} else if (cmd === "related") {
  // The build-on-it step. `add` hints at near-duplicates for the row being written, but nothing
  // ever looked back across rows already in the store - so three research runs piled up side by
  // side instead of joining. This scans every pair and surfaces the ones worth linking by hand.
  // It only suggests. Rule 3 still holds: text similarity cannot decide that two claims are the
  // same technique, because two people describing one trick share almost no words.
  const min = Number(flag("min") ?? 0.3);
  const topic = flag("topic");
  const pool = claims.filter((c) => !topic || c.topic === topic);
  const docs = claims.map((c) => toks(c.claim));
  const idf = (w: string) => Math.log(1 + docs.length / (1 + docs.filter((d) => d.has(w)).length));
  const chSet = (c: Claim) => new Set(c.sources.map((s) => s.channel.toLowerCase().trim()));
  const pairs: unknown[] = [];
  for (let i = 0; i < pool.length; i++)
    for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i], b = pool[j];
      const score = similarWeighted(a.claim, b.claim, idf);
      if (score < min) continue;
      const shared = [...chSet(a)].some((x) => chSet(b).has(x));
      // Corroborating only means something across distinct channels, and only lifts a claim if
      // the pair carries at least one firsthand/reputable/vendor source between them.
      const wouldUpgrade = !shared && a.status === "unverified" && (hasSolid(a) || hasSolid(b));
      pairs.push({ score: Number(score.toFixed(2)), wouldUpgrade, sameChannel: shared,
                   crossTopic: a.topic !== b.topic,
                   a: { id: a.id, topic: a.topic, status: a.status, claim: a.claim },
                   b: { id: b.id, topic: b.topic, status: b.status, claim: b.claim } });
    }
  pairs.sort((x, y) => Number((y as { wouldUpgrade: boolean }).wouldUpgrade) - Number((x as { wouldUpgrade: boolean }).wouldUpgrade)
                    || (y as { score: number }).score - (x as { score: number }).score);
  print({ pairs: pairs.slice(0, Number(flag("n") ?? 25)), found: pairs.length,
          hint: "same technique? learn.ts corroborate <a-id> --video <b's video> --channel \"<b's channel>\" --class <cls> --replacing <b-id>" });
} else if (cmd === "rank") {
  // "Somewhere to rank things that are legitimate." Legitimacy is not a similarity problem, so no
  // vector store would answer it - the inputs are who said it, how many distinct people said it,
  // and whether it survived contact with a real track. Those already live on every row; nothing
  // here was scoring them. The formula is deliberately blunt and printed with its own breakdown,
  // because a confidence number you cannot argue with is worse than no number.
  const CLS_W: Record<string, number> = { firsthand: 1.0, reputable: 0.8, vendor: 0.7, generic: 0.4, seo: 0.15 };
  const STATUS_W: Record<string, number> = { proven: 2.0, corroborated: 1.4, unverified: 1.0, contradicted: 0.1 };
  const AGE_FLOOR = 0.35;
  const score = (c: Claim) => {
    const best = Math.max(...c.sources.map((s2) => CLS_W[s2.cls ?? "generic"] ?? 0.4));
    const witnesses = 1 + 0.3 * (channels(c) - 1);
    const status = STATUS_W[c.status] ?? 1;
    // Untested single-witness claims lose value as they approach the prune date. Anything tested
    // or corroborated stops decaying - it has earned its place.
    const stale = c.status === "unverified" && channels(c) < 2 && !c.tried;
    const ageDays = (Date.now() - Date.parse(c.added)) / 864e5;
    const decay = stale ? Math.max(AGE_FLOOR, 1 - ageDays / 45) : 1;
    return { total: best * witnesses * status * decay, best, witnesses, status, decay };
  };
  const bottom = args.includes("--bottom");
  const rows = claims.filter((c) => !flag("topic") || c.topic === flag("topic"))
    .map((c) => { const s2 = score(c); return {
      score: Number(s2.total.toFixed(2)), id: c.id, topic: c.topic, status: c.status,
      channels: channels(c), bestSource: c.sources.map((x) => x.cls ?? "generic").sort((x, y) => (CLS_W[y] ?? 0) - (CLS_W[x] ?? 0))[0],
      ...(c.tried ? { tried: c.tried } : {}), ...(channels(c) >= 2 && !hasSolid(c) ? { seoOnly: true } : {}),
      claim: c.claim }; })
    .sort((x, y) => bottom ? x.score - y.score : y.score - x.score);
  print({ ranked: rows.slice(0, Number(flag("n") ?? 20)), total: rows.length,
          showing: bottom ? "weakest first - these are the prune/verify queue" : "strongest first",
          formula: "bestSourceClass * (1 + 0.3*(distinctChannels-1)) * statusWeight * ageDecay" });
} else if (cmd === "stats") {
  const by = (k: (c: Claim) => string) => claims.reduce<Record<string, number>>((a, c) => ((a[k(c)] = (a[k(c)] ?? 0) + 1), a), {});
  print({ total: claims.length, byStatus: by((c) => c.status), byTopic: by((c) => c.topic),
          byClass: claims.flatMap((c) => c.sources).reduce<Record<string, number>>((a, s2) => ((a[s2.cls ?? "generic"] = (a[s2.cls ?? "generic"] ?? 0) + 1), a), {}),
          seoOnlyButMultiSource: claims.filter((c) => channels(c) >= 2 && !hasSolid(c)).length,
          sourceChannels: new Set(claims.flatMap((c) => c.sources.map((s) => s.channel))).size });
} else {
  console.log(fs.readFileSync(new URL(import.meta.url)).toString().split("\n").slice(0, 26).join("\n"));
}

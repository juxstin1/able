// One-word capture.  tsx scripts/verdict.ts <subject> <keep|bin|meh> ["note"] [--context "house bass"] [--tag conditioning-bell]
//                    tsx scripts/verdict.ts list [subject-prefix] [--tag conditioning-bell]
//                    tsx scripts/verdict.ts tag <tag>          - latest verdict per subject carrying that tag
//                    tsx scripts/verdict.ts score <subject>
import { logVerdict, verdicts, score, byTag, type Verdict } from "../lib/taste.js";
import { print } from "../lib/live.js";

const args = process.argv.slice(2);
const ctxI = args.indexOf("--context");
const context = ctxI >= 0 ? args[ctxI + 1] : undefined;
const tagI = args.indexOf("--tag");
const tag = tagI >= 0 ? args[tagI + 1] : undefined;
const skip = new Set<number>();
if (ctxI >= 0) { skip.add(ctxI); skip.add(ctxI + 1); }
if (tagI >= 0) { skip.add(tagI); skip.add(tagI + 1); }
const pos = args.filter((a, i) => !a.startsWith("--") && !skip.has(i));

if (pos[0] === "list") print(verdicts((r) => (!pos[1] || r.subject.startsWith(pos[1])) && (!tag || r.tag === tag)));
else if (pos[0] === "tag") print(byTag(pos[1]));
else if (pos[0] === "score") print(score(pos[1]));
else {
  const [subject, v, note] = pos;
  if (!subject || !["keep", "bin", "meh"].includes(v)) throw new Error("usage: verdict.ts <subject> <keep|bin|meh> [note] [--context ctx] [--tag tag]");
  print(logVerdict(subject, v as Verdict, note, context, tag));
}

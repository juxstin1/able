// One-word capture.  tsx scripts/verdict.ts <subject> <keep|bin|meh> ["note"] [--context "house bass"]
//                    tsx scripts/verdict.ts list [subject-prefix]
//                    tsx scripts/verdict.ts score <subject>
import { logVerdict, verdicts, score, type Verdict } from "../lib/taste.js";
import { print } from "../lib/live.js";

const args = process.argv.slice(2);
const ctxI = args.indexOf("--context");
const context = ctxI >= 0 ? args[ctxI + 1] : undefined;
const pos = args.filter((a, i) => !a.startsWith("--") && !(ctxI >= 0 && i === ctxI + 1));

if (pos[0] === "list") print(verdicts((r) => !pos[1] || r.subject.startsWith(pos[1])));
else if (pos[0] === "score") print(score(pos[1]));
else {
  const [subject, v, note] = pos;
  if (!subject || !["keep", "bin", "meh"].includes(v)) throw new Error("usage: verdict.ts <subject> <keep|bin|meh> [note] [--context ctx]");
  print(logVerdict(subject, v as Verdict, note, context));
}

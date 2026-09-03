// The capture step. Must be cheap or only positives get logged.
//   add:      tsx scripts/chain.ts add "trap 808" operator:source saturator:shape fabfilter-pro-q-4:shape [--keep|--bin|--meh] [--note "..."]
//   verdict:  tsx scripts/chain.ts keep|bin|meh <chain-id> ["note"]
//   ask:      tsx scripts/chain.ts with <catalog-id>          -> what has gone well / badly with it
//   habits:   tsx scripts/chain.ts habits
//   list:     tsx scripts/chain.ts list
import { addChain, verdict, neighbours, habits, loadChains, type Slot, type Verdict } from "../lib/graph.js";
import { print } from "../lib/live.js";

const [cmd, ...rest] = process.argv.slice(2);
const flag = (n: string) => {
  const i = rest.indexOf(`--${n}`);
  return i >= 0 ? rest[i + 1] : undefined;
};

switch (cmd) {
  case "add": {
    const [context, ...nodeArgs] = rest.filter((a, i) => !a.startsWith("--") && !rest[i - 1]?.startsWith("--note"));
    const nodes = nodeArgs.map((s) => {
      const [ref, slot, ...note] = s.split(":");
      if (!slot) throw new Error(`node "${s}" needs ref:slot`);
      return { ref, slot: slot as Slot, note: note.length ? note.join(":") : undefined };
    });
    const v = (["keep", "bin", "meh"] as Verdict[]).find((x) => rest.includes(`--${x}`));
    print(addChain({ context, nodes, verdict: v, note: flag("note") }));
    break;
  }
  case "keep":
  case "bin":
  case "meh":
    print(verdict(rest[0], cmd, rest[1]));
    break;
  case "with":
    print(neighbours(rest[0]));
    break;
  case "habits":
    print(habits());
    break;
  case "list":
    print(loadChains().map((c) => ({ id: c.id, context: c.context, chain: c.nodes.map((n) => n.ref).join(" > "), last: c.verdicts.at(-1)?.v ?? "-" })));
    break;
  default:
    console.log("usage: chain.ts add|keep|bin|meh|with|habits|list");
}

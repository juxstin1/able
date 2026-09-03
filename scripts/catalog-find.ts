// usage: pnpm exec tsx scripts/catalog-find.ts "warm bass" [instrument|effect|midi-effect|pack]
import { find, type Kind } from "../lib/catalog.js";
import { print } from "../lib/live.js";

const [q, kind] = process.argv.slice(2);
print(find(q ?? "", kind as Kind | undefined));

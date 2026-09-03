// Verdicts on things that are not device chains: loops, patterns, sounds, whole scenes.
// One append-only file. Subjects are free text but follow "kind:id" (loop:trap-7, sound:operator-pulse, part:trap-7/hats).
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { ROOT } from "./paths.js";

export const TASTE_FILE = path.join(ROOT, "graph", "verdicts.yaml");
export const LOOPS_FILE = path.join(ROOT, "graph", "loops.yaml");

export type Verdict = "keep" | "bin" | "meh";
export interface VerdictRow {
  subject: string;
  v: Verdict;
  date: string;
  context?: string; // "house bass", "trap" - the situation it was judged in
  note?: string; // Justin's words, verbatim where possible
}
export interface LoopRecord {
  id: string; // style-seed
  date: string;
  style: string;
  bpm: number;
  root: string;
  kit: string;
  scene: number;
  parts: Record<string, unknown>; // generator params per part, enough to rebuild
  sounds: Record<string, string>; // part -> device/preset description
}

const today = () => new Date().toISOString().slice(0, 10);
const load = <T>(f: string, key: string): T[] => (fs.existsSync(f) ? (YAML.parse(fs.readFileSync(f, "utf8"))?.[key] ?? []) : []);
const save = (f: string, key: string, rows: unknown[]) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, YAML.stringify({ [key]: rows }));
};

export function logVerdict(subject: string, v: Verdict, note?: string, context?: string): VerdictRow {
  const rows = load<VerdictRow>(TASTE_FILE, "verdicts");
  const row: VerdictRow = { subject, v, date: today(), context, note };
  rows.push(row);
  save(TASTE_FILE, "verdicts", rows);
  return row;
}

export function verdicts(filter?: (r: VerdictRow) => boolean): VerdictRow[] {
  const rows = load<VerdictRow>(TASTE_FILE, "verdicts");
  return filter ? rows.filter(filter) : rows;
}

export function recordLoop(rec: Omit<LoopRecord, "date">): LoopRecord {
  const rows = load<LoopRecord>(LOOPS_FILE, "loops").filter((r) => r.id !== rec.id);
  const row = { date: today(), ...rec };
  rows.push(row);
  save(LOOPS_FILE, "loops", rows);
  return row;
}

/** Recency-weighted score for a subject: keep=+1, bin=-1, meh=0, half-life 90 days. */
export function score(subject: string, halfLifeDays = 90) {
  const now = Date.now();
  let s = 0;
  let n = 0;
  for (const r of verdicts((r) => r.subject === subject)) {
    const age = (now - Date.parse(r.date)) / 86_400_000;
    const w = Math.pow(0.5, age / halfLifeDays);
    s += w * (r.v === "keep" ? 1 : r.v === "bin" ? -1 : 0);
    n++;
  }
  return { subject, score: Number(s.toFixed(3)), n, low_confidence: n < 3 };
}

// Groove pool + per-clip groove. Needs the patched Remote Script (remote-script/patch.py).
// Justin's house setting: timing 60%, global amount 100% (Live's global range is 0..130%).
import type { Ableton } from "ableton-js";
import type { Clip } from "ableton-js/ns/clip";
import { Namespace } from "ableton-js/ns/index";

export interface GrooveInfo {
  id: string;
  name: string;
  base: string;
  timing_amount: number; // 0..1
  quantization_amount: number; // 0..1
  random_amount: number; // 0..1
  velocity_amount: number; // -1..1
}

export const JUSTIN_DEFAULT = { timing: 0.6, quantize: 0, random: 0, velocity: 0, global: 1.0 };

export async function groovePool(live: Ableton): Promise<GrooveInfo[]> {
  return (await (live.song as any).get("groove_pool")) ?? [];
}

/** Find a groove in the pool by exact name, case-insensitive substring, or index. */
export async function findGroove(live: Ableton, ref: string | number): Promise<GrooveInfo> {
  const pool = await groovePool(live);
  if (typeof ref === "number") {
    if (!pool[ref]) throw new Error(`no groove at index ${ref}; pool has ${pool.length}`);
    return pool[ref];
  }
  const exact = pool.find((g) => g.name === ref);
  const loose = pool.filter((g) => g.name.toLowerCase().includes(ref.toLowerCase()));
  const g = exact ?? (loose.length === 1 ? loose[0] : undefined);
  if (!g) throw new Error(`groove "${ref}" ${loose.length ? `ambiguous: ${loose.map((x) => x.name).join(", ")}` : `not in pool (${pool.map((x) => x.name).join(", ") || "empty"})`}`);
  return g;
}

/** Set a pool groove's amounts. Values 0..1 (velocity -1..1). */
export async function setGrooveParams(live: Ableton, g: GrooveInfo, p: { timing?: number; quantize?: number; random?: number; velocity?: number }) {
  const ns = new Namespace<any, any, any, any>(live, "groove", g.id);
  if (p.timing !== undefined) await ns.set("timing_amount", p.timing);
  if (p.quantize !== undefined) await ns.set("quantization_amount", p.quantize);
  if (p.random !== undefined) await ns.set("random_amount", p.random);
  if (p.velocity !== undefined) await ns.set("velocity_amount", p.velocity);
}

/** Global groove amount, 0..1.3 (UI shows 0..130%). */
export async function setGlobalGroove(live: Ableton, amount: number) {
  await live.song.set("groove_amount", Math.max(0, Math.min(1.3, amount)));
}

export async function clipGroove(clip: Clip): Promise<GrooveInfo | null> {
  return (await (clip as any).get("groove")) ?? null;
}

export async function setClipGroove(clip: Clip, g: GrooveInfo | null) {
  await (clip as any).set("groove", g ? g.id : null);
}

/** Every clip in session slots on the named tracks (only slots that have a clip). */
export async function clipsOnTracks(live: Ableton, trackNames: string[]) {
  const out: { track: string; slot: number; clip: Clip }[] = [];
  for (const t of await live.song.get("tracks")) {
    const name = await t.get("name");
    if (!trackNames.includes(name)) continue;
    const slots = await t.get("clip_slots");
    for (let i = 0; i < slots.length; i++) {
      const clip = await slots[i].get("clip");
      if (clip) out.push({ track: name, slot: i, clip });
    }
  }
  return out;
}

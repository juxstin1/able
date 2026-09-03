// Groove pool control.
//   tsx scripts/groove.ts pool                                  list grooves in the pool with their amounts
//   tsx scripts/groove.ts global 1.0                             global amount (0..1.3)
//   tsx scripts/groove.ts dial "Swing 16" --timing 0.6 [--quantize 0 --random 0 --velocity 0]
//   tsx scripts/groove.ts apply "Swing 16" --tracks "UKG Drums,UKG Bass" [--scene 4]   set clip groove on those tracks
//   tsx scripts/groove.ts clear --tracks "UKG Drums" [--scene 4]
//   tsx scripts/groove.ts show --tracks "UKG Drums,UKG Bass"     which groove each clip has
//   tsx scripts/groove.ts justin "Swing 16" --tracks "..."       = dial timing .6 + apply + global 1.0
import { withLive, print } from "../lib/live.js";
import { groovePool, findGroove, setGrooveParams, setGlobalGroove, clipGroove, setClipGroove, clipsOnTracks, JUSTIN_DEFAULT } from "../lib/groove.js";

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (n: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);
const num = (n: string) => (flag(n) !== undefined ? Number(flag(n)) : undefined);
const pos = args.slice(1).filter((a, i, arr) => !a.startsWith("--") && !(arr[i - 1] ?? "").startsWith("--"));
const tracks = flag("tracks")?.split(",").map((s) => s.trim()) ?? [];
const scene = num("scene");

print(
  await withLive(async (live) => {
    switch (cmd) {
      case "pool":
        return { global: await live.song.get("groove_amount"), pool: await groovePool(live) };
      case "global":
        await setGlobalGroove(live, Number(pos[0]));
        return { global: await live.song.get("groove_amount") };
      case "dial": {
        const g = await findGroove(live, pos[0]);
        await setGrooveParams(live, g, { timing: num("timing"), quantize: num("quantize"), random: num("random"), velocity: num("velocity") });
        return (await groovePool(live)).find((x) => x.id === g.id);
      }
      case "apply":
      case "clear":
      case "justin": {
        const g = cmd === "clear" ? null : await findGroove(live, pos[0]);
        if (cmd === "justin" && g) {
          await setGrooveParams(live, g, { timing: num("timing") ?? JUSTIN_DEFAULT.timing, quantize: JUSTIN_DEFAULT.quantize, random: JUSTIN_DEFAULT.random, velocity: JUSTIN_DEFAULT.velocity });
          await setGlobalGroove(live, num("global") ?? JUSTIN_DEFAULT.global);
        }
        const clips = (await clipsOnTracks(live, tracks)).filter((c) => scene === undefined || c.slot === scene - 1);
        for (const c of clips) await setClipGroove(c.clip, g);
        return { groove: g?.name ?? null, clips: clips.map((c) => `${c.track}[${c.slot + 1}]`), global: await live.song.get("groove_amount") };
      }
      case "show": {
        const clips = await clipsOnTracks(live, tracks);
        const rows = [];
        for (const c of clips) rows.push({ track: c.track, slot: c.slot + 1, name: await c.clip.get("name"), groove: (await clipGroove(c.clip))?.name ?? null });
        return rows;
      }
      default:
        return "usage: groove.ts pool | global <amt> | dial <groove> --timing .6 | apply <groove> --tracks a,b [--scene n] | clear --tracks a | show --tracks a | justin <groove> --tracks a,b";
    }
  }),
);

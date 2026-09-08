// Split a drum track's Arrangement clips into one track per element, so each can be processed and
// bounced on its own. The source track is read only - its clips are never edited or deleted.
// usage: node_modules/.bin/tsx scripts/drums-split.ts [--track "UKG Drums"] [--from-kit "Garage Kit.adg"]
//        [--kit "909 Core Kit.adg"] [--prefix "UKG "] [--keep-source-audible]
// Pitches are translated role-by-role through each kit's own pad map rather than copied straight
// across, so moving to a kit that actually has the roles (the Garage Kit has no clap and no open
// hat) puts the notes on the right pads instead of the same numbers.
import { withLive, track as findTrack, print } from "../lib/live.js";
import { loadOnTrack } from "../lib/browser.js";
import { getOrCreateTrack } from "../lib/song.js";
import { padsFor } from "../lib/kits.js";
import { writeMidi } from "../lib/midi.js";

const args = process.argv.slice(2);
const flag = (n: string, d: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const SRC = flag("track", "UKG Drums");
const FROM_KIT = flag("from-kit", "Garage Kit.adg");
// Default to the kit the part was written for. Swapping kits is opt-in because "padsFor says
// a role is missing" means no pad matched a NAME regex, not that the kit cannot cover the role:
// Garage Kit.adg reports no clap and no open hat, yet its Snare Trap is the layered clap and its
// Ride EDM Toned is the offbeat voice. Swapping it for a 909 satisfied the regex and sounded worse.
const KIT = flag("kit", FROM_KIT);
const PREFIX = flag("prefix", "UKG ");
const MUTE_SOURCE = !args.includes("--keep-source-audible");

// Grouped by what gets processed together, not one track per pad: the kick is its own sidechain
// source, snare and clap share a tail, the hats are filtered and panned as a unit.
const BUSES: [string, string[]][] = [
  ["Kick", ["kick"]],
  ["Snare+Clap", ["snare", "clap"]],
  ["Hats", ["chat", "ohat"]],
  ["Perc", ["rim", "perc", "tom", "crash", "ride"]],
];

const from = padsFor(FROM_KIT);
const to = padsFor(KIT);

// First role to claim a pitch keeps it. ohat is checked before ride on purpose: a kit with no open
// hat gets ohat aliased onto its ride pad by padsFor, and a note sitting there is the offbeat open
// hat the generator wrote, not a ride.
const ROLES = ["kick", "snare", "clap", "chat", "ohat", "rim", "perc", "tom", "crash", "ride"];
const roleOfPitch = new Map<number, string>();
for (const r of ROLES) {
  const p = from.pads[r as keyof typeof from.pads];
  if (p !== undefined && !roleOfPitch.has(p)) roleOfPitch.set(p, r);
}

type RawNote = { pitch: number; time: number; duration: number; velocity: number; muted?: boolean };

print(
  await withLive(async (live) => {
    const source = await findTrack(live, SRC);
    const bpm = (await live.song.get("tempo")) as number;

    const read: { start: number; length: number; notes: RawNote[] }[] = [];
    for (const c of await source.get("arrangement_clips")) {
      if (!((await c.get("is_midi_clip" as never)) as boolean)) continue;
      read.push({
        start: (await c.get("start_time" as never)) as number,
        length: (await c.get("length" as never)) as number,
        notes: (await c.get("notes" as never)) as RawNote[],
      });
    }
    if (!read.length) throw new Error(`no MIDI clips in the Arrangement on "${SRC}"`);

    const unknown = new Set<number>();
    const landedOnFallback = new Set<string>();
    const report: Record<string, unknown>[] = [];

    for (const [bus, roles] of BUSES) {
      const want = new Set(roles);
      const per = read.map((c) => ({
        start: c.start,
        length: c.length,
        notes: c.notes
          .filter((n) => {
            const r = roleOfPitch.get(n.pitch);
            if (!r) unknown.add(n.pitch);
            return r !== undefined && want.has(r);
          })
          .map((n) => {
            const r = roleOfPitch.get(n.pitch)!;
            if (to.missing.includes(r)) landedOnFallback.add(r);
            return { pitch: to.pads[r as keyof typeof to.pads], time: n.time, duration: n.duration, velocity: n.velocity, muted: n.muted ?? false };
          }),
      }));
      const total = per.reduce((s, c) => s + c.notes.length, 0);
      if (!total) { report.push({ bus, skipped: "no notes for these roles" }); continue; }

      // File on disk first, Live second - one .mid per bus at absolute arrangement positions.
      const slug = `${PREFIX}${bus}`.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
      writeMidi(`${slug}.mid`, per.flatMap((c) => c.notes.map((n) => ({ ...n, time: c.start + n.time }))), bpm);

      const name = `${PREFIX}${bus}`;
      const t = await getOrCreateTrack(live, name, (tr) => loadOnTrack(live, tr, "drums", [KIT]));
      const already = await t.get("arrangement_clips");
      if (already.length) throw new Error(`"${name}" already has ${already.length} Arrangement clip(s); refusing to stack on top. Delete them, or re-run with a different --prefix.`);

      for (const c of per) {
        if (!c.notes.length) continue;
        const clip = await t.createMidiClip(c.start, c.length);
        await clip.setNotes(c.notes);
        await clip.set("name", `${slug}-bar${c.start / 4 + 1}`);
      }
      report.push({ bus, track: name, clips: per.filter((c) => c.notes.length).length, notes: total });
    }

    if (MUTE_SOURCE) await source.set("mute", true);
    await live.application.view.showView("Arranger");

    return {
      source: SRC, sourceMuted: MUTE_SOURCE, fromKit: FROM_KIT, toKit: KIT, bpm,
      sourceClips: read.length,
      remap: Object.fromEntries([...roleOfPitch].map(([p, r]) => [r, `${p} -> ${to.pads[r as keyof typeof to.pads]}`])),
      buses: report,
      unknownPitches: [...unknown],
      rolesMissingFromTargetKit: [...landedOnFallback],
    };
  }),
);

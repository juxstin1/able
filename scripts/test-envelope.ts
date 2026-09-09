// Diagnostic only, not part of the pipeline: does the already-applied remote-script/patch-automation.py
// patch actually write a real, functional automation envelope - not just avoid throwing?
// insert_envelope_step's own Python always `return True` after calling insert_step, regardless of
// whether Live actually recorded anything, so "no AttributeError" only proves the methods are
// reachable. This additionally fires the clip and reads back DeviceParameter.automation_state and
// .value independently (both stock ableton-js properties, untouched by our patch) to confirm the
// envelope is real. Creates one throwaway track+clip; does not touch anything else in the set.
// usage: node_modules/.bin/tsx scripts/test-envelope.ts
import { withLive, print } from "../lib/live.js";
import { getOrCreateTrack } from "../lib/song.js";
import { loadOnTrack } from "../lib/browser.js";
import { pushClip } from "../lib/midi.js";
import { insertEnvelopeStep } from "../lib/envelope.js";

print(
  await withLive(async (live) => {
    const t = await getOrCreateTrack(live, "envelope-test", (tr) => loadOnTrack(live, tr, "audio_effects", ["Utility"]));
    const devices = await t.get("devices");
    let utility;
    for (const d of devices) if ((await d.get("name")) === "Utility") utility = d;
    if (!utility) throw new Error(`Utility didn't load; devices were: ${(await Promise.all(devices.map((d) => d.get("name")))).join(", ")}`);
    const params = await utility.get("parameters");
    let gain;
    for (const p of params) if ((await p.get("name")).trim() === "Output") gain = p;
    if (!gain) throw new Error(`no Output param; params were: ${(await Promise.all(params.map((p) => p.get("name")))).join(", ")}`);

    const min = await gain.get("min");
    const max = await gain.get("max");
    const baseline = min; // park it at the low end so a jump toward `target` is unambiguous
    const target = min + (max - min) * 0.9;
    await gain.set("value", baseline);

    const clip = await pushClip(live, t, 0, [], 4, "envelope-test");
    let insertOutcome: unknown;
    try {
      insertOutcome = await insertEnvelopeStep(clip, gain, 0, 4, 0.9);
    } catch (e: any) {
      return { outcome: "FAILED at insert_envelope_step", error: String(e?.message ?? e) };
    }

    // Independent read-back: fire the clip, poll the param's own automation_state (None/Playing/
    // Overridden) and value - neither is written by our patch, both are stock ableton-js.
    await clip.fire();
    const samples: { ms: number; state: number; value: number }[] = [];
    const start = Date.now();
    while (Date.now() - start < 1500) {
      samples.push({ ms: Date.now() - start, state: await gain.get("automation_state"), value: await gain.get("value") });
      await new Promise((r) => setTimeout(r, 150));
    }
    await clip.stop();

    const sawPlaying = samples.some((s) => s.state === 1); // AutomationState.Playing
    const movedTowardTarget = samples.some((s) => Math.abs(s.value - target) < Math.abs(baseline - target) * 0.5);

    return {
      outcome: sawPlaying && movedTowardTarget ? "CONFIRMED - real envelope, independently verified" : "UNCONFIRMED - call didn't throw, but automation_state/value never showed it playing",
      insertOutcome,
      baseline,
      target,
      sawPlaying,
      movedTowardTarget,
      samples,
    };
  }),
);

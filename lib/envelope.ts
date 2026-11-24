// Real, bakeable clip automation envelopes - Session-view clips only.
// Different from runAutomation() in song.ts, which puppeteers a parameter live in real time and
// bakes nothing. This calls Live.Clip.Clip.automation_envelope()/insert_step() directly, so once
// written it's a genuine envelope sitting in the clip - no playback needed to "capture" it.
//
// Needs remote-script/patch-automation.py run once (idempotent; already applied on this machine).
// CONFIRMED WORKING 2026-09-09 (scripts/test-envelope.ts, against Live 12.4.5): these Live API
// methods ARE reachable from a standard Control Surface script, no Max for Live or patched
// LomTypes.pyc required - the forum thread's uncertainty (viewtopic.php?t=214401) doesn't hold
// here. ableton-js ships Clip.createAutomationEnvelope as a private dead stub, but that's
// irrelevant: Clip.sendCommand() is a fully generic passthrough, so no ableton-js fork was ever
// needed - this file's insertEnvelopeStep/writeEnvelope already route through it.
//
// Always returns null for Arrangement clips - Live stores Arrangement automation on the track's
// automation lane, not in the clip, and that lane has no write API at all (see automate.ts).
import type { Clip } from "ableton-js/ns/clip";
import type { DeviceParameter } from "ableton-js/ns/device-parameter";

/** Insert one flat automation step: `value` (0..1 of the param's min..max) held from `time` for `length` beats. */
export async function insertEnvelopeStep(clip: Clip, parameter: DeviceParameter, time: number, length: number, value: number) {
  return clip.sendCommand("insert_envelope_step", { parameter_id: parameter.raw.id, time, length, value });
}

/** Write a sequence of steps in one go - `steps` are [time, length, value] beat-relative to the clip start. */
export async function writeEnvelope(clip: Clip, parameter: DeviceParameter, steps: [number, number, number][]) {
  for (const [time, length, value] of steps) await insertEnvelopeStep(clip, parameter, time, length, value);
}

export async function clearEnvelope(clip: Clip, parameter: DeviceParameter) {
  return clip.sendCommand("clear_envelope_for_param", { parameter_id: parameter.raw.id });
}

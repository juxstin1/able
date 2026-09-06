// Record Serum cutoff and wavetable-position movement into Arrangement from bar 13 to 64.
// Automation Arm must already be enabled manually in Live. The bass track is deliberately
// disarmed so no MIDI notes are recorded or overdubbed.
// usage: node_modules/.bin/tsx scripts/record-serum-arrangement-automation.ts
import { withLive, print, track } from "../lib/live.js";
import { runAutomation } from "../lib/song.js";

const TRACK = "ARR Bass 2026-09-04";
const DEVICE = "Serum 2";
const BPM = 132;
const START_BEAT = 48; // bar 13
const END_BEAT = 256; // end of bar 64
const LENGTH = END_BEAT - START_BEAT;

const cutoff: [number, number][] = [
  [0, 0.16], [12, 0.24], [16, 0.58], [48, 0.48], [80, 0.22],
  [96, 0.32], [112, 0.7], [144, 0.6], [176, 0.42], [192, 0.24], [208, 0.16],
];
const wavetable: [number, number][] = [
  [0, 0.04], [16, 0.16], [48, 0.22], [80, 0.05], [96, 0.1],
  [112, 0.28], [144, 0.18], [176, 0.1], [208, 0.04],
];

print(
  await withLive(async (live) => {
    const bass = await track(live, TRACK);
    const prior = {
      arm: await bass.get("arm"),
      loop: await live.song.get("loop"),
      punchIn: await live.song.get("punch_in"),
      punchOut: await live.song.get("punch_out"),
    };

    await live.song.beginUndoStep();
    try {
      await live.song.stopAllClips();
      await live.song.safeStopPlaying();
      await bass.set("arm", false);
      await live.song.set("loop", false);
      await live.song.set("punch_in", false);
      await live.song.set("punch_out", false);
      await live.song.set("current_song_time", START_BEAT);
      await live.application.view.showView("Arranger");

      await live.song.set("record_mode", 1);
      await live.song.safeStartPlaying();
      await Promise.all([
        runAutomation(live, { track: TRACK, device: DEVICE, param: "Filter 1 Freq", points: cutoff, bpm: BPM, tickMs: 100 }),
        runAutomation(live, { track: TRACK, device: DEVICE, param: "A WT Pos", points: wavetable, bpm: BPM, tickMs: 100 }),
      ]);

      await live.song.set("record_mode", 0);
      await live.song.safeStopPlaying();

      const device = (await bass.get("devices")).find((d) => d.raw.name === DEVICE);
      if (!device) throw new Error(`no device ${DEVICE} on ${TRACK}`);
      const params = await device.get("parameters");
      const state: Record<string, { value: number; automationState: number }> = {};
      for (const name of ["Filter 1 Freq", "A WT Pos"]) {
        const param = params.find((p) => p.raw.name === name);
        if (!param) throw new Error(`missing exposed parameter ${name}`);
        state[name] = { value: await param.get("value"), automationState: await param.get("automation_state") };
      }

      return {
        track: TRACK,
        device: DEVICE,
        startBar: START_BEAT / 4 + 1,
        endBar: END_BEAT / 4,
        beatsRecorded: LENGTH,
        seconds: LENGTH * 60 / BPM,
        bassTrackWasDisarmedDuringRecord: true,
        parameterState: state,
      };
    } finally {
      await live.song.set("record_mode", 0);
      await live.song.safeStopPlaying();
      await live.song.set("loop", prior.loop);
      await live.song.set("punch_in", prior.punchIn);
      await live.song.set("punch_out", prior.punchOut);
      await bass.set("arm", prior.arm);
      await live.song.endUndoStep();
      await live.application.view.showView("Arranger");
    }
  }),
);

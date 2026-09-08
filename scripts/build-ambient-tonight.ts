// Original 88-bar ambient electronic arrangement. Writes MIDI/score before touching Live.
// Usage: tsx scripts/build-ambient-tonight.ts [--files-only]
// Never replaces existing clips. Refuses a second live build with these track names.
import fs from 'node:fs';
import path from 'node:path';
import { withLive, print } from '../lib/live.js';
import { loadOnTrack, type Root } from '../lib/browser.js';
import { padsFor } from '../lib/kits.js';
import { writeMidi, type Note } from '../lib/midi.js';
import { ROOT } from '../lib/paths.js';

const BPM = 118;
const DIR = path.join(ROOT, 'project-files', 'September Light Project');
const PREFIX = 'SL ';
type Section = { name: string; bar: number; bars: number; energy: number };
const sections: Section[] = [
  { name: '01 - close piano', bar: 0, bars: 8, energy: 0 },
  { name: '02 - room opens', bar: 8, bars: 8, energy: 1 },
  { name: '03 - first pulse', bar: 16, bars: 16, energy: 2 },
  { name: '04 - into the light', bar: 32, bars: 16, energy: 3 },
  { name: '05 - held breath', bar: 48, bars: 8, energy: 0 },
  { name: '06 - return', bar: 56, bars: 16, energy: 4 },
  { name: '07 - dissolve', bar: 72, bars: 8, energy: 1 },
  { name: '08 - last piano', bar: 80, bars: 8, energy: -1 },
];
const harmony = [
  { name: 'Em9', bass: 40, root: 52, tones: [59, 62, 66, 67] },
  { name: 'Cmaj9', bass: 36, root: 48, tones: [59, 62, 64, 67] },
  { name: 'Gmaj7', bass: 43, root: 55, tones: [59, 62, 66, 69] },
  { name: 'Dadd9', bass: 38, root: 50, tones: [57, 62, 64, 66] },
];
const kit = padsFor('808 Core Kit.adg');
if (!kit.file || ['kick', 'snare', 'chat'].some(p => kit.missing.includes(p))) throw new Error('808 pad mapping incomplete');
const pad = kit.pads;
let rng = 906118;
function random() { rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5; return (rng >>> 0) / 4294967296; }
function note(pitch: number, time: number, duration: number, velocity: number, timing = 0.014): Note {
  return { pitch, time: Math.max(0, time + (random() - 0.5) * timing), duration,
    velocity: Math.max(1, Math.min(127, Math.round(velocity + (random() - 0.5) * 8))) };
}
type Part = { name: string; color: number; fader: number; pan: number; source: [Root, string[]]; fx: string[]; clips: { section: string; start: number; beats: number; notes: Note[] }[] };
const parts: Part[] = [
  { name: 'SL Piano', color: 17, fader: 0.72, pan: -0.07, source: ['packs', ['Upright Piano by Spitfire Audio', 'Instruments', 'Piano & Keys', 'Upright Piano.adg']], fx: ['EQ Eight', 'Reverb'], clips: [] },
  { name: 'SL Air', color: 20, fader: 0.53, pan: 0.04, source: ['instruments', ['Analog', 'Pad', "Johnny's Soft Pad.adv"]], fx: ['EQ Eight', 'Reverb'], clips: [] },
  { name: 'SL Memory', color: 21, fader: 0.60, pan: 0.13, source: ['instruments', ['Electric', 'Piano & Keys', 'E-Piano MKI Mellow.adv']], fx: ['EQ Eight', 'Delay', 'Reverb'], clips: [] },
  { name: 'SL Sub', color: 25, fader: 0.67, pan: 0, source: ['instruments', ['Operator']], fx: [], clips: [] },
  { name: 'SL Kick', color: 8, fader: 0.71, pan: 0, source: ['drums', ['808 Core Kit.adg']], fx: [], clips: [] },
  { name: 'SL Snare', color: 9, fader: 0.57, pan: -0.03, source: ['drums', ['808 Core Kit.adg']], fx: ['Reverb'], clips: [] },
  { name: 'SL Dust', color: 10, fader: 0.54, pan: 0.09, source: ['drums', ['808 Core Kit.adg']], fx: ['EQ Eight', 'Reverb'], clips: [] },
];

for (const sec of sections) {
  const out: Note[][] = parts.map(() => []);
  for (let b = 0; b < sec.bars; b++) {
    const absoluteBar = sec.bar + b;
    const chord = harmony[Math.floor((absoluteBar % 8) / 2)];
    const t = b * 4;
    const even = b % 2 === 0;
    const ending = sec.energy === -1;
    const climax = sec.energy >= 3;
    // Loose, voiced piano: two-bar chords, a small answer, and occasional broken voicings.
    if (even && (!ending || b < 6)) {
      out[0].push(note(chord.root, t, 5.9, ending ? 40 : 48, 0));
      chord.tones.forEach((p, j) => out[0].push(note(p, t + 0.025 * (j + 1), climax ? 3.4 : 5.6, (climax ? 63 : 54) + j * 2)));
      if (sec.energy >= 1 && !ending) {
        const stab = sec.energy >= 3 ? 3.55 : 4.55;
        chord.tones.slice(1).forEach((p, j) => out[0].push(note(p, t + stab + j * 0.018, 2.55, 42 + j * 3)));
      }
    }
    if (ending && b === 6) {
      [52, 59, 64, 66, 71].forEach((p, j) => out[0].push(note(p, t + j * 0.065, 7.5 - j * 0.065, 43 - j * 2, 0)));
    }
    // The pad enters after the bare opening and leaves the final resolution to the piano.
    if (even && absoluteBar >= 8 && !ending) {
      const tones = sec.energy === 0 ? chord.tones.slice(1) : chord.tones;
      tones.forEach(p => out[1].push(note(p, t + 0.08, 7.85, sec.energy >= 3 ? 61 : sec.energy === 0 ? 39 : 48, 0)));
    }
    // A sparse original melody with an answer in the second half of each eight-bar phrase.
    if ((sec.energy >= 1 || sec.bar === 0) && !ending) {
      const phraseBar = absoluteBar % 8;
      const motifs: Record<number, [number, number, number, number][]> = {
        0: [[71, 0.75, 0.6, 59], [66, 2.5, 1.1, 51]],
        1: [[64, 1.25, 1.8, 61]],
        2: [[67, 0.55, 1.5, 55]],
        3: [[64, 2.25, 1.25, 47]],
        4: [[71, 0.75, 0.65, 61], [69, 2.55, 0.7, 52]],
        5: [[66, 1.25, 1.7, 57]],
        6: [[64, 0.55, 1.1, 55], [66, 2.65, 0.8, 49]],
        7: [[69, 0.75, 1.25, 54]],
      };
      if (sec.energy > 0 || absoluteBar < 4) for (const [p, at, len, vel] of motifs[phraseBar]) {
        out[2].push(note(p, t + at, len, vel + (sec.energy === 4 ? 6 : 0)));
      }
      if (sec.energy === 4 && b >= 8 && even) out[2].push(note(chord.tones.at(-1)! + 12, t + 3.3, 0.4, 36));
    }
    // Bass sustains in the spaces between the kick, with a fifth pickup on phrase boundaries.
    if (sec.energy >= 2) {
      out[3].push(note(chord.bass, t + 0.30, even ? 1.42 : 2.05, 80, 0));
      out[3].push(note(chord.bass, t + (even ? 2.82 : 2.60), even ? 0.92 : 1.10, 68, 0));
      if (climax && b % 8 === 7) out[3].push(note(47, t + 3.78, 0.16, 57, 0));
    } else if (sec.energy === 1 && even && absoluteBar >= 12) out[3].push(note(chord.bass, t + 0.2, 5.5, 60, 0));
    if (sec.energy >= 2) {
      out[4].push(note(pad.kick, t, 0.18, sec.energy === 4 ? 104 : 94, 0));
      out[4].push(note(pad.kick, t + (even ? 2.5 : 2.25), 0.16, 80, 0));
      if (climax && b % 4 === 2) out[4].push(note(pad.kick, t + 3.5, 0.15, 66, 0));
      // Restrained backbeat; a missing final snare creates a breath before section changes.
      for (const beat of [1.025, 3.035]) if (!(b === sec.bars - 1 && beat > 3)) out[5].push(note(pad.snare, t + beat, 0.13, beat < 2 ? 72 : 79));
      if (climax && b % 4 === 3) out[5].push(note(pad.rim, t + 2.80, 0.10, 42));
    }
    if ((sec.energy >= 1 && absoluteBar >= 12 && absoluteBar < 76) || (sec.bar === 48 && b >= 6)) {
      const positions = sec.energy >= 3 ? [0.5, 1.0, 1.57, 2.5, 2.82, 3.5, 3.82] : [0.5, 1.57, 2.5, 3.57];
      for (const [j, at] of positions.entries()) out[6].push(note(pad.chat, t + at, 0.055, j % 2 ? 34 : 55));
      if (sec.energy >= 3 && b % 2) out[6].push(note(pad.perc, t + 3.28, 0.09, 43));
    }
  }
  out.forEach((notes, i) => {
    notes.sort((a,b) => a.time-b.time || a.pitch-b.pitch);
    for (const n of notes) {
      n.duration = Math.min(n.duration, sec.bars * 4 - n.time);
      if (n.duration <= 0 || !Number.isFinite(n.time)) throw new Error('Invalid note');
    }
    if (notes.length) parts[i].clips.push({ section: sec.name, start: sec.bar * 4, beats: sec.bars * 4, notes });
  });
}
fs.mkdirSync(path.join(DIR, 'MIDI'), { recursive: true });
for (const part of parts) writeMidi(path.join(DIR, 'MIDI', `${part.name}.mid`), part.clips.flatMap(c => c.notes.map(n => ({ ...n, time: c.start + n.time }))), BPM);
fs.writeFileSync(path.join(DIR, 'score.json'), JSON.stringify({ title: 'September Light', bpm: BPM, key: 'E minor', bars: 88, renderBars: 92, sections, harmony, parts }, null, 2));
if (process.argv.includes('--files-only')) { print({ files: DIR, bpm: BPM, bars: 88 }); } else {
  print(await withLive(async live => {
    const existing = await live.song.get('tracks');
    for (const t of existing) {
      if ((await t.get('name')).startsWith(PREFIX)) throw new Error('SL tracks already exist; refusing duplicate build');
      if ((await t.get('arrangement_clips')).length) throw new Error('Open set has other arrangement material; refusing to change tempo');
      for (const s of await t.get('clip_slots')) if (await s.get('has_clip')) throw new Error('Open set has other Session material; refusing to change tempo');
    }
    await live.song.stopPlaying();
    await live.song.set('tempo', BPM);
    await live.song.set('loop', false);
    await live.song.set('metronome', 0);
    const receipt: any[] = [];
    const params: Record<string, unknown> = {};
    await live.song.beginUndoStep();
    try {
      for (const part of parts) {
        const t = await live.song.createMidiTrack(-1);
        await t.set('name', part.name);
        await t.set('color_index', part.color);
        await t.set('arm', false);
        await loadOnTrack(live, t, part.source[0], part.source[1]);
        for (const fx of part.fx) await loadOnTrack(live, t, 'audio_effects', [fx]);
        const mixer = await t.get('mixer_device');
        await (await mixer.get('volume')).set('value', part.fader);
        await (await mixer.get('panning')).set('value', part.pan);
        for (const c of part.clips) {
          const clip = await t.createMidiClip(c.start, c.beats);
          await clip.setNotes(c.notes.map(n => ({ ...n, muted: false })));
          await clip.set('name', c.section);
          await clip.set('color_index', part.color);
        }
        const devs = await t.get('devices');
        params[part.name] = await Promise.all(devs.map(async d => ({ name: await d.get('name'), parameters: await Promise.all((await d.get('parameters')).map(async p => ({ name: await p.get('name'), min: await p.get('min'), max: await p.get('max'), value: await p.get('value') }))) })));
        receipt.push({ name: part.name, clips: part.clips.length, notes: part.clips.reduce((n,c)=>n+c.notes.length,0), devices: devs.map(d=>d.raw.name) });
        console.log('Built ' + part.name);
        fs.writeFileSync(path.join(DIR, 'build-progress.json'), JSON.stringify(receipt, null, 2));
      }
      for (const sec of sections) {
        await live.song.set('current_song_time', sec.bar * 4);
        await live.song.setOrDeleteCue();
        const cues = await live.song.get('cue_points');
        for (const cue of cues) if (Math.abs((await cue.get('time')) - sec.bar * 4) < 0.1) await cue.set('name' as never, sec.name as never);
      }
      await live.song.set('loop_start', 0);
      await live.song.set('loop_length', 368);
      await live.song.set('current_song_time', 0);
      await live.song.set('back_to_arranger', 0);
      await live.application.view.showView('Arranger');
      fs.writeFileSync(path.join(DIR, 'device-parameters.json'), JSON.stringify(params, null, 2));
      fs.writeFileSync(path.join(DIR, 'build-receipt.json'), JSON.stringify({ bpm: BPM, arrangementBars: 88, renderBars: 92, tracks: receipt }, null, 2));
      return { folder: DIR, bpm: BPM, key: 'E minor', seconds: 352 * 60 / BPM, tracks: receipt };
    } finally { await live.song.stopPlaying(); await live.song.endUndoStep(); }
  }));
}

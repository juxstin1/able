// Import the user-supplied 16-bar Untitled5 MIDI into the currently empty Live set.
// usage: tsx scripts/import-untitled5.ts [--files-only]
// Re-running refuses existing U5 tracks; no user tracks or clips are overwritten.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { withLive, print } from '../lib/live.js';
import { loadOnTrack, type Root } from '../lib/browser.js';
import { padsFor } from '../lib/kits.js';
import { ROOT } from '../lib/paths.js';
import type { Note } from '../lib/midi.js';

const SOURCE = 'C:/Users/juxxs/Music/tracks/remakes/untitled5';
const DIR = path.join(ROOT, 'project-files', 'Untitled5 Study');
const BPM = 123.70, BEATS = 64;
// Read SMF time directly in ticks, preserving the supplied 220-PPQ triplet rounding.
function readMidi(file: string) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'MThd') throw new Error('Not MIDI');
  const ppq = b.readUInt16BE(12);
  if (ppq & 0x8000) throw new Error('SMPTE division unsupported');
  let p = 8 + b.readUInt32BE(4);
  const tracks: { name: string; notes: Note[] }[] = [];
  const tempos: number[] = [];
  const vlq = () => { let v = 0, c; do { c = b[p++]; v = (v << 7) | (c & 127); } while (c & 128); return v; };
  while (p < b.length) {
    if (b.toString('ascii',p,p+4) !== 'MTrk') throw new Error('Unexpected MIDI chunk');
    const end = p + 8 + b.readUInt32BE(p+4); p += 8;
    let ticks = 0, running = 0, name = '';
    const notes: Note[] = [], active = new Map<string,{ticks:number;velocity:number}[]>();
    while (p < end) {
      ticks += vlq();
      let status = b[p];
      if (status & 128) { p++; if (status < 0xf0) running=status; }
      else status=running;
      if (!status) throw new Error('Invalid running status');
      if (status===0xff) {
        const type=b[p++], len=vlq();
        if(type===3) name=b.toString('utf8',p,p+len);
        if(type===0x51) tempos.push(60000000 / b.readUIntBE(p,3));
        p+=len; continue;
      }
      if(status===0xf0 || status===0xf7) { const len=vlq(); p+=len; continue; }
      const type=status & 0xf0, ch=status & 15, a=b[p++];
      const v=(type===0xc0 || type===0xd0) ? 0 : b[p++];
      const key=`${ch}:${a}`;
      if(type===0x90 && v>0) { const q=active.get(key)??[]; q.push({ticks,velocity:v}); active.set(key,q); }
      if(type===0x80 || (type===0x90 && v===0)) {
        const on=active.get(key)?.shift();
        if(!on) throw new Error('Unpaired MIDI note off');
        notes.push({pitch:a,time:on.ticks/ppq,duration:(ticks-on.ticks)/ppq,velocity:on.velocity});
      }
    }
    if([...active.values()].some(q=>q.length)) throw new Error('Unclosed MIDI notes');
    tracks.push({name,notes:notes.sort((a,b)=>a.time-b.time||a.pitch-b.pitch)});
  }
  return {ppq,tempos,tracks};
}
const data=readMidi(path.join(SOURCE,'05_full_loop.mid'));
if(!data.tempos.length || data.tempos.some(t=>Math.abs(t-BPM)>0.001)) throw new Error('Unexpected source tempo');
const from=(name:string) => { const t=data.tracks.find(t=>t.name===name); if(!t) throw new Error(`Missing ${name}`); return t.notes; };
const kit=padsFor('909 Core Kit.adg');
if(!kit.file || ['kick','clap','chat'].some(r=>kit.missing.includes(r))) throw new Error('909 kit mapping incomplete');
const drum=(gm:number,actual:number)=>from('Drums').filter(n=>n.pitch===gm).map(n=>({...n,pitch:actual}));
type Part={name:string;notes:Note[];source:[Root,string[]];fx:string[];volume:number;color:number};
const parts:Part[]=[
  {name:'U5 Riff',notes:[...from('Lead'),...from('Lead -1oct')].sort((a,b)=>a.time-b.time||a.pitch-b.pitch),source:['instruments',['Wavetable','Synth Lead','Bright SAW Lead.adv']],fx:['EQ Eight','Chorus-Ensemble','Reverb'],volume:0.61,color:21},
  {name:'U5 Chords',notes:from('Pad'),source:['instruments',['Analog','Pad',"Johnny's Soft Pad.adv"]],fx:['EQ Eight','Reverb'],volume:0.48,color:20},
  {name:'U5 Bass',notes:from('Bass'),source:['instruments',['Operator']],fx:['Saturator','EQ Eight','Utility'],volume:0.67,color:25},
  {name:'U5 Kick',notes:drum(36,kit.pads.kick),source:['drums',['909 Core Kit.adg']],fx:[],volume:0.76,color:8},
  {name:'U5 Clap',notes:drum(39,kit.pads.clap),source:['drums',['909 Core Kit.adg']],fx:['Reverb'],volume:0.63,color:9},
  {name:'U5 Hats optional',notes:drum(42,kit.pads.chat),source:['drums',['909 Core Kit.adg']],fx:[],volume:0.41,color:10},
];
if(parts.reduce((s,p)=>s+p.notes.length,0)!==data.tracks.reduce((s,t)=>s+t.notes.length,0)) throw new Error('Lost source notes');
for(const part of parts) for(const n of part.notes) if(n.time<0 || n.time+n.duration>BEATS+0.01) throw new Error('Source outside 16 bars');
fs.mkdirSync(path.join(DIR,'Source'),{recursive:true});
const hashes:Record<string,string>={};
for(const f of ['01_bass.mid','02_lead_riff.mid','03_chords.mid','04_drums.mid','05_full_loop.mid','preview_loop.wav','README.md']) {
  const src=fs.readFileSync(path.join(SOURCE,f));
  fs.writeFileSync(path.join(DIR,'Source',f),src);
  hashes[f]=crypto.createHash('sha256').update(src).digest('hex');
}
fs.writeFileSync(path.join(DIR,'score.json'),JSON.stringify({bpm:BPM,beats:BEATS,source:SOURCE,ppq:data.ppq,hashes,parts},null,2));
if(process.argv.includes('--files-only')) print({folder:DIR,parts:parts.map(p=>({name:p.name,notes:p.notes.length}))});
else print(await withLive(async live=>{
  const tracks=await live.song.get('tracks');
  for(const t of tracks){
    if((await t.get('name')).startsWith('U5 ')) throw new Error('U5 tracks exist; refusing duplicate import');
    if((await t.get('arrangement_clips')).length) throw new Error('Other arrangement material present; refusing tempo change');
    for(const slot of await t.get('clip_slots')) if(await slot.get('has_clip')) throw new Error('Other Session material present; refusing tempo change');
  }
  await live.song.stopPlaying();
  await live.song.beginUndoStep();
  const receipt:any[]=[],parameters:Record<string,unknown>={};
  try{
    await live.song.set('tempo',BPM);
    await live.song.set('metronome',0);
    for(const part of parts){
      const t=await live.song.createMidiTrack(-1);
      await t.set('name',part.name); await t.set('color_index',part.color); await t.set('arm',false);
      await loadOnTrack(live,t,part.source[0],part.source[1]);
      for(const fx of part.fx) await loadOnTrack(live,t,'audio_effects',[fx]);
      const mixer=await t.get('mixer_device');
      await (await mixer.get('volume')).set('value',part.volume);
      const clip=await t.createMidiClip(0,BEATS);
      await clip.setNotes(part.notes.map(n=>({...n,muted:false})));
      await clip.set('name',`${part.name} | Bm-G-D-A | 16 bars`);
      await clip.set('color_index',part.color);
      const actual=await clip.getNotes(0,0,BEATS,128);
      const sorted=actual.sort((a,b)=>a.time-b.time||a.pitch-b.pitch);
      const expected=[...part.notes].sort((a,b)=>a.time-b.time||a.pitch-b.pitch);
      if(sorted.length!==expected.length) throw new Error(`${part.name}: note count mismatch`);
      let error=0;
      for(let i=0;i<sorted.length;i++){
        if(sorted[i].pitch!==expected[i].pitch || sorted[i].velocity!==expected[i].velocity) throw new Error(`${part.name}: pitch/velocity mismatch`);
        error=Math.max(error,Math.abs(sorted[i].time-expected[i].time),Math.abs(sorted[i].duration-expected[i].duration));
      }
      if(error>0.0001) throw new Error(`${part.name}: timing mismatch ${error}`);
      const devs=await t.get('devices');
      parameters[part.name]=await Promise.all(devs.map(async d=>({name:await d.get('name'),parameters:await Promise.all((await d.get('parameters')).map(async p=>({name:await p.get('name'),min:await p.get('min'),max:await p.get('max'),value:await p.get('value'),items:await p.get('is_quantized')?await p.get('value_items'):undefined})))})));
      receipt.push({name:part.name,notes:actual.length,start:await clip.get('start_time'),end:await clip.get('end_time'),maxTimingErrorBeats:error,devices:devs.map(d=>d.raw.name)});
      fs.writeFileSync(path.join(DIR,'build-progress.json'),JSON.stringify(receipt,null,2));
      console.log('Imported and verified '+part.name);
    }
    await live.song.set('loop_start',0); await live.song.set('loop_length',BEATS); await live.song.set('loop',true);
    await live.song.set('current_song_time',0); await live.song.set('back_to_arranger',0);
    await live.application.view.showView('Arranger');
    fs.writeFileSync(path.join(DIR,'device-parameters.json'),JSON.stringify(parameters,null,2));
    fs.writeFileSync(path.join(DIR,'build-receipt.json'),JSON.stringify({bpm:await live.song.get('tempo'),beats:BEATS,tracks:receipt},null,2));
    return {folder:DIR,bpm:await live.song.get('tempo'),bars:16,tracks:receipt};
  } finally {await live.song.stopPlaying();await live.song.endUndoStep();}
}));

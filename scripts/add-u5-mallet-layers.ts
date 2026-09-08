// Add two new instrument tracks around Justin's current 56-bar arrangement.
// usage: tsx scripts/add-u5-mallet-layers.ts
// Existing tracks/devices/clips are read only. A separate pass checks playback levels.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { withLive,print } from '../lib/live.js';
import { loadOnTrack, type Root } from '../lib/browser.js';
import { setParams } from '../lib/song.js';
import { writeMidi,type Note } from '../lib/midi.js';
import { ROOT } from '../lib/paths.js';
import { addChain,loadChains,neighbours } from '../lib/graph.js';
const DIR=path.join(ROOT,'project-files','Untitled5 Study');
const snapshot=JSON.parse(fs.readFileSync(path.join(DIR,'before-mallet-layers.json'),'utf8'));
const hz=(f:number)=>Math.log(f/10)/Math.log(2200);
const hash=(x:unknown)=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const source=(name:string)=>{
  const tracks=snapshot.tracks.filter((t:any)=>t.name===name);
  if(tracks.length!==1) throw new Error(`Expected one ${name}`);
  const c=tracks[0].clips.find((c:any)=>c.midi&&!c.muted&&c.startMarker===0&&c.loopEnd>=16);
  if(!c) throw new Error(`No usable phrase on ${name}`);
  return {track:tracks[0],clip:c};
};
const riff=source('U5 Riff'),chords=source('U5 Chords');
const firstFour=(ns:Note[])=>ns.filter(n=>n.time>=0&&n.time<16);
// Pick the higher note at each supplied onset, rather than a pitch cutoff that
// would accidentally retain some lower-octave notes where the ranges overlap.
const upperMap=new Map<string,Note>();
for(const n of firstFour(riff.clip.notes)){
  const key=n.time.toFixed(5),old=upperMap.get(key);
  if(!old||n.pitch>old.pitch) upperMap.set(key,{...n});
}
const upper=[...upperMap.values()].sort((a,b)=>a.time-b.time);
if(upper.length!==48) throw new Error(`Expected 48 triplet onsets in four bars, found ${upper.length}`);
const chordMap=new Map<string,Note[]>();
for(const n of firstFour(chords.clip.notes)){
  const key=n.time.toFixed(5),list=chordMap.get(key)??[];list.push({...n});chordMap.set(key,list);
}
if(chordMap.size!==4) throw new Error('Expected four one-bar chords');
const voicing=[...chordMap.values()].flatMap(ns=>ns.sort((a,b)=>a.pitch-b.pitch).slice(-3));
function phrase(base:Note[],beats:number,vel:number,kind:'marimba'|'piano'){
  const out:Note[]=[];
  for(let offset=0;offset<beats;offset+=16) for(const n of base){
    const time=offset+n.time;
    if(time>=beats)continue;
    const velocity=kind==='marimba'?Math.round(n.velocity*vel):Math.round(vel+(n.pitch%5)-2);
    out.push({...n,time,duration:Math.min(kind==='piano'?3.65:n.duration,beats-time),velocity,muted:false});
  }
  return out.sort((a,b)=>a.time-b.time||a.pitch-b.pitch);
}
const marimbaSections=[
  {start:0,beats:32,vel:0.58,name:'Marimba | quiet opening'},
  {start:128,beats:32,vel:0.82,name:'Marimba | kick-free passage'},
  {start:192,beats:16,vel:0.60,name:'Marimba | last answer'},
];
const pianoSections=[
  {start:0,beats:32,vel:48,name:'Electric piano | opening'},
  {start:64,beats:64,vel:43,name:'Electric piano | under the riff'},
  {start:128,beats:32,vel:62,name:'Electric piano | open space'},
  {start:160,beats:32,vel:51,name:'Electric piano | return'},
  {start:192,beats:32,vel:43,name:'Electric piano | ending'},
];
type Layer={name:string;color:number;volume:number;pan:number;source:[Root,string[]];clipData:{start:number;beats:number;name:string;notes:Note[]}[];highpass:number;wet:number};
const layers:Layer[]=[
  {name:'U5 Marimba',color:17,volume:0.59,pan:-0.10,source:['instruments',['Collision','Mallets','Marimba Classic.adv']],clipData:marimbaSections.map(s=>({...s,notes:phrase(upper,s.beats,s.vel,'marimba')})),highpass:155,wet:0.18},
  {name:'U5 Electric Piano',color:22,volume:0.57,pan:0.10,source:['instruments',['Electric','Piano & Keys','E-Piano MKI Mellow.adv']],clipData:pianoSections.map(s=>({...s,notes:phrase(voicing,s.beats,s.vel,'piano')})),highpass:135,wet:0.16},
];
fs.mkdirSync(path.join(DIR,'Mallet Layers'),{recursive:true});
const layerDir=path.join(DIR,'Mallet Layers');
for(const l of layers) writeMidi(path.join(layerDir,l.name+'.mid'),l.clipData.flatMap(c=>c.notes.map(n=>({...n,time:n.time+c.start}))),snapshot.bpm);
fs.writeFileSync(path.join(layerDir,'score.json'),JSON.stringify({bpm:snapshot.bpm,layers,sourceHash:hash({riff:riff.clip.notes,chords:chords.clip.notes}),chainHistory:{collision:neighbours('collision'),electric:neighbours('electric')}},null,2));
print(await withLive(async live=>{
  const existing=await live.song.get('tracks');
  if(Math.abs(await live.song.get('tempo')-snapshot.bpm)>0.001)throw new Error('Song tempo changed since inspection');
  if(existing.some(t=>layers.some(l=>l.name===t.raw.name)))throw new Error('Layer tracks already exist; refusing duplicate build');
  for(const src of [riff,chords]){
    const ts=existing.filter(t=>t.raw.id===src.track.id);
    if(ts.length!==1)throw new Error('Inspected source track no longer exists');
    const cs=await ts[0].get('arrangement_clips');
    const c=cs.find(c=>c.raw.id===src.clip.id);
    if(!c||hash(await c.get('notes' as never))!==hash(src.clip.notes))throw new Error('Source notes changed since inspection; inspect again');
  }
  const baseline=await Promise.all(existing.map(async t=>({id:t.raw.id,name:await t.get('name'),mute:await t.get('mute'),devices:(await t.get('devices')).map(d=>d.raw.id),clips:(await t.get('arrangement_clips')).map(c=>({id:c.raw.id,start:c.raw.start_time,end:c.raw.end_time}))})));
  const receipts:any[]=[],parameters:Record<string,unknown>={};
  await live.song.beginUndoStep();
  try{
    for(const l of layers){
      const t=await live.song.createMidiTrack(-1);
      await t.set('name',l.name);await t.set('color_index',l.color);await t.set('arm',false);
      await loadOnTrack(live,t,l.source[0],l.source[1]);
      for(const fx of ['EQ Eight','Reverb'])await loadOnTrack(live,t,'audio_effects',[fx]);
      const mix=await t.get('mixer_device');
      await (await mix.get('volume')).set('value',l.volume);
      await (await mix.get('panning')).set('value',l.pan);
      const devices=await t.get('devices');
      parameters[l.name]=await Promise.all(devices.map(async d=>({name:await d.get('name'),params:await Promise.all((await d.get('parameters')).map(async p=>({name:await p.get('name'),min:await p.get('min'),max:await p.get('max'),value:await p.get('value')})))})));
      for(const [dn,values] of Object.entries<Record<string,number>>({'EQ Eight':{'1 Filter On A':1,'1 Filter Type A':1,'1 Frequency A':hz(l.highpass)},'Reverb':{'Dry/Wet':l.wet,'Decay Time':0.34,'In Lo Cut On':1}})){
        const missing=await setParams(t,dn,values);
        if(missing.length)throw new Error(`${l.name} unapplied settings: ${missing.join(',')}`);
      }
      for(const c of l.clipData){
        const clip=await t.createMidiClip(c.start,c.beats);
        await clip.setNotes(c.notes.map(n=>({...n,muted:false})));
        await clip.set('name',c.name);await clip.set('color_index',l.color);
        const actual=(await clip.getNotes(0,0,c.beats,128)).sort((a,b)=>a.time-b.time||a.pitch-b.pitch);
        if(actual.length!==c.notes.length)throw new Error('Note count mismatch');
        const match=actual.every((n,i)=>n.pitch===c.notes[i].pitch&&n.velocity===c.notes[i].velocity&&Math.abs(n.time-c.notes[i].time)<0.0001&&Math.abs(n.duration-c.notes[i].duration)<0.0001);
        if(!match)throw new Error('Note readback mismatch');
        receipts.push({track:l.name,clip:c.name,startBar:c.start/4+1,endBar:(c.start+c.beats)/4,notes:actual.length,verified:true});
      }
      console.log('Added '+l.name);
    }
    const after=await Promise.all(existing.map(async t=>({id:t.raw.id,name:await t.get('name'),mute:await t.get('mute'),devices:(await t.get('devices')).map(d=>d.raw.id),clips:(await t.get('arrangement_clips')).map(c=>({id:c.raw.id,start:c.raw.start_time,end:c.raw.end_time}))})));
    const unchanged=hash(baseline)===hash(after);
    const report={receipts,existingStructureUnchangedDuringBuild:unchanged,existingTrackIds:existing.map(t=>t.raw.id),currentPosition:await live.song.get('current_song_time'),loopStart:await live.song.get('loop_start'),loopLength:await live.song.get('loop_length')};
    fs.writeFileSync(path.join(layerDir,'build-receipt.json'),JSON.stringify(report,null,2));
    fs.writeFileSync(path.join(layerDir,'preset-parameters.json'),JSON.stringify(parameters,null,2));
    for(const ref of ['collision','electric']){
      const id=`u5-mallet-layer-${ref}`;
      if(!loadChains().some(c=>c.id===id))addChain({id,context:`U5 arrangement ${ref} 123.70 B minor`,nodes:[{ref,slot:'source'},{ref:'eq-eight',slot:'shape'},{ref:'reverb',slot:'space'}]});
    }
    return report;
  }finally{await live.song.endUndoStep();}
}));

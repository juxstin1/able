// Eight-bar sound-audition bed. Writes MIDI/score first, then adds new tracks to Live.
// usage: tsx scripts/build-sound-bed.ts [--bpm 123.70] [--files-only | --check]
// --check meters one pass; only stops playback if this script started it.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { withLive, print } from '../lib/live.js';
import { loadOnTrack, type Root } from '../lib/browser.js';
import { padsFor } from '../lib/kits.js';
import { writeMidi, type Note } from '../lib/midi.js';
import { peakLevels } from '../lib/song.js';
import { neighbours, addChain, loadChains } from '../lib/graph.js';
import { ROOT } from '../lib/paths.js';

const DIR = path.join(ROOT, 'project-files', 'Sound Bed - B minor');
const args=process.argv.slice(2);
const BPM = args.includes('--bpm')?Number(args[args.indexOf('--bpm')+1]):123.70, BEATS = 32;
if(!Number.isFinite(BPM) || BPM<60 || BPM>180)throw new Error('Invalid bed tempo');
const KIT = '707 Core Kit.adg';
const hash = (x: unknown) => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const hz = (f: number) => Math.log(f / 10) / Math.log(2200);
const sort = (notes: Note[]) => [...notes].sort((a,b)=>a.time-b.time || a.pitch-b.pitch);
const kit = padsFor(KIT);
if (!kit.file || ['kick','clap','chat','ohat'].some(r=>kit.missing.includes(r))) throw new Error('707 kit pads are not fully mapped');

// Standard MIDI numbering (middle C=60). Bass supplies the omitted chord roots.
const harmony = [
  { name:'Bm9', bass:35, tones:[50,54,57,61] },
  { name:'Gmaj7', bass:31, tones:[50,54,59,62] },
  { name:'Dadd9', bass:38, tones:[54,57,62,64] },
  { name:'Asus2', bass:33, tones:[52,57,59,64] },
];
const notes:Record<string,Note[]> = {kick:[],clap:[],hats:[],bass:[],chords:[]};
const hit=(part:string,pitch:number,time:number,duration:number,velocity:number)=>notes[part].push({pitch,time,duration,velocity});
for(let bar=0;bar<8;bar++){
  const base=bar*4, chord=harmony[Math.floor(bar/2)];
  for(let beat=0;beat<4;beat++){
    hit('kick',kit.pads.kick,base+beat,0.12,[103,99,102,98][beat]);
    const open=(bar===3 || bar===7) && beat===3;
    hit('hats',open?kit.pads.ohat:kit.pads.chat,base+beat+0.5,open?0.18:0.07,open?54:[74,62,70,59][beat]+(bar%2?2:0));
    hit('bass',chord.bass,base+beat+0.5,[0.34,0.30,0.36,0.28][beat],[89,78,85,74][beat]);
  }
  hit('clap',kit.pads.clap,base+1.012,0.10,84+(bar%2)*2);
  hit('clap',kit.pads.clap,base+3.012,0.10,89-(bar%2)*2);
  // Quiet late sixteenths give a little shuffle without turning the bed into a riff.
  for(const t of (bar%2?[0.79,2.79]:[1.79,3.79])) hit('hats',kit.pads.chat,base+t,0.045,bar%2?36:40);
}
harmony.forEach((chord,i)=>{
  for(const [j,pitch] of chord.tones.entries()){
    hit('chords',pitch,i*8+0.10+j*0.006,5.75-j*0.006,[59,54,51,48][j]);
    hit('chords',pitch,i*8+6.50+j*0.006,1.13-j*0.006,[47,44,42,40][j]);
  }
});
type Part={id:string;name:string;source:[Root,string[]];fx:string[];volume:number;pan:number;color:number;settings:Record<string,Record<string,number>>};
const parts:Part[]=[
  {id:'kick',name:'BED - Kick',source:['drums',[KIT]],fx:[],volume:0.72,pan:0,color:8,settings:{}},
  {id:'clap',name:'BED - Clap',source:['drums',[KIT]],fx:['Reverb'],volume:0.60,pan:0,color:9,settings:{Reverb:{'Dry/Wet':0.075,'Decay Time':0.24,'Room Size':0.42,'In Lo Cut On':1}}},
  {id:'hats',name:'BED - Hats',source:['drums',[KIT]],fx:[],volume:0.59,pan:0.06,color:10,settings:{}},
  {id:'bass',name:'BED - Round Bass',source:['instruments',['Operator']],fx:['Utility'],volume:0.67,pan:0,color:25,settings:{Operator:{'Osc-A Wave':19,'Osc-A Level':1,'Osc-B Level':0,'Osc-C Level':0,'Osc-D Level':0,'Ae Attack':0.10,'Ae Decay':0.43,'Ae Sustain':0.82,'Ae Release':0.36,'Pe On':0,'Glide On':0,'Filter On':0,'Volume':0.40},Utility:{Mono:1,'DC Filter':1}}},
  {id:'chords',name:'BED - Soft Chords',source:['instruments',['Electric','Piano & Keys','E-Piano MKI Mellow.adv']],fx:['EQ Eight','Reverb'],volume:0.67,pan:-0.06,color:20,settings:{'EQ Eight':{'1 Filter On A':1,'1 Filter Type A':1,'1 Frequency A':hz(150),'8 Filter On A':1,'8 Filter Type A':6,'8 Frequency A':hz(4800)},Reverb:{'Dry/Wet':0.25,'Decay Time':0.38,'Room Size':0.74,'In Lo Cut On':1}}},
];
const score={bpm:BPM,key:'B minor',beats:BEATS,bars:8,kit:{name:KIT,...kit},harmony: harmony.map((h,i)=>({...h,startBar:i*2+1,endBar:i*2+2})),parts:parts.map(p=>({...p,notes:sort(notes[p.id])})),pairingHistory:{electric:neighbours('electric'),operator:neighbours('operator'),'drum-rack':neighbours('drum-rack')}};
for(const p of score.parts) for(const n of p.notes) if(n.time<0 || n.duration<=0 || n.time+n.duration>BEATS || n.velocity<1 || n.velocity>127) throw new Error('Invalid bed note');

async function structure(tracks:any[]){
  return Promise.all(tracks.map(async t=>({id:t.raw.id,name:await t.get('name'),mute:await t.get('mute'),solo:await t.get('solo'),devices:(await t.get('devices')).map((d:any)=>d.raw.id),clips:(await t.get('arrangement_clips')).map((c:any)=>({id:c.raw.id,start:c.raw.start_time,end:c.raw.end_time}))})));
}

if(process.argv.includes('--check')){
  print(await withLive(async live=>{
    const build=JSON.parse(fs.readFileSync(path.join(DIR,'live-receipt.json'),'utf8'));
    const all=await live.song.get('tracks');
    const mine=build.tracks.map((r:any)=>all.find(t=>t.raw.id===r.trackId));
    if(mine.some((t:any)=>!t))throw new Error('Bed track identity changed; inspect before checking');
    const wasPlaying=await live.song.get('is_playing');
    if(wasPlaying && (!await live.song.get('loop') || Math.abs(await live.song.get('loop_start')-build.startBeat)>0.001 || Math.abs(await live.song.get('loop_length')-BEATS)>0.001))throw new Error('Playback is outside the bed loop; leaving transport alone');
    if(await live.song.get('record_mode'))throw new Error('Recording is enabled; leaving transport alone');
    for(const t of all)if(await t.get('solo'))throw new Error('A track is soloed; refusing misleading level check');
    if(await live.song.get('back_to_arranger'))throw new Error('Session playback overrides Arrangement; leaving it alone');
    const playbackBpm=await live.song.get('tempo');
    let peaks:any[]=[];
    try{
      if(!wasPlaying){
        await live.song.set('loop',true);
        await live.song.set('loop_start',build.startBeat);
        await live.song.set('loop_length',BEATS);
        await live.song.set('current_song_time',build.startBeat);
        await live.song.startPlaying();
      }
      peaks=(await peakLevels(live,mine,BEATS*60000/playbackBpm+700,65)).map(r=>({name:r.name,meterPeak:r.peak}));
    }finally{
      if(!wasPlaying){
        await live.song.stopPlaying();
        await live.song.set('current_song_time',build.startBeat);
      }
    }
    const result={bpm:playbackBpm,bpmAtEnd:await live.song.get('tempo'),bars:8,peaks,allPartsActive:peaks.slice(0,-1).every(p=>p.meterPeak>0),allMetersBelowOne:peaks.every(p=>p.meterPeak<1),userPlaybackPreserved:wasPlaying,stopped:!await live.song.get('is_playing'),note:'Live meter check only; not a rendered loudness or listening assessment.'};
    fs.writeFileSync(path.join(DIR,'playback-check.json'),JSON.stringify(result,null,2));
    return result;
  }));
}else{
  if(fs.existsSync(path.join(DIR,'live-receipt.json')))throw new Error('Bed already built; use --check to verify it');
  fs.mkdirSync(DIR,{recursive:true});
  for(const p of score.parts)writeMidi(path.join(DIR,`${p.id}.mid`),p.notes,BPM,960);
  fs.writeFileSync(path.join(DIR,'score.json'),JSON.stringify(score,null,2));
  fs.writeFileSync(path.join(DIR,'README.md'),`# Sound Bed\n\nEight bars at ${BPM} BPM in B minor. Bm9 / Gmaj7 / Dadd9 / Asus2, two bars each.\n\nFive editable MIDI parts: 707 kick, clap, hats, Operator triangle bass, mellow Electric chords. No lead melody.\n\nDrop an instrument on PLAY HERE and try a short phrase over the loop. B minor notes: B C# D E F# G A.\n\nThe MIDI and score are saved here. Live set saving is handled in Ableton; this folder is not an .als save or an audio bounce.\n`);
  if(process.argv.includes('--files-only'))print({folder:DIR,parts:score.parts.map(p=>({name:p.name,notes:p.notes.length})),bars:8});
  else print(await withLive(async live=>{
    const before=await live.song.get('tracks');
    for(const t of before)if((await t.get('name')).startsWith('BED -') || await t.get('name')==='PLAY HERE')throw new Error('Bed tracks already exist; refusing to duplicate');
    if(await live.song.get('is_playing'))throw new Error('User playback is running; leaving transport alone');
    if(await live.song.get('record_mode'))throw new Error('Recording is enabled; refusing build');
    let end=0,hasSession=false,firstEightOccupied=false;
    for(const t of before){
      for(const c of await t.get('arrangement_clips')){
        const from=await c.get('start_time'),to=await c.get('end_time');
        end=Math.max(end,to);
        if(from<BEATS && to>0)firstEightOccupied=true;
      }
      for(const s of await t.get('clip_slots'))if(await s.get('has_clip'))hasSession=true;
    }
    const tempoBefore=await live.song.get('tempo');
    if((end>0 || hasSession) && Math.abs(tempoBefore-BPM)>0.001)throw new Error('Existing music uses another tempo; refusing global tempo change');
    const start=firstEightOccupied?Math.ceil((end+16)/32)*32:0;
    const baseline=await structure(before);
    fs.writeFileSync(path.join(DIR,'before.json'),JSON.stringify({tempo:tempoBefore,loop:await live.song.get('loop'),loopStart:await live.song.get('loop_start'),loopLength:await live.song.get('loop_length'),tracks:baseline},null,2));
    const receipts:any[]=[],parameterSnapshots:any[]=[],applied:any[]=[];
    await live.song.beginUndoStep();
    try{
      for(const p of score.parts){
        const t=await live.song.createMidiTrack(-1);
        await t.set('name',p.name);await t.set('color_index',p.color);await t.set('arm',false);
        await loadOnTrack(live,t,p.source[0],p.source[1]);
        for(const fx of p.fx)await loadOnTrack(live,t,'audio_effects',[fx]);
        const mixer=await t.get('mixer_device');
        await(await mixer.get('volume')).set('value',p.volume);
        await(await mixer.get('panning')).set('value',p.pan);
        for(const d of await t.get('devices')){
          const name=await d.get('name'),params=await d.get('parameters');
          const read=await Promise.all(params.map(async q=>({name:(await q.get('name')).trim(),min:await q.get('min'),max:await q.get('max'),value:await q.get('value'),items:await q.get('is_quantized')?await q.get('value_items'):undefined})));
          parameterSnapshots.push({track:p.name,device:name,parameters:read});
          for(const [key,value] of Object.entries(p.settings[name]??{})){
            const i=read.findIndex(q=>q.name===key),r=read[i];
            if(i<0 || value<r.min || value>r.max)throw new Error(`Invalid setting ${p.name}/${name}/${key}`);
            await params[i].set('value',value);
            const actual=await params[i].get('value');
            if(Math.abs(actual-value)>0.0001)throw new Error(`Parameter readback mismatch ${name}/${key}`);
            applied.push({track:p.name,device:name,param:key,value:actual});
          }
        }
        for(const dn of Object.keys(p.settings))if(!parameterSnapshots.some(r=>r.track===p.name && r.device===dn))throw new Error(`Expected device missing: ${dn}`);
        const clip=await t.createMidiClip(start,BEATS);
        await clip.setNotes(p.notes.map(n=>({...n,muted:false})));
        await clip.set('name',p.id==='chords'?'Bm9 - Gmaj7 - Dadd9 - Asus2 | 2 bars each':`${p.name} | 8 bars`);
        await clip.set('color_index',p.color);
        const actual=sort(await clip.getNotes(0,0,BEATS,128));
        if(actual.length!==p.notes.length || actual.some((n,i)=>n.pitch!==p.notes[i].pitch || n.velocity!==p.notes[i].velocity || Math.abs(n.time-p.notes[i].time)>0.0001 || Math.abs(n.duration-p.notes[i].duration)>0.0001))throw new Error(`MIDI readback mismatch: ${p.name}`);
        const clipStart=await clip.get('start_time'),clipEnd=await clip.get('end_time');
        if(Math.abs(clipStart-start)>0.0001 || Math.abs(clipEnd-start-BEATS)>0.0001)throw new Error('Arrangement range mismatch');
        receipts.push({name:p.name,trackId:t.raw.id,clipId:clip.raw.id,notes:actual.length,start:clipStart,end:clipEnd,verified:true});
        fs.writeFileSync(path.join(DIR,'build-progress.json'),JSON.stringify(receipts,null,2));
        fs.writeFileSync(path.join(DIR,'device-parameters-before.json'),JSON.stringify(parameterSnapshots,null,2));
        console.log(`Added and verified ${p.name}`);
      }
      const play=await live.song.createMidiTrack(-1);
      await play.set('name','PLAY HERE');await play.set('color_index',17);await play.set('arm',true);
      await live.song.set('tempo',BPM);await live.song.set('metronome',0);
      await live.song.set('loop_start',start);await live.song.set('loop_length',BEATS);await live.song.set('loop',true);
      await live.song.set('current_song_time',start);
      await live.application.view.showView('Arranger');
      await live.song.view.set('selected_track',play.raw.id);
      const unchanged=hash(baseline)===hash(await structure(before));
      const result={folder:DIR,bpm:await live.song.get('tempo'),key:'B minor',bars:8,startBeat:start,startBar:start/4+1,endBar:(start+BEATS)/4,tracks:receipts,playTrackId:play.raw.id,existingStructureUnchanged:unchanged,playing:await live.song.get('is_playing'),parametersVerified:applied.length};
      fs.writeFileSync(path.join(DIR,'sound-settings.json'),JSON.stringify(applied,null,2));
      fs.writeFileSync(path.join(DIR,'live-receipt.json'),JSON.stringify(result,null,2));
      for(const c of [
        {id:'sound-bed-electric',context:'8-bar B minor audition bed; mellow rootless chords',nodes:[{ref:'electric',slot:'source' as const},{ref:'eq-eight',slot:'shape' as const},{ref:'reverb',slot:'space' as const}]},
        {id:'sound-bed-bass',context:'8-bar B minor audition bed; short offbeat triangle bass',nodes:[{ref:'operator',slot:'source' as const},{ref:'utility',slot:'bus' as const}]},
        {id:'sound-bed-clap',context:'8-bar B minor audition bed; 707 clap with small room',nodes:[{ref:'drum-rack',slot:'source' as const},{ref:'reverb',slot:'space' as const}]},
      ])if(!loadChains().some(r=>r.id===c.id))addChain(c);
      return result;
    }finally{await live.song.endUndoStep();}
  }));
}

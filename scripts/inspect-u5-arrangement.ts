// Read the current arrangement and preserve a local snapshot before adding layers.
// usage: tsx scripts/inspect-u5-arrangement.ts
import fs from 'node:fs';
import path from 'node:path';
import { withLive,print } from '../lib/live.js';
import { ROOT } from '../lib/paths.js';
const dir=path.join(ROOT,'project-files','Untitled5 Study');
const args=process.argv.slice(2);
const output=args.includes('--output')?args[args.indexOf('--output')+1]:'before-mallet-layers.json';
if(!output||path.basename(output)!==output)throw new Error('Output must be a filename');
print(await withLive(async live=>{
  const rows:any[]=[];
  for(const [index,t] of (await live.song.get('tracks')).entries()){
    const name=await t.get('name');
    const mixer=await t.get('mixer_device');
    const clips:any[]=[];
    for(const c of await t.get('arrangement_clips')){
      const midi=await c.get('is_midi_clip');
      const row:any={id:c.raw.id,name:await c.get('name'),start:await c.get('start_time'),end:await c.get('end_time'),muted:await c.get('muted'),midi};
      if(midi){
        row.startMarker=await c.get('start_marker');row.loopStart=await c.get('loop_start');row.loopEnd=await c.get('loop_end');row.looping=await c.get('looping');
        row.notes=await c.get('notes' as never);
      }
      clips.push(row);
    }
    rows.push({index,id:t.raw.id,name,mute:await t.get('mute'),solo:await t.get('solo'),volume:await (await mixer.get('volume')).get('value'),devices:(await t.get('devices')).map(d=>d.raw),clips});
  }
  const cues=[];for(const c of await live.song.get('cue_points')) cues.push({name:await c.get('name'),time:await c.get('time')});
  const state={bpm:await live.song.get('tempo'),playing:await live.song.get('is_playing'),position:await live.song.get('current_song_time'),loop:await live.song.get('loop'),loopStart:await live.song.get('loop_start'),loopLength:await live.song.get('loop_length'),cues,tracks:rows};
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,output),JSON.stringify(state,null,2));
  if(args.includes('--summary'))return {bpm:state.bpm,playing:state.playing,position:state.position,loopStart:state.loopStart,loopLength:state.loopLength,cues,tracks:rows.filter(t=>t.clips.length).map(t=>({index:t.index,id:t.id,name:t.name,mute:t.mute,volume:t.volume,devices:t.devices.map((d:any)=>d.name),clips:t.clips.map((c:any)=>({id:c.id,startBar:c.start/4+1,endBar:c.end/4,muted:c.muted,notes:c.notes?.length,velocityRange:c.notes?.length?[Math.min(...c.notes.map((n:any)=>n.velocity)),Math.max(...c.notes.map((n:any)=>n.velocity))]:undefined,pitches:t.name.includes('Hats')?[...new Set(c.notes?.map((n:any)=>n.pitch))]:undefined}))}))};
  return {...state,tracks:rows.map(t=>({...t,clips:t.clips.map((c:any)=>({...c,notes:undefined,noteCount:c.notes?.length,pitchMin:c.notes?.length?Math.min(...c.notes.map((n:any)=>n.pitch)):null,pitchMax:c.notes?.length?Math.max(...c.notes.map((n:any)=>n.pitch)):null}))}))};
}));

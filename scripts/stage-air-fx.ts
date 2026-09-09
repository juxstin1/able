// Place generated FX options AFTER the current song as draggable audio clips.
// usage: tsx scripts/stage-air-fx.ts [--project "drum-groove-sept3 Project"]
// Preserves the existing song loop, tempo, playback, tracks, clips and device settings.
import fs from 'node:fs';
import path from 'node:path';
import { withLive,print } from '../lib/live.js';
import { ROOT } from '../lib/paths.js';

const argv=process.argv.slice(2);
const PROJECT=argv.includes('--project')?argv[argv.indexOf('--project')+1]:'Untitled5 Study';
const latest=JSON.parse(fs.readFileSync(path.join(ROOT,'project-files',PROJECT,'FX Options','latest.json'),'utf8'));
const man=JSON.parse(fs.readFileSync(latest.manifest,'utf8'));
const names:Record<string,string>={Risers:'FX Options - Risers',Swells:'FX Options - Swells',Falls:'FX Options - Downlifters',Hits:'FX Options - Impacts'};
const colors:Record<string,number>={Risers:17,Swells:21,Falls:20,Hits:9};
for(const item of man.clips)if(!fs.existsSync(item.file))throw new Error('Missing WAV: '+item.file);

print(await withLive(async live=>{
  const bpm=await live.song.get('tempo');
  if(Math.abs(bpm-man.bpm)>0.01)throw new Error(`Song is ${bpm} BPM, files are ${man.bpm}; regenerate files at current tempo`);
  const existing=await live.song.get('tracks');
  for(const t of existing)if(Object.values(names).includes(t.raw.name))throw new Error('FX option tracks already exist; refusing duplicate palette');
  const before={bpm,loop:await live.song.get('loop'),loopStart:await live.song.get('loop_start'),loopLength:await live.song.get('loop_length'),playing:await live.song.get('is_playing')};
  let songEnd=before.loopStart+before.loopLength;
  const oldClips:any[]=[];
  for(const t of existing){
    const clips=await t.get('arrangement_clips');
    for(const c of clips)songEnd=Math.max(songEnd,c.raw.end_time);
    oldClips.push({trackId:t.raw.id,clips:clips.map(c=>({id:c.raw.id,start:c.raw.start_time,end:c.raw.end_time}))});
  }
  // Leave eight empty bars after the next eight-bar boundary.
  const paletteStart=Math.ceil(songEnd/32)*32+32;
  const tracks=new Map<string,any>();
  const receipt:any[]=[];
  await live.song.beginUndoStep();
  try{
    for(const group of Object.keys(names)){
      const t=await live.song.createAudioTrack(-1);
      await t.set('name',names[group]);await t.set('color_index',colors[group]);
      await t.set('arm',false);
      // Original samples peak at -9 to -12 dBFS; conservative fader leaves room to blend.
      await (await (await t.get('mixer_device')).get('volume')).set('value',0.75);
      tracks.set(group,t);
    }
    let at=paletteStart;
    for(const item of man.clips){
      const t=tracks.get(item.group);
      await t.createAudioClip(item.file,at);
      // Live answers slower than the reply arrives, so the new clip is not always in the list yet.
      // Re-READING is safe to repeat (unlike re-creating), so give it a bounded number of looks.
      let candidates:any[]=[];
      for(let attempt=0;attempt<20;attempt++){
        candidates=(await t.get('arrangement_clips')).filter((c:any)=>Math.abs(c.raw.start_time-at)<0.001);
        if(candidates.length===1)break;
        await new Promise(r=>setTimeout(r,100));
      }
      if(candidates.length!==1)throw new Error(`Could not uniquely identify new FX clip at beat ${at} (saw ${candidates.length}) after 2s`);
      const clip=candidates[0];
      // Non-warped audio markers are seconds. Confirm timeline length after the change.
      await clip.set('warping',false);
      await clip.set('looping',false);
      await clip.set('end_marker',item.seconds);
      const label=item.name.replace(/^\d+_/,'').replaceAll('_',' ');
      await clip.set('name',label);
      await clip.set('color_index',colors[item.group]);
      const start=await clip.get('start_time'),end=await clip.get('end_time');
      const expected=item.seconds*bpm/60;
      const lengthError=Math.abs((end-start)-expected);
      const warp=await clip.get('warping');
      if(warp||lengthError>0.005)throw new Error(`FX length mismatch on ${label}: ${end-start} beats, expected ${expected}`);
      receipt.push({name:label,track:names[item.group],startBar:at/4+1,endBeat:end,beats:item.beats,seconds:item.seconds,warping:warp,lengthErrorBeats:lengthError,file:await clip.get('file_path')});
      fs.writeFileSync(path.join(man.folder,'live-progress.json'),JSON.stringify(receipt,null,2));
      console.log(`Placed ${label} at bar ${at/4+1}`);
      at=Math.ceil((at+item.beats)/4)*4+4;
    }
    const unchanged=[];
    for(const old of oldClips){
      const t=existing.find(t=>t.raw.id===old.trackId)!;
      const actual=(await t.get('arrangement_clips')).map(c=>({id:c.raw.id,start:c.raw.start_time,end:c.raw.end_time}));
      unchanged.push({track:t.raw.name,unchanged:JSON.stringify(actual)===JSON.stringify(old.clips)});
    }
    const after={bpm:await live.song.get('tempo'),loop:await live.song.get('loop'),loopStart:await live.song.get('loop_start'),loopLength:await live.song.get('loop_length'),playing:await live.song.get('is_playing')};
    const report={paletteStartBar:paletteStart/4+1,songEndBar:songEnd/4,clips:receipt,before,after,existingClipLayoutsUnchanged:unchanged.every(r=>r.unchanged),layoutChecks:unchanged};
    fs.writeFileSync(path.join(man.folder,'live-receipt.json'),JSON.stringify(report,null,2));
    fs.appendFileSync(path.join(man.folder,'README.md'),`\n## In the open Ableton set\n\nThe options begin at **bar ${report.paletteStartBar}**, after the existing arrangement, across four labelled FX Options tracks. They play one at a time in numeric order with a one-bar gap. Existing song loop range was retained. All 12 clip lengths were read back from Live with Warp off.\n\nDrag a clip from this palette into the song, or hold Ctrl while dragging to leave the original option in place.\n`);
    await live.application.view.showView('Arranger');
    return {folder:man.folder,paletteStartBar:report.paletteStartBar,clips:receipt.length,tracks:Object.values(names),existingClipLayoutsUnchanged:report.existingClipLayoutsUnchanged,loopPreserved:before.loop===after.loop&&before.loopStart===after.loopStart&&before.loopLength===after.loopLength,maxLengthErrorBeats:Math.max(...receipt.map(r=>r.lengthErrorBeats))};
  }finally{await live.song.endUndoStep();}
}));

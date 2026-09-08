// Check new layer playback. If Justin is playing, observe without interrupting.
// Otherwise audition four bars of the break, stop, and return to the prior position.
// usage: tsx scripts/check-u5-mallet-layers.ts
import fs from 'node:fs';
import path from 'node:path';
import { withLive,print } from '../lib/live.js';
import { peakLevels } from '../lib/song.js';
import { ROOT } from '../lib/paths.js';
print(await withLive(async live=>{
  const all=await live.song.get('tracks');
  const mine=all.filter(t=>['U5 Marimba','U5 Electric Piano'].includes(t.raw.name));
  if(mine.length!==2)throw new Error('Expected both added tracks');
  const position=await live.song.get('current_song_time'),playing=await live.song.get('is_playing');
  const master=await live.song.get('master_track');
  const structures=await Promise.all(mine.map(async t=>({name:t.raw.name,mute:await t.get('mute'),solo:await t.get('solo'),mutedViaSolo:await t.get('muted_via_solo'),clips:(await t.get('arrangement_clips')).map(c=>({name:c.raw.name,start:c.raw.start_time,end:c.raw.end_time}))})));
  let levels:any[]=[];
  if(!playing){await live.song.set('current_song_time',128);await live.song.startPlaying();}
  try{levels=(await peakLevels(live,mine,8200,80)).map(r=>({name:r.name,peak:r.peak}));}
  finally{if(!playing){await live.song.stopPlaying();await live.song.set('current_song_time',position);}}
  const report={observedExistingPlayback:playing,startPosition:playing?position:128,endPosition:await live.song.get('current_song_time'),levels,tracks:structures,masterDevices:(await master.get('devices')).map(d=>d.raw.name),noMeterReachedOne:levels.every(r=>r.peak<1)};
  fs.writeFileSync(path.join(ROOT,'project-files','Untitled5 Study','Mallet Layers','playback-check.json'),JSON.stringify(report,null,2));
  return report;
}));

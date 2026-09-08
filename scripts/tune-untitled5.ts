// Finish the imported U5 sounds, then meter one whole Arrangement loop and stop.
// usage: tsx scripts/tune-untitled5.ts [--meter-only]
import fs from 'node:fs';
import path from 'node:path';
import { withLive, track, print } from '../lib/live.js';
import { setParams, peakLevels } from '../lib/song.js';
import { ROOT } from '../lib/paths.js';
const DIR=path.join(ROOT,'project-files','Untitled5 Study');
const hz=(f:number)=>Math.log(f/10)/Math.log(2200);
const settings:Record<string,Record<string,Record<string,number>>>={
  'U5 Riff':{
    'Bright SAW Lead':{'Sub On':0,'Amp Attack':0.06,'Amp Decay':0.36,'Amp Sustain':0.60,'Amp Release':0.14,'Unison Amount':0.20,'Glide':0,'Flt 1 Res':0.20},
    'EQ Eight':{'1 Filter On A':1,'1 Filter Type A':1,'1 Frequency A':hz(145),'8 Filter On A':1,'8 Filter Type A':6,'8 Frequency A':hz(7600)},
    'Chorus-Ensemble':{'Mode':1,'Amount':0.26,'Rate':0.24,'Width':0.65,'Dry/Wet':0.24},
    'Reverb':{'Dry/Wet':0.16,'Decay Time':0.36,'Room Size':0.70,'In Lo Cut On':1},
  },
  'U5 Chords':{
    'EQ Eight':{'1 Filter On A':1,'1 Filter Type A':1,'1 Frequency A':hz(180),'8 Filter On A':1,'8 Filter Type A':6,'8 Frequency A':hz(4200)},
    'Reverb':{'Dry/Wet':0.28,'Decay Time':0.43,'Room Size':0.80,'In Lo Cut On':1},
  },
  'U5 Bass':{
    'Operator':{'Osc-A Wave':10,'Osc-A Level':1,'Osc-B Level':0,'Osc-C Level':0,'Osc-D Level':0,'Ae Attack':0.08,'Ae Sustain':0.87,'Ae Release':0.15,'Pe On':0,'Glide On':0,'Filter On':0,'Volume':0.40},
    'Saturator':{'Type':0,'Drive':0.72,'Color On':0,'Pre Dc Filter':1,'Output':0.72,'Dry/Wet':1,'Post Clip Mode':1},
    'EQ Eight':{'1 Filter On A':1,'1 Filter Type A':0,'1 Frequency A':hz(54),'8 Filter On A':1,'8 Filter Type A':6,'8 Frequency A':hz(950)},
    'Utility':{'Mono':1,'DC Filter':1},
  },
  'U5 Clap':{'Reverb':{'Dry/Wet':0.10,'Decay Time':0.23,'Room Size':0.50,'In Lo Cut On':1}},
};
print(await withLive(async live=>{
  if(Math.abs(await live.song.get('tempo')-123.70)>0.001) throw new Error('Unexpected tempo; refusing to tune another project');
  const mine=(await live.song.get('tracks')).filter(t=>t.raw.name.startsWith('U5 '));
  if(mine.length!==6) throw new Error('Expected six U5 tracks');
  const verified:any[]=[];
  await live.song.stopPlaying();
  if(!process.argv.includes('--meter-only')) for(const [tn,devs] of Object.entries(settings)){
    const t=await track(live,tn);
    for(const [name,values] of Object.entries(devs)){
      const missing=await setParams(t,name,values);
      if(missing.length) throw new Error(`Unapplied settings on ${tn}/${name}: ${missing.join(',')}`);
      const dev=(await t.get('devices')).find(d=>d.raw.name===name)!;
      const params=await dev.get('parameters');
      for(const [key,value] of Object.entries(values)){
        const p=params.find(p=>p.raw.name.trim()===key)!;
        const actual=await p.get('value');
        if(Math.abs(actual-value)>0.0001) throw new Error(`Setting readback mismatch ${tn}/${name}/${key}`);
        verified.push({track:tn,device:name,param:key,value:actual});
      }
    }
  }
  if(verified.length) fs.writeFileSync(path.join(DIR,'sound-settings.json'),JSON.stringify(verified,null,2));
  await live.song.set('back_to_arranger',0);
  await live.song.set('loop',false);
  await live.song.set('current_song_time',0);
  console.log('Sound settings verified. Playing one 16-bar pass to measure levels.');
  let peaks:any[]=[];
  try {
    await live.song.startPlaying();
    const measured=await peakLevels(live,mine,32500,80);
    peaks=measured.map(r=>({name:r.name,peak:r.peak,peakDb:r.peak>0?20*Math.log10(r.peak):null}));
  } finally {
    await live.song.stopPlaying();
    await live.song.set('current_song_time',0);
    await live.song.set('loop',true);
  }
  const report={bpm:await live.song.get('tempo'),bars:16,parametersVerified:verified.length,peaks,playing:await live.song.get('is_playing'),clipFree:peaks.every(p=>p.peak<1),allPartsAudibleOnMeters:peaks.every(p=>p.peak>0)};
  fs.writeFileSync(path.join(DIR,'mix-check.json'),JSON.stringify(report,null,2));
  return report;
}));

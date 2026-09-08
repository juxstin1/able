"""Local, read-only source comparison; writes an audit and codec tests in the workspace.
Usage: python scripts/audit-release-pair.py ORIGINAL.wav REMASTER.wav OUTPUT_DIRECTORY
Signal measurements do not substitute for a listening assessment.
"""
from pathlib import Path
import concurrent.futures
import hashlib
import json
import math
import re
import subprocess
import sys
import numpy as np
import scipy.signal as sig
import soundfile as sf

original, remaster, out = map(Path, sys.argv[1:4])
out.mkdir(parents=True, exist_ok=True)
sources = {'original': original, 'remaster': remaster}
def run(args):
    p = subprocess.run(args, capture_output=True, check=True)
    return p.stdout, p.stderr.decode('utf8', errors='replace')
def db(a):
    return float(20*np.log10(max(float(a), 1e-15)))
def rms(x):
    return float(np.sqrt(np.mean(np.square(x, dtype=np.float64))))
def corr(x, y):
    x, y = x-x.mean(), y-y.mean()
    return float(np.dot(x,y)/max(np.linalg.norm(x)*np.linalg.norm(y),1e-30))
def resample(x, sr, target):
    g = math.gcd(sr, target)
    return sig.resample_poly(x, target//g, sr//g, axis=0)
def meter(file, name):
    raw, log = run(['ffmpeg','-hide_banner','-nostats','-i',str(file),'-filter_complex',
                    'ebur128=peak=true:framelog=info','-f','null','NUL'])
    (out/f'{name}-ebur128.txt').write_text(log, encoding='utf8')
    summary = log.rsplit('Summary:',1)[-1]
    result = {}
    for key, pattern in [('integrated_lufs',r'I:\s*([\-\d.]+) LUFS'),
                         ('lra_lu',r'LRA:\s*([\-\d.]+) LU'),
                         ('true_peak_dbtp',r'Peak:\s*([\-\d.]+) dBFS')]:
        m = re.search(pattern, summary)
        if not m: raise RuntimeError(f'Could not parse {key}: {summary}')
        result[key] = float(m[1])
    series=[]
    for m in re.finditer(r't:\s*([\d.]+).*?M:\s*([\-\d.]+).*?S:\s*([\-\d.]+)', log):
        series.append({'seconds':float(m[1]),'momentary_lufs':float(m[2]),'short_term_lufs':float(m[3])})
    (out/f'{name}-loudness-timeline.json').write_text(json.dumps(series), encoding='utf8')
    return result, series

def inspect(label, file):
    x,sr = sf.read(file, dtype='float64',always_2d=True)
    if x.shape[1]!=2 or not np.isfinite(x).all(): raise RuntimeError('Expected finite stereo PCM')
    info = sf.info(file)
    head = max(1,round(sr*.01))
    block = np.max(np.abs(x[:len(x)//head*head]).reshape(-1,head,2),axis=(1,2))
    active = np.flatnonzero(block>10**(-60/20))
    rows=[]
    for i in range(0,len(x),sr):
        w=x[i:i+sr]
        level=rms(w)
        rows.append({'seconds':i/sr,'rms_dbfs':db(level),'peak_dbfs':db(np.abs(w).max()),
                     'crest_db':db(np.abs(w).max())-db(level),'lr_correlation':corr(w[:,0],w[:,1])})
    mid=x.mean(axis=1); side=(x[:,0]-x[:,1])*.5
    low=sig.sosfilt(sig.butter(4,150,fs=sr,output='sos'),x,axis=0)
    freqs,psd=sig.welch(x,fs=sr,nperseg=8192,noverlap=4096,axis=0)
    psd=psd.mean(axis=1)
    bands={}
    for lo,hi in [(20,80),(80,200),(200,500),(500,2000),(2000,5000),(5000,10000),(10000,16000),(16000,20000)]:
        mask=(freqs>=lo)&(freqs<hi)
        bands[f'{lo}-{hi} Hz']=float(np.sum(psd[mask])*(freqs[1]-freqs[0]))
    mono_loss=10*math.log10(max(float(np.mean(mid**2)),1e-30)/np.mean(x**2))
    result={'file':str(file),'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),
            'sample_rate':sr,'subtype':info.subtype,'channels':2,'frames':len(x),'duration_seconds':len(x)/sr,
            'sample_peak_dbfs':db(np.max(np.abs(x))),'rms_dbfs':db(rms(x)),
            'crest_db':db(np.max(np.abs(x)))-db(rms(x)),
            'full_scale_samples':int(np.count_nonzero(np.abs(x)>=1-2**(-int(info.subtype.split('_')[-1])+1))),
            'dc_mean':x.mean(axis=0).tolist(),'lr_correlation':corr(x[:,0],x[:,1]),
            'low_bass_lr_correlation_below_150hz':corr(low[:,0],low[:,1]),
            'right_minus_left_rms_db':db(rms(x[:,1]))-db(rms(x[:,0])),
            'side_relative_to_mid_db':db(rms(side))-db(rms(mid)),
            'mono_mean_energy_change_db':mono_loss,
            'first_above_minus60_seconds':float(active[0]*head/sr) if len(active) else None,
            'last_above_minus60_seconds':float((active[-1]+1)*head/sr) if len(active) else None,
            'final_50ms_rms_dbfs':db(rms(x[-round(sr*.05):])),
            'first_sample':x[0].tolist(),'last_sample':x[-1].tolist(),
            'band_mean_square':bands,'one_second_metrics':rows}
    loud,series=meter(file,label)
    result.update(loud)
    result['peak_to_loudness_ratio_db']=loud['true_peak_dbtp']-loud['integrated_lufs']
    return result,x,sr,series

with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    jobs={k:pool.submit(inspect,k,v) for k,v in sources.items()}
    data={k:f.result() for k,f in jobs.items()}
print('Measured original and remaster',flush=True)
a, ax, ar, at = data['original']; b, bx, br, bt = data['remaster']

# Local waveform matches at six separated positions reveal delay or timing drift.
align_sr=12000
am=resample(ax.mean(axis=1),ar,align_sr)
bm=resample(bx.mean(axis=1),br,align_sr)
align=[]
for start in [5,25,45,65,85,100]:
    if start+8>len(am)/align_sr: continue
    ref=am[start*align_sr:(start+8)*align_sr]
    left=max(0,int((start-4)*align_sr)); right=min(len(bm),int((start+12)*align_sr))
    search=bm[left:right]
    if len(search)<len(ref): continue
    ref=ref-ref.mean(); search=search-search.mean()
    cross=sig.correlate(search,ref,mode='valid',method='fft')
    energy=np.r_[0,np.cumsum(search**2)]
    win_energy=np.maximum(energy[len(ref):]-energy[:-len(ref)],1e-30)
    normalized=cross/np.sqrt(win_energy*np.sum(ref**2))
    i=int(np.argmax(np.abs(normalized)))
    matched=(left+i)/align_sr
    align.append({'original_start_seconds':start,'remaster_start_seconds':matched,
                  'offset_seconds':matched-start,'waveform_correlation':float(normalized[i])})

delta_i=b['integrated_lufs']-a['integrated_lufs']
band_delta={k:10*math.log10(max(b['band_mean_square'][k],1e-30)/max(a['band_mean_square'][k],1e-30))-delta_i for k in a['band_mean_square']}
valid=[r for r in align if abs(r['waveform_correlation'])>.5]
alignment_fit=None
if len(valid)>=3:
    slope,intercept=np.polyfit([r['original_start_seconds'] for r in valid],[r['remaster_start_seconds'] for r in valid],1)
    alignment_fit={'time_scale':float(slope),'delay_seconds':float(intercept),
                   'maximum_fit_residual_ms':float(max(abs(r['remaster_start_seconds']-(slope*r['original_start_seconds']+intercept)) for r in valid)*1000)}

def codec(label,args,suffix):
    file=out/f'codec-test-{label}.{suffix}'
    run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(remaster),'-map_metadata','-1',*args,str(file)])
    metrics,_=meter(file,f'codec-{label}')
    decoded,_=run(['ffmpeg','-hide_banner','-loglevel','error','-i',str(file),'-f','f32le','-acodec','pcm_f32le','pipe:1'])
    y=np.frombuffer(decoded,dtype='<f4')
    metrics.update({'file':str(file),'decoded_sample_peak_dbfs':db(np.abs(y).max()),'decoded_samples_at_or_over_one':int(np.count_nonzero(np.abs(y)>=1))})
    return metrics
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    futures={'aac_256k':pool.submit(codec,'aac-256k',['-c:a','aac','-b:a','256k'],'m4a'),
             'vorbis_q5':pool.submit(codec,'vorbis-q5',['-c:a','libvorbis','-q:a','5'],'ogg')}
    codecs={k:v.result() for k,v in futures.items()}
print('Finished AAC and Vorbis encode/decode tests',flush=True)

# Excerpts remain on disk. They are gain-matched using full-track integrated loudness.
# A/B is offered for the user's ears; this process makes no listening claim.
excerpt=None
if alignment_fit and abs(alignment_fit['time_scale']-1)<.0001:
    active_rows=[r for r in a['one_second_metrics'] if 15<r['seconds']<a['duration_seconds']-25]
    hot=max(active_rows,key=lambda r:r['rms_dbfs'])['seconds']
    start=max(0,int(hot)-5); seconds=20
    ox=resample(ax,ar,br)
    delay=alignment_fit['delay_seconds']
    oclip=ox[round(start*br):round((start+seconds)*br)]
    mstart=round((start+delay)*br)
    mclip=bx[mstart:mstart+len(oclip)]*10**(-delta_i/20)
    size=min(len(oclip),len(mclip)); oclip=oclip[:size].copy(); mclip=mclip[:size].copy()
    n=min(round(.01*br),size//2); fade=np.linspace(0,1,n)
    for clip in [oclip,mclip]: clip[:n]*=fade[:,None]; clip[-n:]*=fade[::-1,None]
    sf.write(out/'AB-original.wav',oclip,br,subtype='PCM_24')
    sf.write(out/'AB-remaster-matched.wav',mclip,br,subtype='PCM_24')
    excerpt={'original_start_seconds':start,'duration_seconds':size/br,'remaster_gain_db':-delta_i,'alignment_delay_seconds':delay,'edge_fades_ms':10}

report={'scope':'Local technical comparison. No perceptual listening assessment, rights review, or distributor submission.',
        'original':a,'remaster':b,'comparison':{'loudness_increase_lu':delta_i,
          'lra_change_lu':b['lra_lu']-a['lra_lu'],'duration_change_seconds':b['duration_seconds']-a['duration_seconds'],
          'band_changes_after_loudness_matching_db':band_delta,'waveform_alignment':align,'alignment_fit':alignment_fit},
        'codec_tests':codecs,'ab_excerpt':excerpt,
        'sources':{'spotify':'https://support.spotify.com/us/artists/article/loudness-normalization/',
                   'distrokid':'https://support.distrokid.com/hc/en-us/articles/360013647753-What-Audio-File-Formats-Can-I-Upload'},
        'methods':{'loudness':'FFmpeg ebur128 true-peak mode, 0.1 LU / dB report precision',
                   'spectrum':'Whole-file stereo-average Welch power spectrum; subtract integrated loudness difference',
                   'alignment':'Normalized waveform cross-correlation at 12 kHz in six eight-second windows, +/-4 seconds search',
                   'codecs':'Local FFmpeg AAC 256 kbit/s and libvorbis q5 tests; not a replica of a streaming service encoder'}}
(out/'audit.json').write_text(json.dumps(report,indent=2),encoding='utf8')

try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig,axs=plt.subplots(3,1,figsize=(12,10),constrained_layout=True)
    for label,metrics,series,color,gain in [('Original',a,at,'#246ca6',0),('Remaster, matched',b,bt,'#c56a1a',-delta_i)]:
        axs[0].plot([r['seconds'] for r in series],[max(-45,r['short_term_lufs']+gain) for r in series],label=label,color=color,lw=1.2)
        rows=[r for r in metrics['one_second_metrics'] if r['rms_dbfs']>-50]
        axs[1].plot([r['seconds'] for r in rows],[r['crest_db'] for r in rows],label=label.split(',')[0],color=color,lw=1.2)
    axs[0].set(title='Takeaway: loudness-matched short-term level',ylabel='Short-term LUFS',xlabel='Time (seconds)',ylim=(-35,-9));axs[0].legend()
    axs[1].set(title='Transient headroom in active one-second windows',ylabel='Sample peak minus RMS (dB)',xlabel='Time (seconds)');axs[1].legend()
    axs[2].bar(list(band_delta),list(band_delta.values()),color='#246ca6');axs[2].axhline(0,color='#333',lw=.7)
    axs[2].set(title='Remaster tonal change after loudness matching',ylabel='Relative change (dB)');axs[2].tick_params(axis='x',labelrotation=25)
    for ax in axs:ax.grid(axis='y',alpha=.2)
    fig.savefig(out/'comparison.png',dpi=160);plt.close(fig)
except ImportError:
    pass

summary={k:{kk:vv for kk,vv in v.items() if kk not in ['one_second_metrics','band_mean_square']} for k,v in [('original',a),('remaster',b)]}
summary.update({'comparison':report['comparison'],'codec_tests':codecs,'ab_excerpt':excerpt,'output':str(out)})
print(json.dumps(summary,indent=2))

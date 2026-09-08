"""Inspect the boundary edits and frequency-specific mono behavior in a pair audit."""
from pathlib import Path
import json
import math
import sys
import numpy as np
import scipy.signal as sig
import soundfile as sf

out=Path(sys.argv[1]); report=json.loads((out/'audit.json').read_text())
def db(x): return float(20*np.log10(max(float(x),1e-15)))
def rms(x): return float(np.sqrt(np.mean(x*x)))
details={}
audio={}
for label in ['original','remaster']:
    x,sr=sf.read(report[label]['file'],always_2d=True);audio[label]=(x,sr)
    nonzero=np.flatnonzero(np.any(x!=0,axis=1))
    rows={}
    for lo,hi in [(20,150),(150,500),(500,2000),(2000,5000),(5000,10000),(10000,16000)]:
        band=sig.sosfilt(sig.butter(4,[lo,hi],btype='bandpass',fs=sr,output='sos'),x,axis=0)
        l=band[:,0];r=band[:,1];mid=band.mean(axis=1)
        rows[f'{lo}-{hi} Hz']={
            'correlation':float(np.dot(l,r)/np.sqrt(np.dot(l,l)*np.dot(r,r))),
            'mono_energy_change_db':db(rms(mid))-db(rms(band)),
        }
    details[label]={'exact_zero_tail_seconds':(len(x)-1-int(nonzero[-1]))/sr,
                    'first_330ms_rms_dbfs':db(rms(x[:round(sr*.330)])),
                    'first_330ms_peak_dbfs':db(np.max(np.abs(x[:round(sr*.330)]))),
                    'last_500ms_rms_dbfs':db(rms(x[-round(sr*.500):])),
                    'bands':rows}

offset=report['comparison']['alignment_fit']['delay_seconds']
ax,ar=audio['original']; bx,br=audio['remaster']
removed=ax[:round(-offset*ar)] if offset<0 else ax[:0]
details['front_edit']={'original_leading_seconds_not_in_remaster':max(0,-offset),
                       'removed_audio_rms_dbfs':db(rms(removed)) if len(removed) else None,
                       'removed_audio_peak_dbfs':db(np.max(np.abs(removed))) if len(removed) else None}

# Original head and remaster head padded into temporal alignment for the user's check.
g=math.gcd(ar,br); head_orig=sig.resample_poly(ax[:ar*6],br//g,ar//g,axis=0)
head_master=np.zeros_like(head_orig);pad=round(max(0,-offset)*br)
head_master[pad:]=bx[:len(head_master)-pad]*10**(-report['comparison']['loudness_increase_lu']/20)
sf.write(out/'HEAD-original.wav',head_orig,br,subtype='PCM_24')
sf.write(out/'HEAD-remaster-aligned-matched.wav',head_master,br,subtype='PCM_24')
(out/'boundary-and-mono.json').write_text(json.dumps(details,indent=2))
print(json.dumps(details,indent=2))

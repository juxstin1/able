"""Independent spectral cross-check of mono losses and local mono A/B excerpts."""
from pathlib import Path
import json
import sys
import numpy as np
import scipy.signal as sig
import soundfile as sf
out=Path(sys.argv[1]); audit=json.loads((out/'audit.json').read_text()); result={}
for label in ['original','remaster']:
    x,sr=sf.read(audit[label]['file'],always_2d=True)
    f,pl=sig.welch(x[:,0],sr,nperseg=16384)
    _,pr=sig.welch(x[:,1],sr,nperseg=16384)
    _,cross=sig.csd(x[:,0],x[:,1],sr,nperseg=16384)
    result[label]={}
    for lo,hi in [(150,500),(500,2000)]:
        mask=(f>=lo)&(f<hi)
        el=pl[mask].sum();er=pr[mask].sum();ec=cross.real[mask].sum()
        result[label][f'{lo}-{hi} Hz']={
            'correlation':float(ec/np.sqrt(el*er)),
            'mono_energy_change_db':float(10*np.log10((el+er+2*ec)/(2*(el+er))))}
for name in ['AB-original','AB-remaster-matched']:
    x,sr=sf.read(out/f'{name}.wav',always_2d=True)
    sf.write(out/f'{name}-MONO.wav',x.mean(axis=1),sr,subtype='PCM_24')
(out/'mono-spectral-crosscheck.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result,indent=2))

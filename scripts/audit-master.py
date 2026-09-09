"""Analyse a single exported master: loudness, true peak, dynamics, stereo and spectrum.

usage: python scripts/audit-master.py TRACK.wav [--target -9]

Loudness is ITU-R BS.1770-4 (K-weighting, 400 ms blocks, gated) implemented here rather than via
pyloudnorm, which is not installed. Measurements narrow what to listen to; they do not replace it.
"""
from pathlib import Path
import argparse, json, sys
import numpy as np
import scipy.signal as sig
import soundfile as sf

ap = argparse.ArgumentParser()
ap.add_argument('file')
ap.add_argument('--target', type=float, default=-9.0, help='intended integrated LUFS')
o = ap.parse_args()
p = Path(o.file)
x, sr = sf.read(str(p), always_2d=True)
n, ch = x.shape
db = lambda v: float('-inf') if v <= 0 else 20*np.log10(v)

# --- BS.1770 K-weighting (coefficients defined at 48 kHz; resample if needed) ---
def k_filter(y, sr):
    if sr != 48000:
        y = sig.resample_poly(y, 48000, sr, axis=0)
    b1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]
    a1 = [1.0, -1.69065929318241, 0.73248077421585]
    b2 = [1.0, -2.0, 1.0]
    a2 = [1.0, -1.99004745483398, 0.99007225036621]
    return sig.lfilter(b2, a2, sig.lfilter(b1, a1, y, axis=0), axis=0)

def block_loudness(y, sr, win=0.400, hop=0.100):
    w, h = int(win*sr), int(hop*sr)
    if len(y) < w: return np.array([]), np.array([])
    idx = range(0, len(y)-w+1, h)
    z = np.array([np.mean(y[i:i+w]**2, axis=0).sum() for i in idx])
    with np.errstate(divide='ignore'):
        return -0.691 + 10*np.log10(z), z

yk = k_filter(x, sr)
srk = 48000
lb, zb = block_loudness(yk, srk)
# Two-stage gate: absolute -70 LUFS, then 10 LU below the ungated mean of what survived.
keep = lb > -70
if keep.any():
    ungated = -0.691 + 10*np.log10(zb[keep].mean())
    keep2 = keep & (lb > ungated - 10)
    integrated = -0.691 + 10*np.log10(zb[keep2].mean()) if keep2.any() else ungated
else:
    integrated = float('-inf')
# Loudness range: 3 s short-term blocks, 10th to 95th percentile of the gated set.
st, _ = block_loudness(yk, srk, 3.0, 1.0)
st = st[st > -70]
lra = float(np.percentile(st, 95) - np.percentile(st, 10)) if len(st) > 1 else 0.0
short_max = float(st.max()) if len(st) else float('-inf')

# --- peaks ---
samp_peak = db(float(np.abs(x).max()))
up = sig.resample_poly(x, 4, 1, axis=0)
true_peak = db(float(np.abs(up).max()))
at_fs = int((np.abs(x) >= 0.9999).sum())
runs, run = 0, 0
mono_abs = np.abs(x).max(axis=1)
for v in (mono_abs >= 0.9999):
    run = run+1 if v else 0
    if run == 3: runs += 1
rms = db(float(np.sqrt((x**2).mean())))
crest = samp_peak - rms

# --- stereo ---
L, R = x[:, 0], x[:, 1] if ch > 1 else (x[:, 0], x[:, 0])
mid, side = (L+R)/2, (L-R)/2
corr = float(np.corrcoef(L, R)[0, 1]) if ch > 1 and L.std() > 0 and R.std() > 0 else 1.0
side_mid = db(float(np.sqrt((side**2).mean()))) - db(float(np.sqrt((mid**2).mean())))
mono_loss = db(float(np.sqrt((mid**2).mean()))) - db(float(np.sqrt(((L**2).mean()+(R**2).mean())/2)))
dc = [float(x[:, c].mean()) for c in range(ch)]

# --- spectrum by octave band, and per-band mono loss ---
bands = [(20,60,'sub'),(60,120,'low'),(120,250,'low-mid'),(250,500,'mid-low'),(500,1000,'mid'),
         (1000,2000,'upper-mid'),(2000,4000,'presence'),(4000,8000,'high'),(8000,16000,'air')]
f, Pl = sig.welch(L, sr, nperseg=16384)
_, Pr = sig.welch(R, sr, nperseg=16384)
_, Pm = sig.welch(mid, sr, nperseg=16384)
tot = float((Pl+Pr).sum())
spec = []
for lo, hi, name in bands:
    m = (f >= lo) & (f < hi)
    if not m.any(): continue
    e = float((Pl[m]+Pr[m]).sum())
    lr = float((Pl[m]+Pr[m]).sum()/2); mm = float(Pm[m].sum())
    spec.append({'band': name, 'hz': f'{lo}-{hi}', 'pct': round(100*e/tot, 2),
                 'dB': round(10*np.log10(e/tot), 1) if e > 0 else None,
                 'monoLossDb': round(10*np.log10(mm/lr), 1) if lr > 0 and mm > 0 else None})

# --- silence / trim ---
env = mono_abs
thr = 10**(-60/20)
first = int(np.argmax(env > thr)) if (env > thr).any() else 0
last = int(n - np.argmax(env[::-1] > thr)) if (env > thr).any() else n

print(json.dumps({
    'file': p.name, 'seconds': round(n/sr, 2), 'sampleRate': sr, 'channels': ch,
    'subtype': sf.info(str(p)).subtype,
    'loudness': {'integratedLUFS': round(integrated, 2), 'shortTermMaxLUFS': round(short_max, 2),
                 'loudnessRangeLU': round(lra, 2), 'targetLUFS': o.target,
                 'offTargetDb': round(integrated - o.target, 2)},
    'peak': {'samplePeakDbFS': round(samp_peak, 2), 'truePeakDbTP': round(true_peak, 2),
             'rmsDbFS': round(rms, 2), 'crestFactorDb': round(crest, 2),
             'samplesAtFullScale': at_fs, 'clipRuns3PlusSamples': runs},
    'stereo': {'correlation': round(corr, 3), 'sideMinusMidDb': round(side_mid, 2),
               'monoSumLossDb': round(mono_loss, 2), 'dcOffset': [round(d, 6) for d in dc]},
    'spectrum': spec,
    'edges': {'leadInSeconds': round(first/sr, 3), 'tailAfterSeconds': round((n-last)/sr, 3)},
}, indent=2))

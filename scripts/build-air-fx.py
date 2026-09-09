"""Generate original, tempo-length transition WAVs. No samples or external service.

Usage: python scripts/build-air-fx.py [--bpm 123.70]
Always creates a new timestamped folder; never rewrites audio referenced by Live.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import numpy as np
from scipy import signal
import soundfile as sf

args = argparse.ArgumentParser()
args.add_argument('--bpm', type=float, default=123.70)
args.add_argument('--project', default='Untitled5 Study', help='folder under project-files/ to write into')
args.add_argument('--key', default='Bm', help='root of the tonal swell, e.g. Em - the rest is untuned noise')
opts = args.parse_args()
if not 60 <= opts.bpm <= 200:
    raise ValueError('Expected musical tempo between 60 and 200 BPM')
BPM = opts.bpm
# Only 07_REVERSE_HALO is pitched; everything else is noise and stays key-agnostic.
NOTE = {'C': 60, 'C#': 61, 'D': 62, 'D#': 63, 'E': 64, 'F': 65, 'F#': 66, 'G': 67, 'G#': 68, 'A': 69, 'A#': 70, 'B': 71}
KEY = opts.key.rstrip('m') or 'B'
if KEY not in NOTE:
    raise ValueError(f'Unknown key root {opts.key!r}')
KEY_ROOT = NOTE[KEY] + 12  # the octave the old hard-coded B4/F#5/D6 stack sat in
SR = 48000
BEAT = 60 / BPM
ROOT = Path(__file__).resolve().parents[1]
STAMP = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
DEST = ROOT / 'project-files' / opts.project / 'FX Options' / STAMP
DEST.mkdir(parents=True, exist_ok=False)
RNG = np.random.default_rng(90612370)

def hp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, btype='highpass', fs=SR, output='sos'), x, axis=0)

def lp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, btype='lowpass', fs=SR, output='sos'), x, axis=0)

def unit(x):
    return x / max(float(np.sqrt(np.mean(x*x))), 1e-9)

def noise_bank(n, u, rising=True, bright=1.0, width=0.8):
    # Smoothly crossfade broad overlapping bands. No discontinuous filter changes.
    pre = 2400
    raw = RNG.normal(size=(n + pre, 3))
    stereo = np.column_stack((raw[:, 0] + width*raw[:, 1], raw[:, 0] + width*raw[:, 2]))
    pos = u if rising else 1-u
    bands = [(180, 950), (650, 2800), (1900, 6500), (4800, 13500)]
    centers = [0.02, 0.35, 0.70, 1.05]
    out = np.zeros((n, 2))
    for i, ((lo, hi), center) in enumerate(zip(bands, centers)):
        band = signal.sosfilt(signal.butter(2, [lo, hi], btype='bandpass', fs=SR, output='sos'), stereo, axis=0)[pre:]
        band = unit(band)
        weight = np.exp(-0.5*((pos-center)/0.31)**2)
        if i == 3:
            weight *= bright * 0.55
        out += band * weight[:, None]
    return hp(out, 170)

def diffuse(x, wet=0.3):
    out = x.copy()
    for j, (delay, gain) in enumerate([(0.037,0.20),(0.071,0.18),(0.113,0.15),(0.173,0.12),(0.251,0.09),(0.347,0.06)]):
        d = int(delay*SR)
        if d >= len(x):
            continue
        echo = x[:-d, ::-1] if j % 2 else x[:-d]
        out[d:] += wet*gain*echo
    return out

def edge_fades(x, start_ms=10, end_ms=12):
    a = min(int(SR*start_ms/1000),len(x)//2)
    b = min(int(SR*end_ms/1000),len(x)//2)
    if a:
        x[:a] *= (np.sin(np.linspace(0,np.pi/2,a))**2)[:,None]
    if b:
        x[-b:] *= (np.cos(np.linspace(0,np.pi/2,b))**2)[:,None]
    x[0] = 0
    x[-1] = 0
    return x

def normalize(x, peak_db):
    x = hp(x, 28)
    x = edge_fades(x, 8, 8)
    peak = max(float(np.max(np.abs(x))), 1e-9)
    return x*(10**(peak_db/20)/peak)

def rise(beats, mode='silk'):
    n = round(beats*BEAT*SR)
    u = np.linspace(0,1,n)
    x = noise_bank(n,u**1.25,bright=0.75 if mode=='breath' else 1.0,width=0.95)
    env = (0.015+0.985*u**1.75)
    if mode == 'breath':
        env = np.sin(u*np.pi/2)**2.7
        x = lp(x,8200)
    if mode == 'wide':
        x = diffuse(x,0.55)
        env *= 0.92+0.08*np.sin(2*np.pi*u*2.2)
    if mode == 'triplet':
        t = np.arange(n)/SR
        phase = (t/BEAT*3) % 1
        pulse = 0.20+0.80*np.sin(np.pi*phase)**2
        # Pulsing opens into a continuous wash during the final half-bar.
        continuous = np.clip((u-0.875)/0.125,0,1)
        env *= pulse*(1-continuous)+continuous
    x = diffuse(x,0.25)*env[:,None]
    return edge_fades(x,20,4)

def down(beats, long=False):
    n=round(beats*BEAT*SR); u=np.linspace(0,1,n)
    x=noise_bank(n,u**0.7,rising=False,bright=0.72,width=1.1)
    x=diffuse(x,0.75)
    env=(1-u)**(2.1 if long else 3.1)*np.exp(-u*1.0)
    return edge_fades(x*env[:,None],7,70)

def reverse_air(beats, hollow=False):
    x=down(beats,long=True)[::-1].copy()
    if hollow:
        n=len(x); u=np.linspace(0,1,n)
        x=hp(lp(x,6500),450)
        x *= (0.65+0.35*np.sin(np.pi*u))[:,None]
    return edge_fades(x,30,5)

def halo(beats):
    n=round(beats*BEAT*SR); t=np.arange(n)/SR; u=np.linspace(0,1,n)
    x=np.zeros((n,2))
    # Root, fifth, minor third stacked over two octaves - the only pitched clip, so it follows --key.
    for j,midi in enumerate([KEY_ROOT, KEY_ROOT+7, KEY_ROOT+15]):
        freq=440*2**((midi-69)/12)
        for side in [0,1]:
            detune=(-1 if side==0 else 1)*(j+1)*2.8
            f=freq*2**(detune/1200)
            phase=2*np.pi*f*t+0.012*np.sin(2*np.pi*0.8*t+j)
            tone=np.sin(phase)+0.19*np.sin(2*phase+0.3)+0.07*np.sin(3*phase)
            x[:,side]+=tone*np.exp(-u*(2.8+j*0.5))/(j+2)
    x=diffuse(x,0.9)[::-1].copy()
    x=x*(u**0.85)[:,None]+0.06*reverse_air(beats)
    return edge_fades(x,30,7)

def whoosh(beats):
    n=round(beats*BEAT*SR); u=np.linspace(0,1,n)
    pos=np.sin(np.pi*u)
    x=noise_bank(n,pos,width=0.5,bright=0.7)
    env=np.sin(np.pi*u)**2.4
    pan=np.linspace(-0.78,0.78,n)
    x[:,0]*=np.sqrt((1-pan)/2)
    x[:,1]*=np.sqrt((1+pan)/2)
    return edge_fades(diffuse(x*env[:,None],0.4),15,20)

def impact(beats, tiny=False):
    n=round(beats*BEAT*SR); t=np.arange(n)/SR; u=np.linspace(0,1,n)
    air=hp(noise_bank(n,u,rising=False,bright=0.60),650)
    if tiny:
        x=air*np.exp(-t*19)[:,None]
    else:
        f=55+75*np.exp(-t*30)
        phase=2*np.pi*np.cumsum(f)/SR
        thump=np.sin(phase)*np.exp(-t*11)
        x=0.42*air*np.exp(-t*2.9)[:,None]+thump[:,None]*0.55
    x=diffuse(x,0.7)
    return edge_fades(x,3 if tiny else 2,50)

specs=[
    ('01_AIR_BREATH_2bar',8,'Risers',lambda:rise(8,'breath'),-10,'Gentle airy lift. End the clip on the transition.'),
    ('02_AIR_SILK_4bar',16,'Risers',lambda:rise(16,'silk'),-9,'Smooth filtered noise rising into the next section.'),
    ('03_AIR_WIDE_8bar',32,'Risers',lambda:rise(32,'wide'),-9,'Longest, widest build. End on the drop.'),
    ('04_AIR_TRIPLETS_4bar',16,'Risers',lambda:rise(16,'triplet'),-10,'Three pulses per beat, opening into a continuous final wash.'),
    ('05_REVERSE_AIR_1bar',4,'Swells',lambda:reverse_air(4),-10,'Short inhale ending on a downbeat.'),
    ('06_REVERSE_HOLLOW_2bar',8,'Swells',lambda:reverse_air(8,True),-11,'Darker reverse swell with less bright hiss.'),
    (f'07_REVERSE_HALO_{KEY}m_2bar',8,'Swells',lambda:halo(8),-12,f'Tonal shimmer on {KEY} minor. Try before a {KEY}-minor downbeat.'),
    ('08_STEREO_WHOOSH_1bar',4,'Swells',lambda:whoosh(4),-10,'Left-to-right sweep; peak sits halfway through the clip.'),
    ('09_AIR_FALL_2bar',8,'Falls',lambda:down(8),-11,'Start on the drop; bright air falls away.'),
    ('10_AIR_LONG_TAIL_4bar',16,'Falls',lambda:down(16,True),-12,'Long diffuse downlifter for a breakdown or final drop.'),
    ('11_SOFT_BLOOM_IMPACT_2bar',8,'Hits',lambda:impact(8),-9,'Rounded low thump plus air. Start on the downbeat.'),
    ('12_TINY_AIR_TICK_1beat',1,'Hits',lambda:impact(1,True),-12,'Small transition accent with no low thump.'),
]
rows=[];preview=[];cue=[];offset=0
for label,beats,group,fn,peak_db,use in specs:
    x=normalize(fn(),peak_db)
    x=edge_fades(x,2,4)
    file=DEST/f'{label}_{BPM:.2f}BPM.wav'
    sf.write(file,x,SR,subtype='PCM_24')
    read,sr=sf.read(file,always_2d=True)
    assert sr==SR and read.shape==(round(beats*BEAT*SR),2)
    assert np.isfinite(read).all() and np.max(np.abs(read))<1
    assert np.max(np.abs(read[[0,-1]]))<1e-6
    peak=float(np.max(np.abs(read)))
    rms=float(np.sqrt(np.mean(read**2)))
    row={'name':label,'file':str(file),'group':group,'beats':beats,'bars':beats/4,'seconds':len(read)/SR,'sampleRate':SR,'frames':len(read),'channels':2,'subtype':'PCM_24','peakDbFS':float(20*np.log10(peak)),'rmsDbFS':float(20*np.log10(rms)),'maxMeanDC':float(np.max(np.abs(read.mean(axis=0)))),'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'use':use}
    rows.append(row)
    cue.append({'name':label,'startSeconds':offset,'endSeconds':offset+len(read)/SR})
    # Catalogue preview only; untouched individual samples are the drag-and-drop assets.
    preview.extend([read,np.zeros((SR//2,2))]);offset+=(len(read)+SR//2)/SR
    print(f'{label}: {len(read)/SR:.3f}s, peak {row["peakDbFS"]:.1f} dBFS')
sf.write(DEST/'00_AUDITION_ALL_OPTIONS.wav',np.concatenate(preview),SR,subtype='PCM_24')
manifest={'bpm':BPM,'createdUtc':STAMP,'source':'Original locally synthesized noise and oscillators; no borrowed audio.','folder':str(DEST),'clips':rows,'preview':str(DEST/'00_AUDITION_ALL_OPTIONS.wav'),'previewCues':cue}
(DEST/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')
(DEST.parent/'latest.json').write_text(json.dumps({'manifest':str(DEST/'manifest.json')},indent=2),encoding='utf8')
lines=['# Air and transition FX options','',f'12 original stereo 48 kHz / 24-bit WAVs at **{BPM:.2f} BPM**.','',
'Drag individual WAVs into Arrangement. They are rendered to exact beat lengths (within one sample); keep Warp off at this tempo.',
'Risers and reverse swells: align the RIGHT edge with the transition. Downlifters and impacts: align the LEFT edge with the transition.',
'The halo is B minor; the other air effects are unpitched. The bloom impact has a short downward-pitched low thump.',
'Individual peaks are between -9 and -12 dBFS. Start quietly in a full mix and bring up to taste.','',
'| File | Length | Use |','|---|---:|---|']
for row in rows:lines.append(f'| {Path(row["file"]).name} | {row["beats"]} beats | {row["use"]} |')
lines+=['','`00_AUDITION_ALL_OPTIONS.wav` plays the options in order with half-second gaps. It is a catalogue, not a song stem.',
'','Every exported file was read back and checked for frame count, stereo format, finite samples, peak below 0 dBFS, and silent boundary samples. See manifest.json.']
(DEST/'README.md').write_text('\n'.join(lines)+'\n',encoding='utf8')
print(json.dumps({'folder':str(DEST),'manifest':str(DEST/'manifest.json'),'files':len(rows),'previewSeconds':offset},indent=2))

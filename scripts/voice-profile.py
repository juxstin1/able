"""Measure the singer, not the song: range, comfortable tessitura, and which keys fit.

usage: python scripts/voice-profile.py [--dir "C:/Users/juxxs/Documents/Sound Recordings"] [--n 40]

Answers three things you cannot eyeball:
  1. What range do I actually sing in, and where do I LIVE in it (tessitura)?
  2. Which keys put the useful chord tones inside that comfortable band?
  3. Which of my takes are worth chopping, judged on the things that matter?

Scoring uses the metrics the research turned up rather than loudness:
  - HNR (Boersma 1993): harmonics-to-noise. Sung vowel >12 dB, breath/fricative <5 dB.
  - Stable core: longest run within 50 cents of the local median. Under ~120 ms there is no note
    in there, just speech. This is the direct antidote to picking spoken words.
  - pyin voiced_prob, not yin - yin never abstains and returns a pitch for breath and silence.
  - Pitch SPREAD is a virtue here. A take that only sits on one note can only ever make a drone.
Deliberately NOT scored on volume or pitch stability-as-low-variance: that combination is what
picks monotone talking, which is how the first chop attempt failed.
"""
import os, sys, glob, warnings
warnings.filterwarnings("ignore")
import numpy as np, librosa, scipy.signal

NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
def nm(m):
    if m != m: return "-"
    m = int(round(m)); return f"{NAMES[m%12]}{m//12-1}"

def hnr_db(x, sr, fmin=70, fmax=1000):
    """Boersma 1993: divide the windowed autocorrelation by the window's own."""
    if len(x) < 256: return -99.0
    w = np.hanning(len(x)); xw = (x - x.mean()) * w
    n = 1 << int(np.ceil(np.log2(len(xw) * 2)))
    def acf(v):
        S = np.fft.rfft(v, n); r = np.fft.irfft(S * np.conj(S), n)[:len(v)]
        return r / (r[0] + 1e-12)
    r = acf(xw) / np.maximum(acf(w), 1e-9)
    lo, hi = int(sr / fmax), min(int(sr / fmin), len(r) - 1)
    if hi <= lo: return -99.0
    p = float(np.clip(r[lo + int(np.argmax(r[lo:hi]))], 1e-6, 1 - 1e-6))
    return 10 * np.log10(p / (1 - p))

def analyse(path, sr=22050):
    y, _ = librosa.load(path, sr=sr, mono=True)
    if len(y) < sr: return None
    hop = 256
    f0, vflag, vprob = librosa.pyin(y, fmin=65.0, fmax=1000.0, sr=sr,
                                    frame_length=2048, hop_length=hop, fill_na=np.nan)
    ok = ~np.isnan(f0) & (vprob > 0.6)
    if ok.sum() < 40: return None
    semi = librosa.hz_to_midi(f0[ok])
    # stable core: longest run within 50 cents of a 70 ms running median
    s_all = librosa.hz_to_midi(np.where(np.isnan(f0), 1.0, f0))
    ref = scipy.ndimage.median_filter(s_all, size=max(3, int(0.07 * sr / hop))) if 'ndimage' in dir(scipy) else s_all
    stable = (~np.isnan(f0)) & (np.abs(s_all - ref) < 0.5)
    best = run = 0
    for v in stable:
        run = run + 1 if v else 0
        best = max(best, run)
    core_ms = best * hop / sr * 1000
    # HNR over the loudest second
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    c = int(np.argmax(np.convolve(rms, np.ones(int(sr/hop))/int(sr/hop), mode='same'))) * hop
    h = hnr_db(y[max(0,c-sr//2):c+sr//2], sr)
    return dict(name=os.path.basename(path), dur=len(y)/sr,
                lo=np.percentile(semi,5), hi=np.percentile(semi,95), med=np.median(semi),
                spread=float(np.percentile(semi,95)-np.percentile(semi,5)),
                voiced=float(ok.mean()), hnr=h, core_ms=core_ms, semis=semi)

def main():
    d = sys.argv[sys.argv.index("--dir")+1] if "--dir" in sys.argv else r"C:\Users\juxxs\Documents\Sound Recordings"
    lim = int(sys.argv[sys.argv.index("--n")+1]) if "--n" in sys.argv else 40
    files = sorted(glob.glob(os.path.join(d, "*.wav")))[:lim]
    rows, allsemi = [], []
    print(f"{'file':<20}{'dur':>6}{'range':>14}{'spread':>8}{'HNR':>7}{'core':>8}{'voiced':>8}")
    for f in files:
        r = analyse(f)
        if not r: continue
        rows.append(r); allsemi.append(r["semis"])
        print(f"{r['name']:<20}{r['dur']:6.0f}{nm(r['lo'])+'..'+nm(r['hi']):>14}"
              f"{r['spread']:7.1f}st{r['hnr']:6.1f}dB{r['core_ms']:7.0f}ms{r['voiced']*100:7.0f}%")
    if not rows: sys.exit("nothing analysable")

    a = np.concatenate(allsemi)
    print(f"\n=== YOUR VOICE, across {len(rows)} takes ===")
    print(f"  full range        {nm(np.percentile(a,2))} .. {nm(np.percentile(a,98))}")
    print(f"  tessitura (where you actually live, 25-75%)  {nm(np.percentile(a,25))} .. {nm(np.percentile(a,75))}")
    print(f"  median pitch      {nm(np.median(a))}")

    # Which keys put root/3rd/5th inside the comfortable band?
    lo_c, hi_c = np.percentile(a,20), np.percentile(a,80)
    print(f"\n=== KEYS THAT FIT (chord tones inside {nm(lo_c)}..{nm(hi_c)}) ===")
    scores = []
    for root in range(12):
        for qual, ivs in (("minor",[0,3,7,10]), ("major",[0,4,7,11])):
            hits = 0
            for iv in ivs:
                for octv in range(0, 108, 12):
                    p = root + iv + octv
                    if lo_c <= p <= hi_c: hits += 1
            # how much of your singing lands on this scale
            sc = {(root+i)%12 for i in ([0,2,3,5,7,8,10] if qual=="minor" else [0,2,4,5,7,9,11])}
            inscale = np.mean([round(x)%12 in sc for x in a])
            scores.append((inscale, hits, NAMES[root], qual))
    scores.sort(reverse=True)
    seen=set()
    for inscale, hits, root, qual in scores:
        if (root,qual) in seen: continue
        seen.add((root,qual))
        if len(seen) > 6: break
        print(f"  {root} {qual:<6}  {inscale*100:4.1f}% of your notes are in this scale, {hits} chord tones in your comfort band")

    print("\n=== BEST TAKES TO CHOP ===")
    print("  (wants: HNR>12dB, stable core>120ms, and real pitch spread - a flat take can only make a drone)")
    ranked = sorted(rows, key=lambda r: -(min(r['hnr'],25)*1.5 + min(r['spread'],12)*2.5
                                          + min(r['core_ms'],400)/40 + min(r['dur'],90)/12))
    for r in ranked[:8]:
        flag = "" if (r['hnr']>12 and r['core_ms']>120) else "   <- weak: " + \
               ", ".join(x for x in [("low HNR" if r['hnr']<=12 else ""), ("no stable note" if r['core_ms']<=120 else "")] if x)
        print(f"  {r['name']:<20} spread {r['spread']:4.1f}st  HNR {r['hnr']:5.1f}dB  core {r['core_ms']:4.0f}ms  {nm(r['lo'])}..{nm(r['hi'])}{flag}")

import scipy.ndimage  # noqa: E402
main()

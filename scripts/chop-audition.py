"""Cut one LONG chop out of each of five recordings, for auditioning treatments rather than riffs.

usage: python scripts/chop-audition.py [--secs 3.0]

Deliberately not chop-cut.py. That one slices a recording into many short pitch-snapped chops for
building a line; this takes ONE long sustained passage per recording so there is something for a
heavy effect chain to actually chew on. A 200 ms stab through a granular reverb is just a click.

Source choice comes from the ranking in the recording-chop-candidates memory: pitch spread, HNR
and stable-core length, not loudness.
"""
import json, os, sys
import numpy as np, soundfile as sf, librosa

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "out", "audition")
SRC = r"C:/Users/juxxs/Documents/Sound Recordings"
a = sys.argv[1:]
SECS = float(a[a.index("--secs") + 1]) if "--secs" in a else 3.0

# (recording, seconds to take, label) - the drone gets a longer slice because the whole point of it
# is to be cut back up by a gate, so it needs to span bars.
PICKS = [
    ("Recording (8).wav",  7.0, "gate",      "57 s of one stable D3 - nothing to chop melodically, everything to gate"),
    ("Recording (5).wav",  SECS, "stretch",  "cleanest voice in the set, HNR 23.5 dB - survives being smeared"),
    ("Recording (26).wav", SECS, "formant",  "widest pitch spread, 19.8 st - most to gain from being shifted"),
    ("Recording (6).wav",  SECS, "crunch",   "the source the successful chop build used - known to hold up"),
    ("Recording (28).wav", SECS, "harmony",  "14.1 st spread, C3..D4 - sits where resonators can tune it"),
]

def best_window(y, sr, secs):
    """Loudest sustained *voiced* window, not merely the loudest - breath and fricatives are loud
    and useless. Scores on RMS times harmonicity so a fricative burst cannot win."""
    n = int(secs * sr)
    if len(y) <= n:
        return 0
    hop = 512
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    harm = librosa.effects.harmonic(y)
    hrms = librosa.feature.rms(y=harm, hop_length=hop)[0]
    score = rms * hrms
    w = max(1, n // hop)
    csum = np.cumsum(np.concatenate([[0], score]))
    means = (csum[w:] - csum[:-w]) / w
    return int(np.argmax(means) * hop)

os.makedirs(OUT, exist_ok=True)
man = []
for fname, secs, label, why in PICKS:
    p = os.path.join(SRC, fname)
    if not os.path.exists(p):
        print(f"  MISSING {fname}"); continue
    y, sr = librosa.load(p, sr=None, mono=True)
    start = best_window(y, sr, secs)
    seg = y[start:start + int(secs * sr)].copy()
    # Short fades so an abrupt cut does not click through the distortion chains.
    f = int(0.008 * sr)
    seg[:f] *= np.linspace(0, 1, f)
    seg[-f:] *= np.linspace(1, 0, f)
    peak = np.max(np.abs(seg)) or 1.0
    seg = seg / peak * 0.89
    out = os.path.join(OUT, f"{label}.wav")
    sf.write(out, seg, sr)
    man.append({"label": label, "file": out.replace("\\", "/"), "source": fname,
                "startSec": round(start / sr, 2), "secs": secs, "why": why})
    print(f"  {label:8s} {secs:4.1f}s from {fname} @ {start/sr:6.2f}s")

json.dump({"clips": man}, open(os.path.join(ROOT, "out", "audition.json"), "w"), indent=1)
print(f"\n{len(man)} written -> out/audition/")

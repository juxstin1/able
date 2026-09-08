"""Cut vocal chops out of a recording, snap them to a key, write them to out/chops/.

usage: python scripts/chop-cut.py "C:/path/Recording (19).wav" [--key Dmin] [--bpm 128] [--octave +1]
                                 [--formants preserve|follow] [--clean]
then:  node_modules/.bin/tsx scripts/chops.ts        # places them in the Arrangement

Step one of two. This does the DSP (onset detection, pitch tracking, key snapping, fades) and
writes out/chops/chop-NN.wav plus out/chops-place.json; chops.ts does the Live half. Kept in
Python because the DSP is librosa's - see docs/reference-pierstan.md for the analysis this came
out of. Needs librosa + soundfile, both already installed.

Two things that are load-bearing:
  - Each chop is clamped to the gap before the next placement. Without that, a long chop runs
    under the next one and Live SPLITS the earlier clip, leaving a stray tail fragment.
  - Each run tags its files with a timestamp and NOTHING IS DELETED unless you pass --clean. A
    saved Live set stores absolute paths to these wavs, so purging out/chops/ silently breaks any
    project that used them. Live also holds an open handle on every wav it has loaded and will not
    release it when the clip is deleted, so deletes fail anyway while the set is open - and
    succeed, destructively, once it is closed. Prefer Collect All and Save in Live to make a
    project self-contained.
"""
import json, os, sys, glob, time, warnings
warnings.filterwarnings("ignore")
import numpy as np, librosa, soundfile as sf
try:
    import pyworld as pw
except Exception:
    pw = None

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "out", "chops")
NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
SCALES = {  # semitone sets, natural minor / major
    "min": {0,2,3,5,7,8,10},
    "maj": {0,2,4,5,7,9,11},
}
# 8 bars as (offset-in-bar, target MIDI note). The FIRST version of this was rhythm-only and
# let each chop keep whatever pitch it happened to have - 7 of 12 landed on C4 and the result was
# a drone for 8 bars. Justin binned it. Pitch is now part of the pattern, not a side effect:
# every slot names a Dm chord tone and the chop gets transposed onto it.
F4, A4, C5, D5, F5 = 65, 69, 72, 74, 77
MELODY = [
    [(0, A4), (1.5, D5), (2.5, C5), (3.5, A4)],
    [(0, F4), (0.75, A4), (2, C5), (3.5, D5)],
    [(0, C5), (1.5, A4), (2.5, F4), (3.25, A4)],
    [(0, D5), (0.5, C5), (1.5, A4), (2.5, F4), (3.5, A4)],
    [(0, A4), (1.5, D5), (2.5, C5), (3.5, A4)],
    [(0, F4), (0.75, A4), (2, C5), (3.5, F5)],
    [(0, C5), (1.5, A4), (2.5, F4), (3.25, A4)],
    [(0, D5), (0.5, C5), (1.75, A4), (3, F4)],
]
# librosa.effects.pitch_shift is phase-vocoder + resample: formants MOVE WITH THE PITCH, which is
# why a sung vowel goes cartoonish past 3-4 semitones (Todd Edwards, first-hand: "if you pitch
# something up five or six notes... it just loses its quality"). WORLD decomposes into f0, spectral
# envelope and aperiodicity, and because the envelope sits on a fixed Hz grid, scaling f0 alone
# leaves the formants where they were - preservation is free, not an extra step. That buys a much
# wider usable shift range, which is what lets the assignment keep source diversity while still
# putting the melody in the right octave.
MAX_SHIFT_PRESERVE = 12
MAX_SHIFT_FOLLOW = 5   # chipmunk is a genre-correct choice, but it breaks sooner
MELODY_ROOT = 2  # the MELODY table above is written in D minor; --key transposes it from here


def shift(seg, sr, n_steps, preserve=True):
    """Transpose a chop. preserve=True keeps the formants where they are (WORLD); False lets them
    ride the pitch, which is the deliberate chipmunk sound speed garage is built on."""
    if abs(n_steps) < 0.05:
        return seg
    if not preserve or pw is None:
        return np.stack([librosa.effects.pitch_shift(seg[ch], sr=sr, n_steps=float(n_steps))
                         for ch in range(seg.shape[0])])
    out = []
    for ch in range(seg.shape[0]):
        x = np.ascontiguousarray(seg[ch], dtype=np.float64)
        f0, t = pw.harvest(x, sr, f0_floor=70.0, f0_ceil=1000.0, frame_period=5.0)
        f0 = pw.stonemask(x, f0, t, sr)
        sp = pw.cheaptrick(x, f0, t, sr)          # spectral envelope = the formants
        ap = pw.d4c(x, f0, t, sr)
        y = pw.synthesize(f0 * (2.0 ** (n_steps / 12.0)), sp, ap, sr, frame_period=5.0)
        y = y[:seg.shape[1]] if len(y) >= seg.shape[1] else np.pad(y, (0, seg.shape[1] - len(y)))
        out.append(y.astype(np.float32))
    return np.stack(out)

def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    src = sys.argv[1]
    key = sys.argv[sys.argv.index("--key")+1] if "--key" in sys.argv else "Dmin"
    bpm = float(sys.argv[sys.argv.index("--bpm")+1] if "--bpm" in sys.argv else 128)
    root = NAMES.index(key[:-3].upper().replace("B","A#") if len(key)>4 else key[:-3].upper())
    scale = {(root+i) % 12 for i in SCALES[key[-3:]]}
    spb = 60.0/bpm
    # --key used to be recorded in the manifest and nothing else, which would hand you a D minor
    # melody labelled E minor. Transpose the written shape to the requested root instead.
    global PRESERVE, MAX_SHIFT
    PRESERVE = (sys.argv[sys.argv.index("--formants")+1] if "--formants" in sys.argv else "preserve") == "preserve"
    MAX_SHIFT = MAX_SHIFT_PRESERVE if PRESERVE else MAX_SHIFT_FOLLOW
    if PRESERVE and pw is None:
        print("WARNING: pyworld not importable, falling back to formant-moving shift"); MAX_SHIFT = MAX_SHIFT_FOLLOW
    print(f"pitch shift: formants {'preserved (WORLD)' if PRESERVE else 'follow pitch (chipmunk)'}, max {MAX_SHIFT} st")
    keyshift = (root - MELODY_ROOT) % 12
    if keyshift > 6: keyshift -= 12

    os.makedirs(OUT, exist_ok=True)
    # DO NOT delete old chops by default. A saved Live set references these wavs by path, and
    # out/ is gitignored, so deleting them silently breaks any project that used them - including
    # closed ones, which cannot complain. Filenames are timestamped per run, so nothing collides
    # and leaving them costs a few MB. --clean is opt-in for when you know nothing needs them.
    run = time.strftime("%H%M%S")
    if "--clean" in sys.argv:
        gone = 0
        for f in glob.glob(os.path.join(OUT, "*.wav")):
            try: os.remove(f); gone += 1
            except PermissionError: pass
        print(f"--clean: removed {gone} old chop files")
    else:
        old = len(glob.glob(os.path.join(OUT, "*.wav")))
        if old: print(f"({old} existing chops left in place - a saved set may reference them; --clean to purge)")

    sr_a = 22050
    ya, _ = librosa.load(src, sr=sr_a, mono=True)
    on = librosa.onset.onset_detect(y=ya, sr=sr_a, units='time', backtrack=True, delta=0.2, wait=4)
    f0 = librosa.yin(ya, fmin=100, fmax=700, sr=sr_a, frame_length=1024, hop_length=256)
    tf = librosa.times_like(f0, sr=sr_a, hop_length=256)
    rf = librosa.feature.rms(y=ya, frame_length=1024, hop_length=256)[0]
    tr = librosa.times_like(rf, sr=sr_a, hop_length=256)
    peak = rf.max()

    cands = []
    for i, t in enumerate(on):
        end = min(on[i+1] if i+1 < len(on) else len(ya)/sr_a, t+0.9)
        if end-t < 0.14: continue
        m = (tf >= t+0.02) & (tf < end-0.02)
        if m.sum() < 8: continue
        p = f0[m]; p = p[(p > 100) & (p < 700)]
        if len(p) < 8: continue
        mi = librosa.hz_to_midi(p)
        stab = float(np.std(mi)); loud = float(rf[(tr >= t) & (tr < end)].mean()/peak)
        if stab > 1.4 or loud < 0.18: continue
        cands.append(dict(start=float(t), end=float(end), midi=float(np.median(mi)), stab=stab, loud=loud))
    if not cands: sys.exit("no usable chops found - try a different recording")
    print(f"{len(on)} onsets -> {len(cands)} usable")
    lo = min(c["midi"] for c in cands); hi = max(c["midi"] for c in cands)
    print(f"candidate pitch spread {hi-lo:.1f} semitones ({lo:.1f}..{hi:.1f} MIDI)")

    y, sr = sf.read(src, always_2d=True); y = y.T.astype(np.float32)
    slots = [(bar*4+off, note + keyshift) for bar, bars in enumerate(MELODY) for off, note in bars]
    if keyshift: print(f"melody transposed {keyshift:+d} st into {key}")
    beats = [b for b, _ in slots]
    END = len(MELODY)*4
    # For each slot pick the candidate needing the smallest transpose onto that note, spreading
    # use across the pool so the same chop is not hammered.
    # Put the written melody in whatever octave this recording can actually reach. A take that
    # only yields G4..D5 cannot play a riff written around C4 - shift the whole shape, keep it.
    cmed = float(np.median([c["midi"] for c in cands]))
    mmed = float(np.median([n for _, n in slots]))
    oct_shift = 12 * int(round((cmed - mmed) / 12))
    # Auto-fit centres the melody on the take, which is right for tracking the source but wrong
    # for function: vocal chops belong ABOVE the bass, not down at G2 fighting it. --octave nudges
    # the result, and pitching chops UP is the genre-correct direction anyway.
    manual_oct = int(sys.argv[sys.argv.index("--octave")+1]) if "--octave" in sys.argv else 0
    oct_shift += manual_oct * 12
    if oct_shift:
        slots = [(b, n + oct_shift) for b, n in slots]
        print(f"melody moved {oct_shift:+d} semitones to sit in this take's range"
              + (f" (auto {oct_shift - manual_oct*12:+d}, you asked {manual_oct:+d} oct)" if manual_oct else ""))
    used = {}
    picks = []
    for _, note in slots:
        best = None
        for cand_note in (note, note-12, note+12):   # keep the pitch class, drop the octave
            for j, c in enumerate(cands):
                sh = cand_note - c["midi"]
                if abs(sh) > MAX_SHIFT: continue
                cost = abs(sh) + used.get(j, 0)*1.6 + c["stab"]*0.5 - c["loud"]*0.8 + (0 if cand_note == note else 2.5)
                if best is None or cost < best[0]: best = (cost, j, sh)
            if best is not None: break
        if best is None: sys.exit(f"no candidate within {MAX_SHIFT} semitones of MIDI {note} or its octaves")
        used[best[1]] = used.get(best[1], 0) + 1
        picks.append((best[1], best[2]))
    print(f"using {len(set(j for j,_ in picks))} distinct source chops across {len(set(n for _,n in slots))} pitches")
    placed = []
    for i, (bt, note) in enumerate(slots):
        gap = ((beats[i+1] if i+1 < len(beats) else END) - bt) * spb
        j, shf = picks[i]
        c = dict(cands[j]); c["shift"] = shf
        a = int(c["start"]*sr); b = min(int(c["end"]*sr), a+int(gap*sr))
        seg = y[:, a:b].copy()
        if seg.shape[1] < int(0.05*sr): continue
        seg = shift(seg, sr, c["shift"], preserve=PRESERVE)
        n = seg.shape[1]
        fi = min(int(0.003*sr), n//4); fo = min(int(0.015*sr), n//3)
        seg[:, :fi] *= np.linspace(0, 1, fi); seg[:, -fo:] *= np.linspace(1, 0, fo)
        pk = np.abs(seg).max()
        if pk > 0: seg *= min(0.89/pk, 4.0)
        name = f"chop-{run}-{len(placed):02d}.wav"
        sf.write(os.path.join(OUT, name), seg.T, sr, subtype="PCM_24")
        placed.append(dict(file=os.path.join(OUT, name), beat=round(bt, 3), bar=int(bt//4)+1,
                           lenSec=round(n/sr, 3), lenBeats=round(n/sr/spb, 3),
                           src=round(c["start"], 2), note=note, shift=round(float(c["shift"]), 2)))
    mf = os.path.join(ROOT, "out", "chops-place.json")
    json.dump(dict(bpm=bpm, bars=len(MELODY), source=src, key=key, clips=placed), open(mf, "w"), indent=1)
    print(f"wrote {len(placed)} chops to {OUT}\nmanifest {mf}\nnow: node_modules/.bin/tsx scripts/chops.ts")

main()

"""Pull a YouTube tutorial down to the two things worth keeping: a clean transcript and frames.

usage: python scripts/learn-fetch.py <url|videoId>            # metadata + transcript only (seconds)
       python scripts/learn-fetch.py <url> --frames 300,420   # + 1080p frames at those seconds
       python scripts/learn-fetch.py --search "ukg vocal chops ableton" [--n 5]
       python scripts/learn-fetch.py <url> --frames 300 --crop right   # crop to a screen region
       python scripts/learn-fetch.py <url> --whisper [large-v3]        # no captions? transcribe it

Everything lands in out/learn/<videoId>/ (gitignored): meta.json, transcript.txt, frames/*.jpg.
The video file itself is deleted after frames are cut - it is 70 MB of nothing once you have the
frames, and re-fetching costs ~10 s.

Why frames matter: tutorials put the actual information ON SCREEN. The transcript says "bring the
drive up a bit"; the frame says Drive 32%, and the mixer says -7.8 dB. Verified on a 1080p pull -
track names, fader values and sample names are all legible; at 480p they are not. Always 1080p.

Two environment facts, both learned the hard way:
  - YouTube 403s the video streams without impersonation. That needs curl_cffi AND a yt-dlp new
    enough to use it, both in the SAME interpreter - so this calls `python -m yt_dlp`, never the
    standalone `yt-dlp` binary on PATH, which cannot see the pip-installed curl_cffi.
  - yt-dlp's --download-sections fails against this ffmpeg build (exit 3436169992). So we pull the
    whole low-cost 1080p video-only stream and seek locally, which is fast anyway.
Subtitles need none of that and are ~100 KB.
"""
import html, json, os, re, subprocess, sys, shutil

# Windows consoles are cp1252 and YouTube titles are full of emoji, so an unguarded print
# of a search result kills the run on a character, not on anything real.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "out", "learn")
NEWLINE = chr(10)
YTDLP = [sys.executable, "-m", "yt_dlp"]
IMPERSONATE = ["--impersonate", "Chrome-136"]

CROPS = {  # ffmpeg crop expressions for the parts of a DAW screen that carry settings
    "right": "crop=iw*0.42:ih*0.55:iw*0.58:0",       # mixer / device panel
    "bottom": "crop=iw:ih*0.34:0:ih*0.66",           # Ableton's device chain strip
    "left": "crop=iw*0.45:ih:0:0",
    "full": None,
}

def run(args, **kw):
    return subprocess.run(args, capture_output=True, text=True, **kw)

def search(q, n):
    r = run(YTDLP + ["--flat-playlist", "--dump-json", f"ytsearch{n}:{q}"])
    for line in r.stdout.splitlines():
        try: d = json.loads(line)
        except Exception: continue
        dur = d.get("duration") or 0
        print(f"{d['id']}  {int(dur)//60:>3}m  {(d.get('view_count') or 0):>9,}  {d.get('channel','?')[:22]:<22}  {d.get('title','')[:70]}")

def clean_vtt(path):
    """Auto-captions are a rolling 2-line window - roughly half of every file is repeats."""
    out, last = [], None
    cur_t = None
    for line in open(path, encoding="utf8", errors="replace"):
        line = line.rstrip("\n")
        m = re.match(r"^(\d\d):(\d\d):(\d\d)\.\d+ -->", line)
        if m:
            cur_t = int(m.group(1))*3600 + int(m.group(2))*60 + int(m.group(3))
            continue
        if not line.strip() or line.startswith(("WEBVTT", "Kind:", "Language:")): continue
        txt = html.unescape(re.sub(r"<[^>]+>", "", line)).strip()
        txt = re.sub(r"^>>\s*", "", txt).strip()
        if not txt or txt == last: continue
        last = txt
        out.append((cur_t or 0, txt))
    # merge into ~15 s blocks so it reads like prose with timestamps you can jump to
    blocks, buf, t0 = [], [], None
    for t, txt in out:
        if t0 is None: t0 = t
        if t - t0 >= 15 and buf:
            blocks.append((t0, " ".join(buf))); buf, t0 = [], t
        buf.append(txt)
    if buf: blocks.append((t0 or 0, " ".join(buf)))
    return "\n".join(f"[{t//60:02d}:{t%60:02d}] {b}" for t, b in blocks)

def whisper_transcript(d, url, model_name="large-v3"):
    """Transcribe when YouTube has no captions. Only worth it for a source that matters - a
    firsthand interview, an artist building a track - because it costs minutes, not seconds.

    CTranslate2 (what faster-whisper runs on) is CUDA-only. The GPU on this machine is AMD/ROCm,
    so torch reporting cuda=True is a ROCm alias and means nothing here - it runs on CPU. int8 on
    16 threads is the usable compromise; large-v3 in float32 is not."""
    # ctranslate2 ships libiomp5md.dll and something already in this env has loaded libomp140,
    # so the import aborts with "OMP: Error #15". This is the documented escape hatch. Intel warn
    # it can skew numerics; for speech-to-text that risk is not meaningful, and the alternative is
    # no transcript at all. Scoped to this call, not exported for the whole script.
    os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")
    from faster_whisper import WhisperModel
    au = os.path.join(d, "a.m4a")
    r = run(YTDLP + IMPERSONATE + ["-f", "ba", "-o", au, "--force-overwrites", url])
    if r.returncode or not os.path.exists(au):
        print(f"  audio failed: {r.stderr[-300:]}"); return None
    try:
        model = WhisperModel(model_name, device="cuda", compute_type="int8")
    except Exception:
        model = WhisperModel(model_name, device="cpu", compute_type="int8", cpu_threads=min(16, os.cpu_count() or 4))
    segments, _ = model.transcribe(au, language="en", vad_filter=True)
    # Same ~15 s blocks as clean_vtt, so a whisper transcript and a caption one read identically.
    blocks, buf, t0 = [], [], None
    for seg in segments:
        t = int(seg.start)
        if t0 is None: t0 = t
        if t - t0 >= 15 and buf:
            blocks.append((t0, " ".join(buf))); buf, t0 = [], t
        buf.append(seg.text.strip())
    if buf: blocks.append((t0 or 0, " ".join(buf)))
    txt = NEWLINE.join(f"[{t//60:02d}:{t%60:02d}] {b}" for t, b in blocks)
    open(os.path.join(d, "transcript.txt"), "w", encoding="utf8").write(txt)
    os.remove(au)
    print(f"  whisper transcript: {len(txt.split())} words -> {d}/transcript.txt")
    return txt

def fetch(url, frames=None, crop="full", whisper=None):
    # A bare video id starting with "-" (they exist) is parsed as an option by yt-dlp and the run
    # dies with "no such option". Promote any bare id to a full watch URL before it gets there.
    if not url.startswith(("http://", "https://", "www.")):
        url = "https://www.youtube.com/watch?v=" + url
    r = run(YTDLP + ["--dump-json", "--skip-download", url])
    if r.returncode: sys.exit(f"metadata failed: {r.stderr[-400:]}")
    m = json.loads(r.stdout)
    vid = m["id"]
    d = os.path.join(OUT, vid); os.makedirs(d, exist_ok=True)
    meta = {k: m.get(k) for k in ("id","title","channel","channel_id","duration","view_count","like_count","upload_date","webpage_url","description")}
    json.dump(meta, open(os.path.join(d, "meta.json"), "w", encoding="utf8"), indent=1)
    print(f"{meta['title']}\n  {meta['channel']}  ·  {(meta['duration'] or 0)//60}m  ·  {meta['view_count'] or 0:,} views  ·  {meta['upload_date']}")

    sub = os.path.join(d, "sub")
    run(YTDLP + ["--write-auto-sub", "--sub-lang", "en", "--sub-format", "vtt", "--skip-download", "-o", sub, url])
    vtt = next((os.path.join(d, f) for f in os.listdir(d) if f.endswith(".vtt")), None)
    if vtt:
        txt = clean_vtt(vtt)
        open(os.path.join(d, "transcript.txt"), "w", encoding="utf8").write(txt)
        print(f"  transcript: {len(txt.split())} words -> {d}/transcript.txt")
    else:
        if whisper:
            whisper_transcript(d, url, whisper)
        else:
            print("  NO CAPTIONS - rerun with --whisper if this one matters (costs minutes, not seconds)")

    if frames:
        vf = os.path.join(d, "v.mp4")
        r = run(YTDLP + IMPERSONATE + ["-f", "bv*[height<=1080]", "-o", vf, "--force-overwrites", url])
        if r.returncode or not os.path.exists(vf): sys.exit(f"video failed: {r.stderr[-400:]}")
        fd = os.path.join(d, "frames"); os.makedirs(fd, exist_ok=True)
        vfilter = CROPS.get(crop)
        for t in frames:
            name = os.path.join(fd, f"t{int(t):05d}{'' if crop=='full' else '_'+crop}.jpg")
            args = ["ffmpeg", "-v", "error", "-ss", str(t), "-i", vf, "-frames:v", "1", "-q:v", "2"]
            if vfilter: args += ["-vf", f"{vfilter},scale=1600:-1"]
            args += [name, "-y"]
            run(args)
            print(f"  frame {int(t)//60:02d}:{int(t)%60:02d} -> {name}")
        os.remove(vf)  # 70 MB of nothing once the frames are out
    return d

def main():
    a = sys.argv[1:]
    if not a: print(__doc__); sys.exit(1)
    if a[0] == "--search":
        n = int(a[a.index("--n")+1]) if "--n" in a else 5
        return search(a[1], n)
    url = a[0]
    frames = None
    if "--frames" in a:
        frames = [float(x) for x in a[a.index("--frames")+1].split(",") if x.strip()]
    crop = a[a.index("--crop")+1] if "--crop" in a else "full"
    # --whisper takes an optional model name; bare --whisper means large-v3.
    whisper = None
    if "--whisper" in a:
        nxt = a[a.index("--whisper")+1] if a.index("--whisper")+1 < len(a) else ""
        whisper = nxt if nxt and not nxt.startswith("--") else "large-v3"
    fetch(url, frames, crop, whisper)

main()

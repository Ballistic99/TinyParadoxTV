#!/usr/bin/env python3
"""Pipeline CLI - one entry point for everything except writing the scenes. Works on Windows, macOS and Linux.

  python pipeline/tp.py new <slug> <CompName> [base]     new short in studio/src/videos/<slug>, copied from the starter (or <base>)
  python pipeline/tp.py voice work/<slug> [voice] [speed] script.json -> voice, word timings, subtitles (copied into the studio)
  python pipeline/tp.py make <slug>                      render in safe chunks, join, add mix.wav -> studio/out/<Name>_TikTok_1080x1920.mp4
  python pipeline/tp.py check <video> [expected] [off]   every-frame QA: count, frozen, blank, odd (glitch) frames
  python pipeline/tp.py assemble <out.mp4> <mix.wav> <patchDir|-> <chunks...>   frame-exact join + audio, with patched frames
"""
import json, os, re, shutil, subprocess, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); STUDIO = os.path.normpath(os.path.join(HERE, "..", "studio"))
TTS = os.environ.get("TP_TTS", os.path.join(HERE, "..", "tts"))  # kokoro-v1.0.onnx + voices-v1.0.bin
WIN = os.name == "nt"

def _tool(name):
    """ffmpeg: the one on the PATH, else imageio-ffmpeg (pip install imageio-ffmpeg, in requirements.txt), else Remotion's own"""
    p = shutil.which(name)
    if p: return [p]
    if name == "ffmpeg":
        try:
            import imageio_ffmpeg; return [imageio_ffmpeg.get_ffmpeg_exe()]
        except Exception: pass
    if os.path.isdir(os.path.join(STUDIO, "node_modules", "@remotion")): return ["npx", "remotion", name]
    sys.exit("ffmpeg not found: run `pip install imageio-ffmpeg` (or `pip install -r requirements.txt`)")
FF = _tool("ffmpeg")
def _run(cmd, **kw):  # npx is a .cmd file on Windows: it needs the shell there
    return subprocess.run(cmd, shell=WIN and cmd[0] == "npx", cwd=STUDIO if cmd[0] == "npx" else None, **kw)
def _popen(cmd, **kw):
    return subprocess.Popen(cmd, shell=WIN and cmd[0] == "npx", cwd=STUDIO if cmd[0] == "npx" else None, **kw)
def _abs(p): return os.path.abspath(p)

def new(slug, comp, base="starter"):
    """copy studio/src/videos/<base> (default: the starter) to <slug> and register it as composition <comp>"""
    vids = os.path.join(STUDIO, "src", "videos"); src = os.path.join(vids, base); dst = os.path.join(vids, slug)
    if not os.path.isdir(src): sys.exit(f"no short called {base} in studio/src/videos")
    if os.path.exists(dst): sys.exit(f"{dst} exists")
    if not re.fullmatch(r"[A-Z][A-Za-z0-9]*", comp): sys.exit("CompName must look like MyStoryShort (letters and digits, capital first)")
    shutil.copytree(src, dst)
    b = os.path.join(dst, "Bridge.tsx"); s = open(b, encoding="utf8").read()
    old_comp = re.search(r"export const (\w+): React\.FC", s).group(1); old_frames = re.search(r"export const (\w+_FRAMES)", s).group(1)
    s = s.replace(old_comp, comp).replace(old_frames, comp.upper() + "_FRAMES").replace(f'"{base}/mix.wav"', f'"{slug}/mix.wav"'); open(b, "w", encoding="utf8").write(s)
    root = os.path.join(STUDIO, "src", "Root.tsx"); r = open(root, encoding="utf8").read()
    r = r.replace('export const RemotionRoot', f'import {{ {comp}, {comp.upper()}_FRAMES }} from "./videos/{slug}/Bridge";\nexport const RemotionRoot', 1)
    r = r.replace("</>);", f'  <Composition id="{comp}" component={{{comp}}} durationInFrames={{{comp.upper()}_FRAMES}} fps={{30}} width={{1080}} height={{1920}} />\n</>);', 1)
    open(root, "w", encoding="utf8").write(r); os.makedirs(os.path.join(STUDIO, "public", slug), exist_ok=True)
    vj = os.path.join(STUDIO, "videos.json"); V = json.load(open(vj, encoding="utf8"))
    V[slug] = {"comp": comp, "audio": f"public/{slug}/mix.wav", "name": comp[:-5] if comp.endswith("Short") else comp}
    json.dump(V, open(vj, "w", encoding="utf8"), indent=2)
    shutil.copy(os.path.join(STUDIO, "public", "starter", "mix.wav"), os.path.join(STUDIO, "public", slug, "mix.wav"))  # silent until the voice is made
    os.makedirs(os.path.join(HERE, "..", "work", slug), exist_ok=True)
    print(f"new short: {dst}\nnext: write work/{slug}/script.json, then `python pipeline/tp.py voice work/{slug}`")

def voice(wd, vname="am_puck", speed="1.1"):
    import soundfile as sf
    from kokoro_onnx import Kokoro
    for f in ("kokoro-v1.0.onnx", "voices-v1.0.bin"):
        if not os.path.exists(os.path.join(TTS, f)): sys.exit(f"missing tts/{f}: download it from the kokoro-onnx GitHub releases (see README)")
    k = Kokoro(os.path.join(TTS, "kokoro-v1.0.onnx"), os.path.join(TTS, "voices-v1.0.bin"))
    S = json.load(open(os.path.join(wd, "script.json"), encoding="utf8")); say = json.load(open(os.path.join(wd, "say.json"), encoding="utf8")) if os.path.exists(os.path.join(wd, "say.json")) else {}
    sr = 24000; out = [np.zeros(int(sr * 0.08))]; t = 0.08; L = []
    for s in S:
        txt = s
        for a, b in say.items(): txt = txt.replace(a, b)
        a, _ = k.create(txt, voice=vname, speed=float(speed), lang="en-us")
        idx = np.where(np.abs(a) > 0.008)[0]; a = a[max(0, idx[0] - 1200): idx[-1] + 400]
        d = len(a) / sr; L.append({"text": s, "start": round(t, 3), "dur": round(d, 3)}); out += [a, np.zeros(int(sr * 0.1))]; t += d + 0.1
    out.append(np.zeros(int(sr * 0.6))); v = np.concatenate(out); sf.write(os.path.join(wd, "voice.wav"), v, sr)
    _run(FF + ["-loglevel", "error", "-y", "-i", _abs(os.path.join(wd, "voice.wav")), "-ar", "48000", _abs(os.path.join(wd, "voice48.wav"))], check=True)
    json.dump(L, open(os.path.join(wd, "lines.json"), "w"), indent=1)
    # word timing: split each line at its pauses, share time by phoneme count inside each piece
    hop = int(sr * 0.01); rms = np.sqrt(np.convolve(v ** 2, np.ones(hop) / hop, "same"))[::hop]; W = []
    def ph(w):
        w = re.sub(r"[^\w']", "", w)
        try: return max(1, len(k.tokenizer.phonemize(say.get(w, w), "en-us").replace(" ", "")))
        except Exception: return max(1, len(w))
    for li, l in enumerate(L):
        ws = l["text"].split(); a = l["start"]; b = a + l["dur"]; brk = [i for i, w in enumerate(ws[:-1]) if w[-1] in ",.?:"]
        seg = rms[int(a * 100):int(b * 100)]; thr = max(0.004, 0.06 * seg.max()); sil = []; run = 0
        for j, x in enumerate(seg):
            if x < thr: run += 1
            else:
                if run >= 7: sil.append((j - run, j))
                run = 0
        sil = sorted(sorted([s for s in sil if s[0] > 10 and s[1] < len(seg) - 10], key=lambda s: s[0] - s[1])[:len(brk)])
        bounds = [a] + ([x for s0, s1 in sil for x in (a + s0 / 100, a + s1 / 100)] if len(sil) == len(brk) else []) + [b]
        if len(sil) != len(brk): brk = []
        groups = []; st = 0
        for bi in brk + [len(ws) - 1]: groups.append(ws[st:bi + 1]); st = bi + 1
        for gi, g in enumerate(groups):
            ga, gb = bounds[2 * gi], bounds[2 * gi + 1]; wt = [ph(w) for w in g]; tot = sum(wt); tt = ga
            for w, x in zip(g, wt): dd = (gb - ga) * x / tot; W.append({"w": w, "s": round(tt, 3), "e": round(tt + dd, 3), "line": li}); tt += dd
    json.dump(W, open(os.path.join(wd, "words.json"), "w"))
    def ts(x): ms = int(round(x * 1000)); return f"{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d},{ms%1000:03d}"
    cues = []; cur = []
    for i, w in enumerate(W):
        cur.append(w)
        if w["w"][-1] in ".,?!" or len(cur) >= 4 or i == len(W) - 1 or W[i + 1]["line"] != w["line"]: cues.append(cur); cur = []
    srt = [f"{n+1}\n{ts(c[0]['s'])} --> {ts(min(c[-1]['e'] + 0.25, cues[n+1][0]['s'] - 0.02) if n + 1 < len(cues) else c[-1]['e'])}\n{' '.join(x['w'] for x in c)}\n" for n, c in enumerate(cues)]
    open(os.path.join(wd, "subtitles.srt"), "w", encoding="utf8").write("\n".join(srt))
    slug = os.path.basename(os.path.normpath(wd)); vd = os.path.join(STUDIO, "src", "videos", slug)
    if os.path.isdir(vd):  # hand the timings to the studio: captions read words.json, the voice plays until the mix is ready
        shutil.copy(os.path.join(wd, "words.json"), os.path.join(vd, "words.json"))
        os.makedirs(os.path.join(STUDIO, "public", slug), exist_ok=True); shutil.copy(os.path.join(wd, "voice48.wav"), os.path.join(STUDIO, "public", slug, "mix.wav"))
        print(f"copied words.json -> {vd} and the voice -> studio/public/{slug}/mix.wav")
    print(f"voice {t:.1f}s = {round(t*30)} frames, {len(W)} words; line starts (frames):", [round(l['start'] * 30) for l in L])

def make(slug):
    r = subprocess.run(["node", os.path.join("scripts", "make.mjs"), slug], cwd=STUDIO)
    sys.exit(r.returncode)

def check(f, exp=None, off=0):
    W, H = 180, 320
    p = _popen(FF + ["-loglevel", "error", "-i", _abs(f), "-vsync", "passthrough", "-vf", f"scale={W}:{H}:flags=area", "-pix_fmt", "rgb24", "-c:v", "rawvideo", "-f", "image2pipe", "-"], stdout=subprocess.PIPE)
    prev2 = prev = None; n = 0; odd, frozen, blank = [], [], []; off = int(off)
    while True:
        b = p.stdout.read(W * H * 3)
        if len(b) < W * H * 3: break
        a = np.frombuffer(b, np.uint8).astype(np.float32); m = a.mean()
        if m > 245 or m < 8: blank.append(n + off)
        if prev is not None and np.abs(a - prev).mean() < 0.05: frozen.append(n + off)
        if prev2 is not None:
            e = np.abs(prev - (prev2 + a) / 2).mean(); base = np.abs(prev2 - a).mean()
            if e > 3.0 and e > 2.2 * base + 1: odd.append(n - 1 + off)
        prev2, prev = prev, a; n += 1
    print(json.dumps({"frames": n, "count_ok": exp in (None, "-") or n == int(exp), "odd": odd, "frozen": frozen, "blank": blank}))

def assemble(out, aud, pdir, *chunks):
    from PIL import Image
    info = _run(FF + ["-hide_banner", "-i", _abs(chunks[0])], capture_output=True, text=True).stderr
    W, H = map(int, re.search(r"Video:.*?(\d{2,5})x(\d{2,5})", info).groups())
    patch = {int(fn[1:-4]): os.path.join(pdir, fn) for fn in (os.listdir(pdir) if pdir != "-" and os.path.isdir(pdir) else []) if fn.startswith("f") and fn.endswith(".png")}
    enc = _popen(FF + ["-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", "30", "-i", "-", "-i", _abs(aud), "-map", "0:v:0", "-map", "1:a:0",
        "-vf", "scale=1080:1920:flags=lanczos", "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", _abs(out)], stdin=subprocess.PIPE)
    n = 0; fs = W * H * 3
    for c in chunks:
        dec = _popen(FF + ["-loglevel", "error", "-i", _abs(c), "-vsync", "passthrough", "-pix_fmt", "rgb24", "-c:v", "rawvideo", "-f", "image2pipe", "-"], stdout=subprocess.PIPE)
        while True:
            b = dec.stdout.read(fs)
            if len(b) < fs: break
            if n in patch: b = Image.open(patch[n]).convert("RGB").resize((W, H), Image.LANCZOS).tobytes()
            enc.stdin.write(b); n += 1
        dec.wait()
    enc.stdin.close(); enc.wait(); print(f"{n} frames, {len(patch)} patched -> {out}")

if __name__ == "__main__":
    cmds = {"new": new, "voice": voice, "make": make, "check": check, "assemble": assemble}
    if len(sys.argv) < 2 or sys.argv[1] not in cmds: sys.exit(__doc__)
    cmds[sys.argv[1]](*sys.argv[2:])

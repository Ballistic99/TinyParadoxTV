import os, sys, numpy as np
# usage: python3 score_template.py [workdir]  (reads workdir/voice48.wav, writes workdir/mix.wav; default: current folder)
# dsp.py + instruments.py live in pipeline/audio; found next to this file, or from work/<slug>/audio/score.py, or via TP_AUDIO
_here = os.path.dirname(os.path.abspath(__file__))
for _d in [os.environ.get("TP_AUDIO", ""), os.path.join(_here, "audio"), os.path.join(_here, "..", "..", "..", "pipeline", "audio"), os.path.join(os.getcwd(), "pipeline", "audio")]:
    if _d and os.path.exists(os.path.join(_d, "dsp.py")): sys.path.insert(0, os.path.abspath(_d)); break
WORK = sys.argv[1] if len(sys.argv) > 1 else "."
from dsp import SR, ns, rng, place, integrated, lp, hp, read_wav, write_wav, dbg, make_ir, convolve_st
import instruments as I
FPS = 30; TOTAL = 1722 / FPS; N = ns(TOTAL + 0.5); r = rng(25); m = I.m2f; F = lambda f: f / FPS
mus = np.zeros((2, N)); fx = np.zeros((2, N))
def at(buf, x, t, g=1.0, p=0.0):
    x = np.asarray(x, dtype=float); x = x if x.ndim == 2 else np.stack([x * (1 - max(0, p)), x * (1 + min(0, p))]); place(buf, x, max(0, t), g)
# ---- music: a sneaky pizzicato con-man tune, D minor, 112 bpm; bass on 1 and 3, plucked melody, soft vibes ----
B = 60 / 112; BAR = 4 * B
PROG = [(38, [62, 65, 69]), (34, [62, 65, 70]), (31, [62, 67, 70]), (33, [61, 64, 69])]   # Dm Bb Gm A
MEL = [74, None, 72, 70, 69, None, 70, 72, 74, None, 77, 76, 74, None, 73, None]
t, k = 0.0, 0
while t < TOTAL + BAR:
    root, ch = PROG[k % 4]
    at(mus, I.pluck(m(root), 0.8, r, dur=B * 0.9, bright=0.3), t, 0.7); at(mus, I.pluck(m(root + 7), 0.6, r, dur=B * 0.9, bright=0.3), t + 2 * B, 0.55)
    for j in range(4):
        if j % 2: at(mus, I.pluck(m(ch[(j // 2) % 3] + 12), 0.45, r, dur=0.25, bright=0.6), t + j * B, 0.3, p=0.3)
    if k >= 1:
        for j in range(8):
            n = MEL[(k % 2) * 8 + j]
            if n is not None: at(mus, I.pluck(m(n - (0 if k % 4 < 2 else 2)), 0.55, r, dur=0.22, bright=0.7), t + j * B / 2, 0.32, p=-0.25)
    if k % 2 == 0: at(mus, I.pad([m(n) for n in ch], BAR * 2, 0.25, r, att=0.6, rel=0.8, warm=900), t, 0.25)
    for j in range(4):
        hh = hp(r.standard_normal(ns(0.04)), 8000) * np.exp(-np.arange(ns(0.04)) / SR / 0.01); at(mus, hh, t + j * B + B / 2, 0.07, p=0.3)
    t += BAR; k += 1
mus = convolve_st(mus, make_ir(1.1, 4))[:, :N] * 0.5 + mus * 0.7
# ---- effects ----
def whoosh(t, g=0.2):
    n = ns(0.36); x = r.standard_normal(n); e = np.sin(np.linspace(0, np.pi, n)) ** 2; at(fx, (lp(x, 2600) - lp(x, 350)) * e, t - 0.18, g)
def popsnd(t, g=0.4, f0=560):
    n = ns(0.13); f = np.linspace(f0, f0 * 2.1, n); at(fx, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-np.arange(n) / SR / 0.04), t, g)
kick = lambda: np.sin(2 * np.pi * np.cumsum(np.linspace(120, 42, ns(0.25))) / SR) * np.exp(-np.arange(ns(0.25)) / SR / 0.08)
def stamp(t, g=0.6): at(fx, kick(), t, g); n = ns(0.12); at(fx, lp(r.standard_normal(n), 1400) * np.exp(-np.arange(n) / SR / 0.03), t, g * 0.7)
def ding(t, g=0.4): at(fx, I.glock(m(96), 0.6, r), t, g); at(fx, I.glock(m(91), 0.5, r), t + 0.08, g * 0.8)
def step(t, g=0.18): n = ns(0.06); at(fx, lp(r.standard_normal(n), 900) * np.exp(-np.arange(n) / SR / 0.015), t, g, p=0.2 * r.standard_normal())
def rustle(t0, t1, g=0.05):
    tt = t0
    while tt < t1: n = ns(0.05); at(fx, hp(r.standard_normal(n), 3000) * np.exp(-np.arange(n) / SR / 0.012), tt, g * (0.5 + r.random()), p=r.standard_normal() * 0.4); tt += 0.04 + 0.05 * r.random()
for c in [105, 145, 249, 308, 385, 491, 628, 685, 760, 836, 911, 1033, 1107, 1187, 1252, 1319, 1390, 1492, 1537, 1584, 1626]: whoosh(F(c), 0.2)
for p_ in [6, 51, 122, 165, 191, 224, 280, 309, 354, 404, 417, 429, 466, 528, 599, 668, 690, 723, 822, 857, 888, 981, 1017, 1082, 1128, 1190, 1206, 1282, 1347, 1365, 1381, 1436, 1474, 1512, 1518, 1561, 1636]: popsnd(F(p_ + 1), 0.4, 520 + 60 * (p_ % 5))
for s_ in [238, 562, 783, 1233, 1606]: stamp(F(s_ + 1))
ding(F(1059), 0.5); rustle(F(1075), F(1107)); rustle(F(1537), F(1584), 0.07); rustle(F(1157), F(1187))
for tt in np.arange(F(1112), F(1187), 0.21): step(tt)
for tt in np.arange(F(1456), F(1492), 0.18): step(tt, 0.2)
for tt in np.arange(F(1430), F(1492), 0.2): step(tt + 0.07, 0.15)
at(fx, I.whistle([(F(1430), 2900), (F(1430) + 0.25, 2900), (F(1430) + 0.32, 2400), (F(1430) + 0.7, 2900)], r), 0, 0.5) if False else None
for i in range(3): n = ns(0.28); f = 2800 + 250 * np.sin(np.arange(n) / SR * 2 * np.pi * 28); at(fx, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-((np.arange(n) / SR - 0.14) / 0.12) ** 2), F(1430) + i * 0.34, 0.25)
at(fx, I.brass(m(55), 0.4, 0.6, r, kind="horn"), F(1690), 0.35); at(fx, I.brass(m(54), 0.4, 0.6, r, kind="horn"), F(1690) + 0.42, 0.35); at(fx, I.brass(m(53), 0.9, 0.7, r, kind="horn", fall=-40.0), F(1690) + 0.84, 0.4)
# ---- mix ----
v, _ = read_wav(os.path.join(WORK, "voice48.wav")); v = v if v.ndim == 2 else np.stack([v, v]); vo = np.zeros((2, N)); n0 = min(N, v.shape[1]); vo[:, :n0] = v[:, :n0]
env = np.convolve(np.abs(vo[0]), np.ones(2400) / 2400, "same"); mus *= 1 - 0.4 * np.clip(env / 0.04, 0, 1)
vo *= dbg(-15.5 - integrated(vo)); mus *= dbg(-25 - integrated(mus)); fx *= dbg(-23.5 - integrated(fx))
mix = vo + mus + fx; mix *= dbg(-14.5 - integrated(mix))
if np.abs(mix).max() > 0.95: mix = np.tanh(mix / 0.95) * 0.95
mix[:, -ns(0.6):] *= np.linspace(1, 0, ns(0.6))
write_wav(os.path.join(WORK, "mix.wav"), mix[:, :ns(TOTAL)]); print("LUFS", round(integrated(mix), 1))

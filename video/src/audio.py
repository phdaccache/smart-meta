"""Music and sound effects for the brag video (v5), written as one piece: 120 BPM, C major, 30 s.
Same score as v4; v5 adds the push from Plan to Today and the reel into the goal, and drops the signature scribble."""
import numpy as np, wave, sys

SR = 44100
DUR = 30.0
N = int(SR * (DUR + 0.01))
L = np.zeros(N); R = np.zeros(N)
rng = np.random.default_rng(11)

def midi(m): return 440.0 * 2 ** ((m - 69) / 12)

def put(sig, t0, gain=1.0, pan=0.0):
    i = int(t0 * SR)
    if i >= N: return
    sig = sig[: N - i] * gain
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    L[i:i + len(sig)] += sig * l * 1.414
    R[i:i + len(sig)] += sig * r * 1.414

def tt(d): return np.arange(int(d * SR)) / SR

def bandnoise(d, lo, hi):
    n = rng.standard_normal(int(d * SR))
    F = np.fft.rfft(n); f = np.fft.rfftfreq(len(n), 1 / SR)
    F[(f < lo) | (f > hi)] = 0
    out = np.fft.irfft(F, len(n))
    return out / (np.abs(out).max() + 1e-9)

# ——— harmony ———
# (start, pad voicing, bass root)
CHORDS = [
    (0, [57, 60, 64], 45), (2, [57, 60, 65], 41), (4, [55, 60, 64], 48), (6, [55, 59, 62], 43),
    (8, [57, 60, 64], 45), (9, [55, 60, 64], 48), (10, [55, 60, 64], 48), (12, [55, 59, 62], 43),
    (14, [57, 60, 64], 45), (16, [57, 60, 65], 41), (18, [55, 60, 64], 48), (20, [55, 59, 62], 43),
    (22, [57, 60, 64], 45), (24, [57, 60, 65], 41), (26, [55, 59, 62], 43), (27, [55, 60, 64, 67], 48),
]
def chord_at(t):
    c = CHORDS[0]
    for ch in CHORDS:
        if ch[0] <= t: c = ch
    return c

# ——— pad ———
def pad_note(f, d, bright):
    x = tt(d)
    s = np.zeros_like(x)
    for det in (-0.12, 0.12):
        ff = f * 2 ** (det / 12)
        for h in range(1, 9):
            s += np.sin(2 * np.pi * ff * h * x + h) * (1 / h ** (2.2 - bright))
    env = np.minimum(1, x / 0.45) * np.minimum(1, (d - x) / 0.7)
    return s * np.clip(env, 0, 1) * (1 + 0.08 * np.sin(2 * np.pi * 0.4 * x))

for i, (t0, notes, _) in enumerate(CHORDS):
    t1 = CHORDS[i + 1][0] if i + 1 < len(CHORDS) else DUR
    bright = 0.25 if t0 < 4 else (0.6 if t0 < 9 else (0.8 if t0 < 27 else 0.6))
    for j, m in enumerate(notes):
        put(pad_note(midi(m), t1 - t0 + 0.7, bright), max(0, t0 - 0.05), 0.022, pan=(j - 1) * 0.35)

# ——— music box plucks ———
def pluck(f, tau=0.4, d=1.2):
    x = tt(d)
    s = np.sin(2 * np.pi * f * x) + 0.28 * np.sin(4 * np.pi * f * x) * np.exp(-x / 0.12) + 0.06 * np.sin(6 * np.pi * f * x)
    return s * np.exp(-x / tau) * np.minimum(1, x / 0.003)

ARP = [0, 1, 2, 1, 2, 0, 1, 2]
step = 0
t = 0.0
while t < 28.0:
    ch = chord_at(t + 0.001)
    notes = [m + 12 for m in ch[1][:3]]
    night = t < 4
    if night and (step % 2): step += 1; t += 0.25; continue
    if 27 <= t < 28 and (step % 2): step += 1; t += 0.25; continue
    m = notes[ARP[step % 8]] + (12 if (step % 8) in (4, 5) and 9 <= t < 27 else 0)
    put(pluck(midi(m), 0.5 if night else 0.32), t, 0.11 if night else 0.085, pan=0.35 if step % 2 else -0.35)
    step += 1; t += 0.25

# ——— drums and bass: from the goal card (9.0) until the sign-off ———
def kick():
    x = tt(0.45)
    f = 45 + 95 * np.exp(-x * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-x * 7.5) + 0.15 * np.exp(-x * 400) * rng.standard_normal(len(x))

def hat():
    x = tt(0.06)
    n = np.diff(rng.standard_normal(len(x) + 1))
    return n * np.exp(-x * 90)

def snap():
    x = tt(0.25)
    return bandnoise(0.25, 900, 5000) * np.exp(-x * 22) + 0.4 * np.sin(2 * np.pi * 190 * x) * np.exp(-x * 30)

duck = np.ones(N)
for b in range(18, 54):  # beats 9.0 .. 26.5
    t0 = b * 0.5
    put(kick(), t0, 0.3 if b > 18 else 0.45)
    i = int(t0 * SR); x = tt(0.35)
    seg = 1 - 0.55 * np.exp(-x / 0.12)
    duck[i:i + len(seg)] = np.minimum(duck[i:i + len(seg)], seg[: N - i])
    put(hat(), t0 + 0.25, 0.05, pan=0.25)
    if b % 2 == 1: put(snap(), t0, 0.075, pan=-0.1)
    root = chord_at(t0 + 0.001)[2]
    x = tt(0.48)
    bass = (np.sin(2 * np.pi * midi(root) * x) + 0.25 * np.sin(4 * np.pi * midi(root) * x)) * np.exp(-x * 3.5) * np.minimum(1, x / 0.01)
    put(np.tanh(bass * 1.4), t0, 0.11)

# ——— effects, in key and in the same room ———
def pop(m):
    x = tt(0.18)
    f = midi(m) * (1 + 0.5 * np.exp(-x * 60))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x * 26) * np.minimum(1, x / 0.002)

def whoosh(d, lo=250, hi=2600, peak=0.6):
    x = tt(d)
    env = np.where(x < d * peak, (x / (d * peak)) ** 2, ((d - x) / (d * (1 - peak))) ** 1.5)
    return bandnoise(d, lo, hi) * env

def scribble(d, rate):
    x = tt(d)
    wob = 0.5 + 0.5 * np.sin(2 * np.pi * rate * x + 2 * np.sin(2 * np.pi * 3.1 * x))
    return bandnoise(d, 1800, 6500) * wob * np.minimum(1, x / 0.05) * np.minimum(1, (d - x) / 0.08)

def bell(f, d=2.4):
    x = tt(d)
    s = sum(a * np.sin(2 * np.pi * f * r * x) * np.exp(-x * k) for r, a, k in [(1, 1, 1.6), (2.0, 0.35, 2.5), (2.76, 0.18, 4), (5.4, 0.06, 7)])
    return s * np.minimum(1, x / 0.002)

# # night: goals bloom out of "goals."
for i, m in enumerate([72, 74, 76, 79, 81]):
    put(pop(m), 1.95 + i * 0.11 + 0.05, 0.10, pan=[-0.5, 0.5, -0.4, 0.4, 0][i])
put(whoosh(1.2, 200, 2200, 0.7), 3.3, 0.10)
x = tt(1.6); put(np.sin(2 * np.pi * midi(76) * x) * np.exp(-x * 2) * np.minimum(1, x / 0.3), 3.9, 0.04)
for i, (dt, m) in enumerate([(0.0, 79), (0.08, 76), (0.14, 74), (0.18, 72), (0.30, 67)]):
    put(pop(m), 4.45 + dt + 0.12, 0.06, pan=[-0.4, 0.3, -0.2, 0.4, 0][i])
put(whoosh(0.8, 3000, 9000, 0.3), 5.6, 0.03)
# logo pops in
put(pluck(midi(67), 0.3), 6.32, 0.08); put(pluck(midi(72), 0.3), 6.4, 0.055)
# riser; the logo splits into S M A R T; the vague goal lands on the drop
x = tt(1.85)
riser = bandnoise(1.85, 400, 6000) * (x / 1.85) ** 2.5 * 0.7
riser += np.sin(2 * np.pi * np.cumsum(220 * 2 ** (x * 1.1)) / SR) * (x / 1.85) ** 3 * 0.25
put(riser, 7.13, 0.09)
put(whoosh(0.6, 400, 3500, 0.6), 7.95, 0.06)
for i in range(5):
    put(pop(84 + [0, 2, 4, 7, 9][i]), 8.18 + i * 0.07, 0.035, pan=-0.6 + i * 0.3)
x = tt(2.0); put(bandnoise(2.0, 60, 1200) * np.exp(-x * 3) * 0.6, 9.0, 0.08)
x = tt(0.12); put(np.sin(2 * np.pi * 120 * x) * np.exp(-x * 35), 9.0, 0.12)
# one letter at a time
put(scribble(0.25, 14), 9.4, 0.035)
for i, (at, m) in enumerate(zip([9.45, 10.3, 10.9, 11.5, 12.1], [72, 74, 76, 79, 81])):
    put(pluck(midi(m), 0.3), at, 0.09, pan=-0.4 + i * 0.2)
    put(whoosh(0.35, 800, 5000, 0.4), at + 0.02, 0.03, pan=0.3)
# all five light up, a check lands
for i, m in enumerate([84, 86, 88, 91, 93]):
    put(pop(m), 12.4 + i * 0.06, 0.05, pan=-0.6 + i * 0.3)
put(bell(midi(91), 1.4), 12.55, 0.05)
# dive into the app
put(whoosh(0.6, 250, 3500, 0.7), 13.85, 0.09)
A0 = 14.45
for tb in (A0 + 0.3, A0 + 2.7, A0 + 6.1):
    put(pop(84), tb + 0.02, 0.05); put(pop(88), tb + 0.07, 0.035)
x = tt(0.08)
put(np.sin(2 * np.pi * 1500 * x) * np.exp(-x * 160) + 0.5 * np.sin(2 * np.pi * midi(72) * x) * np.exp(-x * 50), A0 + 3.39, 0.12, pan=0.2)
put(whoosh(0.6, 400, 4000, 0.55), A0 + 1.95, 0.07)  # Plan → Today
put(whoosh(0.6, 400, 4000, 0.55), A0 + 5.2, 0.08)   # Today → Review
put(scribble(0.45, 9), A0 + 6.8, 0.035, pan=0.15)
# Not only goals: each piece swishes in and clicks into place
AS = 22.5
put(whoosh(0.5, 300, 3000, 0.7), AS - 0.05, 0.06)
DOCKS = [(AS + o, pan, m) for o, pan, m in [(1.7, -0.7, 79), (1.95, -0.7, 81), (2.35, 0.7, 84), (2.75, -0.2, 86), (3.0, 0.2, 88), (3.4, 0.6, 91)]]
for at, pan, m in DOCKS:
    put(whoosh(0.52, 500, 5000, 0.8), at - 0.54, 0.045, pan=pan)
    put(pop(m), at, 0.075, pan=pan * 0.4)
    x = tt(0.12); put(np.sin(2 * np.pi * 140 * x) * np.exp(-x * 40), at, 0.12)
put(whoosh(0.7, 300, 2600, 0.75), AS + 3.5, 0.06)  # reeled into the goal
for i, m in enumerate([84, 88, 91, 96]):
    put(bell(midi(m), 1.2), AS + 3.65 + i * 0.09, 0.022, pan=-0.5 + i * 0.33)
# sign-off
OUT = 27.1
put(whoosh(0.5, 250, 2500, 0.6), OUT - 0.05, 0.06)
put(whoosh(0.4, 300, 2500, 0.8), OUT + 0.05, 0.05)
for i, m in enumerate([84, 88, 91]):
    put(bell(midi(m)), OUT + 0.55 + i * 0.06, 0.07 - i * 0.012, pan=(i - 1) * 0.3)

# ——— mix ———
L *= duck; R *= duck  # (effects were added straight into L/R; ducking stays gentle under them)

def reverb(sig, seed):
    r = np.random.default_rng(seed)
    n = int(2.2 * SR); x = np.arange(n) / SR
    ir = r.standard_normal(n) * np.exp(-x / 0.55)
    ir[: int(0.012 * SR)] = 0
    ir /= np.sqrt((ir ** 2).sum())
    size = 1 << int(np.ceil(np.log2(len(sig) + n)))
    return np.fft.irfft(np.fft.rfft(sig, size) * np.fft.rfft(ir, size), size)[: len(sig)]

wetL, wetR = reverb(L, 1), reverb(R, 2)
outL = L + 0.32 * wetL; outR = R + 0.32 * wetR
# fade in/out
fade = np.ones(N)
fi = int(0.05 * SR); fade[:fi] = np.linspace(0, 1, fi)
fo = int(1.2 * SR); fade[-fo:] = np.linspace(1, 0, fo) ** 1.5
outL *= fade; outR *= fade
peak = max(np.abs(outL).max(), np.abs(outR).max())
outL = np.tanh(outL / peak * 1.1) / np.tanh(1.1) * 0.89
outR = np.tanh(outR / peak * 1.1) / np.tanh(1.1) * 0.89
pcm = (np.stack([outL, outR], 1) * 32767).astype(np.int16)
with wave.open(sys.argv[1], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('ok', pcm.shape[0] / SR)

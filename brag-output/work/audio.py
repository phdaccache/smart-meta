"""Soundtrack for the Smart Meta brag: D major, one beat = 0.55 s (the SMART step rhythm)."""
import numpy as np
import wave

SR = 44100
DUR = 22.0
N = int(SR * DUR)
rng = np.random.default_rng(7)
BEAT = 0.55
B0 = 8.15 - 14 * BEAT  # beat grid lands on every SMART step (0.45 s, 1.0 s, …)
beats = [B0 + i * BEAT for i in range(60) if B0 + i * BEAT < DUR]

music = np.zeros((N, 2))
sfx = np.zeros((N, 2))
send = np.zeros((N, 2))  # reverb send


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def add(buf, t, sig, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= N:
        return
    sig = sig[: N - i]
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[i:i + len(sig), 0] += sig * gain * l * 1.414
    buf[i:i + len(sig), 1] += sig * gain * r * 1.414


def lowpass(x, cut):
    a = np.exp(-2 * np.pi * cut / SR)
    y = np.zeros_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


def pluck(midi, dur=1.2, bright=0.5):
    f = hz(midi)
    t = np.arange(int(dur * SR)) / SR
    env = np.exp(-t * (3.2 + midi / 30)) * (1 - np.exp(-t * 900))
    s = np.sin(2 * np.pi * f * t) + bright * 0.35 * np.sin(4 * np.pi * f * t) * np.exp(-t * 6) \
        + bright * 0.12 * np.sin(6 * np.pi * f * t) * np.exp(-t * 10)
    return s * env


def pad(midis, dur, attack=0.8, release=1.2):
    t = np.arange(int(dur * SR)) / SR
    s = np.zeros_like(t)
    for m in midis:
        f = hz(m)
        for det in (-0.12, 0.0, 0.11):
            ff = f * 2 ** (det / 12)
            ph = rng.uniform(0, 2 * np.pi)
            s += np.sin(2 * np.pi * ff * t + ph) + 0.18 * np.sin(4 * np.pi * ff * t + ph) + 0.05 * np.sin(6 * np.pi * ff * t)
    env = np.minimum(1, t / attack) * np.minimum(1, (dur - t) / release).clip(0, 1)
    return s * env / (len(midis) * 3)


def kick():
    t = np.arange(int(0.35 * SR)) / SR
    f = 45 + 75 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 9) * (1 - np.exp(-t * 2000))


def hat():
    t = np.arange(int(0.08 * SR)) / SR
    n = rng.standard_normal(len(t))
    n = n - lowpass(n, 6000)
    return n * np.exp(-t * 60)


def bass(midi, dur):
    t = np.arange(int(dur * SR)) / SR
    f = hz(midi)
    s = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)
    return s * np.minimum(1, t / 0.01) * np.exp(-t * 2.2) * np.minimum(1, (dur - t) / 0.05).clip(0, 1)


def whoosh(dur=0.7, lo=300, hi=3000, rise=True):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = rng.standard_normal(n)
    cut = (lo + (hi - lo) * (t / dur) ** 1.5) if rise else (hi - (hi - lo) * (t / dur) ** 0.7)
    y = np.zeros(n)
    acc = 0.0
    for i in range(n):
        a = np.exp(-2 * np.pi * cut[i] / SR)
        acc = (1 - a) * x[i] + a * acc
        y[i] = acc
    env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2
    return y * env * 3


# Chords, one bar (4 beats) each: D, Bm, G, A  (midi roots)
PROG = [(50, [62, 66, 69, 73]), (47, [62, 66, 69, 71]), (43, [62, 67, 71, 74]), (45, [61, 64, 69, 73])]
BAR = 4 * BEAT

# ——— intro (0–3): a soft Dmaj9 pad swelling under the loose goals ———
intro_pad = pad([50, 57, 62, 66, 69, 76], 3.4, attack=1.2, release=0.6)
add(music, 0.0, intro_pad, 0.22)
add(send, 0.0, intro_pad, 0.12)

# Pill pops (0.05 + i·0.09): little plucks up the D pentatonic.
for i, m in enumerate([74, 76, 78, 81, 83]):
    p = pluck(m, 0.9, 0.3)
    add(sfx, 0.12 + i * 0.09, p, 0.09, pan=[-0.5, 0.4, 0, 0.5, -0.4][i])
    add(send, 0.12 + i * 0.09, p, 0.06)

# Headline: a low warm bass note as the words land.
add(music, 0.45, bass(38, 2.5) * 0.9, 0.35)

# A quiet pulse under the headline so the hook isn't empty.
for b in beats:
    if 0.9 < b < 3.1:
        p = pluck(62 if int(round(b / BEAT)) % 2 else 69, 0.5, 0.2)
        add(music, b, p, 0.05, pan=0.2)
        add(send, b, p, 0.04)
        add(music, b, kick(), 0.12)

# ——— the snap (3.05) and the ticks ———
w = whoosh(1.0, 250, 2600)
add(sfx, 2.6, w, 0.045)
add(send, 2.6, w, 0.03)
for i, m in enumerate([74, 78, 81, 86, 90]):
    p = pluck(m, 1.0, 0.6)
    add(sfx, 4.45 + i * 0.16, p, 0.12, pan=-0.2 + i * 0.1)
    add(send, 4.45 + i * 0.16, p, 0.08)

# ——— groove: from the beat after the snap until the outro ———
GROOVE_START = beats[[i for i, b in enumerate(beats) if b >= 3.15][0]]   # 3.2 s
FULL = beats[[i for i, b in enumerate(beats) if b >= 6.1][0]]            # drums in fully
OUTRO = 18.45
for bi, b in enumerate(beats):
    if b < GROOVE_START or b >= OUTRO:
        continue
    bar = int((b - GROOVE_START) / BAR + 1e-6)
    pos = int(round((b - GROOVE_START) / BEAT)) % 4
    root, chord = PROG[bar % 4]
    full = b >= FULL - 1e-6
    # kick on 1 and 3 (every beat once full), hats off-beat
    if full or pos in (0, 2):
        add(music, b, kick(), 0.42 if full else 0.28)
    if full:
        add(music, b + BEAT / 2, hat(), 0.05, pan=0.3)
    # bass on each beat, root then fifth
    add(music, b, bass(root if pos != 3 else root + 7, BEAT * 0.95), 0.26)
    # arpeggio, eighth notes
    for k in range(2):
        m = chord[(pos * 2 + k) % 4] + (12 if (pos * 2 + k) % 8 >= 6 else 0)
        p = pluck(m, 0.7, 0.4)
        g = 0.07 if full else 0.05
        add(music, b + k * BEAT / 2, p, g, pan=(-0.35 if k == 0 else 0.35))
        add(send, b + k * BEAT / 2, p, g * 0.7)
    if pos == 0:
        pd = pad([root + 12] + chord, BAR + 0.3, attack=0.25, release=0.4)
        add(music, b, pd, 0.14)
        add(send, b, pd, 0.08)

# Phone lands (6.15): a soft rising whoosh into it.
add(sfx, 5.3, whoosh(0.9, 200, 1800), 0.035)

# Screen pushes: a quiet tick each, on the beat for the SMART steps.
for t0 in [8.15, 8.7, 9.25, 9.8, 10.35, 11.0]:
    p = pluck(93, 0.25, 0.1) * np.exp(-np.arange(int(0.25 * SR)) / SR * 25)
    add(sfx, t0, p, 0.06)
for t0 in [12.65, 16.35]:
    w = whoosh(0.5, 400, 2400)
    add(sfx, t0 - 0.2, w, 0.03)
    add(send, t0 - 0.2, w, 0.02)

# Typing (11.5–12.45): very soft clicks, background texture.
for k in range(22):
    t0 = 11.5 + k * 0.043 + rng.uniform(-0.008, 0.008)
    c = hat()[: int(0.02 * SR)] * 0.8
    add(sfx, t0, c, 0.035, pan=rng.uniform(-0.2, 0.2))

# Taps: Forgot (15.75), Add prep (17.75).
for t0, m in [(15.75, 81), (17.75, 86)]:
    p = pluck(m, 0.6, 0.5)
    add(sfx, t0, p, 0.11)
    add(send, t0, p, 0.07)

# ——— outro: drums out, D major rings with the icon ———
end_pad = pad([38, 50, 57, 62, 66, 69, 74, 78], DUR - OUTRO, attack=0.4, release=2.2)
add(music, OUTRO, end_pad, 0.3)
add(send, OUTRO, end_pad, 0.16)
add(music, OUTRO, bass(38, 2.2), 0.3)
for i, m in enumerate([74, 78, 81, 86]):
    p = pluck(m, 2.2, 0.5)
    add(sfx, 18.55 + i * 0.15, p, 0.1, pan=-0.3 + i * 0.2)
    add(send, 18.55 + i * 0.15, p, 0.09)

# ——— reverb: a soft 2 s room on the send ———
ir_len = int(2.0 * SR)
t = np.arange(ir_len) / SR
ir = np.stack([rng.standard_normal(ir_len), rng.standard_normal(ir_len)], 1) * np.exp(-t * 3.2)[:, None]
ir[:, 0] = lowpass(ir[:, 0], 5000)
ir[:, 1] = lowpass(ir[:, 1], 5000)
ir /= np.sqrt((ir ** 2).sum(0))
L = N + ir_len
nfft = 1 << (L - 1).bit_length()
wet = np.stack([np.fft.irfft(np.fft.rfft(send[:, c], nfft) * np.fft.rfft(ir[:, c], nfft), nfft)[:N] for c in range(2)], 1)

mix = music + sfx * 0.9 + wet * 0.55
# gentle glue: soft-knee saturation, fade in/out, normalise
mix = np.tanh(mix * 1.6) / 1.6
fade_in = np.minimum(1, np.arange(N) / (0.02 * SR))
fade_out = np.clip((DUR - np.arange(N) / SR) / 1.6, 0, 1) ** 1.5
mix *= (fade_in * fade_out)[:, None]
mix /= np.abs(mix).max() / 0.89

pcm = (mix * 32767).astype(np.int16)
with wave.open('audio.wav', 'wb') as wf:
    wf.setnchannels(2)
    wf.setsampwidth(2)
    wf.setframerate(SR)
    wf.writeframes(pcm.tobytes())
print('wrote audio.wav', DUR, 's', 'groove from', round(GROOVE_START, 2), 'full from', round(FULL, 2))

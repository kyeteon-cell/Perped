"""Synth SFX + music bed for the v2 timeline, mix with KOL voice and yacht audio, mux."""
import json, os, subprocess, wave
import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.environ.get("SRC", os.path.join(ROOT, "src"))
SR = 48000
tl = json.load(open(os.path.join(ROOT, "timeline.json")))
T = tl["total"]
N = int(T * SR) + SR
seg = {s["id"]: s for s in tl["segments"]}
st = lambda k: seg[k]["start"]
rng = np.random.default_rng(7)
mus = np.zeros(N); sfx = np.zeros(N); vox = np.zeros(N)


def t_(d): return np.arange(int(d * SR)) / SR


def put(buf, at, x, g=1.0):
    i = int(at * SR)
    if i >= N: return
    x = x[: N - i]
    buf[i:i + len(x)] += x * g


def lowpass(x, a):
    y = np.zeros_like(x); acc = 0.0
    a = np.broadcast_to(a, x.shape)
    for i in range(len(x)):
        acc += a[i] * (x[i] - acc); y[i] = acc
    return y


def env(n, att=0.005, dec=0.3):
    t = np.arange(n) / SR
    return np.minimum(1, t / att) * np.exp(-t / dec)


# ---------- sfx ----------
def whoosh(d):
    n = int(d * SR); t = np.arange(n) / n
    a = 0.02 + 0.35 * np.sin(np.pi * t) ** 2
    return lowpass(rng.standard_normal(n), a) * np.sin(np.pi * t) ** 1.5 * 1.6


def liq():
    t = t_(1.1)
    f = 420 * np.exp(-t * 3.2) + 45
    saw = 2 * ((np.cumsum(f) / SR) % 1) - 1
    boom = np.sin(2 * np.pi * np.cumsum(70 * np.exp(-t * 6) + 35) / SR) * np.exp(-t * 3)
    nz = lowpass(rng.standard_normal(len(t)), 0.25) * np.exp(-t * 9)
    return np.tanh(2.5 * saw * np.exp(-t * 2.2)) * 0.45 + boom * 0.9 + nz * 0.6


def drip():
    t = t_(0.3); f = 900 * np.exp(-t * 9) + 180
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(t), 0.002, 0.09)


def chime():
    t = t_(1.2); e = env(len(t), 0.003, 0.35)
    return (np.sin(2 * np.pi * 1318.5 * t) + 0.7 * np.sin(2 * np.pi * 1975.5 * t) + 0.35 * np.sin(2 * np.pi * 2637 * t)) * e * 0.5


def buzz():
    t = t_(1.3)
    gate = ((t % 0.45) < 0.3).astype(float)
    sq = np.tanh(4 * np.sin(2 * np.pi * 165 * t)) * (0.6 + 0.4 * np.sin(2 * np.pi * 28 * t))
    return sq * gate * 0.35


def click():
    t = t_(0.04); return rng.standard_normal(len(t)) * np.exp(-t * 300) * 0.7


def thud():
    t = t_(0.5); return np.sin(2 * np.pi * np.cumsum(110 * np.exp(-t * 18) + 48) / SR) * np.exp(-t * 7)


def rev():
    t = t_(1.6); f = 55 + 140 * (1 - np.exp(-t * 2.5)) - 40 * np.clip(t - 1.1, 0, 1)
    ph = np.cumsum(f) / SR
    x = np.tanh(3 * (2 * (ph % 1) - 1) + 0.6 * np.sin(2 * np.pi * ph * 0.5))
    return lowpass(x, 0.18) * np.minimum(1, t / 0.08) * np.exp(-np.clip(t - 1.2, 0, 9) * 6) * 0.8


def boom():
    t = t_(2.5)
    b = np.sin(2 * np.pi * np.cumsum(60 * np.exp(-t * 4) + 30) / SR) * np.exp(-t * 1.6)
    tail = lowpass(rng.standard_normal(len(t)), 0.05) * np.exp(-t * 1.4) * 0.5
    return b + tail


# transitions
for s in tl["segments"]:
    if s["trans"]:
        tt, td = s["trans"]
        at = s["start"] + s["dur"] - td
        put(sfx, at - 0.1, whoosh(td + 0.25), 0.28 if tt != "fadeblack" else 0.16)
# meter + liquidations
for s in tl["segments"]:
    if s["meter"]:
        for t, dv in s["meter"][1]:
            if dv < 0: put(sfx, s["start"] + t, drip(), 0.5)
            else: put(sfx, s["start"] + t + 0.4, chime(), 0.55)
    for t in s["liq"]:
        put(sfx, s["start"] + t, liq(), 0.55)
# story beats
put(sfx, st("09_bando") + 3.7, buzz(), 0.8)
put(sfx, st("10_feed") - 0.1, buzz()[: int(0.6 * SR)], 0.6)
for k, taps in [("12_btc", [0.4, 1.6]), ("13_tsla", [0.3, 1.5])]:
    for t in taps: put(sfx, st(k) + t, click(), 0.6)
put(sfx, st("12_btc") + 2.7, thud(), 0.7)
put(sfx, st("13_tsla") + 3.0, thud(), 0.7)
put(sfx, st("15_lambo") + 0.2, rev(), 0.55)
put(sfx, st("17_end") + 0.05, boom(), 0.7)

# ---------- music ----------
# part 1: tense drone + heartbeat until the phone buzz
p1_end = st("09_bando") + 3.7
t = t_(p1_end)
drone = (np.sin(2 * np.pi * 55 * t) + 0.6 * np.sin(2 * np.pi * 55.4 * t) + 0.35 * np.sin(2 * np.pi * 82.4 * t + np.sin(2 * np.pi * 0.2 * t)))
drone *= (0.6 + 0.4 * np.sin(2 * np.pi * 0.13 * t)) * np.minimum(1, t / 1.5)
drone *= np.clip((p1_end - t) / 0.8, 0, 1)
put(mus, 0, drone, 0.16)
hb = thud()[: int(0.25 * SR)]
x = st("02_ansem")
while x < st("08_yacht"):
    put(mus, x, hb, 0.35); put(mus, x + 0.22, hb, 0.22); x += 0.85
# part 2: 120 bpm beat from the feed to the end card
bpm, b0, b_end = 120, st("10_feed"), st("17_end") + 0.05
beat = 60 / bpm
kick = thud()[: int(0.35 * SR)]
snr_t = t_(0.2); snare = (lowpass(rng.standard_normal(len(snr_t)), 0.6) * np.exp(-snr_t * 22) + np.sin(2 * np.pi * 190 * snr_t) * np.exp(-snr_t * 30) * 0.5)
hat_t = t_(0.05); hat = (rng.standard_normal(len(hat_t)) - lowpass(rng.standard_normal(len(hat_t)), 0.5)) * np.exp(-hat_t * 90)
roots = [55.0, 43.65, 65.41, 49.0]
drop = st("11_revenge")
i = 0
x = b0
while x < b_end - 0.01:
    full = x >= drop - 1e-6
    bar, pos = divmod(i, 4)
    put(mus, x, kick, 0.9 if full else 0.55)
    if full and pos in (1, 3): put(mus, x, snare, 0.45)
    put(mus, x + beat / 2, hat, 0.22)
    if full:
        put(mus, x, hat, 0.12)
        f = roots[bar % 4]
        bt = t_(beat * 0.9)
        bass = np.tanh(2 * np.sin(2 * np.pi * f * bt)) * np.minimum(1, bt / 0.01) * np.exp(-bt * 2.5)
        put(mus, x, bass, 0.32)
        # arp
        for k, m in enumerate([2, 3, 4, 3]):
            at = t_(beat / 4 * 0.9)
            put(mus, x + k * beat / 4, np.sin(2 * np.pi * f * m * 2 * at) * np.exp(-at * 14), 0.06)
    x += beat; i += 1


# ---------- clip audio ----------
def load(path, ss=0.0, dur=None, af=None):
    tmp = "/tmp/_a.wav"
    cmd = ["ffmpeg", "-v", "error", "-y", "-ss", str(ss), "-i", path] + (["-t", str(dur)] if dur else []) + (["-af", af] if af else []) + ["-ac", "1", "-ar", str(SR), tmp]
    if subprocess.run(cmd).returncode: return np.zeros(1)
    w = wave.open(tmp); a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16) / 32768.0
    return a


kol = load(os.path.join(SRC, "c4.mp4"), 0, seg["01_kol"]["dur"])
put(vox, st("01_kol"), kol, 1.0)
yacht = load(os.path.join(SRC, "c7.mp4"), 0, seg["08_yacht"]["dur"])
fade = np.minimum(1, np.minimum(np.arange(len(yacht)), len(yacht) - np.arange(len(yacht))) / (0.3 * SR))
put(vox, st("08_yacht"), yacht * fade, 0.55)

# duck music under the KOL voice
duck = np.ones(N)
a, b = int(st("01_kol") * SR), int((st("01_kol") + seg["01_kol"]["dur"]) * SR)
duck[a:b] = 0.35

# optional narrator: VO=1 places src/vo0..6.wav on their scenes, never overlapping, and ducks music + sfx under them
VO_PLAN = [("f0", "02_ansem", 0.35), ("f1", "03_liq1", 0.75), ("f2", "04_topup", 0.15), ("f3", "05_cate", 0.25), ("f4", "06_liq2", 0.75),
           ("f5", "07_again", 0.45), ("f6", "08_yacht", 0.3), ("f7", "09_bando", 0.4),
           ("vo0", "10_feed", 0.5), ("vo1", "11_revenge", 0.45), ("vo2", "12_btc", 0.35), ("vo3", "13_tsla", 0.45), ("vo4", "14_banked", 0.3), ("vo5", "16_pent", 0.9), ("vo6", "17_end", 0.55)]
VO_PLAN = [p for p in VO_PLAN if os.path.exists(os.path.join(SRC, p[0] + ".wav"))]
vo_on = os.environ.get("VO") == "1"
sduck = np.ones(N)
if vo_on:
    prev_end = 0.0
    narr = np.zeros(N)
    for i, (fn, k, off) in enumerate(VO_PLAN):
        x = load(os.path.join(SRC, f"{fn}.wav"), af=f"atempo={os.environ.get('VO_TEMPO', '1.22')}")
        # trim leading/trailing silence so timing is tight
        nz = np.where(np.abs(x) > 0.02)[0]
        if len(nz): x = x[max(0, nz[0] - 1200): nz[-1] + 2400]
        at = max(st(k) + off, prev_end + 0.12)
        put(narr, at, x / (np.max(np.abs(x)) + 1e-9) * 0.9, 1.0)
        prev_end = at + len(x) / SR
        print(f"{fn} {k} at {at:.2f}s len {len(x)/SR:.2f}s")
    # smooth duck envelope from the narration level
    env_ = np.convolve(np.abs(narr), np.ones(int(0.25 * SR)) / int(0.25 * SR), mode="same")
    m = np.clip(env_ / 0.05, 0, 1)
    duck = duck * (1 - 0.6 * m); sduck = 1 - 0.45 * m
    vox = vox + narr * 1.15
mix = mus * duck + sfx * sduck + vox
mix[int(T * SR):] = 0
mix = mix[: int(T * SR)]
# end fade
fl = int(0.6 * SR); mix[-fl:] *= np.linspace(1, 0, fl)
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
st_ = np.stack([mix, mix], 1)
pcm = (np.clip(st_, -1, 1) * 32767).astype(np.int16)
w = wave.open(os.path.join(ROOT, "mix.wav"), "wb"); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes()); w.close()
out = os.path.join(ROOT, os.environ.get("OUT", "perped_ad_v2.mp4"))
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", os.path.join(ROOT, "video.mp4"), "-i", os.path.join(ROOT, "mix.wav"),
                "-af", "loudnorm=I=-14:TP=-1.0:LRA=11", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", "-movflags", "+faststart", out], check=True)
print("->", out, round(T, 2))

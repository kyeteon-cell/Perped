"""Perped ad v2: per-segment renders with overlays, xfade transitions, then audio."""
import json, os, subprocess, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.environ.get("SRC", os.path.join(ROOT, "src"))
REC = os.environ.get("REC", os.path.join(ROOT, "rec"))
OV = os.path.join(ROOT, "ov")
SEG = os.path.join(ROOT, "seg"); os.makedirs(SEG, exist_ok=True)
L = json.load(open(os.path.join(OV, "layout.json")))
SX, SY, SW, SH = L["screen"]
SLOTS, MY = L["slots"], L["meter_y"]
DW, DH = L["dollar_size"]
FPS = 30
ONLY = set(sys.argv[1:])  # optional: render only these segment ids


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        print(" ".join(cmd)[:3000]); print(r.stderr[-3000:]); sys.exit(1)


# ----------------------------------------------------------------- timeline
# base kinds: clip(src, ss, speed, hflip) | still(src, z0, z1) | phone(src, ss, speed, kol) | end
# meter: (start_count, [(t, +1|-1)]); caps: [(png, t0, t1)]; liq: [t]; trans: (type, dur) into NEXT segment
REKT = "eq=saturation=0.82:contrast=1.05"
GLOW = "eq=saturation=1.12:contrast=1.04"
S = [
    dict(id="01_kol", dur=4.0, base=("phone", "c4.mp4", [(0, 4.1)], True), meter=(5, []), caps=[], trans=("zoomin", 0.5)),
    dict(id="02_ansem", dur=3.4, base=("clip", "c3.mp4", 0, 1.0, False), grade=REKT, meter=(5, []), caps=[("cap_ansem", 0.45, 3.4)], trans=("hblur", 0.3)),
    dict(id="03_liq1", dur=2.8, base=("clip", "c5.mp4", 0.6, 1.0, False), grade=REKT, meter=(5, [(0.35, -1)]), liq=[0.3], caps=[], trans=("fadeblack", 0.4)),
    dict(id="04_topup", dur=2.2, base=("still", "k6.png", 1.0, 1.1), grade=REKT, meter=(4, []), caps=[("cap_topup", 0.3, 2.2)], trans=("smoothleft", 0.35)),
    dict(id="05_cate", dur=3.0, base=("clip", "c3.mp4", 0.8, 1.0, True), grade=REKT, meter=(4, []), caps=[("cap_cate", 0.3, 3.0)], trans=("hblur", 0.3)),
    dict(id="06_liq2", dur=2.8, base=("clip", "c5.mp4", 1.9, 1.0, True), grade=REKT, meter=(4, [(0.35, -1)]), liq=[0.3], caps=[], trans=("fadeblack", 0.4)),
    dict(id="07_again", dur=3.0, base=("still", "k5.png", 1.14, 1.0), grade=REKT, meter=(3, [(0.45, -1), (1.3, -1), (2.15, -1)]), liq=[0.4, 1.25, 2.1], liq_len=0.75, caps=[("cap_again", 0.2, 3.0)], trans=("slideup", 0.5)),
    dict(id="08_yacht", dur=3.6, base=("clip", "c7.mp4", 0, 1.0, False), meter=(0, []), caps=[("cap_cashed", 0.4, 3.6)], trans=("fadeblack", 0.7)),
    dict(id="09_bando", dur=5.0, base=("clip", "c8.mp4", 0, 1.0, False), grade="eq=saturation=0.7:brightness=-0.03", meter=(0, []), caps=[("cap_gaming", 0.5, 2.6), ("cap_empty", 2.8, 5.0)], trans=("zoomin", 0.5)),
    dict(id="10_feed", dur=5.5, base=("phone", "recFeed.mp4", [(1.0, 6.6)], False), meter=(0, []), caps=[("cap_perped1", 0.35, 5.5), ("cap_perped2", 1.0, 5.5)], trans=("smoothup", 0.4)),
    dict(id="11_revenge", dur=3.8, base=("clip", "c9.mp4", 0, 1.0, False), meter=(0, []), caps=[("cap_revenge", 0.4, 3.8)], trans=("circleopen", 0.5)),
    dict(id="12_btc", dur=5.4, base=("phone", "recA.mp4", [(2.3, 5.9), (6.5, 8.4)], False), meter=(0, [(2.7, +1)]), caps=[("cap_fadebtc", 0.3, 5.4), ("chip_crypto", 0.6, 5.4)], trans=("slideleft", 0.4)),
    dict(id="13_tsla", dur=5.2, base=("phone", "recB.mp4", [(3.0, 6.9), (7.5, 8.9)], False), meter=(1, [(3.0, +1)]), caps=[("cap_fadetsla", 0.3, 5.2), ("chip_stock", 0.6, 5.2)], trans=("fadewhite", 0.5)),
    dict(id="14_banked", dur=3.0, base=("still", "k10.png", 1.0, 1.08), grade=GLOW, meter=(2, [(0.6, +1)]), caps=[("cap_banked", 0.3, 3.0)], trans=("smoothleft", 0.4)),
    dict(id="15_lambo", dur=3.0, base=("still", "k11.png", 1.1, 1.0), grade=GLOW, meter=(3, [(0.6, +1)]), caps=[("cap_lambo", 0.3, 3.0)], trans=("circleopen", 0.5)),
    dict(id="16_pent", dur=5.2, base=("clip", "c12.mp4", 0, 1.0, False), grade=GLOW, meter=(4, [(0.8, +1)]), caps=[("cap_gpogp", 1.4, 5.2)], trans=("fadeblack", 0.6)),
    dict(id="17_end", dur=4.5, base=("end",), meter=None, caps=[], trans=None),
]
RISE, FALL = 0.45, 0.75


def segment(s):
    out = os.path.join(SEG, s["id"] + ".mp4")
    d = s["dur"]
    ins, fg = [], []
    kind = s["base"][0]
    shake = s.get("liq", [])
    sx = "+".join(f"if(between(t,{t:.2f},{t+0.45:.2f}),18*sin(t*97),0)" for t in shake) or "0"
    sy = "+".join(f"if(between(t,{t:.2f},{t+0.45:.2f}),14*cos(t*83),0)" for t in shake) or "0"
    shake_crop = f"crop=1080:1920:x='20+{sx}':y='35+{sy}'"
    grade = ("," + s["grade"]) if s.get("grade") else ""
    if kind == "clip":
        _, src, ss, sp, flip = s["base"]
        ins += ["-i", os.path.join(SRC, src)]
        fg.append(f"[0:v]trim=start={ss}:duration={d*sp+0.2:.3f},setpts=(PTS-STARTPTS)/{sp}{',hflip' if flip else ''},"
                  f"scale=1120:1991:force_original_aspect_ratio=increase,crop=1120:1991,fps={FPS},tpad=stop_mode=clone:stop_duration=6,"
                  f"trim=duration={d},setpts=PTS-STARTPTS,{shake_crop}{grade},setsar=1[b0]")
    elif kind == "still":
        _, src, z0, z1 = s["base"]
        n = int(d * FPS)
        ins += ["-loop", "1", "-framerate", str(FPS), "-t", str(d), "-i", os.path.join(SRC, src)]
        fg.append(f"[0:v]scale=2240:3982:force_original_aspect_ratio=increase,crop=2240:3982,"
                  f"zoompan=z='{z0}+({z1}-{z0})*on/{n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1120x1991:fps={FPS},"
                  f"trim=duration={d},setpts=PTS-STARTPTS,{shake_crop}{grade},setsar=1[b0]")
    elif kind == "phone":
        _, src, ranges, kol = s["base"]
        path = os.path.join(SRC if src.startswith("c") else REC, src)
        ins += ["-i", path]
        parts = [f"[0:v]trim=start={a}:end={b},setpts=PTS-STARTPTS,fps={FPS}[r{j}]" for j, (a, b) in enumerate(ranges)]
        fg.extend(parts)
        fg.append("".join(f"[r{j}]" for j in range(len(ranges))) + f"concat=n={len(ranges)}:v=1:a=0,tpad=stop_mode=clone:stop_duration=6,trim=duration={d},setpts=PTS-STARTPTS,split[p1][p2]")
        fg.append(f"[p1]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=28,eq=brightness=-0.32:saturation=0.8[pbg]")
        fg.append(f"[p2]scale={SW}:{SH}:force_original_aspect_ratio=increase,crop={SW}:{SH}[pscr]")
        fg.append("[pbg][pscr]overlay=%d:%d[pc]" % (SX, SY))
        ins += ["-loop", "1", "-i", os.path.join(OV, "phone.png")]
        layers = "[pc][1:v]overlay=0:0:shortest=1"
        if kol:
            ins += ["-loop", "1", "-i", os.path.join(OV, "kolui.png")]
            fg.append("[pc][2:v]overlay=0:0:shortest=1[pk]")
            fg.append(f"[pk][1:v]overlay=0:0:shortest=1,setsar=1[b0]")
        else:
            fg.append(f"{layers},setsar=1[b0]")
    elif kind == "end":
        n = int(d * FPS)
        ins += ["-loop", "1", "-framerate", str(FPS), "-t", str(d), "-i", os.path.join(SRC, "drops.png")]
        ins += ["-loop", "1", "-framerate", str(FPS), "-t", str(d), "-i", os.path.join(SRC, "logo_a.png")]
        ins += ["-loop", "1", "-framerate", str(FPS), "-t", str(d), "-i", os.path.join(OV, "endtext.png")]
        fg.append(f"[0:v]scale=2160:3840:force_original_aspect_ratio=increase,crop=2160:3840,"
                  f"zoompan=z='1.0+0.06*on/{n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps={FPS},eq=brightness=-0.18,trim=duration={d},setpts=PTS-STARTPTS[e0]")
        fg.append("[1:v]scale=780:-1,format=rgba,fade=in:st=0.15:d=0.5:alpha=1[lg]")
        fg.append("[2:v]format=rgba,fade=in:st=0.7:d=0.5:alpha=1[et]")
        fg.append("[e0][lg]overlay=(W-w)/2:700-h/2:shortest=1[e1]")
        fg.append("[e1][et]overlay=0:0:shortest=1,setsar=1[b0]")
    idx = len([a for a in ins if a == "-i"])
    cur = "b0"

    def add(png, opts="", extra=""):
        nonlocal idx, cur
        ins.extend(["-loop", "1", "-framerate", str(FPS), "-t", str(d), "-i", os.path.join(OV, png + ".png")])
        src = f"{idx}:v"
        if extra:
            fg.append(f"[{src}]{extra}[x{idx}]"); src = f"x{idx}"
        nxt = f"v{idx}"
        fg.append(f"[{cur}][{src}]overlay={opts or '0:0'}[{nxt}]")
        cur = nxt; idx += 1

    # meter state windows
    if s["meter"] is not None:
        n0, evs = s["meter"]
        n, t_prev, windows = n0, 0.0, []
        for t, dv in evs:
            switch = t if dv < 0 else t + RISE
            windows.append((n, t_prev, switch)); n += dv; t_prev = switch
        windows.append((n, t_prev, d + 1))
        for n_, a, b in windows:
            if b > a:
                add(f"meter{n_}", f"0:0:enable='between(t,{a:.3f},{b:.3f})'")
        n = n0
        for t, dv in evs:
            if dv < 0:
                i = n - 1
                x0, y0 = SLOTS[i] - DW / 2, MY - DH / 2
                add("dollar_red", f"x={x0:.0f}+(t-{t})*180:y='{y0:.0f}+(t-{t})*(t-{t})*2600':enable='between(t,{t},{t+FALL})'")
            else:
                i = n
                x0, y0 = SLOTS[i] - DW / 2, MY - DH / 2
                add("dollar", f"x={x0:.0f}:y='{y0:.0f}+max(0,{t+RISE}-t)*1500':enable='between(t,{t},{t+RISE})'")
            n += dv
    for t in s.get("liq", []):
        ln = s.get("liq_len", 1.1)
        add("redtint", f"0:0:enable='between(t,{t},{t+ln})'")
        add("liq", f"0:0:enable='between(t,{t},{t+ln})'")
    for png, a, b in s["caps"]:
        b = min(b, d)
        fo = f",fade=out:st={b-0.2:.2f}:d=0.2:alpha=1" if b < d - 0.05 else ""
        add(png, "0:0", f"format=rgba,fade=in:st={a}:d=0.18:alpha=1{fo}")
    cmd = ["ffmpeg", "-v", "error", "-y"] + ins + ["-filter_complex", ";".join(fg), "-map", f"[{cur}]", "-t", str(d), "-r", str(FPS),
           "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", "-an", out]
    run(cmd)
    return out


def main():
    # logo with alpha (key out a dark background if the PNG is opaque)
    from PIL import Image
    lg = Image.open(os.path.join(SRC, "logo.png")).convert("RGBA")
    if lg.getpixel((2, 2))[3] > 200:
        r, g, b, _ = lg.split()
        lum = Image.merge("RGB", (r, g, b)).convert("L").point(lambda v: 0 if v < 28 else min(255, (v - 28) * 3))
        lg.putalpha(lum)
    bb = lg.getbbox(); lg = lg.crop(bb) if bb else lg
    lg.save(os.path.join(SRC, "logo_a.png"))

    files = []
    for s in S:
        p = os.path.join(SEG, s["id"] + ".mp4")
        if not ONLY or s["id"] in ONLY or not os.path.exists(p):
            print("render", s["id"], flush=True); segment(s)
        files.append(p)
    # xfade chain
    ins, fg, off, starts = [], [], 0.0, [0.0]
    for f in files:
        ins += ["-i", f]
    cur = "0:v"
    for i in range(1, len(S)):
        tt, td = S[i - 1]["trans"]
        off += S[i - 1]["dur"] - td
        starts.append(off)
        nxt = f"x{i}"
        fg.append(f"[{cur}][{i}:v]xfade=transition={tt}:duration={td}:offset={off:.3f}[{nxt}]")
        cur = nxt
    total = off + S[-1]["dur"]
    run(["ffmpeg", "-v", "error", "-y"] + ins + ["-filter_complex", ";".join(fg), "-map", f"[{cur}]", "-r", str(FPS),
         "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", "-movflags", "+faststart", os.path.join(ROOT, "video.mp4")])
    tl = {"total": total, "segments": [{"id": s["id"], "start": st, "dur": s["dur"], "trans": s["trans"], "meter": s["meter"], "liq": s.get("liq", []), "base": s["base"]} for s, st in zip(S, starts)]}
    json.dump(tl, open(os.path.join(ROOT, "timeline.json"), "w"), indent=1)
    print("video.mp4", round(total, 2), "s")


main()

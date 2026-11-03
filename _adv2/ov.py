"""Render every transparent 1080x1920 overlay for the Perped ad v2."""
import json, os, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "ov")
os.makedirs(OUT, exist_ok=True)
W, H = 1080, 1920
F = lambda w, s: ImageFont.truetype(os.path.join(HERE, "fonts", f"BarlowCondensed-{w}.ttf"), s)

# Phone geometry (screen hole); build.py reads this from layout.json
SCR = (240, 300, 600, 1304)  # x, y, w, h
CAP_Y, CAP_Y_PHONE = 1450, 1690
METER_Y, METER_GAP, METER_SIZE = 150, 118, 150


def chrome(size):
    """Vertical brushed-chrome gradient."""
    w, h = size
    g = Image.new("RGB", (1, 256))
    stops = [(0, (255, 255, 255)), (0.38, (214, 219, 226)), (0.52, (88, 95, 108)), (0.62, (196, 202, 210)), (0.85, (245, 247, 250)), (1, (160, 167, 178))]
    for y in range(256):
        p = y / 255
        for (a, ca), (b, cb) in zip(stops, stops[1:]):
            if a <= p <= b:
                k = (p - a) / (b - a)
                g.putpixel((0, y), tuple(int(ca[i] + (cb[i] - ca[i]) * k) for i in range(3)))
                break
    return g.resize((max(1, w), max(1, h)))


def text_layer(runs, font, stroke=10, track=0):
    """runs: [(text, style)] style in white|chrome|red. Returns RGBA tight image."""
    widths = []
    for t, _ in runs:
        widths.append(font.getlength(t) + track * len(t))
    asc, desc = font.getmetrics()
    tw, th = int(sum(widths)) + stroke * 2 + 8, asc + desc + stroke * 2 + 8
    img = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    x = stroke + 4
    for (t, style), wdt in zip(runs, widths):
        mask = Image.new("L", (tw, th), 0)
        ImageDraw.Draw(mask).text((x, stroke + 4), t, font=font, fill=255)
        smask = Image.new("L", (tw, th), 0)
        ImageDraw.Draw(smask).text((x, stroke + 4), t, font=font, fill=255, stroke_width=stroke, stroke_fill=255)
        # stroke (dark)
        dark = Image.new("RGBA", (tw, th), (8, 8, 10, 255))
        img = Image.composite(dark, img, smask)
        if style == "chrome":
            fill = chrome((tw, asc + desc)).convert("RGBA")
            full = Image.new("RGBA", (tw, th)); full.paste(fill, (0, stroke + 4))
        elif style == "red":
            full = Image.new("RGBA", (tw, th), (255, 46, 64, 255))
        elif style == "grey":
            full = Image.new("RGBA", (tw, th), (170, 175, 184, 255))
        else:
            full = Image.new("RGBA", (tw, th), (255, 255, 255, 255))
        img = Image.composite(full, img, mask)
        x += wdt
    return img


def with_shadow(layer, blur=14, alpha=170, off=(0, 8)):
    pad = blur * 3
    w, h = layer.size
    out = Image.new("RGBA", (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
    sh = Image.new("RGBA", out.size, (0, 0, 0, 0))
    a = layer.split()[3].point(lambda v: v * alpha // 255)
    blk = Image.new("RGBA", layer.size, (0, 0, 0, 255)); blk.putalpha(a)
    sh.paste(blk, (pad + off[0], pad + off[1]))
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    out = Image.alpha_composite(out, sh)
    out.alpha_composite(layer, (pad, pad))
    return out


def place(layer, cy, cx=W // 2):
    can = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    w, h = layer.size
    can.alpha_composite(layer, (int(cx - w / 2), int(cy - h / 2)))
    return can


def save(img, name):
    img.save(os.path.join(OUT, name + ".png"), optimize=True)


def parse(s):
    """'APES *$ANSEM* 50x' -> runs, *x* = chrome."""
    runs, chrome_on = [], False
    for i, part in enumerate(s.split("*")):
        if part:
            runs.append((part, "chrome" if chrome_on else "white"))
        chrome_on = not chrome_on
    return runs


def caption(name, s, size=118, y=CAP_Y, maxw=960):
    lay = text_layer(parse(s), F("ExtraBold", size), stroke=9)
    if lay.width > maxw:
        size = int(size * maxw / lay.width)
        lay = text_layer(parse(s), F("ExtraBold", size), stroke=9)
    save(place(with_shadow(lay), y), name)


# ---------- captions ----------
CAPS = {
    "cap_ansem": "APES *$ANSEM*",
    "cap_cate": "APES *$CATE*",
    "cap_topup": "TOPS UP.",
    "cap_again": "AGAIN. AND AGAIN.",
    "cap_cashed": "*@100x_chad* CASHED OUT.",
    "cap_gaming": "BACK TO GAMING.",
    "cap_empty": "STILL EMPTY.",
    "cap_revenge": "TIME FOR *REVENGE.*",
    "cap_banked": "BANKED.",
    "cap_lambo": "WEN LAMBO? *NOW.*",
    "cap_gpogp": "GET PERPED OR *GET PAID.*",
}
for k, v in CAPS.items():
    caption(k, v)
caption("cap_fadebtc", "FADE *BTC.*", 120, CAP_Y_PHONE)
caption("cap_fadetsla", "FADE *TSLA.*", 120, CAP_Y_PHONE)
caption("cap_perped1", "*PERPED.*", 130, CAP_Y_PHONE)
save(place(with_shadow(text_layer([("CRYPTO + STOCKS. TRADE IN PUBLIC.", "white")], F("ExtraBold", 66), stroke=7)), CAP_Y_PHONE + 105), "cap_perped2")


def chip(name, label, y):
    f = F("ExtraBold", 46)
    tw = int(f.getlength(label)) + 56
    th = 70
    c = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    d = ImageDraw.Draw(c)
    d.rounded_rectangle((0, 0, tw - 1, th - 1), radius=35, fill=(14, 15, 18, 235), outline=(190, 196, 205, 255), width=3)
    d.text((28, 8), label, font=f, fill=(232, 235, 240, 255))
    save(place(with_shadow(c, 10, 140, (0, 4)), y), name)


chip("chip_crypto", "CRYPTO PERP", CAP_Y_PHONE + 100)
chip("chip_stock", "STOCK PERP", CAP_Y_PHONE + 100)

# ---------- LIQUIDATED stamp + red tint ----------
liq = with_shadow(text_layer([("LIQUIDATED", "red")], F("Black", 210), stroke=12), 18, 200)
liq = liq.rotate(7, resample=Image.BICUBIC, expand=True)
save(place(liq, 900), "liq")
tint = Image.new("RGBA", (W, H), (255, 20, 40, 0))
vg = Image.new("L", (W, H), 0)
ImageDraw.Draw(vg).ellipse((-300, -200, W + 300, H + 200), fill=255)
vg = vg.filter(ImageFilter.GaussianBlur(160))
tint.putalpha(ImageChops.invert(vg).point(lambda v: 40 + v * 150 // 255))
save(tint, "redtint")

# ---------- $ meter ----------
mf = F("Black", METER_SIZE)
full = with_shadow(text_layer([("$", "chrome")], mf, stroke=8), 10, 190, (0, 5))
empty_l = text_layer([("$", "grey")], mf, stroke=8)
empty_l.putalpha(empty_l.split()[3].point(lambda v: v * 70 // 255))
empty = with_shadow(empty_l, 10, 60, (0, 5))
red_l = with_shadow(text_layer([("$", "red")], mf, stroke=8), 10, 190, (0, 5))
slots = [W // 2 + (i - 2) * METER_GAP for i in range(5)]
for n in range(6):
    can = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for i, cx in enumerate(slots):
        g = full if i < n else empty
        can.alpha_composite(g, (int(cx - g.width / 2), int(METER_Y - g.height / 2)))
    save(can, f"meter{n}")
full.save(os.path.join(OUT, "dollar.png")); red_l.save(os.path.join(OUT, "dollar_red.png"))

# ---------- phone frame ----------
x, y, w, h = SCR
bz = 22
ph = Image.new("RGBA", (W, H), (0, 0, 0, 0))
shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ImageDraw.Draw(shadow).rounded_rectangle((x - bz, y - bz + 18, x + w + bz, y + h + bz + 18), radius=86, fill=(0, 0, 0, 200))
ph = Image.alpha_composite(ph, shadow.filter(ImageFilter.GaussianBlur(30)))
d = ImageDraw.Draw(ph)
d.rounded_rectangle((x - bz - 3, y - bz - 3, x + w + bz + 3, y + h + bz + 3), radius=90, fill=(150, 156, 166, 255))  # chrome rim
d.rounded_rectangle((x - bz, y - bz, x + w + bz, y + h + bz), radius=86, fill=(10, 10, 12, 255))
# side buttons
d.rounded_rectangle((x + w + bz + 2, y + 240, x + w + bz + 8, y + 380), radius=3, fill=(120, 126, 136, 255))
d.rounded_rectangle((x - bz - 8, y + 200, x - bz - 2, y + 290), radius=3, fill=(120, 126, 136, 255))
d.rounded_rectangle((x - bz - 8, y + 310, x - bz - 2, y + 400), radius=3, fill=(120, 126, 136, 255))
hole = Image.new("L", (W, H), 0)
ImageDraw.Draw(hole).rounded_rectangle((x, y, x + w, y + h), radius=64, fill=255)
ph.putalpha(ImageChops.subtract(ph.split()[3], hole))
# dynamic island
ImageDraw.Draw(ph).rounded_rectangle((W // 2 - 70, y + 18, W // 2 + 70, y + 58), radius=20, fill=(0, 0, 0, 255))
save(ph, "phone")

# ---------- KOL live UI (sits on the phone screen) ----------
ui = Image.new("RGBA", (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(ui)
f1, f2, f3 = F("ExtraBold", 34), F("SemiBold", 34), F("ExtraBold", 40)
lx, ly = x + 26, y + 84
d.rounded_rectangle((lx, ly, lx + 96, ly + 46), radius=10, fill=(255, 38, 70, 255))
d.text((lx + 18, ly + 4), "LIVE", font=f1, fill="white")
d.rounded_rectangle((lx + 108, ly, lx + 250, ly + 46), radius=10, fill=(0, 0, 0, 150))
d.ellipse((lx + 122, ly + 17, lx + 134, ly + 29), fill=(255, 255, 255, 230))
d.text((lx + 144, ly + 4), "12.4K", font=f1, fill="white")
# bottom gradient for legibility
gr = Image.new("RGBA", (w, 420), (0, 0, 0, 0))
for i in range(420):
    ImageDraw.Draw(gr).line((0, i, w, i), fill=(0, 0, 0, int(190 * i / 420)))
ui.alpha_composite(gr, (x, y + h - 420))
d = ImageDraw.Draw(ui)
cy = y + h - 330
for who, msg in [("degen_dan", "ser is this the one"), ("rent_money", "aping my rent"), ("wagmi_99", "LFG LFG LFG")]:
    d.text((x + 30, cy), who, font=f1, fill=(200, 205, 215, 255))
    d.text((x + 30 + f1.getlength(who) + 14, cy), msg, font=f2, fill="white")
    cy += 52
d.ellipse((x + 28, y + h - 150, x + 100, y + h - 78), fill=(214, 168, 64, 255))
d.text((x + 116, y + h - 140), "@100x_chad", font=f3, fill="white")
d.text((x + 116, y + h - 96), "1.2M followers", font=f2, fill=(200, 205, 215, 255))
save(ui, "kolui")

# ---------- end card text ----------
end = Image.new("RGBA", (W, H), (0, 0, 0, 0))
for layer, cy in [
    (with_shadow(text_layer(parse("GET PERPED OR *GET PAID.*"), F("Black", 94), stroke=8)), 1130),
    (with_shadow(text_layer([("CRYPTO + STOCKS  ·  24/7", "white")], F("ExtraBold", 64), stroke=6)), 1250),
    (with_shadow(text_layer([("perped.pro", "chrome")], F("Black", 120), stroke=8)), 1430),
    (with_shadow(text_layer([("Perps are high risk. You can lose your whole stake. Not financial advice.", "grey")], F("SemiBold", 32), stroke=4), 6, 120, (0, 2)), 1790),
]:
    end.alpha_composite(layer, (int(W / 2 - layer.width / 2), int(cy - layer.height / 2)))
save(end, "endtext")

json.dump({"screen": SCR, "slots": slots, "meter_y": METER_Y, "dollar_size": list(full.size)}, open(os.path.join(OUT, "layout.json"), "w"))
print("overlays ->", OUT, len(os.listdir(OUT)))

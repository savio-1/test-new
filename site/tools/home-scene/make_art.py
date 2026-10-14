"""
Original artwork for the home's frames, fridge and books, drawn procedurally with Pillow so nothing is
copyrighted: abstract and landscape paintings, children's crayon drawings, a calendar, the hand-made
birthday garland, a picture-book spread, a cookbook page and mail. Writes assets/art/*.png.

    python3 make_art.py
"""

import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'assets', 'art')


def font(size):
    for path in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
                 '/Library/Fonts/Arial Bold.ttf', 'C:/Windows/Fonts/arialbd.ttf'):
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def grain(im, amount=10, seed=0):
    rnd = random.Random(seed)
    noise = Image.effect_noise(im.size, amount).convert('L')
    noise = noise.point(lambda v: 128 + (v - 128) * 0.5)
    base = im.convert('RGB')
    return Image.blend(base, Image.merge('RGB', (noise, noise, noise)), 0.06 + rnd.random() * 0.02)


def canvas_weave(im):
    w, h = im.size
    tex = Image.new('L', (w, h), 128)
    d = ImageDraw.Draw(tex)
    for x in range(0, w, 3):
        d.line([(x, 0), (x, h)], fill=120 + (x * 7) % 16)
    for y in range(0, h, 3):
        d.line([(0, y), (w, y)], fill=124 + (y * 5) % 14)
    tex = tex.filter(ImageFilter.GaussianBlur(0.6))
    return Image.blend(im.convert('RGB'), Image.merge('RGB', (tex, tex, tex)), 0.08)


def brush_blob(d, rnd, cx, cy, r, col, n=40, jitter=0.25):
    for _ in range(n):
        a = rnd.random() * math.tau
        rr = r * (0.4 + rnd.random() * 0.6)
        x, y = cx + math.cos(a) * rr * 0.5, cy + math.sin(a) * rr * 0.5
        s = r * (0.25 + rnd.random() * jitter)
        c = tuple(max(0, min(255, int(v + rnd.uniform(-10, 10)))) for v in col)
        d.ellipse([x - s, y - s * 0.7, x + s, y + s * 0.7], fill=c)


def abstract(seed, palette, w=900, h=1200):
    rnd = random.Random(seed)
    im = Image.new('RGB', (w, h), palette[0])
    d = ImageDraw.Draw(im)
    # big soft colour fields
    for i, col in enumerate(palette[1:]):
        x0 = rnd.uniform(-0.2, 0.6) * w
        y0 = rnd.uniform(-0.1, 0.7) * h
        x1 = x0 + rnd.uniform(0.35, 0.8) * w
        y1 = y0 + rnd.uniform(0.2, 0.5) * h
        if i % 2:
            d.ellipse([x0, y0, x1, y1], fill=col)
        else:
            d.rounded_rectangle([x0, y0, x1, y1], radius=int(min(x1 - x0, y1 - y0) * 0.2), fill=col)
    im = im.filter(ImageFilter.GaussianBlur(3))
    d = ImageDraw.Draw(im)
    # a few confident strokes
    for _ in range(3):
        col = rnd.choice(palette[1:])
        pts = []
        x, y = rnd.uniform(0.1, 0.9) * w, rnd.uniform(0.1, 0.9) * h
        for k in range(8):
            x += rnd.uniform(-90, 90)
            y += rnd.uniform(-60, 60)
            pts.append((x, y))
        d.line(pts, fill=tuple(int(c * 0.7) for c in col), width=rnd.randint(8, 18), joint='curve')
    return canvas_weave(grain(im, seed=seed))


def landscape(seed, w=1200, h=900, dusk=False):
    rnd = random.Random(seed)
    top = (214, 196, 170) if dusk else (196, 210, 214)
    bot = (240, 222, 196) if dusk else (234, 230, 214)
    im = Image.new('RGB', (w, h))
    d = ImageDraw.Draw(im)
    for y in range(h):
        t = y / h
        d.line([(0, y), (w, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(top, bot)))
    hills = [(126, 140, 110), (98, 118, 92), (122, 104, 78), (78, 92, 70)]
    for i, col in enumerate(hills):
        base = h * (0.45 + i * 0.13)
        pts = [(0, h)]
        ph = rnd.random() * 10
        for x in range(0, w + 20, 20):
            y = base + math.sin(x / w * (2 + i) * math.pi + ph) * h * 0.05 + rnd.uniform(-4, 4)
            pts.append((x, y))
        pts.append((w, h))
        d.polygon(pts, fill=col)
    im = im.filter(ImageFilter.GaussianBlur(2))
    d = ImageDraw.Draw(im)
    for _ in range(14):  # trees along a ridge
        x = rnd.uniform(0, w)
        y = h * rnd.uniform(0.55, 0.7)
        s = rnd.uniform(14, 34)
        brush_blob(d, rnd, x, y - s, s, (66, 84, 58), n=14)
    return canvas_weave(grain(im, seed=seed))


def crayon_line(d, rnd, pts, col, width=7):
    for k in range(3):
        jit = [(x + rnd.uniform(-2, 2), y + rnd.uniform(-2, 2)) for x, y in pts]
        d.line(jit, fill=col, width=max(2, width - k * 2))


def kid_drawing(seed, w=1100, h=800, scene='house'):
    rnd = random.Random(seed)
    im = Image.new('RGB', (w, h), (250, 248, 242))
    d = ImageDraw.Draw(im)
    # sun
    sx, sy = w * 0.82, h * 0.2
    crayon_line(d, rnd, [(sx + math.cos(a / 8 * math.tau) * 60, sy + math.sin(a / 8 * math.tau) * 60) for a in range(9)], (240, 190, 40), 9)
    for a in range(10):
        ang = a / 10 * math.tau
        crayon_line(d, rnd, [(sx + math.cos(ang) * 80, sy + math.sin(ang) * 80), (sx + math.cos(ang) * 120, sy + math.sin(ang) * 120)], (240, 170, 30), 6)
    # grass
    crayon_line(d, rnd, [(x, h * 0.85 + rnd.uniform(-8, 8)) for x in range(0, w + 40, 40)], (80, 170, 60), 10)
    if scene == 'house':
        hx, hy = w * 0.18, h * 0.42
        crayon_line(d, rnd, [(hx, hy), (hx + 300, hy), (hx + 300, hy + 260), (hx, hy + 260), (hx, hy)], (200, 60, 50), 8)
        crayon_line(d, rnd, [(hx - 20, hy), (hx + 150, hy - 150), (hx + 320, hy)], (60, 80, 180), 8)
        crayon_line(d, rnd, [(hx + 120, hy + 260), (hx + 120, hy + 150), (hx + 190, hy + 150), (hx + 190, hy + 260)], (120, 80, 40), 7)
    # family: stick figures of different sizes
    for i, size in enumerate((1.0, 0.95, 0.6, 0.5, 0.42)):
        fx = w * (0.52 + i * 0.075) if scene == 'house' else w * (0.15 + i * 0.16)
        base = h * 0.84
        hgt = 260 * size
        col = rnd.choice([(40, 40, 40), (200, 50, 120), (40, 90, 200), (230, 120, 30)])
        d.ellipse([fx - 22 * size, base - hgt - 44 * size, fx + 22 * size, base - hgt], outline=col, width=5)
        crayon_line(d, rnd, [(fx, base - hgt), (fx, base - hgt * 0.45)], col, 6)
        crayon_line(d, rnd, [(fx - 40 * size, base - hgt * 0.75), (fx + 40 * size, base - hgt * 0.75)], col, 6)
        crayon_line(d, rnd, [(fx - 25 * size, base), (fx, base - hgt * 0.45), (fx + 25 * size, base)], col, 6)
    if scene == 'cat':
        cx, cy = w * 0.75, h * 0.72
        crayon_line(d, rnd, [(cx - 80, cy), (cx + 80, cy), (cx + 90, cy - 50), (cx - 80, cy - 50), (cx - 80, cy)], (90, 90, 90), 7)
        crayon_line(d, rnd, [(cx + 80, cy - 50), (cx + 90, cy - 110), (cx + 110, cy - 80), (cx + 130, cy - 110), (cx + 130, cy - 40), (cx + 90, cy - 50)], (90, 90, 90), 7)
        crayon_line(d, rnd, [(cx - 80, cy - 30), (cx - 140, cy - 100)], (90, 90, 90), 7)
    return grain(im, 8, seed)


def calendar(w=700, h=1000):
    im = Image.new('RGB', (w, h), (248, 246, 240))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, w, h * 0.42], fill=(170, 196, 186))
    rnd = random.Random(3)
    for _ in range(6):
        brush_blob(d, rnd, rnd.uniform(0, w), rnd.uniform(h * 0.2, h * 0.4), rnd.uniform(30, 70), (120, 150, 110), n=20)
    d.text((40, h * 0.45), 'OCTOBER', fill=(60, 60, 60), font=font(44))
    gx, gy, cw, chh = 30, h * 0.53, (w - 60) / 7, (h * 0.44) / 5
    for r in range(5):
        for c in range(7):
            x, y = gx + c * cw, gy + r * chh
            d.rectangle([x, y, x + cw, y + chh], outline=(200, 196, 188), width=2)
            n = r * 7 + c - 2
            if 1 <= n <= 31:
                d.text((x + 6, y + 4), str(n), fill=(110, 110, 110), font=font(18))
    for (r, c, col) in ((2, 3, (220, 70, 60)), (1, 5, (60, 110, 200)), (3, 1, (80, 160, 80))):
        x, y = gx + c * cw, gy + r * chh
        d.ellipse([x + 8, y + 22, x + cw - 8, y + chh - 6], outline=col, width=4)
    return grain(im, 6, 3)


def garland_flag(letter, col, w=300, h=360):
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.polygon([(0, 0), (w, 0), (w / 2, h)], fill=col + (255,))
    tw = d.textlength(letter, font=font(130))
    d.text(((w - tw) / 2, 30), letter, fill=(255, 252, 245, 255), font=font(130))
    return im


def garland():
    text = 'HAPPY BIRTHDAY'
    cols = [(226, 92, 80), (244, 178, 66), (92, 160, 210), (126, 186, 120), (200, 120, 190)]
    flags = [garland_flag(ch, cols[i % len(cols)]) for i, ch in enumerate(text.replace(' ', ''))]
    w = 300 * len(flags)
    sheet = Image.new('RGBA', (w, 360), (0, 0, 0, 0))
    for i, f in enumerate(flags):
        sheet.paste(f, (i * 300, 0), f)
    return sheet


def picture_book(w=2000, h=1000):
    rnd = random.Random(11)
    im = Image.new('RGB', (w, h), (251, 247, 236))
    d = ImageDraw.Draw(im)
    # left page: night sky over a hill with a small fox looking up at the moon
    d.rectangle([40, 40, w / 2 - 40, h * 0.72], fill=(40, 58, 110))
    for _ in range(40):
        x, y = rnd.uniform(60, w / 2 - 60), rnd.uniform(60, h * 0.5)
        d.ellipse([x, y, x + 5, y + 5], fill=(250, 240, 190))
    d.ellipse([w * 0.3, 90, w * 0.3 + 140, 230], fill=(250, 236, 170))
    d.pieslice([-200, h * 0.5, w / 2 + 200, h * 1.2], 180, 360, fill=(74, 130, 86))
    fx, fy = w * 0.2, h * 0.58
    d.polygon([(fx, fy), (fx + 90, fy - 30), (fx + 130, fy + 40), (fx + 30, fy + 60)], fill=(226, 120, 50))
    d.polygon([(fx + 90, fy - 30), (fx + 105, fy - 90), (fx + 125, fy - 20)], fill=(226, 120, 50))
    for k in range(3):
        d.rectangle([80, h * 0.78 + k * 50, w / 2 - 80 - k * 90, h * 0.78 + k * 50 + 18], fill=(120, 110, 100))
    # right page: a big tree full of birds
    d.rectangle([w / 2 + 40, 40, w - 40, h * 0.72], fill=(236, 214, 160))
    d.rectangle([w * 0.74, h * 0.35, w * 0.78, h * 0.72], fill=(120, 80, 50))
    for _ in range(26):
        brush_blob(d, rnd, rnd.uniform(w * 0.6, w * 0.92), rnd.uniform(h * 0.1, h * 0.42), rnd.uniform(40, 80), (90, 150, 80), n=10)
    for _ in range(6):
        x, y = rnd.uniform(w * 0.6, w * 0.9), rnd.uniform(h * 0.1, h * 0.4)
        d.ellipse([x, y, x + 34, y + 26], fill=rnd.choice([(220, 70, 60), (60, 120, 210), (250, 200, 60)]))
    for k in range(3):
        d.rectangle([w / 2 + 80, h * 0.78 + k * 50, w - 80 - k * 120, h * 0.78 + k * 50 + 18], fill=(120, 110, 100))
    d.line([(w / 2, 0), (w / 2, h)], fill=(220, 210, 196), width=6)
    return grain(im, 6, 11)


def text_page(seed, w=800, h=1100, image=True):
    rnd = random.Random(seed)
    im = Image.new('RGB', (w, h), (246, 241, 230))
    d = ImageDraw.Draw(im)
    y = 80
    if image:
        d.rectangle([60, 60, w - 60, 460], fill=(226, 196, 150))
        for _ in range(5):
            brush_blob(d, rnd, rnd.uniform(140, w - 140), rnd.uniform(160, 400), rnd.uniform(40, 90),
                       rnd.choice([(200, 80, 50), (230, 170, 60), (110, 150, 70)]), n=18)
        y = 520
    d.rectangle([60, y, 60 + rnd.randint(300, 500), y + 30], fill=(90, 80, 70))
    y += 70
    while y < h - 80:
        d.rectangle([60, y, w - 60 - rnd.randint(0, 200), y + 12], fill=(150, 140, 130))
        y += 30
    return grain(im, 5, seed)


def envelope(seed, w=800, h=520):
    rnd = random.Random(seed)
    im = Image.new('RGB', (w, h), (240, 234, 222) if seed % 2 else (232, 238, 244))
    d = ImageDraw.Draw(im)
    d.rectangle([w - 150, 30, w - 40, 160], fill=rnd.choice([(200, 80, 70), (80, 120, 180)]))
    for k in range(3):
        d.rectangle([w * 0.38, h * 0.5 + k * 40, w * 0.38 + rnd.randint(200, 360), h * 0.5 + k * 40 + 14], fill=(70, 70, 90))
    return grain(im, 4, seed)


def spine_atlas(w=2048, h=512):
    """Book spines: 32 columns, each a different cloth colour with title bands and small marks."""
    rnd = random.Random(5)
    im = Image.new('RGB', (w, h))
    d = ImageDraw.Draw(im)
    cols = [(181, 76, 58), (52, 74, 92), (214, 196, 160), (96, 120, 88), (40, 40, 44), (228, 220, 204), (150, 112, 70),
            (200, 160, 70), (120, 60, 70), (70, 100, 140), (230, 140, 90), (160, 170, 150), (90, 70, 110), (240, 236, 228)]
    n = 32
    cw = w / n
    for i in range(n):
        c = rnd.choice(cols)
        x0 = i * cw
        d.rectangle([x0, 0, x0 + cw, h], fill=c)
        light = tuple(min(255, v + 70) if sum(c) < 400 else max(0, v - 90) for v in c)
        if rnd.random() < 0.7:
            d.rectangle([x0, h * 0.08, x0 + cw, h * 0.11], fill=light)
            d.rectangle([x0, h * 0.89, x0 + cw, h * 0.92], fill=light)
        # title: a column of small marks reading as lettering
        y = h * rnd.uniform(0.2, 0.3)
        for _ in range(rnd.randint(4, 9)):
            hh = rnd.uniform(10, 22)
            d.rectangle([x0 + cw * 0.3, y, x0 + cw * 0.7, y + hh], fill=light)
            y += hh + rnd.uniform(4, 9)
        d.rectangle([x0 + cw * 0.25, h * 0.8, x0 + cw * 0.75, h * 0.83], fill=light)
    return grain(im, 6, 5)


def main():
    os.makedirs(OUT, exist_ok=True)
    out = {
        'abstract_a': abstract(1, [(232, 222, 204), (196, 120, 82), (220, 186, 130), (92, 110, 100)]),
        'abstract_b': abstract(2, [(236, 230, 218), (70, 92, 104), (176, 160, 130), (210, 120, 96)], w=1000, h=1000),
        'abstract_c': abstract(3, [(214, 204, 186), (150, 168, 150), (232, 214, 170), (60, 64, 70)], w=1200, h=900),
        'landscape_a': landscape(4),
        'landscape_b': landscape(5, dusk=True),
        'kid_house': kid_drawing(6, scene='house'),
        'kid_family': kid_drawing(7, scene='family'),
        'kid_cat': kid_drawing(8, scene='cat'),
        'calendar': calendar(),
        'garland': garland(),
        'picture_book': picture_book(),
        'cookbook': text_page(9),
        'page_text': text_page(10, image=False),
        'mail_a': envelope(12),
        'mail_b': envelope(13),
        'spines': spine_atlas(),
        'photo_a': landscape(14),
        'photo_b': abstract(15, [(200, 214, 220), (240, 226, 200), (120, 150, 170), (230, 200, 160)], w=1000, h=750),
    }
    for name, im in out.items():
        im.save(os.path.join(OUT, f'{name}.png'), optimize=True)
        print(name, im.size)


if __name__ == '__main__':
    main()

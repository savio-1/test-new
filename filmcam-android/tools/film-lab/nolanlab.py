"""FilmCam Nolan lab: Nolan On The Run's grade, learned from the frames on his LUT shop.

    python3 nolanlab.py fetch                    # his shop images (not in git)
    python3 nolanlab.py check                    # graded log halves vs his grade, measured
    python3 nolanlab.py luts <out dir>           # assets/luts/cu_nolanontherun{,teal}.png
    python3 nolanlab.py preview <out.jpg>        # converted log | golden | teal | his grade

nolanontherun.com sells his grade (ON THE RUN POWERGRADE, ON THE RUN LUTs) and shows it on
seven split frames: his grade on the left, the Sony S-Log3 / S-Gamut3.Cine original on the
right, plus six more graded frames. The two halves of a split are different moments, so
there is no pixel-to-pixel pair to fit. Instead the log halves are turned into what a phone
would show (S-Log3 decoded, S-Gamut3.Cine to Rec.709, a filmic display curve, 18% grey kept
at 18%), and both sides are pooled and measured where content can't fool it: skin, foliage,
sky and warm highlights, the tone scale and the tint along it. Those set a model in OKLab
(hue rotation, saturation and lightness by hue, a tone curve, a split tint), checked
against the same measurements and by eye, then baked into the LUT.

His frames are not one look: most are golden and hazy (dunes, Tetons, fields at dusk), one
is orange-and-teal with a cyan sky. So there are two looks: On The Run (golden) and On The
Run Teal. His own LUT files stay the exact answer: Looks -> Custom -> Import LUT reads them.
"""
import os, re, sys, urllib.request
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from filmlab import srgb_to_lin, lin_to_srgb, lin_to_oklab, oklab_to_lin, N  # noqa: E402

CACHE = os.path.join(HERE, '.nolan-cache')
SITE = 'https://images.squarespace-cdn.com/content/v1/675318280fd76313f5f04772/'
# Split frames: graded | S-Log3, 1920x1080, the seam at x = 960.
PAIRS = {
    'dcdc': '9cf1b520-c476-40c8-aa2c-2f9a65685a05/dcdc.jpg',
    'ddfzz': '85c1dcf0-2fcd-499b-a2f9-d2c4cc368b39/ddfzz.jpg',
    'fa': '802e7c43-a0a3-44bb-b2e5-3e7d18d69540/fa.jpg',
    'fvvvf': '5b2efeb8-be44-47ce-bfa6-885e502b6a2d/fvvvf.jpg',
    'jjj': '88a2d7ac-27bf-4295-b2b2-4a9f9e171bd2/jjj.jpg',
    'skc': '5f8a9eb7-0433-41c5-84f7-5b011f8331cc/skc.jpg',
    'svf': '54adc8fe-4647-41af-b73a-04c170f39186/svf.jpg',
}
GRADED = {
    '4': '32b4417f-6736-43ab-b47a-35c4dd08dfdf/4.jpg',
    'timeline': '9f3c2bf9-9299-4725-867a-6ba96290ac86/Timeline+1+copy_01_08_28_05.jpg',
    'travel': 'f5ec8117-3fbc-433f-8fc1-e1a6d3656bfe/Travel+Guide.jpg',
    'ddd': '393b92c3-13e6-4a9f-9ef0-671111a8239d/ddd.jpg',
    'hope': '6b11f8b7-1957-4a8e-816b-ac9ecef32fef/hope.jpg',
    'rror': 'c8d50815-25db-465f-bf6f-7f90bc7c984e/rror.jpg',
}

# ----------------------------------------------------------------------------- log to phone
SG3C_XYZ = np.array([[0.5990839208, 0.2489255161, 0.1024464902],
                     [0.2150758201, 0.8850685017, -0.1001443219],
                     [-0.0320658495, -0.0276583907, 1.1487819910]])
XYZ_709 = np.array([[3.2404542, -1.5371385, -0.4985314],
                    [-0.9692660, 1.8760108, 0.0415560],
                    [0.0556434, -0.2040259, 1.0572252]])
SG3C_709 = XYZ_709 @ SG3C_XYZ

def slog3_to_lin(y):
    y = y * 1023
    return np.where(y >= 171.2102946929, 10 ** ((y - 420) / 261.5) * 0.19 - 0.01,
                    (y - 95) * 0.01125 / (171.2102946929 - 95))

def aces(x):
    return np.clip((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0, 1)

EXPO = 0.723                                       # aces(0.18 * EXPO) = 0.18

def log_to_phone(rgb):
    lin = slog3_to_lin(rgb) @ SG3C_709.T
    return lin_to_srgb(aces(np.clip(lin, 0, None) * EXPO))

# ----------------------------------------------------------------------------- the looks
# Measured, converted log -> his grade (OKLab): sky 240 -> 211 deg (blue to teal-cyan), warm
# highlights 96 -> 81 deg and +15% chroma, skin 74 -> 70 deg and 0.068 -> 0.085 chroma,
# foliage 131 -> 116 deg and -15% chroma, median L 0.59 -> 0.47, L95 0.95 -> 0.87; near-neutrals
# quieter, vivid colours stronger; highlights strongly warm.
HUES = np.array([
  # hue, dh,  sat,  light
  [  0,   5,  1.10, 1.00],   # magenta-red
  [ 25,   4,  1.15, 1.00],   # red
  [ 56,  -6,  1.40, 1.00],   # orange
  [ 75, -10,  1.40, 0.99],   # skin / gold
  [ 96, -16,  1.45, 1.00],   # yellow -> gold
  [125, -15,  0.80, 0.95],   # foliage -> olive
  [155, -10,  0.85, 0.96],   # green
  [185,  -3,  1.00, 0.97],   # teal
  [210,  -6,  1.20, 1.04],   # cyan
  [240, -22,  1.25, 1.06],   # sky blue -> teal
  [275, -20,  0.95, 1.00],   # blue-violet
  [310,  -5,  1.00, 1.00],   # purple
  [360,   5,  1.10, 1.00],
])
TL = np.array([0.0, 0.15, 0.3, 0.5, 0.7, 0.85, 1.0])
TA = np.array([-0.004, -0.004, 0.004, 0.014, 0.012, 0.008, 0.004])
TB = np.array([-0.006, -0.004, 0.016, 0.036, 0.040, 0.034, 0.026])

BASE = dict(tone_mix=1.0, toe=0.5, low_sat=0.65, sat_global=1.12, warm=1.0, wb=0.0, peach=0.25,
            sky_sat=1.0, sky_dh=0.0, gold_sat=1.0, hi_warm=0.0, green_l=1.0)
LOOKS = {
    # Golden hour haze: warmer balance, peach highlights, pale skies, gold kept from going orange.
    'cu_nolanontherun': dict(BASE, warm=1.2, wb=0.006, peach=0.8, sky_sat=0.6, sat_global=1.0,
                             gold_sat=0.65, hi_warm=0.015, green_l=1.05),
    # Orange and teal: the cyan sky of his wildflower frame, quiet neutrals.
    'cu_nolanontherunteal': dict(BASE, sky_sat=1.8, sky_dh=-12, sat_global=1.05, gold_sat=0.9,
                                    green_l=1.03, low_sat=0.5),
}

def circ(hd, centre, width):
    return np.exp(-0.5 * ((((hd - centre) + 180) % 360 - 180) / width) ** 2)

def tone_curve(ref, tgt, p):
    """Brightness: the converted log's distribution moved onto his, smoothed, toe kept."""
    rng = np.random.default_rng(0)
    qs = np.linspace(0, 1, 401); xs = np.linspace(0, 1, 101)
    qn = np.quantile(ref[rng.choice(len(ref), min(len(ref), 300000)), 0], qs)
    qg = np.quantile(tgt[rng.choice(len(tgt), min(len(tgt), 300000)), 0], qs)
    tq = np.interp(xs, qn, qg)
    k = np.exp(-0.5 * (np.arange(-6, 7) / 2.5) ** 2); k /= k.sum()
    tq = np.maximum.accumulate(np.convolve(np.pad(tq, 6, mode='edge'), k, 'valid'))
    return np.maximum((1 - p['tone_mix']) * xs + p['tone_mix'] * tq, p['toe'] * xs)

def grade(rgb, tone, p):
    xs = np.linspace(0, 1, len(tone))
    X = lin_to_oklab(srgb_to_lin(np.clip(rgb, 0, 1)))
    X[:, 1] += p['wb'] * p['peach']; X[:, 2] += p['wb']
    L = X[:, 0]; C = np.hypot(X[:, 1], X[:, 2]); h = np.arctan2(X[:, 2], X[:, 1])
    hd = np.degrees(h) % 360
    sky, gold, green = circ(hd, 235, 30), circ(hd, 70, 25), circ(hd, 135, 25)
    dh = np.interp(hd, HUES[:, 0], HUES[:, 1]) + p['sky_dh'] * sky
    sat = np.interp(hd, HUES[:, 0], HUES[:, 2]) * (1 + (p['sky_sat'] - 1) * sky)
    sat = 1 + (sat - 1) * (1 + (p['gold_sat'] - 1) * gold)
    light = np.interp(hd, HUES[:, 0], HUES[:, 3]) * (1 + (p['green_l'] - 1) * green)
    w = np.clip(C / 0.04, 0, 1)                    # greys keep their hue and lightness
    L2 = np.interp(L * (1 + (light - 1) * w), xs, tone)
    quiet = p['low_sat'] + (1 - p['low_sat']) * np.clip(C / 0.09, 0, 1)
    C2 = C * sat * p['sat_global'] * quiet
    h2 = h + np.radians(dh) * w
    hi = p['hi_warm'] * np.clip((L2 - 0.55) / 0.4, 0, 1)
    a = C2 * np.cos(h2) + np.interp(L2, TL, TA) * p['warm'] + hi * p['peach']
    b = C2 * np.sin(h2) + np.interp(L2, TL, TB) * p['warm'] + hi
    return np.clip(lin_to_srgb(np.clip(oklab_to_lin(np.stack([L2, a, b], 1)), 0, None)), 0, 1)

# ----------------------------------------------------------------------------- data
def local(name):
    return os.path.join(CACHE, name + '.jpg')

def fetch():
    os.makedirs(CACHE, exist_ok=True)
    for name, path in {**PAIRS, **GRADED}.items():
        if not os.path.exists(local(name)):
            with urllib.request.urlopen(SITE + path, timeout=60) as r:
                open(local(name), 'wb').write(r.read())

def image(name, w=None):
    from PIL import Image
    im = Image.open(local(name)).convert('RGB')
    if w:
        im = im.resize((w, max(1, int(w * im.size[1] / im.size[0]))), Image.BOX)
    return np.asarray(im, np.float64) / 255

def halves(name, w=480):
    """His grade and the converted log, each side of the seam (a few pixels either side cut)."""
    from PIL import Image
    a = image(name)
    def small(x):
        im = Image.fromarray(np.round(x * 255).astype(np.uint8))
        return np.asarray(im.resize((w // 2, int(w // 2 * x.shape[0] / x.shape[1])), Image.BOX), np.float64) / 255
    return small(a[:, :950]), log_to_phone(small(a[:, 970:]))

def trim(a):
    a = a[a.max((1, 2)) > 0.06]; a = a[:, a.max((0, 2)) > 0.06]
    return a.reshape(-1, 3)

def setup():
    ref, his = [], []
    for name in PAIRS:
        g, l = halves(name)
        his.append(trim(g)); ref.append(trim(l))
    his += [trim(image(name, 480)) for name in GRADED]
    ref = np.concatenate(ref)
    R = lin_to_oklab(srgb_to_lin(ref)); T = lin_to_oklab(srgb_to_lin(np.concatenate(his)))
    return ref, R, T

def measure(X):
    L = X[:, 0]; C = np.hypot(X[:, 1], X[:, 2]); hd = np.degrees(np.arctan2(X[:, 2], X[:, 1])) % 360
    o = {}
    for nm, m in [('shadow tint', L < 0.25), ('mid tint', (L >= .45) & (L < .65)), ('highlight tint', L > 0.75)]:
        o[nm] = tuple(round(float(v), 4) for v in np.median(X[m, 1:], 0))
    for nm, m in [('skin L/C/hue', (hd > 40) & (hd < 85) & (C > 0.04) & (C < 0.15) & (L > 0.45) & (L < 0.85)),
                  ('sky L/C/hue', (hd > 190) & (hd < 275) & (L > 0.55) & (C > 0.02)),
                  ('foliage L/C/hue', (hd > 100) & (hd < 175) & (C > 0.03) & (L > 0.2) & (L < 0.7)),
                  ('warm hi L/C/hue', (hd > 40) & (hd < 110) & (L > 0.75) & (C > 0.03))]:
        o[nm] = (round(float(np.median(L[m])), 3), round(float(np.median(C[m])), 3), round(float(np.median(hd[m])), 1))
    o['L 5/50/95'] = tuple(round(float(v), 3) for v in np.percentile(L, [5, 50, 95]))
    o['C 50/90'] = (round(float(np.median(C)), 4), round(float(np.percentile(C, 90)), 4))
    return o

def check():
    ref, R, T = setup()
    t, r = measure(T), measure(R)
    for look, p in LOOKS.items():
        g = measure(lin_to_oklab(srgb_to_lin(grade(ref, tone_curve(R, T, p), p))))
        print(look)
        for k in g:
            print(f'  {k:16s} graded {g[k]}   his {t[k]}   converted log {r[k]}')

def write_luts(out):
    from PIL import Image
    _, R, T = setup()
    t = np.linspace(0, 1, N)
    bb, gg, rr = np.meshgrid(t, t, t, indexing='ij')
    grid = np.stack([rr.ravel(), gg.ravel(), bb.ravel()], 1)
    os.makedirs(out, exist_ok=True)
    for look, p in LOOKS.items():
        y = grade(grid, tone_curve(R, T, p), p).reshape(N, N, N, 3)
        img = np.zeros((N, N * N, 3), np.uint8)
        for bi in range(N):
            img[:, bi * N:(bi + 1) * N, :] = np.round(y[bi] * 255).astype(np.uint8)
        path = os.path.join(out, look + '.png')
        Image.fromarray(img).save(path, optimize=True)
        print('wrote', path)

def preview(path):
    from PIL import Image
    _, R, T = setup()
    tones = {look: tone_curve(R, T, p) for look, p in LOOKS.items()}
    rows = []
    for name in PAIRS:
        g, n = halves(name, 560)
        h = min(g.shape[0], n.shape[0]); sp = np.ones((h, 6, 3))
        parts = [n[:h]]
        for look, p in LOOKS.items():
            parts += [sp, grade(n.reshape(-1, 3), tones[look], p).reshape(n.shape)[:h]]
        parts += [sp, np.ones((h, 10, 3)), g[:h]]
        rows.append(np.concatenate(parts, 1))
    img = np.concatenate([np.concatenate([r, np.ones((6, r.shape[1], 3))], 0) for r in rows], 0)
    Image.fromarray(np.round(np.clip(img, 0, 1) * 255).astype(np.uint8)).save(path, quality=88)
    print('wrote', path)

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'fetch':
        fetch()
    elif cmd == 'check':
        check()
    elif cmd == 'luts':
        write_luts(sys.argv[2])
    elif cmd == 'preview':
        preview(sys.argv[2])
    else:
        print(__doc__)

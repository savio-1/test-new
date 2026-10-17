"""FilmCam style lab: a creator's grade learned from their finished footage alone.

    python3 stylelab.py fetch                    # their frames and the reference frames (not in git)
    python3 stylelab.py check                    # graded references vs their footage, measured
    python3 stylelab.py luts <out dir>           # assets/luts/cu_<look>.png
    python3 stylelab.py preview <out.jpg>        # references, graded, next to their frames

Some looks have no before/after frames and no product: Noah's Nostalgia (YouTube, Noah
Sandvik) sells no LUT and names no grading tools. His look is measured from his own footage
instead: the frames YouTube captures inside each video (90 frames from 30 videos), against
ungraded Rec.709 frames of similar subjects (the before frames used by customlab.py). What a
grade does is read where content can't fool it: the colour of skin, foliage and sky, the
tone curve, and the tint of each part of the scale. Those set a model in OKLab (hue
rotation, saturation and lightness by hue, a tone curve and a split tint), checked against
the same measurements and by eye, then baked into the LUT.
"""
import os, sys, urllib.request
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from filmlab import srgb_to_lin, lin_to_srgb, lin_to_oklab, oklab_to_lin, N  # noqa: E402
import customlab  # noqa: E402

CACHE = os.path.join(HERE, '.style-cache')
VIDEOS = ['8WOoUsTLioA', 'ALG9oYP_qFU', 'Asn17i1OC3E', 'F7vDA4XRRq4', 'GwqnaIyCa64', 'JAG6HiezYgY', 'Kn8FXSS7k1k', 'LdgFt5lL7jA', 'OTH7LKgfdD4', 'RgKvwhhUFSo', 'VHqPkrOKxCk', 'Ze6-9e8r7WU', 'dPFecwyQi9M', 'diH1M7A0vO8', 'en4t6DkrEUE', 'gaZpy9fPJDg', 'hzqGazc1qdE', 'jQq6PE719xI', 'k6Z695MY-Lo', 'mKd4KoCghyM', 'n3loDdXY0Uk', 'p6iUSNuiXV4', 'pyH6fUDeLO4', 'qE4-l47fn_4', 'uDs304JT2F4', 'vJX8nDcbhEY', 'w7DoORiXoi0', 'xpm2EzYw1rU', 'yf1LF1D5itU', 'zNWNoCaWc3Q']
FRAMES = [f'https://i.ytimg.com/vi/{v}/maxres{k}.jpg' for v in VIDEOS for k in (1, 2, 3)]

# ----------------------------------------------------------------------------- the look
# Measured on his footage vs Rec.709 references (OKLab): skin hue 56 -> 67 deg and +10% chroma;
# foliage 117 -> 132 deg, -15% chroma, darker; sky 243 -> 208 deg (blue to teal); reds muted;
# darker mid-tones; olive-green shadows, cream highlights.
HUES = np.array([
  # hue, dh,   sat,  light
  [  0,   4,  0.55, 1.00],   # magenta-red
  [ 25,   7,  0.60, 1.00],   # red
  [ 56,   8,  1.07, 0.96],   # skin / orange
  [ 85,  10,  1.00, 0.95],   # yellow
  [117,  18,  0.70, 0.93],   # foliage
  [150,  12,  0.68, 0.94],   # green
  [185,  -2,  0.85, 1.00],   # teal
  [210, -12,  1.08, 1.05],   # cyan
  [243, -30,  1.15, 1.07],   # sky blue -> teal
  [275, -20,  0.90, 1.02],   # blue-violet
  [310,  -6,  0.70, 1.00],   # purple
  [360,   4,  0.55, 1.00],
])

TL=np.array([0.0,0.15,0.3,0.5,0.7,0.85,1.0])
TA=np.array([-0.010,-0.010,-0.006,-0.001,-0.006,-0.013,-0.010])
TB=np.array([ 0.004, 0.006, 0.010, 0.016, 0.022, 0.028, 0.022])

TONE_MIX, TOE, SAT_GLOBAL = 0.9, 0.45, 0.9

def lch(X):
    return X[:, 0], np.hypot(X[:, 1], X[:, 2]), np.arctan2(X[:, 2], X[:, 1])

def tone_curve(ref, tgt):
    """Brightness: the references' distribution moved onto his, smoothed, toe kept."""
    rng = np.random.default_rng(0)
    r = ref[rng.choice(len(ref), min(400000, len(ref)), replace=False), 0]
    t = tgt[rng.choice(len(tgt), min(400000, len(tgt)), replace=False), 0]
    qs = np.linspace(0, 1, 401)
    xs = np.linspace(0, 1, 101)
    tq = np.interp(xs, np.quantile(r, qs), np.quantile(t, qs))
    k = np.exp(-0.5 * (np.arange(-6, 7) / 2.5) ** 2); k /= k.sum()
    tq = np.maximum.accumulate(np.convolve(np.pad(tq, 6, mode='edge'), k, 'valid'))
    curve = np.maximum((1 - TONE_MIX) * xs + TONE_MIX * tq, TOE * xs)
    curve[-1] = max(curve[-1], 0.985)
    return xs, curve

def grade(rgb, tone):
    xs, curve = tone
    X = lin_to_oklab(srgb_to_lin(np.clip(rgb, 0, 1)))
    L, C, h = lch(X)
    hd = np.degrees(h) % 360
    field = lambda col: np.interp(hd, HUES[:, 0], HUES[:, col])
    w = np.clip(C / 0.04, 0, 1)                   # greys keep their hue (the tint aside)
    L2 = np.interp(L * (1 + (field(3) - 1) * w), xs, curve)
    C2 = C * field(2) * SAT_GLOBAL
    h2 = h + np.radians(field(1)) * w
    a = C2 * np.cos(h2) + np.interp(L2, TL, TA)
    b = C2 * np.sin(h2) + np.interp(L2, TL, TB)
    return np.clip(lin_to_srgb(np.clip(oklab_to_lin(np.stack([L2, a, b], 1)), 0, None)), 0, 1)

# ----------------------------------------------------------------------------- data
def local(url):
    import re
    return os.path.join(CACHE, re.sub(r'[^A-Za-z0-9._-]', '_', url.split('://')[-1]))

def fetch():
    os.makedirs(CACHE, exist_ok=True)
    for u in FRAMES:
        p = local(u)
        if not os.path.exists(p):
            with urllib.request.urlopen(u, timeout=60) as r:
                open(p, 'wb').write(r.read())
    customlab.fetch()

def pixels(path, w=320):
    from PIL import Image
    im = Image.open(path).convert('RGB')
    im = im.resize((w, max(1, int(w * im.size[1] / im.size[0]))), Image.BOX)
    a = np.asarray(im, np.float64) / 255
    a = a[a.max((1, 2)) > 0.06]                    # letterbox and pillar bars out
    a = a[:, a.max((0, 2)) > 0.06]
    return a.reshape(-1, 3)

def references():
    """Ungraded Rec.709 frames: the before side of customlab's pairs."""
    out = []
    for look in customlab.LOOKS.values():
        for b, _, crop in look['pairs']:
            out.append(customlab.load(b, 4, crop).reshape(-1, 3))
    return np.concatenate(out)

def target():
    return np.concatenate([pixels(local(u)) for u in FRAMES if os.path.exists(local(u))])

def measure(X):
    L, C, h = lch(X)
    hd = np.degrees(h) % 360
    o = {}
    for nm, m in [('shadow tint', L < 0.22), ('mid tint', (L >= .4) & (L < .65)), ('highlight tint', L > 0.75)]:
        o[nm] = tuple(round(float(v), 4) for v in np.median(X[m, 1:], 0))
    for nm, m in [('skin L/C/hue', (hd > 40) & (hd < 85) & (C > 0.04) & (C < 0.15) & (L > 0.45) & (L < 0.85)),
                  ('sky L/C/hue', (hd > 190) & (hd < 275) & (L > 0.55) & (C > 0.02)),
                  ('foliage L/C/hue', (hd > 100) & (hd < 175) & (C > 0.03) & (L > 0.2) & (L < 0.7))]:
        o[nm] = (round(float(np.median(L[m])), 3), round(float(np.median(C[m])), 3), round(float(np.median(hd[m])), 1))
    o['L 10/50/90'] = tuple(round(float(v), 3) for v in np.percentile(L, [10, 50, 90]))
    return o

def setup():
    ref = references()
    tgt_rgb = target()
    R = lin_to_oklab(srgb_to_lin(ref)); T = lin_to_oklab(srgb_to_lin(tgt_rgb))
    return ref, R, T, tone_curve(R, T)

def check():
    ref, R, T, tone = setup()
    G = lin_to_oklab(srgb_to_lin(grade(ref, tone)))
    a, b, r = measure(G), measure(T), measure(R)
    for k in a:
        print(f'{k:16s} graded {a[k]}   his {b[k]}   ungraded {r[k]}')

def write_lut(path):
    from PIL import Image
    _, _, _, tone = setup()
    t = np.linspace(0, 1, N)
    bb, gg, rr = np.meshgrid(t, t, t, indexing='ij')
    y = grade(np.stack([rr.ravel(), gg.ravel(), bb.ravel()], 1), tone).reshape(N, N, N, 3)
    img = np.zeros((N, N * N, 3), np.uint8)
    for bi in range(N):
        img[:, bi * N:(bi + 1) * N, :] = np.round(y[bi] * 255).astype(np.uint8)
    Image.fromarray(img).save(path, optimize=True)
    print('wrote', path)

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'fetch':
        fetch()
    elif cmd == 'check':
        check()
    elif cmd == 'luts':
        os.makedirs(sys.argv[2], exist_ok=True)
        write_lut(os.path.join(sys.argv[2], 'cu_noahsnostalgia.png'))
    else:
        print(__doc__)

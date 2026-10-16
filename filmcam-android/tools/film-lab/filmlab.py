"""FilmCam film lab: a colour-negative + print model that bakes each film stock into a 3D LUT.

    python3 filmlab.py luts  <out dir>           # assets/luts/<stock>.png, 33^3 as a 1089x33 strip
    python3 filmlab.py preview <image> <out.jpg> [stock ...]   # contact sheet through the model

The model, per pixel (camera picture in, display picture out):
  1. sRGB -> linear light, with a little of the phone's highlight shoulder undone.
  2. Negative: spectral crosstalk between the layers, then each layer's characteristic curve
     (density against log exposure: toe, straight line, shoulder). Different layer contrasts are
     what make film's colour crossovers: a cast in the shadows that turns in the highlights.
  3. Print: the negative is printed with per-channel printer lights chosen so that 18% grey
     comes out at the stock's grey (neutral, or warm/cool on purpose), through the paper's own,
     steeper curve. Base fog sets the white, dye density the black.
  4. Dyes: saturation pushed in density space, as real dyes do (rich mid-tones, quiet highlights).
  5. Character, in OKLab: hue shifts for particular colours (greens to olive or teal, skin
     warmer), saturation by hue, split toning, faded blacks.
Only the colour lives in the LUT; grain, halation, leaks etc. stay in the shader.
"""
import json, math, sys
import numpy as np

N = 33

# ----------------------------------------------------------------------------- colour helpers
def srgb_to_lin(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)

def lin_to_srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)

M1 = np.array([[0.4122214708, 0.5363325363, 0.0514459929],
               [0.2119034982, 0.6806995451, 0.1073969566],
               [0.0883024619, 0.2817188376, 0.6299787005]])
M2 = np.array([[0.2104542553, 0.7936177850, -0.0040720468],
               [1.9779984951, -2.4285922050, 0.4505937099],
               [0.0259040371, 0.7827717662, -0.8086757660]])

def lin_to_oklab(c):
    lms = np.cbrt(c @ M1.T)
    return lms @ M2.T

def oklab_to_lin(lab):
    lms = lab @ np.linalg.inv(M2).T
    return (lms ** 3) @ np.linalg.inv(M1).T

# ----------------------------------------------------------------------------- the film
def curve(le, le0, gamma, drange, dmin):
    """Characteristic curve: density vs log10 exposure, a logistic with slope gamma at le0."""
    k = 4.0 * gamma / drange
    return dmin + drange / (1.0 + np.exp(-(le - le0) * k))

def curve_inv(d, le0, gamma, drange, dmin):
    k = 4.0 * gamma / drange
    y = np.clip((d - dmin) / drange, 1e-6, 1 - 1e-6)
    return le0 - np.log(1.0 / y - 1.0) / k

DEFAULT = dict(
    crosstalk=0.10,          # how much each layer sees of its neighbours (desaturates the negative)
    neg_gamma=[0.60, 0.60, 0.60], neg_range=2.6,
    print_gamma=2.4, print_range=2.9, print_black=0.0,
    contrast=1.0, bright=1.0, white=0.97,                # the neutral tone curve
    grey=0.18, tint=[0.0, 0.0],                          # grey level; (warm, magenta) cast of grey
    dye_sat=1.0, sat=1.0, expand=0.25,
    hues=[],                 # [hue_deg, width_deg, shift_deg, sat_mult, light_add]
    shadow=[0.0, 0.0], highlight=[0.0, 0.0],            # OKLab (a, b) split toning
    fade=0.0, fade_tint=[0.0, 0.0],
    mono=None,               # B&W: channel weights
    slide=False,             # reversal film: one curve, no print
    scan_black=0.025, scan_white=0.965,
)

def tone(t, p):
    """The stock's neutral tone curve on linear light: contrast around grey, a soft shoulder
    that reaches the paper white, grey placed at the stock's brightness."""
    A = 0.18 * p['bright']
    c = p['contrast']
    v = np.power(np.maximum(t, 0) / 0.18, c)
    v1 = (1.0 / 0.18) ** c
    W = p['white']
    sh = max((W - A * v1) / (v1 * (A - W)), 0.0)
    return A * v * (1 + sh) / (1 + sh * v)

def develop(x, p):
    """x: (N,3) display RGB in 0..1 -> (N,3) display RGB."""
    q = dict(DEFAULT); q.update(p); p = q
    out = film_colour(x, p)
    # The negative/print model decides colour; the tone is set separately (below) so every
    # stock reaches a clean white and black. Each channel goes back through the model's own
    # neutral response, then through the stock's designed curve: crossovers survive.
    ramp = np.linspace(0, 1, 1024)
    T = film_colour(np.repeat(ramp[:, None], 3, 1), p).mean(axis=1)
    T = np.maximum.accumulate(T + np.arange(1024) * 1e-9)
    t = np.interp(out, T, srgb_to_lin(ramp))
    out = tone(t, p)
    return character(out, p)

def film_colour(x, p):
    lin = srgb_to_lin(x)
    # Undo some of the phone's highlight compression so film's own shoulder has room to work.
    lin = lin * (1.0 + p['expand'] * lin * lin)
    if p['mono'] is not None:
        w = np.array(p['mono'], float); w = w / w.sum()
        lin = np.repeat((lin @ w)[:, None], 3, axis=1)
    ct = p['crosstalk']
    M = np.array([[1 - ct, ct * 0.7, ct * 0.3], [ct * 0.5, 1 - ct, ct * 0.5], [ct * 0.3, ct * 0.7, 1 - ct]])
    E = np.maximum(lin @ M.T, 1e-6)
    le = np.log10(E)
    le_grey = math.log10(0.18)
    g_neg = np.array(p['neg_gamma'], float)
    warm, mag = p['tint']
    target = p['grey'] * np.array([1 + 0.22 * warm + 0.06 * mag, 1 - 0.15 * mag + 0.02 * warm, 1 - 0.28 * warm + 0.06 * mag])
    dmin_p = 0.06
    rng_p = p['print_range'] - p['print_black']
    if p['slide']:
        # Reversal film: the exposed film is the picture. One steep curve per layer.
        D = np.zeros_like(le)
        for c in range(3):
            dt = dmin_p - math.log10(target[c])                # grey's density on the slide
            v = dmin_p + rng_p - dt
            le0 = le_grey - curve_inv(v, 0.0, g_neg[c], rng_p, 0.0)
            D[:, c] = dmin_p + rng_p - curve(le[:, c], le0, g_neg[c], rng_p, 0.0)
        D = np.clip(D, dmin_p, dmin_p + rng_p)
    else:
        Dn = np.zeros_like(le)
        D = np.zeros_like(le)
        for c in range(3):
            Dn[:, c] = curve(le[:, c], le_grey, g_neg[c], p['neg_range'], 0.2)
            dn_grey = curve(le_grey, le_grey, g_neg[c], p['neg_range'], 0.2)
            # Printer light: grey prints at its target density.
            lp0 = 0.0
            log_ep_grey = curve_inv(dmin_p - math.log10(target[c]), lp0, p['print_gamma'], rng_p, dmin_p)
            log_p = log_ep_grey + dn_grey
            D[:, c] = curve(-Dn[:, c] + log_p, lp0, p['print_gamma'], rng_p, dmin_p)
    # Dyes: saturation in density space.
    m = D.mean(axis=1, keepdims=True)
    D = m + (D - m) * p['dye_sat']
    out = 10.0 ** (-(D - dmin_p))
    return np.clip(out, 0, 1)

def character(out, p):
    # Character in OKLab.
    lab = lin_to_oklab(np.maximum(out, 0))
    L, a, b = lab[:, 0], lab[:, 1], lab[:, 2]
    C = np.hypot(a, b)
    h = np.degrees(np.arctan2(b, a)) % 360
    C = C * p['sat']
    for hue, width, shift, smul, ladd in p['hues']:
        d = (h - hue + 540) % 360 - 180
        wgt = np.exp(-0.5 * (d / width) ** 2) * np.clip(C / 0.04, 0, 1)
        h = h + shift * wgt
        C = C * (1 + (smul - 1) * wgt)
        L = L + ladd * wgt
    a = C * np.cos(np.radians(h)); b = C * np.sin(np.radians(h))
    ws = np.clip(1 - L / 0.55, 0, 1) ** 1.5
    wh = np.clip((L - 0.55) / 0.45, 0, 1) ** 1.5
    a = a + 1.8 * (p['shadow'][0] * ws + p['highlight'][0] * wh)
    b = b + 1.8 * (p['shadow'][1] * ws + p['highlight'][1] * wh)
    out = oklab_to_lin(np.stack([L, a, b], 1))
    # Soft gamut edge: colours that won't fit slide toward grey of the same lightness instead of
    # clipping one channel (which turns strong reds neon and flat).
    grey = np.repeat(np.clip(L, 0, 1)[:, None] ** 3, 3, 1)
    d = out - grey
    with np.errstate(divide='ignore', invalid='ignore'):
        up = np.where(d > 1e-6, (1.0 - grey) / d, np.inf)
        dn = np.where(d < -1e-6, (0.0 - grey) / d, np.inf)
    k = np.clip(np.minimum(up.min(1), dn.min(1)), 0, 1)[:, None]
    out = grey + d * np.minimum(k, 1.0)
    out = lin_to_srgb(np.clip(out, 0, 1))
    # Faded blacks, with a colour.
    if p['fade'] > 0:
        f = p['fade']
        tint = lin_to_srgb(np.clip(oklab_to_lin(np.array([[0.25, p['fade_tint'][0], p['fade_tint'][1]]])), 0, 1))[0]
        base = f * tint / max(tint.mean(), 1e-3) * 0.5 + f * 0.5
        out = base + out * (1 - f)
    # A lab scan never reaches pure black or white: the film base and the scanner's range.
    out = p['scan_black'] + out * (p['scan_white'] - p['scan_black'])
    return np.clip(out, 0, 1)

# ----------------------------------------------------------------------------- the stocks
STOCKS = json.load(open(__file__.replace('filmlab.py', 'stocks.json')))

def lut(stock):
    g = np.linspace(0, 1, N)
    b, gg, r = np.meshgrid(g, g, g, indexing='ij')           # b slowest, r fastest
    x = np.stack([r.ravel(), gg.ravel(), b.ravel()], 1)
    y = develop(x, STOCKS[stock])
    return y.reshape(N, N, N, 3)                              # [b][g][r]

def write_lut(stock, path):
    from PIL import Image
    y = lut(stock)
    # Strip: x = b * N + r, y = g.
    img = np.zeros((N, N * N, 3), np.uint8)
    for bi in range(N):
        img[:, bi * N:(bi + 1) * N, :] = np.round(y[bi] * 255).astype(np.uint8)
    Image.fromarray(img).save(path, optimize=True)

def apply_image(img, stock):
    a = np.asarray(img.convert('RGB'), np.float32) / 255.0
    h, w, _ = a.shape
    return (develop(a.reshape(-1, 3), STOCKS[stock]).reshape(h, w, 3) * 255).round().astype(np.uint8)

if __name__ == '__main__':
    from PIL import Image, ImageDraw
    cmd = sys.argv[1]
    if cmd == 'luts':
        import os
        out = sys.argv[2]; os.makedirs(out, exist_ok=True)
        for s in STOCKS:
            write_lut(s, f'{out}/{s}.png')
        print(len(STOCKS), 'LUTs')
    elif cmd == 'preview':
        src, dst = sys.argv[2], sys.argv[3]
        names = sys.argv[4:] or list(STOCKS)
        im = Image.open(src).convert('RGB')
        im.thumbnail((360, 360))
        w, h = im.size
        cols = 6
        rows = (len(names) + 1 + cols - 1) // cols
        sheet = Image.new('RGB', (cols * w, rows * (h + 16)), 'black')
        d = ImageDraw.Draw(sheet)
        for i, n in enumerate(['original'] + names):
            t = im if n == 'original' else Image.fromarray(apply_image(im, n))
            x, y = (i % cols) * w, (i // cols) * (h + 16)
            sheet.paste(t, (x, y + 16)); d.text((x + 3, y + 2), n, fill='white')
        sheet.save(dst, quality=88)

"""FilmCam Fuji lab: Fujifilm film simulations and recipes, baked into the app's 3D LUTs.

    python3 fujilab.py fetch                         # Fujifilm's official F-Log2 LUTs (not in git)
    python3 fujilab.py luts <out dir>                # assets/luts/fx_<recipe>.png
    python3 fujilab.py preview <image> <out.jpg> [recipe ...]

How a Fujifilm camera makes a JPEG, and how this follows it:
  1. The sensor's linear light is white balanced (preset or Kelvin, plus the R/B shift) and
     exposed; DR200/DR400 under-expose and lift the curve to save highlights.
  2. The film simulation maps scene light to the picture: its own tone curve and its own
     colour (hue shifts, saturation by hue and by brightness). Fujifilm publishes these as
     3D LUTs from F-Log2 (scene light in F-Gamut) to BT.709, one per simulation; `fetch`
     downloads them and they are the ground truth used here.
  3. The recipe's settings shape the result: Highlight and Shadow tone bend the curve, Color
     sets saturation, Color Chrome Effect deepens strongly coloured areas (more tonal steps,
     less clipping), Color Chrome FX Blue does the same for blues. Grain, clarity and
     sharpness are spatial: they are the look's shader settings, not part of the LUT.

A phone hands us a finished picture, not sensor data. Phones render close to Fujifilm's
neutral PROVIA (a standard, saturated, mid-contrast curve), so the picture is read as a
PROVIA rendering and inverted through Fujifilm's own PROVIA LUT to recover the scene light.
Developing that through PROVIA gives the phone's picture back; every other simulation
differs from it exactly as it does on a Fujifilm camera.

NOSTALGIC NEG. and PRO Neg. Hi have no published LUT: they are built from their nearest
published relatives (see SIM_DERIVED). The recipes come from Fuji X Weekly
(fujixweekly.com, Ritchie Roesch and contributors).
"""
import json, os, sys, urllib.request, zipfile
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from filmlab import srgb_to_lin, lin_to_srgb, lin_to_oklab, oklab_to_lin, N  # noqa: E402

CACHE = os.path.join(HERE, '.fuji-cache')
LUT_ZIP = 'https://dl.fujifilm-x.com/support/lut/gfx-eterna-55-3d-lut-v110.zip'
SIM_FILES = {
    'PROVIA': 'PROVIA', 'VELVIA': 'Velvia', 'ASTIA': 'ASTIA', 'CLASSIC_CHROME': 'CLASSIC-CHROME',
    'CLASSIC_NEG': 'CLASSIC-Neg.', 'REALA_ACE': 'REALA-ACE', 'PRO_NEG_STD': 'PRO-Neg.Std',
    'ETERNA': 'ETERNA', 'ETERNA_BB': 'ETERNA-BB', 'ACROS': 'ACROS',
}

# ----------------------------------------------------------------------------- F-Log2 / F-Gamut
FL2 = dict(a=5.555556, b=0.064829, c=0.245281, d=0.384316, e=8.799461, f=0.092864, cut1=0.000889, cut2=0.100686685370811)

def flog2(x):
    p = FL2
    return np.where(x >= p['cut1'], p['c'] * np.log10(p['a'] * np.maximum(x, p['cut1']) + p['b']) + p['d'], p['e'] * x + p['f'])

def flog2_inv(v):
    p = FL2
    return np.where(v >= p['cut2'], (10.0 ** ((v - p['d']) / p['c']) - p['b']) / p['a'], (v - p['f']) / p['e'])

M709_2020 = np.array([[0.6274040, 0.3292820, 0.0433136], [0.0690970, 0.9195400, 0.0113612], [0.0163916, 0.0880132, 0.8955950]])
M2020_709 = np.linalg.inv(M709_2020)

# ----------------------------------------------------------------------------- LUT plumbing
def fetch():
    os.makedirs(CACHE, exist_ok=True)
    z = os.path.join(CACHE, 'fuji.zip')
    for attempt in range(4):
        if os.path.exists(z):
            break
        print('downloading', LUT_ZIP)
        try:
            urllib.request.urlretrieve(LUT_ZIP, z + '.part')
            os.replace(z + '.part', z)
        except OSError as e:
            print('  retrying:', e)
    with zipfile.ZipFile(z) as f:
        for name in f.namelist():
            n = name.replace('\\', '/')
            if '/33Grid/F-Log2/' in n and n.endswith('.cube'):
                with open(os.path.join(CACHE, os.path.basename(n)), 'wb') as out:
                    out.write(f.read(name))
    print('ok:', sorted(p for p in os.listdir(CACHE) if p.endswith('.cube')))

def load_cube(path):
    rows, n = [], None
    for line in open(path):
        s = line.strip()
        if s.startswith('LUT_3D_SIZE'):
            n = int(s.split()[1])
        elif s and (s[0].isdigit() or s[0] in '-.'):
            rows.append([float(v) for v in s.split()])
    return np.array(rows, np.float64).reshape(n, n, n, 3)   # [b][g][r]: red runs fastest

_sims = {}
def sim_lut(sim):
    if sim not in _sims:
        path = os.path.join(CACHE, f'FLog2_to_{SIM_FILES[sim]}_33grid_V.1.00.cube')
        if not os.path.exists(path):
            sys.exit(f'{path} missing: run "python3 fujilab.py fetch" first')
        _sims[sim] = load_cube(path)
    return _sims[sim]

def trilinear(lut, rgb):
    n = lut.shape[0]
    p = np.clip(rgb, 0, 1) * (n - 1)
    i0 = np.clip(np.floor(p).astype(int), 0, n - 2)
    f = p - i0
    r0, g0, b0 = i0[:, 0], i0[:, 1], i0[:, 2]
    fr, fg, fb = f[:, 0:1], f[:, 1:2], f[:, 2:3]
    L = lambda db, dg, dr: lut[b0 + db, g0 + dg, r0 + dr]
    c0 = (L(0, 0, 0) * (1 - fr) + L(0, 0, 1) * fr) * (1 - fg) + (L(0, 1, 0) * (1 - fr) + L(0, 1, 1) * fr) * fg
    c1 = (L(1, 0, 0) * (1 - fr) + L(1, 0, 1) * fr) * (1 - fg) + (L(1, 1, 0) * (1 - fr) + L(1, 1, 1) * fr) * fg
    return c0 * (1 - fb) + c1 * fb

# ----------------------------------------------------------------------------- phone -> scene
def _lm(lut, y, x, iters, h=0.002):
    """Levenberg-Marquardt on F-Log2 codes: trilinear(lut, x) -> y."""
    lam = np.full(len(y), 1e-3)
    f = trilinear(lut, x) - y
    cost = (f * f).sum(1)
    for _ in range(iters):
        J = np.zeros((len(y), 3, 3))
        for k in range(3):
            xp = x.copy(); xp[:, k] = np.minimum(xp[:, k] + h, 1)
            xm = x.copy(); xm[:, k] = np.maximum(xm[:, k] - h, 0)
            J[:, :, k] = (trilinear(lut, xp) - trilinear(lut, xm)) / np.maximum(xp[:, k] - xm[:, k], 1e-6)[:, None]
        JT = np.transpose(J, (0, 2, 1))
        g = (JT @ f[:, :, None])[:, :, 0]
        dx = np.clip(-np.linalg.solve(JT @ J + lam[:, None, None] * np.eye(3), g[:, :, None])[:, :, 0], -0.03, 0.03)
        xn = np.clip(x + dx, 0, 1)
        fn = trilinear(lut, xn) - y
        cn = (fn * fn).sum(1)
        ok = cn < cost
        x[ok], f[ok], cost[ok] = xn[ok], fn[ok], cn[ok]
        lam = np.where(ok, lam * 0.3, lam * 4.0)
    return x, np.sqrt(cost)

def invert(lut, y, steps=16):
    """F-Log2 codes that the sim renders as y. Each colour is walked out from its grey, so the
    solver follows the right branch (a direct solve finds false minima for strong colours)."""
    grey = np.repeat(y.mean(1, keepdims=True), 3, 1)
    codes = np.linspace(0, 1, 4097)
    neu = trilinear(lut, np.repeat(codes[:, None], 3, 1)).mean(1)
    neu = np.maximum.accumulate(neu + np.arange(len(codes)) * 1e-12)
    x = np.repeat(np.interp(grey[:, 0], neu, codes)[:, None], 3, 1)
    x, _ = _lm(lut, grey, x, 20)
    for s in range(1, steps + 1):
        x, err = _lm(lut, grey + s / steps * (y - grey), x, 8 if s < steps else 40)
    return x, err

def grid():
    g = np.linspace(0, 1, N)
    b, gg, r = np.meshgrid(g, g, g, indexing='ij')           # b slowest, r fastest
    return np.stack([r.ravel(), gg.ravel(), b.ravel()], 1)

_scene = None
def phone_scene():
    """Scene light (linear BT.2020, grey = 0.18) behind each LUT grid colour."""
    global _scene
    if _scene is None:
        path = os.path.join(CACHE, 'provia-inverse.npy')
        if os.path.exists(path):
            x = np.load(path)
        else:
            x, err = invert(sim_lut('PROVIA'), grid())
            print('PROVIA inverse: 99% of colours within', round(float(np.percentile(err, 99)), 4))
            np.save(path, x)
        _scene = flog2_inv(x)
    return _scene

# ----------------------------------------------------------------------------- the camera
def planck_rgb(k):
    """Linear BT.709 colour of a black body at k kelvin, green = 1 (Kim et al. fit)."""
    t = float(k)
    x = (-3.0258469e9 / t**3 + 2.1070379e6 / t**2 + 0.2226347e3 / t + 0.240390) if t >= 4000 else \
        (-0.2661239e9 / t**3 - 0.2343589e6 / t**2 + 0.8776956e3 / t + 0.179910)
    if t >= 4000:
        y = 3.0817580 * x**3 - 5.87338670 * x**2 + 3.75112997 * x - 0.37001483
    elif t >= 2222:
        y = -0.9549476 * x**3 - 1.37418593 * x**2 + 2.09137015 * x - 0.16748867
    else:
        y = -1.1063814 * x**3 - 1.34811020 * x**2 + 2.18555832 * x - 0.20219683
    X, Z = x / y, (1 - x - y) / y
    rgb = np.array([[3.2404542, -1.5371385, -0.4985314], [-0.9692660, 1.8760108, 0.0415560],
                    [0.0556434, -0.2040259, 1.0572252]]) @ np.array([X, 1.0, Z])
    return rgb / rgb[1]

# The phone balances its pictures to neutral; read that as daylight.
REFERENCE_K = 5500
WB_PRESETS = {'auto': None, 'auto_white': None, 'daylight': None, 'shade': 7500, 'incandescent': 3000,
              'fluorescent1': 6500, 'fluorescent2': 3600, 'fluorescent3': 4200}

def wb_gains(wb, shift):
    """Channel gains (linear BT.709) for a white balance setting and its R/B shift.
    A camera set to k kelvin renders daylight as daylight/k: below daylight it goes blue,
    above it amber. One shift step is about 2% on that channel."""
    g = np.ones(3)
    k = WB_PRESETS.get(wb, wb) if isinstance(wb, str) else wb
    if k:
        # A sensor's channels overlap more than sRGB's primaries, so a camera's kelvin steps
        # move colour less than a pure black-body ratio would: 0.6 of it, matched by eye to
        # Fujifilm results at the recipes' settings.
        g = (planck_rgb(REFERENCE_K) / planck_rgb(k)) ** 0.6
    if isinstance(wb, str) and wb.startswith('fluorescent'):
        g = g * np.array([1.0, 0.95, 1.0])                   # the preset's magenta (anti-green) bias
    g = g * np.array([np.exp(0.02 * shift[0]), 1.0, np.exp(0.02 * shift[1])])
    return g / g[1]

def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)

# DR200 / DR400 hold one / two more stops of highlights, so the curve above grey is softer.
# Fujifilm's video LUTs already carry that much range, so they stand for DR400 here.
DR_HIGHLIGHT = {100: 1.0, 200: 0.5, 400: 0.0, 'auto': 0.5, 'P': -1.5}
DR_SHADOW = {'P': -1.5}

def tone(lin2020, highlight, shadow):
    """Highlight and Shadow tone: the curve bent in stops above and below grey, colour kept.
    +H brighter, harder highlights; +S deeper shadows (Fujifilm's sign convention)."""
    Y = np.maximum(lin2020 @ np.array([0.2627, 0.6780, 0.0593]), 1e-7)
    s = np.log2(Y / 0.18)
    ds = highlight * 0.30 * smoothstep(-0.5, 3.5, s) - shadow * 0.30 * smoothstep(0.0, 5.0, -s)
    return lin2020 * np.exp2(ds)[:, None]

def oklch(rgb):
    lab = lin_to_oklab(np.maximum(srgb_to_lin(rgb), 0))
    return lab[:, 0], np.hypot(lab[:, 1], lab[:, 2]), np.arctan2(lab[:, 2], lab[:, 1])

def from_oklch(L, C, h):
    lin = oklab_to_lin(np.stack([L, C * np.cos(h), C * np.sin(h)], 1))
    # Out-of-gamut colours slide toward the grey of the same lightness instead of clipping.
    grey = np.repeat(np.clip(L, 0, 1)[:, None] ** 3, 3, 1)
    d = lin - grey
    with np.errstate(divide='ignore', invalid='ignore'):
        up = np.where(d > 1e-7, (1.0 - grey) / d, np.inf)
        dn = np.where(d < -1e-7, (0.0 - grey) / d, np.inf)
    k = np.clip(np.minimum(up.min(1), dn.min(1)), 0, 1)[:, None]
    return lin_to_srgb(np.clip(grey + d * k, 0, 1))

def hue_weight(h, centre_deg, width_deg):
    d = (np.degrees(h) - centre_deg + 540) % 360 - 180
    return np.exp(-0.5 * (d / width_deg) ** 2)

def colour(out, r):
    """Color, Color Chrome Effect and Color Chrome FX Blue, after the simulation."""
    L, C, h = oklch(out)
    c = r.get('color', 0)
    C = C * (1 + (0.05 if c > 0 else 0.09) * c)
    # Color Chrome Effect: strongly coloured areas go deeper (darker, denser) so they keep
    # their gradation instead of flattening into one saturated patch.
    cce = {'off': 0, 'weak': 0.5, 'strong': 1.0}[r.get('cce', 'off')]
    if cce:
        w = smoothstep(0.05, 0.19, C) * (0.35 + 0.65 * smoothstep(0.3, 0.85, L))
        L = L - 0.055 * cce * w
        C = C * (1 + 0.06 * cce * w)
    # Color Chrome FX Blue: the same for blues, like a polariser on the sky.
    ccb = {'off': 0, 'weak': 0.5, 'strong': 1.0}[r.get('ccb', 'off')]
    if ccb:
        w = hue_weight(h, 255, 28) * smoothstep(0.03, 0.12, C)
        L = L - 0.07 * ccb * w
        C = C * (1 + 0.12 * ccb * w)
    return from_oklch(L, C, h)

# Simulations without a published LUT, built from their nearest relatives.
def nostalgic(out):
    """NOSTALGIC NEG. (1970s 'American New Color'): soft, rich shadows, warm amber
    highlights, saturated mid-tones, reds leaning orange."""
    L, C, h = oklch(out)
    hi = smoothstep(0.45, 0.95, L)
    a, b = C * np.cos(h), C * np.sin(h)
    a = a + 0.013 * hi
    b = b + 0.019 * hi + 0.005 * (1 - hi)
    C2, h2 = np.hypot(a, b), np.arctan2(b, a)
    C2 = C2 * (1.05 + 0.05 * (1 - hi))
    h2 = h2 + np.radians(6) * hue_weight(h2, 30, 25)            # reds toward orange
    return from_oklch(L, C2, h2)

SIM_DERIVED = {
    # sim: (published base, extra highlight tone, extra shadow tone, post step)
    'NOSTALGIC_NEG': ('PRO_NEG_STD', -0.5, -1.0, nostalgic),
    'PRO_NEG_HI': ('PRO_NEG_STD', 0.5, 1.5, lambda o: from_oklch(*_scale_c(oklch(o), 1.06))),
}

def _scale_c(lch, k):
    L, C, h = lch
    return L, C * k, h

ACROS_FILTERS = {None: [1, 1, 1], 'Ye': [1.1, 1.0, 0.45], 'R': [1.35, 0.75, 0.3], 'G': [0.75, 1.15, 0.65]}

def develop(scene2020, r):
    """Scene light (linear BT.2020) -> the recipe's picture (display RGB)."""
    sim = r['sim']
    base, h_extra, s_extra, post = SIM_DERIVED.get(sim, (sim, 0.0, 0.0, None))
    lin709 = scene2020 @ M2020_709.T
    lin709 = lin709 * wb_gains(r.get('wb', 'auto'), r.get('wb_shift', [0, 0]))
    if sim == 'ACROS':
        f = np.array(ACROS_FILTERS[r.get('filter')], float)
        lin709 = lin709 * f / (f @ np.array([0.2126, 0.7152, 0.0722]))
    lin709 = lin709 * 2.0 ** r.get('ev', 0.0)
    lin = lin709 @ M709_2020.T
    dr = r.get('dr', 400)
    lin = tone(lin, r.get('highlight', 0) + DR_HIGHLIGHT[dr] + h_extra, r.get('shadow', 0) + DR_SHADOW.get(dr, 0) + s_extra)
    out = trilinear(sim_lut(base), np.clip(flog2(lin), 0, 1))
    if post:
        out = post(out)
    if sim != 'ACROS':
        out = colour(out, r)
    return out

RECIPES = json.load(open(os.path.join(HERE, 'recipes.json')))

def bake(r):
    scene = phone_scene()
    out = develop(scene, r)
    # Fujifilm's video curves stop just short of code white and above black: a JPEG doesn't.
    lo = develop(phone_scene()[:1], r).min()
    hi = develop(phone_scene()[-1:], r).max()
    return np.clip((out - lo) / (hi - lo), 0, 1)

def write_lut(rid, path):
    from PIL import Image
    y = bake(RECIPES[rid]).reshape(N, N, N, 3)                 # [b][g][r]
    img = np.zeros((N, N * N, 3), np.uint8)
    for bi in range(N):
        img[:, bi * N:(bi + 1) * N, :] = np.round(y[bi] * 255).astype(np.uint8)
    Image.fromarray(img).save(path, optimize=True)

def apply_lut(a, rid):
    """Applies the baked recipe to an image array (H, W, 3) in 0..1, as the shader does."""
    lut = bake(RECIPES[rid]).reshape(N, N, N, 3)
    h, w, _ = a.shape
    return trilinear(lut, a.reshape(-1, 3)).reshape(h, w, 3)

# ----------------------------------------------------------------------------- the app's side
GRAIN = {'off': 0.0, 'weak': 0.22, 'strong': 0.36}
GRAIN_SIZE = {'small': 0.8, 'large': 1.35}

def look_args(r):
    """Shader settings for the recipe's spatial parts: Grain Effect, Clarity, Sharpness."""
    g, size = r.get('grain', ['off', 'small'])
    sharp = r.get('sharpness', 0)
    return dict(grain=GRAIN[g], grainSize=GRAIN_SIZE[size], clarity=round(r.get('clarity', 0) * 0.1, 3),
                sharpness=round(max(sharp, 0) * 0.12, 3), softness=round(max(-sharp, 0) * 0.06, 3),
                halation=r.get('halation', 0.0))

def swatch(rid):
    lut = bake(RECIPES[rid]).reshape(N, N, N, 3)
    c = trilinear(lut, np.array([[0.85, 0.6, 0.45]]))[0]
    return '0xFF' + ''.join(f'{int(round(v * 255)):02X}' for v in c)

def kotlin(path):
    def f(v):
        return f'{float(v)}f'
    stocks, cams = [], []
    for rid, r in RECIPES.items():
        sid = f'fx_{rid}'
        mono = r['sim'] == 'ACROS'
        stocks.append(f'        FilmStock(id = "{sid}", name = "{r["name"]}", colorGrain = {"0f" if mono else "0.12f"}, '
                      f'monochrome = {str(mono).lower()}, swatch = {swatch(rid)}),')
        a = look_args(r)
        cat = 'FUJI' if r.get('kind') != 'recipe' else 'FUJI_RECIPE'
        sub = r['about'] if cat == 'FUJI' else f"{SIM_NAMES[r['sim']]} · {r['about']}"
        cams.append(f'        FilmCamera("{sid}", "{r["name"]}", "{sub}", CameraCategory.{cat}, FilmLook(\n'
                    f'            stock = FilmStocks.byId("{sid}"), halation = {f(a["halation"])}, bloom = 0f, vignette = 0f, aberration = 0f,\n'
                    f'            grain = {f(a["grain"])}, grainSize = {f(a["grainSize"])}, clarity = {f(a["clarity"])}, '
                    f'sharpness = {f(a["sharpness"])}, softness = {f(a["softness"])})),')
    src = f"""package app.filmcam.film

// Generated by tools/film-lab/fujilab.py from recipes.json: edit those, then run
//   python3 fujilab.py kotlin ../../app/src/main/java/app/filmcam/film/FujiRecipes.kt

/**
 * Fujifilm film simulations and Film Simulation Recipes (Fuji X Weekly). Their colour is in
 * the LUTs (luts/fx_*.png), developed through Fujifilm's own simulation data; grain, clarity
 * and sharpness are the recipe's Grain Effect, Clarity and Sharpness.
 */
object FujiRecipes {{
    val STOCKS: List<FilmStock> = listOf(
{chr(10).join(stocks)}
    )

    val CAMERAS: List<FilmCamera> by lazy {{
        listOf(
{chr(10).join('    ' + c.replace(chr(10), chr(10) + '    ') for c in cams)}
        )
    }}
}}
"""
    open(path, 'w').write(src)

SIM_NAMES = {'PROVIA': 'Provia', 'VELVIA': 'Velvia', 'ASTIA': 'Astia', 'CLASSIC_CHROME': 'Classic Chrome',
             'CLASSIC_NEG': 'Classic Neg.', 'NOSTALGIC_NEG': 'Nostalgic Neg.', 'REALA_ACE': 'Reala Ace',
             'PRO_NEG_STD': 'Pro Neg. Std', 'PRO_NEG_HI': 'Pro Neg. Hi', 'ETERNA': 'Eterna',
             'ETERNA_BB': 'Bleach Bypass', 'ACROS': 'Acros'}

def tiles(src, out):
    """Look tiles: the same lake crop as the other looks' tiles, through each recipe."""
    from PIL import Image
    im = Image.open(src).convert('RGB')
    w, h = im.size
    cw = int(h * 198 / 264)
    im = im.crop(((w - cw) // 2, 0, (w - cw) // 2 + cw, h)).resize((198, 264), Image.LANCZOS)
    a = np.asarray(im, np.float64) / 255
    for rid in RECIPES:
        t = Image.fromarray((apply_lut(a, rid) * 255).round().astype(np.uint8))
        t.save(os.path.join(out, f'fx_{rid}.jpg'), quality=88)

if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'fetch':
        fetch()
    elif cmd == 'luts':
        out = sys.argv[2]
        os.makedirs(out, exist_ok=True)
        for rid in RECIPES:
            write_lut(rid, os.path.join(out, f'fx_{rid}.png'))
        print(len(RECIPES), 'Fujifilm LUTs')
    elif cmd == 'kotlin':
        kotlin(sys.argv[2])
    elif cmd == 'tiles':
        tiles(sys.argv[2], sys.argv[3])
    elif cmd == 'preview':
        from PIL import Image, ImageDraw
        src, dst = sys.argv[2], sys.argv[3]
        names = sys.argv[4:] or list(RECIPES)
        im = Image.open(src).convert('RGB')
        im.thumbnail((420, 420))
        a = np.asarray(im, np.float64) / 255
        w, h = im.size
        cols = min(5, len(names) + 1)
        rows = (len(names) + 1 + cols - 1) // cols
        sheet = Image.new('RGB', (cols * w, rows * (h + 16)), 'black')
        d = ImageDraw.Draw(sheet)
        for i, n in enumerate(['phone'] + names):
            t = im if n == 'phone' else Image.fromarray((apply_lut(a, n) * 255).round().astype(np.uint8))
            x, y = (i % cols) * w, (i // cols) * (h + 16)
            sheet.paste(t, (x, y + 16))
            d.text((x + 3, y + 2), n if n == 'phone' else RECIPES[n]['name'], fill='white')
        sheet.save(dst, quality=90)

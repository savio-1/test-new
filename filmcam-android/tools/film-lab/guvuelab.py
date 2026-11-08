"""FilmCam GuVue lab: the GuVue LUT looks (guvueluts.com), measured from the frames on its shop.

    python3 guvuelab.py fetch                 # the shop's before/after frames (not in git)
    python3 guvuelab.py check [look ...]      # accuracy on frames (or halves) left out of the fit
    python3 guvuelab.py luts <out dir> [look ...]    # assets/luts/gv_<look>.png
    python3 guvuelab.py tiles <tile.jpg> <out dir>   # assets/looks/gv_<look>.jpg
    python3 guvuelab.py preview <out dir> [look ...] # before | fitted | GuVue, per frame
    python3 guvuelab.py kotlin <GuVueLooks.kt> <looks dir>  # the looks, swatches from the tiles

GuVue sells two packs and shows each look on its shop:

- HK Series (six looks, HK01-HK06): one Rec.709 frame per look, before and with the look.
  Those are plain pairs, fitted like the Custom looks (customlab.py).
- Film Collection (fourteen looks, F01-F14): two shared scenes (a sunny coastline, a sunset
  street) shown as Apple Log 2 footage and through each look. The shop says the left side is
  unconverted log; its Rec.709 files are for footage "correctly converted to Rec.709". So
  the log frames are converted the way a phone or Apple's own conversion renders log: Apple
  Log decoded (Apple Log 2 keeps Apple Log's curve), Apple Wide Gamut to Rec.709 primaries,
  then a filmic display curve (highlights rolled off, 18% grey near code 0.5, the brightest
  log codes at white) and the Rec.709 display gamma. A plain gamma would put the phone's
  white at 100% reflectance, where the look's highlights are still grey. Then the pairs are
  fitted as Rec.709 pairs. Where the two scenes say nothing, smooth per-channel curves fitted
  to them fill in. (Leaning on the film-lab stock each name points at was tried: it was less
  accurate on the held-out scene for 13 of the 14 looks, and those stocks' bright yellows
  roll off to white, which these looks then tinted grey-lavender.)

GuVue says its examples have no grain, halation or skin smoothing added: these are colour
only. The pictures are GuVue's; only their URLs are kept here. GuVue's own .cube files stay
the exact answer: Looks -> Custom -> Import LUT reads them.
"""
import os, sys, urllib.request
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import customlab as cl  # noqa: E402
from filmlab import N  # noqa: E402

CACHE = os.path.join(HERE, '.guvue-cache')
SHOP = 'https://guvueluts.com/cdn/shop/files/'
CDN = 'https://cdn.shopify.com/s/files/1/0719/3539/3875/files/'

# HK Series: (before, after) on the shop page.
HK = {
    'hk01_amber': ('Amber', 'Amber-Before.jpg?v=1784742029', 'Amber-After.jpg?v=1784741868'),
    'hk02_palegreen': ('Pale Green', '02Green_1.280.2-Before.jpg?v=1784747190', '02Green_1.280.1-After.jpg?v=1784747183'),
    'hk03_harbourblue': ('Harbour Blue', '03Harbour_1.278.1-Before.jpg?v=1784747181', '03Harbour_1.278.2-After.jpg?v=1784747411'),
    'hk04_islandcyan': ('Island Cyan', '04Cyan_1.281.1-Before.jpg?v=1784747196', '04Cyan_1.281.2-After.jpg?v=1784747195'),
    'hk05_avenuestar': ('Avenue Star', '05_1.283.2-Before.jpg?v=1784747628', '05_1.283.1-After.jpg?v=1784747630'),
    'hk06_mongkok': ('Mong Kok', '06MongKok_1.282.2-Before.jpg?v=1784747193', '06MongKok_1.282.3-After.jpg?v=1784747187'),
}

# Film Collection: number and name.
FILM = {
    'f01_gold': ('01', 'G200 Gold'),
    'f02_warm': ('02', 'P400 Warm'),
    'f03_cream': ('03', 'CS400D Cream'),
    'f04_matcha': ('04', 'P160 Matcha'),
    'f05_clear': ('05', '160NC Clear'),
    'f06_soft': ('06', '400H Soft'),
    'f07_coolgreen': ('07', 'S400 Cool Green'),
    'f08_fresh': ('08', '160NS Fresh'),
    'f09_winter': ('09', 'E100 Winter'),
    'f10_coolblue': ('10', 'CS800T Cool Blue'),
    'f11_cinema': ('11', '250D Cinema'),
    'f12_daylight': ('12', 'Ektar Daylight'),
    'f13_documentary': ('13', 'P800 Documentary'),
    'f14_vintage': ('14', 'Lomo92 Vintage'),
}
SCENES = ['n01c0', 'n06c3']

LOOKS = list(HK) + list(FILM)

# What each look is for, after GuVue's own descriptions.
ABOUT = {
    'hk01_amber': 'Warm amber highlights, clean blue shadows: rainy city nights',
    'hk02_palegreen': 'Soft pale-green shadows, muted highlights: overcast streets',
    'hk03_harbourblue': 'Clean harbour blues, restrained contrast, cool haze',
    'hk04_islandcyan': 'Fresh cyan, luminous highlights, relaxed summer contrast',
    'hk05_avenuestar': 'Warm city highlights, balanced night contrast, a soft glow',
    'hk06_mongkok': 'Dense colour, vivid neon, energetic contrast',
    'f01_gold': 'Amber warmth, cool blue shadows',
    'f02_warm': 'Honey-gold highlights, quiet warmth',
    'f03_cream': 'Creamy highlights, soft and bright',
    'f04_matcha': 'Delicate matcha greens, defined tones',
    'f05_clear': 'Clear, cool whites; vivid reds and greens',
    'f06_soft': 'Gentle contrast, lush greens',
    'f07_coolgreen': 'Cool green streets, rich reds and blacks',
    'f08_fresh': 'Fresh, airy colour with soft cyan',
    'f09_winter': 'Winter blues, creamy whites, restrained colour',
    'f10_coolblue': 'Silver-blue city tones, cool depth',
    'f11_cinema': 'Cyan-blue surroundings, peach-warm subjects',
    'f12_daylight': 'Golden daylight, deep greens and blacks',
    'f13_documentary': 'Warm documentary tones, full-bodied reds',
    'f14_vintage': 'Cool shadows, peach warmth, vintage fade',
}


def name(look):
    if look in HK:
        return HK[look][0]
    return FILM[look][1]


def kotlin(path, looks_dir):
    """GuVueLooks.kt: one stock per look (its LUT) and the looks, colour only."""
    from PIL import Image
    stocks, cams = [], []
    for look in LOOKS:
        t = np.asarray(Image.open(os.path.join(looks_dir, f'gv_{look}.jpg')).convert('RGB'), np.float64).reshape(-1, 3)
        r, g, b = (int(v) for v in np.round(np.median(t, 0)))
        sid = f'gv_{look}'
        stocks.append(f'        FilmStock(id = "{sid}", name = "{name(look)}", colorGrain = 0f, monochrome = false, swatch = 0xFF{r:02X}{g:02X}{b:02X}),')
        cat = 'GUVUE_HK' if look in HK else 'GUVUE_FILM'
        code = 'HK' + look[2:4] if look in HK else 'F' + FILM[look][0]
        cams.append(f'            look("{sid}", "{name(look)}", "{code} · {ABOUT[look]}", CameraCategory.{cat}),')
    src = """package app.filmcam.film

// Generated by tools/film-lab/guvuelab.py: edit that, then run
//   python3 guvuelab.py luts ../../app/src/main/assets/luts
//   python3 guvuelab.py tiles <lake tile> ../../app/src/main/assets/looks
//   python3 guvuelab.py kotlin ../../app/src/main/java/app/filmcam/film/GuVueLooks.kt ../../app/src/main/assets/looks

/**
 * GuVue's LUT looks (guvueluts.com): the HK Series (HK01-HK06) and the Film Collection
 * (F01-F14). Each look's colour (luts/gv_*.png) is fitted to the before/after frames on
 * GuVue's shop. GuVue's looks are colour only (no grain, halation or vignette), and so are
 * these. GuVue's own .cube files are the exact looks: Looks -> Custom -> Import LUT.
 */
object GuVueLooks {
    val STOCKS: List<FilmStock> = listOf(
""" + '\n'.join(stocks) + """
    )

    private fun look(id: String, name: String, about: String, category: CameraCategory) = FilmCamera(
        id, name, about, category,
        FilmLook(
            stock = FilmStocks.byId(id), halation = 0f, bloom = 0f, vignette = 0f, aberration = 0f,
            grain = 0f, softness = 0f,
        ),
    )

    val CAMERAS: List<FilmCamera> by lazy {
        listOf(
""" + '\n'.join(cams) + """
        )
    }
}
"""
    with open(path, 'w') as f:
        f.write(src)
    print('wrote', path)


def film_url(name):
    return CDN + 'gv-film-' + name + '.jpg'


def urls():
    out = []
    for _, b, a in HK.values():
        out += [SHOP + b, SHOP + a]
    for s in SCENES:
        out.append(film_url('before-' + s))
        out += [film_url(f'F{n}-{s}') for n, _ in FILM.values()]
    return out


def local(url):
    return os.path.join(CACHE, url.split('/')[-1].split('?')[0])


def fetch():
    os.makedirs(CACHE, exist_ok=True)
    for u in urls():
        p = local(u)
        if os.path.exists(p):
            continue
        req = urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
        with open(p + '.part', 'wb') as f:
            f.write(data)
        os.replace(p + '.part', p)
        print('fetched', p)


def load(url, block):
    from PIL import Image
    im = Image.open(local(url)).convert('RGB')
    a = np.asarray(im, np.float64) / 255.0
    h, w = a.shape[0] // block * block, a.shape[1] // block * block
    return a[:h, :w].reshape(h // block, block, w // block, block, 3).mean((1, 3))

# ----------------------------------------------------------------------------- Apple Log 2 -> Rec.709

# Apple Log (Apple Log Profile White Paper); Apple Log 2 keeps the curve.
_R0, _RT, _C, _B, _G, _D = -0.05641088, 0.01, 47.28711236, 0.00964052, 0.08550479, 0.69336945


def apple_log_decode(p):
    pt = _C * (_RT - _R0) ** 2
    lin = np.where(p >= pt, 2.0 ** ((p - _D) / _G) - _B, np.sqrt(np.maximum(p, 0) / _C) + _R0)
    return np.where(p < 0, _R0, lin)


def _rgb_to_xyz(prim, white=(0.3127, 0.3290)):
    def xyz(x, y):
        return np.array([x / y, 1.0, (1 - x - y) / y])
    P = np.stack([xyz(*p) for p in prim], 1)
    S = np.linalg.solve(P, xyz(*white))
    return P * S


# Apple Wide Gamut (as published with Apple Log 2), and Rec.709; both D65.
AWG = [(0.725, 0.301), (0.221, 0.814), (0.068, -0.076)]
REC709 = [(0.64, 0.33), (0.30, 0.60), (0.15, 0.06)]
AWG_TO_709 = np.linalg.inv(_rgb_to_xyz(REC709)) @ _rgb_to_xyz(AWG)


def filmic(x):
    """A filmic display curve on scene light (Narkowicz's fit of the ACES one)."""
    return np.clip(x * (2.51 * x + 0.03) / (x * (2.43 * x + 0.59) + 0.14), 0, 1)


def log_to_709(a):
    """Apple Log 2 code values -> the Rec.709 picture of them (Rec.709 primaries, a filmic
    roll-off, gamma 2.4), and where it is trustworthy (no light below black)."""
    lin = apple_log_decode(a) @ AWG_TO_709.T
    ok = lin.min(-1) >= -0.002
    return filmic(np.maximum(lin, 0) * 0.8) ** (1 / 2.4), ok

# ----------------------------------------------------------------------------- pairs and fits


def pairs(look, block=8):
    """The look's frames as [(before, after, trusted)], before as a Rec.709 picture."""
    out = []
    if look in HK:
        _, b, a = HK[look]
        x, y = load(SHOP + b, block), load(SHOP + a, block)
        if x.shape != y.shape:
            from PIL import Image
            x = np.asarray(Image.fromarray(np.uint8(np.round(x * 255))).resize(y.shape[1::-1], Image.LANCZOS), np.float64) / 255
        out.append((x, y, np.ones(y.shape[:2], bool)))
    else:
        n = FILM[look][0]
        for s in SCENES:
            x, ok = log_to_709(load(film_url('before-' + s), block))
            out.append((x, load(film_url(f'F{n}-{s}'), block), ok))
    return out


def samples(prs):
    xs, ys = [], []
    for x, y, ok in prs:
        keep = ok & ~((x.max(2) < 0.015) & (y.max(2) < 0.015)) & (y.max(2) < 0.995)
        xs.append(x[keep]); ys.append(y[keep])
    return np.concatenate(xs), np.concatenate(ys)


def fit(look, prs):
    x, y = samples(prs)
    if look in HK:
        return cl.fit(x, y, smooth=8.0)
    return cl.fit(x, y, smooth=8.0)


def check(look):
    prs = pairs(look)
    rows = []
    if len(prs) == 1:
        # One frame: each half from a fit to the other half.
        x, y, ok = prs[0]
        h = x.shape[0] // 2
        halves = [((x[h:], y[h:], ok[h:]), (x[:h], y[:h], ok[:h])), ((x[:h], y[:h], ok[:h]), (x[h:], y[h:], ok[h:]))]
    else:
        halves = [(prs[1], prs[0]), (prs[0], prs[1])]
    for train, test in halves:
        lut = fit(look, [train])
        tx, ty, tok = test
        de = cl.delta_e(cl.apply(lut, tx), ty)[tok]
        rows.append((float(np.median(de)), float(np.median(cl.delta_e(tx, ty)[tok]))))
    print(f'{look}: held-out ΔE median {np.mean([r[0] for r in rows]):.2f} (ungraded {np.mean([r[1] for r in rows]):.2f})', flush=True)
    return rows


def write_lut(look, path):
    from PIL import Image
    y3 = fit(look, pairs(look)).reshape(N, N, N, 3)   # [b][g][r]
    img = np.zeros((N, N * N, 3), np.uint8)
    for bi in range(N):
        img[:, bi * N:(bi + 1) * N, :] = np.round(y3[bi] * 255).astype(np.uint8)
    Image.fromarray(img).save(path, optimize=True)
    os.makedirs(CACHE, exist_ok=True)
    np.save(os.path.join(CACHE, f'{look}.npy'), y3)
    print('wrote', path, flush=True)


def tiles(tile, out):
    """Each look's tile: the shared lake tile through its LUT (colour only, like the looks)."""
    from PIL import Image
    a = np.asarray(Image.open(tile).convert('RGB'), np.float64) / 255
    os.makedirs(out, exist_ok=True)
    for look in LOOKS:
        lut = np.load(os.path.join(CACHE, f'{look}.npy')).reshape(-1, 3)
        b = Image.fromarray(np.uint8(np.round(np.clip(cl.apply(lut, a), 0, 1) * 255)))
        b.resize((198, 264), Image.LANCZOS).save(os.path.join(out, f'gv_{look}.jpg'), quality=88)
    print('wrote tiles', flush=True)


def preview(out, looks):
    from PIL import Image
    os.makedirs(out, exist_ok=True)
    for look in looks:
        lut = np.load(os.path.join(CACHE, f'{look}.npy')).reshape(-1, 3)
        for k, (x, y, _) in enumerate(pairs(look, 4)):
            strip = np.concatenate([x, cl.apply(lut, x), y], 1)
            Image.fromarray(np.uint8(np.round(np.clip(strip, 0, 1) * 255))).save(os.path.join(out, f'{look}_{k}.jpg'), quality=85)
    print('previews in', out)


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'fetch':
        fetch()
    elif cmd == 'check':
        for look in sys.argv[2:] or LOOKS:
            check(look)
    elif cmd == 'luts':
        os.makedirs(sys.argv[2], exist_ok=True)
        for look in sys.argv[3:] or LOOKS:
            write_lut(look, os.path.join(sys.argv[2], f'gv_{look}.png'))
    elif cmd == 'tiles':
        tiles(sys.argv[2], sys.argv[3])
    elif cmd == 'preview':
        preview(sys.argv[2], sys.argv[3:] or LOOKS)
    elif cmd == 'kotlin':
        kotlin(sys.argv[2], sys.argv[3])
    else:
        print(__doc__)

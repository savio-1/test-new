"""FilmCam Genesis lab: Cullen Kelly's Genesis film emulation, fitted from its own frames.

    python3 genesislab.py fetch                   # the published frames (not in git)
    python3 genesislab.py check [look ...]        # accuracy on the half of each frame left out
    python3 genesislab.py luts <out dir> [look ...]   # assets/luts/gn_<look>.png
    python3 genesislab.py preview <out.jpg>       # base | fitted | Genesis, per look
    python3 genesislab.py kotlin <GenesisLooks.kt>    # the app's Genesis looks

cullenkellycolor.com/genesis shows each film stock on a before/after slider: one frame as
Genesis's "Base" rendering and the same frame through the stock (a negative with its print,
or a print stock). Each tab has its own frame: six Kodak negative families, four Fujifilm
negatives, ten Kodak prints and two Fujifilm prints, plus the bleach bypass process. The
pairs are pixel-aligned, so each pixel says where one colour goes, as in customlab.py.

One frame covers only the colours in it, so each stock is fitted on top of a prior that
knows every stock's frame: the lattice fitted to all of them pooled (what Genesis's stocks
share: print-film density, tone and colour separation), moved by smooth 1D curves toward
what this stock does differently, with the stock's own frame deciding wherever it has data.

The pictures are Cullen Kelly Color's; only their URLs are kept here.
"""
import os, sys, urllib.request
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from filmlab import N  # noqa: E402
import customlab  # noqa: E402
from customlab import fit, apply, delta_e  # noqa: E402

CACHE = os.path.join(HERE, '.genesis-cache')
IMG = 'https://framerusercontent.com/images/'

# id, name, what the page labels it, base frame, stock frame (left / right of each slider).
LOOKS = [
    ('vision3', 'Vision3 5203', 'Kodak Vision3 5203 50D + 2383 print', 'xqCB889y95O95MAdGBLaR0jXEI.jpg', 'mkuEaFY9VteXP3lpoSE2Ftzkg.jpg'),
    ('vision2', 'Vision2 5229', 'Kodak Vision2 5229 500T + 2393 print', 's0Co7UNhMVb9JHCtfWVMxDIUtE.jpg', 'cGi8ibfNmQMFayAVTFyumh4CaM.jpg'),
    ('vision', 'Vision 5279', 'Kodak Vision 5279 500T + 2383 print', '5ZddmplcMSaL7m0zQ7z1uZOLLU.jpg', 'AvovJv1OGHVoT3nQoVRJO6c4mA.jpg'),
    ('exr', 'EXR 5287', 'Kodak EXR 5287 + 5386 print', '1rlTxJQLL0TUZHCf33STUKPbF8.jpg', 'qP1wCge8SybdxLrgguj6A6rAjw.jpg'),
    ('ecn2', 'ECN-II 5247', 'Kodak ECN-II 5247 + 5384 print', '3d4OnndFqAvRPfIwTdc5CbalTA.jpg', 'SyXZe3dzx7sCeo5XOjKfwrDaJdA.jpg'),
    ('ecn1', 'ECN-I 5248', 'Kodak ECN-I 5248 + 5382 print', '9zBdQziCUCwy0kVRuTkigpPvqw.jpg', 'XYsSqZVdR9z1z5icbIE4bI1sFo.jpg'),
    ('eterna', 'Eterna 8547', 'Fujifilm Eterna Vivid 8547 500T + 3523 print', 'lO5Jm734KnlhENR4fmpTYyhU4.jpg', 'KmdGW3pHJjN3wKefUp4qUd7wiwI.jpg'),
    ('superf', 'Super-F 8532', 'Fujifilm Super-F 8532 + 3513 print', 'abuYyR2Cz6u6tIMgyzdS3yYQK4.jpg', 'EAtnsckJ5K0eafERZBOg87Jp1w.jpg'),
    ('reala', 'Reala 8592', 'Fujifilm Reala 8592 + 3523 print', 'fU4pEZ8E6cp9kPc7eDMTRHClGiI.jpg', 'f1256AevBlwcihYbgFnkpBA.jpg'),
    ('fujicolora', 'Fujicolor-A 8518', 'Fujicolor-A 8518 + 3523 print', '0ybxShMvwKDJwcD448NZ6CBOk.jpg', 'RbXAFPnhsQbgNCWeBaEnXOK7sg.jpg'),
    ('p2383', '2383 Print', 'Kodak Vision Color 2383 print (1998)', 'stja6LtHPmZwYWjQ3kz2geJ6Ow.jpg', 'NrgsuVQtZMoAWBeVmidOZXipA.jpg'),
    ('p2393', '2393 Print', 'Kodak Vision Premier 2393 print', '0blt1dXDBhrbvfcSnSekuqQt2c.jpg', 'X3jPawPvFl5ObKmyjVZ9J0fAIs.jpg'),
    ('p5386', '5386 Print', 'Kodak 5386 print', 'dfN0QEiRkY2dzIMS1BxJN0c5SlU.jpg', 'ZFgopm4EWxhZThtEoBtArdfbjY.jpg'),
    ('p5384b', '5384 Print (1992)', 'Kodak 5384 print (1992)', 'jYIxJZMHOphvJfphDUNFiKYr20.jpg', 'FBZ24uHD01IID9NcKHWkFYc8c.jpg'),
    ('p5380', '5380 Print', 'Kodak 5380 print', 'JzbDBM34Rpi5vFJqc6IxdafO0.jpg', 'dV1nqSKflENQEkEbrkzxR1Hr2h0.jpg'),
    ('p5384a', '5384 Print (1982)', 'Kodak 5384 print (1982)', 'lAcnfXpMThpEpwRpVHeTbEh1mrw.jpg', 'eDCal2h5XdR2rgBwhySUrBxcW0.jpg'),
    ('p5381b', '5381 Print (1972)', 'Kodak 5381 print (1972)', 'sr4z60Qs8leuWjlQaCg7ljdcfw.jpg', 'HNdsh91eUV7DzM0Oc8POnahyJM.jpg'),
    ('p5385', '5385 Print (1962)', 'Kodak 5385 print (1962)', 'oPwaoXD5lAEbETRPVuqrbXg.jpg', 'I4O8Qu0YFX98MbURMsl3usDubo.jpg'),
    ('p5382', '5382 Print (1952)', 'Kodak 5382 print (1952)', 'j4MZBzMSz1hneaictWkavVnhk.jpg', 'NbfO6Zgnm2ZFigxlBtb8mLvTcc.jpg'),
    ('p5381a', '5381 Print (1950)', 'Kodak 5381 print (1950)', 'eH9oziDe05kszQ73ecHFSHOrJI.jpg', 'AnBL3a9FrVEazN3hUMh8MNRzLw.jpg'),
    ('p3523', 'Fuji 3523 Print', 'Fujifilm Eterna-CP 3523XD print (2010)', 'MVTDQ6tfT7nrE4VhsI9eyow7rfI.jpg', 'RWtTkEI5kNQKxAaqMKHlbmUPg.jpg'),
    ('p3513', 'Fuji 3513 Print', 'Fujifilm 3513 print', 'OsmongTrlTJcydctut5Egms3p4Q.jpg', '3YMcIX7Z2W0f4ypLwjTEPP7alU.jpg'),
    ('bleach', 'Bleach Bypass', 'Genesis bleach bypass (on the default stocks)', 'KFZoGOBtPKwll5EztCgqbMvbKW0.jpg', 'xfJ39vOIej2NJ1NT6nGaLr1pTRI.jpg'),
]
BY_ID = {l[0]: l for l in LOOKS}

# The line under each look's name in the app: the page's own notes where it gives them.
SUBTITLES = {
    'vision3': 'Vision3 50D on 2383: the modern cinema standard, richest colour of Vision3',
    'vision2': 'Vision2 500T on 2393 print: soft, low-contrast 2000s cinema',
    'vision': 'Vision 500T on 2383: late-90s cinema, denser blacks',
    'exr': 'EXR negative on 5386 print: early-90s cinema colour',
    'ecn2': 'ECN-II 100T on 5384 print: warm 1970s-80s colour',
    'ecn1': 'ECN-I negative on 5382 print: muted, early colour cinema',
    'eterna': 'Eterna Vivid 500T on 3523: highest contrast Eterna, strong separation',
    'superf': 'Super-F negative on 3513 print: Fujifilm in the 90s',
    'reala': 'Reala negative on 3523 print: natural Fujifilm colour',
    'fujicolora': 'Fujicolor-A negative on 3523 print: early Fujifilm cine colour',
    'p2383': 'Vision Color 2383: strong mid-tone contrast, rich colour, near-neutral scale',
    'p2393': 'Vision Premier 2393: deeper blacks, more saturated print',
    'p5386': 'Kodak 5386 print (1980s-90s release prints)',
    'p5384b': 'Kodak 5384 print, 1992 version',
    'p5380': 'Kodak 5380 print: soft, lifted blacks',
    'p5384a': 'Kodak 5384 print, 1982 version',
    'p5381b': 'Kodak 5381 print, 1972 version',
    'p5385': 'Kodak 5385 print, 1962: low saturation',
    'p5382': 'Kodak 5382 print, 1952: early Eastmancolor',
    'p5381a': 'Kodak 5381 print, 1950: the first Eastmancolor print',
    'p3523': 'Eterna-CP 3523XD: strong contrast, warmer yellows, richer cyans and blues',
    'p3513': 'Fujifilm 3513 print: the 1990s Fuji release print',
    'bleach': 'Bleach bypass: silver kept in, low saturation, hard contrast',
}
# The prior is pooled from the film stocks only: bleach bypass is a process, not a stock.
STOCKS = [l[0] for l in LOOKS if l[0] != 'bleach']

def local(name):
    return os.path.join(CACHE, name)

def fetch():
    os.makedirs(CACHE, exist_ok=True)
    for l in LOOKS:
        for name in l[3:5]:
            if not os.path.exists(local(name)):
                req = urllib.request.Request(IMG + name, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=60) as r:
                    open(local(name), 'wb').write(r.read())
                print('fetched', name)

def load(name, block=4):
    """The frame in 0..1, block-averaged (grain and JPEG noise average out)."""
    from PIL import Image
    a = np.asarray(Image.open(local(name)).convert('RGB'), np.float64) / 255.0
    h, w = a.shape[0] // block * block, a.shape[1] // block * block
    return a[:h, :w].reshape(h // block, block, w // block, block, 3).mean((1, 3))

def frames(look, block=4):
    l = BY_ID[look]
    return load(l[3], block), load(l[4], block)

def keep(x, y):
    """Letterbox bars and pure black out."""
    k = ~((x.max(-1) < 0.015) & (y.max(-1) < 0.015))
    bars = (x.max((1, 2)) < 0.02) & (y.max((1, 2)) < 0.02)
    k[bars] = False
    return k

def samples(looks, rows=None, block=4):
    xs, ys = [], []
    for look in looks:
        x, y = frames(look, block)
        if rows is not None:
            x, y = x[rows], y[rows]
        k = keep(x, y)
        xs.append(x[k]); ys.append(y[k])
    return np.concatenate(xs), np.concatenate(ys)

_pooled = {}
def pooled(exclude=None):
    """The lattice fitted to every stock's frame (but [exclude]'s)."""
    if exclude not in _pooled:
        x, y = samples([s for s in STOCKS if s != exclude], block=8)
        _pooled[exclude] = fit(x, y, smooth=6.0)
    return _pooled[exclude]

def fit_look(look, rows=None):
    x, y = samples([look], rows)
    return fit(x, y, stock=pooled())

def check(looks):
    """Each half of each frame predicted from a fit to the other half, with the prior pooled
    from the other stocks' frames only (none of this frame)."""
    rows_all = []
    for look in looks:
        x, y = frames(look)
        h = x.shape[0] // 2
        des = []
        for tr, te in ((slice(h, None), slice(0, h)), (slice(0, h), slice(h, None))):
            xs, ys = samples([look], tr)
            prior = pooled(look) if look != 'bleach' else pooled()
            lut = fit(xs, ys, stock=prior)
            k = keep(x[te], y[te])
            de = delta_e(apply(lut, x[te]), y[te])[k]
            de0 = delta_e(x[te], y[te])[k]
            des.append((np.median(de), np.median(de0), np.percentile(de, 90)))
        d = np.mean(des, 0)
        rows_all.append(d)
        print(f'{look:11s} fitted ΔE median {d[0]:.2f}  p90 {d[2]:.2f}   (base {d[1]:.2f})')
    d = np.mean(rows_all, 0)
    print(f'mean median ΔE {d[0]:.2f} (base {d[1]:.2f})')

def write_luts(out, looks):
    from PIL import Image
    os.makedirs(out, exist_ok=True)
    os.makedirs(CACHE, exist_ok=True)
    for look in looks:
        y3 = fit_look(look).reshape(N, N, N, 3)
        img = np.zeros((N, N * N, 3), np.uint8)
        for bi in range(N):
            img[:, bi * N:(bi + 1) * N, :] = np.round(y3[bi] * 255).astype(np.uint8)
        path = os.path.join(out, f'gn_{look}.png')
        Image.fromarray(img).save(path, optimize=True)
        np.save(local(f'{look}.npy'), y3)
        print('wrote', path)

def preview(path, looks):
    from PIL import Image
    rows = []
    for look in looks:
        lut = np.load(local(f'{look}.npy')).reshape(-1, 3)
        x, y = frames(look, 4)
        sp = np.ones((x.shape[0], 4, 3))
        rows.append(np.concatenate([x, sp, apply(lut, x), sp, y], 1))
        rows.append(np.ones((4, rows[-1].shape[1], 3)))
    img = np.concatenate(rows, 0)
    Image.fromarray(np.round(np.clip(img, 0, 1) * 255).astype(np.uint8)).save(path, quality=88)
    print('wrote', path)

def kotlin(path):
    """film/GenesisLooks.kt: a stock (its LUT is assets/luts/gn_<id>.png) and a camera per look.
    Run after luts (the swatches come from the fitted LUTs)."""
    stocks, cams = [], []
    for look, name, label, _, after in LOOKS:
        # The swatch: a skin tone through the stock, as the other looks' swatches are.
        lut = np.load(local(f'{look}.npy')).reshape(-1, 3)
        skin = apply(lut, np.array([[[0.85, 0.6, 0.45]]]))[0, 0]
        sw = ''.join('%02X' % int(round(c * 255)) for c in np.clip(skin, 0, 1))
        stocks.append(f'        FilmStock(id = "gn_{look}", name = "{name}", colorGrain = 0.1f, monochrome = false, swatch = 0xFF{sw},\n'
                      f'            halationColor = HALATION),')
        cams.append(f'            cam("gn_{look}", "{name}", "{SUBTITLES[look]}"),')
    text = f"""package app.filmcam.film

// Generated by tools/film-lab/genesislab.py: edit that, then run
//   python3 genesislab.py luts ../../app/src/main/assets/luts
//   python3 genesislab.py kotlin ../../app/src/main/java/app/filmcam/film/GenesisLooks.kt

/**
 * Genesis (Cullen Kelly, with Dr. Mitch Bogdanowicz and Steve Yedlin): film negatives and
 * prints. Each stock's colour (luts/gn_*.png) is fitted to Genesis's own frame of that stock
 * against its Base frame. Texture: Genesis's default 35 mm grain and its gentle halation,
 * measured from its grain and halation frames.
 */
object GenesisLooks {{
    private val HALATION = Rgb(1f, 0.35f, 0.12f)

    val STOCKS: List<FilmStock> = listOf(
{chr(10).join(stocks)}
    )

    private fun cam(id: String, name: String, subtitle: String) = FilmCamera(
        id, name, subtitle, CameraCategory.GENESIS, FilmLook(
            stock = FilmStocks.byId(id), halation = 0.3f, halationSize = 0.35f, bloom = 0.05f,
            vignette = 0f, aberration = 0f, grain = 0.3f, grainSize = 1.0f, softness = 0f,
        ),
    )

    val CAMERAS: List<FilmCamera> by lazy {{
        listOf(
{chr(10).join(cams)}
        )
    }}
}}
"""
    open(path, 'w').write(text)
    print('wrote', path)

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'fetch':
        fetch()
    elif cmd == 'check':
        check(sys.argv[2:] or [l[0] for l in LOOKS])
    elif cmd == 'luts':
        write_luts(sys.argv[2], sys.argv[3:] or [l[0] for l in LOOKS])
    elif cmd == 'kotlin':
        kotlin(sys.argv[2])
    elif cmd == 'preview':
        preview(sys.argv[2], sys.argv[3:] or [l[0] for l in LOOKS])
    else:
        print(__doc__)

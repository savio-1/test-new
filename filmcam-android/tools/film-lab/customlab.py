"""FilmCam custom lab: a creator's published grade, measured from their own before/after frames.

    python3 customlab.py fetch                       # the published sample pairs (not in git)
    python3 customlab.py check [look ...]            # accuracy on frames (or halves) left out of the fit
    python3 customlab.py luts <out dir> [look ...]   # assets/luts/cu_<look>.png
    python3 customlab.py preview <out dir> [look ...]   # before | fitted | published, per pair

A grade like Sleepy Charlie's Cinecell 02 (a DaVinci Resolve PowerGrade) is published with
before/after pairs: the same frame as a plain Rec.709 picture and as the graded result. Each
pixel pair says where one colour goes, so the colour part of the grade can be measured: a
33^3 lattice is fitted to every pair (trilinear, as the shader samples it), held smooth by
second differences along each axis and, where no sample reaches, pulled toward a global
fit of the same data made of smooth 1D curves (bounded, so saturated colours
stay sane). The grade's spatial parts (grain, halation) are not colour and
are set as the look's shader settings instead.

The pictures are the creator's; only their URLs are kept here.
"""
import json, os, sys, urllib.request
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from filmlab import srgb_to_lin, lin_to_oklab, N  # noqa: E402

CACHE = os.path.join(HERE, '.custom-cache')

# Each look: its sample pairs as (before URL, after URL). The pages label them "Rec.709" and
# the grade's name; which file is which was read from the pictures (the graded one is denser,
# warmer in the highlights and cooler in the shadows).
SC = 'https://images.squarespace-cdn.com/content/69d190076c619b20024053f0/'
DH = 'https://cdn-images.dehancer.com/'

def sc(u):
    return SC + u + '?format=2500w'

# Each look: its sample pairs as (before URL, after URL, crop box or None), and optionally a
# film-lab stock whose LUT stands in where the samples say nothing (see fit()).
LOOKS = {
    'sleepycharlie': dict(
        name='Sleepy Charlie',
        source='Cinecell 02 by Sleepy Charlie (sleepycharlie.com), from its published Rec.709 / graded pairs',
        # The pages label them "Rec.709" and the grade's name; which file is which was read from
        # the pictures (the graded one is denser, warmer in the highlights, cooler in the shadows).
        pairs=[
            (sc('800ed95e-ed19-456c-9c51-909b92eaa93e/1.47.2_1.47.2.jpg'), sc('cb98bf77-93f1-4996-937c-8a073304bb44/1.47.1_1.47.1.jpg'), None),
            (sc('425aac75-e522-405c-a544-ff4c599846ef/1.10.2_1.10.2.jpg'), sc('ebb43567-9050-4fe5-aa8c-b142010d90d3/1.10.1_1.10.1.jpg'), None),
            (sc('e220275e-e8e8-43fc-b062-b22bfe7083dd/1.3.2_1.3.2.jpg'), sc('21e7e519-520e-4721-8bbb-43a67ef07ad0/1.3.1_1.3.1.jpg'), None),
            (sc('1c310154-979f-4139-aba9-a5dd885139fd/1.48.2_1.48.2.jpg'), sc('45448c1c-906c-4a36-bceb-7699ab8fa6a1/1.48.1_1.48.1.jpg'), None),
            (sc('e93edb21-92f9-4b02-8f40-2c7b64599bfc/1.5.1_1.5.1.jpg'), sc('8e4e09fc-f6c4-4f18-81d3-5cbbcf747ff2/1.5.2_1.5.2.jpg'), None),
            (sc('857ee515-1721-4643-88f2-c5df9a0f8237/1.9.2_1.9.2.jpg'), sc('028dd51e-0204-454a-a071-0fe2943deca5/1.9.1_1.9.1.jpg'), None),
            (sc('35b8b748-86f3-4422-89e7-26284f12283b/1.49.2_1.49.2.jpg'), sc('3d7f8e0a-be68-4653-b20d-69f0066181a0/1.49.1_1.49.1.jpg'), None),
            (sc('c7260b08-2a6e-4870-9392-b24637e404fd/1.17.2_1.17.2.jpg'), sc('7ea87a75-db1d-46f2-abc6-b82feaf2e6fb/1.17.1_1.17.1.jpg'), None),
        ],
    ),
    # Dehancer Pro (dehancer.com): its default stock, Kodak Vision3 250D. The plugin screenshot
    # shows one frame with only the camera input converted (right of the split line) and with
    # the 250D profile (Film Developer: contrast 15, gamma 10, colour separation 100, boost 10).
    'dehancer250d': dict(
        name='Dehancer 250D',
        source='Dehancer Pro, Kodak Vision3 250D: the input-only and 250D frames of its plugin screenshots',
        prior='cine250d',
        pairs=[
            (DH + 'ahlUtgeQX7-eWa9__1.png', DH + 'ahlUtgeQX7-eWa-A_2.png', (1173, 40, 1540, 1030)),
        ],
    ),
    # Dehancer's "Film Developer" article, example 4: a Rec.709 source and the finished frame on
    # Kodak Vision3 500T with print, grain and bloom.
    'dehancer500t': dict(
        name='Dehancer 500T',
        source='Dehancer Pro, Kodak Vision3 500T: example 4 of its Film Developer article (Rec.709 source, finished frame)',
        prior='kino500t',
        pairs=[
            (DH + 'Zpo6hB5LeNNTxTMO_28-web.jpg', 'https://images.prismic.io/dehancer-v2/Zpo6hh5LeNNTxTMQ_31-web-1.jpg', None),
        ],
    ),
}

# ----------------------------------------------------------------------------- samples
def local(url):
    import re
    return os.path.join(CACHE, re.sub(r'[^A-Za-z0-9._-]', '_', url.split('?')[0].split('://')[-1]))

def fetch():
    os.makedirs(CACHE, exist_ok=True)
    for look in LOOKS.values():
        for pair in look['pairs']:
            for u in pair[:2]:
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

def load(url, block=4, crop=None):
    """The picture in 0..1, cropped, block-averaged (grain and JPEG noise average out)."""
    from PIL import Image
    im = Image.open(local(url)).convert('RGB')
    if crop:
        im = im.crop(crop)
    a = np.asarray(im, np.float64) / 255.0
    h, w = a.shape[0] // block * block, a.shape[1] // block * block
    return a[:h, :w].reshape(h // block, block, w // block, block, 3).mean((1, 3))

def samples(look, skip=None):
    """Matching (before, after) colours from every pair but [skip], letterbox bars left out."""
    xs, ys = [], []
    for k, (b, a, crop) in enumerate(LOOKS[look]['pairs']):
        if k == skip:
            continue
        x, y = load(b, crop=crop), load(a, crop=crop)
        keep = ~((x.max(2) < 0.015) & (y.max(2) < 0.015))
        # Rows that are black bars in both.
        bars = (x.max((1, 2)) < 0.02) & (y.max((1, 2)) < 0.02)
        keep[bars] = False
        xs.append(x[keep]); ys.append(y[keep])
    return np.concatenate(xs), np.concatenate(ys)

def prior_lut(stock):
    """A film-lab stock's LUT from the app's assets, as lattice rows [b][g][r]."""
    from PIL import Image
    img = np.asarray(Image.open(os.path.join(HERE, '../../app/src/main/assets/luts', stock + '.png')).convert('RGB'), np.float64) / 255
    lut = np.zeros((N, N, N, 3))
    for bi in range(N):
        lut[bi] = img[:, bi * N:(bi + 1) * N]
    return lut.reshape(-1, 3)

# ----------------------------------------------------------------------------- the fit
def trilinear_weights(x):
    """Sparse rows of trilinear weights on the N^3 lattice ([b][g][r] order, as the strip)."""
    import scipy.sparse as sp
    p = np.clip(x, 0, 1) * (N - 1)
    i0 = np.minimum(np.floor(p).astype(int), N - 2)
    f = p - i0
    rows, cols, vals = [], [], []
    n = len(x)
    idx = np.arange(n)
    for dr in (0, 1):
        for dg in (0, 1):
            for db in (0, 1):
                w = (f[:, 0] if dr else 1 - f[:, 0]) * (f[:, 1] if dg else 1 - f[:, 1]) * (f[:, 2] if db else 1 - f[:, 2])
                c = ((i0[:, 2] + db) * N + (i0[:, 1] + dg)) * N + (i0[:, 0] + dr)
                rows.append(idx); cols.append(c); vals.append(w)
    return sp.csr_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(n, N ** 3))

def second_differences():
    import scipy.sparse as sp
    d1 = sp.diags([1.0, -2.0, 1.0], [0, 1, 2], shape=(N - 2, N))
    I = sp.identity(N)
    # Lattice index = (b*N + g)*N + r: r is the fastest axis.
    return sp.vstack([sp.kron(sp.kron(I, I), d1), sp.kron(sp.kron(I, d1), I), sp.kron(sp.kron(d1, I), I)]).tocsr()

KNOTS = 17

def hat_basis(v):
    """Piecewise-linear (hat) basis on KNOTS evenly spaced knots, for values in 0..1."""
    p = np.clip(v, 0, 1) * (KNOTS - 1)
    i0 = np.minimum(np.floor(p).astype(int), KNOTS - 2)
    f = p - i0
    B = np.zeros((len(v), KNOTS))
    B[np.arange(len(v)), i0] = 1 - f
    B[np.arange(len(v)), i0 + 1] += f
    return B

def additive_features(x):
    """Each output channel as a sum of smooth curves of the three input channels."""
    return np.concatenate([hat_basis(x[:, 0]), hat_basis(x[:, 1]), hat_basis(x[:, 2])], 1)

def fit_additive(x, y, w, smooth=3.0):
    """The fallback for colours the samples never reach: sums of 1D curves are bounded by the
    curves themselves, so saturated corners stay sane (a free 3D polynomial does not)."""
    F = additive_features(x) * np.sqrt(w)[:, None]
    d = np.diff(np.eye(KNOTS), 2, axis=0)
    R = np.zeros((3 * (KNOTS - 2), 3 * KNOTS))
    for j in range(3):
        R[j * (KNOTS - 2):(j + 1) * (KNOTS - 2), j * KNOTS:(j + 1) * KNOTS] = d
    lam = smooth * np.sqrt(len(x) / KNOTS)
    A = np.vstack([F, lam * R])
    coef = np.zeros((3 * KNOTS, 3))
    for c in range(3):
        b = np.concatenate([y[:, c] * np.sqrt(w), np.zeros(len(R))])
        coef[:, c] = np.linalg.lstsq(A, b, rcond=None)[0]
    return coef

def lattice_points():
    t = np.linspace(0, 1, N)
    b, g, r = np.meshgrid(t, t, t, indexing='ij')
    return np.stack([r.ravel(), g.ravel(), b.ravel()], 1)

def fit(x, y, smooth=4.0, prior=0.02, reach=2.0, stock=None):
    """The N^3 lattice (rows [b][g][r], rgb) that best maps x to y.

    Where the samples say nothing, it leans on a fallback: smooth 1D curves fitted to the
    samples or, given a film-lab [stock], that stock's LUT moved by the same kind of curves
    fitted to what the samples do differently (so a few frames of one film still give the
    whole colour space a film's behaviour, with the measured look's tone and balance)."""
    import scipy.sparse as sp
    from scipy.sparse.linalg import spsolve
    # Even out how much each region of colour counts: crowded colours (sky, walls) would
    # otherwise outvote the rare ones (skin, signs) that matter as much.
    cell = np.clip((x * 15.999).astype(int), 0, 15)
    key = (cell[:, 0] * 16 + cell[:, 1]) * 16 + cell[:, 2]
    count = np.bincount(key, minlength=4096)
    w = 1.0 / np.sqrt(count[key])
    w *= len(x) / w.sum()

    A = trilinear_weights(x)
    W = sp.diags(w)
    D = second_differences()
    if stock is None:
        base = additive_features(lattice_points()) @ fit_additive(x, y, w)
    else:
        P = prior_lut(stock)
        from fujilab import trilinear
        px = trilinear(P.reshape(N, N, N, 3), x)
        base = P + additive_features(lattice_points()) @ fit_additive(x, y - px, w, smooth=8.0)

    scale = len(x) / N ** 3
    # Lattice points far from any sample lean on the fallback; those among samples on the data.
    mass = A.T @ w
    pull = prior + reach * np.exp(-mass / (0.05 * scale))
    M = (A.T @ W @ A + smooth * scale * (D.T @ D) + scale * sp.diags(pull)).tocsc()
    out = np.zeros((N ** 3, 3))
    for c in range(3):
        rhs = A.T @ (w * y[:, c]) + scale * pull * base[:, c]
        out[:, c] = spsolve(M, rhs)
    return np.clip(out, 0, 1)

def apply(lut, a):
    from fujilab import trilinear
    h, w, _ = a.shape
    return trilinear(lut.reshape(N, N, N, 3), a.reshape(-1, 3)).reshape(h, w, 3)

def delta_e(a, b):
    return np.linalg.norm(lin_to_oklab(srgb_to_lin(a)) - lin_to_oklab(srgb_to_lin(b)), axis=-1) * 100

# ----------------------------------------------------------------------------- commands
def check(look='sleepycharlie'):
    """How close the look gets on pictures it wasn't fitted to: each pair predicted from a fit
    to the others or, with a single pair, each half of the frame from a fit to the other half."""
    stock = LOOKS[look].get('prior')
    pairs = LOOKS[look]['pairs']
    rows = []
    def report(label, lut, bx, ay):
        de = delta_e(apply(lut, bx), ay)
        rows.append((float(np.median(de)), float(np.median(delta_e(bx, ay)))))
        print(f'{label}: fitted ΔE median {rows[-1][0]:.2f}  p90 {np.percentile(de, 90):.2f}   (ungraded {rows[-1][1]:.2f})')
    if len(pairs) == 1:
        b, a, crop = pairs[0]
        bx, ay = load(b, crop=crop), load(a, crop=crop)
        h = bx.shape[0] // 2
        for name, (tr, te) in (('top from bottom', (slice(h, None), slice(0, h))), ('bottom from top', (slice(0, h), slice(h, None)))):
            lut = fit(bx[tr].reshape(-1, 3), ay[tr].reshape(-1, 3), stock=stock)
            report(name, lut, bx[te], ay[te])
    else:
        for k, (b, a, crop) in enumerate(pairs):
            x, y = samples(look, skip=k)
            report(f'pair {k}', fit(x, y, stock=stock), load(b, crop=crop), load(a, crop=crop))
    print('mean median ΔE %.2f (ungraded %.2f)' % (np.mean([r[0] for r in rows]), np.mean([r[1] for r in rows])))

def write_lut(look, path):
    from PIL import Image
    x, y = samples(look)
    y3 = fit(x, y, stock=LOOKS[look].get('prior')).reshape(N, N, N, 3)   # [b][g][r]
    img = np.zeros((N, N * N, 3), np.uint8)
    for bi in range(N):
        img[:, bi * N:(bi + 1) * N, :] = np.round(y3[bi] * 255).astype(np.uint8)
    Image.fromarray(img).save(path, optimize=True)
    np.save(os.path.join(CACHE, f'{look}.npy'), y3)
    print('wrote', path)

def preview(out, look='sleepycharlie'):
    from PIL import Image
    lut = np.load(os.path.join(CACHE, f'{look}.npy')).reshape(-1, 3)
    os.makedirs(out, exist_ok=True)
    for k, (b, a, crop) in enumerate(LOOKS[look]['pairs']):
        bx, ay = load(b, 5, crop), load(a, 5, crop)
        pred = apply(lut, bx)
        strip = np.concatenate([bx, pred, ay], 1)
        Image.fromarray(np.round(np.clip(strip, 0, 1) * 255).astype(np.uint8)).save(os.path.join(out, f'{look}_{k}.jpg'), quality=88)
    print('previews in', out)

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'fetch':
        fetch()
    elif cmd == 'check':
        for look in sys.argv[2:] or LOOKS:
            print('--', look)
            check(look)
    elif cmd == 'luts':
        os.makedirs(sys.argv[2], exist_ok=True)
        for look in sys.argv[3:] or LOOKS:
            write_lut(look, os.path.join(sys.argv[2], f'cu_{look}.png'))
    elif cmd == 'preview':
        for look in sys.argv[3:] or LOOKS:
            preview(sys.argv[2], look)
    else:
        print(__doc__)

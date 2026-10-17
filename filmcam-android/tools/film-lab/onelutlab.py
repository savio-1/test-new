"""FilmCam OneLUT lab: The One LUT (onelut.io), the ARRI Alexa look for Apple Log, fitted
from its own before/after frame and carried over to a phone's normal picture.

    python3 onelutlab.py fetch                  # the published frame pair (not in git)
    python3 onelutlab.py check                  # accuracy on the half of the frame left out
    python3 onelutlab.py luts <out dir>         # assets/luts/cu_onelut.png
    python3 onelutlab.py preview <out.jpg> [photo ...]   # log | fitted | The One LUT; photos before | after

The One LUT turns Apple Log into Rec.709 "matched to ARRI's official Alexa K1S1 Rec 709
LUT". Its site shows one frame both ways: the Apple Log recording and the same frame
through the LUT, pixel for pixel. Apple publishes the Apple Log curve (Rec.2020 primaries),
so the log side is decoded to the scene light it recorded and the LUT is measured as what
it does to scene light:

1. A model shaped like ARRI's rendering, which is what K1S1 is: scene light through a 3x3
   matrix, encoded as ARRI LogC3 (EI 800), then one smooth S-shaped curve applied to each
   channel. Per-channel curves on a wide gamut are what give the Alexa its soft highlight
   roll-off, gentle saturation and how colours bend as they brighten. Fitted to the frame,
   it holds for colours the frame doesn't show.
2. A 33^3 lattice over Apple Log, fitted to the frame's own pixels with (1) filling in
   everywhere the frame says nothing (customlab.fit).

The app's looks start from the phone's finished picture, not from log. So the phone picture
is first taken back to scene light (the inverse of a filmic display curve that keeps 18% grey
at 18%: what a phone's rendering roughly is), encoded as Apple Log, and sent through (2).

The pictures are The One LUT's; only their URL is kept here.
"""
import os, sys, urllib.request
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from filmlab import srgb_to_lin, lin_to_srgb, N  # noqa: E402
import customlab  # noqa: E402
from customlab import fit, apply, delta_e  # noqa: E402

CACHE = os.path.join(HERE, '.onelut-cache')
PAIR = ('https://images.squarespace-cdn.com/content/v1/64537bd7223c52205486af41/'
        'f7110138-3d25-4e73-8d44-679da894a2f8/log+to+one+lut+horizon+transp+2.png?format=2500w')
# The two frames inside that picture: Apple Log on the left, The One LUT on the right.
LOG_BOX = (49, 63, 932, 556)
LUT_BOX = (1569, 63, 2452, 556)

# ----------------------------------------------------------------------------- colour
# Apple Log (Apple Log Profile white paper, 2023): Rec.2020 primaries, scene linear R.
R0, RT, C, B, G, BETA = -0.05641088, 0.01, 47.28711236, 0.00964052, 0.08550479, 0.69336945
PT = C * (RT - R0) ** 2

def applelog_decode(p):
    p = np.asarray(p, np.float64)
    return np.where(p >= PT, 2 ** ((p - BETA) / G) - B, np.sqrt(np.clip(p, 0, None) / C) + R0)

def applelog_encode(r):
    r = np.asarray(r, np.float64)
    return np.where(r >= RT, G * np.log2(np.clip(r, RT, None) + B) + BETA,
                    np.where(r >= R0, C * (np.clip(r, R0, None) - R0) ** 2, 0.0))

# ARRI LogC3, EI 800 (ARRI's "ALEXA Log C Curve" white paper).
LC = dict(cut=0.010591, a=5.555556, b=0.052272, c=0.247190, d=0.385537, e=5.367655, f=0.092809)

def logc3_encode(x):
    k = LC
    x = np.asarray(x, np.float64)
    return np.where(x > k['cut'], k['c'] * np.log10(np.clip(k['a'] * x + k['b'], 1e-9, None)) + k['d'], k['e'] * x + k['f'])

# Rec.2020 <-> Rec.709 (linear, D65).
M2020_709 = np.array([[1.660491, -0.587641, -0.072850],
                      [-0.124550, 1.132900, -0.008349],
                      [-0.018151, -0.100579, 1.118730]])
M709_2020 = np.linalg.inv(M2020_709)

# The phone picture's display curve, as in nolanlab: a filmic curve with 18% grey at 18%.
EXPO = 0.723

def aces(x):
    return np.clip((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0, 1)

def aces_inverse(y):
    y = np.clip(y, 0, 0.999)
    a, b, c = 2.43 * y - 2.51, 0.59 * y - 0.03, 0.14 * y
    return (-b - np.sqrt(b * b - 4 * a * c)) / (2 * a)

def phone_to_scene(rgb):
    """A phone's display picture (sRGB) back to scene light, Rec.709 primaries."""
    return aces_inverse(srgb_to_lin(np.clip(rgb, 0, 1))) / EXPO

# ----------------------------------------------------------------------------- the model
KN = 16                                         # tone-curve knots over LogC 0..1

def tone(v, steps):
    """A monotone curve: positive steps between knots, cumulated, 0 at LogC 0."""
    knots = np.concatenate([[steps[0]], steps[0] + np.cumsum(np.exp(steps[1:]))])
    xs = np.linspace(0, 1, KN)
    return np.interp(np.clip(v, 0, 1), xs, knots[:KN])

def unpack(p):
    M = np.eye(3) + p[:9].reshape(3, 3)
    return M @ M2020_709, p[9:9 + KN]

def model(scene2020, p):
    """Scene light (Rec.2020) -> display Rec.709 code values, ARRI style."""
    M, steps = unpack(p)
    lc = logc3_encode(np.clip(scene2020 @ M.T, 0, None))
    return np.clip(tone(lc, steps), 0, 1)

def fit_model(x2020, y):
    from scipy.optimize import least_squares
    p0 = np.zeros(9 + KN)
    p0[9] = -0.05
    p0[10:] = np.log(np.full(KN - 1, 1.1 / (KN - 1)))
    rng = np.random.default_rng(0)
    i = rng.choice(len(x2020), min(len(x2020), 30000), replace=False)
    xs, ys = x2020[i], y[i]
    def res(p):
        r = (model(xs, p) - ys).ravel()
        reg = 0.02 * np.diff(p[10:], 2)          # a smooth curve
        return np.concatenate([r, reg, 0.05 * p[:9]])
    return least_squares(res, p0, loss='soft_l1', f_scale=0.03, max_nfev=4000).x

# ----------------------------------------------------------------------------- data
def local(name='pair.png'):
    return os.path.join(CACHE, name)

def fetch():
    os.makedirs(CACHE, exist_ok=True)
    if not os.path.exists(local()):
        req = urllib.request.Request(PAIR, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=60) as r:
            open(local(), 'wb').write(r.read())
        print('fetched', local())

def frames(block=2):
    """(Apple Log code values, The One LUT's output), block-averaged."""
    from PIL import Image
    im = Image.open(local()).convert('RGB')
    out = []
    for box in (LOG_BOX, LUT_BOX):
        a = np.asarray(im.crop(box), np.float64) / 255
        h, w = a.shape[0] // block * block, a.shape[1] // block * block
        out.append(a[:h, :w].reshape(h // block, block, w // block, block, 3).mean((1, 3)))
    return out

def lattice_prior(p):
    """The model on the Apple Log lattice: the prior the frame's own fit leans on."""
    t = np.linspace(0, 1, N)
    b, g, r = np.meshgrid(t, t, t, indexing='ij')
    code = np.stack([r.ravel(), g.ravel(), b.ravel()], 1)
    return model(applelog_decode(code), p)

def fit_onelut(log, out):
    """The One LUT on the Apple Log lattice ([b][g][r] rows) and the model's parameters."""
    x, y = log.reshape(-1, 3), out.reshape(-1, 3)
    p = fit_model(applelog_decode(x), y)
    return fit(x, y, stock=lattice_prior(p)), p

# The published frame was brightened before the LUT (a dusk shot: its Apple Log grey comes out
# at 0.66, brighter than any Rec.709 rendering puts it), so the frame fixes the LUT's colour and
# curve shape but not its exposure. The phone's 18% grey is sent to 0.43, where Rec.709 cinema
# renderings put it (and close to the phone's own 0.46): the look changes contrast and colour,
# not brightness.
GREY_OUT = 0.43

def exposure(lut):
    """The gain on scene light that puts 18% grey at GREY_OUT through [lut]."""
    from fujilab import trilinear
    L = lut.reshape(N, N, N, 3)
    lo, hi = -6.0, 4.0                          # stops
    for _ in range(40):
        mid = (lo + hi) / 2
        c = applelog_encode(np.full((1, 3), 0.18 * 2 ** mid))
        if trilinear(L, c).mean() < GREY_OUT: lo = mid
        else: hi = mid
    return 2 ** ((lo + hi) / 2)

def phone_lut(lut):
    """The app's LUT: a phone picture -> scene light -> Apple Log -> The One LUT."""
    t = np.linspace(0, 1, N)
    b, g, r = np.meshgrid(t, t, t, indexing='ij')
    rgb = np.stack([r.ravel(), g.ravel(), b.ravel()], 1)
    code = applelog_encode(exposure(lut) * phone_to_scene(rgb) @ M709_2020.T)
    from fujilab import trilinear
    return neutral(np.clip(trilinear(lut.reshape(N, N, N, 3), np.clip(code, 0, 1)), 0, 1))

def neutral(y):
    """Greys in, greys out. ARRI's rendering keeps the grey scale neutral; the published frame
    was also white-balanced for its dusk light, which the fit takes in as a tint along the grey
    scale. One curve per output channel takes each grey back to its own average."""
    grey = y.reshape(N, N, N, 3)[np.arange(N), np.arange(N), np.arange(N)]   # [b][g][r], r=g=b
    target = grey.mean(1)
    out = np.empty_like(y)
    for c in range(3):
        src = np.maximum.accumulate(grey[:, c]) + np.arange(N) * 1e-9
        out[:, c] = np.interp(y[:, c], src, target)
    return out

# ----------------------------------------------------------------------------- commands
def check():
    log, out = frames()
    h = log.shape[0] // 2
    rows = []
    for tr, te in ((slice(h, None), slice(0, h)), (slice(0, h), slice(h, None))):
        lut, p = fit_onelut(log[tr], out[tr])
        m = model(applelog_decode(log[te]), p)
        f = apply(lut, log[te])
        rows.append((np.median(delta_e(m, out[te])), np.median(delta_e(f, out[te])), np.percentile(delta_e(f, out[te]), 90)))
    d = np.mean(rows, 0)
    print(f'held-out half: ARRI-style model ΔE median {d[0]:.2f};  model + lattice {d[1]:.2f} (p90 {d[2]:.2f})')
    # Neutral stays neutral: greys through the app's LUT.
    lut, _ = fit_onelut(log, out)
    print('exposure into the LUT: %+.2f stops' % np.log2(exposure(lut)))
    g = np.linspace(0.05, 0.95, 10)[:, None].repeat(3, 1)
    from fujilab import trilinear
    y = trilinear(phone_lut(lut).reshape(N, N, N, 3), g)
    print('phone greys ->', ' '.join(f'{a[0]:.2f}' for a in g), '\n             ', ' '.join(f'{v.mean():.2f}' for v in y),
          '\n  max channel spread %.3f' % float((y.max(1) - y.min(1)).max()))

def write_lut(out_dir):
    from PIL import Image
    log, out = frames()
    lut, p = fit_onelut(log, out)
    os.makedirs(CACHE, exist_ok=True)
    np.save(local('applelog.npy'), lut)
    y3 = phone_lut(lut).reshape(N, N, N, 3)
    img = np.zeros((N, N * N, 3), np.uint8)
    for bi in range(N):
        img[:, bi * N:(bi + 1) * N, :] = np.round(y3[bi] * 255).astype(np.uint8)
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, 'cu_onelut.png')
    Image.fromarray(img).save(path, optimize=True)
    np.save(local('phone.npy'), y3)
    print('wrote', path)

def preview(path, photos):
    from PIL import Image
    log, out = frames(2)
    lut = np.load(local('applelog.npy'))
    sp = np.ones((log.shape[0], 6, 3))
    rows = [np.concatenate([log, sp, apply(lut, log), sp, out], 1)]
    phone = np.load(local('phone.npy')).reshape(-1, 3)
    for f in photos:
        im = Image.open(f).convert('RGB')
        w = rows[0].shape[1] // 2 - 3
        im = im.resize((w, int(w * im.size[1] / im.size[0])), Image.LANCZOS)
        a = np.asarray(im, np.float64) / 255
        rows.append(np.concatenate([a, np.ones((a.shape[0], 6, 3)), apply(phone, a)], 1))
    width = max(r.shape[1] for r in rows)
    rows = [np.pad(r, ((0, 6), (0, width - r.shape[1]), (0, 0)), constant_values=1) for r in rows]
    Image.fromarray(np.round(np.clip(np.concatenate(rows, 0), 0, 1) * 255).astype(np.uint8)).save(path, quality=88)
    print('wrote', path)

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'fetch':
        fetch()
    elif cmd == 'check':
        check()
    elif cmd == 'luts':
        write_lut(sys.argv[2])
    elif cmd == 'preview':
        preview(sys.argv[2], sys.argv[3:])
    else:
        print(__doc__)

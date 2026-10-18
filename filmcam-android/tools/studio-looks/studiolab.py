"""The studio looks (the editor's camera-looks pack): colour LUTs, tiles and Kotlin.

looks.json is the pack's own file (shelves and each look's parameters). The colour stage is
the pack's maths (spec/PIPELINE.md step 1), baked into the app's 33^3 LUT strips; every other
parameter becomes a FilmLook field that the final shader renders with the pack's formulas.

  python3 studiolab.py luts  ../../app/src/main/assets/luts            # st_<id>.png strips
  python3 studiolab.py check <pack>/luts/cube                           # vs the pack's .cube files
  python3 studiolab.py tiles <pack>/previews ../../app/src/main/assets/looks
  python3 studiolab.py kotlin ../../app/src/main/java/app/filmcam/film/StudioLooks.kt
"""
import json, math, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
PACK = json.load(open(os.path.join(HERE, 'looks.json')))
N = 33
SKIP = {'original'}            # the app's own Original camera is the same thing
SHELF_CATEGORY = {'film': 'STUDIO_FILM', 'colour': 'STUDIO_COLOUR', 'mono': 'STUDIO_MONO', 'print': 'STUDIO_PRINT', 'fx': 'STUDIO_FX'}

# What each look is, for the tray.
SUBTITLES = {
    'film': 'Soft fade, gentle warmth, film grain',
    'gold': 'Golden negative · warm highlights',
    'portrait': 'Soft contrast · peach skin, teal shadows',
    'vivid100': 'Punchy slide colour · crisp',
    'green400': 'Cool greens · cream highlights',
    'tungsten': 'Cool night stock · red halation',
    'halation': 'Warm glow round every light',
    'slide': 'Deep blacks · saturated slide',
    'expired': 'Faded magenta cast · dust',
    'disposable': 'Hard flash colour · fringing, vignette',
    'instant': 'Creamy print · soft bloom',
    'super8': 'Home movie · grain, bloom, fringing',
    'cinema': 'Teal and orange grade',
    'twostrip': 'Early colour · red and teal only',
    'crossp': 'Cross-processed · yellow-green highlights',
    'bleach': 'Silver retained · gritty, muted',
    'overexposed': 'Bright and airy · glowing',
    'pushed': 'Pushed two stops · heavy grain',
    'lightleak': 'Warm leak from the edge',
    'negative': 'The orange-base negative itself',
    'vintage': 'Sepia-warm and faded',
    'vivid': 'More colour, more contrast',
    'warm': 'Warm white balance',
    'cool': 'Cool white balance',
    'fade': 'Lifted blacks · soft',
    'dreamy': 'Bright, pale and soft',
    'punch': 'Strong contrast and colour',
    'bw': 'Clean black and white',
    'pan400': 'Contrasty B&W · grain',
    'softbw': 'Soft B&W · glowing',
    'noir': 'Hard B&W · dark corners',
    'sepia': 'Brown-toned print',
    'xerox': 'Blown-out copier B&W',
    'halftone': 'Newsprint dot screen',
    'halftoneFine': 'Fine dot screen',
    'duoBlue': 'Two inks · navy and sky',
    'duoPink': 'Two inks · plum and pink',
    'duoDots': 'Blue duotone dots',
    'photocopy': 'Pure black and white',
    'riso': 'Riso print · red ink dots',
    'motion': 'Sideways motion blur',
    'grit': 'Gritty B&W · motion and noise',
    'ghost': 'Vertical drag · faded',
    'noisy': 'Digital noise',
    'haze': 'Soft, bright haze',
    'zoomburst': 'Zoomed during the shot',
    'spin': 'Twirled about the centre',
    'tilt': 'Miniature · sharp band',
    'double': 'Double exposure',
    'fisheye': 'Barrel fisheye',
    'lens': 'Wide lens · warm corners',
}


def hex_rgb(c):
    c = str(c or '#000').lstrip('#')
    if len(c) == 3: c = ''.join(x + x for x in c)
    n = int(c[:6], 16)
    return np.array([n >> 16 & 255, n >> 8 & 255, n & 255], dtype=np.float64)


def colour_stage(f, rgb, two_tone=True):
    """The pack's colour & tone stage (looks-reference.js colourStage) on rgb 0..255, unclamped."""
    g = lambda k: float(f.get(k) or 0)
    br = (1 + g('brightness') / 100) * 2 ** (g('exposure') / 50)
    cv = g('contrast') * 2.55
    cf = 259 * (cv + 255) / (255 * (259 - cv))
    sat = 1 + g('saturation') / 100
    wa = g('warmth') * 0.35
    fade = g('fade') / 100 * 0.32
    gs, sp = g('grayscale') / 100, g('sepia') / 100
    tt = two_tone and (f.get('duotone') or f.get('threshold'))
    thr = g('threshold') / 100 * 255
    hl, shd, blk = g('highlights') / 100, g('shadows') / 100, g('blacks') / 100
    tn, vib = g('tint') / 100 * 30, g('vibrance') / 100
    hue = g('hue') * math.pi / 180
    st = g('splitTone') / 100
    tb = 0.5 + g('toneBalance') / 200
    xp, ng = g('cross') / 100, g('negative') / 100
    W = np.array([0.299, 0.587, 0.114])
    luma = lambda c: c @ W
    clamp = lambda v, a=0.0, b=1.0: np.clip(v, a, b)

    def hue_only(c):
        v = hex_rgb(c)
        return v - v @ W

    c = rgb.astype(np.float64) * br
    c = cf * (c - 128) + 128
    if hl or shd or blk:
        L = clamp(luma(c) / 255); iL = 1 - L
        c = c + (shd * L * iL * iL * 4 * 70 + hl * L * L * iL * 6.75 * 60 + blk * iL ** 3 * 60)[..., None]
    l = luma(c)[..., None]
    c = l + (c - l) * sat
    if vib:
        k = 1 + vib * (1 - clamp((c.max(-1) - c.min(-1)) / 255)) * 1.3
        c = l + (c - l) * k[..., None]
    if hue:
        hc, hs = math.cos(hue), math.sin(hue)
        HM = np.array([[0.213 + 0.787 * hc - 0.213 * hs, 0.715 - 0.715 * hc - 0.715 * hs, 0.072 - 0.072 * hc + 0.928 * hs],
                       [0.213 - 0.213 * hc + 0.143 * hs, 0.715 + 0.285 * hc + 0.140 * hs, 0.072 - 0.072 * hc - 0.283 * hs],
                       [0.213 - 0.213 * hc - 0.787 * hs, 0.715 - 0.715 * hc + 0.715 * hs, 0.072 + 0.928 * hc + 0.072 * hs]])
        c = c @ HM.T
    c = c + np.array([wa, wa * 0.15, -wa])
    if tn: c = c + np.array([tn * 0.5, -tn, tn * 0.5])
    if xp:
        def sc(v):
            x = clamp(v / 255)
            return 255 * np.where(x < 0.5, 2 * x * x, 1 - 2 * (1 - x) ** 2)
        r, gg, b = c[..., 0], c[..., 1], c[..., 2]
        c = np.stack([r + (sc(r) - r) * xp * 0.8, gg + (sc(gg) * 1.04 - gg) * xp * 0.6, b + ((b * 0.78 + 26) - b) * xp], -1)
    if st:
        tS, tH = hue_only(f.get('toneShadow') or '#1d6f78'), hue_only(f.get('toneHigh') or '#ffa65c')
        L = clamp(luma(c) / 255)
        a1 = clamp((tb - L) / tb); a2 = clamp((L - tb) / (1 - tb))
        c = c + tS * (a1 * (2 - a1) * st * 0.75)[..., None] + tH * (a2 * (2 - a2) * st * 0.65)[..., None]
    if gs:
        L2 = luma(c)[..., None]
        c = c + (L2 - c) * gs
    if sp:
        S = np.array([[0.393, 0.769, 0.189], [0.349, 0.686, 0.168], [0.272, 0.534, 0.131]])
        c = c + (c @ S.T - c) * sp
    if ng:
        c = c + (255 - 2 * c) * ng
        c = c * np.array([1 - 0.12 * ng, 1 - 0.3 * ng, 1 - 0.55 * ng]) + np.array([40, 12, 0]) * ng
    if fade:
        c = c * (1 - fade) + 255 * fade * np.array([0.42, 0.40, 0.38])
    if tt:
        t = clamp(luma(c) / 255)
        if f.get('threshold'): t = (t * 255 > thr).astype(np.float64)
        dk, lt = hex_rgb(f.get('duoDark') or '#111111'), hex_rgb(f.get('duoLight') or '#f4f1ea')
        c = dk + (lt - dk) * t[..., None]
    return c


def lattice():
    """The 33^3 inputs, red fastest, then green, then blue (the .cube order)."""
    v = np.arange(N) / (N - 1) * 255
    b, g, r = np.meshgrid(v, v, v, indexing='ij')
    return np.stack([r, g, b], -1).reshape(-1, 3)


def lut(look):
    f = look['params']
    # Halftone and threshold looks draw their own ink and paper: the LUT stops before the
    # duotone, so the shader can size the dots (or cut the threshold) by the tone it leaves.
    two_tone = not (f.get('halftone') or f.get('threshold'))
    return np.clip(colour_stage(f, lattice(), two_tone) / 255, 0, 1)


def looks():
    for shelf in PACK['shelves']:
        for lid in shelf['looks']:
            if lid not in SKIP: yield shelf['id'], PACK['looks'][lid]


def write_luts(out):
    from PIL import Image
    os.makedirs(out, exist_ok=True)
    for _, look in looks():
        o = (lut(look) * 255 + 0.5).astype(np.uint8).reshape(N, N, N, 3)      # [b][g][r]
        strip = np.transpose(o, (1, 0, 2, 3)).reshape(N, N * N, 3)             # y = g, x = b*33 + r
        Image.fromarray(strip, 'RGB').save(os.path.join(out, 'st_%s.png' % look['id']))
    print('wrote', sum(1 for _ in looks()), 'LUTs')


def check(cube_dir):
    worst = 0
    for _, look in looks():
        if look['params'].get('halftone') or look['params'].get('threshold'): continue
        rows = [l.split() for l in open(os.path.join(cube_dir, look['id'] + '.cube')) if l[:1].isdigit() or l[:1] == '-']
        ref = np.array(rows, dtype=np.float64)
        d = np.abs(lut(look) - ref).max() * 255
        worst = max(worst, d)
        print('%-14s max diff %.2f levels' % (look['id'], d))
    print('worst', worst)


def write_tiles(previews, out):
    from PIL import Image
    for _, look in looks():
        im = Image.open(os.path.join(previews, look['id'] + '__portrait.jpg')).convert('RGB')
        w, h = im.size
        ch = round(w * 4 / 3)                    # 3:4, like the other tiles
        top = max(0, (h - ch) // 3)
        im.crop((0, top, w, top + ch)).resize((198, 264), Image.LANCZOS).save(
            os.path.join(out, 'st_%s.jpg' % look['id']), quality=88)
    print('wrote tiles')


def swatch(look):
    c = np.clip(colour_stage(look['params'], np.array([[150.0, 120.0, 100.0]])), 0, 255)[0]
    return 0xFF000000 | int(c[0]) << 16 | int(c[1]) << 8 | int(c[2])


def fl(v):
    return ('%.4f' % v).rstrip('0').rstrip('.') + 'f'


def kotlin_look(shelf, look):
    f = look['params']
    g = lambda k, d=0: float(f.get(k) if f.get(k) is not None else d)
    assert not f.get('halColor'), 'a halation colour of its own: add it to stock()'
    mono = g('grayscale') >= 100 or bool(f.get('threshold'))
    stock = 'stock("st_%s", "%s", 0x%08X%s)' % (look['id'], look['name'], swatch(look), ', mono = true' if mono else '')
    blur_mode, blur = 'NONE', 0.0
    for key, mode, scale in (('motion', 'MOTION', 100), ('zoomBlur', 'ZOOM', 100), ('spinBlur', 'SPIN', 100), ('blur', 'GAUSSIAN', 40)):
        if g(key):
            blur_mode, blur = mode, g(key) / scale
            break
    fields = [
        ('stock', stock),
        ('halation', fl(g('halation') / 100)), ('bloom', fl(g('bloom') / 100)),
        ('grain', fl(g('grain') / 100)), ('grainSize', fl(1 + 3 * g('grainSize') / 100)),
        ('noise', fl(g('noise') / 100)),
        ('lightLeak', fl(g('leak') / 100)), ('vignette', fl(g('vignette') / 100)), ('dust', fl(g('dust') / 100)),
        ('aberration', fl(g('chroma') / 100)), ('sharpness', fl(g('sharpen') / 100)), ('clarity', fl(g('clarity') / 100)),
        ('distortion', fl(g('fisheye') / 100)),
        ('blurMode', 'BlurMode.' + blur_mode), ('blur', fl(blur)),
        ('blurAngle', fl(180 - g('motionAngle'))),
        ('ghost', fl(g('ghost') / 100)), ('tiltShift', fl(g('tiltShift') / 100)),
    ]
    if g('halftone') or g('threshold'):
        ink = f.get('duoDark') if f.get('duotone') or f.get('threshold') else '#111111'
        paper = f.get('duoLight') if f.get('duotone') or f.get('threshold') else '#f4f1ea'
        fields += [('halftone', fl(g('halftone') / 100)), ('threshold', fl(g('threshold') / 100)),
                   ('halftoneInk', '0xFF%s' % (ink or '#111111').lstrip('#').upper()),
                   ('halftonePaper', '0xFF%s' % (paper or '#f4f1ea').lstrip('#').upper())]
    defaults = {'grainSize': '1f', 'blurAngle': '180f', 'blurMode': 'BlurMode.NONE',
                'halftoneInk': '0xFF111111', 'halftonePaper': '0xFFF4F1EA'}
    fields = [(k, v) for k, v in fields if v != defaults.get(k, '0f') or k == 'stock']
    lines, line = [], ''
    for k, v in fields[1:]:
        part = '%s = %s, ' % (k, v)
        if len(line) + len(part) > 100: lines.append(line.rstrip()); line = ''
        line += part
    if line: lines.append(line.rstrip())
    head = '        FilmCamera("st_%s", "%s", "%s", CameraCategory.%s, look(' % (
        look['id'], look['name'], SUBTITLES[look['id']], SHELF_CATEGORY[shelf])
    if not lines:
        return head + '%s)),' % fields[0][1]
    return head + '\n            %s,\n            %s\n        )),' % (fields[0][1], '\n            '.join(lines))


def write_kotlin(path):
    cams = '\n'.join(kotlin_look(s, l) for s, l in looks())
    open(path, 'w').write('''package app.filmcam.film

// Generated by tools/studio-looks/studiolab.py from looks.json: edit that, then run
//   python3 studiolab.py luts ../../app/src/main/assets/luts
//   python3 studiolab.py kotlin ../../app/src/main/java/app/filmcam/film/StudioLooks.kt

/**
 * The studio looks: the photo editor's own looks (Film, Colour, B&W, Print and Effects shelves).
 * Each look's colour is its LUT (luts/st_*.png, the editor's colour maths baked in); everything
 * else is drawn with the editor's formulas ([FilmLook.studio]), sized to the frame, so the
 * viewfinder, a video and a full-resolution photo all match the editor.
 */
object StudioLooks {
    /** The editor's halation colour, #ff481e. */
    private val HALATION = Rgb(1f, 72f / 255f, 30f / 255f)

    private fun stock(id: String, name: String, swatch: Long, mono: Boolean = false) =
        FilmStock(id = id, name = name, colorGrain = 0f, monochrome = mono, swatch = swatch, halationColor = HALATION)

    /** A studio look: every effect off except the ones it names, drawn the editor's way. */
    private fun look(
        stock: FilmStock, halation: Float = 0f, bloom: Float = 0f, grain: Float = 0f, grainSize: Float = 1f,
        noise: Float = 0f, lightLeak: Float = 0f, vignette: Float = 0f, dust: Float = 0f, aberration: Float = 0f,
        sharpness: Float = 0f, clarity: Float = 0f, distortion: Float = 0f, blurMode: BlurMode = BlurMode.NONE,
        blur: Float = 0f, blurAngle: Float = 180f, ghost: Float = 0f, tiltShift: Float = 0f,
        halftone: Float = 0f, threshold: Float = 0f, halftoneInk: Long = 0xFF111111, halftonePaper: Long = 0xFFF4F1EA,
    ) = FilmLook(
        stock = stock, studio = true, halation = halation, bloom = bloom, grain = grain, grainSize = grainSize,
        noise = noise, lightLeak = lightLeak, vignette = vignette, dust = dust, aberration = aberration,
        sharpness = sharpness, clarity = clarity, distortion = distortion, blurMode = blurMode, blur = blur,
        blurFocus = 0f, blurAngle = blurAngle, ghost = ghost, tiltShift = tiltShift,
        halftone = halftone, threshold = threshold, halftoneInk = halftoneInk, halftonePaper = halftonePaper,
    )

    val CAMERAS: List<FilmCamera> = listOf(
%s
    )

    val STOCKS: List<FilmStock> by lazy { CAMERAS.map { it.look.stock } }
}
''' % cams)
    print('wrote', path)


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'luts': write_luts(sys.argv[2])
    elif cmd == 'check': check(sys.argv[2])
    elif cmd == 'tiles': write_tiles(sys.argv[2], sys.argv[3])
    elif cmd == 'kotlin': write_kotlin(sys.argv[2])

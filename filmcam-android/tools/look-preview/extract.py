"""Pull shader sources, stocks and camera presets out of the Kotlin sources into data.json.

Usage: python3 extract.py <path to filmcam-android>
"""
import json, os, re, sys

root = sys.argv[1] + '/app/src/main/java/app/filmcam/'
strip_comments = lambda s: re.sub(r'/\*.*?\*/|//[^\n]*', '', s, flags=re.S)

src = open(root + 'gl/Shaders.kt').read()
consts = dict(re.findall(r'const val (\w+) = """(.*?)"""', src, re.S))
for k, v in list(consts.items()):
    consts[k] = v.replace('$DEVELOP_BODY', consts['DEVELOP_BODY'])
shaders = {k: consts[k] for k in ['VERTEX', 'DEVELOP_2D', 'DEVELOP_OES', 'TRAIL', 'BRIGHT', 'BLUR', 'FINAL']}
shaders['DEVELOP_2D_MRT'] = consts['DEVELOP_2D'].replace('precision highp float;', 'precision highp float;\n#define MRT 1', 1)


def split_args(body):
    depth, cur, parts = 0, '', []
    for ch in body:
        if ch in '([': depth += 1
        if ch in ')]': depth -= 1
        if ch == ',' and depth == 0:
            parts.append(cur); cur = ''
        else:
            cur += ch
    parts.append(cur)
    return [p.strip() for p in parts if p.strip()]


def named(body):
    out = {}
    for p in split_args(body):
        if '=' in p and not p.startswith('"'):
            k, v = p.split('=', 1)
            out[k.split(':')[0].replace('val ', '').strip()] = v.strip()
    return out


def num(v):
    v = v.strip()
    m = re.match(r'^(-?[\d.]+)f\s*/\s*([\d.]+)f$', v)
    if m: return float(m.group(1)) / float(m.group(2))
    return float(v.rstrip('f'))


def nums(inner):
    return [num(x) for x in split_args(inner)]


def value(v):
    if v.startswith('Rgb('): return nums(v[4:-1])
    if v.startswith('floatArrayOf('): return nums(v[len('floatArrayOf('):-1])
    if v.startswith('mono('):
        r, g, b = nums(v[5:-1]); return [r, g, b] * 3
    if v == 'IDENTITY': return [1, 0, 0, 0, 1, 0, 0, 0, 1]
    if v in ('true', 'false'): return v == 'true'
    if v.startswith('"'): return v.strip('"')
    if v.startswith('0x'): return None
    if '.' in v and not re.match(r'^-?[\d.]+f?$', v): return v.split('.')[-1]   # enum constant
    return num(v)


stock_src = strip_comments(open(root + 'film/FilmStock.kt').read())
stock_defaults = named(re.search(r'data class FilmStock\((.*?)\n\) \{', stock_src, re.S).group(1))
stocks = {}
for name, body in re.findall(r'val (\w+) = FilmStock\((.*?)\n    \)', stock_src, re.S):
    a = dict(stock_defaults); a.update(named(body))
    stocks[name] = {k: value(v) for k, v in a.items() if value(v) is not None}

look_src = strip_comments(open(root + 'film/FilmLook.kt').read())
enum_ids = {}
for enum in ('FrameStyle', 'StampStyle'):
    body = re.search(r'enum class %s\(.*?\) \{(.*?)\}' % enum, look_src, re.S).group(1)
    enum_ids[enum] = {n: int(i) for n, i in re.findall(r'(\w+)\("[^"]*", (\d+)\)', body)}
look_defaults = named(re.search(r'data class FilmLook\((.*?)\n\)', look_src, re.S).group(1))
def stock_of(v):
    # FilmStocks.NAME, or FilmStocks.NAME.copy(field = value, ...)
    m = re.match(r'FilmStocks\.(\w+)(?:\.copy\((.*)\))?$', v, re.S)
    st = dict(stocks[m.group(1)])
    if m.group(2):
        st.update({k: value(x) for k, x in named(m.group(2)).items() if value(x) is not None})
    return st


cams = []
# The no-filter camera is built directly, without cam()'s default grain.
plain = re.findall(r'val \w+ = FilmCamera\(\s*"(\w+)", "([^"]+)", "([^"]+)", CameraCategory\.(\w+),\s*FilmLook\((.*?)\),\s*\)', look_src, re.S)
found = [(c, n, s_, cat, b, False) for c, n, s_, cat, b in plain]
found += [(c, n, s_, cat, b, True) for c, n, s_, cat, b in re.findall(
        r'cam\("(\w+)", "([^"]+)", "([^"]+)", CameraCategory\.(\w+),\s*FilmLook\((.*?)\)\),', look_src, re.S)]
for cid, name, sub, cat, body, uniform_grain in found:
    a = dict(look_defaults); a.update(named(body))
    look = {}
    for k, v in a.items():
        if k == 'stock': look['stock'] = stock_of(v)
        elif k == 'frame': look['frame'] = enum_ids['FrameStyle'][v.split('.')[-1]]
        elif k == 'stamp': look['stamp'] = enum_ids['StampStyle'][v.split('.')[-1]]
        elif k == 'style': continue
        else: look[k] = value(v)
    # FilmCameras.cam() gives every camera the same default grain.
    g = re.search(r'const val DEFAULT_GRAIN = ([\d.]+)f', look_src)
    gs = re.search(r'const val DEFAULT_GRAIN_SIZE = ([\d.]+)f', look_src)
    if uniform_grain and g: look['grain'] = float(g.group(1))
    if uniform_grain and gs: look['grainSize'] = float(gs.group(1))
    if uniform_grain:   # cam(): a sharper lens than written
        if look.get('softness', 0) > 0: look['softness'] *= 0.6
        look['aberration'] = look.get('aberration', 0) * 0.6
    cams.append({'id': cid, 'name': name, 'subtitle': sub, 'category': cat, 'look': look})

# Photographic styles: enum entries NAME("Label", field = value, ...), with nested parentheses.
style_src = strip_comments(open(root + 'film/PhotoStyle.kt').read())
style_body = style_src[style_src.index('{', style_src.index('enum class PhotoStyle')) + 1:]
style_defaults = named(re.search(r'enum class PhotoStyle\((.*?)\n\) \{', style_src, re.S).group(1))
styles = []
for m in re.finditer(r'\n    ([A-Z_]+)\(', style_body):
    i, depth = m.end(), 1
    while depth:
        depth += {'(': 1, ')': -1}.get(style_body[i], 0); i += 1
    args = split_args(style_body[m.end():i - 1])
    a = {k: v for k, v in style_defaults.items() if k != 'label'}
    a.update(named(','.join(args[1:])))
    st = {k: value(v) for k, v in a.items() if value(v) is not None}
    st.update({'id': m.group(1).lower(), 'label': args[0].strip('"')})
    styles.append(st)
for c in cams:
    c['look'].pop('style', None)

# Film stock LUTs (tools/film-lab), as data URLs for the page.
import base64
lut_dir = sys.argv[1] + '/app/src/main/assets/luts/'
luts = {}
for c in cams:
    sid = c['look']['stock'].get('id')
    if sid and sid not in luts and os.path.exists(lut_dir + sid + '.png'):
        luts[sid] = 'data:image/png;base64,' + base64.b64encode(open(lut_dir + sid + '.png', 'rb').read()).decode()

json.dump({'shaders': shaders, 'cameras': cams, 'frames': enum_ids['FrameStyle'], 'styles': styles, 'luts': luts},
          open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data.json'), 'w'), indent=1)
print(len(styles), 'styles,', len(cams), 'cameras,', len(stocks), 'stocks,', len(enum_ids['FrameStyle']), 'borders')

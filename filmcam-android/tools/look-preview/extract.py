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
cams = []
for cid, name, sub, cat, body in re.findall(
        r'cam\("(\w+)", "([^"]+)", "([^"]+)", CameraCategory\.(\w+),\s*FilmLook\((.*?)\)\),', look_src, re.S):
    a = dict(look_defaults); a.update(named(body))
    look = {}
    for k, v in a.items():
        if k == 'stock': look['stock'] = stocks[v.split('.')[-1]]
        elif k == 'frame': look['frame'] = enum_ids['FrameStyle'][v.split('.')[-1]]
        elif k == 'stamp': look['stamp'] = enum_ids['StampStyle'][v.split('.')[-1]]
        else: look[k] = value(v)
    cams.append({'id': cid, 'name': name, 'subtitle': sub, 'category': cat, 'look': look})

json.dump({'shaders': shaders, 'cameras': cams, 'frames': enum_ids['FrameStyle']},
          open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data.json'), 'w'), indent=1)
print(len(cams), 'cameras,', len(stocks), 'stocks,', len(enum_ids['FrameStyle']), 'borders')

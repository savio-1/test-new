"""Pull shader sources, stocks and camera presets out of the Kotlin sources into data.json.

Usage: python3 extract.py <path to filmcam-android>
"""
import json, re, sys
root = sys.argv[1] + '/app/src/main/java/app/filmcam/'
src = open(root + 'gl/Shaders.kt').read()
consts = dict(re.findall(r'const val (\w+) = """(.*?)"""', src, re.S))
for k, v in list(consts.items()):
    consts[k] = v.replace('$DEVELOP_BODY', consts['DEVELOP_BODY'])
dev2d_mrt = consts['DEVELOP_2D'].replace('precision highp float;', 'precision highp float;\n#define MRT 1', 1)
shaders = {k: consts[k] for k in ['VERTEX', 'DEVELOP_2D', 'TRAIL', 'BRIGHT', 'BLUR', 'FINAL']}
shaders['DEVELOP_2D_MRT'] = dev2d_mrt
shaders['DEVELOP_OES'] = consts['DEVELOP_OES']

def parse_args(body):
    out = {}
    # split on top-level commas
    depth = 0; cur = ''; parts = []
    for ch in body:
        if ch in '([': depth += 1
        if ch in ')]': depth -= 1
        if ch == ',' and depth == 0: parts.append(cur); cur = ''
        else: cur += ch
    parts.append(cur)
    for p in parts:
        p = p.strip()
        if '=' not in p: continue
        k, v = p.split('=', 1)
        out[k.strip()] = v.strip()
    return out

def num(v):
    v = v.strip()
    m = re.match(r'^(-?[\d.]+)f\s*/\s*([\d.]+)f$', v)
    if m: return float(m.group(1)) / float(m.group(2))
    return float(v.rstrip('f'))

def rgb(v):
    return [num(x) for x in re.match(r'Rgb\((.*)\)', v).group(1).split(',')]

def floats(v):
    return [num(x) for x in re.match(r'floatArrayOf\((.*)\)', v, re.S).group(1).split(',')]

stock_src = re.sub(r'/\*.*?\*/|//[^\n]*', '', open(root + 'film/FilmStock.kt').read(), flags=re.S)
defaults = parse_args(re.search(r'data class FilmStock\((.*?)\n\) \{', stock_src, re.S).group(1).replace('val ', ''))
stock_defaults = {}
for k, v in defaults.items():
    k = k.split(':')[0].strip()
    stock_defaults[k] = v
stocks = {}
for name, body in re.findall(r'val (\w+) = FilmStock\((.*?)\n    \)', stock_src, re.S):
    a = dict(stock_defaults); a.update(parse_args(body))
    s = {}
    for k, v in a.items():
        if k in ('id', 'name'): s[k] = v.strip('"'); continue
        if v.startswith('Rgb'): s[k] = rgb(v)
        elif v.startswith('floatArrayOf') : s[k] = floats(v)
        elif v == 'IDENTITY': s[k] = [1,0,0,0,1,0,0,0,1]
        elif v in ('true', 'false'): s[k] = v == 'true'
        elif v.startswith('0x'): continue
        else: s[k] = num(v)
    stocks[name] = s

look_src = re.sub(r'/\*.*?\*/|//[^\n]*', '', open(root + 'film/FilmLook.kt').read(), flags=re.S)
ld = parse_args(re.search(r'data class FilmLook\((.*?)\n\)', look_src, re.S).group(1).replace('val ', ''))
look_defaults = {k.split(':')[0].strip(): v for k, v in ld.items()}
frames = {'NONE': 0, 'GATE': 1, 'INSTANT': 2, 'FILMSTRIP': 3, 'FILED': 4}
cams = []
for cid, name, sub, body in re.findall(r'FilmCamera\(\s*"(\w+)", "([^"]+)", "([^"]+)",\s*FilmLook\((.*?)\),\s*\),', look_src, re.S):
    a = dict(look_defaults); a.update(parse_args(body))
    look = {}
    for k, v in a.items():
        if k == 'stock': look['stock'] = stocks[v.split('.')[-1]]
        elif k == 'frame': look['frame'] = frames[v.split('.')[-1]]
        elif k in ('shutter', 'frameRate'): look[k] = v.split('.')[-1]
        elif v in ('true', 'false'): look[k] = v == 'true'
        else: look[k] = num(v)
    cams.append({'id': cid, 'name': name, 'look': look})
import os
json.dump({'shaders': shaders, 'cameras': cams}, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data.json'), 'w'), indent=1)
print(len(cams), 'cameras,', len(stocks), 'stocks')

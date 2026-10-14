"""
Pack the rendered home sequence for the web.

    python3 pack_frames.py [--src frames/hi] [--dst ../../public/media/home]
    python3 pack_frames.py --src frames/hd          # the 1920×1080 frames from a GPU render

Writes
  lo/a00.webp …   480×270 frames, 4×4 per atlas (16 frames, 1920×1080)
  hi/a00.webp …   source-size frames (960×540 or 1920×1080), 2×2 per atlas
  manifest.json   sizes, grids and which frames exist (missing ones fall back to the nearest)
  track.json      per-frame screen boxes of the tracked props (copied from the render)
  stills/*.jpg    key frames for the reduced-motion and no-JS versions
Frames that have not been rendered yet are left empty in the atlas and flagged in the manifest,
so the site can ship while a render is still running.
"""

import json
import os
import shutil
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
FRAMES = 240
SETS = {
    'lo': {'w': 480, 'h': 270, 'cols': 4, 'rows': 4, 'q': 72},
    # 'hi' takes the source frames' own size (960×540 draft, 1920×1080 from a GPU render)
    'hi': {'w': None, 'h': None, 'cols': 2, 'rows': 2, 'q': 80},
}
STILLS = {'intro': 0, 'alaro': 43, 'living': 78, 'dining': 106, 'kitchen': 131, 'catbed': 154, 'book': 182, 'night': 239}


def arg(name, default):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def main():
    src = arg('--src', os.path.join(HERE, 'frames', 'hi'))
    dst = arg('--dst', os.path.normpath(os.path.join(HERE, '..', '..', 'public', 'media', 'home')))
    def path_of(f):
        for ext in ('webp', 'png'):
            p = os.path.join(src, f'f{f:03d}.{ext}')
            if os.path.exists(p):
                return p
        return None

    have = [path_of(f) is not None for f in range(FRAMES)]
    manifest = {'frames': FRAMES, 'have': [i for i, h in enumerate(have) if h], 'sets': {}}
    cache = {}

    def frame(f):
        if f not in cache:
            cache[f] = Image.open(path_of(f)).convert('RGB')
        return cache[f]

    first = next((f for f in range(FRAMES) if have[f]), None)
    src_w, src_h = Image.open(path_of(first)).size if first is not None else (960, 540)
    for name, s in SETS.items():
        s = dict(s, w=s['w'] or src_w, h=s['h'] or src_h)
        out = os.path.join(dst, name)
        shutil.rmtree(out, ignore_errors=True)
        os.makedirs(out)
        per = s['cols'] * s['rows']
        atlases = []
        for a in range((FRAMES + per - 1) // per):
            sheet = Image.new('RGB', (s['w'] * s['cols'], s['h'] * s['rows']), (12, 12, 12))
            for k in range(per):
                f = a * per + k
                if f < FRAMES and have[f]:
                    im = frame(f)
                    if im.size != (s['w'], s['h']):
                        im = im.resize((s['w'], s['h']), Image.LANCZOS)
                    sheet.paste(im, ((k % s['cols']) * s['w'], (k // s['cols']) * s['h']))
            fn = f'a{a:02d}.webp'
            sheet.save(os.path.join(out, fn), 'WEBP', quality=s['q'], method=6)
            atlases.append(fn)
        manifest['sets'][name] = {'w': s['w'], 'h': s['h'], 'cols': s['cols'], 'rows': s['rows'], 'atlases': atlases}
        size = sum(os.path.getsize(os.path.join(out, a)) for a in atlases)
        print(f'{name}: {len(atlases)} atlases, {size / 1e6:.2f} MB')

    os.makedirs(os.path.join(dst, 'stills'), exist_ok=True)
    for key, f in STILLS.items():
        avail = [i for i, h in enumerate(have) if h]
        if not avail:
            break
        g = min(avail, key=lambda i: abs(i - f))
        frame(g).save(os.path.join(dst, 'stills', f'{key}.jpg'), 'JPEG', quality=82, optimize=True, progressive=True)

    track_src = os.path.join(os.path.dirname(src), 'track.json')
    if os.path.exists(track_src):
        shutil.copy(track_src, os.path.join(dst, 'track.json'))
    with open(os.path.join(dst, 'manifest.json'), 'w') as fh:
        json.dump(manifest, fh, separators=(',', ':'))
    print(f'{sum(have)}/{FRAMES} frames packed into {dst}')


if __name__ == '__main__':
    main()

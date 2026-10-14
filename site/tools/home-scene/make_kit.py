"""
Package the GPU render kit: alaro-render-kit-4k.zip, self-contained (scripts, launchers, packed home.blend,
assets/, the camera model) with the folder layout the scripts expect.

    python3 make_kit.py [--out ../../../out/alaro-render-kit-4k.zip]
    python3 make_kit.py --split 450      # the same kit as parts of at most ~450 MB each (for upload limits):
                                         # -part1.zip, -part2.zip, ... unzipped into one folder make the kit
"""

import os
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
SKIP_DIRS = {'frames', '__pycache__', 'scans', 'mediapipe'}  # raw scan downloads and pose models: build-time only
SKIP_EXT = {'.zip', '.blend1', '.part', '.pyc'}

README = """Alaro home v2 - 4K render kit
==============================

1. Install Blender 5.x (5.2 LTS recommended) from blender.org.
2. Open site/tools/home-scene/ and double-click render_gpu.bat (Windows) or render_gpu.command (Mac/Linux:
   `bash render_gpu.command`).
3. When it finishes, bring back site/tools/home-scene/alaro-frames-4k.zip.

The full guide, with timings and options (for example --w 2560 for a faster 2560x1440 set), is
site/tools/home-scene/RENDER_ON_GPU.md. Asset licences: site/tools/home-scene/assets/LICENSES.md.
What changed in v2: CHANGES.md.
"""

SPLIT_NOTE = """
This kit comes in {n} parts (alaro-render-kit-4k-part1.zip ... part{n}.zip). Unzip ALL of them into the
SAME folder (say yes to merging folders; README.txt is the same in each). Part {n} holds only home.blend,
the scene packed for opening in Blender's own interface; the launchers do not need it.
"""


def main():
    out = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else os.path.join(ROOT, 'out', 'alaro-render-kit-4k.zip')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    entries = []
    for rel in ('alaro-camera/build_alaro_camera.py', 'alaro-camera/README.md', 'alaro-camera/fonts/Inter-Bold.otf',
                'alaro-camera/fonts/Inter-LICENSE.txt'):
        entries.append((os.path.join(ROOT, rel), rel))
    scene = os.path.join('site', 'tools', 'home-scene')
    for dirpath, dirnames, filenames in os.walk(HERE):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        for fn in sorted(filenames):
            if os.path.splitext(fn)[1] in SKIP_EXT or fn == '.gitignore':
                continue
            full = os.path.join(dirpath, fn)
            entries.append((full, os.path.join(scene, os.path.relpath(full, HERE)).replace(os.sep, '/')))
    entries.append((os.path.join(ROOT, 'docs', 'v2', 'CHANGES.md'), 'CHANGES.md'))
    if not os.path.exists(os.path.join(HERE, 'home.blend')):
        print('warning: home.blend is missing (run build_home.py --blend first)')
    missing = [full for full, arc in entries if not os.path.exists(full)]
    for full in missing:
        print('missing', full)
    entries = [e for e in entries if e[0] not in missing]
    if '--split' not in sys.argv:
        write_zip(out, entries, README)
        return
    # split: home.blend alone in the last part, everything else packed greedily under the limit
    limit = float(sys.argv[sys.argv.index('--split') + 1]) * 1e6
    blend = [e for e in entries if e[1].endswith('/home.blend')]
    rest = sorted((e for e in entries if e not in blend), key=lambda e: -os.path.getsize(e[0]))
    parts = []
    for e in rest:
        size = os.path.getsize(e[0])
        for p_ in parts:
            if p_[0] + size <= limit:
                p_[0] += size
                p_[1].append(e)
                break
        else:
            parts.append([size, [e]])
    groups = [p_[1] for p_ in parts] + ([blend] if blend else [])
    base = out[:-4] if out.endswith('.zip') else out
    for i, g in enumerate(groups, 1):
        write_zip(f'{base}-part{i}.zip', sorted(g, key=lambda e: e[1]), README + SPLIT_NOTE.format(n=len(groups)))


def write_zip(out, entries, readme):
    with zipfile.ZipFile(out + '.part', 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        z.writestr('README.txt', readme)
        for full, arc in entries:
            if arc.endswith('.bat'):
                data = open(full, 'rb').read().replace(b'\r\n', b'\n').replace(b'\n', b'\r\n')
                z.writestr(arc, data)
            elif arc.endswith('.command'):
                info = zipfile.ZipInfo(arc)
                info.external_attr = 0o100755 << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                z.writestr(info, open(full, 'rb').read().replace(b'\r\n', b'\n'))
            elif arc.endswith('.blend') or arc.endswith('.jpg') or arc.endswith('.png'):
                z.write(full, arc, compress_type=zipfile.ZIP_STORED)
            else:
                z.write(full, arc)
    os.replace(out + '.part', out)
    print(f'{len(entries) + 1} files -> {out} ({os.path.getsize(out) / 1e6:.0f} MB)')

if __name__ == '__main__':
    main()

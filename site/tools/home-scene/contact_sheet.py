"""
Contact sheet of test frames with the tracked boxes from track.json drawn on top (BRIEF section 8).

    python3 contact_sheet.py --frames frames/test --track frames/track.json --out contact-sheet.jpg
    python3 contact_sheet.py ... --compare ../../../docs/v2/references/current-frames   # v1 beside v2

Each moment's box is drawn in its own colour, with its key; boxes are normalised 0..1, origin top-left.
"""

import glob
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

COLORS = {'alaro': (255, 255, 255), 'tower': (255, 196, 64), 'sofa': (255, 120, 170), 'cake': (120, 220, 255),
          'plane': (160, 255, 140), 'catbed': (255, 150, 80), 'book': (200, 160, 255)}
MOMENT_WINDOWS = {'tower': (66, 77), 'sofa': (77, 88), 'cake': (95, 114), 'plane': (121, 138), 'catbed': (146, 160), 'book': (171, 191)}


def arg(name, default):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def font(size):
    for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/Library/Fonts/Arial Bold.ttf', 'C:/Windows/Fonts/arialbd.ttf'):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def main():
    src = arg('--frames', 'frames/test')
    tj = json.load(open(arg('--track', 'frames/track.json')))
    track, step = tj['data'], tj.get('step', 1)  # windows below are in story frames; output frame f = story f/step
    out = arg('--out', 'contact-sheet.jpg')
    compare = arg('--compare', None)
    w = int(arg('--w', 960))
    files = sorted(glob.glob(os.path.join(src, 'f[0-9][0-9][0-9].png')) + glob.glob(os.path.join(src, 'f[0-9][0-9][0-9][0-9].png')))
    tiles = []
    for fp in files:
        f = int(os.path.basename(fp)[1:-4])
        im = Image.open(fp).convert('RGB')
        im = im.resize((w, w * im.height // im.width), Image.LANCZOS)
        d = ImageDraw.Draw(im)
        data = track[f]
        for key, col in COLORS.items():
            if key not in data:
                continue
            # the site shows a box only inside the moment's window (and Alaro's before the POV)
            if key == 'alaro':
                if data.get('pov'):
                    continue
            elif not (MOMENT_WINDOWS[key][0] <= f / step <= MOMENT_WINDOWS[key][1]):
                continue
            x0, y0, x1, y1 = data[key]
            box = [x0 * im.width, y0 * im.height, x1 * im.width, y1 * im.height]
            d.rectangle(box, outline=col, width=3)
            d.rectangle([box[0], box[1] - 22, box[0] + 12 * len(key) + 10, box[1]], fill=col)
            d.text((box[0] + 5, box[1] - 20), key, fill=(0, 0, 0), font=font(16))
        label = f'f{f:03d}  {int(data["time"]):02d}:{int(round(data["time"] % 1 * 60)):02d}' + ('  POV' if data.get('pov') else '')
        d.rectangle([0, 0, 200, 28], fill=(0, 0, 0))
        d.text((8, 4), label, fill=(255, 255, 255), font=font(18))
        if compare:
            ref = sorted(glob.glob(os.path.join(compare, f'f{f:03d}*')))
            if ref:
                r = Image.open(ref[0]).convert('RGB').resize(im.size, Image.LANCZOS)
                dr = ImageDraw.Draw(r)
                dr.rectangle([0, 0, 60, 28], fill=(0, 0, 0))
                dr.text((8, 4), 'v1', fill=(255, 255, 255), font=font(18))
                pair = Image.new('RGB', (im.width * 2 + 8, im.height), (20, 20, 20))
                pair.paste(r, (0, 0))
                pair.paste(im, (im.width + 8, 0))
                im = pair
        tiles.append(im)
    cols = 1 if compare else 2
    tw, th = tiles[0].size
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * tw + (cols + 1) * 8, rows * th + (rows + 1) * 8), (20, 20, 20))
    for i, t in enumerate(tiles):
        sheet.paste(t, (8 + (i % cols) * (tw + 8), 8 + (i // cols) * (th + 8)))
    sheet.save(out, quality=88)
    print(f'{len(tiles)} frames -> {out} ({sheet.width}x{sheet.height})')


if __name__ == '__main__':
    main()

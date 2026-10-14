"""
The distant tree line seen through the window, cut from a Poly Haven panorama (CC0): the sky is keyed out so the
scene's own animated sky shows between the trees.

    python3 make_backdrop.py          # needs assets/polyhaven/hdris/eilenriede_park.jpg (fetch_assets.py)

Writes assets/art/treeline.png (RGBA). It spans 160 degrees of the panorama, from 3.6 degrees below the horizon
to 25 degrees above it; dressing.garden() wraps it on a far cylinder with the same angles.
"""

import os

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'assets', 'polyhaven', 'hdris', 'eilenriede_park.jpg')
OUT = os.path.join(HERE, 'assets', 'art', 'treeline.png')
EL_LOW, EL_HIGH, SPAN, START = -3.6, 25.0, 160.0, 0.30  # degrees; START = azimuth of the left edge (0..1)


def main():
    Image.MAX_IMAGE_PIXELS = None
    im = Image.open(SRC).convert('RGB')
    w, h = im.size
    y0 = int(h * (0.5 - EL_HIGH / 180))
    y1 = int(h * (0.5 - EL_LOW / 180))
    x0 = int(w * START)
    x1 = x0 + int(w * SPAN / 360)
    band = np.asarray(im)
    band = np.concatenate([band, band], axis=1)[y0:y1, x0:x1].astype(np.float32) / 255
    r, g, b = band[..., 0], band[..., 1], band[..., 2]
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    sat = band.max(-1) - band.min(-1)
    # sky: bright, nearly grey or bluish; leaves and trunks are darker and warmer
    sky = np.clip((lum - 0.5) / 0.1, 0, 1) * np.clip((0.3 - sat) / 0.1, 0, 1) * np.clip((b - r + 0.04) / 0.05, 0, 1)
    rows = np.linspace(EL_HIGH, EL_LOW, band.shape[0])[:, None]
    sky *= np.clip((rows - 4.0) / 2.0, 0, 1)  # no sky shows through the trees this low (and keeps a white sign)
    alpha = Image.fromarray(((1 - sky) * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    rgb = Image.fromarray((band * 255).astype(np.uint8))
    out = rgb.copy()
    out.putalpha(alpha)
    out = out.resize((out.width // 2, out.height // 2), Image.LANCZOS)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    out.save(OUT, optimize=True)
    print(OUT, out.size)


if __name__ == '__main__':
    main()

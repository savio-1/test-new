"""
Download the CC0 Poly Haven models and textures the home uses into assets/polyhaven/.

    python3 fetch_assets.py            # skips anything already downloaded

Only needed once, on a machine with internet. The files are packed into home.blend and shipped in the
render kit, so the GPU machine never downloads anything. Licence: CC0 (https://polyhaven.com/license).
"""

import json
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DEST = os.path.join(HERE, 'assets', 'polyhaven')
API = 'https://api.polyhaven.com/files/'

# models: id -> resolution of their textures
MODELS = {
    'potted_plant_01': '1k', 'potted_plant_02': '1k', 'potted_plant_04': '1k', 'calathea_orbifolia_01': '1k',
    'anthurium_botany_01': '1k', 'fern_02': '1k', 'pachira_aquatica_01': '1k',
    'food_apple_01': '1k', 'bananas': '1k', 'lemon': '1k', 'food_pears_asian_01': '1k',
    'wooden_cutting_board': '1k', 'jug_01': '1k', 'vintage_electric_kettle': '1k', 'tea_set_01': '1k',
    'round_spectacles': '1k', 'standing_picture_frame_01': '1k', 'standing_picture_frame_02': '1k',
    'hanging_picture_frame_02': '1k', 'wicker_basket_01': '1k', 'wicker_basket_02': '1k',
    'wooden_bowl_01': '1k', 'ceramic_vase_01': '1k', 'ceramic_vase_02': '1k', 'ceramic_vase_03': '1k',
    'carved_wooden_elephant': '1k', 'rubber_duck_toy': '1k', 'decorative_book_set_01': '1k',
    'watering_can_metal_01': '1k', 'croissant': '1k', 'throw_pillows_01': '1k',
    'shrub_01': '1k', 'shrub_02': '1k', 'shrub_04': '1k', 'tree_small_02': '1k',
}
# textures: id -> resolution; maps: colour, OpenGL normal, roughness
TEXTURES = {
    'wood_floor': '2k', 'painted_plaster_wall': '2k', 'walnut_veneer': '2k', 'white_oak_veneer': '2k',
    'marble_01': '2k', 'long_white_tiles': '1k', 'rough_linen': '1k', 'knitted_fleece': '1k',
    'poly_wool_herringbone': '1k', 'ribbed_corduroy': '1k', 'velour_velvet': '1k', 'curly_teddy_natural': '1k',
    'hessian_230': '1k', 'gingham_check': '1k', 'wool_boucle': '1k', 'leafy_grass': '1k',
    'weathered_planks': '1k', 'white_bricks': '1k',
}
TEX_MAPS = {'Diffuse': 'diff', 'nor_gl': 'nor_gl', 'Rough': 'rough'}


def get(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    req = urllib.request.Request(url, headers={'User-Agent': 'alaro-home-scene/2'})
    with urllib.request.urlopen(req, timeout=120) as r, open(path + '.part', 'wb') as fh:
        fh.write(r.read())
    os.replace(path + '.part', path)


def files(asset):
    req = urllib.request.Request(API + asset, headers={'User-Agent': 'alaro-home-scene/2'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def main():
    only = sys.argv[sys.argv.index('--only') + 1].split(',') if '--only' in sys.argv else None
    for asset, res in MODELS.items():
        if only and asset not in only:
            continue
        info = files(asset)['blend'][res]['blend']
        folder = os.path.join(DEST, 'models', asset)
        get(info['url'], os.path.join(folder, f'{asset}.blend'))
        for rel, inc in info.get('include', {}).items():
            get(inc['url'], os.path.join(folder, rel))
        print('model', asset, flush=True)
    for asset, res in TEXTURES.items():
        if only and asset not in only:
            continue
        info = files(asset)
        folder = os.path.join(DEST, 'textures', asset)
        for key, short in TEX_MAPS.items():
            if key in info:
                get(info[key][res]['jpg']['url'], os.path.join(folder, f'{asset}_{short}.jpg'))
        print('texture', asset, flush=True)


if __name__ == '__main__':
    main()

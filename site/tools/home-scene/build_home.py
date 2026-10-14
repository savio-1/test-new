"""
Alaro immersive hero: the 3D home, rendered as a scroll image sequence (v2: clay-statue family, lived-in home).

Builds an open-plan home in Blender around the Alaro camera model
(../../../alaro-camera/build_alaro_camera.py), animates one afternoon-to-night
(camera path, Alaro pan/tilt, sun, lamps, candles) and renders it with Cycles.
For every frame it also writes where the tracked moments land on screen, so the
website's HUD can stick to them. See docs/STORYBOARD.md for the story.

v2 adds the clay-statue family (assets/people/*.blend, built by make_people.py), the lived-in
dressing and photographic materials (dressing.py, Poly Haven CC0 assets fetched by fetch_assets.py,
artwork from make_art.py) and a lens finish in post (lens_post). The camera path, timing, frame count
and track.json format are unchanged.

    pip install bpy pillow
    python3 build_home.py --test 0,25,52,72,84,104,130,154,182,232 --w 960 --h 540 --samples 24   # -> frames/test/
    python3 build_home.py --render [--start 0 --end 239]      # draft: 960x540 PNG -> frames/hi/ + track.json
    python3 build_home.py --blend                              # home.blend: keyed, packed, set to 4K final
    python3 build_home.py --blend --glb                        # also alaro-home.glb (flat materials + camera animation)

Final quality on a GPU machine (see RENDER_ON_GPU.md):
    blender -b -P build_home.py -- --render --final --gpu --w 3840 --samples 512 --set 4k --zip
        # 3840x2160: frames/4k/fNNN.png (master) + fNNN.webp (q95) + track.json, then alaro-frames-4k.zip

Units are metres; Z is up. The room spans x -4.5..4.5, y -3.5..3.5.
"""

import json
import math
import os
import random
import sys

import bpy  # noqa: F401  (must come before bmesh/mathutils with the pip module)
import bmesh
from mathutils import Matrix, Vector
from bpy_extras.object_utils import world_to_camera_view

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.normpath(os.path.join(HERE, '..', '..', '..', 'alaro-camera')))
import build_alaro_camera as alaro  # noqa: E402
sys.path.insert(0, HERE)
import statue  # noqa: E402
import dressing  # noqa: E402

PEOPLE_DIR = os.path.join(HERE, 'assets', 'people')

srgb = alaro.srgb
FRAMES = 240
RNG = random.Random(7)

# Where the furniture of each moment stands. The statue poses (make_people.py) read the same numbers,
# so a figure's hands land on the prop it touches.
LAYOUT = {
    'coffee': (-1.2, -1.22),            # coffee table centre (v1: -1.2, -1.32), moved 10 cm so Dad can kneel
    'tower': (-0.85, -1.22),              # block tower base on the coffee table
    'tower_top': 0.405,                 # table top height
    'pulled_layer': 8,                  # Arlo's block: middle block of this layer, half pulled toward +X
    'sofa': (-1.25, -2.62),
    'dining': (1.45, 1.15),
    'dining_top': 0.7725,
    'island': (-1.45, 2.05),
    'leo_stool': (-1.9, 1.38),          # Leo and Mum stay left of the birthday shot in Alaro's view
    'plane': (-2.02, 0.98, 1.66),       # paper plane just leaving Leo's fingers
    'catbed': (3.55, -0.35),            # v1: (3.45, 1.05), hidden behind the dining table from Alaro
    'armchair': (3.45, -1.95, 189.0),   # x, y, rotation (deg); v1 (3.25, -2.55, 145): out of the corner, three-quarter to Alaro
    'nook_table': (2.8, -2.08),
    'floor_lamp': (4.12, -2.15),       # behind the armchair, clear of the intro camera
    # dining chairs (x, y, side, turn): Grandpa's chair pulled out on the north side, Zoe kneels on the
    # south-east one, the south-west one is turned away from the table
    'dining_chairs': [(1.45, 1.86, 1, 0.0), (0.95, 0.47, -1, -18.0), (1.95, 0.5, -1, 4.0)],
    'cake': (1.45, 1.24),
    'stools': [(-1.15, 1.36), (-1.9, 1.38), (-0.5, 1.42)],
    'plane_rot': (math.radians(8), math.radians(-12), math.radians(-146)),  # nose toward the room / Alaro
}

# ---------------------------------------------------------------- materials

def node(nt, kind, loc=(0, 0), **inputs):
    n = nt.nodes.new(kind)
    n.location = loc
    for k, v in inputs.items():
        key = k.replace('_', ' ')
        if key in n.inputs:
            n.inputs[key].default_value = v
        else:
            setattr(n, k, v)
    return n


def sock(n, ident, out=False):
    """Mix nodes have several sockets named A/B/Result; pick by identifier (A_Color, Result_Color...)."""
    for x in (n.outputs if out else n.inputs):
        if x.identifier == ident:
            return x
    raise KeyError(ident)


def new_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = node(nt, 'ShaderNodeOutputMaterial', (600, 0))
    return m, nt, out


def principled(name, hex_str, rough=0.5, **kw):
    m, nt, out = new_mat(name)
    b = node(nt, 'ShaderNodeBsdfPrincipled', (200, 0), Base_Color=srgb(hex_str), Roughness=rough, **kw)
    nt.links.new(b.outputs[0], out.inputs['Surface'])
    m.diffuse_color = srgb(hex_str)
    return m


def textured(name, hex_a, hex_b, rough=0.6, scale=40.0, bump=0.05, detail=6.0, rough_var=0.08, **kw):
    """Base colour mixed between two tones by noise, with matching roughness and a bump."""
    m, nt, out = new_mat(name)
    tc = node(nt, 'ShaderNodeTexCoord', (-900, 0))
    nz = node(nt, 'ShaderNodeTexNoise', (-700, 0), Scale=scale, Detail=detail, Roughness=0.55)
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    ramp = node(nt, 'ShaderNodeMix', (-450, 150), data_type='RGBA')
    sock(ramp, 'A_Color').default_value = srgb(hex_a)
    sock(ramp, 'B_Color').default_value = srgb(hex_b)
    nt.links.new(nz.outputs['Fac'], ramp.inputs['Factor'])
    rr = node(nt, 'ShaderNodeMapRange', (-450, -50), From_Min=0.3, From_Max=0.7, To_Min=rough - rough_var, To_Max=rough + rough_var)
    nt.links.new(nz.outputs['Fac'], rr.inputs['Value'])
    bp = node(nt, 'ShaderNodeBump', (-450, -250), Strength=bump, Distance=0.002)
    fine = node(nt, 'ShaderNodeTexNoise', (-700, -300), Scale=scale * 12, Detail=2.0)
    nt.links.new(tc.outputs['Object'], fine.inputs['Vector'])
    nt.links.new(fine.outputs['Fac'], bp.inputs['Height'])
    b = node(nt, 'ShaderNodeBsdfPrincipled', (200, 0), **kw)
    nt.links.new(sock(ramp, 'Result_Color', True), b.inputs['Base Color'])
    nt.links.new(rr.outputs['Result'], b.inputs['Roughness'])
    nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    nt.links.new(b.outputs[0], out.inputs['Surface'])
    m.diffuse_color = srgb(hex_a)
    return m


def fabric(name, hex_str, sheen=0.6, scale=900.0):
    """Woven upholstery: a fine cross-weave bump and a soft sheen."""
    m, nt, out = new_mat(name)
    tc = node(nt, 'ShaderNodeTexCoord', (-900, 0))
    w1 = node(nt, 'ShaderNodeTexWave', (-700, 100), Scale=scale, Distortion=1.5, Detail=1.0)
    w2 = node(nt, 'ShaderNodeTexWave', (-700, -100), Scale=scale, Distortion=1.5, Detail=1.0, bands_direction='Y')
    nz = node(nt, 'ShaderNodeTexNoise', (-700, -300), Scale=scale / 30, Detail=4.0)
    for n_ in (w1, w2, nz):
        nt.links.new(tc.outputs['Object'], n_.inputs['Vector'])
    add = node(nt, 'ShaderNodeMath', (-450, 0), operation='MAXIMUM')
    nt.links.new(w1.outputs['Fac'], add.inputs[0])
    nt.links.new(w2.outputs['Fac'], add.inputs[1])
    bp = node(nt, 'ShaderNodeBump', (-250, -150), Strength=0.25, Distance=0.001)
    nt.links.new(add.outputs[0], bp.inputs['Height'])
    tone = node(nt, 'ShaderNodeMix', (-250, 150), data_type='RGBA')
    sock(tone, 'A_Color').default_value = srgb(hex_str)
    c = srgb(hex_str)
    sock(tone, 'B_Color').default_value = (c[0] * 0.82, c[1] * 0.82, c[2] * 0.82, 1)
    nt.links.new(nz.outputs['Fac'], tone.inputs['Factor'])
    b = node(nt, 'ShaderNodeBsdfPrincipled', (200, 0), Roughness=0.92, Sheen_Weight=sheen, Sheen_Roughness=0.5,
             Specular_IOR_Level=0.25)
    nt.links.new(sock(tone, 'Result_Color', True), b.inputs['Base Color'])
    nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    nt.links.new(b.outputs[0], out.inputs['Surface'])
    m.diffuse_color = c
    return m


def wood(name, light_hex, dark_hex, rough=0.42, scale=6.0, planks=False, coat=0.15, axis='X'):
    """Wood grain from a distorted wave; optional plank layout from a brick texture."""
    m, nt, out = new_mat(name)
    tc = node(nt, 'ShaderNodeTexCoord', (-1200, 0))
    mp = node(nt, 'ShaderNodeMapping', (-1000, 0))
    # stretch the grain along the board's long axis
    mp.inputs['Scale'].default_value = (0.12, 1, 1) if axis == 'X' else (1, 0.12, 1)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    wave = node(nt, 'ShaderNodeTexWave', (-800, 100), Scale=scale, Distortion=6.5, Detail=5.0, Detail_Scale=2.2,
                wave_profile='SAW', bands_direction='Y' if axis == 'X' else 'X')
    nt.links.new(mp.outputs['Vector'], wave.inputs['Vector'])
    nz = node(nt, 'ShaderNodeTexNoise', (-800, -150), Scale=scale * 0.6, Detail=5.0)
    nt.links.new(mp.outputs['Vector'], nz.inputs['Vector'])
    mixf = node(nt, 'ShaderNodeMath', (-600, 0), operation='MULTIPLY_ADD')
    nt.links.new(wave.outputs['Fac'], mixf.inputs[0])
    mixf.inputs[1].default_value = 0.4
    nt.links.new(nz.outputs['Fac'], mixf.inputs[2])
    col = node(nt, 'ShaderNodeMix', (-350, 150), data_type='RGBA')
    sock(col, 'A_Color').default_value = srgb(light_hex)
    sock(col, 'B_Color').default_value = srgb(dark_hex)
    nt.links.new(mixf.outputs[0], col.inputs['Factor'])
    color_out = sock(col, 'Result_Color', True)
    gap = None
    if planks:
        br = node(nt, 'ShaderNodeTexBrick', (-800, 400), Scale=1.0, Mortar_Size=0.0025, Mortar_Smooth=0.2, Bias=0.0,
                  Brick_Width=1.25, Row_Height=0.19, offset=0.37, squash=1.0)
        br.inputs['Color1'].default_value = (1, 1, 1, 1)
        br.inputs['Color2'].default_value = (0.86, 0.86, 0.86, 1)
        br.inputs['Mortar'].default_value = (0.15, 0.15, 0.15, 1)
        nt.links.new(tc.outputs['Object'], br.inputs['Vector'])
        mul = node(nt, 'ShaderNodeMix', (-150, 300), data_type='RGBA', blend_type='MULTIPLY')
        mul.inputs['Factor'].default_value = 1.0
        nt.links.new(color_out, sock(mul, 'A_Color'))
        nt.links.new(br.outputs['Color'], sock(mul, 'B_Color'))
        color_out = sock(mul, 'Result_Color', True)
        gap = br.outputs['Fac']
    rr = node(nt, 'ShaderNodeMapRange', (-350, -100), To_Min=rough - 0.06, To_Max=rough + 0.08)
    nt.links.new(wave.outputs['Fac'], rr.inputs['Value'])
    bp = node(nt, 'ShaderNodeBump', (-150, -200), Strength=0.08, Distance=0.001)
    nt.links.new(wave.outputs['Fac'], bp.inputs['Height'])
    if gap is not None:
        bp2 = node(nt, 'ShaderNodeBump', (0, -300), Strength=0.6, Distance=0.002, invert=True)
        nt.links.new(gap, bp2.inputs['Height'])
        nt.links.new(bp.outputs['Normal'], bp2.inputs['Normal'])
        bp = bp2
    b = node(nt, 'ShaderNodeBsdfPrincipled', (250, 0), Coat_Weight=coat, Coat_Roughness=0.25)
    nt.links.new(color_out, b.inputs['Base Color'])
    nt.links.new(rr.outputs['Result'], b.inputs['Roughness'])
    nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    nt.links.new(b.outputs[0], out.inputs['Surface'])
    m.diffuse_color = srgb(light_hex)
    return m


def emissive(name, hex_str, strength, shade_hex=None):
    """Glowing surface (bulbs, flames, status light). Strength is animated later."""
    m, nt, out = new_mat(name)
    e = node(nt, 'ShaderNodeEmission', (200, 0), Color=srgb(hex_str), Strength=strength)
    nt.links.new(e.outputs[0], out.inputs['Surface'])
    m.diffuse_color = srgb(hex_str)
    return m


def lamp_shade(name, hex_str):
    """Linen shade: diffuse outside, translucent so the bulb glows through."""
    m, nt, out = new_mat(name)
    d = node(nt, 'ShaderNodeBsdfPrincipled', (0, 150), Base_Color=srgb(hex_str), Roughness=0.9, Sheen_Weight=0.4)
    t = node(nt, 'ShaderNodeBsdfTranslucent', (0, -100), Color=srgb('#ffd9a8'))
    mx = node(nt, 'ShaderNodeMixShader', (300, 0), Fac=0.55)
    nt.links.new(d.outputs[0], mx.inputs[1])
    nt.links.new(t.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs['Surface'])
    m.diffuse_color = srgb(hex_str)
    return m


def leaf_mat(name, hex_str):
    m, nt, out = new_mat(name)
    tc = node(nt, 'ShaderNodeTexCoord', (-700, 0))
    nz = node(nt, 'ShaderNodeTexNoise', (-500, 0), Scale=30.0, Detail=3.0)
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    col = node(nt, 'ShaderNodeMix', (-300, 100), data_type='RGBA')
    sock(col, 'A_Color').default_value = srgb(hex_str)
    c = srgb(hex_str)
    sock(col, 'B_Color').default_value = (c[0] * 0.65, c[1] * 0.8, c[2] * 0.6, 1)
    nt.links.new(nz.outputs['Fac'], col.inputs['Factor'])
    p = node(nt, 'ShaderNodeBsdfPrincipled', (0, 150), Roughness=0.42, Coat_Weight=0.25)
    nt.links.new(sock(col, 'Result_Color', True), p.inputs['Base Color'])
    t = node(nt, 'ShaderNodeBsdfTranslucent', (0, -100), Color=srgb('#7fae45'))
    mx = node(nt, 'ShaderNodeMixShader', (300, 0), Fac=0.25)
    nt.links.new(p.outputs[0], mx.inputs[1])
    nt.links.new(t.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs['Surface'])
    m.diffuse_color = c
    return m


def sheer_mat(name):
    m, nt, out = new_mat(name)
    d = node(nt, 'ShaderNodeBsdfPrincipled', (0, 200), Base_Color=srgb('#f4efe6'), Roughness=0.95, Sheen_Weight=0.5)
    t = node(nt, 'ShaderNodeBsdfTranslucent', (0, 0), Color=srgb('#b9b0a2'))
    tr = node(nt, 'ShaderNodeBsdfTransparent', (0, -150))
    m1 = node(nt, 'ShaderNodeMixShader', (250, 100), Fac=0.3)
    nt.links.new(d.outputs[0], m1.inputs[1])
    nt.links.new(t.outputs[0], m1.inputs[2])
    m2 = node(nt, 'ShaderNodeMixShader', (450, 0), Fac=0.62)
    nt.links.new(m1.outputs[0], m2.inputs[1])
    nt.links.new(tr.outputs[0], m2.inputs[2])
    nt.links.new(m2.outputs[0], out.inputs['Surface'])
    m.diffuse_color = srgb('#f4efe6')
    return m


def window_glass_mat(name):
    """Thin glazing: transparent with Fresnel reflections, no refraction offset, lets sun through."""
    m, nt, out = new_mat(name)
    tr = node(nt, 'ShaderNodeBsdfTransparent', (0, 0))
    gl = node(nt, 'ShaderNodeBsdfGlossy', (0, -150), Roughness=0.02)
    fr = node(nt, 'ShaderNodeFresnel', (0, 150), IOR=1.5)
    mx = node(nt, 'ShaderNodeMixShader', (300, 0))
    nt.links.new(fr.outputs[0], mx.inputs['Fac'])
    nt.links.new(tr.outputs[0], mx.inputs[1])
    nt.links.new(gl.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs['Surface'])
    return m


def make_materials():
    M = {}
    M['floor'] = wood('Oak Floor', '#c99c6b', '#8a5d36', rough=0.38, scale=5.0, planks=True, coat=0.2)
    M['walnut'] = wood('Walnut', '#7a5236', '#3e2616', rough=0.4, scale=7.0, coat=0.25)
    M['walnut_y'] = wood('Walnut Y', '#7a5236', '#3e2616', rough=0.4, scale=7.0, coat=0.25, axis='Y')
    M['oak'] = wood('Light Oak', '#d8b58a', '#a77b4f', rough=0.45, scale=7.0)
    M['wall'] = textured('Plaster Wall', '#ece6dc', '#e2dbcf', rough=0.92, scale=3.0, bump=0.04)
    M['ceiling'] = principled('Ceiling', '#f1ede6', 0.95)
    M['trim'] = principled('Trim Paint', '#f3efe8', 0.55)
    M['sofa'] = fabric('Sofa Boucle', '#cfc4b3', sheen=0.7)
    M['cushion_a'] = fabric('Cushion Rust', '#a85a3a', sheen=0.6)
    M['cushion_b'] = fabric('Cushion Sage', '#8c9a7e', sheen=0.6)
    M['cushion_c'] = fabric('Cushion Oat', '#e7dcc8', sheen=0.6)
    M['throw'] = fabric('Throw Knit', '#b7a58b', sheen=0.5, scale=260)
    M['armchair'] = fabric('Armchair Velvet', '#5f6b52', sheen=0.9, scale=1400)
    M['rug'] = textured('Wool Rug', '#d9cbb4', '#c6b49a', rough=0.97, scale=60.0, bump=0.4)
    M['rug2'] = textured('Round Rug', '#d8ccb8', '#c4b59d', rough=0.97, scale=60.0, bump=0.4)
    M['cabinet'] = textured('Cabinet Sage', '#a9b0a0', '#a3aa9a', rough=0.55, scale=8.0, bump=0.01)
    M['counter'] = textured('Stone Counter', '#ebe7df', '#cfc9be', rough=0.25, scale=6.0, bump=0.01, detail=12.0)
    M['brass'] = principled('Brushed Brass', '#c9a560', 0.32, Metallic=1.0)
    M['black_metal'] = principled('Black Metal', '#1c1c1d', 0.38, Metallic=0.9)
    M['ceramic'] = principled('Glazed Ceramic', '#f2efe9', 0.18, Coat_Weight=0.6)
    M['ceramic_dark'] = principled('Ceramic Charcoal', '#2f2f31', 0.35, Coat_Weight=0.4)
    M['terracotta'] = textured('Terracotta', '#b8704a', '#a5603d', rough=0.85, scale=20.0, bump=0.1)
    M['soil'] = textured('Soil', '#3b2a1e', '#2a1d14', rough=1.0, scale=80.0, bump=0.4)
    M['leaf'] = leaf_mat('Leaf', '#3f6b2a')
    M['leaf2'] = leaf_mat('Leaf Light', '#58803a')
    M['stem'] = principled('Stem', '#5a4a2c', 0.7)
    M['shade'] = lamp_shade('Linen Shade', '#efe6d6')
    M['bulb'] = emissive('Warm Bulb', '#ffcf8f', 0.0)
    M['candle_flame'] = emissive('Candle Flame', '#ffb35c', 0.0)
    M['candle'] = principled('Candle Wax', '#f6efe4', 0.4, Subsurface_Weight=0.4)
    M['cake'] = textured('Cake Frosting', '#f6eadc', '#efdcc8', rough=0.55, scale=30.0, bump=0.3)
    M['cake_berry'] = principled('Berries', '#7d1830', 0.25, Coat_Weight=0.6)
    M['plate'] = principled('Plate', '#f5f3ee', 0.12, Coat_Weight=0.8)
    M['glass'] = principled('Drinking Glass', '#ffffff', 0.02, Transmission_Weight=1.0, IOR=1.45)
    M['paper'] = principled('Paper', '#f7f5f0', 0.85, Subsurface_Weight=0.15)
    M['book_red'] = principled('Book Cover Red', '#c44735', 0.6)
    M['book_pages'] = principled('Book Pages', '#f3ecdc', 0.9)
    M['window_frame'] = principled('Window Frame', '#262626', 0.45, Metallic=0.6)
    M['window_glass'] = window_glass_mat('Window Glass')
    M['sheer'] = sheer_mat('Sheer Curtain')
    M['lawn'] = textured('Lawn', '#5c7a3a', '#47632c', rough=0.95, scale=4.0, bump=0.3)
    M['hedge'] = textured('Hedge', '#4d6b33', '#2c4220', rough=0.9, scale=9.0, bump=2.0, detail=8.0)
    M['block'] = wood('Block Wood', '#e2c497', '#c19a68', rough=0.55, scale=14.0, coat=0.0)
    M['cat_bed'] = fabric('Cat Bed Felt', '#8f8578', sheen=0.8, scale=500)
    M['yarn'] = fabric('Yarn', '#c2603e', sheen=0.4, scale=300)
    M['art_a'] = textured('Art Canvas A', '#e6d3b8', '#9c5a3e', rough=0.9, scale=3.5, bump=0.05, detail=1.5)
    M['art_b'] = textured('Art Canvas B', '#e9e2d4', '#556b5b', rough=0.9, scale=0.9, bump=0.05, detail=2.0)
    M['art_c'] = textured('Art Canvas C', '#efe7da', '#2c3a44', rough=0.9, scale=1.6, bump=0.05, detail=2.5)
    M['fruit'] = principled('Lemons', '#e7c23a', 0.35, Coat_Weight=0.3)
    M['mug'] = principled('Mug', '#d6cfc2', 0.3, Coat_Weight=0.5)
    M['induction'] = principled('Induction Top', '#0d0d0e', 0.08, Coat_Weight=1.0)
    M['tap'] = principled('Steel', '#b9bbbd', 0.2, Metallic=1.0)
    return M


# ---------------------------------------------------------------- geometry helpers

COLL = {}


def coll(name):
    if name not in COLL:
        c = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(c)
        COLL[name] = c
    return COLL[name]


def obj_from_bm(name, bm, mat, collection='Home', smooth=False, mats=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = smooth
    o = bpy.data.objects.new(name, me)
    for m in (mats or [mat]):
        o.data.materials.append(m)
    coll(collection).objects.link(o)
    return o


def box(name, size, loc, mat, bevel=0.004, rot=0.0, collection='Home', segments=3, soft=False):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    o = obj_from_bm(name, bm, mat, collection, smooth=True)
    o.location = loc
    o.rotation_euler = (0, 0, rot)
    if bevel > 0:
        mod = o.modifiers.new('Bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = segments if not soft else 6
        mod.limit_method = 'NONE' if soft else 'ANGLE'
        mod.profile = 0.5 if not soft else 0.7
    if soft:
        sub = o.modifiers.new('Soft', 'SUBSURF')
        sub.levels = sub.render_levels = 1
    wn = o.modifiers.new('WN', 'WEIGHTED_NORMAL')
    wn.keep_sharp = True
    return o


def cyl(name, r, h, loc, mat, segs=48, r2=None, collection='Home', smooth=True, caps=True, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, segments=segs, radius1=r, radius2=r if r2 is None else r2, depth=h)
    o = obj_from_bm(name, bm, mat, collection, smooth=smooth)
    o.location = loc
    o.rotation_euler = rot
    if smooth and hasattr(o.data, 'set_sharp_from_angle'):
        o.data.set_sharp_from_angle(angle=math.radians(40))
    return o


def lathe_obj(name, profile, loc, mat, segs=64, collection='Home'):
    me = alaro.lathe(name, [(r / alaro.C, h / alaro.C) for r, h in profile], segs, alaro.base_map)
    o = bpy.data.objects.new(name, me)
    o.data.materials.append(mat)
    coll(collection).objects.link(o)
    o.location = loc
    return o


def sphere(name, r, loc, mat, scale=(1, 1, 1), collection='Home', subd=3):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subd, radius=r)
    bmesh.ops.scale(bm, vec=scale, verts=bm.verts)
    o = obj_from_bm(name, bm, mat, collection, smooth=True)
    o.location = loc
    return o


def plane(name, w, h, loc, mat, rot=(0, 0, 0), collection='Home'):
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
    bmesh.ops.scale(bm, vec=(w, h, 1), verts=bm.verts)
    o = obj_from_bm(name, bm, mat, collection)
    o.location = loc
    o.rotation_euler = rot
    return o


LAMP_2700K = '#ffad5e'  # warm practical bulbs
BOOK_PAGE_ANGLE = 62.0  # degrees the turning page is lifted from the right-hand page


def point_light(name, loc, energy, color='#ffcf8f', radius=0.05, collection='Lights'):
    L = bpy.data.lights.new(name, 'POINT')
    L.energy = energy
    L.color = srgb(color)[:3]
    L.shadow_soft_size = radius
    o = bpy.data.objects.new(name, L)
    o.location = loc
    coll(collection).objects.link(o)
    return o


def spot_light(name, loc, energy, angle=70, color='#ffcf8f', radius=0.05, collection='Lights'):
    L = bpy.data.lights.new(name, 'SPOT')
    L.energy = energy
    L.color = srgb(color)[:3]
    L.shadow_soft_size = radius
    L.spot_size = math.radians(angle)
    L.spot_blend = 0.6
    o = bpy.data.objects.new(name, L)
    o.location = loc
    coll(collection).objects.link(o)
    return o


# ---------------------------------------------------------------- the home

TRACK = {}  # name -> list of objects whose bounds are tracked on screen


def build_room(M):
    W, D, H = 9.0, 7.0, 2.8
    x0, x1, y0, y1 = -4.5, 4.5, -3.5, 3.5
    floor = box('Floor', (W + 0.4, D + 0.4, 0.04), (0, 0, -0.02), M['floor'], bevel=0)
    floor.data.materials[0] = M['floor']
    box('Ceiling', (W + 0.4, D + 0.4, 0.05), (0, 0, H + 0.025), M['ceiling'], bevel=0)
    t = 0.12
    box('Wall_Left', (t, D + 0.4, H), (x0 - t / 2, 0, H / 2), M['wall'], bevel=0)
    box('Wall_Back', (W + 0.4, t, H), (0, y1 + t / 2, H / 2), M['wall'], bevel=0)
    box('Wall_Front', (W + 0.4, t, H), (0, y0 - t / 2, H / 2), M['wall'], bevel=0)
    # right wall with a big window opening y -2.2..2.2, z 0.25..2.55
    wy0, wy1, wz0, wz1 = -2.2, 2.2, 0.25, 2.55
    box('Wall_Right_A', (t, wy0 - y0 + 0.2, H), (x1 + t / 2, (y0 - 0.2 + wy0) / 2, H / 2), M['wall'], bevel=0)
    box('Wall_Right_B', (t, y1 + 0.2 - wy1, H), (x1 + t / 2, (wy1 + y1 + 0.2) / 2, H / 2), M['wall'], bevel=0)
    box('Wall_Right_Sill', (t, wy1 - wy0, wz0), (x1 + t / 2, 0, wz0 / 2), M['wall'], bevel=0)
    box('Wall_Right_Head', (t, wy1 - wy0, H - wz1), (x1 + t / 2, 0, (wz1 + H) / 2), M['wall'], bevel=0)
    # window frame, mullions and glazing
    fx = x1 + 0.06
    for i, yy in enumerate([wy0 + 0.02, -0.73, 0.73, wy1 - 0.02]):
        box(f'Mullion_{i}', (0.06, 0.04, wz1 - wz0), (fx, yy, (wz0 + wz1) / 2), M['window_frame'], bevel=0.003)
    box('Window_Sill_Frame', (0.06, wy1 - wy0, 0.04), (fx, 0, wz0 + 0.02), M['window_frame'], bevel=0.003)
    box('Window_Head_Frame', (0.06, wy1 - wy0, 0.04), (fx, 0, wz1 - 0.02), M['window_frame'], bevel=0.003)
    box('Window_Transom', (0.06, wy1 - wy0, 0.03), (fx, 0, 2.05), M['window_frame'], bevel=0.003)
    plane('Window_Glass', wy1 - wy0, wz1 - wz0, (fx, 0, (wz0 + wz1) / 2), M['window_glass'], rot=(math.pi / 2, 0, math.pi / 2))
    box('Window_Board', (0.24, wy1 - wy0 + 0.1, 0.03), (x1 - 0.06, 0, wz0 - 0.015), M['trim'], bevel=0.003)
    # skirting
    for nm, size, loc in (
        ('Skirt_Left', (0.015, D, 0.09), (x0 + 0.0075, 0, 0.045)),
        ('Skirt_Back', (W, 0.015, 0.09), (0, y1 - 0.0075, 0.045)),
        ('Skirt_Front', (W, 0.015, 0.09), (0, y0 + 0.0075, 0.045)),
        ('Skirt_Right_A', (0.015, wy0 - y0, 0.09), (x1 - 0.0075, (y0 + wy0) / 2, 0.045)),
        ('Skirt_Right_B', (0.015, y1 - wy1, 0.09), (x1 - 0.0075, (wy1 + y1) / 2, 0.045)),
    ):
        box(nm, size, loc, M['trim'], bevel=0.002)

    # sheer curtains: folded panels, drawn to the sides
    for nm, yc, width in (('Sheer_L', -1.75, 1.1), ('Sheer_R', 1.65, 1.3), ('Sheer_M', 0.15, 0.55)):
        bm = bmesh.new()
        nx, nz = 60, 2
        folds = width * 9
        verts = []
        for j in range(nz + 1):
            row = []
            for i in range(nx + 1):
                u = i / nx
                yy = yc - width / 2 + u * width
                xx = x1 - 0.14 + 0.035 * math.sin(u * folds * math.pi * 2)
                row.append(bm.verts.new((xx, yy, 0.03 + j / nz * 2.62)))
            verts.append(row)
        for j in range(nz):
            for i in range(nx):
                bm.faces.new((verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i]))
        obj_from_bm(nm, bm, M['sheer'], smooth=True)
    cyl('Curtain_Rod', 0.012, D - 1.0, (x1 - 0.14, 0, 2.68), M['black_metal'], rot=(math.pi / 2, 0, 0))

    # outside: a soft, slightly overexposed garden backdrop, as windows read in interior photography
    m, nt, out = new_mat('Garden Backdrop')
    tc = node(nt, 'ShaderNodeTexCoord', (-1000, 0))
    sep = node(nt, 'ShaderNodeSeparateXYZ', (-800, 200))
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    nz = node(nt, 'ShaderNodeTexNoise', (-800, -100), Scale=2.2, Detail=2.0, Roughness=0.4)
    nt.links.new(tc.outputs['Generated'], nz.inputs['Vector'])
    # height of the greenery line wobbles with noise
    line = node(nt, 'ShaderNodeMath', (-600, 0), operation='MULTIPLY_ADD')
    nt.links.new(nz.outputs['Fac'], line.inputs[0])
    line.inputs[1].default_value = 0.22
    line.inputs[2].default_value = 0.2
    diff = node(nt, 'ShaderNodeMath', (-400, 100), operation='SUBTRACT')
    nt.links.new(line.outputs[0], diff.inputs[0])
    nt.links.new(sep.outputs['Z'], diff.inputs[1])
    band = node(nt, 'ShaderNodeMapRange', (-200, 100), From_Min=-0.06, From_Max=0.08, To_Min=0.0, To_Max=1.0)
    nt.links.new(diff.outputs[0], band.inputs['Value'])
    sky_ramp = node(nt, 'ShaderNodeMix', (0, 250), data_type='RGBA')
    sock(sky_ramp, 'A_Color').default_value = srgb('#f6f1e7')
    sock(sky_ramp, 'B_Color').default_value = srgb('#cfdbe6')
    nt.links.new(sep.outputs['Z'], sky_ramp.inputs['Factor'])
    green = node(nt, 'ShaderNodeMix', (0, 0), data_type='RGBA')
    sock(green, 'A_Color').default_value = srgb('#a9b98f')
    sock(green, 'B_Color').default_value = srgb('#6f8a58')
    nt.links.new(nz.outputs['Fac'], green.inputs['Factor'])
    mix = node(nt, 'ShaderNodeMix', (200, 100), data_type='RGBA')
    nt.links.new(band.outputs['Result'], mix.inputs['Factor'])
    nt.links.new(sock(sky_ramp, 'Result_Color', True), sock(mix, 'A_Color'))
    nt.links.new(sock(green, 'Result_Color', True), sock(mix, 'B_Color'))
    em = node(nt, 'ShaderNodeEmission', (400, 0), Strength=2.0)
    nt.links.new(sock(mix, 'Result_Color', True), em.inputs['Color'])
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    bd = plane('Garden_Backdrop', 60, 14, (x1 + 9, 0, 4.5), m, rot=(math.pi / 2, 0, math.pi / 2), collection='Outside')
    bd.visible_shadow = False
    bd.visible_diffuse = False
    box('Lawn', (12, 40, 0.1), (x1 + 4.5, 0, -0.35), M['lawn'], bevel=0, collection='Outside')


def sideboard_and_alaro(M):
    # walnut sideboard against the left wall; Alaro sits on it facing into the room
    x, y, w, d, h = -4.5 + 0.24, 0.0, 1.9, 0.46, 0.74
    box('Sideboard', (d, w, h - 0.12), (x, y, 0.12 + (h - 0.12) / 2), M['walnut_y'], bevel=0.006)
    for i, yy in enumerate((-w / 2 + 0.08, w / 2 - 0.08)):
        for xx in (x - d / 2 + 0.06, x + d / 2 - 0.06):
            box(f'Sideboard_Leg_{i}_{xx:.2f}', (0.03, 0.03, 0.12), (xx, yy, 0.06), M['black_metal'], bevel=0.003)
    for i in range(4):  # door gaps / fronts
        yy = -w / 2 + w / 8 + i * w / 4
        box(f'Sideboard_Door_{i}', (0.012, w / 4 - 0.008, h - 0.18), (x + d / 2 + 0.002, yy, 0.12 + (h - 0.12) / 2), M['walnut_y'], bevel=0.002)
        box(f'Sideboard_Pull_{i}', (0.015, 0.012, 0.12), (x + d / 2 + 0.012, yy + (0.08 if i % 2 else -0.08), 0.5), M['brass'], bevel=0.002)
    top = h
    # table lamp
    LY = 0.86
    lathe_obj('Lamp_Base', [(0.0, 0.0), (0.07, 0.0), (0.09, 0.08), (0.08, 0.2), (0.03, 0.3), (0.0, 0.3)], (x - 0.04, LY, top), M['ceramic'])
    cyl('Lamp_Shade', 0.17, 0.2, (x - 0.04, LY, top + 0.4), M['shade'], r2=0.13, caps=False)
    sphere('Lamp_Bulb', 0.035, (x - 0.04, LY, top + 0.37), M['bulb'])
    point_light('Light_TableLamp', (x - 0.04, LY, top + 0.37), 0.0, color=LAMP_2700K, radius=0.06)
    # the shade throws a pool of light down onto the sideboard and up onto the wall
    pool = spot_light('Light_TableLamp_Pool', (x - 0.04, LY, top + 0.33), 0.0, angle=95, color=LAMP_2700K, radius=0.05)
    pool.rotation_euler = (math.pi, 0, 0)
    # books + bowl styling
    for i, (hh, col) in enumerate(((0.03, '#d7cdbb'), (0.025, '#3b4a52'), (0.035, '#b77b5a'))):
        box(f'SB_Book_{i}', (0.2, 0.28, hh), (x - 0.02, -0.72, top + 0.012 + sum([0.03, 0.025, 0.035][:i]) + hh / 2),
            principled(f'Book {i}', col, 0.7), bevel=0.002)
    lathe_obj('SB_Bowl', [(0.0, 0.0), (0.05, 0.0), (0.11, 0.06), (0.105, 0.065), (0.045, 0.006), (0.0, 0.006)], (x + 0.02, -0.73, top + 0.09), M['ceramic_dark'])
    # art above the sideboard
    box('Art_Sideboard_Frame', (0.03, 0.9, 0.66), (-4.5 + 0.02, 0.05, 1.55), M['oak'], bevel=0.003)
    box('Art_Sideboard', (0.012, 0.82, 0.58), (-4.5 + 0.04, 0.05, 1.55), M['art_a'], bevel=0)

    # Alaro
    root, AM = alaro.build_camera('white')
    root.location = (x + 0.08, 0.22, top)
    root.rotation_euler = (0, 0, math.pi / 2)  # face +X, into the room
    status = emissive('Alaro Status Light', '#3ddc84', 0.0)
    sensor = bpy.data.objects['Sensor_Top']
    sensor.data.materials[0] = status
    sensor.scale = (1.4, 1.4, 1.4)
    TRACK['alaro'] = [o for o in root.children_recursive if o.type == 'MESH']
    return root


def living(M):
    # rug
    box('Rug', (3.3, 2.5, 0.012), (-1.25, -1.45, 0.006), M['rug'], bevel=0.004)
    # sofa against the front wall, facing the room (+Y)
    sx, sy, sw, sd = -1.25, -2.62, 2.4, 0.98
    box('Sofa_Base', (sw, sd, 0.22), (sx, sy, 0.17), M['sofa'], bevel=0.04, soft=True)
    for i in range(3):
        box(f'Sofa_Seat_{i}', (sw / 3 - 0.24 / 1.5, sd - 0.28, 0.16), (sx - sw / 3 + i * sw / 3, sy + 0.1, 0.36), M['sofa'], bevel=0.05, soft=True)
        box(f'Sofa_Back_{i}', (sw / 3 - 0.24 / 1.5, 0.22, 0.42), (sx - sw / 3 + i * sw / 3, sy - sd / 2 + 0.2, 0.62), M['sofa'], bevel=0.07, soft=True, rot=0)
    for side in (-1, 1):
        box(f'Sofa_Arm_{side}', (0.18, sd, 0.52), (sx + side * (sw / 2 + 0.03), sy, 0.34), M['sofa'], bevel=0.06, soft=True)
    for i, (dx, m) in enumerate(((-0.85, M['cushion_a']), (-0.55, M['cushion_c']), (0.7, M['cushion_b']))):
        cu = box(f'Pillow_{i}', (0.42, 0.14, 0.4), (sx + dx, sy - 0.12, 0.66), m, bevel=0.06, soft=True)
        cu.rotation_euler = (math.radians(-12), math.radians(RNG.uniform(-8, 8)), math.radians(RNG.uniform(-6, 6)))
    # (v1's flat throw on the east seat is gone: dressing.py drapes a plaid blanket over the arm instead)
    for i, (xx, yy) in enumerate(((sx - sw / 2, sy - sd / 2 + 0.06), (sx + sw / 2, sy - sd / 2 + 0.06), (sx - sw / 2, sy + sd / 2 - 0.06), (sx + sw / 2, sy + sd / 2 - 0.06))):
        cyl(f'Sofa_Leg_{i}', 0.02, 0.06, (xx, yy, 0.03), M['walnut'])
    TRACK['sofa'] = [bpy.data.objects[n] for n in ('Sofa_Seat_0', 'Sofa_Seat_1', 'Sofa_Seat_2', 'Sofa_Back_0', 'Sofa_Back_2')]

    # coffee table (walnut, rounded) with the block tower: game night
    cx, cy = LAYOUT['coffee']
    box('Coffee_Top', (1.15, 0.62, 0.05), (cx, cy, 0.38), M['walnut'], bevel=0.02)
    for i, (dx, dy) in enumerate(((-0.5, -0.24), (0.5, -0.24), (-0.5, 0.24), (0.5, 0.24))):
        box(f'Coffee_Leg_{i}', (0.05, 0.05, 0.36), (cx + dx, cy + dy, 0.18), M['walnut'], bevel=0.008)
    tower = []
    bl, bw, bh = 0.075, 0.025, 0.015
    tx, ty = LAYOUT['tower']
    tz = LAYOUT['tower_top']
    pulled = LAYOUT['pulled_layer']
    for layer in range(15):
        for k in range(3):
            if layer in (5, 11, 12) and k == 1:
                continue  # blocks already pulled
            if layer == 7 and k == 0:
                continue
            off = (k - 1) * bw * 1.02
            jit = RNG.uniform(-0.002, 0.002)
            if layer % 2 == 0:
                loc, rot = (tx + jit, ty + off, tz + bh / 2 + layer * bh), 0.0
            else:
                loc, rot = (tx + off, ty + jit, tz + bh / 2 + layer * bh), math.pi / 2
            name = f'Block_{layer}_{k}'
            if layer == pulled and k == 1:
                loc = (loc[0] + 0.036, loc[1], loc[2] + 0.001)  # Arlo's block, half out of the tower
                name = 'Block_Pulled'
            b = box(name, (bl, bw, bh), loc, M['block'], bevel=0.0015, rot=rot + RNG.uniform(-0.02, 0.02))
            tower.append(b)
    for i, (dx, dy, r) in enumerate(((-0.14, 0.13, 0.4), (-0.08, -0.17, 1.2), (-0.3, -0.05, 0.2))):  # pulled blocks on the table
        tower.append(box(f'Block_Loose_{i}', (bl, bw, bh), (tx + dx, ty + dy, tz + bh / 2), M['block'], bevel=0.0015, rot=r))
    TRACK['tower'] = tower
    # mug + book on the table
    cyl('Coffee_Mug', 0.04, 0.09, (cx - 0.35, cy + 0.1, 0.45), M['mug'])
    box('Coffee_Book', (0.24, 0.3, 0.03), (cx - 0.3, cy - 0.12, 0.42), M['book_red'], bevel=0.003, rot=0.2)

    # art above sofa
    for i, (dx, w_, h_, m) in enumerate(((-0.45, 0.6, 0.8, M['art_b']), (0.35, 0.5, 0.62, M['art_c']))):
        box(f'Art_Sofa_Frame_{i}', (w_ + 0.04, 0.03, h_ + 0.04), (sx + dx, -3.5 + 0.02, 1.6), M['black_metal'], bevel=0.002)
        box(f'Art_Sofa_{i}', (w_, 0.012, h_), (sx + dx, -3.5 + 0.04, 1.6), m, bevel=0)

    # bookshelf on the front wall
    bx, bw_ = 1.25, 1.2
    for i, zz in enumerate((0.02, 0.42, 0.82, 1.22, 1.62, 2.0)):
        box(f'Shelf_{i}', (bw_, 0.3, 0.025), (bx, -3.5 + 0.16, zz), M['oak'], bevel=0.003)
    for side in (-1, 1):
        box(f'Shelf_Side_{side}', (0.025, 0.3, 2.0), (bx + side * bw_ / 2, -3.5 + 0.16, 1.01), M['oak'], bevel=0.003)
    palette = ['#d7cdbb', '#3b4a52', '#b77b5a', '#e9e2d4', '#7b8a6c', '#c44735', '#2c3a44', '#d9b77e', '#efe7da']
    book_mats = [principled(f'Spine {i}', c, 0.7) for i, c in enumerate(palette)]
    for s, zz in enumerate((0.42, 0.82, 1.22, 1.62)):
        xx = bx - bw_ / 2 + 0.05
        limit = bx + (0.1 if s % 2 else 0.35)
        while xx < limit:
            th = RNG.uniform(0.02, 0.045)
            hh = RNG.uniform(0.2, 0.3)
            box(f'Shelf_Book_{s}_{xx:.3f}', (th, 0.21, hh), (xx + th / 2, -3.5 + 0.17, zz + 0.0125 + hh / 2), RNG.choice(book_mats), bevel=0.002)
            xx += th + 0.003
        lathe_obj(f'Shelf_Vase_{s}', [(0.0, 0.0), (0.05, 0.0), (0.06, 0.08), (0.03, 0.17), (0.035, 0.2), (0.0, 0.2)],
                  (bx + 0.4, -3.5 + 0.17, zz + 0.0125), M['ceramic'] if s % 2 else M['terracotta'])


def plant(name, loc, height, leaves, M, pot_r=0.16, leaf_size=0.16, spread=0.35):
    x, y, z = loc
    lathe_obj(f'{name}_Pot', [(0.0, 0.0), (pot_r * 0.8, 0.0), (pot_r, pot_r * 1.7), (pot_r * 1.03, pot_r * 1.75), (pot_r * 0.96, pot_r * 1.75), (0.0, pot_r * 1.6)],
              (x, y, z), M['terracotta'] if hash(name) % 2 else M['ceramic'])
    cyl(f'{name}_Soil', pot_r * 0.95, 0.01, (x, y, z + pot_r * 1.62), M['soil'])
    bm = bmesh.new()
    sm = bmesh.new()
    top = z + pot_r * 1.6
    for i in range(leaves):
        t = (i + 0.5) / leaves
        ang = i * 2.4 + RNG.uniform(-0.3, 0.3)
        r = spread * (0.25 + 0.75 * math.sin(t * math.pi * 0.9)) * RNG.uniform(0.7, 1.1)
        lz = top + 0.1 + t * (height - 0.1)
        base = Vector((x, y, top))
        tip = Vector((x + math.cos(ang) * r, y + math.sin(ang) * r, lz))
        # stem
        d = tip - base
        mat = Matrix.Translation(base + d / 2) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        bmesh.ops.create_cone(sm, cap_ends=False, segments=5, radius1=0.005, radius2=0.003, depth=d.length, matrix=mat)
        # leaf: a curved oval
        L = leaf_size * RNG.uniform(0.8, 1.25)
        Wd = L * 0.45
        nu, nv = 7, 3
        out = Vector((math.cos(ang), math.sin(ang), 0))
        side = Vector((-math.sin(ang), math.cos(ang), 0))
        droop = RNG.uniform(0.15, 0.55)
        grid = []
        for a in range(nu + 1):
            u = a / nu
            row = []
            width = math.sin(u * math.pi) ** 0.8 * Wd / 2
            for b in range(nv + 1):
                v = (b / nv) * 2 - 1
                p = tip + out * (u * L * math.cos(droop * u)) + side * (v * width) + Vector((0, 0, L * 0.35 * u - droop * L * u * u * 0.9 - abs(v) * width * 0.25))
                row.append(bm.verts.new(p))
            grid.append(row)
        for a in range(nu):
            for b in range(nv):
                bm.faces.new((grid[a][b], grid[a + 1][b], grid[a + 1][b + 1], grid[a][b + 1]))
    lo = obj_from_bm(f'{name}_Leaves', bm, M['leaf' if hash(name) % 2 else 'leaf2'], smooth=True)
    so = obj_from_bm(f'{name}_Stems', sm, M['stem'], smooth=True)
    return [lo, so]


def window_corner(M):
    # cat's spot by the window, with plants
    plant('Plant_Fig', (4.05, 0.7, 0.0), 1.55, 26, M, pot_r=0.19, leaf_size=0.2, spread=0.42)
    plant('Plant_Small', (3.95, 1.55, 0.0), 0.75, 14, M, pot_r=0.13, leaf_size=0.14, spread=0.3)
    plant('Plant_Floor', (4.1, -1.15, 0.0), 0.5, 10, M, pot_r=0.11, leaf_size=0.13, spread=0.25)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=48, radius1=0.33, radius2=0.36, depth=0.12)
    bed = obj_from_bm('Cat_Bed', bm, M['cat_bed'], smooth=True)
    bx, by = LAYOUT['catbed']
    bed.location = (bx, by, 0.06)
    sub = bed.modifiers.new('Soft', 'SUBSURF')
    sub.levels = sub.render_levels = 2
    cush = sphere('Cat_Bed_Cushion', 0.29, (bx, by, 0.1), M['cushion_c'], scale=(1, 1, 0.18))
    yarn = sphere('Yarn_Ball', 0.045, (bx - 0.55, by + 0.3, 0.045), M['yarn'])
    bowl = lathe_obj('Cat_Bowl', [(0.0, 0.0), (0.06, 0.0), (0.08, 0.045), (0.075, 0.05), (0.05, 0.012), (0.0, 0.012)], (bx + 0.25, by + 0.55, 0.0), M['ceramic_dark'])
    TRACK['catbed'] = [bed, cush, yarn, bowl]


def dining(M):
    dx, dy = 1.45, 1.15
    box('Dining_Top', (1.9, 0.95, 0.045), (dx, dy, 0.75), M['oak'], bevel=0.008)
    for i, (ox, oy) in enumerate(((-0.82, -0.36), (0.82, -0.36), (-0.82, 0.36), (0.82, 0.36))):
        box(f'Dining_Leg_{i}', (0.055, 0.055, 0.73), (dx + ox, dy + oy, 0.365), M['oak'], bevel=0.01)
    chair_mat = M['oak']
    seat_mat = fabric('Chair Seat', '#d9cdb8', sheen=0.5)
    # chairs: (x, y, side, turn deg). side -1 = south of the table (back to the room), +1 = north
    for i, (cx, cy, side, turn) in enumerate(LAYOUT['dining_chairs']):
        pivot = bpy.data.objects.new(f'Chair_{i}', None)
        coll('Home').objects.link(pivot)
        pivot.location = (cx, cy, 0)
        pivot.rotation_euler = (0, 0, math.radians(turn))
        parts = [box(f'Chair_Seat_{i}', (0.44, 0.42, 0.05), (0, 0, 0.46), seat_mat, bevel=0.015, soft=True)]
        for j, (lx, ly) in enumerate(((-0.19, -0.18), (0.19, -0.18), (-0.19, 0.18), (0.19, 0.18))):
            parts.append(box(f'Chair_Leg_{i}_{j}', (0.03, 0.03, 0.44), (lx, ly, 0.22), chair_mat, bevel=0.005))
        parts.append(box(f'Chair_Back_{i}', (0.42, 0.025, 0.3), (0, side * 0.2, 0.78), chair_mat, bevel=0.008, rot=0))
        for o in parts:
            o.parent = pivot
    # birthday cake
    top = 0.7725
    dx, dy = LAYOUT['cake']
    lathe_obj('Cake_Stand', [(0.0, 0.0), (0.06, 0.0), (0.04, 0.02), (0.03, 0.08), (0.17, 0.09), (0.17, 0.1), (0.0, 0.1)], (dx, dy, top), M['ceramic'])
    ck = top + 0.1
    lathe_obj('Cake', [(0.0, 0.0), (0.13, 0.0), (0.135, 0.01), (0.135, 0.105), (0.125, 0.115), (0.0, 0.118)], (dx, dy, ck), M['cake'])
    cake_objs = [bpy.data.objects['Cake_Stand'], bpy.data.objects['Cake']]
    for i in range(14):
        a = i / 14 * math.pi * 2
        cake_objs.append(sphere(f'Berry_{i}', 0.012, (dx + math.cos(a) * 0.105, dy + math.sin(a) * 0.105, ck + 0.125), M['cake_berry'], subd=2))
    flames = []
    for i in range(5):
        a = i / 5 * math.pi * 2 + 0.3
        px, py = dx + math.cos(a) * 0.055, dy + math.sin(a) * 0.055
        cake_objs.append(cyl(f'Candle_{i}', 0.004, 0.07, (px, py, ck + 0.152), M['candle'], segs=12))
        f = sphere(f'Flame_{i}', 0.006, (px, py, ck + 0.197), M['candle_flame'], scale=(1, 1, 2.2), subd=2)
        flames.append(f)
    point_light('Light_Candles', (dx, dy, ck + 0.24), 0.0, color='#ffa646', radius=0.03)
    TRACK['cake'] = cake_objs
    # plates and glasses
    for i, (ox, oy) in enumerate(((-0.45, -0.28), (0.45, -0.28), (-0.45, 0.28), (0.45, 0.28))):
        lathe_obj(f'Plate_{i}', [(0.0, 0.0), (0.08, 0.0), (0.12, 0.015), (0.125, 0.02), (0.0, 0.006)], (dx + ox, dy + oy, top), M['plate'])
        lathe_obj(f'Glass_{i}', [(0.0, 0.0), (0.03, 0.0), (0.006, 0.01), (0.005, 0.1), (0.035, 0.13), (0.04, 0.2), (0.037, 0.2), (0.0, 0.135)],
                  (dx + ox + 0.16, dy + oy * 0.6, top), M['glass'])
    # pendant over the table
    cyl('Pendant_Dining_Cord', 0.003, 0.85, (dx, dy, 2.8 - 0.425), M['black_metal'], segs=8)
    lathe_obj('Pendant_Dining', [(0.0, 0.26), (0.03, 0.26), (0.05, 0.22), (0.22, 0.02), (0.225, 0.0), (0.2, 0.0), (0.04, 0.2), (0.0, 0.215)],
              (dx, dy, 1.68), M['black_metal'])
    sphere('Pendant_Dining_Bulb', 0.04, (dx, dy, 1.72), M['bulb'])
    spot_light('Light_Dining', (dx, dy, 1.71), 0.0, angle=110, radius=0.06).rotation_euler = (0, 0, 0)
    bpy.data.objects['Light_Dining'].rotation_euler = (math.pi, 0, 0)


def kitchen(M):
    y1 = 3.5
    cab_d = 0.62
    x_from, x_to = -4.4, 2.9
    n = 9
    w = (x_to - x_from) / n
    for i in range(n):
        cx = x_from + w * (i + 0.5)
        box(f'Base_Cab_{i}', (w - 0.006, cab_d - 0.02, 0.78), (cx, y1 - cab_d / 2, 0.1 + 0.39), M['cabinet'], bevel=0.002)
        box(f'Base_Pull_{i}', (0.18, 0.015, 0.012), (cx, y1 - cab_d - 0.005, 0.82), M['brass'], bevel=0.002)
        if i not in (3, 4):
            box(f'Wall_Cab_{i}', (w - 0.006, 0.34, 0.72), (cx, y1 - 0.17, 1.92), M['cabinet'], bevel=0.002)
            box(f'Wall_Pull_{i}', (0.012, 0.015, 0.14), (cx + w / 2 - 0.06, y1 - 0.345, 1.64), M['brass'], bevel=0.002)
    box('Toe_Kick', (x_to - x_from, cab_d - 0.08, 0.1), ((x_from + x_to) / 2, y1 - cab_d / 2 + 0.03, 0.05), M['black_metal'], bevel=0)
    box('Counter', (x_to - x_from + 0.02, cab_d + 0.02, 0.03), ((x_from + x_to) / 2, y1 - cab_d / 2 - 0.01, 0.895), M['counter'], bevel=0.003)
    box('Backsplash', (x_to - x_from, 0.012, 0.64), ((x_from + x_to) / 2, y1 - 0.006, 1.23), M['counter'], bevel=0)
    # open shelf in the gap
    gx = x_from + w * 4
    box('Open_Shelf', (w * 2, 0.26, 0.035), (gx, y1 - 0.13, 1.72), M['oak'], bevel=0.003)
    for i in range(4):
        lathe_obj(f'Shelf_Jar_{i}', [(0.0, 0.0), (0.045, 0.0), (0.045, 0.14), (0.03, 0.15), (0.0, 0.15)],
                  (gx - 0.45 + i * 0.3, y1 - 0.13, 1.7375), M['ceramic'] if i % 2 else M['ceramic_dark'])
    box('Induction', (0.6, 0.5, 0.006), (x_from + w * 1.5, y1 - 0.31, 0.913), M['induction'], bevel=0.002)
    # sink tap
    cyl('Tap_Base', 0.022, 0.06, (x_from + w * 6.5, y1 - 0.12, 0.94), M['tap'])
    cyl('Tap_Neck', 0.012, 0.3, (x_from + w * 6.5, y1 - 0.12, 1.09), M['tap'])
    cyl('Tap_Spout', 0.011, 0.2, (x_from + w * 6.5, y1 - 0.21, 1.235), M['tap'], rot=(math.pi / 2, 0, 0))
    box('Cutting_Board', (0.42, 0.03, 0.3), (x_from + w * 2.6, y1 - 0.06, 1.06), M['oak'], bevel=0.008, rot=0)
    plant('Herb', (x_from + w * 7.6, y1 - 0.28, 0.91), 0.3, 9, M, pot_r=0.065, leaf_size=0.06, spread=0.12)

    # island with the paper plane
    ix, iy = -1.45, 2.05
    box('Island', (2.1, 0.92, 0.86), (ix, iy, 0.45), M['cabinet'], bevel=0.003)
    box('Island_Top', (2.2, 1.0, 0.035), (ix, iy, 0.9), M['counter'], bevel=0.004)
    for i, (sx, sy) in enumerate(LAYOUT['stools']):
        cyl(f'Stool_Seat_{i}', 0.18, 0.04, (sx, sy, 0.66), M['oak'])
        for j in range(4):
            a = j * math.pi / 2 + math.pi / 4
            leg = cyl(f'Stool_Leg_{i}_{j}', 0.012, 0.66, (sx + math.cos(a) * 0.12, sy + math.sin(a) * 0.12, 0.32), M['black_metal'], segs=10)
            leg.rotation_euler = (math.sin(a) * 0.12, -math.cos(a) * 0.12, 0)
    lathe_obj('Fruit_Bowl', [(0.0, 0.0), (0.07, 0.0), (0.16, 0.08), (0.155, 0.085), (0.065, 0.008), (0.0, 0.008)], (ix - 0.55, iy + 0.15, 0.9175), M['ceramic'])
    for i in range(4):
        sphere(f'Lemon_{i}', 0.035, (ix - 0.55 + RNG.uniform(-0.06, 0.06), iy + 0.15 + RNG.uniform(-0.06, 0.06), 0.97 + (0.03 if i == 3 else 0)), M['fruit'], scale=(1, 1, 0.85), subd=2)
    # paper plane: nose toward the room, mid-launch tilt
    bm = bmesh.new()
    pts = [(0.0, 0.0, 0.0), (-0.26, 0.0, 0.0), (-0.26, 0.11, 0.015), (-0.26, -0.11, 0.015), (-0.26, 0.0, -0.035)]
    v = [bm.verts.new(p) for p in pts]
    bm.faces.new((v[0], v[1], v[2]))
    bm.faces.new((v[0], v[3], v[1]))
    bm.faces.new((v[0], v[4], v[1]))
    pl = obj_from_bm('Paper_Plane', bm, M['paper'])
    # mid-flight over the island, heading into the room
    pl.location = LAYOUT['plane']
    pl.rotation_euler = LAYOUT['plane_rot']
    pl.scale = (1.15, 1.15, 1.15)
    TRACK['plane'] = [pl]
    for k, xx in enumerate((ix - 0.6, ix + 0.6)):
        cyl(f'Pendant_Island_Cord_{k}', 0.003, 1.0, (xx, iy, 2.3), M['black_metal'], segs=8)
        sphere(f'Pendant_Island_{k}', 0.12, (xx, iy, 1.72), principled(f'Opal Glass {k}', '#f4efe6', 0.3, Transmission_Weight=0.6), subd=3)
        sphere(f'Pendant_Island_Bulb_{k}', 0.035, (xx, iy, 1.72), M['bulb'])
        point_light(f'Light_Island_{k}', (xx, iy, 1.72), 0.0, radius=0.1)


def reading_nook(M):
    ax, ay, rot = LAYOUT['armchair']
    rot = math.radians(rot)
    box('Rug_Round', (1.6, 1.6, 0.01), (ax - 0.25, ay + 0.25, 0.005), M['rug2'], bevel=0.0)
    bpy.data.objects['Rug_Round'].modifiers.clear()
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=64, radius1=0.75, radius2=0.75, depth=0.012)
    rr = obj_from_bm('Rug_Round_Disc', bm, M['rug2'], smooth=True)
    rr.location = (ax - 0.25, ay + 0.25, 0.006)
    bpy.data.objects.remove(bpy.data.objects['Rug_Round'])
    # armchair (local frame: front is -Y, rotated to face the room)
    parts = []

    def part(nm, size, loc, bevel, soft=True):
        o = box(nm, size, loc, M['armchair'], bevel=bevel, soft=soft)
        parts.append(o)
        return o
    part('Arm_Seat', (0.62, 0.6, 0.16), (0, 0.02, 0.36), 0.05)
    part('Arm_Base', (0.82, 0.78, 0.22), (0, 0, 0.17), 0.04)
    part('Arm_Back', (0.82, 0.2, 0.62), (0, 0.32, 0.62), 0.07)
    part('Arm_ArmL', (0.14, 0.74, 0.34), (-0.36, 0.02, 0.42), 0.06)
    part('Arm_ArmR', (0.14, 0.74, 0.34), (0.36, 0.02, 0.42), 0.06)
    pivot = bpy.data.objects.new('Armchair', None)
    coll('Home').objects.link(pivot)
    pivot.location = (ax, ay, 0.06)
    pivot.rotation_euler = (0, 0, rot)
    for p in parts:
        p.parent = pivot
    for i, (lx, ly) in enumerate(((-0.33, -0.3), (0.33, -0.3), (-0.33, 0.3), (0.33, 0.3))):
        leg = cyl(f'Arm_Leg_{i}', 0.018, 0.08, (lx, ly, -0.02), M['walnut'])
        leg.parent = pivot
    # the open picture book (placed in Mira's lap by place_props from the pose anchors): red boards, page
    # blocks printed with the picture-book spread, and one page caught mid-turn
    bk = bpy.data.objects.new('Book_Pivot', None)
    coll('Home').objects.link(bk)
    bk.parent = pivot
    bk.location = (0.02, -0.04, 0.455)
    bk.rotation_euler = (0, 0, math.radians(10))
    book_parts = []
    spread = dressing.art_material('Picture Book Spread', 'picture_book', rough=0.7)
    for side in (-1, 1):
        cover = box(f'Book_Cover_{side}', (0.2, 0.26, 0.006), (side * 0.1, 0, 0.0), M['book_red'], bevel=0.002)
        cover.parent = bk
        cover.rotation_euler = (0, side * math.radians(-8), 0)
        pages = box(f'Book_Pages_{side}', (0.19, 0.25, 0.012), (side * 0.098, 0, 0.009), M['book_pages'], bevel=0.003)
        pages.parent = bk
        pages.rotation_euler = (0, side * math.radians(-8), 0)
        # the reader sits at the book's +Y edge facing -Y, so their left is +X
        u0, u1 = (0.0, 0.5) if side > 0 else (0.5, 1.0)
        art = dressing.quad_uv(f'Book_Art_{side}', 0.185, 0.245, spread, uv=((u1, 0), (u0, 0), (u0, 1), (u1, 1)))
        art.parent = pages
        art.location = (0, 0, 0.0065)
        art.rotation_euler = (math.radians(90), 0, 0)
        book_parts += [cover, pages]
    # the turning page: hinged at the spine, lifted past vertical, its corner in Mum's hand
    bm = bmesh.new()
    lay = bm.loops.layers.uv.new('UVMap')
    nx, ny = 10, 4
    ang = math.radians(BOOK_PAGE_ANGLE)
    grid = []
    for j in range(ny + 1):
        row = []
        for i in range(nx + 1):
            r = i / nx * 0.185
            a = ang * (0.82 + 0.18 * (i / nx) ** 2) + 0.05 * (j / ny) * (i / nx)  # a soft curl toward the held corner
            row.append(bm.verts.new((-r * math.cos(a), (j / ny - 0.5) * 0.245, 0.016 + r * math.sin(a))))
        grid.append(row)
    for j in range(ny):
        for i in range(nx):
            f_ = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            for loop, (a_, b_) in zip(f_.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
                loop[lay].uv = (0.5 + 0.5 * a_ / nx, b_ / ny)
    page = obj_from_bm('Book_Turning_Page', bm, spread, smooth=True)
    page.parent = bk
    book_parts.append(page)
    TRACK['book'] = book_parts
    # knit throw over the arm
    th = box('Nook_Throw', (0.16, 0.6, 0.36), (0.36, 0.0, 0.48), M['throw'], bevel=0.05, soft=True)
    th.parent = pivot
    # floor lamp behind the chair
    lx, ly = LAYOUT['floor_lamp']
    cyl('Floor_Lamp_Base', 0.16, 0.025, (lx, ly, 0.0125), M['black_metal'])
    cyl('Floor_Lamp_Pole', 0.012, 1.45, (lx, ly, 0.75), M['black_metal'], segs=12)
    cyl('Floor_Lamp_Shade', 0.22, 0.28, (lx, ly, 1.55), M['shade'], r2=0.17, caps=False)
    sphere('Floor_Lamp_Bulb', 0.04, (lx, ly, 1.5), M['bulb'])
    point_light('Light_FloorLamp', (lx, ly, 1.5), 0.0, color=LAMP_2700K, radius=0.08)
    pool = spot_light('Light_FloorLamp_Pool', (lx, ly, 1.46), 0.0, angle=100, color=LAMP_2700K, radius=0.06)
    pool.rotation_euler = (math.pi, 0, 0)
    # side table + mug
    tx_, ty_ = LAYOUT['nook_table']
    cyl('Nook_Table_Top', 0.22, 0.03, (tx_, ty_, 0.52), M['walnut'])
    cyl('Nook_Table_Stem', 0.025, 0.5, (tx_, ty_, 0.26), M['black_metal'], segs=12)
    cyl('Nook_Table_Foot', 0.14, 0.02, (tx_, ty_, 0.01), M['black_metal'])
    cyl('Nook_Mug', 0.04, 0.09, (tx_ + 0.05, ty_ + 0.04, 0.58), M['mug'])
    plant('Plant_Nook', (2.25, -3.25, 0.0), 1.1, 18, M, pot_r=0.16, leaf_size=0.17, spread=0.35)


# ---------------------------------------------------------------- lighting rig

def build_world_and_sun():
    scn = bpy.context.scene
    world = bpy.data.worlds.new('Day to Night')
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = node(nt, 'ShaderNodeOutputWorld', (800, 0))
    sky = node(nt, 'ShaderNodeTexSky', (0, 150))
    kinds = [e.identifier for e in sky.bl_rna.properties['sky_type'].enum_items]
    sky.sky_type = 'MULTIPLE_SCATTERING' if 'MULTIPLE_SCATTERING' in kinds else 'NISHITA'  # Blender 4.x name
    sky.sun_disc = False
    sky.sun_elevation = math.radians(25)
    sky.sun_rotation = math.radians(90)
    bg_day = node(nt, 'ShaderNodeBackground', (250, 150), Strength=1.0)
    nt.links.new(sky.outputs['Color'], bg_day.inputs['Color'])
    bg_night = node(nt, 'ShaderNodeBackground', (250, -100), Color=srgb('#0b1630'), Strength=0.3)
    mix = node(nt, 'ShaderNodeMixShader', (550, 0), Fac=0.0)
    nt.links.new(bg_day.outputs[0], mix.inputs[1])
    nt.links.new(bg_night.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
    scn.world = world

    sun = bpy.data.lights.new('Sun', 'SUN')
    sun.angle = math.radians(1.2)
    so = bpy.data.objects.new('Sun', sun)
    coll('Lights').objects.link(so)
    # portal in the window so Cycles samples the sky through it efficiently
    pl = bpy.data.lights.new('Window_Portal', 'AREA')
    pl.shape = 'RECTANGLE'
    pl.size, pl.size_y = 4.4, 2.3
    pl.cycles.is_portal = True
    po = bpy.data.objects.new('Window_Portal', pl)
    po.location = (4.5 + 0.08, 0, 1.4)
    po.rotation_euler = (0, -math.pi / 2, 0)
    coll('Lights').objects.link(po)
    # soft ceiling bounce so night corners are not pitch black
    fl = bpy.data.lights.new('Night_Fill', 'AREA')
    fl.shape = 'RECTANGLE'
    fl.size, fl.size_y = 6, 4
    fl.color = srgb('#ffd7a8')[:3]
    fo = bpy.data.objects.new('Night_Fill', fl)
    fo.location = (0, 0, 2.7)
    coll('Lights').objects.link(fo)
    return sky, bg_day, bg_night, mix, so, fo


# ---------------------------------------------------------------- the story (animation)

def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def interp_keys(keys, f):
    """keys: [(frame, value...)] -> eased interpolation of tuples/floats between neighbours."""
    if f <= keys[0][0]:
        return keys[0][1]
    for (f0, v0), (f1, v1) in zip(keys, keys[1:]):
        if f0 <= f <= f1:
            t = smooth((f - f0) / (f1 - f0)) if f1 > f0 else 1
            if isinstance(v0, (int, float)):
                return v0 + (v1 - v0) * t
            return tuple(a + (b - a) * t for a, b in zip(v0, v1))
    return keys[-1][1]


def catmull(points, t):
    """Centripetal-ish Catmull-Rom through points (list of Vectors), t in 0..1 across all segments."""
    n = len(points) - 1
    s = min(max(t, 0.0), 1.0) * n
    i = min(int(s), n - 1)
    u = s - i
    p0 = points[max(i - 1, 0)]
    p1, p2 = points[i], points[i + 1]
    p3 = points[min(i + 2, n)]
    return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3)


# Story beats (see docs/STORYBOARD.md). Frames are 0..239.
ZONES = {
    'living': Vector((-1.15, -1.75, 0.45)),
    'dining': Vector((1.6, 0.95, 0.95)),    # v1 (1.45, 1.15, 0.92): centred on the birthday group
    'kitchen': Vector((-1.8, 1.3, 1.3)),    # v1 (-1.25, 1.75, 1.2): centred on Leo and Mum
    'catbed': Vector((3.5, -0.35, 0.16)),  # v1 (3.45, 1.0, 0.1): the bed moved into Alaro's line of sight
    'book': Vector((3.35, -1.85, 0.85)),    # v1 (3.15, -2.45, 0.5): the armchair moved out of the corner
    'room': Vector((1.2, -0.2, 0.9)),
}
# Alaro aim per frame: (frame, zone) holds; transitions ease between them.
AIM = [(0, 'rest'), (43, 'rest'), (54, 'hero'), (61, 'hero'), (68, 'living'), (84, 'living'), (96, 'dining'), (113, 'dining'),
       (122, 'kitchen'), (137, 'kitchen'), (147, 'catbed'), (159, 'catbed'), (172, 'book'), (190, 'book'),
       (198, 'room'), (240, 'room')]
POV = (61, 199)  # frames rendered from Alaro's lens

# Time of day per frame (hours)
CLOCK = [(0, 15.67), (43, 16.17), (60, 16.5), (86, 17.75), (115, 18.33), (139, 18.83), (161, 19.67), (192, 20.5), (239, 21.17)]


# exposure per frame (AgX), tuned on test renders
EXPOSURE = [(0, 1.7), (25, 2.0), (43, 1.8), (60, 1.8), (61, 1.9), (100, 2.0), (128, 2.2), (150, 1.9), (165, 1.5), (199, 1.4), (239, 1.4)]


def time_at(f):
    return interp_keys([(k, v) for k, v in CLOCK], f)


class Rig:
    pass


def build_rig(alaro_root):
    """Camera, lights and the animated pieces of the story."""
    R = Rig()
    R.alaro = alaro_root
    R.pan = bpy.data.objects['Alaro_Pan']
    R.tilt = bpy.data.objects['Alaro_Tilt']
    R.lens = bpy.data.objects['Lens_Glass']
    cam_data = bpy.data.cameras.new('Story Camera')
    cam_data.sensor_width = 36
    cam_data.clip_start = 0.005
    R.cam = bpy.data.objects.new('Story Camera', cam_data)
    coll('Lights').objects.link(R.cam)
    bpy.context.scene.camera = R.cam
    R.sky, R.bg_day, R.bg_night, R.wmix, R.sun, R.fill = build_world_and_sun()
    R.status = bpy.data.materials['Alaro Status Light']
    R.bulb = bpy.data.materials['Warm Bulb']
    R.flame = bpy.data.materials['Candle Flame']
    R.flames = [o for o in bpy.data.objects if o.name.startswith('Flame_')]
    R.lamps = {n: bpy.data.objects[n] for n in ('Light_TableLamp', 'Light_FloorLamp', 'Light_Dining', 'Light_Island_0', 'Light_Island_1',
                                                 'Light_TableLamp_Pool', 'Light_FloorLamp_Pool')}
    for L in R.lamps.values():
        L.data.color = srgb(LAMP_2700K)[:3]
    R.candles = bpy.data.objects['Light_Candles']
    gb = bpy.data.materials.get('Garden Backdrop')
    R.garden = gb.node_tree.nodes['Emission'] if gb and gb.users else None
    return R


def pov_zoom(f):
    """0 while Alaro turns, easing to 1 while it holds on a moment (digital zoom in)."""
    for (f0, z0), (f1, z1) in zip(AIM, AIM[1:]):
        if f0 <= f <= f1:
            if z0 != z1 or z0 in ('room', 'hero', 'rest'):
                return 0.0
            return smooth(min(f - f0, f1 - f) / 5.0)
    return 0.0


def pov_zone(f):
    for (f0, z0), (f1, z1) in zip(AIM, AIM[1:]):
        if f0 <= f <= f1:
            return z0 if z0 == z1 else None
    return None


def pan_origin(R):
    return R.pan.matrix_world.translation.copy()


def aim_angles(R, target):
    o = R.tilt.matrix_world.translation
    d = target - o
    root_rot = R.alaro.rotation_euler.z
    pan = math.atan2(d.y, d.x) - root_rot + math.pi / 2  # Alaro's front is its local -Y
    tilt = math.atan2(-(d.z), math.hypot(d.x, d.y))      # positive tilts down
    return pan, tilt


def hero_cam_pos():
    return Vector((-3.55, 0.82, 1.02))


def set_alaro_aim(R, f):
    # find the two aim beats around f
    beats = AIM
    for (f0, z0), (f1, z1) in zip(beats, beats[1:]):
        if f0 <= f <= f1:
            break
    def ang(z):
        if z == 'rest':
            return 0.0, math.radians(6)
        tgt = hero_cam_pos() if z == 'hero' else ZONES[z]
        return aim_angles(R, tgt)
    p0, t0 = ang(z0)
    p1, t1 = ang(z1)
    # shortest pan path
    while p1 - p0 > math.pi:
        p1 -= 2 * math.pi
    while p0 - p1 > math.pi:
        p1 += 2 * math.pi
    t = smooth((f - f0) / max(f1 - f0, 1))
    pan, tilt = p0 + (p1 - p0) * t, t0 + (t1 - t0) * t
    R.pan.rotation_euler = (0, 0, pan)
    R.tilt.rotation_euler = (tilt, 0, 0)
    bpy.context.view_layer.update()


def lens_frame(R):
    """World position of the lens front and Alaro's viewing direction."""
    mw = R.tilt.matrix_world
    fwd = (mw.to_3x3() @ Vector((0, -1, 0))).normalized()
    up = (mw.to_3x3() @ Vector((0, 0, 1))).normalized()
    front = mw @ Vector((0, -(alaro.APEX + 0.25) * alaro.C, alaro.LENS_Y * alaro.C))
    return front, fwd, up


def set_camera(R, f):
    cam = R.cam
    if POV[0] <= f < POV[1]:
        front, fwd, up = lens_frame(R)
        pos = front + fwd * 0.03
        look = pos + fwd
        zone = pov_zone(f)
        zl = {'living': 30, 'dining': 52, 'kitchen': 42, 'catbed': 44, 'book': 46}.get(zone, 17)
        cam.data.lens = 17 + (zl - 17) * pov_zoom(f)
        # shallow focus on the holds: focus on the moment, the room behind softens a little
        cam.data.dof.use_dof = zone in ZONES and pov_zoom(f) > 0.05
        if cam.data.dof.use_dof:
            cam.data.dof.focus_distance = (ZONES[zone] - pos).length
            cam.data.dof.aperture_fstop = 4.0 + 8.0 * (1 - pov_zoom(f))
        cam.location = pos
        cam.rotation_euler = (look - pos).to_track_quat('-Z', 'Y').to_euler()
        return
    alaro_c = R.alaro.matrix_world.translation + Vector((0, 0, 0.085))
    if f < 43:
        pts = [Vector((3.7, -2.95, 1.72)), Vector((2.7, -2.2, 1.6)), Vector((0.2, -0.2, 1.35)), hero_cam_pos()]
        tg = [Vector((-1.6, 0.7, 1.05)), Vector((-2.1, 0.5, 0.95)), Vector((-3.4, 0.25, 0.86)), alaro_c]
        t = smooth(f / 43) * 0.25 + (f / 43) * 0.75
        pos, look = catmull(pts, t), catmull(tg, t)
        lens = 22 + (50 - 22) * smooth(f / 43)
    elif f < 61:
        # hero 3/4, then push along Alaro's axis into the black glass
        front, fwd, up = lens_frame(R)
        k = smooth((f - 47) / 13) if f >= 47 else 0.0
        hero = hero_cam_pos()
        axis_pt = front + fwd * 0.55
        close = front + fwd * 0.012
        pos = hero.lerp(axis_pt, smooth((f - 43) / 10)) if f < 53 else axis_pt.lerp(close, smooth((f - 53) / 8))
        look = alaro_c.lerp(front, k)
        lens = 50
    else:
        # pull back out of the glass, then up and away: Alaro on the sideboard, the home lit for the night
        front, fwd, up = lens_frame(R)
        k = smooth((f - 199) / 40)
        pts = [front + fwd * 0.012, front + fwd * 0.35 + Vector((0.0, -0.05, 0.05)), Vector((-2.75, -0.55, 1.25)),
               Vector((-1.2, -1.2, 1.6)), Vector((-0.45, -1.4, 1.65))]
        pos = catmull(pts, k)
        tg = [front, alaro_c, alaro_c, Vector((-3.5, 0.2, 0.86)), Vector((-3.0, 0.4, 0.95))]
        look = catmull(tg, k)
        lens = 50 + (30 - 50) * smooth((f - 205) / 34)
    cam.location = pos
    cam.rotation_euler = (look - pos).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = lens
    # shallow focus on Alaro in the close shots
    dist = (alaro_c - pos).length
    cam.data.dof.use_dof = dist < 1.6
    cam.data.dof.focus_distance = max(dist, 0.05)
    cam.data.dof.aperture_fstop = 2.8


def set_lighting(R, f):
    h = time_at(f)
    # sun: elevation falls from ~28° at 15:40 to below the horizon after 19:05
    el = math.radians(28 - (h - 15.67) * 8.6)
    az = math.radians(18)
    day = max(0.0, min(1.0, (h - 19.3) / -0.9 if h > 18.4 else 1.0))
    d = Vector((-math.cos(el) * math.cos(az), -math.cos(el) * math.sin(az), -math.sin(el)))
    R.sun.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    warm = smooth((h - 16.3) / 2.5)
    R.sun.data.color = (1.0, 0.93 - 0.35 * warm, 0.84 - 0.6 * warm)
    # the sky follows the real sun, but the light lingers as a low golden beam until ~19:45 so Milo
    # stretches in the last of the sun (the sun lamp never drops below 5 degrees)
    R.sun.data.energy = max(0.0, 5.0 * (1 - smooth((h - 18.95) / 0.8)))
    R.sky.sun_elevation = max(el, math.radians(-2))
    el_light = max(el, math.radians(5))
    d = Vector((-math.cos(el_light) * math.cos(az), -math.cos(el_light) * math.sin(az), -math.sin(el_light)))
    R.sun.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    R.bg_day.inputs['Strength'].default_value = 1.1 * day + 0.02
    R.wmix.inputs['Fac'].default_value = smooth((h - 19.0) / 1.0)
    if R.garden is not None:
        R.garden.inputs['Strength'].default_value = 2.0 * day * (1 - 0.45 * warm) + 0.01
    if getattr(R, 'neighbour', None) is not None:
        R.neighbour.node_tree.nodes['Emission'].inputs['Strength'].default_value = 1.2 * smooth((h - 18.9) / 0.8)
    R.bg_night.inputs['Strength'].default_value = 0.25
    # lamps fade on from 18:50; candles burn while the birthday plays
    lamps = smooth((h - 18.75) / 0.9)
    # the far tree line dims and warms with the light; the street lamp comes on with the house lamps
    tl = dressing.OUTSIDE.get('treeline')
    if tl is not None:
        tl.inputs['Strength'].default_value = 2.2 * day * (1 - 0.35 * warm) + 0.004
        dressing.OUTSIDE['treeline_tint'].inputs['B'].default_value = (1.0, 0.95 - 0.2 * warm, 0.88 - 0.35 * warm, 1.0)
    if 'street' in dressing.OUTSIDE:
        dressing.OUTSIDE['street'].energy = 60 * smooth((h - 18.9) / 0.6)
    R.lamps['Light_TableLamp'].data.energy = 7 * lamps
    R.lamps['Light_FloorLamp'].data.energy = 14 * lamps
    R.lamps['Light_TableLamp_Pool'].data.energy = 14 * lamps
    R.lamps['Light_FloorLamp_Pool'].data.energy = 30 * lamps
    R.lamps['Light_Dining'].data.energy = 40 * lamps
    R.lamps['Light_Island_0'].data.energy = 9 * lamps
    R.lamps['Light_Island_1'].data.energy = 9 * lamps
    R.bulb.node_tree.nodes['Emission'].inputs['Strength'].default_value = 25 * lamps
    R.fill.data.energy = 9 * lamps  # just enough that night corners are not pitch black
    candle = 1.0 if 84 <= f <= 112 else 0.0
    flicker = 0.85 + 0.15 * math.sin(f * 2.3) * math.sin(f * 0.9 + 1)
    R.candles.data.energy = 1.6 * candle * flicker
    R.flame.node_tree.nodes['Emission'].inputs['Strength'].default_value = 40 * candle * flicker
    for fl in R.flames:
        fl.hide_render = not candle
    # Alaro status light wakes at frame 30
    R.status.node_tree.nodes['Emission'].inputs['Strength'].default_value = 18 * smooth((f - 30) / 8)
    # exposure follows the light
    scn = bpy.context.scene
    scn.view_settings.exposure = interp_keys(EXPOSURE, f)


def apply_frame(R, f):
    bpy.context.scene.frame_set(f)
    set_alaro_aim(R, f)
    set_camera(R, f)
    set_lighting(R, f)
    bpy.context.view_layer.update()


def project(R, objs):
    scn = bpy.context.scene
    cam = R.cam
    xs, ys, vis = [], [], 0
    dg = bpy.context.evaluated_depsgraph_get()
    for o in objs:
        oe = o.evaluated_get(dg)
        for c in oe.bound_box:
            w = oe.matrix_world @ Vector(c)
            p = world_to_camera_view(scn, cam, w)
            if p.z <= 0:
                continue
            xs.append(p.x)
            ys.append(1 - p.y)
            vis += 1
    if not xs:
        return None
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    if x1 < 0 or x0 > 1 or y1 < 0 or y0 > 1:
        return None
    return [round(x0, 4), round(y0, 4), round(x1, 4), round(y1, 4)]


def frame_data(R, f):
    d = {'f': f, 'time': round(time_at(f), 3), 'pov': POV[0] <= f < POV[1]}
    for k, objs in TRACK.items():
        b = project(R, objs)
        if b:
            d[k] = b
    front, _, _ = lens_frame(R)
    p = world_to_camera_view(bpy.context.scene, R.cam, front)
    if p.z > 0:
        d['lens'] = [round(p.x, 4), round(1 - p.y, 4)]
    return d


# ---------------------------------------------------------------- build / render

def load_anchors():
    path = os.path.join(PEOPLE_DIR, 'anchors.json')
    if os.path.exists(path):
        with open(path) as fh:
            return json.load(fh)
    return {}


def place_props(anchors):
    """Props that sit in a statue's hand follow the pose (make_people.py writes anchors.json)."""
    ob = bpy.data.objects
    if 'plane' in anchors and 'Paper_Plane' in ob:
        ob['Paper_Plane'].location = anchors['plane']
        ob['Paper_Plane'].rotation_euler = anchors['plane_rot']
    if 'book' in anchors and 'Book_Pivot' in ob:
        bk = ob['Book_Pivot']
        bk.parent = None
        bk.location = anchors['book']
        bk.rotation_euler = anchors['book_rot']
    if 'zoe_cushion' in anchors and 'Pillow_0' in ob:
        ob['Pillow_0'].location = anchors['zoe_cushion']
        ob['Pillow_0'].rotation_euler = anchors.get('zoe_cushion_rot', (0, 0, 0))
        ob['Pillow_0'].scale = (0.62, 0.9, 0.62)
    bpy.context.view_layer.update()


def add_people():
    """Link the clay-statue figures and add them to their moment's tracked box."""
    found = statue.link_people(['tower', 'sofa', 'cake', 'plane', 'catbed', 'book'], PEOPLE_DIR)
    for mo, objs in found.items():
        TRACK[mo] = TRACK.get(mo, []) + objs
    if found.get('sofa') and 'Pillow_0' in bpy.data.objects:
        TRACK['sofa'] = found['sofa'] + [bpy.data.objects['Pillow_0'], bpy.data.objects['Sofa_Seat_0']]
    return found


def build_scene(people=True):
    alaro.reset_scene()
    scn = bpy.context.scene
    scn.unit_settings.length_unit = 'METERS'
    M = make_materials()
    me = sys.modules[__name__]
    dressing.upgrade_materials(me, M)
    build_room(M)
    root = sideboard_and_alaro(M)
    living(M)
    window_corner(M)
    dining(M)
    kitchen(M)
    reading_nook(M)
    neighbour = dressing.dress(me, M)
    place_props(load_anchors())
    if people:
        add_people()
    R = build_rig(root)
    R.neighbour = neighbour
    scn.frame_start, scn.frame_end = 0, FRAMES - 1
    return R


def enable_gpu():
    """Switch Cycles to the first GPU backend that has a device. Returns (backend, description), or None for CPU."""
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for kind in ('OPTIX', 'CUDA', 'HIP', 'METAL', 'ONEAPI'):
        try:
            prefs.compute_device_type = kind
        except (TypeError, ValueError):
            continue
        if hasattr(prefs, 'refresh_devices'):
            prefs.refresh_devices()
        else:
            prefs.get_devices()
        gpus = [d for d in prefs.devices if d.type == kind]
        if gpus:
            for d in prefs.devices:
                d.use = d.type == kind
            bpy.context.scene.cycles.device = 'GPU'
            return kind, f"{kind}: {', '.join(d.name for d in gpus)}"
    return None


DEVICE = 'CPU'


def setup_cycles(res_x, res_y, samples, gpu=False, final=False):
    global DEVICE
    scn = bpy.context.scene
    try:
        bpy.ops.preferences.addon_enable(module='cycles')
    except Exception:
        pass
    scn.render.engine = 'CYCLES'
    c = scn.cycles
    c.device = 'CPU'
    DEVICE = f'CPU ({os.cpu_count()} threads)'
    backend = None
    if gpu:
        found = enable_gpu()
        if found:
            backend, DEVICE = found
            print(f'GPU rendering on {DEVICE}', flush=True)
        else:
            print('*' * 72 + '\nWARNING: no supported GPU found (OptiX / CUDA / HIP / Metal / oneAPI).\n'
                  'Rendering on the CPU instead: this works but is many times slower.\n' + '*' * 72, flush=True)
    c.samples = samples
    c.use_adaptive_sampling = True
    c.adaptive_threshold = 0.005 if final else 0.05
    c.adaptive_min_samples = 32 if final else 4
    # denoise with albedo + normal guides so knit, book spines and fine edges survive
    c.use_denoising = True
    c.denoiser = 'OPTIX' if backend == 'OPTIX' else 'OPENIMAGEDENOISE'
    c.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
    try:
        c.denoising_prefilter = 'ACCURATE'
        c.denoising_quality = 'HIGH'
    except (AttributeError, TypeError):
        pass
    if hasattr(c, 'use_light_tree'):
        c.use_light_tree = True
    # final: the full light paths; the draft trims bounces to fit a CPU budget
    c.max_bounces = 12 if final else 5
    c.diffuse_bounces = 6 if final else 2
    c.glossy_bounces = 6 if final else 2
    c.transmission_bounces = 12 if final else 4
    c.volume_bounces = 2 if final else 0
    c.transparent_max_bounces = 16 if final else 8
    c.blur_glossy = 0.5 if final else 1.0
    if os.environ.get('ALARO_FASTGI', '0') == '1':
        # one real diffuse bounce, then an AO-style approximation: ~2x faster on this interior
        c.use_fast_gi = True
        c.fast_gi_method = 'ADD'
        c.ao_bounces_render = 1
        bpy.context.scene.world.light_settings.distance = 3.0
    c.caustics_reflective = False
    c.caustics_refractive = False
    c.sample_clamp_indirect = 10.0 if final else 6.0
    c.light_sampling_threshold = 0.01
    if hasattr(c, 'use_auto_tile'):
        c.use_auto_tile = True  # tile size: auto
    c.pixel_filter_type = 'BLACKMAN_HARRIS'
    c.filter_width = 1.5
    scn.render.use_motion_blur = False  # frames are scrubbed by scroll: no blur
    scn.render.use_persistent_data = True
    scn.render.resolution_x, scn.render.resolution_y = res_x, res_y
    scn.render.resolution_percentage = 100
    scn.render.film_transparent = False
    scn.view_settings.view_transform = 'AgX'
    try:
        scn.view_settings.look = 'AgX - Medium High Contrast'
    except TypeError:
        pass
    scn.render.image_settings.file_format = 'PNG'
    scn.render.image_settings.color_mode = 'RGB'
    scn.render.image_settings.color_depth = '8'


# ---------------------------------------------------------------- the camera's lens, in post
# A real lens and sensor, applied to the 8-bit frame with numpy (bundled with Blender), so it behaves the
# same in every Blender version: slight vignetting, a hint of lateral chromatic aberration toward the
# corners, and fine luminance grain (about 1.5 %), seeded per frame so re-renders match. No blur.

LENS = {'vignette': 0.17, 'ca': 0.00035, 'grain': 0.015, 'warm': (1.03, 1.0, 0.95)}


def lens_post(path, f, outputs):
    """Load a rendered PNG, apply the lens look, write it to each (path, format, quality) in outputs."""
    import numpy as np
    im = bpy.data.images.load(path, check_existing=False)
    w, h = im.size
    px = np.empty(w * h * 4, dtype=np.float32)
    im.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    rgb = px[:, :, :3]
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) / 2, (h - 1) / 2
    nx, ny = (xs - cx) / cx, (ys - cy) / cx
    r2 = nx * nx + ny * ny

    def sample(chan, scale):
        # resample one channel scaled about the centre (bilinear); tiny scales -> sub-pixel shifts only at the edges
        sx = cx + (xs - cx) / scale
        sy = cy + (ys - cy) / scale
        x0 = np.clip(np.floor(sx).astype(np.int32), 0, w - 2)
        y0 = np.clip(np.floor(sy).astype(np.int32), 0, h - 2)
        fx = np.clip(sx - x0, 0, 1)
        fy = np.clip(sy - y0, 0, 1)
        c = chan
        return (c[y0, x0] * (1 - fx) * (1 - fy) + c[y0, x0 + 1] * fx * (1 - fy) + c[y0 + 1, x0] * (1 - fx) * fy + c[y0 + 1, x0 + 1] * fx * fy)
    ca = LENS['ca']
    if ca:
        rgb[:, :, 0] = sample(rgb[:, :, 0].copy(), 1 + ca)
        rgb[:, :, 2] = sample(rgb[:, :, 2].copy(), 1 - ca)
    lin = np.power(np.clip(rgb, 0, 1), 2.2) * np.array(LENS['warm'], dtype=np.float32)
    lin *= (1 - LENS['vignette'] * np.power(np.clip(r2 / (1 + (h / w) ** 2), 0, 1), 1.25))[:, :, None]
    rgb = np.power(lin, 1 / 2.2)
    rng = np.random.default_rng(1000 + f)
    luma = rgb.mean(axis=2, keepdims=True)
    amp = LENS['grain'] * (0.35 + 1.3 * np.sqrt(np.clip(luma * (1 - luma), 0, 0.25)))
    rgb = np.clip(rgb + rng.standard_normal((h, w, 1)).astype(np.float32) * amp, 0, 1)
    px[:, :, :3] = rgb
    px[:, :, 3] = 1.0
    im.pixels.foreach_set(px.ravel())
    for out_path, fmt, quality in outputs:
        im.file_format = fmt
        im.filepath_raw = out_path
        try:
            im.save(filepath=out_path, quality=quality)
        except TypeError:
            im.save()
    bpy.data.images.remove(im)


def bake_keyframes(R):
    """Keyframe the per-frame state so home.blend scrubs in Blender's timeline."""
    for f in range(FRAMES):
        apply_frame(R, f)
        R.cam.keyframe_insert('location', frame=f)
        R.cam.keyframe_insert('rotation_euler', frame=f)
        R.cam.data.keyframe_insert('lens', frame=f)
        R.pan.keyframe_insert('rotation_euler', frame=f)
        R.tilt.keyframe_insert('rotation_euler', frame=f)
        R.sun.keyframe_insert('rotation_euler', frame=f)
        R.sun.data.keyframe_insert('energy', frame=f)
        R.sun.data.keyframe_insert('color', frame=f)
        for L in list(R.lamps.values()) + [R.candles, R.fill]:
            L.data.keyframe_insert('energy', frame=f)
        R.wmix.inputs['Fac'].keyframe_insert('default_value', frame=f)
        R.bg_day.inputs['Strength'].keyframe_insert('default_value', frame=f)
        for m in (R.status, R.bulb, R.flame):
            m.node_tree.nodes['Emission'].inputs['Strength'].keyframe_insert('default_value', frame=f)
        if R.garden is not None:
            R.garden.inputs['Strength'].keyframe_insert('default_value', frame=f)
        if getattr(R, 'neighbour', None) is not None:
            R.neighbour.node_tree.nodes['Emission'].inputs['Strength'].keyframe_insert('default_value', frame=f)
        if 'treeline' in dressing.OUTSIDE:
            dressing.OUTSIDE['treeline'].inputs['Strength'].keyframe_insert('default_value', frame=f)
            dressing.OUTSIDE['treeline_tint'].inputs['B'].keyframe_insert('default_value', frame=f)
        if 'street' in dressing.OUTSIDE:
            dressing.OUTSIDE['street'].keyframe_insert('energy', frame=f)
        bpy.context.scene.view_settings.keyframe_insert('exposure', frame=f)
        for fl in R.flames:
            fl.keyframe_insert('hide_render', frame=f)


def flatten_materials_for_gltf():
    """glTF only carries plain PBR values: replace each procedural texture with its average tone.
    Runs after home.blend is saved, so the .blend keeps the full materials."""
    for m in bpy.data.materials:
        if not m.use_nodes or not m.node_tree:
            continue
        nt = m.node_tree
        bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None)
        emis = next((n for n in nt.nodes if n.type == 'EMISSION'), None)
        if bsdf is None and emis is None:
            # mix-shader materials (shades, leaves, curtains, window glass): fall back to a Principled stand-in
            bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
            bsdf.inputs['Base Color'].default_value = m.diffuse_color
            bsdf.inputs['Roughness'].default_value = 0.6
            if m.name == 'Window Glass':
                bsdf.inputs['Transmission Weight'].default_value = 1.0
                bsdf.inputs['Roughness'].default_value = 0.02
            if m.name == 'Sheer Curtain':
                bsdf.inputs['Alpha'].default_value = 0.45
        if bsdf is not None:
            if bsdf.inputs['Base Color'].is_linked:
                bsdf.inputs['Base Color'].default_value = m.diffuse_color
            if bsdf.inputs['Roughness'].is_linked:
                bsdf.inputs['Roughness'].default_value = m.roughness if m.roughness != 0.4 else 0.6
            for name in ('Base Color', 'Roughness', 'Normal'):
                for l in list(bsdf.inputs[name].links):
                    nt.links.remove(l)
            if out is not None and not (emis and out.inputs['Surface'].links and out.inputs['Surface'].links[0].from_node == emis):
                for l in list(out.inputs['Surface'].links):
                    nt.links.remove(l)
                nt.links.new(bsdf.outputs[0], out.inputs['Surface'])


def export_home_glb(path):
    """The whole home as one GLB: geometry, flat PBR materials, lamps, the story camera and its animation."""
    flatten_materials_for_gltf()
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                              export_yup=True, export_cameras=True, export_lights=True,
                              export_animations=True, export_extras=True)


def frame_order(start, end):
    """Coarse to fine: every 16th frame, then every 8th, ... so a partial set is usable at any time."""
    order, seen = [], set()
    for st in (16, 8, 4, 2, 1):
        for f in range(start, end + 1, st):
            if f not in seen:
                seen.add(f)
                order.append(f)
    return order


def write_track(R, paths):
    data = []
    for f in range(FRAMES):
        apply_frame(R, f)
        data.append(frame_data(R, f))
    for path in paths:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w') as fh:
            json.dump({'frames': FRAMES, 'data': data}, fh, separators=(',', ':'))
    print('wrote track.json', flush=True)


def write_render_info(path, w, h, samples, final, frames_done, seconds):
    import datetime
    c = bpy.context.scene.cycles
    lines = [
        'Alaro home story v2 (clay statues)',
        f'resolution: {w} x {h}',
        f'frames: {frames_done} / {FRAMES}',
        f'quality: {"final" if final else "draft"}; samples {samples}, adaptive threshold {c.adaptive_threshold:.3f}, denoiser {c.denoiser}',
        f'bounces: max {c.max_bounces}, diffuse {c.diffuse_bounces}, glossy {c.glossy_bounces}, transmission {c.transmission_bounces}, volume {c.volume_bounces}',
        f'statue finish: {statue.STATUE_MATERIAL}',
        f'device: {DEVICE}',
        f'blender: {bpy.app.version_string}',
        f'date: {datetime.datetime.now().isoformat(timespec="seconds")}',
        f'render time this run: {seconds / 3600:.2f} h',
        'outputs: fNNN.png (8-bit sRGB master), fNNN.webp (quality 95), track.json',
    ]
    with open(path, 'w') as fh:
        fh.write('\n'.join(lines) + '\n')


def zip_set(set_dir, zip_path):
    """The file to bring back: WebP frames + track.json + render-info.txt (no PNGs: those are the local master)."""
    import zipfile
    names = sorted(n for n in os.listdir(set_dir) if n.endswith('.webp')) + ['track.json', 'render-info.txt']
    with zipfile.ZipFile(zip_path + '.part', 'w', compression=zipfile.ZIP_STORED) as z:
        for n in names:
            p = os.path.join(set_dir, n)
            if os.path.exists(p):
                z.write(p, n)
    os.replace(zip_path + '.part', zip_path)
    print(f'zipped {len(names) - 2} frames into {zip_path} ({os.path.getsize(zip_path) / 1e6:.0f} MB)', flush=True)


def main(argv):
    import time
    if '--' in argv:  # blender -b -P build_home.py -- --render ...
        argv = argv[argv.index('--') + 1:]

    def arg(name, default=None):
        # the last occurrence wins, so launcher defaults can be overridden (render_gpu.command --w 2560)
        if name not in argv:
            return default
        return argv[len(argv) - 1 - argv[::-1].index(name) + 1]

    out = arg('--out', os.path.join(HERE, 'frames'))
    os.makedirs(out, exist_ok=True)
    R = build_scene(people='--no-people' not in argv)

    if '--blend' in argv or '--glb' in argv:
        # the saved file opens ready to render the final frames (Cycles, 3840x2160, 512 spp, AgX, keyed exposure)
        setup_cycles(3840, 2160, 512, final=True)
        bake_keyframes(R)
        bpy.context.scene.frame_set(0)
        if '--blend' in argv:
            try:
                bpy.ops.file.pack_all()  # textures, art and statue figures travel inside the file
            except RuntimeError as e:
                print('pack_all:', e, flush=True)
            bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'home.blend'), compress=True)
            print('saved home.blend', flush=True)
        if '--glb' in argv:
            export_home_glb(os.path.join(HERE, 'alaro-home.glb'))
        return

    if '--test' in argv:
        frames = [int(x) for x in arg('--test').split(',')]
        setup_cycles(int(arg('--w', 640)), int(arg('--h', 360)), int(arg('--samples', 24)), gpu='--gpu' in argv,
                     final='--final' in argv)
        tdir = os.path.join(out, arg('--set', 'test'))
        os.makedirs(tdir, exist_ok=True)
        for f in frames:
            apply_frame(R, f)
            raw = os.path.join(tdir, f'.raw_f{f:03d}.png')
            bpy.context.scene.render.filepath = raw
            bpy.ops.render.render(write_still=True)
            lens_post(raw, f, [(os.path.join(tdir, f'f{f:03d}.png'), 'PNG', 0)])
            os.remove(raw)
            print('test frame', f, json.dumps(frame_data(R, f)), flush=True)
        return

    final = '--final' in argv
    set_name = arg('--set', '4k' if final else 'hi')
    set_dir = os.path.join(out, set_name)
    if '--data' in argv or '--render' in argv:
        write_track(R, [os.path.join(out, 'track.json'), os.path.join(set_dir, 'track.json')])

    if '--render' in argv:
        w = int(arg('--w', 3840 if final else 960))
        h = int(arg('--h', w * 9 // 16))
        samples = int(arg('--samples', 512 if final else 12))
        setup_cycles(w, h, samples, gpu='--gpu' in argv, final=final)
        start, end = int(arg('--start', 0)), int(arg('--end', FRAMES - 1))
        webp = final or '--webp' in argv
        todo = []
        for f in frame_order(start, end):
            png = os.path.join(set_dir, f'f{f:03d}.png')
            done = os.path.exists(png) and (not webp or os.path.exists(png[:-4] + '.webp'))
            if done and '--force' not in argv:
                continue
            todo.append(f)
        print(f'{len(todo)} frames to render at {w}x{h}, {samples} samples on {DEVICE} '
              f'({end - start + 1 - len(todo)} already done)', flush=True)
        t_start = time.time()
        times = []
        for i, f in enumerate(todo):
            t0 = time.time()
            apply_frame(R, f)
            raw = os.path.join(set_dir, f'.raw_f{f:03d}.png')
            bpy.context.scene.render.filepath = raw
            bpy.ops.render.render(write_still=True)
            png = os.path.join(set_dir, f'f{f:03d}.png')
            outs = [(png, 'PNG', 0)] + ([(png[:-4] + '.webp', 'WEBP', 95)] if webp else [])
            lens_post(raw, f, outs)
            os.remove(raw)
            times.append(time.time() - t0)
            avg = sum(times[-12:]) / len(times[-12:])
            left = len(todo) - i - 1
            print(f'rendered {f} ({i + 1}/{len(todo)}) in {times[-1]:.0f} s; about {left * avg / 3600:.1f} h left', flush=True)
            if i + 1 == 3 or (i + 1 == len(todo) and len(todo) < 3):
                print(f'ESTIMATE: ~{avg:.0f} s per frame -> all {len(todo)} frames in about {len(todo) * avg / 3600:.1f} h '
                      f'(--w 2560 is about 2.2x faster)', flush=True)
        n_done = sum(1 for f in range(FRAMES) if os.path.exists(os.path.join(set_dir, f'f{f:03d}.png')))
        write_render_info(os.path.join(set_dir, 'render-info.txt'), w, h, samples, final, n_done, time.time() - t_start)
        if '--zip' in argv:
            zip_set(set_dir, os.path.join(HERE, arg('--zip-name', f'alaro-frames-{set_name}.zip')))


if __name__ == '__main__':
    main(sys.argv[1:])

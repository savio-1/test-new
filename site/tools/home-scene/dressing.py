"""
Alaro home v2: the lived-in layer.

build_home.py builds the room, the furniture and the story; this module makes it read as a real family
home: photographic (Poly Haven, CC0) textures with wear, dust and fingerprints, and the everyday things a
family leaves around (BRIEF section 4). Everything is placed by hand, a few degrees off the grid.

    dress.upgrade_materials(H, M)   # before the furniture is built: textured versions of the main materials
    dress.dress(H, M)               # after: clutter, art, fittings, the garden outside

H is the build_home module (box, cyl, sphere, lathe_obj, principled, ...), passed in to avoid an import cycle.
"""

import math
import os
import random

import bpy
import bmesh
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
PH = os.path.join(HERE, 'assets', 'polyhaven')
ART = os.path.join(HERE, 'assets', 'art')
H = None
RNG = random.Random(21)


def V(*a):
    return Vector(a[0] if len(a) == 1 else a)


def deg(a):
    return math.radians(a)


# ---------------------------------------------------------------- images and textured materials

def image(path, non_color=False):
    if not os.path.exists(path):
        return None
    im = bpy.data.images.load(path, check_existing=True)
    if non_color:
        im.colorspace_settings.name = 'Non-Color'
    return im


def mean_luma(im):
    import numpy as np
    w, h = im.size
    px = np.empty(w * h * 4, dtype=np.float32)
    im.pixels.foreach_get(px)
    px = px.reshape(-1, 4)[::97]
    return float((px[:, 0] * 0.2126 + px[:, 1] * 0.7152 + px[:, 2] * 0.0722).mean())


def tex_set(name):
    folder = os.path.join(PH, 'textures', name)
    d = image(os.path.join(folder, f'{name}_diff.jpg'))
    if d is None:
        return None
    return (d, image(os.path.join(folder, f'{name}_rough.jpg'), True), image(os.path.join(folder, f'{name}_nor_gl.jpg'), True))


def tex_material(name, tex, size=1.0, tint=None, rough=None, normal=1.0, proj='BOX', coat=0.0, sheen=0.0,
                 wear=False, dust=False, prints=False, scratches=False, rough_add=0.0, base_mix=1.0, coords='Object'):
    """Principled material from a Poly Haven texture set, box-projected in object space so procedural boxes
    need no UVs. size = metres covered by one tile. tint recolours the texture keeping its light/dark
    detail (fabrics stay in the home's palette). Optional wear on edges, dust on tops, fingerprints and
    fine scratches."""
    ts = tex_set(tex)
    if ts is None:
        return None
    diff, rgh, nor = ts
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    N, L = nt.nodes, nt.links
    node, sock = H.node, H.sock
    out = node(nt, 'ShaderNodeOutputMaterial', (1400, 0))
    b = node(nt, 'ShaderNodeBsdfPrincipled', (1100, 0), Coat_Weight=coat, Coat_Roughness=0.2, Sheen_Weight=sheen, Sheen_Roughness=0.5)
    L.new(b.outputs[0], out.inputs['Surface'])
    tc = node(nt, 'ShaderNodeTexCoord', (-1400, 0))
    mp = node(nt, 'ShaderNodeMapping', (-1200, 0))
    mp.inputs['Scale'].default_value = (1 / size, 1 / size, 1 / size)
    L.new(tc.outputs[coords], mp.inputs['Vector'])

    def itex(im, y):
        t = node(nt, 'ShaderNodeTexImage', (-900, y))
        t.image = im
        if coords != 'UV':
            t.projection = proj
            t.projection_blend = 0.25
        L.new(mp.outputs['Vector'], t.inputs['Vector'])
        return t
    td = itex(diff, 300)
    col = td.outputs['Color']
    if tint is not None:
        bw = node(nt, 'ShaderNodeRGBToBW', (-600, 400))
        L.new(col, bw.inputs[0])
        k = 1.0 / max(mean_luma(diff), 0.02)
        mul = node(nt, 'ShaderNodeMath', (-450, 400), operation='MULTIPLY')
        mul.inputs[1].default_value = k
        L.new(bw.outputs[0], mul.inputs[0])
        tn = node(nt, 'ShaderNodeMix', (-250, 400), data_type='RGBA', blend_type='MULTIPLY')
        tn.inputs['Factor'].default_value = 1.0
        sock(tn, 'A_Color').default_value = H.srgb(tint)
        cmb = node(nt, 'ShaderNodeCombineColor', (-350, 300))
        for i in range(3):
            L.new(mul.outputs[0], cmb.inputs[i])
        L.new(cmb.outputs[0], sock(tn, 'B_Color'))
        col = sock(tn, 'Result_Color', True)
        if base_mix < 1.0:
            mx = node(nt, 'ShaderNodeMix', (-100, 400), data_type='RGBA', Factor=base_mix)
            sock(mx, 'A_Color').default_value = H.srgb(tint)
            L.new(col, sock(mx, 'B_Color'))
            col = sock(mx, 'Result_Color', True)
    rough_out = None
    if rgh is not None:
        tr = itex(rgh, 0)
        rough_out = tr.outputs['Color']
        if rough is not None:
            mr = node(nt, 'ShaderNodeMapRange', (-500, 0), To_Min=rough[0], To_Max=rough[1])
            L.new(rough_out, mr.inputs['Value'])
            rough_out = mr.outputs['Result']
    nrm_out = None
    if nor is not None:
        tn_ = itex(nor, -300)
        nm = node(nt, 'ShaderNodeNormalMap', (-500, -300), Strength=normal)
        L.new(tn_.outputs['Color'], nm.inputs['Color'])
        nrm_out = nm.outputs['Normal']
    geo = node(nt, 'ShaderNodeNewGeometry', (-900, -700))
    if scratches:
        # fine scratches: thin, randomly oriented streaks that only change gloss
        sm = node(nt, 'ShaderNodeMapping', (-900, -900))
        sm.inputs['Scale'].default_value = (40.0, 3.0, 40.0)
        sm.inputs['Rotation'].default_value = (0.0, 0.0, 0.6)
        L.new(tc.outputs['Object'], sm.inputs['Vector'])
        wv = node(nt, 'ShaderNodeTexWave', (-700, -900), Scale=4.0, Distortion=18.0, Detail=6.0, Detail_Scale=3.0, wave_profile='SIN')
        L.new(sm.outputs['Vector'], wv.inputs['Vector'])
        thr = node(nt, 'ShaderNodeMapRange', (-500, -900), From_Min=0.96, From_Max=1.0, To_Min=0.0, To_Max=0.18)
        L.new(wv.outputs['Fac'], thr.inputs['Value'])
        rough_out = _add(nt, rough_out, thr.outputs['Result'], (-300, -100))
    if prints:
        # fingerprints and smudges: soft blotches of extra roughness
        vo = node(nt, 'ShaderNodeTexVoronoi', (-700, -1100), Scale=28.0, Randomness=1.0)
        L.new(tc.outputs['Object'], vo.inputs['Vector'])
        nz = node(nt, 'ShaderNodeTexNoise', (-700, -1300), Scale=3.0, Detail=2.0)
        L.new(tc.outputs['Object'], nz.inputs['Vector'])
        blot = node(nt, 'ShaderNodeMapRange', (-500, -1100), From_Min=0.15, From_Max=0.0, To_Min=0.0, To_Max=1.0)
        L.new(vo.outputs['Distance'], blot.inputs['Value'])
        area = node(nt, 'ShaderNodeMapRange', (-500, -1300), From_Min=0.55, From_Max=0.7, To_Min=0.0, To_Max=0.22)
        L.new(nz.outputs['Fac'], area.inputs['Value'])
        mul = node(nt, 'ShaderNodeMath', (-300, -1200), operation='MULTIPLY')
        L.new(blot.outputs['Result'], mul.inputs[0])
        L.new(area.outputs['Result'], mul.inputs[1])
        rough_out = _add(nt, rough_out, mul.outputs[0], (-150, -200))
    if wear:
        # worn edges: slightly lighter and more matte where pointiness is high
        pe = node(nt, 'ShaderNodeMapRange', (-500, -700), From_Min=0.52, From_Max=0.62, To_Min=0.0, To_Max=0.35)
        L.new(geo.outputs['Pointiness'], pe.inputs['Value'])
        lw = node(nt, 'ShaderNodeMix', (0, 250), data_type='RGBA', blend_type='SCREEN')
        L.new(pe.outputs['Result'], lw.inputs['Factor'])
        L.new(col, sock(lw, 'A_Color'))
        sock(lw, 'B_Color').default_value = (0.35, 0.3, 0.25, 1)
        col = sock(lw, 'Result_Color', True)
        rough_out = _add(nt, rough_out, pe.outputs['Result'], (-150, -400))
    if dust:
        # a little dust on upward faces
        up = node(nt, 'ShaderNodeSeparateXYZ', (-700, -1500))
        L.new(geo.outputs['Normal'], up.inputs[0])
        upm = node(nt, 'ShaderNodeMapRange', (-500, -1500), From_Min=0.85, From_Max=1.0, To_Min=0.0, To_Max=1.0)
        L.new(up.outputs['Z'], upm.inputs['Value'])
        dn = node(nt, 'ShaderNodeTexNoise', (-700, -1700), Scale=60.0, Detail=6.0, Roughness=0.7)
        L.new(tc.outputs['Object'], dn.inputs['Vector'])
        dm = node(nt, 'ShaderNodeMapRange', (-500, -1700), From_Min=0.4, From_Max=0.7, To_Min=0.0, To_Max=0.22)
        L.new(dn.outputs['Fac'], dm.inputs['Value'])
        dmul = node(nt, 'ShaderNodeMath', (-300, -1600), operation='MULTIPLY')
        L.new(upm.outputs['Result'], dmul.inputs[0])
        L.new(dm.outputs['Result'], dmul.inputs[1])
        dmx = node(nt, 'ShaderNodeMix', (200, 250), data_type='RGBA')
        L.new(dmul.outputs[0], dmx.inputs['Factor'])
        L.new(col, sock(dmx, 'A_Color'))
        sock(dmx, 'B_Color').default_value = (0.55, 0.53, 0.5, 1)
        col = sock(dmx, 'Result_Color', True)
        rough_out = _add(nt, rough_out, dmul.outputs[0], (0, -600))
    if rough_add and rough_out is not None:
        rough_out = _add(nt, rough_out, rough_add, (100, -100))
    L.new(col, b.inputs['Base Color'])
    if rough_out is not None:
        L.new(rough_out, b.inputs['Roughness'])
    if nrm_out is not None:
        L.new(nrm_out, b.inputs['Normal'])
    m.diffuse_color = H.srgb(tint) if tint else (0.6, 0.5, 0.4, 1)
    return m


def _add(nt, a, b, loc):
    n = nt.nodes.new('ShaderNodeMath')
    n.location = loc
    n.operation = 'ADD'
    n.use_clamp = True
    for i, v in enumerate((a, b)):
        if v is None:
            n.inputs[i].default_value = 0.5
        elif isinstance(v, (int, float)):
            n.inputs[i].default_value = v
        else:
            nt.links.new(v, n.inputs[i])
    return n.outputs[0]


def art_material(name, img_name, rough=0.6, emission=0.0, alpha=False, coat=0.0):
    """A printed / painted picture, mapped by UV."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    node = H.node
    out = node(nt, 'ShaderNodeOutputMaterial', (600, 0))
    b = node(nt, 'ShaderNodeBsdfPrincipled', (300, 0), Roughness=rough, Coat_Weight=coat, Coat_Roughness=0.1)
    t = node(nt, 'ShaderNodeTexImage', (0, 0))
    t.image = image(os.path.join(ART, img_name + '.png'))
    nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    if alpha:
        nt.links.new(t.outputs['Alpha'], b.inputs['Alpha'])
    nt.links.new(b.outputs[0], out.inputs['Surface'])
    m.diffuse_color = (0.8, 0.8, 0.8, 1)
    return m


def upgrade_materials(Hm, M):
    """Swap the main procedural materials for textured ones (keeps the procedural ones if a download is missing)."""
    global H
    H = Hm
    # round 3: the textures of the reference images (honey oak, oatmeal boucle, rust/olive velvet, cream knit,
    # a shaggy wool rug, a chunky loop rug)
    up = {
        'floor': dict(tex='wood_floor', size=1.6, tint='#d6a874', rough=(0.28, 0.5), coat=0.18, scratches=True, prints=False),
        'walnut': dict(tex='walnut_veneer', size=0.9, rough=(0.3, 0.5), coat=0.25, wear=True, prints=True),
        'walnut_y': dict(tex='walnut_veneer', size=0.9, rough=(0.3, 0.5), coat=0.25, wear=True, prints=True),
        'oak': dict(tex='oak_veneer_01', size=0.9, rough=(0.35, 0.55), coat=0.1, wear=True, dust=True),
        'dining_wood': dict(tex='oak_veneer_01', size=1.1, rough=(0.28, 0.45), coat=0.25, wear=True, prints=True),
        'wall': dict(tex='painted_plaster_wall', size=2.2, tint='#efe8dd', rough=(0.8, 0.95), normal=0.6, base_mix=0.85),
        'counter': dict(tex='marble_01', size=1.4, tint='#f2efe9', rough=(0.12, 0.3), coat=0.3, prints=True),
        'sofa': dict(tex='curly_teddy_natural', size=0.14, tint='#d6cab7', rough=(0.85, 1.0), normal=0.8, sheen=0.5),
        'cushion_a': dict(tex='velour_velvet', size=0.3, tint='#9a4b2d', rough=(0.6, 0.85), normal=1.0, sheen=1.0),
        'cushion_b': dict(tex='velour_velvet', size=0.3, tint='#66693c', rough=(0.6, 0.85), normal=1.0, sheen=1.0),
        'cushion_c': dict(tex='knitted_fleece', size=0.14, tint='#e9e0ce', rough=(0.85, 1.0), normal=1.6, sheen=0.5),
        'throw': dict(tex='knitted_fleece', size=0.22, tint='#d6cfc4', rough=(0.8, 1.0), normal=2.2, sheen=0.5),
        'armchair': dict(tex='curly_teddy_natural', size=0.14, tint='#c9bda9', rough=(0.85, 1.0), normal=0.8, sheen=0.5),
        'chair_fabric': dict(tex='poly_wool_herringbone', size=0.35, tint='#bdb3a5', rough=(0.85, 1.0), normal=1.2, sheen=0.4),
        'rug': dict(tex='curly_teddy_natural', size=0.45, tint='#d2c1a5', rough=(0.9, 1.0), normal=2.2),
        'rug2': dict(tex='curly_teddy_natural', size=0.6, tint='#b59c7b', rough=(0.9, 1.0), normal=2.4),
        'cat_bed': dict(tex='curly_teddy_natural', size=0.16, tint='#e4dacb', rough=(0.85, 1.0), normal=1.2, sheen=0.6),
        'pouf': dict(tex='hessian_380', size=0.12, tint='#6e4b32', rough=(0.85, 1.0), normal=2.5),
    }
    for key, kw in up.items():
        tex = kw.pop('tex')
        name = M[key].name + ' (textured)'
        m = tex_material(name, tex, **kw)
        if m is not None:
            M[key] = m
    tiles = tex_material('Backsplash Tiles', 'long_white_tiles', size=0.6, rough=(0.1, 0.35), coat=0.4, prints=True)
    if tiles is not None:
        M['tiles'] = tiles
    M['gingham'] = tex_material('Gingham Tea Towel', 'gingham_check', size=0.25, rough=(0.85, 1.0), sheen=0.4) or M['throw']
    M['plaid'] = tex_material('Plaid Blanket', 'wool_boucle', size=0.5, rough=(0.85, 1.0), normal=1.2, sheen=0.6) or M['throw']
    M['linen_white'] = tex_material('White Linen', 'rough_linen', size=0.3, tint='#efe9df', rough=(0.85, 1.0), sheen=0.4) or M['paper']
    M['grass'] = tex_material('Lawn Grass', 'leafy_grass', size=1.5, rough=(0.8, 1.0)) or M['lawn']
    M['fence'] = tex_material('Fence Boards', 'weathered_planks', size=1.4, rough=(0.7, 0.95)) or M['oak']
    M['brick'] = tex_material('Neighbour Brick', 'white_bricks', size=1.6, rough=(0.8, 0.95)) or M['wall']
    return M


# ---------------------------------------------------------------- small builders

_LIB = {}


def ph(asset, loc, rot=0.0, scale=1.0, only=None, skip=None, tilt=(0.0, 0.0), name=None, coll='Home'):
    """Place a Poly Haven model as linked duplicates under an empty. only/skip filter object names."""
    if asset not in _LIB:
        path = os.path.join(PH, 'models', asset, f'{asset}.blend')
        if not os.path.exists(path):
            print('missing Poly Haven model', asset, flush=True)
            _LIB[asset] = []
        else:
            before = set(bpy.data.images)
            with bpy.data.libraries.load(path) as (src, dst):
                dst.objects = list(src.objects)
            tex = os.path.join(PH, 'models', asset, 'textures')
            for im in set(bpy.data.images) - before:
                if im.filepath:
                    cand = os.path.join(tex, os.path.basename(im.filepath))
                    if os.path.exists(cand):
                        im.filepath = cand
            _LIB[asset] = [o for o in dst.objects if o is not None and o.type == 'MESH']
    root = bpy.data.objects.new(name or asset, None)
    H.coll(coll).objects.link(root)
    root.location = loc
    root.rotation_euler = (deg(tilt[0]), deg(tilt[1]), deg(rot))
    root.scale = (scale, scale, scale)
    for o in _LIB[asset]:
        if only and not any(s in o.name for s in only):
            continue
        if skip and any(s in o.name for s in skip):
            continue
        c = o.copy()
        H.coll(coll).objects.link(c)
        c.parent = root
    return root


def mesh_obj(name, bm, mat, smooth=True, coll='Home'):
    return H.obj_from_bm(name, bm, mat, coll, smooth=smooth)


def quad_uv(name, w, h, mat, uv=((0, 0), (1, 0), (1, 1), (0, 1)), coll='Home'):
    """A w x h picture plane in local XZ (facing -Y), with given UV corners."""
    bm = bmesh.new()
    lay = bm.loops.layers.uv.new('UVMap')
    vs = [bm.verts.new(p) for p in ((-w / 2, 0, -h / 2), (w / 2, 0, -h / 2), (w / 2, 0, h / 2), (-w / 2, 0, h / 2))]
    f = bm.faces.new(vs)
    for loop, (u, v) in zip(f.loops, uv):
        loop[lay].uv = (u, v)
    return mesh_obj(name, bm, mat, smooth=False, coll=coll)


def group(name, loc, rot=(0, 0, 0), coll='Home'):
    e = bpy.data.objects.new(name, None)
    H.coll(coll).objects.link(e)
    e.location = loc
    e.rotation_euler = rot
    return e


def child(o, parent, loc=None, rot=None):
    o.parent = parent
    if loc is not None:
        o.location = loc
    if rot is not None:
        o.rotation_euler = rot
    return o


def picture(name, img, w, h, loc, rot_z, frame_mat, depth=0.025, border=0.025, mount=0.0, mount_mat=None):
    """A framed picture hung on a wall. rot_z turns its face (local -Y) into the room."""
    g = group(name, loc, (0, 0, rot_z))
    W, Hh = w + 2 * (border + mount), h + 2 * (border + mount)
    for i, (sx, sz, px, pz) in enumerate(((W, border, 0, (Hh - border) / 2), (W, border, 0, -(Hh - border) / 2),
                                          (border, Hh - 2 * border, (W - border) / 2, 0), (border, Hh - 2 * border, -(W - border) / 2, 0))):
        child(H.box(f'{name}_Frame{i}', (sx, depth, sz), (0, 0, 0), frame_mat, bevel=0.002), g, (px, -depth / 2, pz))
    if mount > 0:
        child(H.box(f'{name}_Mount', (w + 2 * mount, 0.004, h + 2 * mount), (0, 0, 0), mount_mat or MAT['mount'], bevel=0), g, (0, -0.006, 0))
    art = art_material(f'{name} Art', img, rough=0.75)
    child(quad_uv(f'{name}_Art', w, h, art), g, (0, -0.0085, 0))
    glass = child(quad_uv(f'{name}_Glass', w + 2 * mount, h + 2 * mount, MAT['picture_glass']), g, (0, -depth + 0.004, 0))
    glass.visible_shadow = False
    return g


def paper(name, img, w, h, loc, rot, curl=0.0, mat=None):
    """A sheet of paper (drawing, envelope, page) lying or leaning; curl lifts its edges a little."""
    bm = bmesh.new()
    lay = bm.loops.layers.uv.new('UVMap')
    nx, ny = 8, 6
    grid = []
    for j in range(ny + 1):
        row = []
        for i in range(nx + 1):
            u, v = i / nx, j / ny
            z = curl * ((u - 0.5) ** 2 * 4 + RNG.uniform(-0.1, 0.1))
            row.append(bm.verts.new(((u - 0.5) * w, (v - 0.5) * h, z)))
        grid.append(row)
    for j in range(ny):
        for i in range(nx):
            f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            for loop, (a, b) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
                loop[lay].uv = (a / nx, b / ny)
    o = mesh_obj(name, bm, mat or art_material(f'{name} Paper', img, rough=0.85))
    o.location = loc
    o.rotation_euler = rot
    return o


SPINE_COLS = 32


def book(name, loc, rot, th, depth, h, cover, col=None, spine_dir=V(0, -1, 0), parent=None):
    """A hardback: cover boards, cream page block, and a printed spine from the spine atlas."""
    g = group(name, loc, rot)
    if parent:
        g.parent = parent
    child(H.box(f'{name}_Cover', (th, depth, h), (0, 0, 0), cover, bevel=0.0015), g, (0, 0, 0))
    child(H.box(f'{name}_Pages', (th * 0.86, depth * 0.97, h * 0.96), (0, 0, 0), MAT['pages'], bevel=0.0005), g, (0, 0.003, 0))
    k = RNG.randrange(SPINE_COLS) if col is None else col
    u0, u1 = k / SPINE_COLS, (k + 1) / SPINE_COLS
    sp = quad_uv(f'{name}_Spine', th, h, MAT['spines'], uv=((u0, 0), (u1, 0), (u1, 1), (u0, 1)))
    child(sp, g, (0, -depth / 2 - 0.0008, 0))
    return g


def shelf_row(prefix, x0, x1, y, z, depth=0.21, lean_end=True, flat_stack=None):
    """Fill a shelf from x0 to x1 with upright books of varied height; optionally a flat stack at the end."""
    x = x0
    covers = MAT['covers']
    i = 0
    while x < x1:
        th = RNG.uniform(0.018, 0.045)
        hh = RNG.uniform(0.17, 0.29)
        if x + th > x1:
            break
        book(f'{prefix}_{i}', (x + th / 2, y, z + hh / 2), (0, 0, deg(RNG.uniform(-1.5, 1.5))), th, depth, hh, RNG.choice(covers))
        x += th + RNG.uniform(0.0, 0.004)
        i += 1
    if lean_end:
        th, hh = 0.03, 0.24
        b = book(f'{prefix}_lean', (x + 0.06, y, z + hh / 2 - 0.01), (0, deg(-14), 0), th, depth, hh, RNG.choice(covers))
    if flat_stack:
        fx, n = flat_stack
        zz = z
        for k in range(n):
            th = RNG.uniform(0.02, 0.04)
            w = RNG.uniform(0.17, 0.24)
            book(f'{prefix}_flat{k}', (fx, y, zz + th / 2), (0, deg(90), deg(RNG.uniform(-8, 8))), th, depth * 0.95, w, RNG.choice(covers))
            zz += th


def drape(name, mat, w, d, loc, rot, shape, res=(36, 28), thick=0.008, coll='Home'):
    """Cloth as a grid shaped by shape(u, v) -> (x, y, z) in local space (u, v in 0..1), with thickness."""
    bm = bmesh.new()
    nx, ny = res
    grid = []
    for j in range(ny + 1):
        row = []
        for i in range(nx + 1):
            row.append(bm.verts.new(shape(i / nx, j / ny)))
        grid.append(row)
    for j in range(ny):
        for i in range(nx):
            bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    o = mesh_obj(name, bm, mat, coll=coll)
    so = o.modifiers.new('Thick', 'SOLIDIFY')
    so.thickness = thick
    sub = o.modifiers.new('Smooth', 'SUBSURF')
    sub.levels = sub.render_levels = 1
    o.location = loc
    o.rotation_euler = rot
    return o


def cable(name, pts, radius=0.0025, mat=None):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = radius
    cu.bevel_resolution = 2
    sp = cu.splines.new('NURBS')
    sp.points.add(len(pts) - 1)
    for p, c in zip(sp.points, pts):
        p.co = (c[0], c[1], c[2], 1)
    sp.order_u = min(4, len(pts))
    sp.use_endpoint_u = True
    o = bpy.data.objects.new(name, cu)
    H.coll('Home').objects.link(o)
    o.data.materials.append(mat or MAT['cable'])
    return o


def rounded(name, size, loc, mat, rot=(0, 0, 0), r=0.01, coll='Home'):
    o = H.box(name, size, loc, mat, bevel=r, collection=coll)
    for m in o.modifiers:
        if m.type == 'BEVEL':
            m.segments = 4
            m.limit_method = 'NONE'
    o.rotation_euler = rot
    return o


# ---------------------------------------------------------------- materials for the small things

MAT = {}


def make_small_materials(M):
    P = H.principled
    MAT.update({
        'pages': P('Page Block', '#efe6d2', 0.9),
        'spines': art_material('Book Spines', 'spines', rough=0.6),
        'covers': [P(f'Book Board {i}', c, 0.55) for i, c in enumerate(('#b04a36', '#3b4c58', '#d9cfbb', '#6f8063', '#2d2d31', '#c79a4e', '#7a3f4b', '#e8e2d6', '#4d6a8c'))],
        'mount': P('Mount Board', '#f3efe6', 0.9),
        'picture_glass': _picture_glass(),
        'cable': P('Cable', '#e9e6df', 0.5),
        'cable_black': P('Cable Black', '#1a1a1b', 0.45),
        'plastic_white': P('Plastic White', '#ecebe7', 0.35),
        'plastic_red': P('Plastic Red', '#c8423a', 0.3, Coat_Weight=0.4),
        'plastic_yellow': P('Plastic Yellow', '#e3b33a', 0.3, Coat_Weight=0.4),
        'plastic_blue': P('Plastic Blue', '#3f74b4', 0.3, Coat_Weight=0.4),
        'plastic_green': P('Plastic Green', '#6fa05a', 0.3, Coat_Weight=0.4),
        'steel': P('Brushed Steel', '#b8babb', 0.28, Metallic=1.0),
        'chrome': P('Chrome', '#d8d8d8', 0.08, Metallic=1.0),
        'black_gloss': P('Black Glass Panel', '#0c0c0d', 0.06, Coat_Weight=1.0),
        'phone': P('Phone Glass', '#111214', 0.05, Coat_Weight=1.0),
        'rubber': P('Rubber Sole', '#e8e4dc', 0.7),
        'canvas_navy': H.fabric('Shoe Canvas Navy', '#3b4a63', sheen=0.4, scale=700),
        'canvas_white': H.fabric('Shoe Canvas White', '#e6e2da', sheen=0.4, scale=700),
        'leather': P('Leather Brown', '#6a4630', 0.45, Coat_Weight=0.2),
        'jacket': H.fabric('Jacket Olive', '#59614a', sheen=0.4, scale=500),
        'tote': H.fabric('Tote Canvas', '#d9cdb5', sheen=0.3, scale=400),
        'umbrella': H.fabric('Umbrella Navy', '#283447', sheen=0.3, scale=900),
        'felt_grey': H.fabric('Felt Grey', '#8d8a86', sheen=0.6, scale=600),
        'plush': H.fabric('Plush Toy', '#c9a77f', sheen=0.9, scale=1600),
        'plush_dark': P('Plush Nose', '#2b2422', 0.4),
        'slipper': H.fabric('Slipper Felt', '#9aa59a', sheen=0.7, scale=700),
        'cardboard': H.textured('Game Box Card', '#2f5d7c', '#28536f', rough=0.6, scale=20.0, bump=0.02),
        'board': H.textured('Game Board', '#e9dfc9', '#d9cbb0', rough=0.6, scale=12.0, bump=0.01),
        'latex_coral': P('Balloon Coral', '#e3664f', 0.22, Coat_Weight=0.5, Subsurface_Weight=0.3),
        'latex_mustard': P('Balloon Mustard', '#e5b440', 0.22, Coat_Weight=0.5, Subsurface_Weight=0.3),
        'latex_teal': P('Balloon Teal', '#3f8f94', 0.22, Coat_Weight=0.5, Subsurface_Weight=0.3),
        'string': P('String', '#f0ece4', 0.8),
        'wrap_a': H.textured('Wrapping Paper Dots', '#e9b8c4', '#f6e9ee', rough=0.5, scale=45.0, bump=0.01, detail=1.0),
        'wrap_b': H.textured('Wrapping Paper Blue', '#7fa7d0', '#e6eef6', rough=0.5, scale=35.0, bump=0.01, detail=1.0),
        'ribbon': P('Ribbon Satin', '#c4363a', 0.25, Sheen_Weight=0.5),
        'tissue': P('Tissue Paper', '#f7f2ea', 0.85, Subsurface_Weight=0.2),
        'napkin': M.get('gingham') or P('Napkin', '#d8d3c8', 0.9),
        'cup_kid_a': P('Kids Cup Coral', '#e57a5f', 0.35, Coat_Weight=0.3),
        'cup_kid_b': P('Kids Cup Teal', '#4d9ea0', 0.35, Coat_Weight=0.3),
        'water': P('Water', '#ffffff', 0.0, Transmission_Weight=1.0, IOR=1.33),
        'oil': P('Olive Oil', '#9c8a2a', 0.02, Transmission_Weight=1.0, IOR=1.47),
        'bottle_glass': P('Bottle Glass', '#eaf0ea', 0.02, Transmission_Weight=1.0, IOR=1.5),
        'jar_glass': P('Jar Glass', '#ffffff', 0.04, Transmission_Weight=1.0, IOR=1.5),
        'spice_a': H.textured('Spice Paprika', '#a8442a', '#7f2e1c', rough=0.95, scale=300.0, bump=0.3),
        'spice_b': H.textured('Spice Turmeric', '#d79a26', '#b37a18', rough=0.95, scale=300.0, bump=0.3),
        'spice_c': H.textured('Spice Herbs', '#5f6b39', '#424b26', rough=0.95, scale=300.0, bump=0.3),
        'label': P('Plain Label', '#f1ebdc', 0.8),
        'cork': H.textured('Cork', '#b38b5d', '#98734a', rough=0.9, scale=200.0, bump=0.3),
        'fridge': P('Fridge Enamel', '#efede8', 0.22, Coat_Weight=0.5),
        'appliance': P('Appliance Cream', '#e6e0d3', 0.3, Coat_Weight=0.4),
        'appliance_dark': P('Appliance Graphite', '#36383b', 0.35, Metallic=0.4),
        'bag': H.fabric('School Bag', '#d0563f', sheen=0.3, scale=600),
        'lunchbox': P('Lunchbox', '#68a6c9', 0.35, Coat_Weight=0.4),
        'radiator': P('Radiator Paint', '#efece6', 0.35, Coat_Weight=0.3),
        'switch': P('Switch Plate', '#f2f0eb', 0.3),
        'lemon_cut': H.textured('Lemon Flesh', '#f2dc6a', '#e5c94a', rough=0.3, scale=80.0, bump=0.3),
        'lemon_skin': P('Lemon Skin', '#e7c23a', 0.35, Coat_Weight=0.3),
        'knife': P('Knife Steel', '#c9cbcc', 0.18, Metallic=1.0),
        'crumb': P('Crumbs', '#d9b98a', 0.9),
        'door': P('Door Paint', '#efebe3', 0.45),
        'mat': H.textured('Coir Mat', '#8a6b45', '#6f5434', rough=1.0, scale=120.0, bump=0.5, detail=8.0),
        'magnet_a': P('Magnet Red', '#d04a3c', 0.3), 'magnet_b': P('Magnet Yellow', '#e9bf3c', 0.3),
        'magnet_c': P('Magnet Blue', '#4b7cc0', 0.3),
        'speaker': H.fabric('Speaker Cloth', '#4a4a4c', sheen=0.3, scale=1200),
        'record': P('Record Sleeves', '#b9a789', 0.6),
        'mouse_toy': H.fabric('Toy Mouse Felt', '#9b948c', sheen=0.8, scale=1000),
        'smoke': P('Smoke Detector', '#f4f3ef', 0.4),
        'party': H.textured('Party Hat Stripes', '#e5664f', '#f2c84b', rough=0.5, scale=60.0, bump=0.0, detail=0.0),
    })
    MAT['glass_clear'] = M['glass']


def _picture_glass():
    m = bpy.data.materials.new('Picture Glass')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = H.node(nt, 'ShaderNodeOutputMaterial', (400, 0))
    tr = H.node(nt, 'ShaderNodeBsdfTransparent', (0, 0))
    gl = H.node(nt, 'ShaderNodeBsdfGlossy', (0, -150), Roughness=0.03)
    fr = H.node(nt, 'ShaderNodeFresnel', (0, 150), IOR=1.5)
    mx = H.node(nt, 'ShaderNodeMixShader', (200, 0))
    nt.links.new(fr.outputs[0], mx.inputs['Fac'])
    nt.links.new(tr.outputs[0], mx.inputs[1])
    nt.links.new(gl.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs['Surface'])
    return m


# ---------------------------------------------------------------- zones

def entry(M):
    """Left wall: the door to the hall, coats, shoes, and the sideboard's everyday drop zone."""
    X = -4.5
    dy = -2.55
    # door, its frame and handle
    H.box('Door_Leaf', (0.04, 0.86, 2.06), (X + 0.025, dy, 1.03), MAT['door'], bevel=0.003)
    for i, (sy, sz, py, pz) in enumerate(((0.07, 2.15, dy - 0.465, 1.075), (0.07, 2.15, dy + 0.465, 1.075), (1.0, 0.07, dy, 2.135))):
        H.box(f'Door_Architrave_{i}', (0.02, sy, sz), (X + 0.01, py, pz), M['trim'], bevel=0.003)
    H.cyl('Door_Handle_Rose', 0.025, 0.012, (X + 0.05, dy + 0.34, 1.0), M['brass'], rot=(0, deg(90), 0))
    H.box('Door_Handle_Lever', (0.02, 0.12, 0.018), (X + 0.07, dy + 0.29, 1.0), M['brass'], bevel=0.006)
    # light switch + thermostat beside the door
    H.box('Switch_Door', (0.01, 0.085, 0.085), (X + 0.005, dy + 0.62, 1.12), MAT['switch'], bevel=0.003)
    H.box('Switch_Door_Rocker', (0.006, 0.03, 0.045), (X + 0.012, dy + 0.62, 1.12), MAT['switch'], bevel=0.002)
    H.box('Thermostat', (0.022, 0.085, 0.12), (X + 0.011, dy + 0.75, 1.48), MAT['switch'], bevel=0.006)
    H.box('Thermostat_Screen', (0.004, 0.05, 0.035), (X + 0.023, dy + 0.75, 1.5), MAT['black_gloss'], bevel=0.001)
    # coat rail with a jacket and a tote bag
    H.box('Coat_Rail', (0.03, 0.62, 0.07), (X + 0.015, -1.5, 1.72), M['oak'], bevel=0.004)
    for i, yy in enumerate((-1.72, -1.5, -1.28)):
        H.cyl(f'Coat_Hook_{i}', 0.008, 0.07, (X + 0.06, yy, 1.71), M['black_metal'], rot=(0, deg(70), 0), segs=10)

    coat('Jacket', (X + 0.13, -1.72, 1.71), MAT['jacket'])
    def tote(u, v):
        return (0.03 + 0.04 * math.sin(v * math.pi) + 0.012 * math.sin(u * 7), (u - 0.5) * 0.36, -0.2 - v * 0.38)
    drape('Tote_Bag', MAT['tote'], 0.36, 0.4, (X + 0.03, -1.28, 1.7), (0, 0, deg(-3)), tote, res=(16, 16), thick=0.01)
    for k in (-1, 1):
        cable(f'Tote_Strap_{k}', [(X + 0.04, -1.28 + k * 0.1, 1.5), (X + 0.06, -1.28 + k * 0.05, 1.62), (X + 0.06, -1.28, 1.7)], 0.006, MAT['tote'])
    # doormat and shoes, one fallen over
    m = H.box('Door_Mat', (0.55, 0.85, 0.012), (X + 0.33, dy, 0.006), MAT['mat'], bevel=0.004)
    m.rotation_euler.z = deg(2.5)
    for i, (x, y, r, fallen, mat, s) in enumerate(((X + 0.25, dy - 0.25, 8, False, MAT['canvas_navy'], 1.0), (X + 0.27, dy - 0.12, 2, False, MAT['canvas_navy'], 1.0),
                                                   (X + 0.4, dy + 0.12, -15, False, MAT['leather'], 1.06), (X + 0.5, dy + 0.27, 40, True, MAT['leather'], 1.06),
                                                   (X + 0.22, dy + 0.33, 75, False, MAT['canvas_white'], 0.72), (X + 0.6, dy - 0.05, 120, True, MAT['canvas_white'], 0.72))):
        shoe(f'Shoe_{i}', (x, y), r, mat, s, fallen)
    # umbrella leaning in the corner by the door
    g = group('Umbrella', (X + 0.07, -3.38, 0.0), (deg(-6), deg(8), 0))
    child(H.cyl('Umbrella_Canopy', 0.035, 0.62, (0, 0, 0), MAT['umbrella'], r2=0.012, segs=8), g, (0, 0, 0.36))
    child(H.cyl('Umbrella_Shaft', 0.005, 0.86, (0, 0, 0), MAT['chrome'], segs=8), g, (0, 0, 0.43))
    child(H.cyl('Umbrella_Tip', 0.004, 0.06, (0, 0, 0), MAT['chrome'], segs=8), g, (0, 0, 0.03))
    hk = cable('Umbrella_Handle', [(0, 0, 0.86), (0, 0, 0.94), (0.03, 0, 0.98), (0.06, 0, 0.95), (0.06, 0, 0.9)], 0.011, MAT['leather'])
    child(hk, g)
    # sideboard top: key bowl with keys, the post, sunglasses, a phone charger, family photos, a child's drawing
    top = 0.74
    sx = -4.5 + 0.24
    ph('wooden_bowl_01', (sx + 0.03, -0.52, top), rot=20, scale=0.62, name='Key_Bowl')
    for i in range(3):
        k = group(f'Keys_{i}', (sx + 0.03 + RNG.uniform(-0.04, 0.04), -0.52 + RNG.uniform(-0.04, 0.04), top + 0.012 + i * 0.004), (0, 0, deg(RNG.uniform(0, 360))))
        child(H.cyl(f'Key_Ring_{i}', 0.012, 0.002, (0, 0, 0), MAT['chrome'], segs=16), k, (0, 0, 0))
        child(H.box(f'Key_Blade_{i}', (0.045, 0.012, 0.002), (0, 0, 0), MAT['chrome'], bevel=0.0008), k, (0.035, 0, 0))
    for i in range(4):
        env = paper(f'Mail_{i}', 'mail_a' if i % 2 else 'mail_b', 0.22, 0.11, (sx - 0.06 + RNG.uniform(-0.02, 0.02), -0.72 + RNG.uniform(-0.02, 0.02), top + 0.046 + i * 0.0015),
                    (0, 0, deg(RNG.uniform(-12, 12) + 90)), curl=0.002)
    paper('Mail_Open_Letter', 'page_text', 0.21, 0.28, (sx + 0.02, -0.82, top + 0.006), (0, 0, deg(100)), curl=0.006)
    ph('round_spectacles', (sx - 0.08, -0.33, top + 0.02), rot=-25, tilt=(-6, 0), name='Sunglasses')
    rounded('Phone_Charger', (0.025, 0.025, 0.025), (sx + 0.12, -0.4, top + 0.0125), MAT['plastic_white'], r=0.004)
    cable('Charger_Cable', [(sx + 0.12, -0.4, top + 0.01), (sx + 0.2, -0.43, top + 0.004), (sx + 0.235, -0.46, top - 0.02), (sx + 0.24, -0.48, 0.35),
                             (sx + 0.22, -0.5, 0.02), (-4.48, -0.98, 0.01), (-4.493, -1.02, 0.28)], 0.0018, MAT['cable'])
    H.box('Socket_Entry', (0.01, 0.085, 0.085), (-4.495, -1.02, 0.3), MAT['switch'], bevel=0.003)
    for i, (y, r, art) in enumerate(((0.55, 205, 'photo_a'), (0.69, 190, 'photo_b'))):
        f = ph('standing_picture_frame_01' if i == 0 else 'standing_picture_frame_02', (sx - 0.1, y, top), rot=r - 90, scale=0.8, name=f'Family_Photo_{i}')
        _swap_artwork(f, art)
    paper('Kid_Drawing_Sideboard', 'kid_family', 0.3, 0.21, (-4.47, -0.86, top + 0.105), (deg(90 - 12), 0, deg(90)), curl=0.01)
    cable('Table_Lamp_Cord', [(sx - 0.04, 0.86, top + 0.02), (sx - 0.18, 0.9, top + 0.005), (-4.47, 0.92, top - 0.05), (-4.47, 0.95, 0.3), (-4.49, 1.12, 0.06), (-4.493, 1.15, 0.27)], 0.002, MAT['cable'])
    H.box('Socket_Sideboard', (0.01, 0.085, 0.085), (-4.495, 1.15, 0.3), MAT['switch'], bevel=0.003)


def coat(name, hook, mat):
    """A jacket hanging from a hook by its collar: a soft tube that widens from the shoulders and hangs in
    vertical folds, with both sleeves falling in front."""
    hook = V(hook)
    bm = bmesh.new()
    nu, nv = 40, 26
    rings = []
    for j in range(nv + 1):
        t = j / nv
        z = -t * 0.82
        shoulder = min(1.0, t / 0.16)
        half_w = 0.04 + 0.2 * math.sin(shoulder * math.pi / 2) + 0.025 * t
        half_d = 0.03 + 0.075 * math.sin(shoulder * math.pi / 2)
        ring = []
        for i in range(nu):
            a = i / nu * math.tau
            fold = 1 + 0.07 * math.sin(a * 7 + t * 2.0) * t + 0.03 * math.sin(a * 13) * t
            x = math.cos(a) * half_d * fold
            y = math.sin(a) * half_w * fold
            ring.append(bm.verts.new((x, y, z)))
        rings.append(ring)
    for j in range(nv):
        for i in range(nu):
            bm.faces.new((rings[j][i], rings[j][(i + 1) % nu], rings[j + 1][(i + 1) % nu], rings[j + 1][i]))
    o = mesh_obj(name, bm, mat)
    so = o.modifiers.new('Thick', 'SOLIDIFY')
    so.thickness = 0.008
    sub = o.modifiers.new('Smooth', 'SUBSURF')
    sub.levels = sub.render_levels = 1
    o.location = hook
    for k in (-1, 1):
        sl = H.cyl(f'{name}_Sleeve_{k}', 0.045, 0.58, (0, 0, 0), mat, r2=0.038, segs=20)
        sl.location = hook + V(0.09, k * 0.17, -0.42)
        sl.rotation_euler = (deg(-k * 4), deg(-6), 0)
        sub = sl.modifiers.new('Smooth', 'SUBSURF')
        sub.levels = sub.render_levels = 1
    H.box(f'{name}_Collar', (0.06, 0.16, 0.05), hook + V(0.0, 0, -0.01), mat, bevel=0.02, soft=True)
    return o


def _swap_artwork(root, art):
    for c in root.children:
        for i, m in enumerate(c.material_slots):
            if m.material and 'artwork' in m.material.name:
                c.material_slots[i].link = 'OBJECT'
                c.material_slots[i].material = art_material(f'{root.name} {art}', art, rough=0.4, coat=0.2)


def shoe(name, xy, rot, mat, s=1.0, fallen=False):
    g = group(name, (xy[0], xy[1], 0.0), (deg(90) if fallen else 0, 0, deg(rot)))
    if fallen:
        g.location.z = 0.045 * s
    L, W = 0.27 * s, 0.1 * s
    child(rounded(f'{name}_Sole', (L, W, 0.025 * s), (0, 0, 0), MAT['rubber'], r=0.012 * s), g, (0, 0, 0.0125 * s))
    up = H.sphere(f'{name}_Upper', 0.5, (0, 0, 0), mat, scale=(L * 0.92, W * 0.95, 0.12 * s), subd=3)
    child(up, g, (0.01 * s, 0, 0.03 * s))
    child(H.cyl(f'{name}_Opening', W * 0.36, 0.01, (0, 0, 0), MAT['plush_dark'], segs=20), g, (-0.06 * s, 0, 0.088 * s))
    return g


def living(M):
    import build_home as BH
    cx, cy = BH.LAYOUT['coffee']
    sx, sy = BH.LAYOUT['sofa']
    top = 0.405
    ob = bpy.data.objects
    # coffee table: the mug moves onto a coaster, with an old ring stain beside it; an open board game
    if 'Coffee_Mug' in ob:
        ob['Coffee_Mug'].location = (cx - 0.42, cy + 0.12, top + 0.045 + 0.004)
        H.cyl('Coaster', 0.048, 0.004, (cx - 0.42, cy + 0.12, top + 0.002), MAT['cork'])
        H.cyl('Mug_Coffee', 0.036, 0.004, (cx - 0.42, cy + 0.12, top + 0.07), H.principled('Coffee', '#2a1a10', 0.05, Coat_Weight=1.0))
        ring = H.cyl('Mug_Ring_Stain', 0.04, 0.0004, (cx - 0.3, cy + 0.2, top + 0.0003), H.principled('Ring Stain', '#3a2416', 0.35, Alpha=0.35))
        ring.visible_shadow = False
    if 'Coffee_Book' in ob:
        ob['Coffee_Book'].location = (cx - 0.22, cy - 0.17, top + 0.015)
        ob['Coffee_Book'].rotation_euler.z = deg(-17)
    paper('Magazine', 'cookbook', 0.21, 0.28, (cx - 0.38, cy - 0.12, top + 0.033), (0, 0, deg(24)), curl=0.003)
    gb = rounded('Game_Box_Base', (0.3, 0.3, 0.05), (cx - 0.05, cy - 0.14, top + 0.025), MAT['cardboard'], rot=(0, 0, deg(-9)), r=0.003)
    H.box('Game_Board_Folded', (0.28, 0.28, 0.006), (cx - 0.05, cy - 0.14, top + 0.051), MAT['board'], bevel=0.001).rotation_euler.z = deg(-9)
    lid = rounded('Game_Box_Lid', (0.31, 0.31, 0.045), (cx - 0.3, cy + 0.02, 0.0235), MAT['cardboard'], rot=(0, 0, deg(19)), r=0.003)
    cols = [MAT['plastic_red'], MAT['plastic_yellow'], MAT['plastic_blue'], MAT['plastic_green']]
    for i in range(10):
        x = cx - 0.05 + RNG.uniform(-0.22, 0.25)
        y = cy - 0.14 + RNG.uniform(-0.2, 0.22)
        on_box = abs(x - (cx - 0.05)) < 0.14 and abs(y - (cy - 0.14)) < 0.14
        z = top + (0.054 if on_box else 0.0)
        lathe = H.lathe_obj(f'Game_Piece_{i}', [(0.0, 0.0), (0.011, 0.0), (0.011, 0.004), (0.006, 0.012), (0.009, 0.022), (0.0, 0.026)], (x, y, z), cols[i % 4], segs=16)
    for i in range(3):  # a few pieces fell on the rug
        H.lathe_obj(f'Game_Piece_Rug_{i}', [(0.0, 0.0), (0.011, 0.0), (0.011, 0.004), (0.006, 0.012), (0.009, 0.022), (0.0, 0.026)],
                    (cx + RNG.uniform(-0.6, 0.4), cy + RNG.uniform(0.35, 0.55), 0.012), cols[(i + 1) % 4], segs=16).rotation_euler = (deg(90), 0, deg(RNG.uniform(0, 360)))
    # toys under and around the table
    toy_car('Toy_Car', (cx + 0.25, cy + 0.08, 0.012), 33)
    for i, (dx, dy, r, c) in enumerate(((0.12, -0.05, 20, 'plastic_red'), (-0.18, 0.1, 65, 'plastic_yellow'), (0.4, 0.42, 10, 'plastic_blue'))):
        H.box(f'Toy_Block_{i}', (0.04, 0.04, 0.04), (cx + dx, cy + dy, 0.032), MAT[c], bevel=0.004).rotation_euler.z = deg(r)
    teddy('Plush_Rabbit', (sx + 1.35, sy + 0.55, 0.012), 200, 0.8)
    # sofa: blanket over the east arm, a paperback face down, the remote, extra cushions
    ax = sx + 1.07  # the arm's centre line (furniture.sofa: arms 0.26 wide, tops at ~0.67)

    def blanket(u, v):
        # across the arm top (v 0.3..0.55), falling down both sides with folds
        w = (u - 0.5) * 0.62
        t = v * 1.15
        if t < 0.4:
            d = 0.4 - t
            d0 = 0.19 / 1.12  # down the inside of the arm to the seat, then flat across it
            if d <= d0:
                x, z = -0.06 - d * 0.15, 0.67 - d * 1.12
            else:
                x, z = -0.06 - d0 * 0.15 - (d - d0) * 1.0, 0.48
        elif t < 0.62:
            x, z = -0.06 + (t - 0.4) * 1.0, 0.67 + 0.02 * math.sin((t - 0.4) / 0.22 * math.pi)
        else:
            x, z = 0.16 + (t - 0.62) * 0.12, 0.67 - (t - 0.62) * 1.32
        fold = 0.018 * math.sin(u * 17 + v * 2) * (1 - math.sin(min(1, max(0, (t - 0.4) / 0.22)) * math.pi) * 0.8)
        return (x + fold, w, max(z, 0.02))
    drape('Sofa_Arm_Blanket', M['throw'], 0.62, 1.2, (ax, sy + 0.05, 0.0), (0, 0, deg(4)), blanket, res=(30, 46), thick=0.01)
    g = group('Paperback', (sx - 0.05, sy + 0.12, 0.478), (0, 0, deg(28)))
    for side in (-1, 1):
        child(H.box(f'Paperback_Half_{side}', (0.11, 0.18, 0.012), (0, 0, 0), MAT['covers'][3], bevel=0.002), g, (side * 0.055, 0, 0.012), (0, side * deg(-14), 0))
    rounded('TV_Remote', (0.045, 0.17, 0.018), (sx + 0.55, sy + 0.25, 0.478), H.principled('Remote', '#202022', 0.4), rot=(0, 0, deg(-21)), r=0.006)
    # floor basket with rolled throws, between the sofa and the bookshelf
    b = ph('wicker_basket_02', (0.32, -3.12, 0.0), rot=14, scale=1.75, skip=['lid'], name='Floor_Basket')
    for i, (dx, dy, tilt, mat) in enumerate(((-0.04, 0.02, 12, M['throw']), (0.05, -0.03, -8, M['linen_white']))):
        roll = H.cyl(f'Basket_Throw_{i}', 0.07, 0.34, (0.32 + dx, -3.12 + dy, 0.3), mat, segs=24)
        roll.rotation_euler = (deg(tilt), deg(-6), 0)
    # turned-up rug corner (replace the flat rug with one that curls at the north-east corner)
    rug_with_corner(M)
    # speaker + records on the bookshelf's bottom shelf, its cable and a power strip
    bxs = 1.25
    rounded('Speaker', (0.2, 0.18, 0.3), (bxs - 0.38, -3.5 + 0.15, 0.035 + 0.15), MAT['speaker'], r=0.008)
    H.box('Speaker_Top', (0.2, 0.18, 0.012), (bxs - 0.38, -3.5 + 0.15, 0.341), M['walnut'], bevel=0.002)
    for i in range(14):
        H.box(f'Record_{i}', (0.008, 0.31, 0.31), (bxs + 0.05 + i * 0.011, -3.5 + 0.17, 0.035 + 0.155), MAT['record'] if i % 3 else MAT['covers'][i % 9], bevel=0.0005).rotation_euler.y = deg(RNG.uniform(-3, 3) + (6 if i > 10 else 0))
    rounded('Power_Strip', (0.3, 0.055, 0.035), (bxs - 0.7, -3.44, 0.018), MAT['plastic_white'], r=0.006)
    cable('Speaker_Cable', [(bxs - 0.38, -3.44, 0.06), (bxs - 0.5, -3.47, 0.01), (bxs - 0.62, -3.45, 0.02)], 0.002, MAT['cable_black'])
    cable('Strip_Cable', [(bxs - 0.85, -3.44, 0.015), (bxs - 1.0, -3.47, 0.005), (bxs - 1.15, -3.49, 0.06), (bxs - 1.18, -3.493, 0.27)], 0.0025, MAT['cable'])
    H.box('Socket_Living', (0.085, 0.01, 0.085), (bxs - 1.18, -3.495, 0.3), MAT['switch'], bevel=0.003)
    # art above the sofa: real pictures in the frames
    for n in ('Art_Sofa_0', 'Art_Sofa_1', 'Art_Sofa_Frame_0', 'Art_Sofa_Frame_1', 'Art_Sideboard', 'Art_Sideboard_Frame'):
        if n in ob:
            bpy.data.objects.remove(ob[n], do_unlink=True)
    picture('Art_Sofa_Left', 'landscape_a', 0.62, 0.465, (sx - 0.5, -3.5 + 0.002, 1.62), 0.0, M['black_metal'], border=0.018, mount=0.06)
    picture('Art_Sofa_Right', 'abstract_b', 0.42, 0.42, (sx + 0.42, -3.5 + 0.002, 1.5), 0.0, M['oak'], border=0.02, mount=0.0)
    picture('Art_Sofa_Small', 'kid_house', 0.24, 0.175, (sx + 0.42, -3.5 + 0.002, 1.9), 0.0, M['black_metal'], border=0.012, mount=0.03)
    picture('Art_Sideboard', 'abstract_a', 0.54, 0.72, (-4.5 + 0.002, 0.08, 1.58), deg(-90), M['oak'], border=0.025, mount=0.0)
    picture('Art_Entry', 'photo_b', 0.3, 0.225, (-4.5 + 0.002, -1.5, 2.1), deg(-90), M['black_metal'], border=0.012, mount=0.04)
    bookshelf_life(M)


def toy_car(name, loc, rot):
    g = group(name, loc, (0, 0, deg(rot)))
    child(rounded(f'{name}_Body', (0.14, 0.065, 0.035), (0, 0, 0), MAT['plastic_red'], r=0.01), g, (0, 0, 0.03))
    child(rounded(f'{name}_Cab', (0.065, 0.058, 0.03), (0, 0, 0), MAT['plastic_red'], r=0.01), g, (-0.01, 0, 0.058))
    for i, (x, y) in enumerate(((0.045, 0.034), (-0.045, 0.034), (0.045, -0.034), (-0.045, -0.034))):
        child(H.cyl(f'{name}_Wheel_{i}', 0.016, 0.012, (0, 0, 0), MAT['plush_dark'], segs=16, rot=(deg(90), 0, 0)), g, (x, y, 0.016))


def teddy(name, loc, rot, s=1.0):
    g = group(name, loc, (0, 0, deg(rot)))
    m = MAT['plush']
    child(H.sphere(f'{name}_Body', 0.07 * s, (0, 0, 0), m, scale=(0.9, 1.0, 1.15)), g, (0, 0, 0.08 * s))
    child(H.sphere(f'{name}_Head', 0.055 * s, (0, 0, 0), m), g, (0.0, 0.0, 0.2 * s))
    for k in (-1, 1):
        child(H.sphere(f'{name}_Ear_{k}', 0.022 * s, (0, 0, 0), m, scale=(0.5, 1, 2.2)), g, (0, k * 0.03 * s, 0.29 * s))
        child(H.sphere(f'{name}_Arm_{k}', 0.025 * s, (0, 0, 0), m, scale=(1, 1, 1.8)), g, (0.02 * s, k * 0.07 * s, 0.1 * s))
        child(H.sphere(f'{name}_Leg_{k}', 0.03 * s, (0, 0, 0), m, scale=(1.6, 1, 1)), g, (0.06 * s, k * 0.04 * s, 0.025 * s))
    child(H.sphere(f'{name}_Nose', 0.008 * s, (0, 0, 0), MAT['plush_dark']), g, (0.054 * s, 0, 0.2 * s))
    return g


def rug_with_corner(M):
    ob = bpy.data.objects
    if 'Rug' not in ob:
        return
    r = ob['Rug']
    cx, cy = r.location.x, r.location.y
    w, d = 3.3, 2.5
    bpy.data.objects.remove(r, do_unlink=True)

    def shape(u, v):
        x, y = (u - 0.5) * w, (v - 0.5) * d
        # the north-east corner (u, v -> 1) curls up over a 28 cm triangle
        k = (u + v - 2 + 0.24) / 0.24
        z = 0.012
        if k > 0:
            ang = min(k, 1.0) * deg(65)
            z += math.sin(ang) * 0.1 * k
            back = (1 - math.cos(ang)) * 0.06 * k
            x -= back
            y -= back
        return (x, y, z)
    o = drape('Rug', M['rug'], w, d, (cx, cy, 0.0), (0, 0, 0), shape, res=(66, 50), thick=0.012)
    for m in o.modifiers:
        if m.type == 'SUBSURF':
            m.levels = m.render_levels = 0


def bookshelf_life(M):
    """Re-stock the oak bookshelf: printed spines in varied heights, a flat stack, photos, a vase, a box."""
    ob = bpy.data.objects
    for o in list(ob):
        if o.name.startswith('Shelf_Book_') or o.name.startswith('Shelf_Vase_'):
            bpy.data.objects.remove(o, do_unlink=True)
    bx, bw = 1.25, 1.2
    y = -3.5 + 0.17
    rows = [(0.42, bx - 0.55, bx + 0.05, (bx + 0.42, 3)), (0.82, bx - 0.55, bx + 0.28, None), (1.22, bx - 0.25, bx + 0.52, None), (1.62, bx - 0.55, bx + 0.12, (bx + 0.42, 2))]
    for s, (z, x0, x1, flat) in enumerate(rows):
        shelf_row(f'Shelf_Book_{s}', x0, x1, y, z + 0.0125, flat_stack=flat, lean_end=s != 2)
    f = ph('standing_picture_frame_02', (bx + 0.42, y - 0.02, 0.8325), rot=-8, scale=0.75, name='Shelf_Photo')
    _swap_artwork(f, 'photo_a')
    ph('ceramic_vase_03', (bx - 0.45, y, 1.2325), scale=0.55, name='Shelf_Vase')
    rounded('Shelf_Box', (0.2, 0.15, 0.12), (bx + 0.36, y, 1.6325 + 0.07), H.principled('Keepsake Box', '#b9a27e', 0.55), r=0.004)
    ph('carved_wooden_elephant', (bx + 0.36, y + 0.01, 1.7625), rot=-20, scale=1.0, name='Shelf_Elephant')
    ph('ceramic_vase_01', (bx + 0.3, y, 2.0125), scale=0.6, name='Shelf_Top_Vase')
    ph('fern_02', (bx - 0.3, y + 0.02, 2.0125), scale=0.55, only=['fern_02_a'], name='Shelf_Fern')
    H.lathe_obj('Shelf_Fern_Pot', [(0.0, 0.0), (0.07, 0.0), (0.09, 0.12), (0.095, 0.125), (0.0, 0.11)], (bx - 0.3, y + 0.02, 2.0125), M['terracotta'])
    bpy.data.objects['Shelf_Fern'].location.z = 2.0125 + 0.1


def dining(M):
    import build_home as BH
    ob = bpy.data.objects
    dx, dy = BH.LAYOUT['dining']
    cx, cy = BH.LAYOUT['cake']
    top = BH.LAYOUT['dining_top']
    # table: water jug, kids' cups, napkins, a phone, the cake knife and crumbs, an opened present
    ph('jug_01', (dx + 0.62, dy - 0.12, top), rot=-30, scale=0.85, name='Water_Jug')
    for i, (x, y, m) in enumerate(((dx + 0.42, dy - 0.33, 'cup_kid_a'), (dx - 0.62, dy - 0.3, 'cup_kid_b'))):
        H.lathe_obj(f'Kids_Cup_{i}', [(0.0, 0.0), (0.032, 0.0), (0.04, 0.095), (0.037, 0.096), (0.03, 0.006), (0.0, 0.006)], (x, y, top), MAT[m], segs=32)
    for i, (x, y, r) in enumerate(((dx - 0.45, dy - 0.15, 8), (dx + 0.45, dy - 0.2, -14), (dx - 0.5, dy + 0.3, 4), (dx + 0.48, dy + 0.32, 97))):
        H.box(f'Napkin_{i}', (0.13, 0.13, 0.008), (x - 0.13, y, top + 0.004), MAT['napkin'], bevel=0.003).rotation_euler.z = deg(r)
    rounded('Phone_On_Table', (0.075, 0.155, 0.008), (dx - 0.72, dy + 0.12, top + 0.004), MAT['phone'], rot=(0, 0, deg(23)), r=0.004)
    kn = group('Cake_Knife', (cx + 0.24, cy - 0.12, top + 0.006), (0, 0, deg(-38)))
    child(H.box('Cake_Knife_Blade', (0.17, 0.028, 0.0015), (0, 0, 0), MAT['knife'], bevel=0.0006), kn, (0.08, 0, 0))
    child(rounded('Cake_Knife_Handle', (0.11, 0.022, 0.016), (0, 0, 0), M['walnut'], r=0.006), kn, (-0.06, 0, 0.006))
    for i in range(14):
        a = RNG.uniform(0, math.tau)
        r = RNG.uniform(0.17, 0.26)
        H.sphere(f'Crumb_{i}', RNG.uniform(0.0015, 0.0035), (cx + math.cos(a) * r, cy - abs(math.sin(a)) * r * 0.8, top + 0.0015), MAT['crumb'], scale=(1, 1, 0.6), subd=1)
    hat = H.cyl('Party_Hat', 0.06, 0.15, (dx + 0.75, dy + 0.3, top + 0.075), MAT['party'], r2=0.002, segs=32)
    hat.rotation_euler = (deg(18), deg(-6), 0)
    # wrapping paper and ribbon left on the turned chair
    ch = BH.LAYOUT['dining_chairs'][1]

    def crumple(u, v):
        return ((u - 0.5) * 0.5, (v - 0.5) * 0.36, 0.02 * math.sin(u * 13 + v * 5) + 0.015 * math.sin(v * 17) + 0.04 * (u - 0.5) ** 2)
    drape('Wrapping_Paper', MAT['wrap_a'], 0.5, 0.36, (ch[0], ch[1], 0.49), (0, deg(4), deg(30)), crumple, res=(30, 22), thick=0.0008)
    bpy.data.objects['Wrapping_Paper'].location.z = 0.525  # on the upholstered seat
    cable('Ribbon_Curl', [(ch[0] - 0.1 + 0.03 * math.cos(t * 1.6), ch[1] + 0.05 * math.sin(t * 1.6), 0.535 + t * 0.006) for t in range(9)], 0.003, MAT['ribbon'])
    cable('Ribbon_Fall', [(ch[0] + 0.2, ch[1] - 0.1, 0.49), (ch[0] + 0.24, ch[1] - 0.16, 0.35), (ch[0] + 0.26, ch[1] - 0.2, 0.15), (ch[0] + 0.3, ch[1] - 0.3, 0.003)], 0.0035, MAT['ribbon'])
    # balloons tied to Grandpa's chair
    gch = BH.LAYOUT['dining_chairs'][0]
    knot = V(gch[0] + 0.15, gch[1] + 0.2, 0.92)
    for i, (off, mat) in enumerate(((V(-0.18, 0.12, 1.12), 'latex_coral'), (V(0.06, 0.24, 1.32), 'latex_mustard'), (V(0.26, 0.05, 1.02), 'latex_teal'))):
        c = knot + off
        H.sphere(f'Balloon_{i}', 0.14, c, MAT[mat], scale=(1, 1, 1.18), subd=4)
        H.cyl(f'Balloon_Knot_{i}', 0.012, 0.025, c + V(0, 0, -0.17), MAT[mat], r2=0.004, segs=12)
        cable(f'Balloon_String_{i}', [c + V(0, 0, -0.18), c.lerp(knot, 0.5) + V(0.02 * i, 0.01, -0.05), knot], 0.0012, MAT['string'])
    # the hand-made garland across the window
    garland_flags(M)


def garland_flags(M):
    text = 'HAPPYBIRTHDAY'
    n = len(text)
    a, b = V(4.36, -0.95, 2.42), V(4.36, 1.95, 2.42)
    sag = 0.32
    pts = []
    for i in range(21):
        t = i / 20
        p = a.lerp(b, t)
        p.z -= sag * 4 * t * (1 - t)
        pts.append(p)
    cable('Garland_String', pts, 0.0015, MAT['string'])
    mat = art_material('Garland Flags', 'garland', rough=0.8, alpha=True)
    mat.blend_method = 'HASHED' if hasattr(mat, 'blend_method') else None
    gap = 1 / (n + 3)
    for k, ch in enumerate(text):
        t = (k + (2.0 if k >= 5 else 1.5)) * gap
        p = a.lerp(b, t)
        p.z -= sag * 4 * t * (1 - t)
        slope = -sag * 4 * (1 - 2 * t) / (b - a).length
        u0, u1 = k / n, (k + 1) / n
        f = quad_uv(f'Garland_Flag_{k}', 0.16, 0.19, mat, uv=((u0, 0), (u1, 0), (u1, 1), (u0, 1)))
        f.location = p + V(-0.01, 0, -0.095)
        f.rotation_euler = (deg(RNG.uniform(-6, 6)), math.atan(slope) * 0.6, deg(90))


def kitchen(M):
    import build_home as BH
    ob = bpy.data.objects
    y1 = 3.5
    ct = 0.91
    x_from, w = -4.4, (2.9 + 4.4) / 9
    if 'Backsplash' in ob and 'tiles' in M:
        ob['Backsplash'].data.materials[0] = M['tiles']
    # kettle, toaster, coffee maker
    ph('vintage_electric_kettle', (-2.72, y1 - 0.3, ct), rot=-25, scale=0.85, name='Kettle')
    t = group('Toaster', (-2.05, y1 - 0.24, ct), (0, 0, deg(4)))
    child(rounded('Toaster_Body', (0.28, 0.16, 0.19), (0, 0, 0), MAT['appliance'], r=0.03), t, (0, 0, 0.095))
    for k in (-1, 1):
        child(H.box(f'Toaster_Slot_{k}', (0.2, 0.025, 0.01), (0, 0, 0), MAT['plush_dark'], bevel=0.003), t, (0, k * 0.035, 0.19))
    child(H.box('Toaster_Lever', (0.02, 0.03, 0.012), (0, 0, 0), MAT['chrome'], bevel=0.003), t, (0.14, 0, 0.12))
    c = group('Coffee_Maker', (-0.35, y1 - 0.26, ct), (0, 0, deg(-6)))
    child(rounded('Coffee_Body', (0.22, 0.26, 0.36), (0, 0, 0), MAT['appliance_dark'], r=0.015), c, (0, 0.04, 0.18))
    child(rounded('Coffee_Head', (0.22, 0.12, 0.06), (0, 0, 0), MAT['appliance_dark'], r=0.01), c, (0, -0.13, 0.33))
    child(H.lathe_obj('Coffee_Carafe', [(0.0, 0.0), (0.06, 0.0), (0.07, 0.06), (0.05, 0.14), (0.045, 0.15), (0.0, 0.15)], (0, 0, 0), MAT['jar_glass']), c, (0, -0.13, 0.02))
    child(H.cyl('Coffee_In_Carafe', 0.058, 0.05, (0, 0, 0), H.principled('Coffee Dark', '#1d120b', 0.1, Coat_Weight=0.8)), c, (0, -0.13, 0.05))
    child(H.box('Coffee_Plate', (0.2, 0.14, 0.01), (0, 0, 0), MAT['chrome'], bevel=0.002), c, (0, -0.13, 0.005))
    # cutting board with a knife and half a lemon
    if 'Cutting_Board' in ob:
        bpy.data.objects.remove(ob['Cutting_Board'], do_unlink=True)
    ph('wooden_cutting_board', (-1.45, y1 - 0.32, ct), rot=8, scale=0.9, name='Cutting_Board')
    kn = group('Kitchen_Knife', (-1.42, y1 - 0.4, ct + 0.04), (0, 0, deg(-15)))
    child(H.box('Kitchen_Knife_Blade', (0.18, 0.035, 0.0018), (0, 0, 0), MAT['knife'], bevel=0.0008), kn, (0.06, 0, 0))
    child(rounded('Kitchen_Knife_Handle', (0.11, 0.024, 0.018), (0, 0, 0), M['black_metal'], r=0.007), kn, (-0.08, 0, 0.004))
    half = H.sphere('Lemon_Half', 0.034, (-1.6, y1 - 0.28, ct + 0.04), MAT['lemon_skin'], scale=(1.15, 1, 1))
    bm_cut = H.cyl('Lemon_Half_Face', 0.032, 0.003, (-1.6, y1 - 0.28, ct + 0.04), MAT['lemon_cut'], segs=32)
    half.scale = (1, 1, 0.5)
    half.location.z = ct + 0.041
    bm_cut.location.z = ct + 0.0425 + 0.017
    for i in range(3):
        H.cyl(f'Lemon_Slice_{i}', 0.03, 0.005, (-1.52 + i * 0.045, y1 - 0.22, ct + 0.043 + i * 0.002), MAT['lemon_cut'], segs=28).rotation_euler = (deg(RNG.uniform(-8, 8)), deg(RNG.uniform(-8, 8)), 0)
    # dish rack by the sink
    sink_x = x_from + w * 6.5
    r = group('Dish_Rack', (sink_x + 0.55, y1 - 0.3, ct), (0, 0, deg(-3)))
    for i in range(9):
        child(H.cyl(f'Rack_Wire_{i}', 0.0025, 0.13, (0, 0, 0), MAT['chrome'], segs=6), r, (-0.18 + i * 0.045, 0.06, 0.07))
        child(H.cyl(f'Rack_WireB_{i}', 0.0025, 0.08, (0, 0, 0), MAT['chrome'], segs=6), r, (-0.18 + i * 0.045, -0.08, 0.045))
    child(H.box('Rack_Tray', (0.42, 0.28, 0.012), (0, 0, 0), MAT['plastic_white'], bevel=0.003), r, (0, 0, 0.006))
    for i in range(3):
        p = H.lathe_obj(f'Rack_Plate_{i}', [(0.0, 0.0), (0.08, 0.0), (0.12, 0.015), (0.125, 0.02), (0.0, 0.006)], (0, 0, 0), M['plate'])
        child(p, r, (-0.12 + i * 0.05, 0.03, 0.135), (deg(90), deg(-8), deg(90)))
    for i in range(2):
        cup = H.lathe_obj(f'Rack_Cup_{i}', [(0.0, 0.0), (0.035, 0.0), (0.04, 0.09), (0.036, 0.09), (0.03, 0.006), (0.0, 0.006)], (0, 0, 0), M['mug'])
        child(cup, r, (0.1 + i * 0.08, -0.07, 0.1), (deg(180 - 25), 0, 0))
    # oven door under the hob, with a tea towel over its handle
    hob_x = x_from + w * 1.5
    H.box('Oven_Door', (0.58, 0.012, 0.5), (hob_x, y1 - 0.62 - 0.006, 0.42), MAT['black_gloss'], bevel=0.004)
    H.cyl('Oven_Handle', 0.009, 0.5, (hob_x, y1 - 0.62 - 0.05, 0.73), MAT['steel'], rot=(0, deg(90), 0), segs=16)

    def towel(u, v):
        # over the bar: hangs both sides, front side longer
        w_ = (u - 0.5) * 0.3
        t = v
        if t < 0.38:
            y_, z_ = -0.012 - 0.003 * math.sin(u * 20), 0.735 - (0.38 - t) * 0.7
        elif t < 0.46:
            a = (t - 0.38) / 0.08 * math.pi
            y_, z_ = -0.012 * math.cos(a), 0.735 + 0.012 * math.sin(a)
        else:
            y_, z_ = 0.012 + 0.004 * math.sin(u * 17), 0.735 - (t - 0.46) * 0.75
        return (w_, y_, z_)
    drape('Tea_Towel', M['gingham'], 0.3, 0.6, (hob_x + 0.08, y1 - 0.62 - 0.05, 0.0), (0, 0, 0), towel, res=(18, 40), thick=0.002)
    # spices and oils by the hob
    for i in range(5):
        x, y = -3.85 + i * 0.065, y1 - 0.12 - (i % 2) * 0.06
        H.cyl(f'Spice_Jar_{i}', 0.025, 0.1, (x, y, ct + 0.05), MAT['jar_glass'], segs=24)
        H.cyl(f'Spice_{i}', 0.022, 0.07, (x, y, ct + 0.037), MAT[('spice_a', 'spice_b', 'spice_c')[i % 3]], segs=24)
        H.cyl(f'Spice_Lid_{i}', 0.026, 0.014, (x, y, ct + 0.107), MAT['cork'] if i % 2 else M['black_metal'], segs=24)
        H.cyl(f'Spice_Label_{i}', 0.0255, 0.03, (x, y, ct + 0.05), MAT['label'], segs=24, caps=False)
    for i, (x, hh) in enumerate(((-3.48, 0.28), (-3.4, 0.24))):
        H.lathe_obj(f'Oil_Bottle_{i}', [(0.0, 0.0), (0.035, 0.0), (0.035, hh * 0.7), (0.014, hh * 0.85), (0.012, hh), (0.0, hh)], (x, y1 - 0.12, ct), MAT['bottle_glass'], segs=32)
        H.lathe_obj(f'Oil_{i}', [(0.0, 0.0), (0.032, 0.0), (0.032, hh * 0.62), (0.0, hh * 0.62)], (x, y1 - 0.12, ct + 0.003), MAT['oil'], segs=32)
        H.cyl(f'Oil_Label_{i}', 0.0355, 0.06, (x, y1 - 0.12, ct + hh * 0.35), MAT['label'], segs=32, caps=False)
        H.cyl(f'Oil_Cap_{i}', 0.014, 0.02, (x, y1 - 0.12, ct + hh + 0.01), MAT['cork'], segs=16)
    # cookbook propped open against the backsplash
    cb = group('Cookbook', (-0.95, y1 - 0.14, ct + 0.13), (deg(70), 0, deg(180)))
    for side in (-1, 1):
        child(paper(f'Cookbook_Page_{side}', 'cookbook' if side > 0 else 'page_text', 0.19, 0.25, (0, 0, 0), (0, 0, 0), curl=0.004), cb, (side * 0.097, 0, 0), (0, side * deg(-6), 0))
    H.box('Cookbook_Stand', (0.3, 0.02, 0.02), (-0.95, y1 - 0.2, ct + 0.01), M['oak'], bevel=0.003)
    # fridge in the back corner, covered in magnets, drawings and the calendar
    fx, fy = 3.32, 3.15
    rounded('Fridge', (0.7, 0.66, 1.86), (fx, fy, 0.93), MAT['fridge'], r=0.015)
    H.box('Fridge_Split', (0.7, 0.004, 0.006), (fx, fy - 0.331, 1.22), MAT['plush_dark'], bevel=0)
    for z0, z1 in ((0.95, 1.15), (1.32, 1.72)):
        H.box(f'Fridge_Handle_{z0}', (0.025, 0.03, z1 - z0), (fx - 0.28, fy - 0.35, (z0 + z1) / 2), MAT['steel'], bevel=0.008)
    for i, (art, x, z, w_, h_, r) in enumerate((('kid_house', 0.05, 1.5, 0.27, 0.2, 4), ('kid_cat', -0.08, 1.04, 0.25, 0.18, -6), ('calendar', 0.15, 0.62, 0.21, 0.3, 1),
                                               ('mail_a', -0.13, 1.68, 0.14, 0.09, -12))):
        p = paper(f'Fridge_Paper_{i}', art, w_, h_, (fx + x, fy - 0.333, z), (deg(90), deg(r), 0), curl=0.004)
        mg = H.cyl(f'Fridge_Magnet_{i}', 0.012, 0.008, (fx + x - w_ * 0.3, fy - 0.338, z + h_ * 0.42), MAT[('magnet_a', 'magnet_b', 'magnet_c')[i % 3]], segs=16)
        mg.rotation_euler = (deg(90), 0, 0)
    for i in range(5):
        mg = H.box(f'Fridge_Letter_{i}', (0.03, 0.006, 0.04), (fx - 0.15 + i * 0.045, fy - 0.336, 1.32 + RNG.uniform(-0.02, 0.02)),
                   MAT[('magnet_a', 'magnet_b', 'magnet_c', 'plastic_green')[i % 4]], bevel=0.003)
        mg.rotation_euler.y = deg(RNG.uniform(-15, 15))
    # herbs on the window sill, a bin by the island, lunchbox, school bag on a stool, the fruit bowl
    b = group('Pedal_Bin', (-0.22, 2.78, 0), (0, 0, deg(10)))
    child(H.cyl('Bin_Body', 0.14, 0.42, (0, 0, 0), MAT['steel'], segs=40), b, (0, 0, 0.21))
    child(H.cyl('Bin_Lid', 0.142, 0.02, (0, 0, 0), MAT['steel'], segs=40), b, (0, 0, 0.43))
    child(H.box('Bin_Pedal', (0.08, 0.05, 0.012), (0, 0, 0), M['black_metal'], bevel=0.003), b, (0, -0.15, 0.02))
    ix, iy = BH.LAYOUT['island']
    lb = rounded('Lunchbox', (0.2, 0.14, 0.07), (ix + 0.55, iy + 0.22, 0.9175 + 0.035), MAT['lunchbox'], rot=(0, 0, deg(-12)), r=0.012)
    ph('croissant', (ix + 0.85, iy + 0.05, 0.9175 + 0.022), rot=40, name='Croissant')
    H.lathe_obj('Croissant_Plate', [(0.0, 0.0), (0.07, 0.0), (0.1, 0.012), (0.105, 0.016), (0.0, 0.005)], (ix + 0.85, iy + 0.05, 0.9175), M['plate'])
    bag = group('School_Bag', (-2.72, 1.72, 0.0), (deg(-8), 0, deg(-70)))
    child(rounded('School_Bag_Body', (0.28, 0.14, 0.36), (0, 0, 0), MAT['bag'], r=0.04), bag, (0, 0, 0.18))
    child(rounded('School_Bag_Pocket', (0.2, 0.06, 0.15), (0, 0, 0), MAT['bag'], r=0.025), bag, (0, -0.08, 0.1))
    for k in (-1, 1):
        child(cable(f'School_Bag_Strap_{k}', [(k * 0.08, 0.07, 0.34), (k * 0.1, 0.12, 0.2), (k * 0.09, 0.09, 0.03)], 0.012, MAT['bag']), bag)
    for o in list(ob):
        if o.name.startswith('Lemon_') and not o.name.startswith('Lemon_Half') and not o.name.startswith('Lemon_Slice'):
            bpy.data.objects.remove(o, do_unlink=True)
    fb = V(ix - 0.55, iy + 0.15, 0.9175)
    ph('bananas', fb + V(0.0, 0.02, 0.06), rot=30, only=['bananas_bunch'], name='Fruit_Bananas')
    ph('food_apple_01', fb + V(-0.07, -0.05, 0.03), rot=10, name='Fruit_Apple_0')
    ph('food_apple_01', fb + V(0.06, -0.06, 0.035), rot=140, name='Fruit_Apple_1')
    ph('lemon', fb + V(-0.02, 0.08, 0.075), rot=60, tilt=(80, 0), name='Fruit_Lemon')
    ph('food_pears_asian_01', fb + V(0.25, -0.12, 0.027), only=['pears_asian_01_a'], name='Fruit_Pear')


def window_wall(M):
    import build_home as BH
    ob = bpy.data.objects
    # real houseplants replace the v1 stick plants; one calathea leaf set yellowing
    for o in list(ob):
        if any(o.name.startswith(p) for p in ('Plant_Fig', 'Plant_Small', 'Plant_Floor', 'Plant_Nook')):
            bpy.data.objects.remove(o, do_unlink=True)
    ph('pachira_aquatica_01', (4.02, 1.55, 0.0), rot=40, scale=0.95, name='Plant_Money_Tree')
    ph('potted_plant_02', (3.98, 0.62, 0.0), rot=-20, scale=1.0, name='Plant_Pothos')
    cal = ph('calathea_orbifolia_01', (4.08, -1.45, 0.0), rot=75, scale=1.15, name='Plant_Calathea')
    H.lathe_obj('Plant_Calathea_Pot', [(0.0, 0.0), (0.12, 0.0), (0.15, 0.2), (0.155, 0.205), (0.0, 0.19)], (4.08, -1.45, 0.0), M['ceramic'])
    cal.location.z = 0.19
    _yellow_leaves(cal)
    ph('anthurium_botany_01', (2.05, -3.18, 0.0), rot=200, scale=0.75, name='Plant_Anthurium')
    H.lathe_obj('Plant_Anthurium_Pot', [(0.0, 0.0), (0.11, 0.0), (0.13, 0.22), (0.135, 0.225), (0.0, 0.21)], (2.05, -3.18, 0.0), M['terracotta'])
    bpy.data.objects['Plant_Anthurium'].location.z = 0.2
    ph('potted_plant_01', (2.15, 3.0, 0.0), rot=-30, scale=0.9, name='Plant_Corner')
    ph('watering_can_metal_01', (4.15, 0.05, 0.0), rot=110, scale=0.9, name='Watering_Can')
    # the cat's things: toy mouse by the bed
    bx, by = BH.LAYOUT['catbed']
    mo = group('Toy_Mouse', (bx - 0.5, by - 0.32, 0.0), (0, 0, deg(130)))
    child(H.sphere('Toy_Mouse_Body', 0.03, (0, 0, 0), MAT['mouse_toy'], scale=(1.6, 1, 0.9)), mo, (0, 0, 0.026))
    for k in (-1, 1):
        child(H.sphere(f'Toy_Mouse_Ear_{k}', 0.012, (0, 0, 0), MAT['mouse_toy'], scale=(0.4, 1, 1)), mo, (0.03, k * 0.016, 0.05))
    child(cable('Toy_Mouse_Tail', [(-0.045, 0, 0.02), (-0.09, 0.02, 0.005), (-0.14, -0.01, 0.003)], 0.0015, MAT['string']), mo)
    # window latches on the mullions
    for i, yy in enumerate((-0.73, 0.73)):
        H.box(f'Window_Latch_{i}', (0.03, 0.018, 0.12), (4.5 + 0.02, yy + 0.04, 1.25), M['black_metal'], bevel=0.004)
    # radiator on the front wall by the door, with its pipes
    rx = -3.25
    for i in range(9):
        H.box(f'Radiator_Fin_{i}', (0.09, 0.07, 0.52), (rx - 0.4 + i * 0.1, -3.5 + 0.075, 0.42), MAT['radiator'], bevel=0.012)
    for z in (0.18, 0.66):
        H.cyl(f'Radiator_Header_{z}', 0.018, 0.92, (rx, -3.5 + 0.075, z), MAT['radiator'], rot=(0, deg(90), 0), segs=16)
    for k in (-1, 1):
        H.cyl(f'Radiator_Pipe_{k}', 0.011, 0.18, (rx + k * 0.5, -3.5 + 0.075, 0.09), MAT['chrome'], segs=12)
    H.cyl('Radiator_Valve', 0.02, 0.06, (rx + 0.5, -3.5 + 0.075, 0.2), MAT['plastic_white'], segs=16)
    # curtains: rebuild the sheers with fuller, irregular folds and a weighted hem
    for n in ('Sheer_L', 'Sheer_R', 'Sheer_M'):
        if n in ob:
            bpy.data.objects.remove(ob[n], do_unlink=True)
    x1 = 4.5
    for nm, yc, width, seed in (('Sheer_L', -1.75, 1.1, 1), ('Sheer_R', 1.62, 1.35, 2), ('Sheer_M', 0.12, 0.6, 3)):
        rnd = random.Random(seed)
        phases = [rnd.uniform(0, math.tau) for _ in range(3)]

        def sheer(u, v, yc=yc, width=width, phases=phases):
            yy = yc - width / 2 + u * width
            amp = 0.03 + 0.012 * math.sin(u * 7 + phases[0])
            fold = math.sin(u * width * 11 * math.pi + phases[1] + 0.6 * math.sin(v * 3 + phases[2]))
            xx = x1 - 0.14 + amp * fold * (0.7 + 0.3 * v) + 0.01 * math.sin(v * 9 + u * 30)
            zz = 0.02 + v * 2.64
            return (xx, yy, zz)
        o = drape(nm, M['sheer'], width, 2.64, (0, 0, 0), (0, 0, 0), sheer, res=(140, 18), thick=0.0)
        o.modifiers.remove(o.modifiers['Thick'])
        H.box(f'{nm}_Hem', (0.012, width, 0.025), (x1 - 0.14, yc, 0.032), M['sheer'], bevel=0.004)
    # glass: a light film of dust and specks that catch the low sun
    _dusty_glass(M)


def _yellow_leaves(root):
    kids = [c for c in root.children if c.type == 'MESH']
    if not kids:
        return
    c = kids[-1]
    for i, slot in enumerate(c.material_slots):
        m = slot.material
        if m is None:
            continue
        y = m.copy()
        y.name = m.name + ' yellowing'
        nt = y.node_tree
        bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if bsdf and bsdf.inputs['Base Color'].is_linked:
            src = bsdf.inputs['Base Color'].links[0].from_socket
            hs = nt.nodes.new('ShaderNodeHueSaturation')
            hs.inputs['Hue'].default_value = 0.42
            hs.inputs['Saturation'].default_value = 0.85
            hs.inputs['Value'].default_value = 1.15
            nt.links.new(src, hs.inputs['Color'])
            nt.links.new(hs.outputs['Color'], bsdf.inputs['Base Color'])
        slot.link = 'OBJECT'
        slot.material = y


def _dusty_glass(M):
    m = M['window_glass']
    nt = m.node_tree
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    surf = out.inputs['Surface'].links[0].from_socket
    tc = H.node(nt, 'ShaderNodeTexCoord', (-400, -400))
    nz = H.node(nt, 'ShaderNodeTexNoise', (-200, -400), Scale=900.0, Detail=1.0)
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    film = H.node(nt, 'ShaderNodeTexNoise', (-200, -600), Scale=3.0, Detail=4.0)
    nt.links.new(tc.outputs['Object'], film.inputs['Vector'])
    specks = H.node(nt, 'ShaderNodeMapRange', (0, -400), From_Min=0.74, From_Max=0.8, To_Min=0.0, To_Max=0.5)
    nt.links.new(nz.outputs['Fac'], specks.inputs['Value'])
    haze = H.node(nt, 'ShaderNodeMapRange', (0, -600), From_Min=0.35, From_Max=0.75, To_Min=0.0, To_Max=0.05)
    nt.links.new(film.outputs['Fac'], haze.inputs['Value'])
    add = H.node(nt, 'ShaderNodeMath', (200, -500), operation='ADD')
    add.use_clamp = True
    nt.links.new(specks.outputs['Result'], add.inputs[0])
    nt.links.new(haze.outputs['Result'], add.inputs[1])
    dust = H.node(nt, 'ShaderNodeBsdfDiffuse', (200, -250), Color=(0.85, 0.83, 0.8, 1))
    mx = H.node(nt, 'ShaderNodeMixShader', (500, -100))
    nt.links.new(add.outputs[0], mx.inputs['Fac'])
    nt.links.new(surf, mx.inputs[1])
    nt.links.new(dust.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs['Surface'])


def nook(M):
    import build_home as BH
    ax, ay, rot = BH.LAYOUT['armchair']
    # side table: glass of water and reading glasses; a stack of picture books
    st = V(*BH.LAYOUT['nook_table'], 0.535)
    H.lathe_obj('Nook_Water_Glass', [(0.0, 0.0), (0.032, 0.0), (0.036, 0.11), (0.033, 0.11), (0.029, 0.004), (0.0, 0.004)], st + V(-0.08, 0.06, 0), MAT['glass_clear'], segs=32)
    H.lathe_obj('Nook_Water', [(0.0, 0.0), (0.03, 0.0), (0.033, 0.07), (0.0, 0.07)], st + V(-0.08, 0.06, 0.005), MAT['water'], segs=32)
    gl = ph('round_spectacles', st + V(0.07, 0.1, 0.02), rot=140, tilt=(-4, 0), name='Reading_Glasses')
    for c in gl.children:
        for slot in c.material_slots:
            if slot.material and 'glass' in slot.material.name:
                slot.link = 'OBJECT'
                slot.material = MAT['glass_clear']
    zz = 0.0
    for i in range(4):
        th = RNG.uniform(0.012, 0.022)
        w_ = RNG.uniform(0.24, 0.3)
        book(f'Picture_Book_Stack_{i}', (ax + 0.62, ay + 0.38, zz + th / 2), (0, deg(90), deg(RNG.uniform(-10, 10) + 30)), th, w_ * 0.85, w_, MAT['covers'][(i * 3) % 9])
        zz += th
    # soft toy and slippers by the chair
    teddy('Nook_Teddy', (ax - 0.55, ay + 0.75, 0.0), 120, 1.1)
    for k in (-1, 1):
        s = group(f'Slipper_{k}', (ax + 0.55 + k * 0.08, ay + 0.55 + k * 0.05, 0.0), (0, 0, deg(-40 + k * 12)))
        child(rounded(f'Slipper_{k}_Sole', (0.26, 0.095, 0.02), (0, 0, 0), MAT['rubber'], r=0.009), s, (0, 0, 0.01))
        child(H.sphere(f'Slipper_{k}_Upper', 0.5, (0, 0, 0), MAT['slipper'], scale=(0.15, 0.1, 0.07)), s, (0.05, 0, 0.022))
    flx, fly = BH.LAYOUT['floor_lamp']
    cable('Floor_Lamp_Cord', [(flx, fly, 0.02), (flx + 0.15, fly - 0.2, 0.005), (4.3, -3.2, 0.006), (4.45, -3.28, 0.1), (4.493, -3.3, 0.27)], 0.0025, MAT['cable'])
    H.box('Socket_Nook', (0.01, 0.085, 0.085), (4.495, -3.3, 0.3), MAT['switch'], bevel=0.003)
    picture('Art_Nook_A', 'landscape_b', 0.4, 0.3, (2.85, -3.5 + 0.002, 1.75), 0.0, M['oak'], border=0.018, mount=0.05)
    picture('Art_Nook_B', 'kid_cat', 0.26, 0.19, (3.38, -3.5 + 0.002, 1.62), 0.0, M['black_metal'], border=0.012, mount=0.03)
    picture('Art_Dining', 'abstract_c', 0.8, 0.6, (4.5 - 0.002, -2.85, 1.55), deg(90), M['black_metal'], border=0.02, mount=0.0)


def fittings(M):
    """The things every room has: sockets, switches, a smoke detector, a door frame to the hall."""
    H.box('Switch_Kitchen', (0.085, 0.01, 0.085), (2.98, 3.495, 1.12), MAT['switch'], bevel=0.003)
    for i, (x, z) in enumerate(((-2.4, 1.05), (0.1, 1.05), (2.2, 1.05))):
        H.box(f'Socket_Kitchen_{i}', (0.14, 0.01, 0.085), (x, 3.488, z), MAT['switch'], bevel=0.003)
    H.box('Socket_Dining', (0.085, 0.01, 0.085), (2.6, 3.495, 0.3), MAT['switch'], bevel=0.003)
    H.cyl('Smoke_Detector', 0.06, 0.03, (0.4, -0.3, 2.785), MAT['smoke'], segs=40)
    H.cyl('Smoke_Detector_Light', 0.004, 0.004, (0.43, -0.3, 2.768), H.emissive('Smoke LED', '#7cff8a', 2.0), segs=8)
    # wear: scuffs low on the walls by the door and behind the dining chairs
    sc = H.principled('Wall Scuff', '#b9b1a4', 0.9, Alpha=0.35)
    for i, (loc, rot, w_, h_) in enumerate((((-4.497, -1.95, 0.32), deg(-90), 0.25, 0.12), ((2.1, 3.497, 0.55), deg(180), 0.35, 0.08), ((-2.9, -3.497, 0.18), 0.0, 0.3, 0.1))):
        q = quad_uv(f'Wall_Scuff_{i}', w_, h_, sc)
        q.location = loc
        q.rotation_euler = (0, 0, rot)
        q.visible_shadow = False


def garden(M):
    """Outside the window: a patio, lawn, shrubs, a small tree, a fence, and the neighbours' house whose
    windows light up at night. Replaces v1's flat emissive backdrop."""
    ob = bpy.data.objects
    for n in ('Garden_Backdrop', 'Lawn'):
        if n in ob:
            bpy.data.objects.remove(ob[n], do_unlink=True)
    C = 'Outside'
    patio = H.textured('Patio Stone', '#b9b2a6', '#a59d90', rough=0.85, scale=1.4, bump=0.3)
    H.box('Patio', (2.4, 14.0, 0.1), (4.62 + 1.2, 0.0, -0.08), patio, bevel=0, collection=C)
    H.box('Lawn', (12.0, 30.0, 0.1), (6.0 + 6.0, 0.0, -0.12), M['grass'], bevel=0, collection=C)
    for i in range(48):
        x = 14.5
        y = -12.0 + i * 0.5
        H.box(f'Fence_Board_{i}', (0.025, 0.14, 1.85 + 0.04 * math.sin(i)), (x, y, 0.85), M['fence'], bevel=0.003, collection=C)
    for k, z in enumerate((0.4, 1.4)):
        H.box(f'Fence_Rail_{k}', (0.05, 24.0, 0.08), (14.45, 0.0, z), M['fence'], bevel=0.004, collection=C)
    # shrubs along the fence and by the patio, a small tree
    for i, (x, y, r, s) in enumerate(((13.2, -3.5, 10, 1.3), (13.3, 1.2, 80, 1.15), (13.0, 5.0, 200, 1.25), (13.4, -7.5, 140, 1.1))):
        ph('shrub_02', (x, y, -0.07), rot=r, scale=s, only=['LOD1'], name=f'Shrub_Fence_{i}', coll=C)
    for i, (x, y, r) in enumerate(((7.2, -2.6, 30), (7.0, 2.8, 100), (7.4, 0.4, 250))):
        ph('shrub_04', (x, y, -0.07), rot=r, scale=2.6, only=['LOD1'], name=f'Shrub_Bed_{i}', coll=C)
        ph('shrub_01', (x + 0.4, y + 0.6, -0.07), rot=r + 40, scale=2.2, only=['LOD1'], name=f'Shrub_Small_{i}', coll=C)
    ph('tree_small_02', (10.5, -2.8, -0.07), rot=60, scale=1.2, skip=['LOD0'], name='Garden_Tree', coll=C)
    # the neighbours' house beyond the fence
    # it sits to the south-east, so the low afternoon sun (from +X, a little +Y) still reaches the window
    H.box('Neighbour_Wall', (0.3, 14.0, 6.2), (24.0, -9.0, 3.0), M['brick'], bevel=0, collection=C)
    H.box('Neighbour_Roof', (3.0, 14.4, 0.2), (23.2, -9.0, 6.1), H.principled('Roof Slate', '#3d3f43', 0.7), bevel=0, collection=C)
    lit = H.emissive('Neighbour Window Light', '#ffb766', 0.0)
    dark = H.principled('Neighbour Glass', '#1f2a33', 0.05, Coat_Weight=1.0)
    for i, (y, z, on) in enumerate(((-13.0, 1.5, False), (-9.5, 1.5, True), (-6.0, 1.5, False), (-3.2, 1.5, True), (-13.0, 4.2, True), (-9.5, 4.2, False), (-6.0, 4.2, False), (-3.2, 4.2, False))):
        H.box(f'Neighbour_Window_{i}', (0.06, 1.1, 1.4), (23.84, y, z), lit if on else dark, bevel=0.01, collection=C)
        H.box(f'Neighbour_Frame_{i}', (0.08, 1.24, 1.54), (23.86, y, z), M['trim'], bevel=0.01, collection=C)
    # a curtain behind each lit window so it glows instead of reading as a hole
    H.box('Neighbour_Interior', (0.05, 14.0, 6.0), (24.1, -9.0, 3.0), H.principled('Neighbour Interior', '#2a2420', 0.9), bevel=0, collection=C)
    garden_life(M, lit)
    return lit


# animated outside pieces, read by build_home.set_lighting: the far tree line's brightness and the street lamp
OUTSIDE = {}


def far_treeline():
    """A tree line about 75 m away (cut from a CC0 panorama, make_backdrop.py) on a cylinder centred on the room,
    seen only by the camera (through the glass): no shadows, no bounce light, so the room's lighting is unchanged.
    The scene's own animated sky shows between the trees."""
    path = os.path.join(ART, 'treeline.png')
    if not os.path.exists(path):
        print('missing', path, '(run make_backdrop.py)')
        return
    el_low, el_high, span = math.radians(-3.6), math.radians(25.0), math.radians(160)
    r, eye, n = 75.0, 1.2, 64
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    rows = []
    for el in (el_low, el_high):
        row = []
        for i in range(n + 1):
            a = span / 2 - span * i / n  # left edge of the picture (u = 0) is north (+Y) when looking out (+X)
            row.append(bm.verts.new((r * math.cos(a), r * math.sin(a), eye + r * math.tan(el))))
        rows.append(row)
    for i in range(n):
        f = bm.faces.new((rows[0][i], rows[1][i], rows[1][i + 1], rows[0][i + 1]))
        for loop, (u, v) in zip(f.loops, ((i / n, 0), (i / n, 1), ((i + 1) / n, 1), ((i + 1) / n, 0))):
            loop[uv].uv = (u, v)
    m, nt, out = H.new_mat('Far Tree Line')
    tex = H.node(nt, 'ShaderNodeTexImage', (-400, 0))
    tex.image = bpy.data.images.load(path, check_existing=True)
    tex.extension = 'EXTEND'
    tint = H.node(nt, 'ShaderNodeMix', (-150, 100))
    tint.data_type = 'RGBA'
    tint.blend_type = 'MULTIPLY'
    tint.inputs['Factor'].default_value = 1.0
    nt.links.new(tex.outputs['Color'], tint.inputs['A'])
    tint.inputs['B'].default_value = (1, 1, 1, 1)
    em = H.node(nt, 'ShaderNodeEmission', (100, 100), Strength=2.0)
    nt.links.new(tint.outputs['Result'], em.inputs['Color'])
    tr = H.node(nt, 'ShaderNodeBsdfTransparent', (100, -100))
    mx = H.node(nt, 'ShaderNodeMixShader', (300, 0))
    nt.links.new(tex.outputs['Alpha'], mx.inputs['Fac'])
    nt.links.new(tr.outputs[0], mx.inputs[1])
    nt.links.new(em.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs['Surface'])
    o = mesh_obj('Far_Tree_Line', bm, m, smooth=False, coll='Outside')
    for attr in ('visible_diffuse', 'visible_glossy', 'visible_shadow', 'visible_volume_scatter'):
        setattr(o, attr, False)
    OUTSIDE['treeline'] = em
    OUTSIDE['treeline_tint'] = tint


def garden_life(M, lit):
    """Round 2: a garden a family uses, with the neighbourhood beyond it. Everything stays out of the low
    sun's path (azimuth ~18 degrees from the window), so Milo keeps his sunbeam."""
    C = 'Outside'
    far_treeline()
    # long grass and weeds along the foot of the fence
    rng = random.Random(7)
    for i in range(40):
        k = 'abcde'[rng.randrange(5)]
        ph('grass_medium_02', (14.25 - rng.uniform(0, 0.25), -11.5 + i * 0.58 + rng.uniform(-0.1, 0.1), -0.07),
           rot=rng.uniform(0, 360), scale=rng.uniform(1.4, 2.2), only=[f'grass_medium_02_{k}'], skip=['_geo', 'geometry'],
           name=f'Fence_Grass_{i}', coll=C)
    # two more trees in the neighbours' gardens, one each side of the sun's path
    ph('island_tree_02', (18.5, -8.5, -0.07), rot=40, scale=2.1, only=['island_tree_02_LOD1'], name='Neighbour_Tree_S', coll=C)
    ph('island_tree_02', (17.0, 12.5, -0.07), rot=200, scale=2.4, only=['island_tree_02_LOD1'], name='Neighbour_Tree_N', coll=C)
    # a second house to the north-east, well north of the sun's path
    H.box('Neighbour2_Wall', (10.0, 0.3, 5.6), (27.0, 15.0, 2.7), M['brick'], bevel=0, collection=C)
    H.box('Neighbour2_Gable', (0.3, 9.0, 5.6), (22.0, 19.5, 2.7), M['brick'], bevel=0, collection=C)
    H.box('Neighbour2_Roof', (10.6, 9.6, 0.2), (27.0, 19.5, 5.55), H.principled('Roof Tile', '#6b4a3c', 0.75), bevel=0, collection=C)
    dark = H.principled('Neighbour Glass 2', '#1c252d', 0.05, Coat_Weight=1.0)
    for i, (y, z, on) in enumerate(((16.5, 1.5, True), (21.5, 1.5, False), (16.5, 4.0, False), (21.5, 4.0, True))):
        H.box(f'Neighbour2_Window_{i}', (0.06, 1.2, 1.3), (21.83, y, z), lit if on else dark, bevel=0.01, collection=C)
        H.box(f'Neighbour2_Frame_{i}', (0.08, 1.34, 1.44), (21.84, y, z), M['trim'], bevel=0.01, collection=C)
    H.box('Neighbour2_Interior', (0.05, 8.6, 5.4), (22.2, 19.5, 2.7), H.principled('Neighbour Interior 2', '#2a2420', 0.9), bevel=0, collection=C)
    # a street lamp beyond the fence that comes on at dusk
    ph('street_lamp_01', (15.6, 5.5, -0.07), rot=90, scale=1.0, name='Street_Lamp', coll=C)
    sl = bpy.data.lights.new('Street_Lamp_Light', 'POINT')
    sl.shadow_soft_size = 0.08
    sl.color = H.srgb('#ffb066')[:3]
    sl.energy = 0.0
    so = bpy.data.objects.new('Street_Lamp_Light', sl)
    so.location = (15.6, 5.5, 3.45)
    H.coll(C).objects.link(so)
    OUTSIDE['street'] = sl
    # the patio: a bistro table with two chairs, a clay pot, planters along the edge
    ph('outdoor_table_chair_set_01', (6.1, -2.6, -0.03), rot=200, name='Patio_Set', coll=C)
    ph('planter_pot_clay', (5.25, 2.4, -0.03), rot=10, scale=1.3, name='Patio_Pot', coll=C)
    ph('shrub_03', (5.25, 2.4, 0.2), rot=30, scale=1.6, only=['shrub_03_a_LOD1'], name='Patio_Pot_Plant', coll=C)
    for i, (y, r) in enumerate(((4.3, 90), (-5.0, 90))):
        ph('planter_box_01', (6.9, y, -0.03), rot=r, scale=1.1, name=f'Planter_{i}', coll=C)
        for j in range(4):
            ph('periwinkle_plant', (6.9 + rng.uniform(-0.12, 0.12), y - 0.36 + j * 0.24, 0.36), rot=rng.uniform(0, 360),
               scale=1.2, only=[f'periwinkle_plant_0{1 + (i + j) % 6}_LOD2'], name=f'Planter_{i}_Plant_{j}', coll=C)
    # round 3 (the reference images): lush planting right outside the glass, and a tree in the afternoon sun's
    # path that dapples the light on the floor; the low sun at Milo's moment passes under its crown
    for i, (x, y, r, sc) in enumerate(((7.6, -1.6, 20, 3.0), (7.8, 1.5, 140, 2.8), (8.2, -0.2, 260, 2.4), (7.3, 3.4, 80, 3.2), (7.4, -3.6, 300, 3.0))):
        ph('shrub_02', (x, y, -0.07), rot=r, scale=sc, only=['LOD1'], name=f'Lush_Shrub_{i}', coll=C)
    ph('island_tree_02', (12.0, 3.4, -0.07), rot=110, scale=1.6, only=['island_tree_02_LOD1'], name='Dapple_Tree', coll=C)
    ph('island_tree_02', (10.6, 6.2, -0.07), rot=20, scale=1.3, only=['island_tree_02_LOD1'], name='Garden_Tree_N', coll=C)
    # the children's ball left on the lawn
    ph('football', (9.6, 1.9, -0.07 + 0.11), rot=35, only=['football_inflated'], name='Lawn_Ball', coll=C)


def round2_details(M):
    """Round 2: more of daily life. A pan on the hob, the spoon jar, the veg basket, ceiling downlights."""
    ct = 0.91
    # an enamel pot on the front burner, lid on
    ph('pot_enamel_01', (-3.27, 3.17, ct + 0.003), rot=-15, name='Hob_Pot')
    # utensil jar with wooden spoons in the corner by the spices
    H.lathe_obj('Utensil_Jar', [(0.0, 0.0), (0.06, 0.0), (0.062, 0.01), (0.064, 0.15), (0.067, 0.16), (0.0, 0.16)], (-4.15, 3.25, ct), M['ceramic'], segs=32)
    for i, (dx, dy, lean, turn) in enumerate(((-0.015, 0.01, 8, 20), (0.02, -0.01, -10, 160), (0.0, 0.025, 4, 80))):
        ph('wooden_spoon', (-4.15 + dx, 3.25 + dy, ct + 0.2), rot=turn, tilt=(-90 + lean, 0), name=f'Jar_Spoon_{i}')
    # a basket of onions, avocados and limes by the coffee maker; a kiwi rolled out of it
    bx, by = 0.16, 3.2
    ph('wicker_basket_01', (bx, by, ct), rot=-8, name='Veg_Basket')
    for i, (a, dx, dy, dz, r) in enumerate((('yellow_onion', -0.1, 0.03, 0.012, 20), ('yellow_onion', -0.04, -0.05, 0.012, 140),
                                            ('yellow_onion', -0.07, -0.0, 0.07, 75), ('food_avocado_01', 0.06, 0.04, 0.012, 30),
                                            ('food_avocado_01', 0.1, -0.04, 0.012, 200), ('food_lime_01', 0.02, -0.07, 0.012, 0),
                                            ('food_lime_01', 0.04, 0.0, 0.07, 90))):
        tilt = (70, 0) if a == 'food_avocado_01' else (0, 0)
        ph(a, (bx + dx, by + dy, ct + dz + (0.045 if tilt[0] else 0)), rot=r, tilt=tilt, skip=['.001'], name=f'Veg_{i}')
    ph('food_kiwi_01', (bx + 0.27, by - 0.14, ct + 0.034), rot=50, tilt=(85, 0), name='Veg_Kiwi')
    # recessed downlights in the ceiling (off: the story's evening light comes from the lamps)
    trim = H.principled('Downlight Trim', '#f4f2ee', 0.4)
    lens = H.principled('Downlight Lens', '#d9d6cf', 0.15, Coat_Weight=0.5)
    for i, (x, y) in enumerate(((-3.2, -1.7), (-1.4, -1.7), (0.4, -1.7), (2.2, -1.7), (-3.2, 0.4), (0.4, 0.9), (2.2, 2.4), (-3.4, 2.6))):
        H.cyl(f'Downlight_{i}', 0.05, 0.008, (x, y, 2.796), trim, segs=32)
        H.cyl(f'Downlight_Lens_{i}', 0.036, 0.004, (x, y, 2.791), lens, segs=32)


def dress(Hm, M):
    global H
    H = Hm
    make_small_materials(M)
    entry(M)
    living(M)
    dining(M)
    kitchen(M)
    window_wall(M)
    nook(M)
    fittings(M)
    round2_details(M)
    return garden(M)

"""
The 'Statue Clay' material shared by every figure, and the helper that links the baked figures in.

STATUE_MATERIAL picks the finish. clay_white is the chosen look; the others are ready if the owner
later prefers another finish (set STATUE_MATERIAL in build_home.py or ALARO_STATUE=<preset>).

The figures carry a per-vertex 'clay_fabric' attribute (0 skin, 1 knit, 2 weave, 3 cotton, 4 hair,
5 shoe, 6 fur) so the one material can carve a knit, a twill or combed strands without any colour.
"""

import os

import bpy

PRESETS = {
    # base colour (sRGB hex), roughness range, subsurface weight / scale (m), metallic, grain bump
    'clay_white': dict(color='#e7e4de', rough=(0.76, 0.9), sss=0.35, sss_scale=0.004, metallic=0.0, grain=1.0),
    'plaster': dict(color='#ece8df', rough=(0.86, 0.96), sss=0.2, sss_scale=0.003, metallic=0.0, grain=1.3),
    'sandstone': dict(color='#c9b18c', rough=(0.86, 0.98), sss=0.05, sss_scale=0.002, metallic=0.0, grain=2.6),
    'terracotta': dict(color='#b4694a', rough=(0.72, 0.88), sss=0.1, sss_scale=0.003, metallic=0.0, grain=1.6),
    'bronze': dict(color='#6e4b2c', rough=(0.32, 0.55), sss=0.0, sss_scale=0.001, metallic=1.0, grain=0.8),
    'marble': dict(color='#eeeae3', rough=(0.22, 0.38), sss=0.6, sss_scale=0.012, metallic=0.0, grain=0.4),
}
STATUE_MATERIAL = os.environ.get('ALARO_STATUE', 'clay_white')


def _srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c) + (1.0,)


def statue_material(preset=None, name='Statue Clay'):
    """One material for every figure. Rebuilt in place if it already exists (so a preset swap is one call)."""
    p = PRESETS[preset or STATUE_MATERIAL]
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    N, L = nt.nodes, nt.links

    def n(kind, x, y, **kw):
        node = N.new(kind)
        node.location = (x, y)
        for k, v in kw.items():
            key = k.replace('_', ' ')
            if key in node.inputs:
                node.inputs[key].default_value = v
            else:
                setattr(node, k, v)
        return node

    def math(op, a, b=None, x=0, y=0, clamp=False):
        node = n('ShaderNodeMath', x, y, operation=op)
        node.use_clamp = clamp
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                node.inputs[i].default_value = v
            else:
                L.new(v, node.inputs[i])
        return node.outputs[0]

    out = n('ShaderNodeOutputMaterial', 1400, 0)
    bsdf = n('ShaderNodeBsdfPrincipled', 1100, 0, Metallic=p['metallic'], Subsurface_Weight=p['sss'],
             Subsurface_Scale=p['sss_scale'], Specular_IOR_Level=0.35)
    bsdf.inputs['Subsurface Radius'].default_value = (1.0, 0.85, 0.7)
    L.new(bsdf.outputs[0], out.inputs['Surface'])
    tc = n('ShaderNodeTexCoord', -1600, 0)
    uv = n('ShaderNodeUVMap', -1600, -300)
    fab = n('ShaderNodeAttribute', -1600, 300, attribute_name='clay_fabric')
    fv = fab.outputs['Fac']

    def is_fab(code, x, y):
        # 1 where clay_fabric == code
        d = math('SUBTRACT', fv, float(code), x, y)
        a = math('ABSOLUTE', d, None, x + 150, y)
        return math('LESS_THAN', a, 0.5, x + 300, y)

    sep = n('ShaderNodeSeparateXYZ', -1400, -300)
    L.new(uv.outputs['UV'], sep.inputs[0])
    U, Vv = sep.outputs['X'], sep.outputs['Y']

    # knit: chevron stitches in the garment's UV space
    K = 340.0
    uk = math('MULTIPLY', U, K, -1200, -200)
    vk = math('MULTIPLY', Vv, K * 1.3, -1200, -260)
    col = math('FRACT', uk, None, -1050, -200)
    col_c = math('ABSOLUTE', math('SUBTRACT', col, 0.5, -950, -200), None, -850, -200)
    chev = math('ADD', vk, math('MULTIPLY', col_c, 1.2, -750, -260), -650, -260)
    ring = math('SINE', math('MULTIPLY', chev, 6.2832, -550, -260), None, -450, -260)
    groove = math('POWER', math('MULTIPLY', col_c, 2.0, -750, -150), 3.0, -650, -150)
    knit = math('SUBTRACT', math('MULTIPLY', ring, 0.35, -350, -260), groove, -250, -220)

    # weave: fine twill for trousers
    tw = math('SINE', math('MULTIPLY', math('ADD', U, Vv, -1200, -420), 900.0, -1100, -420), None, -1000, -420)
    weave = math('MULTIPLY', tw, 0.25, -900, -420)

    # hair: combed strands along the card's V, broken up by noise
    hs = n('ShaderNodeMapping', -1200, -600)
    hs.inputs['Scale'].default_value = (260.0, 14.0, 1.0)
    L.new(uv.outputs['UV'], hs.inputs['Vector'])
    hn = n('ShaderNodeTexNoise', -1000, -600, Scale=1.0, Detail=4.0, Roughness=0.6)
    L.new(hs.outputs['Vector'], hn.inputs['Vector'])
    hair = math('MULTIPLY', math('SUBTRACT', hn.outputs['Fac'], 0.5, -800, -600), 1.6, -700, -600)

    # fine grain everywhere (plaster tooth / skin)
    gn = n('ShaderNodeTexNoise', -1200, -800, Scale=900.0, Detail=3.0, Roughness=0.55)
    L.new(tc.outputs['Object'], gn.inputs['Vector'])
    grain = math('MULTIPLY', math('SUBTRACT', gn.outputs['Fac'], 0.5, -1000, -800), 0.25 * p['grain'], -900, -800)

    # fur (Milo): fine strokes along the cat's length, in his object space
    fm = n('ShaderNodeMapping', -1200, -1000)
    fm.inputs['Scale'].default_value = (60.0, 700.0, 700.0)
    L.new(tc.outputs['Object'], fm.inputs['Vector'])
    fnz = n('ShaderNodeTexNoise', -1000, -1000, Scale=1.0, Detail=3.0, Roughness=0.6)
    L.new(fm.outputs['Vector'], fnz.inputs['Vector'])
    fur = math('MULTIPLY', math('SUBTRACT', fnz.outputs['Fac'], 0.5, -800, -1000), 0.9, -700, -1000)

    def masked(h, code, y):
        return math('MULTIPLY', h, is_fab(code, -650, y), -150, y)
    height = math('ADD', masked(knit, 1, -100), masked(weave, 2, -300), 0, -200)
    height = math('ADD', height, masked(hair, 4, -500), 100, -300)
    height = math('ADD', height, masked(fur, 6, -700), 150, -350)
    height = math('ADD', height, grain, 200, -400)
    bump = n('ShaderNodeBump', 900, -400, Strength=0.35, Distance=0.0006)
    L.new(height, bump.inputs['Height'])
    L.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

    # roughness: large, low-contrast variation
    rn = n('ShaderNodeTexNoise', -400, 300, Scale=6.0, Detail=2.0)
    L.new(tc.outputs['Object'], rn.inputs['Vector'])
    rr = n('ShaderNodeMapRange', 0, 300, From_Min=0.3, From_Max=0.7, To_Min=p['rough'][0], To_Max=p['rough'][1])
    L.new(rn.outputs['Fac'], rr.inputs['Value'])
    L.new(rr.outputs['Result'], bsdf.inputs['Roughness'])

    # cavity: creases a touch darker, worn high points a touch brighter
    ao = n('ShaderNodeAmbientOcclusion', 200, 500, samples=8, only_local=True, Distance=0.04)
    geo = n('ShaderNodeNewGeometry', 200, 700)
    edge = n('ShaderNodeMapRange', 400, 700, From_Min=0.5, From_Max=0.58, To_Min=0.0, To_Max=0.05)
    L.new(geo.outputs['Pointiness'], edge.inputs['Value'])
    cav = n('ShaderNodeMapRange', 400, 500, From_Min=0.0, From_Max=1.0, To_Min=0.72, To_Max=1.0)
    L.new(ao.outputs['AO'], cav.inputs['Value'])
    shade = math('ADD', cav.outputs['Result'], edge.outputs['Result'], 600, 600)
    base = n('ShaderNodeMix', 800, 300, data_type='RGBA', blend_type='MULTIPLY')
    base.inputs['Factor'].default_value = 1.0
    for s in base.inputs:
        if s.identifier == 'A_Color':
            s.default_value = _srgb(p['color'])
    cmb = n('ShaderNodeCombineXYZ', 650, 450)
    for i in range(3):
        L.new(shade, cmb.inputs[i])
    for s in base.inputs:
        if s.identifier == 'B_Color':
            L.new(cmb.outputs[0], s)
    res = next(s for s in base.outputs if s.identifier == 'Result_Color')
    L.new(res, bsdf.inputs['Base Color'])
    m.diffuse_color = _srgb(p['color'])
    return m


def link_people(moments, folder, collection_name='People', material=None):
    """Append the baked statue figures for the given moments; returns {moment: [objects]}."""
    material = material or statue_material()
    target = bpy.data.collections.get(collection_name)
    if target is None:
        target = bpy.data.collections.new(collection_name)
        bpy.context.scene.collection.children.link(target)
    found = {}
    for mo in moments:
        path = os.path.join(folder, f'{mo}.blend')
        if not os.path.exists(path):
            print(f'statue figures missing for {mo}: {path}', flush=True)
            found[mo] = []
            continue
        with bpy.data.libraries.load(path, link=False) as (src, dst):
            dst.objects = [n for n in src.objects if n.startswith('Statue_')]
        objs = []
        for o in dst.objects:
            if o is None:
                continue
            target.objects.link(o)
            o.data.materials.clear()
            o.data.materials.append(material)
            objs.append(o)
        found[mo] = objs
    return found

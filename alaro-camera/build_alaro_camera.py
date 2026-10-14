"""
Alaro smart home camera, rebuilt in Blender.

Geometry is a one-to-one port of the website's procedural model
(`lib/three/alaroCamera.ts`, units in cm), so this model matches every render on
the site. The shell uses a soft-touch matte finish modelled on the grip of
wowfactories.com's Combine Driver: velvety, diffuse, a fine micro-grain, and a
soft sheen that rolls off the edges. The lens bezel is satin bead-blasted metal.

Two ways to run it:

  * Inside Blender: open the Scripting tab, open this file, press Run Script.
    The scene is rebuilt with the camera in Graphite.
  * Headless (no Blender UI needed):
        pip install bpy
        python3 build_alaro_camera.py            # .blend + GLBs + preview renders
        python3 build_alaro_camera.py --no-render

Scene units are metres (the camera is 13.85 cm tall); the outliner hierarchy is
Alaro > Alaro_Pan (rotate Z to pan) > Alaro_Tilt (rotate X to tilt; negative
looks up).
"""

import math
import os
import sys

import bpy  # must come first: the pip bpy module provides bmesh/mathutils
import bmesh
from mathutils import Matrix, Vector

C = 0.01  # cm -> m

FINISHES = {
    # name: (body hex, logo hex)
    'graphite': ('#3a3b3e', '#f2f2f2'),
    'white': ('#eeedea', '#2b2b2d'),
    'red': ('#b8232b', '#f7f2f0'),
}

# Dimensions from alaroCamera.ts (cm)
BASE_R = 3.7
BASE_H = 4.4
HEAD_R = 4.1
HEAD_L = 4.6
HINGE_Y = 1.25 + HEAD_R
FRONT_Z = HEAD_L / 2 + 0.03
DOME_R = 24.0
APEX = FRONT_Z + 0.36
LENS_Y = 0.12

LOGO_FONT_CANDIDATES = [
    '/usr/share/fonts/opentype/inter/InterDisplay-Bold.otf',
    '/usr/share/fonts/opentype/inter/Inter-Bold.otf',
    '/Library/Fonts/Arial Bold.ttf',
    'C:/Windows/Fonts/arialbd.ttf',
]


# ---------------------------------------------------------------- helpers

def srgb(hex_str, alpha=1.0):
    h = hex_str.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, alpha)


def t2b(x, y, z):
    """three.js (Y up, +Z front) in cm -> Blender (Z up, -Y front) in m."""
    return Vector((x * C, -z * C, y * C))


def rounded_profile(R, y0, y1, r0, r1, seg=10):
    pts = [(0.0, y0)]
    for i in range(seg + 1):
        a = -math.pi / 2 + (i / seg) * (math.pi / 2)
        pts.append((R - r0 + math.cos(a) * r0, y0 + r0 + math.sin(a) * r0))
    for i in range(seg + 1):
        a = (i / seg) * (math.pi / 2)
        pts.append((R - r1 + math.cos(a) * r1, y1 - r1 + math.sin(a) * r1))
    pts.append((0.0, y1))
    return pts


def link(obj, parent=None, coll=None):
    (coll or bpy.context.scene.collection).objects.link(obj)
    if parent is not None:
        obj.parent = parent
    return obj


def finish_mesh(me, sharp_deg=40.0, flip_to=None):
    """Smooth shading with sharp edges past `sharp_deg`."""
    for p in me.polygons:
        p.use_smooth = True
    if hasattr(me, 'set_sharp_from_angle'):
        me.set_sharp_from_angle(angle=math.radians(sharp_deg))
    me.update()
    return me


def lathe(name, profile, segs, mapper, closed=True, outward=None):
    """Revolve a (radius, height) profile. `mapper(r, a, h)` gives Blender coordinates."""
    bm = bmesh.new()
    rings = []
    for r, h in profile:
        if r < 1e-9:
            rings.append([bm.verts.new(mapper(0.0, 0.0, h))])
        else:
            rings.append([bm.verts.new(mapper(r, 2 * math.pi * i / segs, h)) for i in range(segs)])
    for A, B in zip(rings, rings[1:]):
        if len(A) == 1 and len(B) == 1:
            continue
        for i in range(segs):
            j = (i + 1) % segs
            if len(A) == 1:
                bm.faces.new((A[0], B[i], B[j]))
            elif len(B) == 1:
                bm.faces.new((A[i], A[j], B[0]))
            else:
                bm.faces.new((A[i], A[j], B[j], B[i]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    if closed:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    elif outward is not None:
        bm.normal_update()
        f = max(bm.faces, key=lambda f: f.calc_area())
        if f.normal.dot(Vector(outward)) < 0:
            for f in bm.faces:
                f.normal_flip()
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return finish_mesh(me)


def base_map(r, a, h):
    # base lathes revolve around the vertical axis
    return Vector((r * math.sin(a) * C, -r * math.cos(a) * C, h * C))


def head_map(z_off=0.0, y_off=0.0):
    # head lathes revolve around the front-back axis (three.js Z)
    def m(r, a, h):
        return t2b(r * math.cos(a), r * math.sin(a) + y_off, h + z_off)
    return m


def mesh_obj(name, me, mats, parent, coll):
    o = bpy.data.objects.new(name, me)
    for m in mats:
        o.data.materials.append(m)
    return link(o, parent, coll)


def torus_mesh(name, major, minor, segs=128, tube=16):
    prof = [(major + minor * math.cos(2 * math.pi * i / tube), minor * math.sin(2 * math.pi * i / tube)) for i in range(tube)]
    bm = bmesh.new()
    rings = [[bm.verts.new((0, 0, 0)) for _ in range(segs)] for _ in prof]
    for k, (r, h) in enumerate(prof):
        for i in range(segs):
            a = 2 * math.pi * i / segs
            rings[k][i].co = Vector((r * math.cos(a), r * math.sin(a), h)) * C
    for k in range(tube):
        A, B = rings[k], rings[(k + 1) % tube]
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((A[i], A[j], B[j], B[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return finish_mesh(me, 60)


def disc_mesh(name, r_out, r_in=0.0, segs=64):
    """Flat disc or ring in the XY plane facing +Z (cm sizes)."""
    bm = bmesh.new()
    outer = [bm.verts.new((r_out * math.cos(2 * math.pi * i / segs) * C, r_out * math.sin(2 * math.pi * i / segs) * C, 0)) for i in range(segs)]
    if r_in <= 0:
        bm.faces.new(outer)
    else:
        inner = [bm.verts.new((r_in * math.cos(2 * math.pi * i / segs) * C, r_in * math.sin(2 * math.pi * i / segs) * C, 0)) for i in range(segs)]
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((outer[i], outer[j], inner[j], inner[i]))
    bm.normal_update()
    for f in bm.faces:
        if f.normal.z < 0:
            f.normal_flip()
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = False
    return me


def apply_modifiers(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    old = obj.data
    obj.modifiers.clear()
    obj.data = me
    me.name = old.name
    bpy.data.meshes.remove(old)
    finish_mesh(me)


def boolean_cut(target, cutter):
    mod = target.modifiers.new('cut', 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.solver = 'EXACT'
    if hasattr(mod, 'material_mode'):
        mod.material_mode = 'TRANSFER'
    mod.object = cutter
    cutter.hide_render = True
    cutter.hide_viewport = True
    apply_modifiers(target)
    bpy.data.objects.remove(cutter)


# ---------------------------------------------------------------- materials

def _principled(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    out.location = (400, 0)
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return m, nt, bsdf


def _set(bsdf, **kw):
    for k, v in kw.items():
        key = k.replace('_', ' ')
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = v


def _micro_grain(nt, bsdf, rough_lo, rough_hi, grain_scale, bump_strength):
    """Fine stipple of a soft-touch (or bead-blasted) surface: roughness variation and a tiny bump."""
    tc = nt.nodes.new('ShaderNodeTexCoord')
    tc.location = (-900, 0)
    fine = nt.nodes.new('ShaderNodeTexNoise')
    fine.location = (-650, -200)
    fine.inputs['Scale'].default_value = grain_scale
    fine.inputs['Detail'].default_value = 2.0
    fine.inputs['Roughness'].default_value = 0.6
    broad = nt.nodes.new('ShaderNodeTexNoise')
    broad.location = (-650, 150)
    broad.inputs['Scale'].default_value = grain_scale / 40
    broad.inputs['Detail'].default_value = 3.0
    nt.links.new(tc.outputs['Object'], fine.inputs['Vector'])
    nt.links.new(tc.outputs['Object'], broad.inputs['Vector'])
    rng = nt.nodes.new('ShaderNodeMapRange')
    rng.location = (-400, 150)
    rng.inputs['From Min'].default_value = 0.3
    rng.inputs['From Max'].default_value = 0.7
    rng.inputs['To Min'].default_value = rough_lo
    rng.inputs['To Max'].default_value = rough_hi
    nt.links.new(broad.outputs['Fac'], rng.inputs['Value'])
    nt.links.new(rng.outputs['Result'], bsdf.inputs['Roughness'])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.location = (-400, -200)
    bump.inputs['Strength'].default_value = bump_strength
    bump.inputs['Distance'].default_value = 0.00002
    nt.links.new(fine.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])


def soft_touch(name, hex_str):
    """Soft-touch matte elastomer, after the wowfactories grip."""
    m, nt, bsdf = _principled(name)
    _set(bsdf, Base_Color=srgb(hex_str), Metallic=0.0, Specular_IOR_Level=0.32, IOR=1.45,
         Sheen_Weight=0.2, Sheen_Roughness=0.4, Sheen_Tint=(1, 1, 1, 1), Coat_Weight=0.0)
    _micro_grain(nt, bsdf, 0.58, 0.68, grain_scale=5200, bump_strength=0.12)
    m.diffuse_color = srgb(hex_str)
    m.roughness = 0.62
    return m


def satin_metal(name, hex_str):
    """Bead-blasted satin metal, after the wowfactories steel collars."""
    m, nt, bsdf = _principled(name)
    _set(bsdf, Base_Color=srgb(hex_str), Metallic=1.0, Specular_IOR_Level=0.5)
    _micro_grain(nt, bsdf, 0.30, 0.38, grain_scale=9000, bump_strength=0.06)
    m.diffuse_color = srgb(hex_str)
    return m


def simple(name, hex_str, rough, metal=0.0, **kw):
    m, nt, bsdf = _principled(name)
    _set(bsdf, Base_Color=srgb(hex_str), Roughness=rough, Metallic=metal, **kw)
    m.diffuse_color = srgb(hex_str)
    return m


def make_materials():
    M = {}
    for f, (body, logo) in FINISHES.items():
        M[f'body_{f}'] = soft_touch(f'Alaro Soft-Touch {f.title()}', body)
        M[f'logo_{f}'] = simple(f'Alaro Logo {f.title()}', logo, 0.45, Specular_IOR_Level=0.4)
        M[f'body_{f}'].use_fake_user = True
        M[f'logo_{f}'].use_fake_user = True
    M['glass'] = simple('Alaro Black Glass', '#020203', 0.035, Coat_Weight=1.0, Coat_Roughness=0.03, IOR=1.52)
    M['glass_inner'] = simple('Alaro Glass Inner', '#060608', 0.07, 0.1, Coat_Weight=1.0, Coat_Roughness=0.05)
    M['rim'] = simple('Alaro Glass Rim', '#0e0e10', 0.25, 0.6)
    M['bezel'] = satin_metal('Alaro Satin Bezel', '#2a2b2e')
    M['lens'] = simple('Alaro Lens Glass', '#6a7aa6', 0.02, 0.0, Transmission_Weight=1.0, IOR=1.6,
                       Thin_Film_Thickness=320.0, Thin_Film_IOR=1.6, Coat_Weight=1.0, Coat_Roughness=0.0)
    M['pupil'] = simple('Alaro Lens Pupil', '#1b2a3a', 0.1, 0.5, Coat_Weight=1.0)
    M['aperture'] = simple('Alaro Lens Aperture', '#050608', 0.35, 0.6)
    M['coat'] = simple('Alaro Lens Coating', '#2a3550', 0.15, 0.9, Thin_Film_Thickness=450.0, Thin_Film_IOR=1.8)
    M['dot'] = simple('Alaro Sensor Dot', '#1c1c1e', 0.3)
    M['hole'] = simple('Alaro Hole', '#060606', 0.9)
    M['port'] = simple('Alaro USB-C', '#111112', 0.5, 0.4)
    M['port_tongue'] = simple('Alaro USB-C Tongue', '#1d1d20', 0.45, 0.2)
    return M


# ---------------------------------------------------------------- model

def build_camera(finish='graphite'):
    M = make_materials()
    body, logo_mat = M[f'body_{finish}'], M[f'logo_{finish}']

    coll = bpy.data.collections.new('Alaro Camera')
    bpy.context.scene.collection.children.link(coll)

    root = link(bpy.data.objects.new('Alaro', None), None, coll)
    root.empty_display_type = 'PLAIN_AXES'
    root.empty_display_size = 0.04
    root['finish'] = finish

    # ---- base: lower body, seam, rotating cap
    lower = mesh_obj('Base', lathe('Base', rounded_profile(BASE_R, 0, BASE_H - 0.95, 0.35, 0.06), 160, base_map), [body], root, coll)
    mesh_obj('Base_Cap', lathe('Base_Cap', rounded_profile(BASE_R - 0.02, BASE_H - 0.9, BASE_H, 0.06, 0.32), 160, base_map), [body], root, coll)
    seam_prof = [(BASE_R - 0.05, BASE_H - 0.96), (BASE_R - 0.05, BASE_H - 0.89)]
    mesh_obj('Base_Seam', lathe('Base_Seam', seam_prof, 160, base_map, closed=False, outward=(0, -1, 0)), [M['hole']], root, coll)

    # USB-C port: a real recess at the back with a tongue inside
    bm = bmesh.new()
    w, h, r = 0.95, 0.32, 0.16
    outline = []
    for cx, a0 in ((w / 2 - r, -90), (-(w / 2 - r), 90)):
        for i in range(13):
            a = math.radians(a0 + i * 15)
            outline.append((cx + r * math.cos(a), r * math.sin(a)))
    depth = 0.35
    back = [bm.verts.new(Vector((-(x + 0.3) * C, (BASE_R - depth) * C, (0.75 + y) * C))) for x, y in outline]
    front = [bm.verts.new(Vector((-(x + 0.3) * C, (BASE_R + 0.4) * C, (0.75 + y) * C))) for x, y in outline]
    bm.faces.new(back)
    bm.faces.new(front)
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((back[i], back[j], front[j], front[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    cme = bpy.data.meshes.new('usb_cutter')
    bm.to_mesh(cme)
    bm.free()
    cutter = mesh_obj('usb_cutter', cme, [M['port']], None, coll)
    boolean_cut(lower, cutter)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(0.62 * C, 0.28 * C, 0.07 * C), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(-0.3 * C, (BASE_R - 0.2) * C, 0.75 * C), verts=bm.verts)
    tme = bpy.data.meshes.new('USB_C_Tongue')
    bm.to_mesh(tme)
    bm.free()
    mesh_obj('USB_C_Tongue', tme, [M['port_tongue']], root, coll)

    # printed logo, wrapped onto the base
    add_logo(logo_mat, root, coll)

    # ---- pan group
    pan = link(bpy.data.objects.new('Alaro_Pan', None), root, coll)
    pan.empty_display_type = 'ARROWS'
    pan.empty_display_size = 0.03
    pan.location = (0, 0, BASE_H * C)

    # rear arm: outline grown by the three.js bevel, then bevelled back in
    bv = 0.08
    pts = [(-0.55 - bv, -0.2 - bv), (0.55 + bv, -0.2 - bv)]
    top = HINGE_Y - 0.2
    for i in range(17):
        a = math.pi * i / 16
        pts.append(((0.55 + bv) * math.cos(a), top + (0.55 + bv) * math.sin(a)))
    z0, z1 = -HEAD_L / 2 - 0.62 - bv, -HEAD_L / 2 - 0.62 + 0.5 + bv
    bm = bmesh.new()
    fv = [bm.verts.new(t2b(x, y, z1)) for x, y in pts]
    bv_ = [bm.verts.new(t2b(x, y, z0)) for x, y in pts]
    bm.faces.new(fv)
    bm.faces.new(bv_)
    for i in range(len(pts)):
        j = (i + 1) % len(pts)
        bm.faces.new((fv[i], fv[j], bv_[j], bv_[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ame = bpy.data.meshes.new('Arm')
    bm.to_mesh(ame)
    bm.free()
    arm = mesh_obj('Arm', ame, [body], pan, coll)
    _bevel(arm, bv * C)
    finish_mesh(arm.data, 30)

    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(1.0 * C, 1.2 * C, 1.4 * C), verts=bm.verts)
    bmesh.ops.translate(bm, vec=t2b(0, 0.5, -HEAD_L / 2 - 0.1), verts=bm.verts)
    sme = bpy.data.meshes.new('Stem')
    bm.to_mesh(sme)
    bm.free()
    stem = mesh_obj('Stem', sme, [body], pan, coll)
    _bevel(stem, 0.06 * C)
    finish_mesh(stem.data, 30)

    # ---- tilt group (the head)
    tilt = link(bpy.data.objects.new('Alaro_Tilt', None), pan, coll)
    tilt.empty_display_type = 'ARROWS'
    tilt.empty_display_size = 0.03
    tilt.location = (0, 0, HINGE_Y * C)

    shell = mesh_obj('Head_Shell', lathe('Head_Shell', rounded_profile(HEAD_R, -HEAD_L / 2, HEAD_L / 2 - 0.02, 0.3, 0.05), 192, head_map()), [body], tilt, coll)

    # speaker grille: 4 x 6 real holes on the head's left side
    bm = bmesh.new()
    for col in range(4):
        for row in range(6):
            ang = math.pi + 0.2 - row * 0.085
            z = HEAD_L / 2 - 0.55 - col * 0.32
            beta = math.atan2(math.cos(ang), math.sin(ang))
            mat = Matrix.Translation(t2b(math.cos(ang) * HEAD_R, math.sin(ang) * HEAD_R, z)) @ Matrix.Rotation(beta, 4, 'Y')
            bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.07 * C, radius2=0.07 * C, depth=0.5 * C, matrix=mat)
    hme = bpy.data.meshes.new('grille_cutter')
    bm.to_mesh(hme)
    bm.free()
    boolean_cut(shell, mesh_obj('grille_cutter', hme, [M['hole']], tilt, coll))

    kn = bmesh.new()
    bmesh.ops.create_cone(kn, cap_ends=True, segments=48, radius1=0.42 * C, radius2=0.42 * C, depth=1.3 * C,
                          matrix=Matrix.Translation(t2b(0, 0, -HEAD_L / 2 - 0.45)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
    kme = bpy.data.meshes.new('Hinge_Knuckle')
    kn.to_mesh(kme)
    kn.free()
    finish_mesh(kme)
    mesh_obj('Hinge_Knuckle', kme, [body], tilt, coll)

    back_ring = mesh_obj('Head_Back_Groove', torus_mesh('Head_Back_Groove', HEAD_R * 0.62, 0.025, 160, 8), [M['hole']], tilt, coll)
    back_ring.rotation_euler = (math.pi / 2, 0, 0)
    back_ring.location = t2b(0, 0, -HEAD_L / 2 - 0.005)

    # front: domed black glass, its inner window, and the rim
    dome_z = lambda r: APEX - (DOME_R - math.sqrt(DOME_R ** 2 - r ** 2))

    def dome_profile(radius, lift=0.0, n=40):
        return [(radius * i / n, dome_z(radius * i / n) + lift) for i in range(n + 1)]

    def front_map(r, a, h):
        return t2b(r * math.cos(a), r * math.sin(a), h)

    rim = mesh_obj('Glass_Rim', torus_mesh('Glass_Rim', HEAD_R - 0.08, 0.12, 192, 24), [M['rim']], tilt, coll)
    rim.rotation_euler = (math.pi / 2, 0, 0)
    rim.location = t2b(0, 0, dome_z(HEAD_R - 0.1) - 0.02)
    mesh_obj('Glass_Dome', lathe('Glass_Dome', dome_profile(HEAD_R - 0.1), 192, front_map, closed=False, outward=(0, -1, 0)), [M['glass']], tilt, coll)
    mesh_obj('Glass_Inner_Window', lathe('Glass_Inner_Window', dome_profile(HEAD_R * 0.52, 0.012), 160, front_map, closed=False, outward=(0, -1, 0)), [M['glass_inner']], tilt, coll)

    # lens: satin bezel barrel, bezel ring, glass element over aperture and coated rim
    def lens_map(r, a, h):
        return t2b(r * math.cos(a), r * math.sin(a) + LENS_Y, h)

    barrel_prof = [(0.0, APEX - 0.04), (1.02, APEX - 0.04), (0.95, APEX + 0.24), (0.0, APEX + 0.24)]
    mesh_obj('Lens_Barrel', lathe('Lens_Barrel', barrel_prof, 96, lens_map), [M['bezel']], tilt, coll)
    ring2 = mesh_obj('Lens_Bezel_Ring', torus_mesh('Lens_Bezel_Ring', 0.8, 0.07, 96, 16), [M['bezel']], tilt, coll)
    ring2.rotation_euler = (math.pi / 2, 0, 0)
    ring2.location = t2b(0, LENS_Y, APEX + 0.25)

    face_z = APEX + 0.242
    for nm, me_, mat_, dz in (
        ('Lens_Aperture', disc_mesh('Lens_Aperture', 0.6, 0.3, 64), M['aperture'], 0.002),
        ('Lens_Pupil', disc_mesh('Lens_Pupil', 0.3, 0, 48), M['pupil'], 0.004),
    ):
        o = mesh_obj(nm, me_, [mat_], tilt, coll)
        o.rotation_euler = (math.pi / 2, 0, 0)
        o.location = t2b(0, LENS_Y, face_z + dz)
    coat = mesh_obj('Lens_Coating', torus_mesh('Lens_Coating', 0.54, 0.018, 64, 8), [M['coat']], tilt, coll)
    coat.rotation_euler = (math.pi / 2, 0, 0)
    coat.location = t2b(0, LENS_Y, face_z + 0.006)

    # plano-convex lens element (closed, so it refracts properly)
    lr, cap = 0.82, math.pi * 0.28
    base_h = lr * math.cos(cap)
    lens_prof = [(lr * math.sin(cap * (1 - i / 24)), lr * math.cos(cap * (1 - i / 24))) for i in range(25)]
    lens_prof = [(0.0, base_h)] + lens_prof
    c0 = face_z - base_h + 0.012
    mesh_obj('Lens_Glass', lathe('Lens_Glass', [(r, h + c0) for r, h in lens_prof], 96, lens_map), [M['lens']], tilt, coll)

    # sensor dots above and below the lens
    for nm, y, rr in (('Sensor_Top', HEAD_R * 0.78, 0.07), ('Sensor_Bottom', -HEAD_R * 0.48, 0.05)):
        o = mesh_obj(nm, disc_mesh(nm, rr, 0, 24), [M['dot']], tilt, coll)
        o.rotation_euler = (math.pi / 2, 0, 0)
        o.location = t2b(0, y, dome_z(abs(y)) + 0.015)

    return root, M


def _bevel(obj, width):
    mod = obj.modifiers.new('Bevel', 'BEVEL')
    mod.width = width
    mod.segments = 4
    mod.limit_method = 'ANGLE'
    mod.harden_normals = False


def add_logo(mat, root, coll):
    font = None
    for p in LOGO_FONT_CANDIDATES:
        if os.path.exists(p):
            font = bpy.data.fonts.load(p)
            break
    cu = bpy.data.curves.new('logo_text', 'FONT')
    cu.body = 'alaro.'
    if font:
        cu.font = font
    cu.size = 1.0
    cu.align_x = 'CENTER'
    cu.align_y = 'CENTER'
    cu.fill_mode = 'FRONT' if hasattr(cu, 'fill_mode') else cu.fill_mode
    tmp = bpy.data.objects.new('logo_tmp', cu)
    coll.objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp)
    bpy.data.curves.remove(cu)

    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    target_w = 1.15  # cm, as on the site's renders
    s = target_w / (max(xs) - min(xs))
    cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
    R = BASE_R + 0.006
    theta0 = 0.32  # logo centre, radians right of the front (from lib/three)
    for v in me.vertices:
        u, w = (v.co.x - cx) * s, (v.co.y - cy) * s
        th = theta0 + u / R
        v.co = Vector((R * math.sin(th) * C, -R * math.cos(th) * C, (1.5 + w) * C))
    me.update()
    me.name = 'Logo'
    for p in me.polygons:
        p.use_smooth = True
    o = mesh_obj('Logo', me, [mat], root, coll)
    return o


def set_finish(finish):
    """Swap the shell and logo materials to 'graphite', 'white' or 'red'."""
    body = bpy.data.materials[f'Alaro Soft-Touch {finish.title()}']
    logo = bpy.data.materials[f'Alaro Logo {finish.title()}']
    for o in bpy.data.objects:
        if o.type != 'MESH':
            continue
        for slot in o.material_slots:
            if slot.material and slot.material.name.startswith('Alaro Soft-Touch'):
                slot.material = body
            elif slot.material and slot.material.name.startswith('Alaro Logo'):
                slot.material = logo
    root = bpy.data.objects.get('Alaro')
    if root:
        root['finish'] = finish


# ---------------------------------------------------------------- studio

def build_studio(bg_hex='#f1f2f2'):
    scn = bpy.context.scene
    coll = bpy.data.collections.new('Studio')
    scn.collection.children.link(coll)

    # seamless sweep, so the floor fades into the backdrop
    bm = bmesh.new()
    prof = [(-1.2, 0.0)]
    for i in range(13):
        a = math.radians(i * 7.5)
        prof.append((0.6 + 0.35 * math.sin(a), 0.35 - 0.35 * math.cos(a)))
    prof.append((0.95, 1.5))
    rows = []
    for yy, zz in prof:
        rows.append([bm.verts.new((x, yy, zz)) for x in (-2.0, 2.0)])
    for A, B in zip(rows, rows[1:]):
        bm.faces.new((A[0], A[1], B[1], B[0]))
    me = bpy.data.meshes.new('Backdrop')
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    bd = bpy.data.objects.new('Backdrop', me)
    coll.objects.link(bd)
    bmat = simple('Studio Backdrop', bg_hex, 0.9, Specular_IOR_Level=0.1)
    # camera rays see the sweep lifted to the page colour; bounce light stays unchanged
    nt = bmat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (1, 1, 1, 1)
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = srgb(bg_hex)
    em.inputs['Strength'].default_value = 2.0
    add = nt.nodes.new('ShaderNodeAddShader')
    lp = nt.nodes.new('ShaderNodeLightPath')
    mix = nt.nodes.new('ShaderNodeMixShader')
    out = nt.nodes['Material Output']
    nt.links.new(bsdf.outputs['BSDF'], add.inputs[0])
    nt.links.new(em.outputs['Emission'], add.inputs[1])
    nt.links.new(lp.outputs['Is Camera Ray'], mix.inputs['Fac'])
    nt.links.new(bsdf.outputs['BSDF'], mix.inputs[1])
    nt.links.new(add.outputs['Shader'], mix.inputs[2])
    nt.links.new(mix.outputs['Shader'], out.inputs['Surface'])
    bd.data.materials.append(bmat)
    bd.visible_glossy = False

    def area(name, size, loc, energy, look=(0, 0, 0.06), shape='RECTANGLE', size_y=None):
        L = bpy.data.lights.new(name, 'AREA')
        L.energy = energy
        L.shape = shape
        L.size = size
        if size_y:
            L.size_y = size_y
        o = bpy.data.objects.new(name, L)
        o.location = loc
        d = Vector(look) - Vector(loc)
        o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        coll.objects.link(o)
        return o

    # big soft key front-left, strip fill right, top bounce, rim from behind
    area('Key', 0.55, (-0.42, -0.45, 0.42), 26, size_y=0.38)
    area('Fill_Strip', 0.12, (0.5, -0.18, 0.18), 6, size_y=0.6)
    area('Top', 0.6, (0.05, 0.05, 0.75), 12, size_y=0.25)
    area('Rim', 0.3, (0.25, 0.55, 0.35), 12, size_y=0.3)
    area('Glass_Kicker', 0.2, (0.18, -0.6, 0.32), 3, size_y=0.08)

    world = bpy.data.worlds.get('Studio') or bpy.data.worlds.new('Studio')
    world.use_nodes = True
    wn = world.node_tree.nodes
    bgn = wn.get('Background')
    bgn.inputs['Color'].default_value = srgb('#d8dadb')
    bgn.inputs['Strength'].default_value = 0.25
    # glossy rays see a dark studio (black flags), so the black glass reads black, not chrome
    dark = wn.new('ShaderNodeBackground')
    dark.inputs['Color'].default_value = srgb('#1a1b1c')
    dark.inputs['Strength'].default_value = 0.25
    lp = wn.new('ShaderNodeLightPath')
    mix = wn.new('ShaderNodeMixShader')
    out = wn.get('World Output')
    world.node_tree.links.new(lp.outputs['Is Glossy Ray'], mix.inputs['Fac'])
    world.node_tree.links.new(bgn.outputs['Background'], mix.inputs[1])
    world.node_tree.links.new(dark.outputs['Background'], mix.inputs[2])
    world.node_tree.links.new(mix.outputs['Shader'], out.inputs['Surface'])
    scn.world = world

    cam_data = bpy.data.cameras.new('Camera')
    cam_data.lens = 85
    cam_data.dof.use_dof = False
    cam = bpy.data.objects.new('Camera', cam_data)
    coll.objects.link(cam)
    scn.camera = cam
    return cam


def aim(cam, loc, target=(0, 0, 0.068), lens=85, shift_y=0.0):
    cam.location = loc
    d = Vector(target) - Vector(loc)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = lens
    cam.data.shift_y = shift_y


def setup_render(res=1400, samples=160):
    scn = bpy.context.scene
    try:
        bpy.ops.preferences.addon_enable(module='cycles')
    except Exception:
        pass
    scn.render.engine = 'CYCLES'
    scn.cycles.device = 'CPU'
    scn.cycles.samples = samples
    scn.cycles.use_denoising = True
    scn.cycles.max_bounces = 10
    scn.cycles.transmission_bounces = 10
    scn.render.resolution_x = res
    scn.render.resolution_y = res
    scn.render.film_transparent = False
    # Standard keeps the finishes on their brand hex values (AgX washes the red out to salmon)
    scn.view_settings.view_transform = 'Standard'
    scn.view_settings.look = 'None'
    scn.view_settings.exposure = float(os.environ.get('ALARO_EXPOSURE', -2.4))
    scn.render.image_settings.file_format = 'PNG'


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scn = bpy.context.scene
    scn.unit_settings.system = 'METRIC'
    scn.unit_settings.length_unit = 'CENTIMETERS'


# ---------------------------------------------------------------- outputs

def _flatten_for_gltf(mat):
    """glTF can't carry the procedural grain: bake it to flat factors the exporter can read.
    Returns an undo function."""
    nt = mat.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    undo = []
    if bsdf is None:
        return lambda: None
    rough_in = bsdf.inputs['Roughness']
    if rough_in.is_linked:
        rng = rough_in.links[0].from_node
        src = rng.outputs['Result']
        mid = (rng.inputs['To Min'].default_value + rng.inputs['To Max'].default_value) / 2
        old = rough_in.default_value
        nt.links.remove(rough_in.links[0])
        rough_in.default_value = mid
        undo.append(lambda: (setattr(rough_in, 'default_value', old), nt.links.new(src, rough_in)))
    norm_in = bsdf.inputs['Normal']
    if norm_in.is_linked:
        src_n = norm_in.links[0].from_socket
        nt.links.remove(norm_in.links[0])
        undo.append(lambda: nt.links.new(src_n, norm_in))
    # the exporter writes Sheen Tint as the sheen colour and ignores Sheen Weight
    w = bsdf.inputs['Sheen Weight'].default_value
    tint = bsdf.inputs['Sheen Tint']
    if w > 0:
        old_t = tuple(tint.default_value)
        tint.default_value = (old_t[0] * w, old_t[1] * w, old_t[2] * w, 1)
        undo.append(lambda: setattr(tint, 'default_value', old_t))
    return lambda: [u() for u in reversed(undo)]


def export_glb(path):
    bpy.ops.object.select_all(action='DESELECT')
    root = bpy.data.objects['Alaro']
    objs = [root] + list(root.children_recursive)
    for o in objs:
        o.select_set(True)
    mats = {s.material for o in objs if o.type == 'MESH' for s in o.material_slots if s.material}
    undos = [_flatten_for_gltf(m) for m in mats]
    try:
        bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                                  export_yup=True, export_extras=True)
    finally:
        for u in undos:
            u()


def render_views(out_dir, cam, quick=False):
    os.makedirs(out_dir, exist_ok=True)
    scn = bpy.context.scene
    tilt = bpy.data.objects['Alaro_Tilt']
    pan = bpy.data.objects['Alaro_Pan']
    views = [
        # name, finish, camera location, pan deg, tilt deg, lens, target
        ('hero-graphite', 'graphite', (-0.16, -0.62, 0.17), 0, 0, 118, (0, 0, 0.067)),
        ('three-quarter-white', 'white', (0.38, -0.5, 0.2), -10, 0, 118, (0, 0, 0.067)),
        ('front-red', 'red', (0.0, -0.64, 0.12), 0, 0, 118, (0, 0, 0.067)),
        ('rear-red', 'red', (0.36, 0.5, 0.22), 0, 0, 118, (0, 0, 0.067)),
        ('pan-tilt-graphite', 'graphite', (0.3, -0.55, 0.16), -35, -18, 118, (0, 0, 0.067)),
        ('detail-soft-touch-graphite', 'graphite', (-0.26, -0.07, 0.12), 0, 0, 100, (-0.036, 0.0, 0.088)),
    ]
    only = os.environ.get('ALARO_VIEWS')
    if only:
        views = [v for v in views if v[0] in only.split(',')]
    for name, finish, loc, pdeg, tdeg, lens, tgt in views:
        set_finish(finish)
        pan.rotation_euler = (0, 0, math.radians(pdeg))
        tilt.rotation_euler = (math.radians(tdeg), 0, 0)
        aim(cam, loc, tgt, lens)
        bpy.data.objects['Backdrop'].rotation_euler = (0, 0, math.atan2(loc[0], -loc[1]))
        scn.render.filepath = os.path.join(out_dir, f'{name}.png')
        bpy.ops.render.render(write_still=True)
        print('rendered', name, flush=True)
        if quick:
            break
    pan.rotation_euler = (0, 0, 0)
    tilt.rotation_euler = (0, 0, 0)
    set_finish('graphite')


def main(argv):
    here = os.path.dirname(os.path.abspath(__file__))
    reset_scene()
    build_camera('graphite')
    cam = build_studio()
    aim(cam, (-0.16, -0.62, 0.17))
    setup_render(samples=160)

    if '--quick' in argv:
        setup_render(res=560, samples=40)
        render_views(os.path.join(here, 'renders', 'quick'), cam)
        return

    for f in FINISHES:
        set_finish(f)
        export_glb(os.path.join(here, f'alaro-camera-{f}.glb'))
    set_finish('graphite')
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(here, 'alaro-camera.blend'), compress=True)
    if '--no-render' not in argv:
        render_views(os.path.join(here, 'renders'), cam)


if __name__ == '__main__':
    if bpy.app.background or not hasattr(bpy.context, 'window') or bpy.context.window is None:
        main(sys.argv[1:])
    else:
        # Running from Blender's Scripting tab: rebuild the model in the open file.
        for c in [c for c in bpy.data.collections if c.name.startswith(('Alaro Camera', 'Studio'))]:
            for o in list(c.objects):
                bpy.data.objects.remove(o)
            bpy.data.collections.remove(c)
        build_camera('graphite')
        build_studio()

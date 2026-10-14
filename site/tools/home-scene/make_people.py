"""
Alaro home v2: the clay-statue family.

Builds every person once from MPFB 2 (MakeHuman for Blender, CC0 output), dresses them, poses them for
each of the six moments, and bakes each figure to one solid mesh with a single 'Statue Clay' material.
The figures are saved per moment as assets/people/<moment>.blend; build_home.py links them in.

Only this script needs MPFB and the MakeHuman asset packs. The render machine only needs the saved
.blend files, so the GPU kit works without either.

    pip install bpy
    python3 make_people.py --mpfb /path/to/add-on-mpfb-v2.0.18.zip            # build + save all moments
    python3 make_people.py --mpfb ... --only tower,cake                        # some moments
    python3 make_people.py --mpfb ... --only tower --preview                   # also render previews (frames/people/)

MakeHuman assets (clothes, hair) must be in MPFB's user data folder; see assets/LICENSES.md for the packs.
Units are metres, Z up, in the home's world coordinates (see build_home.py): every pose below is placed
against the furniture it touches.
"""

import json
import math
import os
import sys

import bpy  # noqa: F401
import bmesh
from mathutils import Matrix, Quaternion, Vector
from mathutils.kdtree import KDTree

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, 'assets', 'people')

# ---------------------------------------------------------------- MPFB

MPFB = 'bl_ext.user_default.mpfb'


def ensure_mpfb(zip_path=None):
    if MPFB not in sys.modules:
        import addon_utils
        try:
            addon_utils.enable(MPFB, default_set=True)
        except Exception:
            pass
    if MPFB not in sys.modules:
        if not zip_path or not os.path.exists(zip_path):
            raise SystemExit('MPFB is not installed: pass --mpfb /path/to/add-on-mpfb-*.zip')
        bpy.ops.extensions.package_install_files(filepath=zip_path, repo='user_default', enable_on_install=True)
    global HumanService, TargetService, LocationService
    from bl_ext.user_default.mpfb.services.humanservice import HumanService
    from bl_ext.user_default.mpfb.services.targetservice import TargetService
    from bl_ext.user_default.mpfb.services.locationservice import LocationService


# ---------------------------------------------------------------- the family
# MakeHuman macro age: 0 = 1 yr, 0.1875 = 11 yrs, 0.5 = 25 yrs, 1 = 90 yrs.

def mh_age(years):
    if years <= 11:
        return (years - 1) / 10 * 0.1875
    if years <= 25:
        return 0.1875 + (years - 11) / 14 * 0.3125
    return 0.5 + (years - 25) / 65 * 0.5


# fabric codes, stored per vertex as 'clay_fabric' so the one clay shader can carve knit, weave or strands
SKIN, KNIT, WEAVE, COTTON, HAIR, SHOE = 0.0, 1.0, 2.0, 3.0, 4.0, 5.0

PEOPLE = {
    'dad': dict(macro=dict(gender=1.0, age=mh_age(40), muscle=0.55, weight=0.55, height=0.62, proportions=0.6),
                race=dict(caucasian=0.7, african=0.15, asian=0.15),
                wear=[('toigo_fisherman_sweater', KNIT), ('toigo_wool_pants', WEAVE), ('shoes05', SHOE)],
                hair='short02'),
    'mum': dict(macro=dict(gender=0.0, age=mh_age(38), muscle=0.45, weight=0.42, height=0.52, proportions=0.6, cupsize=0.5),
                race=dict(caucasian=0.5, african=0.2, asian=0.3),
                wear=[('toigo_shift_dress', COTTON), ('mindfront_cardigan_long_open_front', KNIT), ('shoes04', SHOE)],
                hair='elvs_hazel_hair'),
    'grandpa': dict(macro=dict(gender=1.0, age=mh_age(70), muscle=0.4, weight=0.6, height=0.48, proportions=0.5),
                    race=dict(caucasian=0.7, african=0.15, asian=0.15),
                    wear=[('elvs_male_shirt_untucked_bd1', COTTON), ('mindfront_lusekofta', KNIT), ('toigo_wool_pants', WEAVE), ('shoes04', SHOE)],
                    hair='short04'),
    'arlo': dict(macro=dict(gender=1.0, age=mh_age(9), muscle=0.5, weight=0.5, height=0.5, proportions=0.5),
                 race=dict(caucasian=0.6, african=0.2, asian=0.2),
                 wear=[('mindfront_knitted_sweater_02', KNIT), ('cortu_cargo_pants', WEAVE)],
                 hair='elvs_maxwell_hair'),
    'zoe': dict(macro=dict(gender=0.0, age=mh_age(6), muscle=0.5, weight=0.5, height=0.5, proportions=0.5),
                race=dict(caucasian=0.4, african=0.4, asian=0.2),
                wear=[('mindfront_knitted_sweater_01', KNIT), ('toigo_harem_pants', COTTON)],
                hair='cortu_strawberry_cloud_hair'),
    'leo': dict(macro=dict(gender=1.0, age=mh_age(5), muscle=0.5, weight=0.5, height=0.5, proportions=0.5),
                race=dict(caucasian=0.6, african=0.2, asian=0.2),
                wear=[('joepal_crude_t-shirt_female', COTTON), ('cortu_cargo_pants', WEAVE)],
                hair='short01'),
    'mira': dict(macro=dict(gender=0.0, age=mh_age(4), muscle=0.5, weight=0.55, height=0.5, proportions=0.5),
                 race=dict(caucasian=0.5, african=0.2, asian=0.3),
                 wear=[('elvs_male_shirt_untucked_bd1', COTTON), ('toigo_harem_pants', COTTON)],
                 hair='toigo_blunt_bob_with_bangs'),
}

# ---------------------------------------------------------------- posing helpers


def upd():
    bpy.context.view_layer.update()


def V(*a):
    return Vector(a[0] if len(a) == 1 else a)


def world_rotate(pb, q):
    """Rotate a pose bone (and so its children) about its head by a world-space rotation."""
    m = pb.matrix.copy()
    r = (q.to_matrix() @ m.to_3x3()).to_4x4()
    r.translation = m.translation
    pb.matrix = r
    upd()


def axis_of(pb, i):
    return pb.matrix.to_3x3().col[i].normalized()


def local_rotate(pb, i, angle):
    if angle:
        world_rotate(pb, Quaternion(axis_of(pb, i), angle))


def swing(pb, v_from, v_to, amount=1.0):
    q = v_from.rotation_difference(v_to)
    if amount != 1.0:
        q = Quaternion().slerp(q, amount)
    world_rotate(pb, q)


def solve_two_bone(S, T, a, b, pole):
    """Joint position for a two-bone chain from S of lengths a, b reaching T, bending toward pole."""
    d_vec = T - S
    d = min(max(d_vec.length, abs(a - b) + 1e-4), (a + b) * 0.9995)
    u = d_vec.normalized()
    x = (a * a - b * b + d * d) / (2 * d)
    h = math.sqrt(max(a * a - x * x, 0.0))
    p = pole - u * pole.dot(u)
    if p.length < 1e-6:
        p = u.orthogonal()
    return S + u * x + p.normalized() * h, S + u * d


class Poser:
    def __init__(self, rig):
        self.rig = rig
        self.P = rig.pose.bones
        for pb in self.P:
            pb.rotation_mode = 'QUATERNION'
        upd()

    def b(self, n):
        return self.P[n]

    def place(self, hips, face, pitch=0.0, roll=0.0):
        """Put the root (hips) at a world point, facing a world direction, leaning forward by pitch (deg)."""
        root = self.b('root')
        yaw = math.atan2(face[1], face[0]) + math.pi / 2
        R = Matrix.Rotation(yaw, 3, 'Z') @ Matrix.Rotation(math.radians(pitch), 3, 'X') @ Matrix.Rotation(math.radians(roll), 3, 'Y')
        self.R = R
        m = (R @ root.matrix.to_3x3()).to_4x4()
        m.translation = V(hips)
        root.matrix = m
        upd()

    def fwd(self):
        return self.R @ V(0, -1, 0)

    def spine(self, bend=0.0, side=0.0, twist=0.0, bones=('spine05', 'spine04', 'spine03', 'spine02', 'spine01')):
        """Bend (+ forward), side bend (+ toward the figure's left) and twist (+ toward the left), degrees."""
        n = len(bones)
        for name in bones:
            pb = self.b(name)
            local_rotate(pb, 0, -math.radians(bend) / n)
            local_rotate(pb, 2, -math.radians(side) / n)
            local_rotate(pb, 1, math.radians(twist) / n)

    def look(self, target, share=(0.2, 0.15, 0.15), tilt=0.0, turn_only=False):
        """Turn neck + head so the face looks at a world point. tilt (deg) rolls the head (+ toward its left)."""
        target = V(target)
        chain = ['neck01', 'neck02', 'neck03']
        head = self.b('head')
        for name, s in zip(chain, share):
            pb = self.b(name)
            eye = head.head + axis_of(head, 1) * 0.06
            swing(pb, axis_of(head, 2), (target - eye).normalized(), s)
        eye = head.head + axis_of(head, 1) * 0.06
        swing(head, axis_of(head, 2), (target - eye).normalized())
        if tilt:
            local_rotate(head, 2, -math.radians(tilt))

    def head_rot(self, nod=0.0, tilt=0.0, turn=0.0):
        h = self.b('head')
        local_rotate(h, 0, math.radians(nod))
        local_rotate(h, 2, -math.radians(tilt))
        local_rotate(h, 1, math.radians(turn))

    def shrug(self, side, up=0.0, fwd=0.0):
        c = self.b('clavicle.' + side)
        sx = 1 if side == 'L' else -1
        world_rotate(c, Quaternion(self.fwd(), -sx * math.radians(up)))
        world_rotate(c, Quaternion(V(0, 0, 1), sx * math.radians(fwd)))

    def arm(self, side, wrist, pole, twist=0.0):
        """Two-bone IK: the wrist joint goes to a world point; the elbow bends toward pole (world vector)."""
        ua, la, wr = self.b('upperarm01.' + side), self.b('lowerarm01.' + side), self.b('wrist.' + side)
        S, E, W = ua.head.copy(), la.head.copy(), wr.head.copy()
        a, b = (E - S).length, (W - E).length
        E2, T = solve_two_bone(S, V(wrist), a, b, V(pole))
        swing(ua, E - S, E2 - S)
        E, W = la.head.copy(), wr.head.copy()
        swing(la, W - E, T - E)
        if twist:
            sx = 1 if side == 'L' else -1
            local_rotate(la, 1, sx * math.radians(twist) * 0.4)
            local_rotate(self.b('lowerarm02.' + side), 1, sx * math.radians(twist) * 0.6)

    def hand(self, side, direction, palm=None, bend=0.0):
        """Point the hand (wrist -> knuckles) along a world direction; optionally turn the palm toward a world
        direction by twisting the forearm."""
        wr = self.b('wrist.' + side)
        if palm is not None:
            la2 = self.b('lowerarm02.' + side)
            for _ in range(3):
                swing(wr, axis_of(wr, 1), V(direction).normalized())
                ax = axis_of(la2, 1)
                cur = self.palm_normal(side)
                want = V(palm).normalized()
                cur_p = (cur - ax * cur.dot(ax))
                want_p = (want - ax * want.dot(ax))
                if cur_p.length < 1e-4 or want_p.length < 1e-4:
                    break
                ang = cur_p.angle(want_p)
                if cur_p.cross(want_p).dot(ax) < 0:
                    ang = -ang
                world_rotate(la2, Quaternion(ax, ang))
        swing(wr, axis_of(wr, 1), V(direction).normalized())

    def palm_normal(self, side):
        """World vector out of the palm, from the hand's bone layout (index and pinky knuckles vs. wrist)."""
        wr = self.b('wrist.' + side)
        i1, p1 = self.b('finger2-1.' + side).head, self.b('finger5-1.' + side).head
        along = ((i1 + p1) / 2 - wr.head).normalized()
        across = (i1 - p1).normalized()
        n = along.cross(across) if side == 'L' else across.cross(along)
        return n.normalized()

    def fingers(self, side, curl=(0.2, 0.2, 0.2, 0.2, 0.2), spread=0.0, thumb_in=0.0):
        """curl per finger (thumb, index, middle, ring, pinky): 0 straight, 1 fist."""
        for i, c in enumerate(curl, start=1):
            names = [f'finger{i}-{j}.{side}' for j in (1, 2, 3)]
            if i == 1:
                angs = (25, 30, 35)
            else:
                angs = (70, 85, 60)
            for n, a in zip(names, angs):
                local_rotate(self.b(n), 0, math.radians(a * c))
            if spread and i != 1:
                sx = 1 if side == 'L' else -1
                local_rotate(self.b(names[0]), 2, sx * math.radians(spread * (i - 3)))
        if thumb_in:
            sx = 1 if side == 'L' else -1
            local_rotate(self.b('finger1-1.' + side), 2, sx * math.radians(thumb_in))

    def leg(self, side, ankle, pole):
        ul, ll, ft = self.b('upperleg01.' + side), self.b('lowerleg01.' + side), self.b('foot.' + side)
        S, E, W = ul.head.copy(), ll.head.copy(), ft.head.copy()
        a, b = (E - S).length, (W - E).length
        E2, T = solve_two_bone(S, V(ankle), a, b, V(pole))
        swing(ul, E - S, E2 - S)
        E, W = ll.head.copy(), ft.head.copy()
        swing(ll, W - E, T - E)

    def foot(self, side, direction, toes=0.0):
        ft = self.b('foot.' + side)
        swing(ft, axis_of(ft, 1), V(direction).normalized())
        if toes:
            for t in ('toe1-1', 'toe2-1', 'toe3-1', 'toe4-1', 'toe5-1'):
                local_rotate(self.b(f'{t}.{side}'), 0, math.radians(toes))

    def joint(self, name):
        return self.b(name).head.copy()

    def limb(self, kind, side, mid, end):
        """Aim a two-segment limb through world points: the elbow/knee toward mid, the wrist/ankle toward end.
        Segment lengths stay as built, so the end lands along those directions."""
        a0, b0, c0 = (('upperarm01', 'lowerarm01', 'wrist') if kind == 'arm' else ('upperleg01', 'lowerleg01', 'foot'))
        ua, la, en = self.b(f'{a0}.{side}'), self.b(f'{b0}.{side}'), self.b(f'{c0}.{side}')
        S, E = ua.head.copy(), la.head.copy()
        swing(ua, E - S, V(mid) - S)
        E, W = la.head.copy(), en.head.copy()
        swing(la, W - E, V(end) - E)

    def lengths(self, kind, side):
        a0, b0, c0 = (('upperarm01', 'lowerarm01', 'wrist') if kind == 'arm' else ('upperleg01', 'lowerleg01', 'foot'))
        S, E, W = (self.b(f'{n}.{side}').head for n in (a0, b0, c0))
        return (E - S).length, (W - E).length

    def frame(self):
        """Figure-relative world axes: forward, left, up."""
        f = self.fwd()
        f2 = V(f.x, f.y, 0).normalized()
        return f2, V(-f2.y, f2.x, 0), V(0, 0, 1)


# ---------------------------------------------------------------- building a figure

EXPR_DIR = None


def expression(body, units):
    for unit, w in units.items():
        path = os.path.join(EXPR_DIR, unit + '.target.gz')
        if not os.path.exists(path):
            print('missing expression unit', unit)
            continue
        TargetService.load_target(body, path, weight=w, name='expr-' + unit)


def create_person(key):
    spec = PEOPLE[key]
    macro = TargetService.get_default_macro_info_dict()
    macro.update(spec['macro'])
    macro['race'] = dict(spec['race'])
    body = HumanService.create_human(macro_detail_dict=macro)
    body.name = f'mh_{key}'
    rig = HumanService.add_builtin_rig(body, 'default')
    data = LocationService.get_user_data()
    parts = [(body, SKIN)]

    def add(rel, kind, fabric):
        o = HumanService.add_mhclo_asset(os.path.join(data, rel), body, asset_type=kind, subdiv_levels=2)
        nv = len(o.data.vertices)
        lv = 1 if kind == 'Eyes' or nv > 6000 else (3 if nv < 1200 else 2)
        for m in o.modifiers:
            if m.type == 'SUBSURF':
                m.levels = m.render_levels = lv
        parts.append((o, fabric))
        return o
    add('eyes/high-poly/high-poly.mhclo', 'Eyes', SKIN)
    for name, fabric in spec['wear']:
        folder = os.path.join(data, 'clothes', name)
        mh = next(f for f in os.listdir(folder) if f.endswith('.mhclo'))
        add(f'clothes/{name}/{mh}', 'Clothes', fabric)
    folder = os.path.join(data, 'hair', spec['hair'])
    mh = next(f for f in os.listdir(folder) if f.endswith('.mhclo'))
    add(f"hair/{spec['hair']}/{mh}", 'Hair', HAIR)
    sub = body.modifiers.new('Subdivide', 'SUBSURF')
    sub.levels = sub.render_levels = 1
    return body, rig, parts


SEGMENTS = {
    # bone-name prefix -> (limb, start joint bone, end joint bone)
    'upperarm': ('uarm', 'upperarm01', 'lowerarm01'),
    'lowerarm': ('farm', 'lowerarm01', 'wrist'),
    'wrist': ('farm', 'lowerarm01', 'wrist'),
    'upperleg': ('thigh', 'upperleg01', 'lowerleg01'),
    'lowerleg': ('shin', 'lowerleg01', 'foot'),
}


def sculpt_folds(me, src, rig, fabric, height):
    """Carve fabric folds into a posed garment: rings that crowd at a bent elbow or knee, bunching at the
    cuffs and ankles, soft vertical drape on the body, and an overall low wrinkle. Outward only, so the
    garment never sinks into the body."""
    import numpy as np
    from mathutils import noise
    nv = len(me.vertices)
    co = np.zeros(nv * 3)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    nor = np.zeros(nv * 3)
    me.vertices.foreach_get('normal', nor)
    nor = nor.reshape(-1, 3)
    names = [g.name for g in src.vertex_groups]
    P = rig.pose.bones
    mw = rig.matrix_world

    def J(n):
        return mw @ P[n].head
    scale = height / 1.75
    lam = (0.05 if fabric == KNIT else 0.06) * scale
    fwd = (mw.to_3x3() @ P['root'].matrix.to_3x3() @ Vector((0, 0, 1))).normalized()
    disp = np.zeros(nv)
    seg_cache = {}
    torso_a, torso_b = J('root'), J('neck01')
    for i, v in enumerate(me.vertices):
        best, bw = None, 0.0
        for g in v.groups:
            if g.weight > bw and g.group < len(names):
                best, bw = names[g.group], g.weight
        p = Vector(co[i])
        wob = noise.noise(p * 7.0)
        side = best[-1] if best and best[-2:] in ('.L', '.R') else None
        prefix = best.split('0')[0].split('.')[0] if best else ''
        seg = SEGMENTS.get(prefix) if side else None
        if seg:
            limb, j0, j1 = seg
            key = (limb, side)
            if key not in seg_cache:
                A, B = J(f'{j0}.{side}'), J(f'{j1}.{side}')
                if limb in ('uarm', 'farm'):
                    S, E, W = J(f'upperarm01.{side}'), J(f'lowerarm01.{side}'), J(f'wrist.{side}')
                else:
                    S, E, W = J(f'upperleg01.{side}'), J(f'lowerleg01.{side}'), J(f'foot.{side}')
                bend = (E - S).angle(W - E) / math.pi  # 0 straight .. ~0.8 folded
                u = (B - A).normalized()
                b1 = u.cross(fwd)
                if b1.length < 1e-4:
                    b1 = u.orthogonal()
                b1.normalize()
                seg_cache[key] = (A, u, (B - A).length, b1, u.cross(b1), bend)
            A, u, Ln, b1, b2, bend = seg_cache[key]
            d = p - A
            t = max(0.0, min(1.0, d.dot(u) / Ln))
            r = d - u * d.dot(u)
            th = math.atan2(r.dot(b2), r.dot(b1))
            phase = t * Ln / lam + 0.22 * math.sin(th + 1.3) + 0.55 * wob
            ridge = abs(math.sin(math.pi * phase)) ** 0.45
            joint_t = 1.0 if limb in ('uarm', 'thigh') else 0.0
            near = math.exp(-((t - joint_t) / 0.3) ** 2)
            amp = 0.002 + 0.014 * scale * near * min(1.0, bend * 2.2 + 0.3)
            if limb in ('farm', 'shin'):
                amp += 0.007 * scale * math.exp(-((t - 1.0) / 0.12) ** 2)  # cuff / hem bunching
            disp[i] = amp * ridge
        else:
            # body: soft vertical drape, strongest toward the hem
            u = (torso_b - torso_a).normalized()
            d = p - torso_a
            h = d.dot(u)
            r = d - u * h
            th = math.atan2(r.dot(u.cross(fwd)), r.dot(fwd))
            hem = max(0.0, min(1.0, 1.0 - (h + 0.15) / 0.45))
            ridge = abs(math.sin(th * 5.0 + 1.6 * wob)) ** 0.7
            disp[i] = (0.0015 + 0.007 * scale * hem) * ridge
        disp[i] += 0.0012 * scale * (noise.noise(p * 18.0) * 0.5 + 0.5)
    print(f'  folds on {src.name}: {nv} verts, grouped {sum(1 for v in me.vertices if len(v.groups))}, disp max {disp.max()*1000:.1f} mm mean {disp.mean()*1000:.1f} mm', flush=True)
    co += nor * disp[:, None]
    me.vertices.foreach_set('co', co.ravel())
    me.update()


def bake(name, rig, parts, height=1.75):
    """Evaluate every posed part to plain geometry, tag fabric, join into one statue object."""
    upd()
    dg = bpy.context.evaluated_depsgraph_get()
    pieces = []
    for o, fabric in parts:
        oe = o.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(oe, preserve_all_data_layers=True, depsgraph=dg)
        me.transform(o.matrix_world)
        if fabric in (KNIT, WEAVE, COTTON):
            sculpt_folds(me, o, rig, fabric, height)
        attr = me.attributes.new('clay_fabric', 'FLOAT', 'POINT')
        attr.data.foreach_set('value', [fabric] * len(me.vertices))
        me.materials.clear()
        for i, layer in enumerate(list(me.uv_layers)):
            if i == 0:
                layer.name = 'UVMap'
            else:
                me.uv_layers.remove(layer)
        po = bpy.data.objects.new(name + '_part', me)
        bpy.context.scene.collection.objects.link(po)
        pieces.append(po)
    # join
    bpy.ops.object.select_all(action='DESELECT')
    for p in pieces:
        p.select_set(True)
    bpy.context.view_layer.objects.active = pieces[0]
    with bpy.context.temp_override(active_object=pieces[0], selected_editable_objects=pieces, selected_objects=pieces):
        bpy.ops.object.join()
    st = pieces[0]
    st.name = name
    st.data.name = name
    import statue
    st.data.materials.append(statue.statue_material())
    for p in st.data.polygons:
        p.use_smooth = True
    st.vertex_groups.clear()
    return st


def cleanup_sources(body, rig, parts):
    """Remove the MakeHuman source objects and only the data they brought (never the scene's own)."""
    meshes, mats, imgs = set(), set(), set()
    for o, _ in parts:
        if o.name not in bpy.data.objects:
            continue
        if o.type == 'MESH':
            meshes.add(o.data)
            for m in o.data.materials:
                if m is not None:
                    mats.add(m)
                    if m.node_tree:
                        imgs.update(n.image for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
        bpy.data.objects.remove(o, do_unlink=True)
    arm = rig.data if rig.name in bpy.data.objects else None
    if arm is not None:
        bpy.data.objects.remove(rig, do_unlink=True)
        if arm.users == 0:
            bpy.data.armatures.remove(arm)
    for blk, items in ((bpy.data.meshes, meshes), (bpy.data.materials, mats), (bpy.data.images, imgs)):
        for d in items:
            try:
                if d.users == 0:
                    blk.remove(d)
            except ReferenceError:
                pass


# ---------------------------------------------------------------- the six moments
# Each pose function gets {person: Poser} (already created) and returns anchors for the props that sit
# in a hand (plane, book). Coordinates come from build_home.LAYOUT so furniture and figures agree.

def unit(x, y, z=0.0):
    return V(x, y, z).normalized()


def body_height(body):
    dg = bpy.context.evaluated_depsgraph_get()
    oe = body.evaluated_get(dg)
    return max((oe.matrix_world @ V(c)).z for c in oe.bound_box)


def kneel(P, center, face, lean=10.0, spread=0.12, sit_back=0.0, knee_z=0.065, toes_back=True):
    """Kneel on both knees at a floor point: thighs lean forward by `lean` (deg); sit_back lowers the hips
    toward the heels. The shins lie flat behind the knees."""
    f, l, u = unit(*face), None, V(0, 0, 1)
    l = V(-f.y, f.x, 0)
    thigh, shin = P.lengths('leg', 'L')
    c = V(center[0], center[1], 0)
    a = math.radians(lean)
    hips = c + f * (thigh * math.sin(a)) + u * (knee_z + thigh * math.cos(a)) - f * sit_back * 0.5 - u * sit_back
    P.place(hips, f, pitch=0)
    for s, sx in (('L', 1), ('R', -1)):
        knee = c + l * sx * spread + u * knee_z
        ankle = knee - f * shin * 0.97 + u * 0.03
        P.limb('leg', s, knee, ankle)
        P.foot(s, -f + u * -0.9 if toes_back else -f, toes=0)
    return hips


def stand(P, center, face, hip_h=None, spread=0.1, pitch=0.0):
    f = unit(*face)
    l = V(-f.y, f.x, 0)
    thigh, shin = P.lengths('leg', 'L')
    h = hip_h if hip_h is not None else (thigh + shin) * 0.985 + 0.075
    P.place(V(center[0], center[1], 0) + V(0, 0, h), f, pitch=pitch)
    return f, l


def moment_tower(F):
    import build_home as H
    tx, ty = H.LAYOUT['tower']
    tz = H.LAYOUT['tower_top']
    blk_z = tz + 0.0075 + H.LAYOUT['pulled_layer'] * 0.015
    tower = V(tx, ty, tz + 0.12)
    # Dad kneels on the sofa side, leaning in, hands up around the tower as if it might fall
    P = F['dad']
    kneel(P, (tx - 0.08, ty - 0.5), (0, 1), lean=14, spread=0.13)
    P.spine(bend=22, twist=6)
    P.look(tower + V(0.04, 0, 0.02))
    for s, dx in (('L', -0.17), ('R', 0.15)):
        sx = 1 if s == 'L' else -1
        w = V(tx + dx, ty - 0.2, tz + 0.27 + (0.03 if s == 'R' else 0))
        P.arm(s, w, pole=V(-sx * 0.9, -0.4, -1.0))
        P.hand(s, V(-dx * 0.6, 0.15, 1.0), palm=V(-dx * 2.5, 1.0, 0.1))
        P.fingers(s, (0.05, 0.08, 0.12, 0.16, 0.2), spread=7)
    P.expr = {'eyebrows-left-up': 0.7, 'eyebrows-right-up': 0.7, 'mouth-open': 0.25, 'eye-left-opened-up': 0.4, 'eye-right-opened-up': 0.4}
    # Arlo kneels at the east end, pulling the block between finger and thumb, tongue out
    P = F['arlo']
    kneel(P, (tx + 0.47, ty - 0.17), (-0.94, 0.34), lean=14, spread=0.1)
    P.spine(bend=24, side=-3, twist=-6)
    pinch = V(tx + 0.036 + 0.0375 + 0.006, ty, blk_z)
    P.look(pinch + V(-0.02, 0, -0.01))
    P.arm('R', pinch + V(0.12, -0.03, 0.03), pole=V(0.3, -1, -0.6))
    P.hand('R', V(-1, 0.1, -0.25), palm=V(0, 1, 0))
    P.fingers('R', (0.35, 0.3, 0.75, 0.85, 0.9), thumb_in=10)
    P.arm('L', V(tx + 0.3, ty + 0.0, tz + 0.05), pole=V(0.2, 1, -0.5))
    P.hand('L', V(-1, 0.2, -0.3), palm=V(0, 0, -1))
    P.fingers('L', (0.2, 0.25, 0.3, 0.35, 0.4))
    P.expr = {'mouth-open': 0.35, 'eye-left-slit': 0.35, 'eye-right-slit': 0.35, 'eyebrows-left-down': 0.4, 'eyebrows-right-down': 0.4}
    P.tongue = 1.0
    return {}


def moment_sofa(F):
    import build_home as H
    sx, sy = H.LAYOUT['sofa']
    P = F['zoe']
    x = sx - 0.82
    f = unit(0.25, 1)
    thigh, shin = P.lengths('leg', 'L')
    hips = V(x, sy - 0.02, 0.53)
    P.place(hips, f, pitch=-26)
    l = V(-f.y, f.x, 0)
    for s, sxn in (('L', 1), ('R', -1)):
        knee = hips + f * thigh * 0.5 + V(0, 0, thigh * 0.86) + l * sxn * 0.075
        ankle = hips + f * 0.2 + l * sxn * 0.07 + V(0, 0, -0.03)
        P.limb('leg', s, knee, ankle)
        P.foot(s, f + V(0, 0, -0.25))
    P.spine(bend=-8, side=3, twist=10)
    head = P.joint('head')
    P.look(head + V(0, 0, 0.4) + f * 0.25 + l * 0.2)
    P.head_rot(nod=-14, tilt=8)
    # right hand over the mouth
    mouth = P.joint('head') + f * 0.12 + V(0, 0, 0.02)
    P.arm('R', mouth + f * 0.06 - l * 0.06 + V(0, 0, -0.07), pole=V(-l.x, -l.y, -1))
    P.hand('R', l * 0.8 + V(0, 0, 0.6), palm=-f)
    P.fingers('R', (0.15, 0.15, 0.2, 0.25, 0.3))
    # left arm hugging the cushion against her side
    P.arm('L', hips + f * 0.2 + l * 0.12 + V(0, 0, 0.22), pole=V(l.x, l.y, -0.6))
    P.hand('L', -l + f * 0.4, palm=-l)
    P.fingers('L', (0.4, 0.55, 0.6, 0.65, 0.7))
    P.expr = {'mouth-open': 0.75, 'mouth-corner-puller': 0.9, 'eye-left-slit': 0.8, 'eye-right-slit': 0.8, 'eyebrows-left-up': 0.3, 'eyebrows-right-up': 0.3}
    # the cushion she hugs, held against her shins and chest
    knee = (P.joint('lowerleg01.L') + P.joint('lowerleg01.R')) / 2
    chest = P.joint('spine03')
    c = knee.lerp(chest, 0.45) + f * 0.1 + l * 0.04
    return {'zoe_cushion': list(c), 'zoe_cushion_rot': [math.radians(-20), 0.0, math.atan2(f.y, f.x) - math.pi / 2]}


def moment_cake(F):
    import build_home as H
    cx, cy = H.LAYOUT['cake']
    top = H.LAYOUT['dining_top']
    candles = V(cx, cy, top + 0.27)
    # Grandpa on the north chair, leaning right over the cake, cheeks puffed, blowing
    P = F['grandpa']
    ch = H.LAYOUT['dining_chairs'][0]
    f = unit(0, -1)
    l = V(-f.y, f.x, 0)
    thigh, shin = P.lengths('leg', 'L')
    hips = V(ch[0], ch[1] - 0.05, 0.57)
    P.place(hips, f, pitch=34)
    for s, sxn in (('L', 1), ('R', -1)):
        knee = hips + f * thigh * 0.98 + l * sxn * 0.12 + V(0, 0, 0.02)
        P.limb('leg', s, knee, V(knee.x, knee.y + 0.04, 0.09))
        P.foot(s, f + V(0, 0, -0.35))
    P.spine(bend=30, twist=-4)
    P.look(candles + V(0, 0, -0.03))
    P.head_rot(nod=-4)
    P.arm('L', V(cx + 0.3, cy + 0.33, top + 0.04), pole=V(1, 0.2, -0.4))
    P.hand('L', V(0.2, -1, -0.1), palm=V(0, 0, -1))
    P.fingers('L', (0.2, 0.25, 0.3, 0.35, 0.4), spread=4)
    P.arm('R', V(cx - 0.3, cy + 0.36, top + 0.04), pole=V(-1, 0.2, -0.4))
    P.hand('R', V(-0.2, -1, -0.1), palm=V(0, 0, -1))
    P.fingers('R', (0.2, 0.3, 0.35, 0.4, 0.45))
    P.expr = {'mouth-pursing': 0.9, 'mouth-protusion': 0.7, 'eye-left-slit': 0.5, 'eye-right-slit': 0.5, 'eyebrows-left-up': 0.3, 'eyebrows-right-up': 0.3}
    P.puff = 1.0
    # Mum at the east end, mid-clap
    P = F['mum']
    f, l = stand(P, (2.78, cy - 0.06), (-1, 0.08))
    P.spine(bend=6, twist=4)
    P.look(candles + V(0.05, 0.1, 0.05))
    chest = P.joint('spine02') + f * 0.3 + V(0, 0, 0.02)
    for s, sxn in (('L', 1), ('R', -1)):
        P.arm(s, chest + l * sxn * 0.05, pole=l * sxn * 0.7 - f * 0.2 + V(0, 0, -1))
        P.hand(s, f * 0.7 + V(0, 0, 0.7) - l * sxn * 0.25, palm=-l * sxn)
        P.fingers(s, (0.05, 0.05, 0.08, 0.1, 0.12))
    P.expr = {'mouth-corner-puller': 0.9, 'mouth-open': 0.35, 'eye-left-slit': 0.25, 'eye-right-slit': 0.25}
    # Zoe kneels up on the south-east chair to see
    P = F['zoe']
    ch = H.LAYOUT['dining_chairs'][2]
    f = unit(0, 1)
    l = V(-f.y, f.x, 0)
    thigh, shin = P.lengths('leg', 'L')
    seat = 0.485
    hips = V(ch[0], ch[1] + 0.06, seat + 0.05 + thigh * 0.95)
    P.place(hips, f, pitch=22)
    for s, sxn in (('L', 1), ('R', -1)):
        knee = V(ch[0], ch[1] + 0.12, seat + 0.05) + l * sxn * 0.08
        P.limb('leg', s, knee, knee - f * shin * 0.97 + V(0, 0, 0.02))
        P.foot(s, -f + V(0, 0, -0.5))
    P.spine(bend=12)
    P.look(candles)
    for s, sxn in (('L', 1), ('R', -1)):
        P.arm(s, V(ch[0] + sxn * -0.13, 0.69, top + 0.04), pole=V(-sxn * 0.8, -0.3, -0.5))
        P.hand(s, V(0, 1, -0.2), palm=V(0, 0, -1))
        P.fingers(s, (0.1, 0.15, 0.2, 0.25, 0.3), spread=5)
    P.expr = {'mouth-open': 0.5, 'mouth-corner-puller': 0.7, 'eyebrows-left-up': 0.5, 'eyebrows-right-up': 0.5}
    # Dad filming with his phone, south-west of the table
    P = F['dad']
    f, l = stand(P, (2.62, 1.98), (-0.72, -0.62))
    P.spine(bend=-3, twist=-6)
    head = P.joint('head')
    phone = head + f * 0.36 + V(0, 0, 0.04)
    P.look(phone)
    for s, sxn in (('L', 1), ('R', -1)):
        P.arm(s, phone + l * sxn * 0.06 - f * 0.05 + V(0, 0, -0.06), pole=V(l.x * sxn, l.y * sxn, -1))
        P.hand(s, -l * sxn * 0.6 + V(0, 0, 0.8), palm=f)
        P.fingers(s, (0.3, 0.45, 0.5, 0.55, 0.6))
    P.expr = {'mouth-corner-puller': 0.6}
    P.phone = (phone, f)
    return {}


def moment_plane(F):
    import build_home as H
    sx, sy = H.LAYOUT['leo_stool']
    seat = 0.68
    # Leo on tiptoe on the stool, throwing arm fully extended, the plane just leaving his fingers
    P = F['leo']
    # he throws across Alaro's view, toward the living room, so the plane reads side-on
    f = unit(0.3, -1)
    l = V(-f.y, f.x, 0)
    thigh, shin = P.lengths('leg', 'L')
    hips = V(sx, sy, seat + 0.06 + (thigh + shin) * 0.97) + f * 0.03
    P.place(hips, f, pitch=8)
    for s, sxn in (('L', 1), ('R', -1)):
        heel = V(sx, sy, seat + 0.075) + l * sxn * 0.07 - f * 0.02
        P.leg(s, heel, pole=f)
        P.foot(s, f + V(0, 0, -1.5), toes=-35)
    P.spine(bend=10, side=4, twist=-22)
    sh = P.joint('upperarm01.R')
    a, b = P.lengths('arm', 'R')
    throw = (f * 0.9 + V(0, 0, 0.32) - l * 0.12).normalized()
    wrist = sh + throw * (a + b) * 0.97
    P.arm('R', wrist, pole=V(0, 0, -1) - l)
    print('LEO sh', sh, 'target', wrist, 'got', P.joint('wrist.R'), 'f', f, 'l', l, flush=True)
    P.hand('R', throw + V(0, 0, 0.1), palm=-l + V(0, 0, -0.6))
    P.fingers('R', (0.05, 0.0, 0.05, 0.25, 0.35), spread=3)
    P.arm('L', P.joint('upperarm01.L') + l * 0.22 - f * 0.18 + V(0, 0, -0.2), pole=V(0, 0, -1))
    P.hand('L', l * 0.6 - f * 0.5 + V(0, 0, -0.4), palm=V(0, 0, -1))
    P.fingers('L', (0.1, 0.1, 0.15, 0.2, 0.25), spread=8)
    tip = P.joint('finger3-3.R') + throw * 0.03
    plane = tip + throw * 0.36
    P.look(plane + throw * 0.3)
    P.expr = {'mouth-open': 0.5, 'mouth-corner-puller': 0.5, 'eye-left-opened-up': 0.5, 'eye-right-opened-up': 0.5}
    # Mum behind him, one hand on the stool, the other at his back, looking up at the plane
    P = F['mum']
    f2, l2 = stand(P, (sx - 0.55, sy + 0.0), (0.85, -0.53))
    P.spine(bend=18, twist=8, side=-3)
    P.look(plane + V(0, 0, 0.1))
    P.arm('R', V(sx - 0.17, sy - 0.04, seat + 0.0), pole=V(-0.3, -0.8, 0.2))
    P.hand('R', V(0.5, 0.1, -1), palm=V(1, 0.1, 0.2))
    P.fingers('R', (0.4, 0.5, 0.55, 0.6, 0.65))
    side_l = F['leo'].joint('spine04') - l * 0.1 - f * 0.03
    P.arm('L', side_l, pole=V(-0.2, 0.9, -1))
    P.hand('L', V(0.6, 0.3, 0.5), palm=l)
    P.fingers('L', (0.15, 0.2, 0.25, 0.3, 0.3))
    P.expr = {'mouth-corner-puller': 0.55, 'mouth-open': 0.3, 'eyebrows-left-up': 0.5, 'eyebrows-right-up': 0.5}
    nose_dir = throw
    yaw = math.atan2(nose_dir.y, nose_dir.x)
    pitch = math.asin(max(-1, min(1, nose_dir.z)))
    return {'plane': list(plane), 'plane_rot': [0.0, -pitch, yaw]}


def moment_book(F):
    import build_home as H
    ax, ay, rot = H.LAYOUT['armchair']
    rot = math.radians(rot)
    Rz = Matrix.Rotation(rot, 3, 'Z')

    def C(x, y, z):  # armchair local -> world (front is local -Y)
        return V(ax, ay, 0) + Rz @ V(x, y, z)
    f = (Rz @ V(0, -1, 0)).normalized()
    l = V(-f.y, f.x, 0)
    # the book rests on Mira's knees, tilted up toward both readers and turned a little toward Alaro
    tilt, yaw = math.radians(-38), rot - math.radians(18)
    Rb = Matrix.Rotation(yaw, 3, 'Z') @ Matrix.Rotation(tilt, 3, 'X')
    book = C(0.0, -0.4, 0.8)
    ang = math.radians(H.BOOK_PAGE_ANGLE)

    def Bk(x, y, z):
        return book + Rb @ V(x, y, z)
    page_tip = Bk(-0.185 * math.cos(ang) + 0.01, 0.085, 0.016 + 0.185 * math.sin(ang))
    P = F['mum']
    thigh, shin = P.lengths('leg', 'L')
    hips = C(0, 0.1, 0.6)
    P.place(hips, f, pitch=-8)
    for s, sxn in (('L', 1), ('R', -1)):
        knee = hips + f * thigh * 0.97 + l * sxn * 0.11 + V(0, 0, 0.04)
        P.limb('leg', s, knee, V(knee.x, knee.y, 0.09) + f * 0.06)
        P.foot(s, f + V(0, 0, -0.3))
    P.spine(bend=16, twist=-4)
    P.look(Bk(0.03, 0, 0), share=(0.25, 0.2, 0.2))
    P.head_rot(tilt=-12)
    # left hand holds the left board; right hand lifts the turning page by its corner
    P.arm('L', Bk(-0.2, -0.02, -0.01) + V(0, 0, 0.02), pole=V(l.x, l.y, -1))
    P.hand('L', Rb @ V(0.1, 0.5, -0.4), palm=Rb @ V(0.4, 0, -1))
    P.fingers('L', (0.35, 0.3, 0.35, 0.4, 0.45))
    P.arm('R', page_tip + Rb @ V(0.05, 0.03, 0.02), pole=V(-l.x, -l.y, -1))
    P.hand('R', Rb @ V(-0.5, 0.2, 0.6), palm=Rb @ V(-0.3, 0, -1))
    P.fingers('R', (0.4, 0.15, 0.3, 0.45, 0.55))
    P.expr = {'mouth-corner-puller': 0.45, 'eye-left-slit': 0.3, 'eye-right-slit': 0.3}
    # Mira on her lap, in pyjamas, hands on the book's lower corners, both looking at the picture
    P = F['mira']
    t2, s2 = P.lengths('leg', 'L')
    mh = C(0.02, -0.12, 0.72)
    P.place(mh, f, pitch=-4)
    for s, sxn in (('L', 1), ('R', -1)):
        knee = mh + f * t2 * 0.97 + l * sxn * 0.06 + V(0, 0, -0.04)
        P.limb('leg', s, knee, knee + f * 0.04 + V(0, 0, -s2 * 0.97))
        P.foot(s, f + V(0, 0, -0.6))
    P.spine(bend=14)
    P.look(Bk(0.06, 0.0, 0.0), share=(0.25, 0.2, 0.2))
    for s, sxn in (('L', 1), ('R', -1)):
        P.arm(s, Bk(sxn * 0.15, -0.14, 0.01) + V(0, 0, 0.03), pole=V(l.x * sxn, l.y * sxn, -1))
        P.hand(s, Rb @ V(-sxn * 0.3, 0.6, -0.3), palm=Rb @ V(0, 0, -1))
        P.fingers(s, (0.3, 0.3, 0.35, 0.4, 0.45))
    P.expr = {'mouth-open': 0.25, 'eyebrows-left-up': 0.4, 'eyebrows-right-up': 0.4}
    eul = Rb.to_euler('XYZ')
    return {'book': list(book), 'book_rot': [eul.x, eul.y, eul.z], 'page': list(page_tip)}


MOMENTS = {
    'tower': (['dad', 'arlo'], moment_tower),
    'sofa': (['zoe'], moment_sofa),
    'cake': (['grandpa', 'mum', 'zoe', 'dad'], moment_cake),
    'plane': (['leo', 'mum'], moment_plane),
    'book': (['mum', 'mira'], moment_book),
}
HOLD = {'tower': 74, 'sofa': 82, 'cake': 104, 'plane': 130, 'catbed': 154, 'book': 182}


# ---------------------------------------------------------------- finishing touches on a posed figure

def cheek_puff(body, amount):
    """Puffed cheeks for blowing out candles: a soft outward bulge, as a shape key on the rest mesh."""
    rig_eye = None
    for o in body.children:
        if o.type == 'ARMATURE':
            rig_eye = o
    me = body.data
    if not me.shape_keys:
        body.shape_key_add(name='Basis')
    sk = body.shape_key_add(name='puff', from_mix=True)
    arm = body.parent if body.parent and body.parent.type == 'ARMATURE' else None
    eyes = [arm.data.bones[f'eye.{s}'].head_local for s in ('L', 'R')] if arm else []
    scale = (eyes[0] - eyes[1]).length / 0.06 if eyes else 1.0
    centres = [e + V(0.012 * (1 if e.x > 0 else -1), 0.03, -0.062) * scale for e in eyes]
    r = 0.034 * scale
    for v in me.vertices:
        for c in centres:
            d = (v.co - c).length
            if d < r and v.normal.y < 0.2:
                k = (1 - d / r) ** 2
                sk.data[v.index].co = sk.data[v.index].co + v.normal * 0.009 * scale * k
    sk.value = amount


def phone_piece(pos, facing, name):
    """Dad's phone, carved in the same clay: a slab held up in landscape, screen toward him."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(0.155, 0.0085, 0.074), verts=bm.verts)
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.003, segments=3, affect='EDGES')
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    q = V(0, 1, 0).rotation_difference(V(facing.x, facing.y, 0).normalized())
    me.transform(Matrix.Translation(pos) @ q.to_matrix().to_4x4())
    me.uv_layers.new(name='UVMap')
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def build_cat():
    """Milo mid-stretch, carved as one smooth clay form from metaball capsules: hindquarters up in his bed,
    front legs reaching out across the floor toward the room, tail curling up, eyes shut."""
    import build_home as H
    bx, by = H.LAYOUT['catbed']
    mb = bpy.data.metaballs.new('milo_mb')
    mb.resolution = 0.0045
    mb.render_resolution = 0.0045
    mb.threshold = 0.6

    K = 1.55  # metaball radius -> visible radius at this threshold

    def cap(a, b, r, stiff=2.0):
        a, b = V(a), V(b)
        r *= K
        e = mb.elements.new(type='CAPSULE')
        e.co = (a + b) / 2
        e.size_x = max((b - a).length / 2, 1e-4)
        e.radius = r
        e.stiffness = stiff
        e.rotation = V(1, 0, 0).rotation_difference((b - a).normalized() if (b - a).length > 1e-6 else V(1, 0, 0))
        return e

    def ell(c, size, r, stiff=2.0, rot=None):
        r *= K
        e = mb.elements.new(type='ELLIPSOID')
        e.co = V(c)
        e.size_x, e.size_y, e.size_z = size
        e.radius = r
        e.stiffness = stiff
        if rot is not None:
            e.rotation = rot
        return e
    lift = 0.11  # hind half stands in the bed, on the cushion
    # spine: high rump in the bed, sweeping down to a low chest
    spine = [(-0.2, 0, 0.25 + lift), (-0.11, 0, 0.235 + lift), (-0.02, 0, 0.19 + lift * 0.6), (0.07, 0, 0.14), (0.13, 0, 0.115)]
    for a, b, r in zip(spine, spine[1:], (0.065, 0.062, 0.058, 0.054)):
        cap(a, b, r)
    ell((-0.17, 0, 0.225 + lift), (1.15, 1.0, 1.0), 0.07)          # haunches
    ell((0.1, 0, 0.11), (1.25, 1.0, 0.85), 0.06)                    # chest
    # hind legs: thigh, shin, hock, paw on the cushion
    for sy in (1, -1):
        hip, knee = (-0.18, sy * 0.05, 0.22 + lift), (-0.13, sy * 0.06, 0.135 + lift * 0.9)
        hock, paw = (-0.22, sy * 0.055, 0.06 + lift * 0.85), (-0.17, sy * 0.05, 0.022 + lift * 0.85)
        cap(hip, knee, 0.042)
        cap(knee, hock, 0.022)
        cap(hock, paw, 0.017)
        ell(paw, (1.6, 1.0, 0.7), 0.02)
    # front legs reaching forward along the floor
    for sy in (1, -1):
        sh, el = (0.11, sy * 0.045, 0.11), (0.16, sy * 0.05, 0.045)
        wr, paw = (0.29, sy * 0.042, 0.022), (0.335, sy * 0.04, 0.016)
        cap(sh, el, 0.032)
        cap(el, wr, 0.02)
        ell(paw, (1.5, 1.05, 0.65), 0.021)
        for k in (-1, 0, 1):  # toes
            ell((0.352, sy * 0.04 + k * 0.011, 0.012), (1.0, 1.0, 0.8), 0.0085, stiff=1.5)
    # neck and head, chin up into the stretch, eyes shut
    cap((0.13, 0, 0.125), (0.19, 0, 0.165), 0.045)
    head_c = V((0.215, 0, 0.18))
    ell(head_c, (1.0, 1.08, 0.92), 0.062)
    ell(head_c + V((0.045, 0, -0.018)), (1.0, 1.15, 0.75), 0.03)         # muzzle
    for sy in (1, -1):
        ell(head_c + V((0.05, sy * 0.016, -0.02)), (1.0, 1.0, 0.85), 0.017)  # whisker pads
        ell(head_c + V((0.005, sy * 0.042, -0.008)), (1.0, 1.0, 1.0), 0.03)  # cheeks
    ell(head_c + V((0.072, 0, -0.008)), (0.8, 1.0, 0.7), 0.009, stiff=1.6)  # nose
    from mathutils import Euler
    for sy in (1, -1):
        # ears: a soft rounded triangle from two flattened ellipsoids, leaning out a little
        rot = Euler((sy * math.radians(-18), math.radians(-12), 0)).to_quaternion()
        ell(head_c + V((-0.008, sy * 0.034, 0.05)), (0.45, 1.0, 1.0), 0.021, stiff=2.0, rot=rot)
        ell(head_c + V((-0.012, sy * 0.04, 0.072)), (0.4, 0.75, 1.0), 0.012, stiff=2.0, rot=rot)
        # closed eyes: a small carved crease
        e = mb.elements.new(type='ELLIPSOID')
        e.co = head_c + V((0.05, sy * 0.024, 0.012))
        e.size_x, e.size_y, e.size_z = 0.35, 1.0, 0.25
        e.radius = 0.012 * K
        e.stiffness = 2.0
        e.use_negative = True
        e.rotation = Euler((0, 0, sy * math.radians(20))).to_quaternion()
    # tail curling up behind
    tail = [(-0.24, 0, 0.26 + lift), (-0.31, 0.0, 0.31 + lift), (-0.35, 0.02, 0.38 + lift), (-0.35, 0.05, 0.45 + lift), (-0.32, 0.07, 0.5 + lift)]
    for a, b, r in zip(tail, tail[1:], (0.03, 0.027, 0.024, 0.021)):
        cap(a, b, r)
    mo = bpy.data.objects.new('milo_mb', mb)
    bpy.context.scene.collection.objects.link(mo)
    upd()
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(mo.evaluated_get(dg))
    bpy.data.objects.remove(mo, do_unlink=True)
    bpy.data.metaballs.remove(mb)
    for p in me.polygons:
        p.use_smooth = True
    me.uv_layers.new(name='UVMap')
    attr = me.attributes.new('clay_fabric', 'FLOAT', 'POINT')
    attr.data.foreach_set('value', [6.0] * len(me.vertices))
    me.name = 'Statue_Milo_catbed'
    o = bpy.data.objects.new('Statue_Milo_catbed', me)
    bpy.context.scene.collection.objects.link(o)
    sub = o.modifiers.new('Smooth', 'SUBSURF')
    sub.levels = sub.render_levels = 1
    # in the bed, stretching out across the floor; seen side-on from Alaro, head turned a little toward it
    yaw = math.radians(112)
    o.location = (bx + math.cos(yaw) * 0.1, by + math.sin(yaw) * 0.1, 0.0)
    o.rotation_euler = (0, 0, yaw)
    import statue
    me.materials.append(statue.statue_material())
    return o


def make_moment(moment):
    keys, fn = MOMENTS[moment]
    made = {}
    for k in keys:
        body, rig, parts = create_person(k)
        P = Poser(rig)
        P.key, P.body, P.parts, P.height = k, body, parts, body_height(body)
        made[k] = P
    anchors = fn(made) or {}
    statues = []
    for k, P in made.items():
        expr = getattr(P, 'expr', {})
        if expr:
            expression(P.body, expr)
        if getattr(P, 'puff', 0):
            cheek_puff(P.body, P.puff)
        parts = list(P.parts)
        if getattr(P, 'phone', None):
            pos, facing = P.phone
            parts.append((phone_piece(pos, facing, f'phone_{k}'), SKIN))
        st = bake(f'Statue_{k.capitalize()}_{moment}', P.rig, parts, height=P.height)
        cleanup_sources(P.body, P.rig, parts)
        statues.append(st)
    return statues, anchors


def save_moment(moment, statues):
    os.makedirs(ASSETS, exist_ok=True)
    path = os.path.join(ASSETS, f'{moment}.blend')
    ids = set(statues)
    for st in statues:
        ids.add(st.data)
    bpy.data.libraries.write(path, ids, compress=True)
    print(f'saved {path} ({os.path.getsize(path) / 1e6:.1f} MB, {sum(len(s.data.polygons) for s in statues)} faces)', flush=True)


def preview(H, R, moment, statues, anchors, out, w=640, samples=16):
    scn = bpy.context.scene
    H.place_props(anchors)
    H.setup_cycles(w, w * 9 // 16, samples)
    f = HOLD[moment]
    H.apply_frame(R, f)
    scn.render.filepath = os.path.join(out, f'{moment}_pov.png')
    bpy.ops.render.render(write_still=True)
    # a closer look from the room, beside Alaro's line of sight
    pts = [st.matrix_world @ V(c) for st in statues for c in st.bound_box]
    lo = V((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = V((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    c = (lo + hi) / 2
    src = R.cam.location.copy()
    d = (c - src)
    d.z = 0
    d.normalize()
    side = V(-d.y, d.x, 0)
    for tag, offs in (('near', -d * 2.2 + side * 0.6),):
        R.cam.location = c + offs + V(0, 0, 0.45)
        R.cam.rotation_euler = (c - R.cam.location).to_track_quat('-Z', 'Y').to_euler()
        R.cam.data.lens = 35
        R.cam.data.dof.use_dof = False
        scn.render.filepath = os.path.join(out, f'{moment}_{tag}.png')
        bpy.ops.render.render(write_still=True)


def main(argv):
    if '--' in argv:
        argv = argv[argv.index('--') + 1:]

    def arg(name, default=None):
        return argv[argv.index(name) + 1] if name in argv else default
    ensure_mpfb(arg('--mpfb', os.environ.get('MPFB_ZIP')))
    global EXPR_DIR
    EXPR_DIR = os.path.join(LocationService.get_mpfb_data('targets'), 'expression', 'units', 'caucasian')
    sys.path.insert(0, HERE)
    import build_home as H
    moments = arg('--only', ','.join(list(MOMENTS) + ['catbed'])).split(',')
    R = H.build_scene(people=False) if '--preview' in argv else None
    if R is None:
        bpy.ops.wm.read_factory_settings(use_empty=True)
    apath = os.path.join(ASSETS, 'anchors.json')
    anchors = json.load(open(apath)) if os.path.exists(apath) else {}
    for mo in moments:
        if mo == 'catbed':
            statues, an = [build_cat()], {}
        else:
            statues, an = make_moment(mo)
        anchors.update(an)
        if '--no-save' not in argv:
            save_moment(mo, statues)
        if R is not None:
            preview(H, R, mo, statues, anchors, os.path.join(HERE, 'frames', 'people'), int(arg('--w', 640)), int(arg('--samples', 16)))
            for st in statues:
                bpy.data.objects.remove(st, do_unlink=True)
    os.makedirs(ASSETS, exist_ok=True)
    with open(apath, 'w') as fh:
        json.dump(anchors, fh, indent=1)


if __name__ == '__main__':
    main(sys.argv[1:])

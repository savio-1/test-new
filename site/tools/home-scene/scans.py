"""
Real 3D scans of people (Sketchfab, CC BY) turned into clay statues and posed for the moments.

    SKETCHFAB_TOKEN=... python3 scans.py fetch   # download the scans -> assets/scans/<key>/<key>.glb
    python3 scans.py prepare             # assets/scans/<key>/<key>.glb -> assets/scans/<key>/<key>_clay.blend
    python3 scans.py joints              # body landmarks from front and side renders (needs MediaPipe models)
    python3 scans.py rig                 # + a skeleton fitted from those landmarks, skinned to the clay mesh
    python3 family.py                    # pose everyone for the moments -> assets/people/<moment>.blend

The scans themselves are not in git (see assets/LICENSES.md for sources and credits). `fetch` downloads them with
your own Sketchfab API token (sketchfab.com > Settings > Password & API), read from the environment only and
never written anywhere.

Each scan is normalised (up +Z, facing -Y like the MakeHuman figures, feet on the floor, real height), its parts
joined and voxel-remeshed into one closed surface. The remesh is what a statue is: one material, no seams between
clothes and skin, and a mesh that skins cleanly to a skeleton.
"""

import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
SCANS = os.path.join(HERE, 'assets', 'scans')

# key: (Sketchfab uid, author, title, up axis, facing axis in the file, height m, voxel size m)
SCAN_SET = {
    'dad': ('e62179794eae4e74b06a8f8f5153c0cc', 'danteg', 'Character Scan Photogrammetry', '+Z', '+X', 1.80, 0.0035),
    'mum': ('3d1ba75f9b714e55b3a1e82755c02ed4', 'Lenscloud3D', 'S "A" pose - Lenscloud Scanner Hi-Poly', '+Z', '-X', 1.66, 0.0032),
    'grandpa': ('bbd77e5070624713b5f8b2c2a081506f', 'webdood', 'Shannon Norrell-A- Pose', '-Y', '-Z', 1.74, 0.0035),
    'milo': ('3524218d6a804e29901c4324ee47aa10', 'kingofrichland', 'Cat Stretching', '+Z', None, 0.27, 0.0018),
}

AXES = {'+X': Vector((1, 0, 0)), '-X': Vector((-1, 0, 0)), '+Y': Vector((0, 1, 0)), '-Y': Vector((0, -1, 0)),
        '+Z': Vector((0, 0, 1)), '-Z': Vector((0, 0, -1))}


def fetch(key, out_dir=SCANS):
    import json
    import urllib.request
    token = os.environ.get('SKETCHFAB_TOKEN')
    if not token:
        sys.exit('set SKETCHFAB_TOKEN to your Sketchfab API token')
    uid = SCAN_SET[key][0]
    req = urllib.request.Request(f'https://api.sketchfab.com/v3/models/{uid}/download',
                                 headers={'Authorization': f'Token {token}'})
    info = json.load(urllib.request.urlopen(req))
    if 'glb' not in info:
        sys.exit(f'{key}: no glb download offered for {uid} ({sorted(info)})')
    os.makedirs(os.path.join(out_dir, key), exist_ok=True)
    path = os.path.join(out_dir, key, f'{key}.glb')
    urllib.request.urlretrieve(info['glb']['url'], path)
    print(f'{key}: {os.path.getsize(path) / 1e6:.1f} MB -> {path}', flush=True)


def basis(up, front):
    """Rotation taking the file's up to +Z and its facing direction to -Y."""
    u = AXES[up]
    f = AXES[front] if front else (Vector((0, -1, 0)) if abs(u.y) < 0.9 else Vector((0, 0, -1)))
    r = u.cross(f).normalized()  # the figure's left, in the file's axes
    src = Matrix((r, -f, u)).transposed()  # columns: x=left, y=back, z=up  (Blender figures: +X left, -Y front)
    return src.inverted()


def prepare(key, out_dir=SCANS):
    uid, author, title, up, front, height, voxel = SCAN_SET[key]
    path = os.path.join(out_dir, key, f'{key}.glb')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    bpy.context.view_layer.update()
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    for o in meshes:
        sample_luminance(o)
    # bake every part's world transform into its vertices, then join
    for o in meshes:
        o.data = o.data.copy()
        o.data.transform(o.matrix_world)
        o.parent = None
        o.matrix_world = Matrix.Identity(4)
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    for o in list(bpy.data.objects):
        if o is not ob:
            bpy.data.objects.remove(o, do_unlink=True)
    me = ob.data
    me.transform(basis(up, front).to_4x4())
    co = [v.co for v in me.vertices]
    lo = Vector([min(c[i] for c in co) for i in range(3)])
    hi = Vector([max(c[i] for c in co) for i in range(3)])
    s = height / (hi.z - lo.z)
    centre = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    me.transform(Matrix.Scale(s, 4) @ Matrix.Translation(-centre))
    me.materials.clear()
    src_co = [v.co.copy() for v in me.vertices]
    lum_attr = me.attributes.get('scan_lum')
    src_lum = [0.5] * len(src_co)
    if lum_attr is not None:
        lum_attr.data.foreach_get('value', src_lum)
    # one closed clay surface
    rm = ob.modifiers.new('Remesh', 'REMESH')
    rm.mode = 'VOXEL'
    rm.voxel_size = voxel
    rm.adaptivity = 0.0
    rm.use_smooth_shade = True
    dg = bpy.context.evaluated_depsgraph_get()
    clay = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    clay.name = f'Scan_{key}'
    bpy.data.objects.remove(ob, do_unlink=True)
    out = bpy.data.objects.new(f'Scan_{key}', clay)
    bpy.context.scene.collection.objects.link(out)
    # keep only the largest connected piece (drops floating scan debris)
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(clay)
    islands = []
    seen = set()
    for v in bm.verts:
        if v.index in seen:
            continue
        stack, comp = [v], []
        seen.add(v.index)
        while stack:
            x = stack.pop()
            comp.append(x)
            for e in x.link_edges:
                y = e.other_vert(x)
                if y.index not in seen:
                    seen.add(y.index)
                    stack.append(y)
        islands.append(comp)
    islands.sort(key=len, reverse=True)
    for comp in islands[1:]:
        if len(comp) < 0.02 * len(islands[0]):
            bmesh.ops.delete(bm, geom=comp, context='VERTS')
    bm.to_mesh(clay)
    bm.free()
    for p in clay.polygons:
        p.use_smooth = True
    add_tone(clay, src_co, src_lum)
    blend = os.path.join(out_dir, key, f'{key}_clay.blend')
    bpy.data.libraries.write(blend, {out, clay}, compress=True)
    print(f'{key}: {len(clay.polygons)} faces, {height} m, from "{title}" by {author} -> {blend}', flush=True)
    return out


def sample_luminance(o):
    """Per-vertex luminance of the scan's photo texture, stored as the point attribute scan_lum."""
    import numpy as np
    me = o.data
    lum = np.full(len(me.vertices), -1.0)
    img = None
    for m in me.materials:
        if m and m.use_nodes:
            for nd in m.node_tree.nodes:
                if nd.type == 'TEX_IMAGE' and nd.image is not None:
                    img = nd.image
                    break
        if img:
            break
    if img is None or not me.uv_layers:
        return
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    L = 0.2126 * px[..., 0] + 0.7152 * px[..., 1] + 0.0722 * px[..., 2]
    uv = np.empty(len(me.loops) * 2, dtype=np.float32)
    me.uv_layers.active.data.foreach_get('uv', uv)
    uv = uv.reshape(-1, 2)
    vi = np.empty(len(me.loops), dtype=np.int64)
    me.loops.foreach_get('vertex_index', vi)
    x = np.clip((uv[:, 0] % 1.0) * (w - 1), 0, w - 1).astype(int)
    y = np.clip((uv[:, 1] % 1.0) * (h - 1), 0, h - 1).astype(int)
    vals = L[y, x]
    acc = np.zeros(len(me.vertices)); cnt = np.zeros(len(me.vertices))
    np.add.at(acc, vi, vals); np.add.at(cnt, vi, 1)
    lum = np.where(cnt > 0, acc / np.maximum(cnt, 1), 0.5)
    a = me.attributes.new('scan_lum', 'FLOAT', 'POINT')
    a.data.foreach_set('value', lum.astype(np.float32))


def add_tone(clay, src_co, src_lum, radius=0.03):
    """scan_tone: the photo's light/dark detail relative to its surroundings (eyes, brows, lips, creases), not
    the colour of the clothes. 0 is neutral; statue.py darkens or lightens the clay a little by it."""
    import numpy as np
    from mathutils.kdtree import KDTree
    kd = KDTree(len(src_co))
    for i, c in enumerate(src_co):
        kd.insert(c, i)
    kd.balance()
    n = len(clay.vertices)
    lum = np.empty(n)
    for i, v in enumerate(clay.vertices):
        _, j, _ = kd.find(v.co)
        lum[i] = src_lum[j]
    # local mean over ~3 cm on the clay surface
    kd2 = KDTree(n)
    for i, v in enumerate(clay.vertices):
        kd2.insert(v.co, i)
    kd2.balance()
    mean = np.empty(n)
    step = 3
    for i, v in enumerate(clay.vertices):
        if i % step:
            continue
        idx = [j for _, j, _ in kd2.find_range(v.co, radius)]
        mean[i] = lum[idx].mean() if idx else lum[i]
    for i in range(n):
        if i % step:
            mean[i] = mean[i - i % step]
    tone = np.clip(lum / np.maximum(mean, 0.02) - 1.0, -0.6, 0.4)
    # only the head carries it: on clothes the photo's fabric pattern would read as dirt
    z = np.array([v.co.z for v in clay.vertices])
    top = z.max()
    tone *= np.clip((z - (top - 0.27 * top / 1.75)) / (0.03 * top / 1.75), 0.0, 1.0)
    a = clay.attributes.new('scan_tone', 'FLOAT', 'POINT')
    a.data.foreach_set('value', tone.astype(np.float32))


# ---------------------------------------------------------------- joints from the textured scan

def render_views(key, out_dir=SCANS, res=1024):
    """Front and side orthographic renders of the textured scan (normalised like prepare()), for the landmark
    detector. Returns {view: (png, ortho_scale, centre)}."""
    uid, author, title, up, front, height, voxel = SCAN_SET[key]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(out_dir, key, f'{key}.glb'))
    bpy.context.view_layer.update()
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    R = basis(up, front).to_4x4()
    pts = []
    for o in meshes:
        o.data = o.data.copy()
        o.data.transform(R @ o.matrix_world)
        o.parent = None
        o.matrix_world = Matrix.Identity(4)
        pts += [v.co for v in o.data.vertices]
    lo = Vector([min(c[i] for c in pts) for i in range(3)])
    hi = Vector([max(c[i] for c in pts) for i in range(3)])
    s = height / (hi.z - lo.z)
    centre = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    for o in meshes:
        o.data.transform(Matrix.Scale(s, 4) @ Matrix.Translation(-centre))
    scn = bpy.context.scene
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scn.collection.objects.link(cam)
    scn.camera = cam
    cam.data.type = 'ORTHO'
    span = max(height, (hi.x - lo.x) * s, (hi.y - lo.y) * s) * 1.08
    cam.data.ortho_scale = span
    scn.render.engine = 'BLENDER_WORKBENCH'
    scn.display.shading.light = 'FLAT'
    scn.display.shading.color_type = 'TEXTURE'
    scn.render.resolution_x = scn.render.resolution_y = res
    scn.view_settings.view_transform = 'Standard'
    w = bpy.data.worlds.new('w')
    scn.world = w
    out = {}
    c = Vector((0, 0, height / 2))
    for view in ('front', 'side'):
        # front: from -Y (the figure faces -Y), image right = +X; side: from -X, image right = -Y
        cam.location = c + Vector((0, -5, 0)) if view == 'front' else c + Vector((-5, 0, 0))
        look = c - cam.location
        cam.rotation_euler = look.to_track_quat('-Z', 'Y').to_euler()
        png = os.path.join(out_dir, key, f'{key}_{view}.png')
        scn.render.filepath = png
        bpy.ops.render.render(write_still=True)
        out[view] = (png, span, c)
    return out


MP = {'nose': 0, 'earL': 7, 'earR': 8, 'shL': 11, 'shR': 12, 'elL': 13, 'elR': 14, 'wrL': 15, 'wrR': 16, 'piL': 17,
      'piR': 18, 'inL': 19, 'inR': 20, 'hipL': 23, 'hipR': 24, 'knL': 25, 'knR': 26, 'anL': 27, 'anR': 28, 'heL': 29,
      'heR': 30, 'toL': 31, 'toR': 32}


def joints(key, out_dir=SCANS):
    """3D joint positions of the scan in its normalised frame: x and z from the front view, y from the side view
    (orthographic, so image coordinates map straight to metres). Saved as <key>_joints.json."""
    import json
    import subprocess
    views = render_views(key, out_dir)
    lm = {}
    for view, (png, span, c) in views.items():
        js = png[:-4] + '.json'
        subprocess.run([sys.executable if 'python' in os.path.basename(sys.executable) else 'python3', '-I',
                        os.path.join(HERE, 'pose_landmarks.py'), png, js], check=True)
        with open(js) as fh:
            d = json.load(fh)
        if not d['people']:
            raise RuntimeError(f'no person found in {png}')
        lm[view] = (d['people'][0]['img'], span, c)
    J = {}
    (fi, fs, c), (si, ss, _) = lm['front'], lm['side']
    for name, i in MP.items():
        u, v = fi[i][0], fi[i][1]
        x = (u - 0.5) * fs
        z1 = c.z + (0.5 - v) * fs
        us, vs = si[i][0], si[i][1]
        y = -(us - 0.5) * ss
        z2 = c.z + (0.5 - vs) * ss
        J[name] = [x, y, (z1 + z2) / 2, fi[i][3], si[i][3]]
    path = os.path.join(out_dir, key, f'{key}_joints.json')
    with open(path, 'w') as fh:
        json.dump(J, fh, indent=1)
    print(key, 'joints ->', path, flush=True)
    return J


# ---------------------------------------------------------------- skeleton and skinning

BONES = [  # name, head point, tail point, parent
    ('root', 'pelvis', 'pelvis_up', None),
    ('spine', 'pelvis', 'spine_mid', 'root'),
    ('chest', 'spine_mid', 'neck_base', 'spine'),
    ('neck', 'neck_base', 'head_base', 'chest'),
    ('head', 'head_base', 'head_top', 'neck'),
]
for _s in ('L', 'R'):
    BONES += [
        (f'clavicle.{_s}', f'clav_in{_s}', f'shoulder{_s}', 'chest'),
        (f'upperarm.{_s}', f'shoulder{_s}', f'elbow{_s}', f'clavicle.{_s}'),
        (f'forearm.{_s}', f'elbow{_s}', f'wrist{_s}', f'upperarm.{_s}'),
        (f'hand.{_s}', f'wrist{_s}', f'handtip{_s}', f'forearm.{_s}'),
        (f'thigh.{_s}', f'hip{_s}', f'knee{_s}', 'root'),
        (f'shin.{_s}', f'knee{_s}', f'ankle{_s}', f'thigh.{_s}'),
        (f'foot.{_s}', f'ankle{_s}', f'toe{_s}', f'shin.{_s}'),
    ]


def skeleton_points(J, height):
    """Anatomical joint centres from the surface landmarks."""
    P = {k: Vector(v[:3]) for k, v in J.items()}
    h = height
    up = Vector((0, 0, 1))
    hip_mid = (P['hipL'] + P['hipR']) / 2
    sh_mid = (P['shL'] + P['shR']) / 2
    ear_mid = (P['earL'] + P['earR']) / 2
    Q = {}
    for sd in ('L', 'R'):
        # hip joints sit a little inside and above the landmark (which is near the greater trochanter)
        Q['hip' + sd] = P['hip' + sd].lerp(hip_mid, 0.12) + up * 0.012 * h
        Q['shoulder' + sd] = P['sh' + sd].lerp(sh_mid, 0.06) - up * 0.018 * h
        Q['elbow' + sd] = P['el' + sd]
        Q['wrist' + sd] = P['wr' + sd]
        knuckles = (P['in' + sd] + P['pi' + sd]) / 2
        Q['handtip' + sd] = P['wr' + sd] + (knuckles - P['wr' + sd]) * 1.5
        Q['knee' + sd] = P['kn' + sd]
        Q['ankle' + sd] = P['an' + sd]
        toe = P['to' + sd]
        Q['toe' + sd] = Vector((toe.x, toe.y, min(toe.z, P['an' + sd].z - 0.02 * h)))
    Q['pelvis'] = (Q['hipL'] + Q['hipR']) / 2 + up * 0.02 * h
    Q['pelvis_up'] = Q['pelvis'] + up * 0.06 * h
    Q['neck_base'] = sh_mid - up * 0.012 * h
    Q['spine_mid'] = Q['pelvis'].lerp(Q['neck_base'], 0.48)
    Q['head_base'] = Q['neck_base'].lerp(ear_mid, 0.62)
    Q['head_top'] = Vector((ear_mid.x, ear_mid.y, h - 0.005))
    for sd in ('L', 'R'):
        Q['clav_in' + sd] = Q['neck_base'].lerp(Q['shoulder' + sd], 0.12)
    return Q


def fill_weak_weights(mesh, arm, floor=0.6):
    """Any vertex whose weights sum to less than `floor` (left behind by weighting) goes to its nearest bone
    segment, so nothing stays pinned where the scan stood."""
    segs = [(b.name, b.head_local.copy(), b.tail_local.copy()) for b in arm.bones if b.name != 'root']
    vg = mesh.vertex_groups
    fixed = 0
    for v in mesh.data.vertices:
        tot = sum(g.weight for g in v.groups)
        if tot >= floor:
            continue
        best, bd = None, 1e9
        for name, a, b in segs:
            ab = b - a
            t = max(0.0, min(1.0, (v.co - a).dot(ab) / max(ab.length_squared, 1e-9)))
            d = (a + ab * t - v.co).length
            if d < bd:
                best, bd = name, d
        for g in list(v.groups):
            vg[g.group].remove([v.index])
        vg[best].add([v.index], 1.0, 'REPLACE')
        fixed += 1
    if fixed:
        print(f'  {fixed} weakly weighted vertices given to their nearest bone', flush=True)


def unweighted(mesh, arm):
    used = set()
    for v in mesh.data.vertices:
        for g in v.groups:
            if g.weight > 0.05:
                used.add(g.group)
    return [b.name for b in arm.bones if b.name not in mesh.vertex_groups or mesh.vertex_groups[b.name].index not in used]


def rig(key, out_dir=SCANS):
    """Clay mesh + an armature fitted to its joints, skinned with automatic (heat) weights. Saved as
    <key>_rig.blend."""
    import json
    uid, author, title, up, front, height, voxel = SCAN_SET[key]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    with bpy.data.libraries.load(os.path.join(out_dir, key, f'{key}_clay.blend')) as (src, dst):
        dst.objects = list(src.objects)
    mesh = dst.objects[0]
    bpy.context.scene.collection.objects.link(mesh)
    with open(os.path.join(out_dir, key, f'{key}_joints.json')) as fh:
        J = json.load(fh)
    Q = skeleton_points(J, height)
    arm = bpy.data.armatures.new(f'Rig_{key}')
    ao = bpy.data.objects.new(f'Rig_{key}', arm)
    bpy.context.scene.collection.objects.link(ao)
    bpy.context.view_layer.objects.active = ao
    bpy.ops.object.mode_set(mode='EDIT')
    eb = {}
    for name, a, b, parent in BONES:
        e = arm.edit_bones.new(name)
        e.head, e.tail = Q[a], Q[b]
        if parent:
            e.parent = eb[parent]
            e.use_connect = False
        eb[name] = e
    # rolls: the bone's local X is the hinge axis (elbows and knees bend about it), Z points forward
    for name, e in eb.items():
        e.align_roll(Vector((0, -1, 0)))
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    ao.select_set(True)
    bpy.context.view_layer.objects.active = ao
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    missing = unweighted(mesh, arm)
    if missing:
        # heat weighting failed on the full scan (thin or folded details): weight a coarse closed copy instead and
        # transfer its weights to the full mesh
        print(f'{key}: heat weights failed for {len(missing)} bones; weighting a coarse proxy', flush=True)
        proxy_me = mesh.data.copy()
        proxy = bpy.data.objects.new('proxy', proxy_me)
        bpy.context.scene.collection.objects.link(proxy)
        proxy.vertex_groups.clear()
        rm = proxy.modifiers.new('Remesh', 'REMESH')
        rm.mode, rm.voxel_size = 'VOXEL', 0.006
        dg = bpy.context.evaluated_depsgraph_get()
        pm = bpy.data.meshes.new_from_object(proxy.evaluated_get(dg))
        proxy.modifiers.clear()
        proxy.data = pm
        bpy.ops.object.select_all(action='DESELECT')
        proxy.select_set(True)
        ao.select_set(True)
        bpy.context.view_layer.objects.active = ao
        bpy.ops.object.parent_set(type='ARMATURE_AUTO')
        if unweighted(proxy, arm):
            raise RuntimeError(f'{key}: heat weighting failed on the proxy too')
        mesh.vertex_groups.clear()
        for vg in proxy.vertex_groups:
            mesh.vertex_groups.new(name=vg.name)
        dt = mesh.modifiers.new('Weights', 'DATA_TRANSFER')
        dt.object = proxy
        dt.use_vert_data = True
        dt.data_types_verts = {'VGROUP_WEIGHTS'}
        dt.vert_mapping = 'NEAREST'
        dt.layers_vgroup_select_src = 'ALL'
        dt.layers_vgroup_select_dst = 'NAME'
        bpy.context.view_layer.objects.active = mesh
        bpy.ops.object.select_all(action='DESELECT')
        mesh.select_set(True)
        for m in list(mesh.modifiers):
            if m.type == 'ARMATURE':
                mesh.modifiers.remove(m)
        bpy.ops.object.modifier_apply(modifier=dt.name)
        bpy.data.objects.remove(proxy, do_unlink=True)
        am = mesh.modifiers.new('Armature', 'ARMATURE')
        am.object = ao
        mesh.parent = ao
        missing = unweighted(mesh, arm)
    fill_weak_weights(mesh, arm)
    mod = next(m for m in mesh.modifiers if m.type == 'ARMATURE')
    mod.use_deform_preserve_volume = True
    blend = os.path.join(out_dir, key, f'{key}_rig.blend')
    bpy.data.libraries.write(blend, {mesh, ao, mesh.data, arm}, compress=True)
    print(f'{key}: rigged, {len(mesh.vertex_groups)} groups; check {missing} -> {blend}', flush=True)


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    keys = args[1].split(',') if len(args) > 1 else list(SCAN_SET)
    if args and args[0] == 'fetch':
        for k in keys:
            fetch(k)
    if args and args[0] == 'prepare':
        for k in keys:
            prepare(k)
    if args and args[0] == 'joints':
        for k in keys:
            joints(k)
    if args and args[0] == 'rig':
        for k in keys:
            rig(k)
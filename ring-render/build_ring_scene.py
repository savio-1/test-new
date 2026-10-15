"""Bar-set princess-cut half-eternity ring on charred logs with ember glow.

Run headless:
    blender -b --factory-startup --python build_ring_scene.py -- [--preview] [--samples N] [--out PATH] [--blend PATH]

Builds the whole scene procedurally (ring, stones, logs, fire, lights, camera),
then renders with Cycles. Units: 1 BU = inner ring radius (~8.7 mm).
"""
import bpy
import bmesh
import math
import sys
import numpy as np
from mathutils import Matrix, Vector

# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(name, default=None, cast=str):
    if name in argv:
        i = argv.index(name)
        if i + 1 < len(argv) and not argv[i + 1].startswith("--"):
            return cast(argv[i + 1])
        return True
    return default


PREVIEW = bool(arg("--preview", False))
SAMPLES = arg("--samples", 48 if PREVIEW else 512, int)
SCALE = arg("--scale", 50 if PREVIEW else 200, int)
OUT = arg("--out", "//renders/ring.png")
BLEND = arg("--blend", None)

# --------------------------------------------------------------------------
# Ring parameters
# --------------------------------------------------------------------------
R_IN = 1.0            # inner radius
STONE = 0.40          # princess girdle edge length
CROWN = 0.045         # crown height
PAVILION = 0.27       # pavilion depth
R_GIRDLE = 1.32       # radius of girdle plane
BAR_T = 0.062         # bar thickness (tangential)
BAR_OVER = 0.022      # bar overhang past band edge (axial)
BAR_TOP = 0.035       # bar height above table
BAND_W = STONE + 0.02 # axial width of band / rails
RAIL_W = 0.085        # axial width of each rail
RAIL_T = 0.115        # radial thickness of rails
N_STONES = 10
PITCH = (STONE + BAR_T + 0.012) / R_GIRDLE   # radians between stones
N_SHANK_BARS = 4

# --------------------------------------------------------------------------
# Scene reset
# --------------------------------------------------------------------------
for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
    for block in list(coll):
        coll.remove(block)

scene = bpy.context.scene


def link(ob):
    scene.collection.objects.link(ob)
    return ob


# --------------------------------------------------------------------------
# Materials
# --------------------------------------------------------------------------
def node_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    return m, nt, out


def mat_metal():
    m, nt, out = node_mat("WhiteGold")
    p = nt.nodes.new("ShaderNodeBsdfPrincipled")
    p.inputs["Base Color"].default_value = (0.91, 0.90, 0.88, 1)
    p.inputs["Metallic"].default_value = 1.0
    p.inputs["Roughness"].default_value = 0.06
    nt.links.new(p.outputs[0], out.inputs[0])
    return m


def mat_diamond():
    m, nt, out = node_mat("Diamond")
    g = nt.nodes.new("ShaderNodeBsdfGlass")
    g.distribution = "SHARP" if "SHARP" in g.bl_rna.properties["distribution"].enum_items.keys() else g.distribution
    g.inputs["Color"].default_value = (1, 1, 1, 1)
    g.inputs["Roughness"].default_value = 0.0
    g.inputs["IOR"].default_value = 2.417
    nt.links.new(g.outputs[0], out.inputs[0])
    return m


def mat_char(name, ember=0.0, wood_mix=0.0, block_tint=(0.016, 0.014, 0.013)):
    """Charred wood: blocks + cracks from vertex attributes, embers in cracks."""
    m, nt, out = node_mat(name)
    N = nt.nodes
    L = nt.links

    crack = N.new("ShaderNodeAttribute"); crack.attribute_name = "crack"
    crand = N.new("ShaderNodeAttribute"); crand.attribute_name = "cellrand"
    glow = N.new("ShaderNodeAttribute"); glow.attribute_name = "glow"

    # Base colour: charcoal blocks with slight variation, black cracks
    blk = N.new("ShaderNodeMix"); blk.data_type = "RGBA"
    blk.inputs["A"].default_value = (block_tint[0] * 0.55, block_tint[1] * 0.55, block_tint[2] * 0.55, 1)
    blk.inputs["B"].default_value = (block_tint[0] * 1.6, block_tint[1] * 1.5, block_tint[2] * 1.45, 1)
    L.new(crand.outputs["Fac"], blk.inputs["Factor"])

    col = N.new("ShaderNodeMix"); col.data_type = "RGBA"
    col.inputs["A"].default_value = (0.004, 0.0035, 0.003, 1)
    L.new(crack.outputs["Fac"], col.inputs["Factor"])
    L.new(blk.outputs["Result"], col.inputs["B"])
    base = col.outputs["Result"]

    if wood_mix > 0:
        # Unburnt split wood showing through (lighter brown fibrous grain)
        tc = N.new("ShaderNodeTexCoord")
        wave = N.new("ShaderNodeTexWave")
        wave.wave_type = "BANDS"; wave.bands_direction = "Z"
        wave.inputs["Scale"].default_value = 9.0
        wave.inputs["Distortion"].default_value = 6.0
        wave.inputs["Detail"].default_value = 6.0
        wave.inputs["Detail Scale"].default_value = 1.5
        L.new(tc.outputs["Object"], wave.inputs["Vector"])
        wr = N.new("ShaderNodeValToRGB")
        wr.color_ramp.elements[0].color = (0.06, 0.028, 0.012, 1)
        wr.color_ramp.elements[1].color = (0.20, 0.10, 0.05, 1)
        L.new(wave.outputs["Fac"], wr.inputs["Fac"])
        wm = N.new("ShaderNodeAttribute"); wm.attribute_name = "woodmask"
        mixw = N.new("ShaderNodeMix"); mixw.data_type = "RGBA"
        L.new(wm.outputs["Fac"], mixw.inputs["Factor"])
        L.new(base, mixw.inputs["A"])
        L.new(wr.outputs["Color"], mixw.inputs["B"])
        base = mixw.outputs["Result"]

    p = N.new("ShaderNodeBsdfPrincipled")
    L.new(base, p.inputs["Base Color"])
    rough = N.new("ShaderNodeMapRange")
    rough.inputs["To Min"].default_value = 0.95
    rough.inputs["To Max"].default_value = 0.42
    L.new(crack.outputs["Fac"], rough.inputs["Value"])
    L.new(rough.outputs["Result"], p.inputs["Roughness"])
    p.inputs["Specular IOR Level"].default_value = 0.35

    # Fine scaly bump on the block surfaces
    tc2 = N.new("ShaderNodeTexCoord")
    nz = N.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 28.0
    nz.inputs["Detail"].default_value = 8.0
    nz.inputs["Roughness"].default_value = 0.65
    L.new(tc2.outputs["Object"], nz.inputs["Vector"])
    bump = N.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.35
    bump.inputs["Distance"].default_value = 0.01
    L.new(nz.outputs["Fac"], bump.inputs["Height"])
    L.new(bump.outputs["Normal"], p.inputs["Normal"])

    if ember > 0:
        # Ember glow concentrated in cracks, modulated by per-vertex glow mask
        inv = N.new("ShaderNodeMath"); inv.operation = "SUBTRACT"
        inv.inputs[0].default_value = 1.0
        L.new(crack.outputs["Fac"], inv.inputs[1])
        pw = N.new("ShaderNodeMath"); pw.operation = "POWER"
        pw.inputs[1].default_value = 2.0
        L.new(inv.outputs[0], pw.inputs[0])
        g2 = N.new("ShaderNodeMath"); g2.operation = "MULTIPLY"
        L.new(pw.outputs[0], g2.inputs[0])
        L.new(glow.outputs["Fac"], g2.inputs[1])
        # Also let fully glowing areas light up the block faces a little
        g3 = N.new("ShaderNodeMath"); g3.operation = "MULTIPLY_ADD"
        L.new(glow.outputs["Fac"], g3.inputs[0])
        g3.inputs[1].default_value = 0.12
        L.new(g2.outputs[0], g3.inputs[2])
        st = N.new("ShaderNodeMath"); st.operation = "MULTIPLY"
        st.inputs[1].default_value = ember
        L.new(g3.outputs[0], st.inputs[0])
        bb = N.new("ShaderNodeBlackbody")
        bb.inputs["Temperature"].default_value = 1350
        L.new(bb.outputs["Color"], p.inputs["Emission Color"])
        L.new(st.outputs[0], p.inputs["Emission Strength"])

    L.new(p.outputs[0], out.inputs[0])
    return m


def mat_emit(name, strength, temp=1300):
    m, nt, out = node_mat(name)
    e = nt.nodes.new("ShaderNodeEmission")
    bb = nt.nodes.new("ShaderNodeBlackbody")
    bb.inputs["Temperature"].default_value = temp
    nt.links.new(bb.outputs[0], e.inputs["Color"])
    e.inputs["Strength"].default_value = strength
    nt.links.new(e.outputs[0], out.inputs[0])
    return m


M_METAL = mat_metal()
M_DIAMOND = mat_diamond()

# --------------------------------------------------------------------------
# Ring geometry (built in ring-local space: axis = +Y, stone centre at +Z)
# --------------------------------------------------------------------------
def frame_at(theta, r):
    """Matrix mapping local (x=axis, y=tangent, z=radial) to ring space at angle theta."""
    d = Vector((math.sin(theta), 0, math.cos(theta)))
    t = Vector((math.cos(theta), 0, -math.sin(theta)))
    a = Vector((0, 1, 0))
    m = Matrix((
        (a.x, t.x, d.x, d.x * r),
        (a.y, t.y, d.y, d.y * r),
        (a.z, t.z, d.z, d.z * r),
        (0, 0, 0, 1),
    ))
    return m


def add_box(bm, mat, x0, x1, y0, y1, z0, z1):
    vs = []
    for x, y, z in [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
                    (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]:
        vs.append(bm.verts.new(mat @ Vector((x, y, z))))
    for f in [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]:
        bm.faces.new([vs[i] for i in f])


def add_rail_arc(bm, y0, y1, r0, r1, a0, a1, segs):
    """Rectangular-section arc from angle a0 to a1 (closed ring if full circle)."""
    full = abs((a1 - a0) - 2 * math.pi) < 1e-6
    n = segs if full else segs + 1
    rings = []
    for i in range(n):
        th = a0 + (a1 - a0) * i / segs
        s, c = math.sin(th), math.cos(th)
        rings.append([bm.verts.new((s * r, y, c * r)) for (y, r) in
                      [(y0, r0), (y1, r0), (y1, r1), (y0, r1)]])
    for i in range(n if full else n - 1):
        A, B = rings[i], rings[(i + 1) % n]
        for k in range(4):
            bm.faces.new([A[k], A[(k + 1) % 4], B[(k + 1) % 4], B[k]])
    if not full:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])


def princess_mesh():
    h = STONE / 2

    def loop(z, corner, mid):
        pts = []
        for k in range(8):
            ang = k * math.pi / 4
            if k % 2 == 0:   # edge midpoints
                pts.append((math.cos(ang) * mid, math.sin(ang) * mid, z))
            else:            # corners
                sx = 1 if math.cos(ang) > 0 else -1
                sy = 1 if math.sin(ang) > 0 else -1
                pts.append((sx * corner, sy * corner, z))
        return pts

    g = 0.006
    loops = [
        loop(CROWN, 0.76 * h, 0.76 * h),             # table
        loop(CROWN * 0.55, 0.93 * h, 0.90 * h),     # upper crown break
        loop(g, h, h),                               # girdle top
        loop(-g, h, h),                              # girdle bottom
        loop(-PAVILION * 0.30, 0.74 * h, 0.80 * h), # pavilion tier 1 (chevrons)
        loop(-PAVILION * 0.62, 0.42 * h, 0.36 * h), # pavilion tier 2
        loop(-PAVILION * 0.86, 0.14 * h, 0.17 * h), # pavilion tier 3
    ]
    bm = bmesh.new()
    vl = [[bm.verts.new(p) for p in lp] for lp in loops]
    table = bm.faces.new(vl[0])                      # table
    for A, B in zip(vl[:-1], vl[1:]):
        for k in range(8):
            bm.faces.new([A[k], B[k], B[(k + 1) % 8], A[(k + 1) % 8]])
    culet = bm.verts.new((0, 0, -PAVILION))
    for k in range(8):
        bm.faces.new([vl[-1][k], culet, vl[-1][(k + 1) % 8]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3 and f != table])
    me = bpy.data.meshes.new("Princess")
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = False
    me.materials.append(M_DIAMOND)
    return me


ring_root = link(bpy.data.objects.new("RingRoot", None))
RING_COLL = bpy.data.collections.new("RingParts")
STONE_COLL = bpy.data.collections.new("StoneParts")

# Stones
stone_me = princess_mesh()
thetas = [(i - (N_STONES - 1) / 2) * PITCH for i in range(N_STONES)]
for i, th in enumerate(thetas):
    ob = link(bpy.data.objects.new(f"Stone.{i:02d}", stone_me))
    ob.matrix_world = frame_at(th, R_GIRDLE)
    ob.parent = ring_root
    RING_COLL.objects.link(ob)
    STONE_COLL.objects.link(ob)

# Metal: bars, rails, shank crossbars in one mesh
bm = bmesh.new()
half_w = BAND_W / 2
r_bar_top = R_GIRDLE + CROWN + BAR_TOP
bar_thetas = [thetas[0] - PITCH / 2] + [t + PITCH / 2 for t in thetas]
for th in bar_thetas:
    M = frame_at(th, 0.0)
    # Bar: full-height radial plate with a slightly fuller cap above the girdle
    add_box(bm, M, -half_w - BAR_OVER, half_w + BAR_OVER, -BAR_T / 2, BAR_T / 2,
            R_IN + 0.01, r_bar_top)
# Rails (full circle, two edges of the band)
add_rail_arc(bm, -half_w, -half_w + RAIL_W, R_IN, R_IN + RAIL_T, 0, 2 * math.pi, 256)
add_rail_arc(bm, half_w - RAIL_W, half_w, R_IN, R_IN + RAIL_T, 0, 2 * math.pi, 256)
# Shank crossbars (ladder)
sh0 = bar_thetas[-1]
sh1 = bar_thetas[0] + 2 * math.pi
for k in range(1, N_SHANK_BARS + 1):
    th = sh0 + (sh1 - sh0) * k / (N_SHANK_BARS + 1)
    add_box(bm, frame_at(th, 0.0), -half_w + 0.01, half_w - 0.01, -0.03, 0.03,
            R_IN, R_IN + RAIL_T)
metal_me = bpy.data.meshes.new("Metal")
bm.to_mesh(metal_me)
bm.free()
metal_me.materials.append(M_METAL)
for p in metal_me.polygons:
    p.use_smooth = True
metal = link(bpy.data.objects.new("Metal", metal_me))
metal.parent = ring_root
RING_COLL.objects.link(metal)
bev = metal.modifiers.new("Bevel", "BEVEL")
bev.width = 0.012
bev.segments = 4
bev.limit_method = "ANGLE"
bev.angle_limit = math.radians(40)
bev.harden_normals = True

# Ring orientation in the world (camera looks along +Y, image up = +Z)
MAJ = math.radians(arg("--major", 50.0, float))    # ellipse major-axis angle in image
TILT = math.radians(arg("--tilt", 18.0, float))    # ring axis tilt toward camera
SHIFT = math.radians(arg("--shift", 15.0, float))  # stone arc shift toward top-right
u = Vector((math.cos(MAJ), 0, math.sin(MAJ)))
m_img = Vector((math.sin(MAJ), 0, -math.cos(MAJ)))
n = (m_img * math.cos(TILT) + Vector((0, -1, 0)) * math.sin(TILT)).normalized()
near = n.cross(u).normalized()
if near.y > 0:
    near = -near
c = (near * math.cos(SHIFT) + u * math.sin(SHIFT)).normalized()
c = (c - n * c.dot(n)).normalized()
x_ax = n.cross(c)
rot = Matrix((
    (x_ax.x, n.x, c.x),
    (x_ax.y, n.y, c.y),
    (x_ax.z, n.z, c.z),
)).to_4x4()
ring_root.matrix_world = Matrix.Translation(Vector((arg("--rx", 0.0, float), 0, arg("--rz", 0.0, float)))) @ rot

# --------------------------------------------------------------------------
# Charred logs (numpy-generated geometry with Voronoi alligator cracks)
# --------------------------------------------------------------------------
def _hash2(a, b, seed):
    a = a.astype(np.uint32); b = b.astype(np.uint32)
    h = (a * np.uint32(374761393) + b * np.uint32(668265263) + np.uint32(seed * 2654435761 & 0xffffffff))
    h = (h ^ (h >> np.uint32(13))) * np.uint32(1274126177)
    h = h ^ (h >> np.uint32(16))
    return h


def voronoi(U, V, period_v, seed):
    iu = np.floor(U).astype(np.int64)
    iv = np.floor(V).astype(np.int64)
    fu = U - iu
    fv = V - iv
    F1 = np.full(U.shape, 9.0)
    F2 = np.full(U.shape, 9.0)
    ID = np.zeros(U.shape, dtype=np.uint32)
    for du in (-1, 0, 1):
        for dv in (-1, 0, 1):
            cu = iu + du
            cv = np.mod(iv + dv, period_v)
            h = _hash2(cu + 100000, cv + 100000, seed)
            jx = (h & np.uint32(0xffff)).astype(np.float64) / 65535.0
            jy = ((h >> np.uint32(16)) & np.uint32(0xffff)).astype(np.float64) / 65535.0
            px = du + 0.1 + 0.8 * jx
            py = dv + 0.1 + 0.8 * jy
            d = np.sqrt((px - fu) ** 2 + (py - fv) ** 2)
            closer = d < F1
            F2 = np.where(closer, F1, np.minimum(F2, d))
            ID = np.where(closer, h, ID)
            F1 = np.where(closer, d, F1)
    return F1, F2, ID


def smooth_noise(P, seed, freqs=((0.6, 1.0), (1.3, 0.45), (2.9, 0.2))):
    rng = np.random.default_rng(seed)
    out = np.zeros(P.shape[0])
    for f, amp in freqs:
        for _ in range(3):
            d = rng.normal(size=3); d /= np.linalg.norm(d)
            ph = rng.uniform(0, 2 * math.pi)
            out += amp * np.sin(f * (P @ d) * 2 + ph) / 3
    return out


def make_log(name, center, axis, radius, length, cell=0.16, nu=None, nv=None,
             seed=1, crack_depth=0.06, mat=None, glow_fn=None, wood_fn=None, bulge=0.10):
    axis = Vector(axis).normalized()
    ref = Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))
    e1 = axis.cross(ref).normalized()
    e2 = axis.cross(e1).normalized()
    circ = 2 * math.pi * radius
    cells_v = max(6, int(round(circ / cell)))
    cells_u = length / (cell * 1.35)
    nv = nv or int(cells_v * 9)
    nu = nu or int(cells_u * 9)
    s = np.linspace(-length / 2, length / 2, nu)
    t = np.linspace(0, 2 * math.pi, nv, endpoint=False)
    S, T = np.meshgrid(s, t, indexing="ij")
    U = (S / length + 0.5) * cells_u
    V = T / (2 * math.pi) * cells_v
    F1, F2, ID = voronoi(U, V, cells_v, seed)
    edge = F2 - F1
    width = 0.10 + 0.12 * (((ID >> np.uint32(17)) & np.uint32(255)).astype(np.float64) / 255.0)
    crack = np.clip(edge / width, 0, 1)
    crack_profile = crack ** 0.55
    cellrand = ((ID >> np.uint32(5)) & np.uint32(1023)).astype(np.float64) / 1023.0
    ax = np.array(axis); a1 = np.array(e1); a2 = np.array(e2)
    base_pts = (S[..., None] * ax + np.cos(T)[..., None] * a1 * radius + np.sin(T)[..., None] * a2 * radius)
    flat = base_pts.reshape(-1, 3)
    low = smooth_noise(flat / radius, seed).reshape(S.shape)
    rr = radius * (1 + bulge * low) + crack_depth * (crack_profile - 1.0) + crack_depth * 0.35 * (cellrand - 0.5)
    # taper ends slightly
    pts = (S[..., None] * ax + (np.cos(T) * rr)[..., None] * a1 + (np.sin(T) * rr)[..., None] * a2)
    pts = pts + np.array(center)
    verts = pts.reshape(-1, 3)

    idx = np.arange(nu * nv).reshape(nu, nv)
    a = idx[:-1, :]
    b = idx[1:, :]
    c_ = np.roll(idx, -1, axis=1)[1:, :]
    d = np.roll(idx, -1, axis=1)[:-1, :]
    quads = np.stack([a, d, c_, b], axis=-1).reshape(-1, 4)

    me = bpy.data.meshes.new(name)
    me.vertices.add(len(verts))
    me.vertices.foreach_set("co", verts.astype(np.float32).ravel())
    me.loops.add(quads.size)
    me.loops.foreach_set("vertex_index", quads.astype(np.int32).ravel())
    me.polygons.add(len(quads))
    me.polygons.foreach_set("loop_start", (np.arange(len(quads)) * 4).astype(np.int32))
    me.polygons.foreach_set("loop_total", np.full(len(quads), 4, dtype=np.int32))
    me.update(calc_edges=True)
    me.validate()
    me.polygons.foreach_set("use_smooth", np.ones(len(quads), dtype=bool))

    def attr(nm, vals):
        at = me.attributes.new(nm, "FLOAT", "POINT")
        at.data.foreach_set("value", vals.astype(np.float32).ravel())

    attr("crack", crack)
    attr("cellrand", cellrand)
    if glow_fn is not None:
        attr("glow", glow_fn(verts, cellrand.ravel(), S.ravel(), T.ravel()))
    else:
        attr("glow", np.zeros(len(verts)))
    if wood_fn is not None:
        attr("woodmask", wood_fn(verts, cellrand.ravel(), S.ravel(), T.ravel()))
    me.materials.append(mat)
    ob = link(bpy.data.objects.new(name, me))
    return ob


def glow_near(point, falloff, gain=1.0, cut=0.0):
    p = np.array(point)

    def fn(verts, cellrand, S, T):
        d = np.linalg.norm(verts - p, axis=1)
        g = np.exp(-(d / falloff) ** 2) * gain
        g = g * (0.35 + 0.65 * cellrand)
        return np.clip(g - cut, 0, None)
    return fn


M_CHAR = mat_char("Charcoal", ember=0.0)
M_CHAR_EMBER = mat_char("CharcoalEmber", ember=arg("--ember", 4.0, float))
M_CHAR_BROWN = mat_char("CharcoalSplit", ember=0.0, wood_mix=1.0, block_tint=(0.020, 0.016, 0.014))

FIRE = Vector((0.25, 2.2, -1.6))   # heart of the ember bed, behind/below the ring

# Right log the ring leans on (in focus near the ring)
make_log("LogRight", center=(3.0, 1.5, 0.3), axis=(0.30, 0.25, 1.0), radius=1.75, length=9,
         cell=0.17, seed=3, crack_depth=0.07, mat=M_CHAR_BROWN,
         glow_fn=None,
         wood_fn=lambda v, cr, S, T: np.clip((-(v[:, 2]) - 0.15) * 1.2, 0, 1) * np.clip((v[:, 0] - 0.4) * 2, 0, 1) * (0.55 + 0.45 * cr))
# Lower right split chunk (lighter fibrous wood)
make_log("LogRightLow", center=(2.1, -0.4, -2.4), axis=(1.0, 0.7, -0.15), radius=1.15, length=7,
         cell=0.15, seed=5, crack_depth=0.06, mat=M_CHAR_BROWN,
         wood_fn=lambda v, cr, S, T: np.clip(0.35 + 0.65 * cr, 0, 1) * np.clip(v[:, 0] - 0.2, 0, 1))
# Log under the ring
make_log("LogBottom", center=(0.4, 0.7, -2.25), axis=(1.0, -0.35, 0.12), radius=0.95, length=7,
         cell=0.15, seed=7, crack_depth=0.06, mat=M_CHAR_EMBER,
         glow_fn=glow_near(FIRE + Vector((-0.3, -1.2, 0.2)), 1.5, gain=1.2, cut=0.15))
# Big left log
make_log("LogLeft", center=(-2.6, 0.6, -1.25), axis=(0.55, 0.9, 0.42), radius=1.45, length=9,
         cell=0.17, seed=11, crack_depth=0.07, mat=M_CHAR_EMBER,
         glow_fn=glow_near(Vector((-0.5, 0.2, -1.8)), 1.1, gain=1.4, cut=0.2))
# Background log across the top (out of focus)
make_log("LogBack", center=(-0.6, 5.5, 2.4), axis=(1.0, 0.25, -0.30), radius=2.0, length=14,
         cell=0.26, seed=13, crack_depth=0.08, mat=M_CHAR_EMBER,
         glow_fn=glow_near(Vector((0.8, 4.5, 0.5)), 1.6, gain=0.9, cut=0.1))
# Background log on the left behind
make_log("LogBackLeft", center=(-3.2, 4.0, 0.0), axis=(0.8, 0.6, 0.25), radius=1.5, length=10,
         cell=0.24, seed=17, crack_depth=0.07, mat=M_CHAR_EMBER,
         glow_fn=glow_near(Vector((-0.8, 3.5, -1.0)), 1.6, gain=1.0, cut=0.1))
# Ember bed behind the ring (bright, will be heavily defocused)
make_log("EmberBed", center=(0.6, 3.6, -2.3), axis=(1.0, 0.15, 0.0), radius=1.0, length=6,
         cell=0.20, seed=19, crack_depth=0.08, mat=M_CHAR_EMBER,
         glow_fn=glow_near(Vector((0.4, 3.0, -1.4)), 1.8, gain=2.5, cut=0.0))

# Soft glowing core behind the ring hole (hidden from direct reflections cost)
glow_core = bpy.data.meshes.new("GlowCore")
bmg = bmesh.new()
bmesh.ops.create_uvsphere(bmg, u_segments=24, v_segments=12, radius=1.0)
bmg.to_mesh(glow_core); bmg.free()
gc = link(bpy.data.objects.new("GlowCore", glow_core))
gc.location = (0.55, 3.4, -0.9)
gc.scale = (1.0, 0.4, 1.4)
glow_core.materials.append(mat_emit("GlowCoreMat", arg("--core", 1.2, float), 1250))
gc.visible_shadow = False

# --------------------------------------------------------------------------
# Lights
# --------------------------------------------------------------------------
def area(name, loc, target, size, power, color=(1, 1, 1), shape="RECTANGLE", size_y=None, camera=False, only=None):
    ld = bpy.data.lights.new(name, "AREA")
    ld.energy = power
    ld.color = color
    ld.shape = shape
    ld.size = size
    if size_y:
        ld.size_y = size_y
    ob = link(bpy.data.objects.new(name, ld))
    ob.location = loc
    direction = Vector(target) - Vector(loc)
    ob.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    ob.visible_camera = camera
    if only is not None:
        ob.light_linking.receiver_collection = only
    return ob


def point(name, loc, power, color, radius=0.3):
    ld = bpy.data.lights.new(name, "POINT")
    ld.energy = power
    ld.color = color
    ld.shadow_soft_size = radius
    ob = link(bpy.data.objects.new(name, ld))
    ob.location = loc
    return ob


WARM = (1.0, 0.42, 0.10)
# Ring-only studio lights (light-linked so the charcoal stays dark)
area("Key", (-4.5, -6.0, 6.0), (0, 0, 0.2), 2.5, arg("--key", 1400, float), (1.0, 0.97, 0.93), size_y=1.2, only=RING_COLL)
area("TopStrip", (0.5, -2.5, 6.5), (0, 0, 0), 5.0, 500, (1.0, 0.98, 0.95), size_y=0.35, only=RING_COLL)
area("FillCard", (4.0, -6.5, 1.0), (0, 0, 0), 1.5, 120, (0.95, 0.97, 1.0), only=RING_COLL)
# Diamond scintillation cards: many small strips around the camera hemisphere
rng_c = np.random.default_rng(42)
for i in range(14):
    az = rng_c.uniform(-2.4, 2.4)
    el = rng_c.uniform(0.15, 1.3)
    rad = 7.0
    loc = (rad * math.sin(az) * math.cos(el), -rad * math.cos(az) * math.cos(el), rad * math.sin(el))
    area(f"Spark.{i:02d}", loc, (0, 0, 0), rng_c.uniform(0.15, 0.5), rng_c.uniform(60, 220),
         (1.0, 0.98, 0.95), size_y=rng_c.uniform(0.6, 1.8), only=STONE_COLL)
# Weak warm-white grazing light for the charcoal texture
area("LogKey", (-6.0, -3.0, 6.5), (0, 1.5, -0.5), 3.0, arg("--logkey", 220, float), (1.0, 0.85, 0.70))
# Fire glow from below/behind the ring
point("FireCore", tuple(FIRE), arg("--fire", 260, float), WARM, 0.8)
point("FireLow", (0.0, 0.6, -1.9), 40, WARM, 0.5)
point("FireRight", (1.1, 1.6, 0.4), 30, (1.0, 0.45, 0.12), 0.4)
point("FireBack", (0.8, 4.0, 0.6), 120, (1.0, 0.38, 0.08), 1.0)

# World: near-black warm
world = bpy.data.worlds.new("World") if not scene.world else scene.world
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes.get("Background")
bg.inputs["Color"].default_value = (0.004, 0.0025, 0.0015, 1)
bg.inputs["Strength"].default_value = 1.0

# --------------------------------------------------------------------------
# Camera
# --------------------------------------------------------------------------
cam_d = bpy.data.cameras.new("Camera")
cam_d.lens = 100
cam_d.sensor_width = 36
cam = link(bpy.data.objects.new("Camera", cam_d))
cam.location = (arg("--cx", 0.05, float), -arg("--dist", 9.8, float), arg("--cz", 0.15, float))
cam.rotation_euler = (math.radians(90 + arg("--pitch", 0.0, float)), 0, 0)
scene.camera = cam
focus = link(bpy.data.objects.new("Focus", None))
focus.location = (-0.15, -0.35, 0.2)
cam_d.dof.use_dof = True
cam_d.dof.focus_object = focus
cam_d.dof.aperture_fstop = arg("--fstop", 0.6, float)
cam_d.dof.aperture_blades = 7

# --------------------------------------------------------------------------
# Render settings
# --------------------------------------------------------------------------
scene.render.engine = "CYCLES"
cy = scene.cycles
cy.device = "CPU"
cy.samples = SAMPLES
cy.use_adaptive_sampling = True
cy.adaptive_threshold = 0.02 if PREVIEW else 0.006
cy.use_denoising = True
try:
    cy.denoiser = "OPENIMAGEDENOISE"
except Exception:
    pass
cy.max_bounces = 32
cy.diffuse_bounces = 3
cy.glossy_bounces = 16
cy.transmission_bounces = 24
cy.transparent_max_bounces = 8
cy.caustics_reflective = False
cy.caustics_refractive = False
cy.blur_glossy = 0.5
cy.sample_clamp_indirect = 12.0
scene.render.resolution_x = 728
scene.render.resolution_y = 756
scene.render.resolution_percentage = SCALE
scene.render.film_transparent = False
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_depth = "8"
try:
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = arg("--look", "AgX - Medium High Contrast")
except Exception as e:
    print("colour management:", e)
scene.view_settings.exposure = arg("--exposure", 0.0, float)

scene.render.filepath = OUT
if BLEND:
    bpy.context.preferences.filepaths.use_file_compression = True
    bpy.ops.wm.save_as_mainfile(filepath=BLEND, compress=True)
if not arg("--no-render", False):
    bpy.ops.render.render(write_still=True)
    print("RENDERED", bpy.path.abspath(OUT))

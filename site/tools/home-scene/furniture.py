"""
Upholstered and solid-wood pieces for the warm modern look of the v2 reference images (round 3): plush rounded
cushions, a deep sofa, a reclining armchair, upholstered dining chairs, a round drum coffee table, wooden bar
stools, a donut cat bed, a woven pouf and a ceramic table lamp. Built from code like the rest of the home.

Every piece is made of soft blocks: a subdivided box whose corners are rounded to a radius and whose faces can
puff out like a filled cushion.
"""

import math

import bmesh
import bpy
from mathutils import Matrix, Vector

H = None  # build_home, set by build_home before use


def soft_block(name, size, mat, r=0.04, puff=(0.0, 0.0, 0.0), cuts=8, loc=(0, 0, 0), rot=(0, 0, 0), parent=None,
               sag=0.0, coll='Home'):
    """A rounded box (radius r) of the given full size; puff[i] bulges the two faces normal to axis i outward at
    their centre by that many metres (a filled cushion); sag dips the top face's centre (a sat-in seat)."""
    hx, hy, hz = (s / 2 for s in size)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True)
    half = Vector((hx, hy, hz))
    core = Vector((max(hx - r, 1e-4), max(hy - r, 1e-4), max(hz - r, 1e-4)))
    for v in bm.verts:
        p = Vector((v.co.x * hx, v.co.y * hy, v.co.z * hz))
        c = Vector((max(-core.x, min(core.x, p.x)), max(-core.y, min(core.y, p.y)), max(-core.z, min(core.z, p.z))))
        d = p - c
        q = c + (d.normalized() * r if d.length > 1e-6 else d)
        u = [v.co.x, v.co.y, v.co.z]  # -1..1 across each axis
        for i in range(3):
            if puff[i]:
                j, k = [a for a in range(3) if a != i]
                w = max(0.0, 1 - u[j] ** 2) * max(0.0, 1 - u[k] ** 2)
                q[i] += math.copysign(puff[i] * w, u[i]) if abs(u[i]) > 0.5 else 0.0
        if sag and u[2] > 0.5:
            q.z -= sag * max(0.0, 1 - u[0] ** 2) * max(0.0, 1 - u[1] ** 2)
        v.co = q
    o = H.obj_from_bm(name, bm, mat, coll, smooth=True)
    sub = o.modifiers.new('Soft', 'SUBSURF')
    sub.levels = sub.render_levels = 1
    o.location = loc
    o.rotation_euler = rot
    if parent is not None:
        o.parent = parent
    return o


def pillow(name, w, h, t, mat, loc, rot=(0, 0, 0), parent=None, coll='Home'):
    """A throw pillow: thick in the middle, pinched to thin corners, seams slightly piped."""
    bm = bmesh.new()
    n = 14
    grid = {}
    for side in (-1, 1):
        for i in range(n + 1):
            for j in range(n + 1):
                x, z = i / n * 2 - 1, j / n * 2 - 1
                fill = (1 - x * x) ** 0.6 * (1 - z * z) ** 0.6
                # corners pull in a little, as a filled cushion does
                pinch = 0.06 * (x * x * z * z)
                grid[side, i, j] = bm.verts.new((x * w / 2 * (1 - pinch), side * (t / 2 * fill + 0.004), z * h / 2 * (1 - pinch)))
    for side in (-1, 1):
        for i in range(n):
            for j in range(n):
                q = [grid[side, i, j], grid[side, i + 1, j], grid[side, i + 1, j + 1], grid[side, i, j + 1]]
                bm.faces.new(q if side > 0 else q[::-1])
    # close the seam
    ring = [(i, 0) for i in range(n)] + [(n, j) for j in range(n)] + [(i, n) for i in range(n, 0, -1)] + [(0, j) for j in range(n, 0, -1)]
    for a, b in zip(ring, ring[1:] + ring[:1]):
        try:
            bm.faces.new((grid[-1, a[0], a[1]], grid[-1, b[0], b[1]], grid[1, b[0], b[1]], grid[1, a[0], a[1]]))
        except ValueError:
            pass
    o = H.obj_from_bm(name, bm, mat, coll, smooth=True)
    sub = o.modifiers.new('Soft', 'SUBSURF')
    sub.levels = sub.render_levels = 1
    o.location = loc
    o.rotation_euler = rot
    if parent is not None:
        o.parent = parent
    return o


def pivot(name, loc, rot_z=0.0, coll='Home'):
    p = bpy.data.objects.new(name, None)
    H.coll(coll).objects.link(p)
    p.location = loc
    p.rotation_euler = (0, 0, rot_z)
    return p


def sofa(M, sx, sy, width=2.5, depth=1.0):
    """Deep three-seater facing +Y: low wide rounded arms, plump seat cushions, soft back cushions leaning back.
    Names Sofa_Seat_i / Sofa_Back_i are kept (the track box and the poses use them). Seat tops at ~0.46 m."""
    fab = M['sofa']
    inner = width - 2 * 0.26
    parts = []
    parts.append(soft_block('Sofa_Base', (width - 0.04, depth - 0.04, 0.24), fab, r=0.05, loc=(sx, sy, 0.17)))
    parts.append(soft_block('Sofa_BackFrame', (inner + 0.04, 0.2, 0.62), fab, r=0.06, loc=(sx, sy - depth / 2 + 0.1, 0.55)))
    for side in (-1, 1):
        parts.append(soft_block(f'Sofa_Arm_{side}', (0.26, depth, 0.36), fab, r=0.075, puff=(0.006, 0, 0.012),
                                loc=(sx + side * (width / 2 - 0.13), sy, 0.47)))
    seat_w = inner / 3
    for i in range(3):
        x = sx - inner / 2 + seat_w * (i + 0.5)
        parts.append(soft_block(f'Sofa_Seat_{i}', (seat_w - 0.01, depth - 0.25, 0.17), fab, r=0.045, puff=(0, 0.006, 0.012),
                                sag=0.012 if i != 1 else 0.0, loc=(x, sy + 0.1, 0.375)))
        b = soft_block(f'Sofa_Back_{i}', (seat_w - 0.01, 0.22, 0.5), fab, r=0.06, puff=(0, 0.018, 0.008),
                       loc=(x, sy - depth / 2 + 0.3, 0.7), rot=(math.radians(-11), 0, 0))
        parts.append(b)
    for i, (xx, yy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        H.cyl(f'Sofa_Leg_{i}', 0.022, 0.05, (sx + xx * (width / 2 - 0.12), sy + yy * (depth / 2 - 0.1), 0.025), M['walnut'])
    return parts


def armchair(M, ax, ay, rot_deg):
    """A plush reclining armchair (local front -Y): tall back in three channelled pads, rolled arms, a thick
    seat cushion. Seat top ~0.47 m."""
    fab = M['armchair']
    pv = pivot('Armchair', (ax, ay, 0.0), math.radians(rot_deg))
    parts = []

    def sb(nm, size, loc, r, puff=(0, 0, 0), rot=(0, 0, 0), sag=0.0):
        o = soft_block(nm, size, fab, r=r, puff=puff, loc=loc, rot=rot, parent=pv, sag=sag)
        parts.append(o)
        return o
    sb('Arm_Base', (0.86, 0.86, 0.26), (0, 0.02, 0.2), 0.05)
    sb('Arm_Seat', (0.56, 0.66, 0.16), (0, -0.04, 0.4), 0.06, puff=(0, 0.01, 0.025), sag=0.015)
    for side in (-1, 1):
        sb(f'Arm_Arm{"L" if side < 0 else "R"}', (0.17, 0.86, 0.42), (side * 0.345, 0.02, 0.45), 0.08, puff=(0.015, 0, 0.02))
    sb('Arm_BackFrame', (0.86, 0.18, 0.8), (0, 0.36, 0.63), 0.06)
    # a padded back in three shallow channels, flush rather than stacked rolls
    for k, (z, h) in enumerate(((0.63, 0.21), (0.83, 0.2), (1.01, 0.17))):
        sb(f'Arm_Back_{k}', (0.53, 0.13, h), (0, 0.255 + 0.035 * k, z), 0.035, puff=(0, 0.012, 0.004), rot=(math.radians(-12), 0, 0))
    for i, (lx, ly) in enumerate(((-0.36, -0.36), (0.36, -0.36), (-0.36, 0.38), (0.36, 0.38))):
        leg = H.cyl(f'Arm_Leg_{i}', 0.02, 0.07, (lx, ly, 0.035), M['walnut'])
        leg.parent = pv
    return pv, parts


def dining_chair(M, name, loc, side, turn_deg):
    """Upholstered dining chair with tapered oak legs. side +1: the back is on +Y (sits facing -Y)."""
    pv = pivot(name, (loc[0], loc[1], 0.0), math.radians(turn_deg))
    fab = M['chair_fabric']
    parts = [soft_block(f'{name}_Seat', (0.47, 0.47, 0.09), fab, r=0.035, puff=(0, 0, 0.012), loc=(0, 0, 0.465), parent=pv)]
    parts.append(soft_block(f'{name}_Back', (0.45, 0.07, 0.44), fab, r=0.03, puff=(0, 0.01, 0),
                            loc=(0, side * 0.23, 0.76), rot=(math.radians(side * 8), 0, 0), parent=pv))
    for j, (lx, ly) in enumerate(((-0.2, -0.2), (0.2, -0.2), (-0.2, 0.2), (0.2, 0.2))):
        leg = H.cyl(f'{name}_Leg_{j}', 0.018, 0.43, (lx, ly, 0.215), M['dining_wood'], r2=0.013, segs=16)
        leg.rotation_euler = (math.radians(-ly / 0.2 * 3), math.radians(lx / 0.2 * 3), 0)
        leg.parent = pv
        parts.append(leg)
    if side:
        # the back's wooden posts
        for lx in (-0.2, 0.2):
            post = H.cyl(f'{name}_Post_{lx:+.1f}', 0.014, 0.42, (lx, side * 0.22, 0.68), M['dining_wood'], segs=12)
            post.rotation_euler = (math.radians(side * 8), 0, 0)
            post.parent = pv
    return pv, parts


def round_coffee_table(M, cx, cy, top_z, radius=0.55):
    """Round solid-oak coffee table with a thick top and a cross of two slab legs."""
    t = 0.065
    top = H.cyl('Coffee_Top', radius, t, (cx, cy, top_z - t / 2), M['dining_wood'], segs=96)
    bev = top.modifiers.new('Bevel', 'BEVEL')
    bev.width, bev.segments, bev.limit_method = 0.018, 4, 'ANGLE'
    h = top_z - t
    for i, rot in enumerate((0.0, math.pi / 2)):
        H.box(f'Coffee_Leg_{i}', (radius * 1.15, 0.075, h), (cx, cy, h / 2), M['dining_wood'], bevel=0.008, rot=rot)
    return top


def bar_stool(M, i, x, y, seat_z=0.68):
    """Wooden bar stool: round seat, four splayed legs, a footrest ring."""
    H.cyl(f'Stool_Seat_{i}', 0.18, 0.045, (x, y, seat_z - 0.0225), M['dining_wood'], segs=48)
    for j in range(4):
        a = j * math.pi / 2 + math.pi / 4
        leg = H.cyl(f'Stool_Leg_{i}_{j}', 0.017, seat_z - 0.04, (x + math.cos(a) * 0.13, y + math.sin(a) * 0.13, (seat_z - 0.04) / 2),
                    M['dining_wood'], r2=0.014, segs=12)
        leg.rotation_euler = (math.sin(a) * 0.1, -math.cos(a) * 0.1, 0)
    cu = bpy.data.curves.new(f'Stool_Ring_{i}', 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = 0.011
    sp = cu.splines.new('NURBS')
    pts = [(x + math.cos(a) * 0.162, y + math.sin(a) * 0.162, 0.27) for a in (k * math.pi / 4 for k in range(8))]
    sp.points.add(len(pts) - 1)
    for p, c in zip(sp.points, pts):
        p.co = (c[0], c[1], c[2], 1)
    sp.use_cyclic_u = True
    sp.order_u = 4
    o = bpy.data.objects.new(f'Stool_Ring_{i}', cu)
    H.coll('Home').objects.link(o)
    o.data.materials.append(M['dining_wood'])


def cat_bed(M, bx, by):
    """Round donut bed in nubby boucle: a thick rolled rim around a soft cushion."""
    bm = bmesh.new()
    R, r = 0.25, 0.07
    nu, nv = 48, 16
    vs = []
    for i in range(nu):
        a = i / nu * math.tau
        row = []
        for j in range(nv):
            b = j / nv * math.tau
            # the roll is a little taller than it is wide, and flattens where it sits on the floor
            rr, rz = r, r * 1.15
            x = (R + rr * math.cos(b)) * math.cos(a)
            y = (R + rr * math.cos(b)) * math.sin(a)
            z = max(rz + rz * math.sin(b), 0.012)
            row.append(bm.verts.new((x, y, z)))
        vs.append(row)
    for i in range(nu):
        for j in range(nv):
            bm.faces.new((vs[i][j], vs[(i + 1) % nu][j], vs[(i + 1) % nu][(j + 1) % nv], vs[i][(j + 1) % nv]))
    rim = H.obj_from_bm('Cat_Bed', bm, M['cat_bed'], smooth=True)
    rim.location = (bx, by, 0.0)
    sub = rim.modifiers.new('Soft', 'SUBSURF')
    sub.levels = sub.render_levels = 1
    cush = soft_block('Cat_Bed_Cushion', (0.4, 0.4, 0.07), M['cat_bed'], r=0.034, puff=(0, 0, 0.012), sag=0.01,
                      loc=(bx, by, 0.045))
    # make the cushion round
    for v in cush.data.vertices:
        d = Vector((v.co.x, v.co.y))
        m = max(abs(v.co.x), abs(v.co.y))
        if d.length > 1e-6:
            s = m / d.length
            v.co.x *= s
            v.co.y *= s
    return rim, cush


def pouf(M, name, x, y, r=0.3, h=0.36):
    """Round woven pouf."""
    o = soft_block(name, (2 * r, 2 * r, h), M['pouf'], r=0.08, puff=(0, 0, 0.02), loc=(x, y, h / 2))
    for v in o.data.vertices:
        d = Vector((v.co.x, v.co.y))
        m = max(abs(v.co.x), abs(v.co.y))
        if d.length > 1e-6:
            s = m / d.length
            v.co.x *= s
            v.co.y *= s
    return o


def gourd_lamp(M, name, x, y, z, scale=1.0, light_energy_key=None):
    """Glazed ceramic gourd lamp with a linen drum shade; returns the bulb position."""
    s = scale
    H.lathe_obj(f'{name}_Base', [(0.0, 0.0), (0.06 * s, 0.0), (0.1 * s, 0.05 * s), (0.11 * s, 0.11 * s), (0.08 * s, 0.19 * s),
                                 (0.045 * s, 0.24 * s), (0.06 * s, 0.29 * s), (0.03 * s, 0.33 * s), (0.0, 0.33 * s)], (x, y, z), M['ceramic'])
    H.cyl(f'{name}_Stem', 0.008, 0.12 * s, (x, y, z + 0.37 * s), M['brass'], segs=10)
    H.cyl(f'{name}_Shade', 0.19 * s, 0.22 * s, (x, y, z + 0.5 * s), M['shade'], r2=0.17 * s, caps=False)
    H.sphere(f'{name}_Bulb', 0.03 * s, (x, y, z + 0.46 * s), M['bulb'])
    return Vector((x, y, z + 0.46 * s))

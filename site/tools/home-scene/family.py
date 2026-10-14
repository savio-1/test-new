"""
The family statues for the six moments (round 3).

- Dad, Mum and Grandpa are real 3D scans of people (Sketchfab, CC BY; scans.py makes them clay and rigs them),
  posed here with scan_pose.py after the reference images the client supplied.
- Arlo, Zoe, Leo and Mira are the MakeHuman children of the round-2 statues (make_people.py), which the client
  approved; their poses are the round-2 ones, refitted to the round-3 furniture.
- Milo is a scanned cat sculpture already in the stretch pose.

    python3 family.py [--only tower,cake]      # writes assets/people/<moment>.blend and anchors.json

Needs MPFB (see make_people.py) and the prepared scans (scans.py prepare / joints / rig).
"""

import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import make_people as mp  # noqa: E402
import scan_pose as SP  # noqa: E402
import scans  # noqa: E402

V = Vector
unit = SP.unit
HEIGHT = {k: v[5] for k, v in scans.SCAN_SET.items()}


# ---------------------------------------------------------------- loading and baking

def scan(key):
    path = os.path.join(scans.SCANS, key, f'{key}_rig.blend')
    with bpy.data.libraries.load(path) as (src, dst):
        dst.objects = list(src.objects)
    for o in dst.objects:
        bpy.context.scene.collection.objects.link(o)
    rig = next(o for o in dst.objects if o.type == 'ARMATURE')
    mesh = next(o for o in dst.objects if o.type == 'MESH')
    P = SP.ScanPoser(rig, HEIGHT[key])
    P.key, P.mesh, P.kind = key, mesh, 'scan'
    return P


def child(key, base_pose, wear=None):
    """A round-2 MakeHuman child; wear swaps garments for one moment ({old: new})."""
    spec = mp.PEOPLE[key]
    saved = list(spec['wear'])
    if wear:
        spec['wear'] = [(wear.get(a, a), m) for a, m in saved]
    try:
        body, rig, parts = mp.create_person(key)
    finally:
        spec['wear'] = saved
    height = mp.body_height(body)
    P = mp.Poser(rig, base_pose)
    P.key, P.body, P.parts, P.height, P.kind = key, body, parts, height, 'child'
    return P


def finish(P, moment):
    name = f'Statue_{P.key.capitalize()}_{moment}'
    if P.kind == 'scan':
        o = SP.bake(P.rig, P.mesh, name)
        bpy.context.scene.collection.objects.link(o)
        a = o.data.attributes.new('clay_fabric', 'FLOAT', 'POINT')
        a.data.foreach_set('value', [0.0] * len(o.data.vertices))
        arm = P.rig.data
        me = P.mesh.data
        bpy.data.objects.remove(P.mesh, do_unlink=True)
        bpy.data.objects.remove(P.rig, do_unlink=True)
        bpy.data.meshes.remove(me)
        bpy.data.armatures.remove(arm)
        return o
    expr = getattr(P, 'expr', {})
    if expr:
        mp.expression(P.body, expr)
    parts = list(P.parts)
    st = mp.bake(name, P.rig, parts, height=P.height)
    mp.cleanup_sources(P.body, P.rig, parts)
    return st


def lean_head_to(P, z_target, tries=8):
    """Lean the scan's spine forward or back until its head joint is at a height."""
    for _ in range(tries):
        err = P.joint('head').z - z_target
        if abs(err) < 0.008:
            return
        P.spine(bend=math.degrees(math.asin(max(-0.4, min(0.4, err / 0.5)))) * 0.9)


# ---------------------------------------------------------------- the moments

def moment_tower(H):
    tx, ty = H.LAYOUT['tower']
    tz = H.LAYOUT['tower_top']
    blk_z = tz + 0.0075 + H.LAYOUT['pulled_layer'] * 0.015
    out = []
    # Dad (scan) kneels behind the round table, sitting back toward his heels, both hands up either side of the
    # tower, ready to catch it (reference image)
    P = scan('dad')
    # knees just off the table's edge on the sofa side, at the point nearest the tower, so his hands reach it
    # with bent elbows (the table is 1.1 m across), leaning in from the hips
    cx, cy = H.LAYOUT['coffee']
    a = math.radians(-62)
    knees = V((cx + 0.58 * math.cos(a), cy + 0.58 * math.sin(a), 0))
    face = unit(tx - knees.x, ty - knees.y)
    P.kneel((knees.x, knees.y), face, back=25, pitch=12, spread=0.17)
    f, l, up = P.frame()
    P.spine(bend=12)
    for sd, sx in (('L', 1), ('R', -1)):
        w = V((tx, ty, tz + 0.15 + (0.025 if sd == 'R' else 0.0))) + l * sx * 0.13 - f * 0.05
        P.arm(sd, w, pole=-up * 0.6 + l * sx * 1.0 - f * 0.4)
        P.hand(sd, up + f * 0.2, palm=-l * sx)
    P.look(V((tx, ty, tz + 0.13)))
    out.append(finish(P, 'tower'))
    # Arlo (round-2 child) kneels at the table's end, pulling a block out between finger and thumb
    P = child('arlo', 'callharvey3d_standingnatural')
    mp.kneel(P, (tx + 0.4, ty - 0.13), (-0.95, 0.3), back=18, pitch=30, spread=0.1)
    f, l, up = P.frame()
    P.spine(bend=8, side=-2, twist=-5)
    pinch = V((tx + 0.036 + 0.0375 + 0.006, ty, blk_z))
    P.look(pinch + V((-0.02, 0, -0.01)), share=(0.25, 0.2, 0.15))
    P.arm('R', pinch + V((0.09, -0.015, 0.02)))
    P.hand('R', (pinch - P.joint('wrist.R')).normalized(), palm=V((0, 1, -0.4)))
    P.fingers('R', (0.3, 0.32, 0.7, 0.8, 0.85), thumb_in=8)
    P.arm('L', V((tx + 0.12, ty - 0.2, tz + 0.03)))
    P.hand('L', f + V((0, 0, -0.15)), palm=V((0, 0, -1)))
    P.fingers('L', (0.12, 0.12, 0.15, 0.18, 0.22))
    P.expr = {'mouth-open': 0.25, 'eye-left-slit': 0.3, 'eye-right-slit': 0.3, 'eyebrows-left-down': 0.4, 'eyebrows-right-down': 0.4}
    out.append(finish(P, 'tower'))
    return out, {}


def moment_sofa(H):
    sx, sy = H.LAYOUT['sofa']
    # Zoe (round-2 child) curled up in the corner of the sofa, laughing behind her hand
    P = child('zoe', 'callharvey3d_sittingfloor2')
    f = unit(0.25, 1)
    hips = V((sx - 0.84, sy + 0.08, 0.55))
    P.place(hips, f, pitch=-14)
    f, l, up = P.frame()
    P.spine(bend=-6, side=3, twist=8)
    P.head_rot(nod=-22, tilt=6)
    mouth = P.joint('head') + f * 0.11 + up * 0.02
    P.arm('R', mouth + f * 0.04 - l * 0.05 - up * 0.06)
    P.hand('R', l * 0.6 + up * 0.8, palm=-f)
    P.fingers('R', (0.1, 0.12, 0.16, 0.2, 0.25))
    P.expr = {'mouth-open': 0.7, 'mouth-corner-puller': 0.9, 'eye-left-slit': 0.7, 'eye-right-slit': 0.7}
    c = hips - l * 0.2 + f * 0.06 + V((0, 0, 0.1))
    st = finish(P, 'sofa')
    return [st], {'zoe_cushion': list(c), 'zoe_cushion_rot': [math.radians(-8), math.radians(-14), math.atan2(f.y, f.x)]}


def moment_cake(H):
    cx, cy = H.LAYOUT['cake']
    top = H.LAYOUT['dining_top']
    candles = V((cx, cy, top + 0.27))
    out = []
    # Grandpa (scan) on the north chair, leaning right over the cake, hands flat on the table, blowing
    P = scan('grandpa')
    ch = H.LAYOUT['dining_chairs'][0]
    P.sit((ch[0], ch[1] + 0.02), (0, -1), seat_z=0.52, pitch=14, spread=0.16)
    f, l, up = P.frame()
    lean_head_to(P, candles.z + 0.1)
    for sd, sx in (('L', 1), ('R', -1)):
        w = V((cx + sx * 0.22, cy + 0.28, top + 0.03))
        P.arm(sd, w, pole=-up + l * sx * 0.8 + f * 0.2)
        P.hand(sd, f - l * sx * 0.25 + V((0, 0, -0.08)), palm=V((0, 0, -1)))
    P.look(candles + V((0, 0, 0.02)), share=0.4)
    out.append(finish(P, 'cake'))
    # Mum (scan) at the window end of the table, clapping
    P = scan('mum')
    face = unit(-1, 0.08)
    P.stand((2.8, cy - 0.06), face, spread=0.19, weight=-0.02)
    f, l, up = P.frame()
    P.spine(bend=4, twist=3)
    clap = P.joint('chest') + f * 0.26 + up * 0.07
    for sd, sx in (('L', 1), ('R', -1)):
        P.arm(sd, clap + l * sx * 0.03, pole=-up + l * sx * 0.6 - f * 0.2)
        P.hand(sd, up + f * 0.3, palm=-l * sx)
    P.look(candles + V((0.05, 0.12, 0.08)), share=0.3)
    out.append(finish(P, 'cake'))
    # Dad (scan) behind Zoe, filming with his phone held up in landscape in both hands, gripping its short edges
    P = scan('dad')
    face = unit(-0.75, 0.66)
    P.stand((2.45, 0.1), face, spread=0.2, weight=0.03)
    f, l, up = P.frame()
    P.spine(bend=3, twist=4)
    phone = P.joint('head') + f * 0.34 + up * 0.03
    for sd, sx in (('L', 1), ('R', -1)):
        P.arm(sd, phone + l * sx * 0.105 - up * 0.05 - f * 0.03, pole=-up + l * sx * 0.35, clavicle=0.15)
        P.hand(sd, up * 0.55 + f * 0.35 - l * sx * 0.45, palm=-l * sx + f * 0.2)
    P.look(phone + f * 0.02, share=0.3)
    st = finish(P, 'cake')
    ph = mp.phone_piece(phone, f, 'Statue_Phone_cake')
    out += [st, ph]
    # Zoe (round-2 child) kneels up on the south-east chair to see; her loose harem trousers balloon round the
    # folded knees, so she wears the fitted cargo trousers here
    P = child('zoe', 'callharvey3d_standingnatural', wear={'toigo_harem_pants': 'cortu_cargo_pants'})
    ch = H.LAYOUT['dining_chairs'][2]
    f = unit(0, 1)
    l = V((-f.y, f.x, 0))
    thigh, shin = P.lengths('leg', 'L')
    seat = 0.52
    hips = V((ch[0], ch[1] + 0.06, seat + 0.05 + thigh * 0.95))
    P.place(hips, f, pitch=14)
    for sd, sxn in (('L', 1), ('R', -1)):
        knee = V((ch[0], ch[1] + 0.12, seat + 0.05)) + l * sxn * 0.08
        P.limb('leg', sd, knee, knee - f * shin * 0.97 + V((0, 0, 0.02)))
        P.foot(sd, -f + V((0, 0, -0.5)))
    P.spine(bend=10)
    P.look(candles, share=(0.15, 0.1, 0.1))
    for sd, sxn in (('L', 1), ('R', -1)):
        P.arm(sd, V((ch[0] + sxn * -0.13, 0.7, top + 0.03)))
        P.hand(sd, V((0, 1, -0.2)), palm=V((0, 0, -1)))
        P.fingers(sd, (0.08, 0.08, 0.1, 0.12, 0.15), spread=4)
    P.expr = {'mouth-open': 0.45, 'mouth-corner-puller': 0.7, 'eyebrows-left-up': 0.5, 'eyebrows-right-up': 0.5}
    out.append(finish(P, 'cake'))
    return out, {}


def moment_plane(H):
    sx, sy = H.LAYOUT['leo_stool']
    seat = 0.68
    out = []
    # Leo (round-2 child) on tiptoe on the stool, throwing arm out after the plane that has just left his fingers
    P = child('leo', 'joachip_tennis_serve')
    f = unit(0.3, -1)
    thigh, shin = P.lengths('leg', 'L')
    hips = V((sx, sy, seat + 0.07 + (thigh + shin) * 0.97)) + f * 0.02
    P.place(hips, f, pitch=6)
    f, l, up = P.frame()
    for sd, sxn in (('L', 1), ('R', -1)):
        heel = V((sx, sy, seat + 0.08)) + l * sxn * 0.07 - f * 0.03
        P.leg(sd, heel, pole=f)
        P.foot(sd, f + V((0, 0, -1.3)), toes=-30)
    P.spine(bend=8, side=2, twist=-18)
    throw = (f * 0.92 + V((0, 0, 0.32)) - l * 0.18).normalized()
    P.shrug('R', up=10, fwd=10)
    sh = P.joint('upperarm01.R')
    a, b = P.lengths('arm', 'R')
    P.arm('R', sh + throw * (a + b) * 0.97, pole=-up - l * 0.4, clavicle=0)
    P.hand('R', throw + V((0, 0, 0.12)), palm=-up * 0.6 - l * 0.8)
    P.fingers('R', (0.05, 0.0, 0.03, 0.08, 0.14), spread=5)
    P.arm('L', P.joint('upperarm01.L') + l * 0.12 - f * 0.18 - up * 0.24)
    P.hand('L', -f * 0.5 - up + l * 0.3, palm=l)
    P.fingers('L', (0.1, 0.1, 0.15, 0.2, 0.25), spread=4)
    tip = P.joint('finger3-3.R') + throw * 0.03
    plane = tip + throw * 0.34
    P.look(plane + throw * 0.3, share=(0.25, 0.2, 0.15))
    P.expr = {'mouth-open': 0.45, 'mouth-corner-puller': 0.5, 'eye-left-opened-up': 0.4, 'eye-right-opened-up': 0.4}
    leo_hips = (P.joint('upperleg01.L') + P.joint('upperleg01.R')) / 2
    fL, lL = f, l
    out.append(finish(P, 'plane'))
    # Mum (scan) stands close behind him, one hand at the small of his back, the other steadying him by his
    # legs, looking up at the plane (reference prompt)
    leo = out[-1]
    pts = [leo.matrix_world @ v.co for v in leo.data.vertices]
    P = scan('mum')
    to_room = unit(-0.88, -0.47)
    pos = leo_hips - fL * 0.34 + to_room * 0.2
    face = unit(*(fL * 0.65 + to_room * 0.35)[:2])
    P.stand((pos.x, pos.y), face, spread=0.2)
    f, l, up = P.frame()
    P.spine(bend=6, twist=-4)
    # the two contacts: the surface of his back at the waist and the outside of his thigh nearest her
    side = unit(*(to_room - fL * to_room.dot(fL))[:2])

    def surface(z0, z1, d, lateral):
        band = [p for p in pts if z0 < p.z < z1 and abs((p - leo_hips).dot(lateral)) < 0.05]
        return max(band, key=lambda p: p.dot(d))
    back = surface(leo_hips.z + 0.08, leo_hips.z + 0.16, -fL, side)
    thigh = surface(leo_hips.z - 0.22, leo_hips.z - 0.12, side, fL)
    goals = {'back': (back, -fL, up * 0.75 + side * 0.3), 'thigh': (thigh, side, -up * 0.2 + fL * 0.5)}
    # the hand nearer each contact takes it
    dL = (P.joint('upperarm.L') - back).length + (P.joint('upperarm.R') - thigh).length
    dR = (P.joint('upperarm.R') - back).length + (P.joint('upperarm.L') - thigh).length
    order = {'L': 'back', 'R': 'thigh'} if dL < dR else {'L': 'thigh', 'R': 'back'}
    for sd, sx in (('L', 1), ('R', -1)):
        c, n, along = goals[order[sd]]
        along = along.normalized()
        wrist = c + n * 0.025 - along * 0.075
        P.arm(sd, wrist, pole=-up + l * sx * 0.6 - f * 0.2, clavicle=0.15)
        P.hand(sd, along, palm=-n)
    P.look(plane + V((0, 0, 0.05)), share=0.4)
    out.append(finish(P, 'plane'))
    yaw = math.atan2(throw.y, throw.x)
    pitch = math.asin(max(-1, min(1, throw.z)))
    return out, {'plane': list(plane), 'plane_rot': [0.0, -pitch, yaw]}


def moment_book(H):
    ax, ay, rot = H.LAYOUT['armchair']
    rot = math.radians(rot)
    Rz = Matrix.Rotation(rot, 3, 'Z')

    def C(x, y, z):  # armchair local -> world (front is local -Y)
        return V((ax, ay, 0)) + Rz @ V((x, y, z))
    f = (Rz @ V((0, -1, 0))).normalized()
    l = V((-f.y, f.x, 0))
    tilt, yaw = math.radians(-42), rot - math.radians(12)
    Rb = Matrix.Rotation(yaw, 3, 'Z') @ Matrix.Rotation(tilt, 3, 'X')
    book = C(0.0, -0.36, 0.79)
    ang = math.radians(H.BOOK_PAGE_ANGLE)

    def Bk(x, y, z):
        return book + Rb @ V((x, y, z))
    page_tip = Bk(-0.185 * math.cos(ang), 0.1, 0.016 + 0.185 * math.sin(ang))
    out = []
    # Mum (scan) sits back in the armchair with her arms round Mira to the book: her left hand holds its edge,
    # her right hand turns the page (reference image)
    P = scan('mum')
    P.sit(C(0, 0.1, 0), f, seat_z=0.5, pitch=-6, spread=0.2)
    fm, lm, up = P.frame()
    # she sits back and leans her head to her right, looking past Mira's head at the pages
    P.spine(bend=3, side=-7)
    # left hand under the cover's outer edge, fingers along the underside
    P.arm('L', Bk(0.2, -0.02, -0.035), pole=-up + lm * 1.0 - fm * 0.2)
    P.hand('L', Rb @ V((-0.8, 0.25, 0.1)), palm=Rb @ V((0, 0, 1)))
    P.arm('R', page_tip + Rb @ V((-0.04, 0.06, 0.0)), pole=-up - lm * 1.0 - fm * 0.2)
    P.hand('R', (page_tip - P.joint('hand.R')).normalized(), palm=Rb @ V((-0.5, 0, -0.8)))
    P.look(Bk(-0.02, 0.0, 0.0), share=0.35)
    P.head_tilt(-10)
    out.append(finish(P, 'book'))
    # Mira (round-2 child) on her lap, back against her, hands on the book's near corners
    P = child('mira', 'callharvey3d_sittingnatural')
    t2, s2 = P.lengths('leg', 'L')
    mh = C(0.03, -0.18, 0.71)
    P.place(mh, f, pitch=-6)
    for sd, sxn in (('L', 1), ('R', -1)):
        knee = mh + f * t2 * 0.95 + l * sxn * 0.07 + V((0, 0, 0.01))
        P.limb('leg', sd, knee, knee + f * 0.03 + V((0, 0, -s2 * 0.96)))
        P.foot(sd, f + V((0, 0, -0.5)))
    P.spine(bend=4)
    P.look(Bk(0.03, 0.0, 0.0), share=(0.35, 0.3, 0.3))
    for sd, sxn in (('L', 1), ('R', -1)):
        P.arm(sd, Bk(sxn * 0.11, 0.115, 0.005) + V((0, 0, 0.025)), pole=V((0, 0, -1)) + l * sxn * 0.3 - f * 0.5)
        P.hand(sd, Rb @ V((-sxn * 0.25, -0.8, -0.15)), palm=Rb @ V((0, 0, -1)))
        P.fingers(sd, (0.25, 0.2, 0.25, 0.3, 0.35))
    P.expr = {'mouth-open': 0.2, 'eyebrows-left-up': 0.4, 'eyebrows-right-up': 0.4}
    out.append(finish(P, 'book'))
    eul = Rb.to_euler('XYZ')
    return out, {'book': list(book), 'book_rot': [eul.x, eul.y, eul.z], 'page': list(page_tip)}


def moment_catbed(H):
    """Milo: the scanned cat sculpture, already mid-stretch, just out of his bed on the rug, turned toward the room
    and Alaro."""
    bx, by = H.LAYOUT['catbed']
    path = os.path.join(scans.SCANS, 'milo', 'milo_clay.blend')
    with bpy.data.libraries.load(path) as (src, dst):
        dst.objects = list(src.objects)
    o = dst.objects[0]
    bpy.context.scene.collection.objects.link(o)
    o.name = 'Statue_Milo_catbed'
    o.data.name = 'Statue_Milo_catbed'
    # the scan's head is at -X; turn it to face d, three-quarter on to Alaro (who looks east from the far wall)
    # so the stretch reads in profile, rump just off the bed's rim where it has climbed out
    d = unit(-0.5, -0.87)
    R = Matrix.Rotation(math.atan2(-d.y, -d.x), 4, 'Z')
    o.data.transform(R)
    o.location = (bx - 0.5, by - 0.15, 0.026)
    a = o.data.attributes.new('clay_fabric', 'FLOAT', 'POINT')
    a.data.foreach_set('value', [6.0] * len(o.data.vertices))
    return [o], {}


MOMENTS = {'tower': moment_tower, 'sofa': moment_sofa, 'cake': moment_cake, 'plane': moment_plane,
           'catbed': moment_catbed, 'book': moment_book}


def main(argv):
    if '--' in argv:
        argv = argv[argv.index('--') + 1:]
    only = argv[argv.index('--only') + 1].split(',') if '--only' in argv else list(MOMENTS)
    mpfb = argv[argv.index('--mpfb') + 1] if '--mpfb' in argv else os.environ.get('MPFB_ZIP')
    mp.ensure_mpfb(mpfb)
    mp.EXPR_DIR = os.path.join(mp.LocationService.get_mpfb_data('targets'), 'expression', 'units', 'caucasian')
    import build_home as H
    apath = os.path.join(mp.ASSETS, 'anchors.json')
    anchors = json.load(open(apath)) if os.path.exists(apath) else {}
    for mo in only:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        statues, an = MOMENTS[mo](H)
        anchors.update(an)
        mp.save_moment(mo, statues)
    with open(apath, 'w') as fh:
        json.dump(anchors, fh, indent=1)


if __name__ == '__main__':
    main(sys.argv[1:])

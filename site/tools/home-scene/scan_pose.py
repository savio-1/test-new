"""
Posing the scanned statues (scans.py rigs): place the pelvis, bend the spine, aim the head, and reach hands and feet
to world points with two-bone IK. The armature object stays at the origin; everything is posed through its bones.
"""

import math

import bpy
from mathutils import Matrix, Quaternion, Vector

V = Vector


def upd():
    bpy.context.view_layer.update()


def world_rotate(pb, q, pivot=None):
    m = pb.matrix.copy()
    p = m.translation.copy() if pivot is None else Vector(pivot)
    r = (q.to_matrix() @ m.to_3x3()).to_4x4()
    r.translation = p + q @ (m.translation - p)
    pb.matrix = r
    upd()


def swing(pb, v_from, v_to, amount=1.0):
    if v_from.length < 1e-9 or v_to.length < 1e-9:
        return
    q = v_from.rotation_difference(v_to)
    if amount != 1.0:
        q = Quaternion().slerp(q, amount)
    world_rotate(pb, q)


def solve_two_bone(S, T, a, b, pole):
    d_vec = T - S
    d = min(max(d_vec.length, abs(a - b) + 1e-4), (a + b) * 0.999)
    u = d_vec.normalized()
    x = (a * a - b * b + d * d) / (2 * d)
    h = math.sqrt(max(a * a - x * x, 0.0))
    p = pole - u * pole.dot(u)
    if p.length < 1e-6:
        p = u.orthogonal()
    return S + u * x + p.normalized() * h, S + u * d


def unit(x, y, z=0.0):
    return V((x, y, z)).normalized()


class ScanPoser:
    def __init__(self, rig, height):
        self.rig = rig
        self.P = rig.pose.bones
        self.height = height
        for pb in self.P:
            pb.rotation_mode = 'QUATERNION'
            pb.rotation_quaternion = Quaternion()
            pb.location = (0, 0, 0)
        upd()
        self.R = Matrix.Identity(3)

    def b(self, n):
        return self.P[n]

    def joint(self, n):
        return self.P[n].head.copy()

    def tail(self, n):
        return self.P[n].tail.copy()

    def length(self, n):
        return (self.P[n].tail - self.P[n].head).length

    def frame(self):
        """Figure axes in the world: forward, left, up (rest: forward -Y, left +X)."""
        f = self.R @ V((0, -1, 0))
        f = V((f.x, f.y, 0)).normalized()
        return f, V((-f.y, f.x, 0)), V((0, 0, 1))

    def place(self, pelvis, face, pitch=0.0, roll=0.0):
        """Pelvis to a world point, facing a direction, leaning forward from the hips by pitch degrees."""
        face = unit(face[0], face[1])
        yaw = math.atan2(face.y, face.x) + math.pi / 2
        R = Matrix.Rotation(yaw, 3, 'Z') @ Matrix.Rotation(math.radians(pitch), 3, 'X') @ Matrix.Rotation(math.radians(roll), 3, 'Y')
        self.R = R
        root = self.P['root']
        rest = root.bone.matrix_local
        pel = rest.translation
        root.matrix = Matrix.Translation(V(pelvis)) @ R.to_4x4() @ Matrix.Translation(-pel) @ rest
        upd()
        # the legs hang from the root: undo its pitch on them so a seated or kneeling figure can lean
        # forward without swinging its thighs
        if pitch:
            f, l, up = self.frame()
            for sd in ('L', 'R'):
                world_rotate(self.P[f'thigh.{sd}'], Quaternion(l, -math.radians(pitch)))

    def spine(self, bend=0.0, side=0.0, twist=0.0, shares=(0.45, 0.55)):
        f, l, up = self.frame()
        for name, sh in zip(('spine', 'chest'), shares):
            pb = self.P[name]
            if bend:
                world_rotate(pb, Quaternion(l, math.radians(bend) * sh))
            if side:
                world_rotate(pb, Quaternion(f, -math.radians(side) * sh))
            if twist:
                world_rotate(pb, Quaternion(up, math.radians(twist) * sh))

    def look(self, target, share=0.35):
        """Neck and head turn so the face points at a world point."""
        target = V(target)
        f, l, up = self.frame()
        for name, s in (('neck', share), ('head', 1.0)):
            pb = self.P[name]
            face = self._face_dir()
            eye = self.joint('head') + (self.tail('head') - self.joint('head')) * 0.45 + face * 0.08
            swing(pb, face, (target - eye).normalized(), s)

    def _face_dir(self):
        # the head bone's rest front is -Y; carried by its pose
        pb = self.P['head']
        rest = pb.bone.matrix_local.to_3x3()
        cur = pb.matrix.to_3x3()
        return (cur @ rest.inverted() @ V((0, -1, 0))).normalized()

    def head_tilt(self, deg):
        pb = self.P['head']
        world_rotate(pb, Quaternion(self._face_dir(), math.radians(deg)))

    def shrug(self, side, up_deg=0.0, fwd_deg=0.0):
        f, l, up = self.frame()
        sx = 1 if side == 'L' else -1
        pb = self.P['clavicle.' + side]
        if up_deg:
            world_rotate(pb, Quaternion(f, -sx * math.radians(up_deg)))
        if fwd_deg:
            world_rotate(pb, Quaternion(up, sx * math.radians(fwd_deg)))

    def arm(self, side, wrist, pole=None, clavicle=0.3):
        f, l, up = self.frame()
        sx = 1 if side == 'L' else -1
        wrist = V(wrist)
        S = self.joint('upperarm.' + side)
        d = wrist - S
        if clavicle and d.length > 1e-6:
            elev = math.asin(max(-1.0, min(1.0, d.normalized().z)))
            lift = max(0.0, elev + math.radians(15)) * clavicle
            if lift:
                self.shrug(side, up_deg=math.degrees(min(lift, math.radians(22))))
        if pole is None:
            pole = -up - f * 0.3 + l * sx * 0.5
        self._ik('upperarm.' + side, 'forearm.' + side, 'hand.' + side, wrist, V(pole))

    def leg(self, side, ankle, pole=None):
        f, l, up = self.frame()
        if pole is None:
            pole = f
        self._ik('thigh.' + side, 'shin.' + side, 'foot.' + side, V(ankle), V(pole))

    def _ik(self, a_name, b_name, c_name, target, pole):
        A, B = self.P[a_name], self.P[b_name]
        S, E, W = A.head.copy(), B.head.copy(), self.P[c_name].head.copy()
        a, b = (E - S).length, (W - E).length
        E2, T = solve_two_bone(S, target, a, b, pole)
        swing(A, E - S, E2 - S)
        E, W = B.head.copy(), self.P[c_name].head.copy()
        swing(B, W - E, T - E)

    def hand(self, side, direction, palm=None):
        """Point the hand (wrist -> fingertips) along a direction; palm turns the forearm-hand about that axis so
        the palm faces a direction."""
        pb = self.P['hand.' + side]
        swing(pb, pb.tail - pb.head, V(direction).normalized())
        if palm is not None:
            # the rest palm faces the body's side (-X for the left hand in A-pose... estimated from the rest
            # frame): rotate about the hand axis toward the wanted palm normal
            rest = pb.bone.matrix_local.to_3x3()
            cur = pb.matrix.to_3x3()
            sx = 1 if side == 'L' else -1
            pn = (cur @ rest.inverted() @ V((-sx, 0, 0))).normalized()
            ax = (pb.tail - pb.head).normalized()
            a = pn - ax * pn.dot(ax)
            w = V(palm) - ax * V(palm).dot(ax)
            if a.length > 1e-4 and w.length > 1e-4:
                ang = a.angle(w)
                if a.cross(w).dot(ax) < 0:
                    ang = -ang
                world_rotate(pb, Quaternion(ax, ang))

    def foot(self, side, direction):
        pb = self.P['foot.' + side]
        swing(pb, pb.tail - pb.head, V(direction).normalized())

    def kneel(self, center, face, back=15.0, pitch=10.0, spread=0.12, knee_z=None):
        """Kneel on both knees at a floor point; thighs lean back by `back` degrees (hips behind the knees)."""
        f = unit(face[0], face[1])
        l = V((-f.y, f.x, 0))
        up = V((0, 0, 1))
        h = self.height
        thigh = self.length('thigh.L')
        shin = self.length('shin.L')
        kz = knee_z if knee_z is not None else 0.055 * h / 1.75
        c = V((center[0], center[1], 0))
        a = math.radians(back)
        pel_drop = (self.joint('root') - (self.joint('thigh.L') + self.joint('thigh.R')) / 2).z  # pelvis above hips
        hips = c - f * (thigh * math.sin(a)) + up * (kz + thigh * math.cos(a) + pel_drop)
        self.place(hips, f, pitch=pitch)
        for sd, sx in (('L', 1), ('R', -1)):
            knee = c + l * sx * spread + up * kz
            ankle = knee - f * shin * 0.98 + up * 0.03 * h / 1.75
            self._limb('thigh.' + sd, 'shin.' + sd, 'foot.' + sd, knee, ankle)
            self.foot(sd, -f * 0.6 - up * 0.8)
        return hips

    def _limb(self, a_name, b_name, c_name, mid, end):
        A, B = self.P[a_name], self.P[b_name]
        swing(A, B.head - A.head, V(mid) - A.head)
        swing(B, self.P[c_name].head - B.head, V(end) - B.head)

    def stand(self, center, face, pitch=0.0, floor=0.0, spread=None, toe_out=8.0, weight=0.0):
        """Stand at a floor point. With spread, the scan's wide A-pose stance swings in to that ankle spacing,
        each leg turning rigidly about its hip (knees stay straight); weight shifts the hips over one foot
        (+ left, metres)."""
        rest_pelvis = self.P['root'].bone.head_local.z
        self.place(V((center[0], center[1], floor + rest_pelvis)), face, pitch=pitch)
        if spread is None:
            return
        f, l, up = self.frame()
        ankle_z = {}
        for sd, sx in (('L', 1), ('R', -1)):
            hip = self.joint('thigh.' + sd)
            ank = self.joint('foot.' + sd)
            want = V((self.joint('root').x, self.joint('root').y, ank.z)) + l * (sx * spread / 2 - weight) + f * 0.01
            swing(self.P['thigh.' + sd], ank - hip, want - hip)
            ankle_z[sd] = self.joint('foot.' + sd).z
            ang = math.radians(toe_out) * sx
            self.foot(sd, (Quaternion(up, ang) @ f) - up * 0.35)
        # straightening the legs lengthens them a little: drop the hips so the lower ankle is back where it was
        rest_ankle = min(self.P['foot.L'].bone.head_local.z, self.P['foot.R'].bone.head_local.z) + floor
        dz = min(ankle_z.values()) - rest_ankle
        if abs(dz) > 1e-4:
            root = self.P['root']
            m = root.matrix.copy()
            m.translation.z -= dz
            root.matrix = m
            upd()

    def sit(self, seat_point, face, seat_z, pitch=0.0, knee_ahead=None, feet_floor=0.0, spread=0.1):
        """Sit: pelvis just above the seat, thighs forward and level, shins down to the floor."""
        f = unit(face[0], face[1])
        l = V((-f.y, f.x, 0))
        up = V((0, 0, 1))
        h = self.height
        pel_drop = (self.joint('root') - (self.joint('thigh.L') + self.joint('thigh.R')) / 2).z
        hip_z = seat_z + 0.085 * h / 1.75
        hips = V((seat_point[0], seat_point[1], hip_z + pel_drop))
        self.place(hips, f, pitch=pitch)
        thigh = self.length('thigh.L')
        shin = self.length('shin.L')
        for sd, sx in (('L', 1), ('R', -1)):
            hip = self.joint('thigh.' + sd)
            knee = hip + f * thigh * 0.97 + l * sx * spread * 0.4 + up * 0.0
            knee = V((knee.x, knee.y, hip.z + 0.01))
            ankle = knee - up * (knee.z - feet_floor - 0.07 * h / 1.75)
            dz = knee.z - ankle.z
            if dz > shin:
                ankle = knee - up * shin * 0.98
            else:
                ankle = ankle + f * math.sqrt(max(shin * shin - dz * dz, 0)) * 0.9
            self._limb('thigh.' + sd, 'shin.' + sd, 'foot.' + sd, knee, ankle)
            self.foot(sd, f + V((0, 0, -0.35)))


def bake(rig, mesh, name):
    """Freeze the posed statue into a plain mesh (keeps the scan_tone attribute for the clay material)."""
    upd()
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(mesh.evaluated_get(dg))
    me.name = name
    o = bpy.data.objects.new(name, me)
    for p in me.polygons:
        p.use_smooth = True
    return o

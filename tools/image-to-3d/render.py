"""
Photoreal studio renders of a GLB with Blender Cycles: a seamless sweep, softbox lighting, real contact shadows.

    python3 render.py out/photo/model.glb                       # 4 stills, 1600 px, into out/photo/renders/
    python3 render.py model.glb --shots hero,front --res 2400 --samples 256
    python3 render.py model.glb --turntable 96                  # + a 96-frame turntable, encoded to MP4 with ffmpeg
    python3 render.py model.glb --transparent                   # PNGs with alpha and a shadow catcher, for compositing
    python3 render.py model.glb --backdrop "#1d1f22"            # any sweep colour

Runs with the bpy module (pip install bpy) or inside Blender: blender -b -P render.py -- model.glb ...
Uses a GPU (OptiX, CUDA, HIP, Metal or oneAPI) when one is present, otherwise the CPU.
The object is scaled so its largest side is 1 m and stood on the floor, so the same studio fits anything.
"""

import argparse
import math
import os
import shutil
import subprocess
import sys

import bpy
from mathutils import Vector

SHOTS = {  # name: (azimuth deg, 0 = the side the photo saw; elevation deg; lens mm)
    'hero': (-32, 14, 70),
    'front': (0, 6, 70),
    'side': (90, 8, 70),
    'back': (180, 10, 70),
    'top': (35, 42, 60),
}


def srgb(hex_):
    h = hex_.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (1.0,)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_model(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    objs = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in objs if o.type == 'MESH']
    if not meshes:
        sys.exit(f'{path}: no meshes inside')
    # Parent everything to one empty so we can scale, centre and spin the whole model.
    root = bpy.data.objects.new('Model', None)
    bpy.context.scene.collection.objects.link(root)
    for o in objs:
        if o.parent is None:
            o.parent = root
        if o.type in ('CAMERA', 'LIGHT'):
            o.hide_render = True
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    size = max(hi - lo)
    s = 1.0 / size
    centre = (lo + hi) / 2
    root.scale = (s, s, s)
    root.location = (-centre.x * s, -centre.y * s, -lo.z * s)
    for o in meshes:
        for p in o.data.polygons:
            p.use_smooth = True
    bpy.context.view_layer.update()
    dims = (hi - lo) * s
    return root, meshes, dims


def studio(backdrop_hex, transparent):
    scn = bpy.context.scene
    # Seamless sweep: a floor that curves up into a back wall, so there is no horizon line.
    import bmesh
    bm = bmesh.new()
    prof = [(-6.0, 0.0), (1.2, 0.0)]
    for i in range(1, 13):
        a = math.radians(i * 7.5)
        prof.append((1.2 + 1.6 * math.sin(a), 1.6 - 1.6 * math.cos(a)))
    prof.append((2.8, 6.0))
    rows = [[bm.verts.new((x, y, z)) for x in (-8.0, 8.0)] for y, z in prof]
    for A, B in zip(rows, rows[1:]):
        bm.faces.new((A[0], A[1], B[1], B[0]))
    me = bpy.data.meshes.new('Sweep')
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    sweep = bpy.data.objects.new('Sweep', me)
    scn.collection.objects.link(sweep)
    mat = bpy.data.materials.new('Sweep')
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = srgb(backdrop_hex)
    bsdf.inputs['Roughness'].default_value = 0.85
    bsdf.inputs['Specular IOR Level'].default_value = 0.15
    sweep.data.materials.append(mat)
    if transparent:
        sweep.is_shadow_catcher = True
        scn.render.film_transparent = True

    def area(name, size, size_y, loc, energy, temp_rgb=(1, 1, 1)):
        L = bpy.data.lights.new(name, 'AREA')
        L.shape = 'RECTANGLE'
        L.size, L.size_y, L.energy, L.color = size, size_y, energy, temp_rgb
        o = bpy.data.objects.new(name, L)
        o.location = loc
        o.rotation_euler = (Vector((0, 0, 0.45)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        scn.collection.objects.link(o)

    # Big soft key front-left, strip fill right, overhead bounce, warm rim from behind (photo side is -Y).
    area('Key', 1.6, 1.1, (-1.5, -1.6, 1.7), 260, (1.0, 0.97, 0.93))
    area('Fill', 0.4, 1.8, (1.9, -0.9, 0.9), 50, (0.94, 0.97, 1.0))
    area('Top', 2.0, 0.8, (0.1, 0.2, 2.6), 110)
    area('Rim', 0.9, 0.9, (0.9, 1.6, 1.2), 140, (1.0, 0.92, 0.82))

    world = bpy.data.worlds.new('Studio')
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = srgb('#d7d9dc')
    bg.inputs['Strength'].default_value = 0.2
    scn.world = world


def camera():
    cd = bpy.data.cameras.new('Camera')
    cd.sensor_width = 36
    cam = bpy.data.objects.new('Camera', cd)
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    return cam


def frame(cam, dims, el, lens, aspect):
    """The camera always looks into the sweep from the front; shots turn the model instead, like a product turntable."""
    cam.data.lens = lens
    target = Vector((0, 0, dims.z * 0.48))
    r = 0.5 * dims.length  # bounding sphere radius
    fov = 2 * math.atan(cam.data.sensor_width / (2 * lens))
    if aspect < 1:
        fov = 2 * math.atan(math.tan(fov / 2) * aspect)
    dist = r / math.sin(fov / 2) * 0.92
    e = math.radians(el)
    cam.location = target + Vector((0, -math.cos(e), math.sin(e))) * dist
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.clip_start, cam.data.clip_end = 0.01, 100


def setup_render(res_x, res_y, samples, look, exposure):
    scn = bpy.context.scene
    scn.render.engine = 'CYCLES'
    scn.cycles.samples = samples
    scn.cycles.use_adaptive_sampling = True
    scn.cycles.use_denoising = True
    scn.cycles.max_bounces = 8
    scn.render.resolution_x, scn.render.resolution_y = res_x, res_y
    scn.render.image_settings.file_format = 'PNG'
    scn.render.image_settings.color_mode = 'RGBA' if scn.render.film_transparent else 'RGB'
    scn.view_settings.view_transform = 'AgX'
    scn.view_settings.look = look
    scn.view_settings.exposure = exposure
    device = 'CPU'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        for kind in ('OPTIX', 'CUDA', 'HIP', 'METAL', 'ONEAPI'):
            try:
                prefs.compute_device_type = kind
            except TypeError:
                continue
            prefs.get_devices()
            gpus = [d for d in prefs.devices if d.type == kind]
            if gpus:
                for d in prefs.devices:
                    d.use = d.type == kind
                device = kind
                break
    except Exception:
        pass
    scn.cycles.device = 'GPU' if device != 'CPU' else 'CPU'
    return device


def render_to(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main(argv):
    ap = argparse.ArgumentParser(description='Photoreal studio renders of a GLB (Blender Cycles).')
    ap.add_argument('glb')
    ap.add_argument('--out', help='output folder (default: renders/ next to the GLB)')
    ap.add_argument('--shots', default='hero,front,side,back', help=f'comma list from {",".join(SHOTS)}')
    ap.add_argument('--res', type=int, default=1600, help='long edge in pixels')
    ap.add_argument('--aspect', type=float, default=4 / 5, help='width / height (4:5 portrait by default)')
    ap.add_argument('--samples', type=int, default=160)
    ap.add_argument('--turntable', type=int, default=0, help='frames for a 360° turntable (0 = none)')
    ap.add_argument('--fps', type=int, default=24)
    ap.add_argument('--backdrop', default='#e9e7e3')
    ap.add_argument('--look', default='AgX - Medium High Contrast')
    ap.add_argument('--exposure', type=float, default=0.0, help='stops; negative is darker')
    ap.add_argument('--spin', type=float, default=0.0, help='extra rotation in degrees if the model faces the wrong way')
    ap.add_argument('--transparent', action='store_true')
    args = ap.parse_args(argv)

    out = args.out or os.path.join(os.path.dirname(os.path.abspath(args.glb)), 'renders')
    os.makedirs(out, exist_ok=True)
    reset()
    root, meshes, dims = import_model(args.glb)
    spin = math.radians(args.spin)
    studio(args.backdrop, args.transparent)
    cam = camera()
    aspect = args.aspect
    rx, ry = (args.res, round(args.res / aspect)) if aspect >= 1 else (round(args.res * aspect), args.res)
    device = setup_render(rx, ry, args.samples, args.look, args.exposure)
    print(f'rendering on {device}, {rx}×{ry}, {args.samples} samples', flush=True)

    for name in [s.strip() for s in args.shots.split(',') if s.strip()]:
        if name not in SHOTS:
            sys.exit(f'unknown shot {name!r}; choose from {", ".join(SHOTS)}')
        az, el, lens = SHOTS[name]
        root.rotation_euler.z = spin - math.radians(az)
        frame(cam, dims, el, lens, aspect)
        path = os.path.join(out, f'{name}.png')
        render_to(path)
        print(f'  {path}', flush=True)

    if args.turntable:
        az, el, lens = SHOTS['hero']
        frame(cam, dims, el, lens, aspect)
        tdir = os.path.join(out, 'turntable')
        os.makedirs(tdir, exist_ok=True)
        base = spin - math.radians(az)
        for i in range(args.turntable):
            root.rotation_euler.z = base + 2 * math.pi * i / args.turntable
            render_to(os.path.join(tdir, f'{i:04d}.png'))
            print(f'  turntable {i + 1}/{args.turntable}', flush=True)
        if shutil.which('ffmpeg') and not args.transparent:
            mp4 = os.path.join(out, 'turntable.mp4')
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(args.fps), '-i',
                            os.path.join(tdir, '%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '17',
                            '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', mp4], check=True)
            print(f'  {mp4}', flush=True)


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    main(argv)

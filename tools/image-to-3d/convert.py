"""
Photo to 3D: turn one photo of an object into a full, textured 3D model (GLB), using a hosted image-to-3D model.

    export HF_TOKEN=hf_...                                  # a Hugging Face read token (huggingface.co/settings/tokens)
    python3 convert.py photo.jpg                            # TRELLIS.2, writes out/photo/model.glb
    python3 convert.py photo.jpg --model hunyuan            # Hunyuan3D-2.1
    python3 convert.py photo.jpg --model sf3d --texture 2048
    python3 convert.py photo.jpg --render                   # then a photoreal Cycles render (render.py)

Models (all run on Hugging Face ZeroGPU Spaces; a free account's token gives a daily GPU allowance, PRO gives more):
    trellis2  microsoft/TRELLIS.2        best shape and texture detail, PBR materials, about 1 to 2 min
    hunyuan   tencent/Hunyuan3D-2.1      PBR textures, strong on products and characters, about 1 to 3 min
    sf3d      stabilityai/stable-fast-3d fastest (seconds), lighter detail, PBR (roughness/metallic)

The photo works best as one object, whole in frame, on a plain background. Each model removes the background itself.
The token is read from the environment only and never written anywhere.
"""

import argparse
import json
import os
import shutil
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))

MODELS = {
    'trellis2': {'space': 'microsoft/TRELLIS.2', 'name': 'TRELLIS.2', 'by': 'Microsoft', 'license': 'MIT'},
    'hunyuan': {'space': 'tencent/Hunyuan3D-2.1', 'name': 'Hunyuan3D 2.1', 'by': 'Tencent', 'license': 'Tencent Hunyuan Community'},
    'sf3d': {'space': 'stabilityai/stable-fast-3d', 'name': 'Stable Fast 3D', 'by': 'Stability AI', 'license': 'Stability AI Community'},
}


class ConvertError(Exception):
    pass


def _path(v):
    """Gradio returns files as a path string or as a dict holding one."""
    if isinstance(v, (list, tuple)):
        v = v[0]
    if isinstance(v, dict):
        v = v.get('path') or v.get('value') or v.get('name')
    if not isinstance(v, str) or not os.path.exists(v):
        raise ConvertError(f'the model returned no file ({v!r})')
    return v


def _client(space):
    try:
        from gradio_client import Client
    except ImportError:
        raise ConvertError('gradio_client is missing: pip install gradio_client')
    token = os.environ.get('HF_TOKEN') or os.environ.get('HUGGING_FACE_HUB_TOKEN')
    return Client(space, token=token, verbose=False)


def _friendly(e):
    msg = str(e)
    if 'ZeroGPU' in msg and ('quota' in msg or 'limit' in msg):
        hint = '' if os.environ.get('HF_TOKEN') else ' Set HF_TOKEN to a Hugging Face token for a larger allowance.'
        return f'The GPU allowance on Hugging Face is used up for now.{hint} ({msg.splitlines()[0][:200]})'
    if 'has not enabled verbose error reporting' in msg:
        hint = ' Set HF_TOKEN to a Hugging Face token, or try again later.' if not os.environ.get('HF_TOKEN') else ''
        return f'The model failed on Hugging Face without saying why. This usually means its GPU allowance ran out or it is overloaded.{hint}'
    return msg.splitlines()[0][:400] if msg else e.__class__.__name__


def _trellis2(c, image, seed, texture, detail, step):
    from gradio_client import handle_file
    step('Starting a GPU session')
    c.predict(api_name='/start_session')
    step('Removing the background')
    prompt = _path(c.predict(handle_file(image), api_name='/preprocess_image'))
    step('Building the shape and textures')
    c.predict(handle_file(prompt), seed, '1024', api_name='/image_to_3d')
    step('Baking the GLB')
    return _path(c.predict(detail, texture, api_name='/extract_glb'))


def _hunyuan(c, image, seed, texture, detail, step):
    from gradio_client import handle_file
    step('Building the shape, then painting PBR textures')
    out = c.predict(image=handle_file(image), steps=30, guidance_scale=5.0, seed=seed, octree_resolution=256,
                    check_box_rembg=True, num_chunks=8000, randomize_seed=False, api_name='/generation_all')
    # (white mesh, textured mesh, html preview, stats, seed): the textured one is what we want.
    return _path(out[1])


def _sf3d(c, image, seed, texture, detail, step):
    from gradio_client import handle_file
    step('Removing the background')
    c.predict(handle_file(image), 0.85, api_name='/requires_bg_remove')
    step('Building the shape and textures')
    out = c.predict(handle_file(image), 0.85, 'None', -1, min(texture, 2048), api_name='/run_button')
    return _path(out[1])


RUNNERS = {'trellis2': _trellis2, 'hunyuan': _hunyuan, 'sf3d': _sf3d}


def _ensure_glb(src, dst):
    if src.lower().endswith('.glb'):
        shutil.copyfile(src, dst)
        return
    # Some Spaces hand back OBJ or glTF; Blender converts them to one self-contained GLB.
    try:
        import bpy
    except ImportError:
        raise ConvertError(f'the model returned {os.path.basename(src)}; install bpy (pip install bpy) to convert it to GLB')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    ext = os.path.splitext(src)[1].lower()
    if ext == '.obj':
        bpy.ops.wm.obj_import(filepath=src)
    elif ext in ('.gltf', '.glb'):
        bpy.ops.import_scene.gltf(filepath=src)
    elif ext == '.ply':
        bpy.ops.wm.ply_import(filepath=src)
    else:
        raise ConvertError(f'unexpected file from the model: {os.path.basename(src)}')
    bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB')


def convert(image, model='trellis2', out_dir=None, seed=0, texture=2048, detail=300000, step=None):
    """Convert one photo. Returns the job's metadata dict; the model is at <out_dir>/model.glb."""
    if model not in MODELS:
        raise ConvertError(f'unknown model {model!r}; choose from {", ".join(MODELS)}')
    if not os.path.exists(image):
        raise ConvertError(f'no such image: {image}')
    step = step or (lambda s: print(f'  {s}', flush=True))
    name = os.path.splitext(os.path.basename(image))[0]
    out_dir = out_dir or os.path.join(HERE, 'out', name)
    os.makedirs(out_dir, exist_ok=True)
    src = os.path.join(out_dir, 'input' + os.path.splitext(image)[1].lower())
    if os.path.abspath(src) != os.path.abspath(image):
        shutil.copyfile(image, src)

    info = MODELS[model]
    t0 = time.time()
    step(f'Connecting to {info["name"]} on Hugging Face')
    try:
        c = _client(info['space'])
        result = RUNNERS[model](c, src, seed, texture, detail, step)
        glb = os.path.join(out_dir, 'model.glb')
        _ensure_glb(result, glb)
    except ConvertError:
        raise
    except Exception as e:  # network and Space errors arrive as many types; report them in one shape
        raise ConvertError(_friendly(e)) from e

    meta = {
        'name': name, 'model': model, 'model_name': info['name'], 'model_by': info['by'], 'space': info['space'],
        'license': info['license'], 'seed': seed, 'texture': texture, 'seconds': round(time.time() - t0, 1),
        'glb': 'model.glb', 'input': os.path.basename(src), 'bytes': os.path.getsize(glb),
        'created': time.strftime('%Y-%m-%dT%H:%M:%S'),
    }
    with open(os.path.join(out_dir, 'meta.json'), 'w') as f:
        json.dump(meta, f, indent=2)
    return meta


def main():
    ap = argparse.ArgumentParser(description='Turn a photo of an object into a textured 3D model (GLB).')
    ap.add_argument('image')
    ap.add_argument('--model', choices=list(MODELS), default='trellis2')
    ap.add_argument('--out', help='output folder (default: out/<image name>)')
    ap.add_argument('--seed', type=int, default=0)
    ap.add_argument('--texture', type=int, default=2048, choices=[1024, 2048, 4096])
    ap.add_argument('--faces', type=int, default=300000, help='target triangle count (TRELLIS.2)')
    ap.add_argument('--render', action='store_true', help='render photoreal stills with Blender Cycles afterwards')
    args = ap.parse_args()
    if not (os.environ.get('HF_TOKEN') or os.environ.get('HUGGING_FACE_HUB_TOKEN')):
        print('note: HF_TOKEN is not set, so only the small anonymous GPU allowance is available', file=sys.stderr)
    try:
        meta = convert(args.image, args.model, args.out, args.seed, args.texture, args.faces)
    except ConvertError as e:
        sys.exit(f'conversion failed: {e}')
    out_dir = args.out or os.path.join(HERE, 'out', meta['name'])
    print(f'{meta["model_name"]}: {os.path.join(out_dir, "model.glb")} ({meta["bytes"] / 1e6:.1f} MB, {meta["seconds"]} s)')
    if args.render:
        import subprocess
        subprocess.run([sys.executable, os.path.join(HERE, 'render.py'), os.path.join(out_dir, 'model.glb'),
                        '--out', os.path.join(out_dir, 'renders')], check=True)


if __name__ == '__main__':
    main()

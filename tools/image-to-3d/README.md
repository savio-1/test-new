# Photo to 3D

Turn one photo of an object into a full, textured 3D model (GLB) that you can turn all the way around, then render it photoreal.

The work is done by generative image-to-3D models running on GPUs: they rebuild the whole object, including the sides and back the photo can't see, with PBR materials. Three steps:

1. **Convert** (`convert.py`). The photo goes to a hosted model on Hugging Face and comes back as a GLB.
2. **View** (`index.html`). A real-time PBR viewer: image-based lighting, soft shadows, four lighting presets, clay and wireframe views, and PNG, turntable video and GLB exports.
3. **Render** (`render.py`). Blender Cycles path-traced studio shots: a seamless sweep, softbox lighting and real contact shadows, plus an optional turntable MP4.

## Setup

```bash
pip install gradio_client          # conversion
pip install bpy                    # optional: Cycles renders (Blender 5.2 as a Python module)
export HF_TOKEN=hf_...             # a free Hugging Face read token: huggingface.co/settings/tokens
```

The models run on Hugging Face ZeroGPU. Without a token you get a small anonymous allowance (about a minute of GPU a day, shared per network). A free account's token gives more, and a PRO account gives the most. The token is read from the environment only.

## Use it

**In the browser (local app):**
```bash
python3 tools/image-to-3d/serve.py        # http://localhost:8000
```
Drop a photo, pick a model, then press **Convert to 3D**. When the model appears, **Studio render** runs Cycles and shows four shots. Results are saved in `tools/image-to-3d/out/<job>/` (`model.glb`, `meta.json`, `renders/`).

**From the command line:**
```bash
python3 convert.py photo.jpg                          # TRELLIS.2 -> out/photo/model.glb
python3 convert.py photo.jpg --model hunyuan --render # Hunyuan3D 2.1, then Cycles stills
python3 render.py out/photo/model.glb --res 2400 --samples 256 --turntable 96
python3 render.py out/photo/model.glb --transparent   # alpha + shadow catcher, for compositing
```

**On claude.ai:** the published page (https://claude.ai/artifact/7nj7zjUXXm2MGM5wkHySCp) is the same `index.html`. It can't reach Hugging Face from there, so it works as the viewer and exporter for models you already have, and shows the command to run the converter.

## Models

| `--model` | Space | Strengths | Time | License |
|---|---|---|---|---|
| `trellis2` (default) | microsoft/TRELLIS.2 | Most geometric detail; PBR (colour, roughness, metal); textures up to 4096 | 1 to 2 min | MIT |
| `hunyuan` | tencent/Hunyuan3D-2.1 | PBR texture painting, strong on products and characters | 1 to 3 min | Tencent Hunyuan Community (not for use in the EU, UK or South Korea) |
| `sf3d` | stabilityai/stable-fast-3d | Seconds; lighter detail | under 10 s | Stability AI Community (free below $1M revenue) |

Check the license before using a result commercially.

## Getting realistic results

- Photograph **one object, whole in frame**, on a plain or tidy background. The models cut the object out themselves.
- Use **even, diffuse light**. Light baked into the photo ends up in the texture, so hard shadows and highlights get painted on.
- A three-quarter view usually reconstructs better than a dead-front one, because it shows two sides.
- The hidden sides are generated, not measured: plausible, not exact. For exact geometry, use photogrammetry from many photos.
- Scenes (rooms, landscapes) are not what these models do. They reconstruct objects.

## render.py studio

The model is scaled so its largest side is 1 m and stood on the floor. Shots turn the model, like a product on a turntable, while the camera and lights stay put:

| Shot | Turn | Camera height |
|---|---|---|
| `hero` | −32° | 14° |
| `front` | 0° (the side the photo saw) | 6° |
| `side` | 90° | 8° |
| `back` | 180° | 10° |
| `top` | 35° | 42° |

The lights are a large key front-left, a strip fill on the right, an overhead bounce and a warm rim from behind. The view transform is AgX Medium High Contrast. Other options: `--backdrop "#hex"`, `--exposure`, `--spin` (if a model faces the wrong way) and `--aspect`. Cycles uses OptiX, CUDA, HIP, Metal or oneAPI when present, otherwise the CPU (about 20 s per 720 px still at 48 samples on 4 cores).

## Files

```
convert.py   photo -> GLB via a hosted model (TRELLIS.2, Hunyuan3D 2.1, Stable Fast 3D)
render.py    GLB -> Cycles studio stills and turntable
serve.py     local app: serves index.html plus /api/convert, /api/render, /api/jobs
index.html   converter UI and PBR viewer (also the claude.ai artifact; no doctype, the host adds the skeleton)
out/         results, git-ignored
```

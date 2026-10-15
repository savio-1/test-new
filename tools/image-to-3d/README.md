# Depth Studio: 3D from a single image

Turn one photo into a 3D scene you can orbit, render and export. Everything runs in the browser; the photo never leaves the device.

- **Live:** https://claude.ai/artifact/7nj7zjUXXm2MGM5wkHySCp (private; share it from the page's Share menu)
- **Local:** `python3 serve.py`, then open http://localhost:8000

## How it works

1. **Depth.** [Depth Anything V2 Small](https://huggingface.co/depth-anything/Depth-Anything-V2-Small) (Apache-2.0), int8 ONNX, runs on-device through ONNX Runtime Web (WASM). The input is resized so the short side is 518 px (long side capped at 1036, both multiples of 14) and normalised with ImageNet statistics. The output is relative inverse depth; the page normalises it robustly (0.5 / 99.5 percentiles), so 1 is nearest and 0 is farthest.
2. **Geometry.** A grid is unprojected through a pinhole camera set by the lens (35 mm equivalent, 24 mm sensor height). Disparity `d` maps to distance `z = 1 / (d·(1 − 1/R) + 1/R)`, so the nearest point sits at 1 and the farthest at `R`, the "Depth" ratio. Seen from the origin, the mesh lines up exactly with the photo.
3. **Separation.** Quads that span a large relative depth jump are dropped, so foreground objects come away from what is behind them. A second, coarser **backdrop** mesh fills those gaps. It is built from the depth with foreground objects min-filtered away, then pushed back 1.5%.
4. **Looks.** Photo (unlit texture), Lit (texture with a key light), Clay (geometry only) and Depth (inferno ramp).

## Controls

| Control | Effect |
|---|---|
| Depth | Far/near distance ratio, 1× (flat) to 11.5× |
| Lens | Field of view the photo is assumed to have. Phones are about 24 to 28 mm. |
| Separate objects at edges | Tear threshold. 0 keeps one continuous sheet. |
| Smoothing | Box blur on the depth before meshing, to remove model noise |
| Mesh detail | Grid quads along the long edge |
| Motion | Parallax (a small loop around the photo view) or Orbit arc (±24°) |

Orbit is clamped to about 65° from the photo view. Past that, a single photo has nothing to show.

## Exports

- **Render image**: PNG at 1920, 2880 or 4096 px on the long edge, optionally with a transparent background.
- **Record loop**: one seamless loop of the current motion, WebM (MP4 in Safari).
- **3D model**: a `.zip` holding a `.glb` (meshes `relief` and `backdrop`, plus `photo_camera`), the depth PNG and a README. The viewer can't save `.glb` directly, which is why it is zipped. In Blender, use File > Import > glTF, then render from `photo_camera` to line up with the original.
- **Depth map**: 8-bit grayscale PNG, white = near.

**Use my depth map** replaces the estimated depth with your own grayscale map (white = near), for example one from a stronger model.

## Files

```
index.html       the whole app (artifact source: no doctype; the host adds the skeleton, and serve.py adds it locally)
serve.py         downloads + splits the model and the ORT runtime on first run, then serves the page
sample/          the opening sample (a frame from site/tools/home-scene) and its precomputed 16-bit depth (R = high byte, G = low)
model/, ort/     downloaded by serve.py, git-ignored
```

The model is split into two parts so each stays under the artifact host's 15 MB per-file limit. The parts are named `.wasm` only because the host serves that extension; they hold raw ONNX bytes. To republish, run `python3 serve.py --prepare`, then publish `index.html` with `model/*`, `ort/*` and `sample/*` as supporting files.

## Limits

- It's a 2.5D relief. Surfaces hidden in the photo stay unknown, so the backs of objects aren't there.
- Depth is relative, not metric. Scale comes from the lens setting and the Depth ratio.
- First use downloads about 38 MB (model plus runtime). On a laptop, inference takes about 2 to 10 seconds.
- A full 360° object model would need an image-to-3D model (such as TripoSR, Stable Fast 3D or Hunyuan3D) running on a GPU. Those are too large to run in the browser.

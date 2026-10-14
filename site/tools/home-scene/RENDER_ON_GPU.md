# Rendering the home sequence in 4K on a GPU

The website's 3D home is 240 frames rendered in Blender. Version 2 adds the clay-statue family and a lived-in home. The frames made in the cloud are 960×540 drafts, because that machine has no GPU. This kit renders the same scene at **3840×2160, final quality**, on any computer with a recent graphics card. Nothing about the scene, camera path, timing or tracking changes.

## What you need

- **Blender 5.x** (5.2 LTS recommended, free from [blender.org](https://www.blender.org/download/)). The scene was built and tested with 5.2; 4.2 LTS should work, but 5.x is what was tested.
- **A graphics card:**
  - NVIDIA RTX (uses OptiX; GTX 10-series and newer use CUDA)
  - AMD RX 6000 or newer (HIP)
  - an Apple-silicon Mac (Metal)
  - Intel Arc (oneAPI)

  The script finds it by itself. Without one it still works, but falls back to the CPU, which is far slower.
- **Memory:** a card with 8 GB or more of video memory is recommended. The whole Blender process used about 6 GB of RAM on the CPU test machine; the GPU's share is smaller. On NVIDIA cards with less memory, Cycles can spill into system RAM, which works but is slower. 16 GB of system RAM is recommended.
- **Disk space:** about 5 GB free (240 PNG masters at 4K are 3–4 GB; the WebP copies are about 0.3–0.6 GB).

## Steps

1. Unzip `alaro-render-kit-4k.zip` on the GPU computer. Keep its folders as they are: the scene script loads the Alaro camera model from `alaro-camera/`, three folders up, and the figures and textures from `assets/`.
2. Open `site/tools/home-scene/` and start the render:
   - **Windows:** double-click `render_gpu.bat`.
   - **Mac:** double-click `render_gpu.command`. If macOS blocks it, open Terminal in this folder and run `bash render_gpu.command`.
   - **Linux:** `bash render_gpu.command`.
3. Leave it running. The first lines say which GPU it found, for example `GPU rendering on OPTIX: NVIDIA GeForce RTX 4090`. If it prints a **WARNING: no supported GPU found**, it is rendering on the CPU: stop it (Ctrl+C or close the window) and check the graphics driver and Blender's *Preferences ▸ System ▸ Cycles Render Devices*.
4. After the first three frames it prints an **ESTIMATE** for the whole set. Each frame then prints `rendered N (i/240) in … s; about … h left`.
5. When it finishes it writes **`alaro-frames-4k.zip`** next to the launcher. That is the file to bring back.

## How long it takes

At 3840×2160, 512 samples (adaptive), all 240 frames:

| Graphics card | Per frame | All 240 frames |
|---|---|---|
| RTX 4090 | 60–90 s | ~4–6 h |
| RTX 4070 | 2–3 min | ~8–12 h |
| RTX 3080 | 2.5–3.5 min | ~10–14 h |
| Apple M3 Max | 4–6 min | ~16–24 h |
| CPU only | 30+ min | days |

These are estimates; the script's own ESTIMATE line after three frames is the number to trust.

**Cheaper options** (the website handles any 16:9 size; `--w` is the only switch you need):
- `--w 2560`: 2560×1440, about **2.2× faster**. The best fallback if 4K is too slow.
- `--w 1920`: 1920×1080, about 4× faster.

Windows: `render_gpu.bat --w 2560`. Mac/Linux: `bash render_gpu.command --w 2560`.

## Stopping and resuming

Frames render coarse to fine: every 16th frame first, then every 8th, 4th, 2nd, and finally the rest. You can stop at any point (close the window or press Ctrl+C) and still have a usable, evenly spread set. Running the launcher again picks up where it stopped, because finished frames are skipped. Each finished frame is written at once, so at most one frame's work is lost.

To make a zip of a partial set, run the launcher again; it skips everything already done and zips at the end. Or zip `frames/4k/*.webp`, `frames/4k/track.json` and `frames/4k/render-info.txt` yourself.

## Splitting the work across two computers

Give each computer half the frames:

```
render_gpu.bat --start 0 --end 119        (computer 1)
render_gpu.bat --start 120 --end 239      (computer 2)
```

Each makes its own `alaro-frames-4k.zip`; bring both back (or merge the two `frames/4k` folders and zip the WebP files, `track.json` and `render-info.txt`). Both computers write the same `track.json`.

## What comes out

In `site/tools/home-scene/frames/4k/`:

| File | What |
|---|---|
| `f000.png … f239.png` | the masters: 8-bit sRGB PNG, lossless, 3840×2160 |
| `f000.webp … f239.webp` | the same frames as WebP, quality 95, for upload |
| `track.json` | where each moment's statue group and prop lands on screen, per frame (same format as before) |
| `render-info.txt` | resolution, samples, device, Blender version, date, render time |

`alaro-frames-4k.zip` holds **only the WebP frames, `track.json` and `render-info.txt`** (about 0.3–0.6 GB). The PNG masters stay on the GPU computer; keep them in case the site ever needs to be repacked at a different quality.

## Options

The launchers already pass `--render --final --gpu --w 3840 --samples 512 --set 4k --zip`. Extra options are added after those and win:

| Option | Default | What it does |
|---|---|---|
| `--w 2560` | 3840 | Width; the height follows at 16:9. |
| `--samples 1024` | 512 | Maximum samples per pixel (adaptive sampling stops earlier where the image is clean). |
| `--start N --end M` | 0, 239 | Render only these frames. |
| `--force` | off | Re-render frames that already exist. |

Run it directly, without the launcher:

```
blender -b -P build_home.py -- --render --final --gpu --w 3840 --samples 512 --set 4k --zip
```

**Render settings used:** Cycles, 512 samples with an adaptive threshold of 0.005, OptiX denoiser on NVIDIA and OpenImageDenoise elsewhere (with albedo and normal guiding passes), light tree on, 12 bounces (12 transmission, 2 volume), caustics off, persistent data on, automatic tiles, Blackman-Harris 1.5 px pixel filter, no motion blur, AgX Medium High Contrast with exposure keyed per frame. A light lens finish (slight vignetting, a hint of chromatic aberration at the corners and about 1.5 % fine grain) is applied to each frame in the script itself, with no blur.

## Opening the scene in Blender

`home.blend` is the whole home with everything packed inside (textures, artwork, statue figures), already keyed for all 240 frames and set to 3840×2160 / 512 samples. Open it and use *Render ▸ Render Animation* if you prefer Blender's own interface. Note that the launcher route is the one that was tested: it also writes `track.json`, the WebP copies and the lens finish.

## Bringing the frames back

Upload **`alaro-frames-4k.zip`** in the website's Claude session. There, the frames are packed for the web (sized per device) and the hero is republished. Nothing else is needed.

# Rendering the home sequence at full quality on a GPU

The website's 3D home is 240 frames rendered in Blender. The draft frames are 960×540 at low quality, because they were made on a CPU. This folder renders the same scene at **1920×1080, final quality**, on any computer with a recent graphics card. Nothing about the scene, camera path or lighting changes.

## What you need

- **Blender 4.2 or newer**, free from [blender.org](https://www.blender.org/download/). Blender 5.x matches what the draft used.
- **A graphics card:**
  - NVIDIA (RTX or GTX 10-series and newer)
  - AMD (RX 6000 and newer)
  - an Apple-silicon Mac
  - Intel Arc

  The script finds it automatically. Without one, it still works but falls back to the much slower CPU.
- **About 1 GB of free disk space.**

## Steps

1. Copy this kit onto the GPU computer. Keep its folders as they are: the scene script loads the camera model from `alaro-camera/`, three folders up.
2. Open `site/tools/home-scene/` and start the render:
   - **Windows:** double-click `render_gpu.bat`.
   - **Mac:** double-click `render_gpu.command`. If macOS blocks it, open Terminal in this folder and run `bash render_gpu.command`.
   - **Linux:** `bash render_gpu.command`.
3. Leave it running. The first lines say which GPU it found, for example `GPU rendering on OPTIX: NVIDIA GeForce RTX 4070`. Each frame then prints `rendered N`.
4. When it finishes, it makes **`alaro-frames-hd.zip`** in the same folder. Send that zip back (upload it in the Claude chat, or see "Bringing the frames back" below).

## How long it takes

Roughly, per frame at 1920×1080:

| Graphics card | Per frame | All 240 frames |
|---|---|---|
| RTX 4070–4090 | 10–20 s | 40–80 min |
| RTX 3060–3080 | 20–40 s | 1.5–2.5 h |
| Apple M2/M3 Pro or Max | 30–60 s | 2–4 h |
| CPU only | 5–10 min | a day or more |

Frames render coarse to fine: every 16th frame first, then every 8th, and so on. You can stop at any point and still send back a usable set. Running the launcher again later picks up where it stopped, because finished frames are skipped.

## Splitting the work across two computers

Give each computer half the frames, then combine the two `frames/hd` folders into one zip:

```
render_gpu.bat --start 0 --end 119        (computer 1)
render_gpu.bat --start 120 --end 239      (computer 2)
```

## Options

The launchers pass extra options through to the script:

| Option | Default | What it does |
|---|---|---|
| `--w 2560` | 1920 | Width; the height follows at 16:9. Use 2560 for extra-sharp frames on large screens. |
| `--samples 256` | 160 | More samples means less noise and a slower render. |
| `--start N --end M` | 0, 239 | Render only these frames. |
| `--force` | off | Re-render frames that already exist. |

Run it directly, without the launcher:

```
blender -b -P build_home.py -- --render --final --gpu
```

## Bringing the frames back

The zip holds `f000.webp` … `f239.webp`, about 60–100 MB in total. Either:

- **upload `alaro-frames-hd.zip` in the Claude chat**, or
- **commit the frames to the branch:** copy them into `site/tools/home-scene/frames/hd/`, then run `git add -f site/tools/home-scene/frames/hd && git commit -m "Add HD home frames" && git push`. The `-f` is needed because raw frames are normally ignored.

Then, on the machine that builds the website, run:

```
python3 site/tools/home-scene/pack_frames.py --src site/tools/home-scene/frames/hd
```

That writes the web-ready atlases to `site/public/media/home/`, and the site uses them as they are; no code changes are needed.

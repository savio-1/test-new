# Alaro statue-scene kit: start here

This kit is for building **v2 of the 3D home** behind the Alaro website's scroll hero, in a separate Claude session. v2 adds:
- **clay-statue people** frozen in each family moment (matte off-white sculpture, like `references/statue-style/`)
- a **lived-in, natural home**
- a **one-command 4K GPU render**

## For the person: what to paste into the new Claude session

Upload `alaro-statue-kit.zip`, then paste:

> Unzip alaro-statue-kit.zip and read START_HERE.md, then BRIEF.md fully, then project/ALARO_CONTEXT.md. Build v2 of the Alaro home scene as the brief describes: clay-statue people in all six moments and a lived-in natural home, keeping the camera path, timing and track.json format. My machine is CPU-only, so only render test frames and a low-res draft here. Then give me alaro-render-kit-4k.zip with a one-command 4K GPU render, plus a contact sheet of the test frames.

Afterwards:
1. On the GPU machine, run `render_gpu.command` (Mac/Linux) or `render_gpu.bat` (Windows) from the render kit.
2. When it finishes, bring **`alaro-frames-4k.zip`** back to the website session to put it on the site.

## For Claude: steps

1. **Read the brief:** read `BRIEF.md` fully; it is the spec. `project/ALARO_CONTEXT.md` explains v1 (the scene builder, camera rig, tracking and website contract).
2. **Set up:**
   - `pip install bpy` (Blender as a Python module, ≥ 4.2) and `pillow`.
   - Keep `project/` as the working tree. The scene script imports the camera from `../../../alaro-camera/`.
   - Optional: `git init` it so changes are tracked.
3. **Look at the references** before building:
   - `references/statue-style/`: the statue look the owner chose.
   - `references/current-frames/`: v1 at the 10 key frames.
   - `references/moodboard.webp`.
4. **Build:** edit `project/site/tools/home-scene/build_home.py` (and add `assets/`).
   - People: BRIEF §3.
   - Lived-in home: §4.
   - Realism: §5.
   - Don't break the website contract: §6.
5. **Render on CPU only:** test frames and the draft pass (§7.1). Never 4K here.
6. **Build the GPU kit:** 4K by default, resumable, zips WebP + `track.json` (§7.2).
7. **Check and hand back:** run the checks in §8, then give the owner:
   - `alaro-render-kit-4k.zip`
   - the test-frame contact sheet
   - the change notes

## What's in this kit

```
START_HERE.md                      this file
BRIEF.md                           the full spec for v2 (read second)
references/
  statue-style/                    clay figure references (the chosen look) + frozen-moment mood
  current-frames/                  v1 renders at the 10 key frames (f000 … f232)
  moodboard.webp, detection-boxes.jpg, video-scenes.jpg   site look and HUD
project/
  ALARO_CONTEXT.md                 full v1 technical context
  alaro-camera/build_alaro_camera.py   Alaro camera model (imported by the scene)
  site/tools/home-scene/           v1 scene builder, packer, GPU launchers, guide, home.blend
  site/components/hero/homeStory.ts    the website's timing (reference: keep in step)
  site/public/media/home/track.json    tracking format sample (+ manifest.json)
  site/docs/STORYBOARD.md          story and floor plan
```

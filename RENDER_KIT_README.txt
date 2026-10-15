Alaro home v2 - 4K render kit (branch render-kit-4k)
====================================================

This branch is the render kit: the scripts plus the statue figures and Poly Haven assets that are normally
kept out of git.

1. Download it: on GitHub, switch to the render-kit-4k branch, then Code > Download ZIP (or
   `git clone -b render-kit-4k <repo url>`). Unzip it anywhere.
2. Install Blender 5.x (5.2 LTS recommended) from blender.org.
3. Open site/tools/home-scene/ and double-click render_gpu.bat (Windows) or render_gpu.command
   (Mac/Linux: `bash render_gpu.command`).
4. When it finishes, bring back site/tools/home-scene/alaro-frames-4k.zip.

The full guide, with timings and options (for example --w 2560 for a faster 2560x1440 set), is
site/tools/home-scene/RENDER_ON_GPU.md. Asset licences: site/tools/home-scene/assets/LICENSES.md.
What changed in v2: docs/v2/CHANGES.md.

home.blend (the scene packed for Blender's own interface) is not on this branch: it is over GitHub's
100 MB file limit and the launchers don't need it. To make it, run in site/tools/home-scene:
    blender -b -P build_home.py -- --blend

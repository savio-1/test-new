# Ring render

Bar-set princess-cut half-eternity band in white gold, resting on charred logs
with an ember glow behind it. Everything is built procedurally by
`build_ring_scene.py`. Tested with Blender 5.1.

## Open it in Blender on your computer

**Option A: open the saved scene**

Open `ring_scene.blend` in Blender (File → Open). Press F12 to render.

**Option B: rebuild from the script**

1. Open Blender and switch to the **Scripting** workspace.
2. Click **Open**, choose `build_ring_scene.py`, then click **Run Script**.
   The script clears the current scene and builds the ring, stones, logs,
   lights and camera (about 10 seconds). Press F12 to render.

**From a terminal**

```bash
# quick low-res preview
blender -b --factory-startup --python build_ring_scene.py -- --preview --out //renders/preview.png
# full quality
blender -b --factory-startup --python build_ring_scene.py -- --samples 512 --scale 100 --out //renders/ring.png
# build and save the .blend only
blender -b --factory-startup --python build_ring_scene.py -- --no-render --blend ring_scene.blend
```

## Useful knobs (command-line flags)

| Flag | Default | What it changes |
| --- | --- | --- |
| `--tilt` | 20 | How far the ring axis tips toward the camera (opens up the hole) |
| `--major` | 56 | Angle of the ring's long axis in the frame |
| `--shift` | 15 | Slides the stone arc toward the top right |
| `--fstop` | 0.45 | Depth of field (lower = blurrier background) |
| `--fire` | 260 | Strength of the main fire light |
| `--ember` | 4 | Glow strength in the log cracks |
| `--key` | 1400 | Key softbox on the ring |
| `--exposure` | 0 | Overall exposure |

On a machine with a GPU, set Cycles to GPU in Preferences → System to render
much faster.

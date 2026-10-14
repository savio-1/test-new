# Alaro camera: Blender model

A Blender rebuild of the Alaro smart home camera shown on the website.

**Geometry.** The shape is a one-to-one port of the site's procedural model (`lib/three/alaroCamera.ts` on `saviosunny9/testing`), using the same centimetre dimensions. That makes it the same object as every hero, journey and product render on the site. It is 13.85 cm tall with a 7.4 cm base.

**Material.** The shell uses a soft-touch matte finish modelled on the grip of the Combine Driver on [wowfactories.com](https://wowfactories.com/):
- diffuse and velvety
- a fine micro-grain, done as a roughness variation and a tiny bump
- a soft sheen that rolls off the edges instead of a gloss highlight

The lens bezel follows the same product's bead-blasted satin metal.

## Files

| File | What |
|---|---|
| `alaro-camera.blend` | The model with a studio set-up (sweep, lights, camera). Opens in Graphite. |
| `alaro-camera-graphite.glb`, `-white.glb`, `-red.glb` | Web-ready glTF exports, one per finish, in real-world metres |
| `renders/*.png` | Preview renders (Cycles, 1400 × 1400) |
| `build_alaro_camera.py` | The script that builds all of the above |

## Using it in Blender

- **Open:** open `alaro-camera.blend`. It was saved by Blender 5.2; for older versions, use File → Import → glTF with one of the `.glb` files.
- **Pan the head:** rotate `Alaro_Pan` around Z.
- **Tilt the head:** rotate `Alaro_Tilt` around X. Negative values look up.
- **Change the finish:** every finish is in the file:
  - shell: `Alaro Soft-Touch Graphite / White / Red`
  - logo: `Alaro Logo Graphite / White / Red`
  - Either swap them in the material slots, or run `set_finish('red')` from the script.
- **Rebuild:** open `build_alaro_camera.py` in the Scripting tab and press **Run Script**.

## Rebuilding headless

```bash
pip install bpy                         # Blender as a Python module (5.2)
python3 build_alaro_camera.py           # .blend + 3 GLBs + renders (~15 min on 4 CPUs)
python3 build_alaro_camera.py --no-render
python3 build_alaro_camera.py --quick   # fast low-res previews into renders/quick/
ALARO_VIEWS=hero-graphite python3 build_alaro_camera.py --quick
```

## Using the GLB on the website

The GLBs can replace `createAlaroCamera()` in `lib/three/stage.ts`:
- **Units:** the GLBs are in metres and the site works in centimetres, so scale the loaded scene by 100.
- **Pan and tilt:** the nodes `Alaro_Pan` and `Alaro_Tilt` carry over, so `pan.rotation.y` and `tilt.rotation.x` still work.
- **What exports:** sheen, clearcoat, transmission, IOR and specular export as standard glTF extensions.
- **Baked to flat values:** the soft-touch shell exports as roughness 0.63 with sheen 0.2, and the satin bezel as roughness 0.34.
- **What doesn't export:**
  - the micro-grain, which is procedural. The site's existing `grainTexture()` roughness/bump map is the right place to add it back in three.js.
  - the lens's thin-film tint. Add `iridescence` on the lens materials in three.js, as `alaroCamera.ts` already does.
- **Size:** about 75k triangles and 1.4 MB per GLB, before any Draco/meshopt compression.

## Differences from the site's model

- **Logo font:** the logo is Inter Display Bold, wrapped onto the base at the same size and position. Switzer ships as `.woff2` only, which Blender cannot load. Drop a Switzer `.otf` into `LOGO_FONT_CANDIDATES` to match it exactly.
- **Real cut-outs:** the speaker grille holes and the USB-C port are real cut-outs (the site paints dark discs). The lens is a real refracting element over the aperture.
- **Sourcing:** like the site's model, this is our own build, not a licensed third-party model.

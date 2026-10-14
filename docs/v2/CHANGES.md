# Alaro home v2: what changed

v2 of the 3D home behind the scroll hero: the six moments now have clay-statue people, the home is restyled after the client's reference images and dressed as a lived-in family home, and the render kit makes the final frames at 4K on a GPU. The camera path, timing, 16:9 framing and the `track.json` format are unchanged. There are now **479 frames** (`f000`–`f478`, two per story beat) instead of 240 for a smoother scroll; `homeStory.ts` has `STEP = 2` for this (set it back to 1 and render with `--step 1` for the old 240).

## The statue family

- **The adults are real 3D scans of people.** Dad, Mum and Grandpa are photogrammetry scans from Sketchfab (CC BY 4.0, credited in `assets/LICENSES.md`). `scans.py` turns each into one closed clay surface (voxel remesh, no photo colour), fits a 19-bone skeleton from body landmarks found on front and side renders, and skins it. `scan_pose.py` poses them: pelvis, spine and head aiming, and two-bone IK for arms and legs to points on the furniture and props.
- **The children are MakeHuman figures** (MPFB 2, `make_people.py`): Arlo, Zoe, Leo and Mira from the approved round-2 statues, with fitted garments, sculpted folds and face-unit expressions. Zoe wears the fitted cargo trousers when kneeling on the chair, because her loose ones balloon at the folded knee.
- **Milo** is a scan of a real stretching cat, standing on the rug just out of his bed.
- **`family.py`** builds every moment from the scans and the children and writes `assets/people/<moment>.blend` and `anchors.json` (where the plane, the picture book and Zoe's cushion go).
- **One material, `Statue Clay`** (`statue.py`): warm off-white `#e7e4de`, roughness 0.76–0.9 with large low-contrast variation, 4 mm subsurface, a micro bump, and a cavity term (AO + pointiness). A per-vertex `clay_fabric` attribute lets the same material carve a knit, a twill, combed hair strands or fur, with no colour. A `scan_tone` attribute keeps a faint, low-contrast trace of the scanned faces' shading so features read in the clay. `STATUE_MATERIAL` (or `ALARO_STATUE=<preset>`) switches between `clay_white` (default), `plaster`, `sandstone`, `terracotta`, `bronze` and `marble`.
- Dad's phone is carved in the same clay. Real props stay real: the block tower, cake and lit candles, paper plane, cat bed and the colour picture book.

## Moments: who and where

| Track key | Statues | Frozen pose |
|---|---|---|
| `tower` | Dad, Arlo | Dad kneels at the coffee table's edge on the sofa side, leaning in, both hands up either side of the tower, ready to catch it. Arlo kneels at the table's end, pulling a block that sits half out of the tower. |
| `sofa` | Zoe | Curled up on the sofa's west seat, knees up, laughing, one hand over her mouth, hugging a cushion. |
| `cake` | Grandpa, Mum, Zoe, Dad | Grandpa sits leaning over the cake to blow the candles, hands on the table; Mum claps at the window end; Zoe kneels up on a chair to see; Dad films with his phone held up in both hands. |
| `plane` | Leo, Mum | Leo on tiptoe on a stool, throwing arm fully out after the plane; Mum close behind, one hand at the small of his back and the other by his legs, looking up at the plane. |
| `catbed` | Milo | Stretching on the rug just out of his bed, three-quarter on to Alaro, in the last low sunbeam. |
| `book` | Mum, Mira | Mum sits back in the armchair with Mira in pyjamas on her lap, her arms round her to hold the picture book; Mum turns a page, both look at it. |

All statue groups stay in the home for the whole sequence (they are the kept moments). Each moment's box in `track.json` now covers the statue group plus its prop.

## Changes to placement and `ZONES` (please note)

Some furniture moved so the groups are visible from Alaro and do not hide one another. The frame windows (`AIM`), `POV`, `CLOCK`, the per-zone zoom and the iris beats are unchanged.

| What | v1 | v2 | Why |
|---|---|---|---|
| `ZONES['dining']` | (1.45, 1.15, 0.92) | (1.6, 0.95, 0.95) | centred on the birthday group, keeps the kitchen group at the frame's edge |
| `ZONES['kitchen']` | (−1.25, 1.75, 1.2) | (−1.8, 1.3, 1.3) | centred on Leo and Mum |
| `ZONES['catbed']` | (3.45, 1.0, 0.1) | (3.5, −0.35, 0.16) | the cat bed moved: in v1 it was hidden behind the dining table and chairs from Alaro's lens |
| `ZONES['book']` | (3.15, −2.45, 0.5) | (3.35, −1.85, 0.85) | the armchair came out of the corner and turned toward the room |
| cat bed | (3.45, 1.05) | (3.55, −0.35) | in Alaro's line of sight |
| armchair | (3.25, −2.55), 145° | (3.45, −1.95), 225° | faces Alaro; side table and floor lamp moved with it |
| coffee table / tower | (−1.2, −1.32) / tower at −1.02 | (−1.2, −1.22) / tower at (−0.85, −1.22) | room for Dad to kneel; Arlo can reach |
| dining chairs | four, two per side | three: Grandpa's (north, pulled out), one turned away, one Zoe kneels on | the story's places |
| cake | table centre | (1.45, 1.24) | toward Grandpa |
| island stools | three in a row | Leo's pulled out to (−1.9, 1.38) | Leo and Mum stand clear of the birthday shot |
| paper plane | mid-air over the island | just off Leo's fingers, flying across Alaro's view | it reads side-on |

## The lived-in home (`dressing.py`)

- **Photographic materials** (Poly Haven, CC0): oak plank floor with fine scratches, plaster walls, walnut and oak veneers with worn edges and a little dust on high tops, marble counter and tiled splashback with fingerprints, linen, velvet, teddy, corduroy and knit fabrics, herringbone and hessian rugs. The palette of v1 is kept.
- **Entry:** a door to the hall with frame, lever and switch; thermostat; coat rail with a jacket and a tote bag; doormat with shoes, one fallen over; an umbrella in the corner. On the sideboard: key bowl with keys, the post with an opened letter, sunglasses, a charger with its cable trailing to a socket, two family photos, a child's drawing propped against the wall.
- **Living:** board game open by the tower with pieces scattered (some on the rug), its lid under the table; toy car, blocks and a plush rabbit; a mug on a cork coaster next to an old ring stain; magazine; a plaid blanket over the sofa arm; a paperback face down; the remote; mixed cushions; a floor basket of throws; restocked bookshelf (printed spines of varied heights, a flat stack, a photo, a vase, a keepsake box, a carved elephant, a fern); speaker and records; a power strip and cables; a rug corner turned up; real pictures in every frame.
- **Dining:** mismatched chairs (one walnut, one painted sage), the hand-made "HAPPY BIRTHDAY" garland across the window, three balloons tied to Grandpa's chair, wrapping paper and ribbon on the turned chair, an opened present with tissue, napkins, water jug, kids' cups, a phone, the cake knife and crumbs, a party hat; the pendant's cable is visible.
- **Kitchen:** kettle, toaster, coffee maker, fruit bowl with bananas, apples, a pear and a lemon; cutting board with a knife, half a lemon and slices; dish rack with plates and cups; oven door with a gingham tea towel over its handle; spice jars and oil bottles with plain labels; a fridge covered in magnets, children's drawings and a calendar; a cookbook propped open; aloe on the sill; a pedal bin; a lunchbox; a croissant; a school bag by the island.
- **Window wall:** real houseplants (money tree, pothos, a calathea with some yellowing leaves), watering can, the cat's bowl and a toy mouse, window latches, fuller sheer curtains with a weighted hem, a light film of dust and specks on the glass; a radiator on the front wall.
- **Reading nook:** stack of picture books, glass of water and reading glasses on the side table, knitted throw, a teddy, slippers, two pictures above.
- **Everywhere:** sockets, switches, a smoke detector, cable runs, wall scuffs, art at different heights.
- **Outside:** a 3D garden instead of v1's flat emissive backdrop: patio, lawn, flower-bed shrubs, a small tree, a board fence, and the neighbours' house to the south-east (placed so the low sun still reaches the window) with a few windows that light up at night.
- **Artwork** (`make_art.py`): paintings, prints, children's drawings, calendar, garland, picture-book spread, cookbook and letters are drawn procedurally for the project. No brands, real people or known artworks.

## Light, camera and render

- Sun and sky timeline as v1 (28° at 3:40 pm, setting by ~7 pm). The sun lamp now lingers as a low golden beam (never below 5°) until about 7:45 pm, so Milo stretches in the last of the sun while the sky itself darkens on time.
- Window portal kept; the night fill dropped from 26 W to 9 W so the room falls off into shadow away from the lamps. Practical lamps are 2700 K and the table and floor lamps throw pools of light through their shades. The neighbours' windows come on after sunset.
- AgX Medium High Contrast with exposure keyed per frame (as v1).
- Depth of field on Alaro's holds (f/4 at full zoom, focused on the moment). Motion blur off.
- Lens finish applied to every frame in `build_home.py` (`LENS`): ~17 % vignette, a sub-pixel chromatic aberration at the corners, ~1.5 % fine luminance grain seeded per frame, and a slight warm balance. No blur.
- **Final settings** (`--final`): 3840×2160 by default (`--w 2560` / `--w 1920` still work), 512 samples, adaptive threshold 0.005, OptiX denoiser on NVIDIA and OIDN elsewhere with albedo + normal passes, light tree on, 12 bounces / 12 transmission / 2 volume, caustics off, persistent data, auto tiles, Blackman-Harris 1.5 px.
- **Output:** `frames/4k/fNNN.png` (8-bit sRGB master) + `fNNN.webp` (q95) + `track.json` + `render-info.txt`, resumable and coarse-to-fine, with a time estimate after three frames; `--zip` makes `alaro-frames-4k.zip` (WebP + track.json + render-info only).

## Files

| File | What |
|---|---|
| `site/tools/home-scene/build_home.py` | scene, story, render paths (updated) |
| `site/tools/home-scene/dressing.py` | the lived-in layer (new) |
| `site/tools/home-scene/statue.py` | `Statue Clay` material and presets, figure linking (new) |
| `site/tools/home-scene/family.py` | poses everyone for the six moments, writes `assets/people/` (new; only needed to change the figures) |
| `site/tools/home-scene/scans.py` / `scan_pose.py` | download, clay-convert, rig and pose the scanned adults and cat (new) |
| `site/tools/home-scene/make_people.py` | builds and poses the MakeHuman children (new) |
| `site/tools/home-scene/furniture.py` | the round-3 soft furniture after the reference images (new) |
| `site/tools/home-scene/make_art.py` | the home's artwork (new) |
| `site/tools/home-scene/fetch_assets.py` | downloads the Poly Haven assets (new) |
| `site/tools/home-scene/assets/` | people, Poly Haven assets, artwork, `LICENSES.md` |
| `site/tools/home-scene/render_gpu.command` / `.bat` | one-click 4K render + zip |
| `site/tools/home-scene/RENDER_ON_GPU.md` | the guide, with 4K numbers |
| `alaro-camera/fonts/Inter-Bold.otf` | the logo font, shipped so the kit renders the same logo everywhere |

Large binaries (Poly Haven assets, statue `.blend`s, the packed `home.blend`) are in the render kit zip rather than in git; see `site/tools/home-scene/.gitignore` for how to regenerate them.

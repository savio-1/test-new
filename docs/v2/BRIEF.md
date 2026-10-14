# Alaro home scene, v2: clay-statue people in a lived-in home

This brief is for the Claude session that builds the next version of the 3D home behind the Alaro website's hero. Read it fully before writing code. `START_HERE.md` has the short version and the steps.

---

## 1. What exists today (read `project/ALARO_CONTEXT.md` for detail)

**The website hero** is a scroll-scrubbed image sequence: **240 frames, 16:9**, rendered in Blender Cycles and played on a `<canvas>`.

**The story** is one afternoon to night in an open-plan home:
1. The camera glides to Alaro, a small smart home camera on a walnut sideboard.
2. The view drops into Alaro's lens. From there Alaro turns to six family moments, each held for a few seconds.
3. The camera pulls back out to the lamp-lit home at night.

**The HUD:** for every frame, the scene script exports where each moment's prop lands on screen (`track.json`). The website draws a detection box on it and shows a small card playing a real clip from the brand film. See `references/current-frames/` for how it looks today and `references/detection-boxes.jpg` / `video-scenes.jpg` for the HUD.

**The code that builds it:**
- `project/site/tools/home-scene/build_home.py` builds the whole home procedurally, sets the camera, lights, sun and exposure for every frame with `apply_frame(R, f)`, renders, and writes `track.json`.
- The Alaro camera model comes from `project/alaro-camera/build_alaro_camera.py`. The scene script imports it from `../../../alaro-camera/`, so keep that folder layout.
- `project/site/components/hero/homeStory.ts` is the website's copy of the timing (moments, iris, chapters). It is here for reference: **do not change timing** (section 6).

**What's wrong with v1:**
1. **There are no people.** The moments show empty furniture next to a prop (a block tower, a cake), and the people exist only in the video cards.
2. **The home looks like a showroom set,** not a home someone lives in: too clean, too empty, too even, with blank picture frames and nothing personal.

## 2. What v2 must deliver

1. **Clay-statue people** in every moment: life-size, solid, matte off-white figures frozen mid-moment. The style is in `references/statue-style/` and section 3.
2. **A lived-in, natural home:** the same layout and story, but filled with daily-life objects and imperfections so it reads as a real family home (section 4).
3. **Photographic realism in light, camera and materials** (section 5).
4. **The same camera path, timing and frame count,** so the website keeps working without code changes (section 6).
5. **A GPU render kit** that renders the final frames at **4K (3840×2160)**, sharp and clean, on the owner's GPU machine with one command (section 7). The owner's own machine is CPU-only, and the cloud session is too, so on CPU you only make drafts and test frames.

---

## 3. The statue people

### 3.1 Style (match `references/statue-style/clay-figure-standing.png` and `clay-figure-sofa.png`)

**The look:** every person is a monochrome, matte, slightly warm off-white sculpture, like unglazed clay, plaster or a "clay render". Read this list against the two reference images:
- **Full human proportions and realistic anatomy:** hands with real fingers and knuckles, natural faces with calm, believable expressions. Not stylised, not cartoon.
- **Clothing sculpted with real fabric behaviour:** gravity folds, creases at elbows and knees, collar edges, a sweater's ribbed cuffs and hem.
- **Fine surface texture that suggests the fabric** without colour: a visible knit on a sweater, a smoother weave on trousers. In the standing reference you can see the knit.
- **Hair as sculpted volume:** clumped curls or combed strands carved into the solid, never strand hair. See the curly hair in the sofa reference.
- **The same off-white material on everything:** skin, hair, clothes, shoes and phone are one continuous surface. There is **no colour on the figures.**

**Material** (name it `Statue Clay`; one shared material, parameterised so it can be swapped later):
- Base colour about `#e7e4de` (warm off-white). The final material choice may change later (bronze, sandstone, terracotta, marble), so expose a `STATUE_MATERIAL` preset in the script with `clay_white` as the default.
- Roughness 0.75–0.9, varied gently by a large, low-contrast noise.
- A very slight subsurface (scale ~2–5 mm), so the edges of thin parts like fingers and ears soften under strong sun the way plaster does.
- A micro bump of fine noise, plus a cavity term (Ambient Occlusion node or Geometry ▸ Pointiness) that lightly darkens deep creases and slightly brightens worn high points.
- Keep it **clean and new**, like the references: no heavy dirt or chips.

**Light on statues:** the references read as real because hard window light rakes across the figures and shows every fold. Make sure the sun (afternoon) and the lamps (evening) hit the figures from the side.

### 3.2 The family (one consistent model per person, reused across moments)

| Person | Age / build |
|---|---|
| Dad | ~40, medium build |
| Mum | ~38, slim |
| Grandpa | ~70, slightly stooped |
| Arlo | boy, ~9 |
| Zoe | girl, ~6 |
| Leo | boy, ~5 |
| Mira | girl, ~4 |
| Milo | the cat, also a clay statue |

**Clothing:** everyday, simple and readable as sculpture. Knit sweater, shirt, joggers, a dress, a cardigan. Kids in pyjamas for bedtime.

Mum and Dad appear in more than one moment. Each person should be **one base model posed differently per moment**, so faces and builds stay consistent.

### 3.3 The six moments: poses, frozen at the peak of the action

Names are placeholders. Keep each moment at the same place and prop as today, because the camera aims there.

| Track key | Where | Who | Frozen pose | Real objects kept (not clay) |
|---|---|---|---|---|
| `tower` | living room, coffee table | Dad and Arlo | Kneeling on the rug either side of the table. Arlo is mid-pull: tongue out, one block half out of the tower, held between finger and thumb. Dad leans in with his hands raised as if the tower might fall. | the wooden block tower (real wood colour), mugs, a board-game box |
| `sofa` | sofa | Zoe | Curled up laughing, head thrown back, knees up, one hand over her mouth, a cushion half hugged. | real cushions and throw |
| `cake` | dining table | Grandpa, Mum, Dad, kids | Grandpa leans over the cake with cheeks puffed, blowing the candles. Mum is mid-clap. A child is kneeling on a chair to see. Dad holds a phone up, filming. | the cake with **real lit candles** (the flames stay emissive and flicker per frame), plates, glasses, a party hat, a gift with ribbon |
| `plane` | kitchen island | Leo and Mum | Leo on tiptoe on a stool, throwing arm fully extended, the paper plane just leaving his fingers. Mum behind him, steadying the stool, looking up at the plane. | the paper plane (real paper white, so it differs a little from clay), fruit bowl, kitchen things |
| `catbed` | window wall, cat bed | Milo (cat) | Mid-stretch in the sunlight, front paws reaching out, back arched. | the real cat bed, yarn and bowl |
| `book` | reading nook armchair | Mira and Mum | Mum in the armchair, Mira on her lap in pyjamas, both looking at the picture book. Mum's hand is turning a page that is caught mid-air. | the real open picture book (in colour), throw, mug, reading lamp |

**What stays in colour:** only the people (and Milo) are clay. The home, furniture and props keep their real materials. That contrast is the point: the people are "kept moments" frozen in a living home.

### 3.4 How to make the figures (pick what works, but keep it reproducible)

- **Recommended: MPFB 2** (MakeHuman's Blender add-on, CC0 output). It's scriptable from Python, so ages, builds, clothing and poses can live in the build script. Pose with the rig, apply, then sculpt or displace detail: a knit displacement on sweaters, plus fold detail. Hair can be MPFB's or sculpted.
- **Alternative: image-to-3D** (Hunyuan3D 2, Tripo, Meshy, Rodin). Generate a front image of each pose in this clay style, convert it to a mesh, clean up the hands, then import. This is faster for complex poses, but needs those services (the owner would have to run them), and the poses are harder to adjust.
- **Optional:** a cloth simulation for clothes, settled and then frozen as mesh, for natural folds.
- **Detail level:** the figures are seen from a few metres away, with close-ups when Alaro zooms in (up to ~50 mm). So use ~150–400k triangles per adult, with real fingers. Use adaptive subdivision or a displacement modifier rather than huge base meshes.
- **Asset folder:** save figures as `.blend` files under `site/tools/home-scene/assets/people/` and link them in. Record the source and licence of anything not made from scratch in `assets/LICENSES.md`.

---

## 4. Making the home lived-in and natural

**Keep:**
- the floor plan
- the room size (9 × 7 × 2.8 m)
- the zones and where the moments are
- the window wall, the sideboard with Alaro, and the camera path

**Change:** everything that makes it look like a set.

### 4.1 Principles
- **Real proportions, and nothing perfectly straight or centred.** Rotate objects a few degrees off grid. Stack books unevenly. Leave cushions dented. Leave a chair pulled out and a throw draped crooked.
- **Evidence of a family** in every zone: things left mid-use, kids' things, everyday clutter. It should be **tidy-ish, not styled**.
- **Bevels on every hard edge** (1–3 mm) so edges catch light. CG's sharp edges are the biggest giveaway.
- **Material variation:** no flat colour on large surfaces. Add roughness variation, fingerprints on glossy surfaces, slight wear on table edges and door handles, a little dust on top of high shelves, fine scratches on wood floors.
- **Real textures where possible:** Poly Haven (CC0) textures, HDRIs and models are ideal. Download them into `assets/` and pack them, so the GPU machine needs no internet. Fall back to the existing procedural materials where a download isn't possible.

### 4.2 Things to add, by zone (the list is long on purpose; pick and place naturally)

- **Entry / near the sideboard:**
  - a key bowl with keys
  - a stack of mail with an open envelope
  - sunglasses
  - a phone charger cable trailing to a socket
  - a kid's drawing propped against the wall
  - framed **family photos** (subjects can be simple clay-style or abstract; no recognisable real people)
  - a coat hook with a jacket and a tote bag
  - shoes on a mat, one fallen over
  - a small umbrella
- **Living room:**
  - an open board-game box with scattered pieces near the tower
  - kids' toys: a toy car, a plush animal, a couple of blocks under the coffee table
  - a TV remote
  - a magazine and an open paperback face-down
  - a half-drunk mug with a ring stain
  - a coaster
  - a blanket thrown over the sofa arm
  - cushions of mixed sizes and fabrics
  - a floor basket with throws
  - books with **varied colours and heights** (spines, not blank boxes), some lying flat
  - a speaker or record player
  - a power strip and cables behind furniture
  - a rug with a slightly turned-up corner
  - a real painting or print in each frame (abstract or landscape; no famous artworks, no brand names)
- **Dining:**
  - mismatched chairs, one turned
  - birthday decorations: a hand-made "Happy birthday" paper garland, a few balloons, wrapping paper and ribbon on a chair, an opened gift
  - napkins
  - a water jug
  - kids' cups
  - a phone left on the table
  - crumbs and a cake knife
  - a pendant light with a visible cable
- **Kitchen:**
  - a kettle, a toaster, a coffee machine, a fruit bowl with real fruit
  - a cutting board with a knife and half a lemon
  - a dish rack with a few plates and cups
  - a tea towel over the oven handle
  - spice jars and oil bottles with plain, non-brand labels
  - a fridge with magnets, kids' drawings and a calendar
  - a cookbook propped open
  - a plant on the sill
  - a small bin
  - a lunchbox
  - a school bag on a stool
- **Window wall:**
  - curtains with real folds and slight movement between frames (optional)
  - houseplants of different species and sizes, some leaves yellowing
  - a watering can
  - the cat's food bowl and a toy mouse
  - a radiator
  - a window latch
  - a light film of dust and specks on the glass, catching the sun
- **Reading nook:**
  - a stack of picture books
  - a reading lamp
  - a side table with a glass of water and reading glasses
  - a knitted throw
  - a soft toy
  - slippers
  - a bookshelf with clutter between the books: photos, a small vase, a box
- **Everywhere:**
  - light switches and sockets
  - skirting boards
  - door frames
  - a ceiling smoke detector
  - visible cable runs
  - a thermostat
  - wall art at different heights
  - slight wear marks
- **Outside the window:** a real garden or street rather than a flat emissive backdrop. A Poly Haven HDRI, or a simple 3D garden: fence, trees, neighbouring house walls. It should read as overexposed daylight in the afternoon and dark with a few lit windows at night.

**Things to avoid:**
- real brand names or logos
- recognisable real people
- copyrighted artworks
- anything rude or religious

---

## 5. Realism of light, camera and render

- **Light:**
  - keep the sun and sky timeline (`CLOCK`, sun falling from 28° at 3:40 pm to below the horizon by ~7 pm, lamps on from ~6:45 pm, candles f84–112)
  - add a real HDRI sky (or the current Nishita sky) for the window light
  - use portal lights on the windows
  - make the light falloff strong: the room should be darker away from the window
  - use warm practical lamps (2700 K) at night, with visible light pools
- **Colour management:** AgX (Medium High Contrast), with exposure keyed per frame as today. Avoid a flat, evenly lit look.
- **Camera realism:**
  - real focal lengths, as today
  - shallow depth of field on close holds
  - slight lens vignetting
  - very subtle chromatic aberration and lens distortion (compositor, or the camera's lens settings)
  - a hint of sensor grain, about 1–2% in the compositor, kept fine so frames stay sharp
  - no heavy bloom
- **Motion blur:** off, or a very short shutter (≤ 0.1). The frames are scrubbed by scroll, and blurred frames read as soft.
- **Output:** sharp, clean frames. The owner rejected anything that looks blurry or like two frames mixed. Denoise with OptiX or OIDN using albedo and normal passes, so fine detail (knit, book spines) survives.

---

## 6. Contract with the website (do not break)

- **Keep 240 frames,** numbered `f000`–`f239`, at a **16:9** aspect.
- **Keep the camera path and timing:** `AIM`, `ZONES`, `POV = (61, 199)`, `CLOCK`, `EXPOSURE`, per-zone POV zoom, and the iris beats. The website's `homeStory.ts` (moment windows, chapters, iris) depends on them. If a statue group needs the aim point nudged, adjust `ZONES` slightly but keep the frame windows. List any change in your report.
- **`track.json`** must be regenerated by the script (the `--data` / `--render` path already does this):
  - **Same format:** `{ frames, data: [{ f, time, pov, lens?, <key>: [x0, y0, x1, y1] }] }`, with coordinates normalised 0..1 and the origin at top-left.
  - **Same keys:** `alaro sofa tower cake plane catbed book`.
  - Each moment's box must now cover **the statue group plus its prop**: add the figures' meshes to `TRACK['<key>']`.
  - A sample is in `project/site/public/media/home/track.json`.
- **The Alaro model, its white finish and the sideboard stay as they are.** The pan/tilt animation stays too.

---

## 7. Rendering: drafts on CPU, final 4K on GPU

### 7.1 What to do in your session (CPU only)
- **Do not attempt 4K or final-quality renders.** The draft cost on a 4-CPU box is about 35–50 s per frame at 960×540.
- Iterate with test frames:
  ```
  python3 build_home.py --test 0,25,52,72,84,104,130,154,182,232 --w 960 --h 540 --samples 24
  ```
  Then look at them yourself. These frame numbers are the reference stills in `references/current-frames/`, so compare old against new at each one.
- Make one full draft pass for timing and tracking checks:
  ```
  python3 build_home.py --render   # 960×540, low samples → frames/hi/ + track.json
  ```
- Save the scene as `home.blend` (`--blend`), fully packed (textures and linked people included), so the GPU machine needs only Blender.

### 7.2 What to build for the GPU machine (the owner runs it later)

Update the launchers `render_gpu.command` (Mac/Linux) and `render_gpu.bat` (Windows) so that **one double-click renders the final 4K set:**
```
blender -b -P build_home.py -- --render --final --gpu --w 3840 --samples 512 --set 4k
```

**Requirements for the final path:**
- **Resolution:** default to **3840×2160**. Keep `--w 2560` and `--w 1920` working as cheaper options, and make `--w` the only switch needed.
- **Cycles settings:**
  - samples 512 with an adaptive threshold of ~0.005
  - denoiser OptiX on NVIDIA and OIDN elsewhere, with albedo and normal guiding passes
  - light tree on
  - `max_bounces` 12, transmission 12, volume 2
  - caustics off
  - persistent data on (for speed across frames)
  - tile size auto
  - film filter Blackman-Harris 1.5 px (default), for sharpness
- **GPU detection** as today (OptiX / CUDA / HIP / Metal / oneAPI), printing the device found and falling back to CPU with a clear warning.
- **Output:**
  - `frames/4k/f000.png … f239.png`: 8-bit sRGB PNG, lossless (the master)
  - and `f000.webp …` at **WebP quality 95** next to it (for upload)
  - and `frames/4k/track.json` for the same frames
- **Resume and order:** finished frames are skipped on re-run. Keep the coarse-to-fine order (every 16th frame, then 8th, …) so a partial set is usable.
- `--start / --end` for splitting across machines.
- **When finished,** the launcher zips **only the WebP frames + `track.json` + a `render-info.txt`** (resolution, samples, device, Blender version, date) into **`alaro-frames-4k.zip`**. That is the file the owner brings back. Do not put the PNGs in the zip: 240 4K PNGs are ~3–4 GB.
- **Estimates and guide:** print a time estimate after the first few frames. Update `RENDER_ON_GPU.md` with the 4K numbers. Rough expectations at 3840×2160 / 512 spp:

  | Graphics card | All 240 frames |
  |---|---|
  | RTX 4090 | ~4–6 h |
  | RTX 4070 | ~8–12 h |
  | RTX 3080 | ~10–14 h |
  | Apple M3 Max | ~16–24 h |

  Mention `--w 2560` (about 2.2× faster) as the fallback.
- **Self-contained kit:** the render kit must work from the zip alone. That means `alaro-camera/build_alaro_camera.py`, `site/tools/home-scene/` (scripts, launchers, packed `home.blend`, `assets/`) and the guide, keeping the folder layout. Produce it as **`alaro-render-kit-4k.zip`**.

---

## 8. Checks before you hand back

1. **Test frames:** render the 10 test frames at 960×540, make a contact sheet, and look at every frame. Check that:
   - the statues read as clay sculpture, like the references
   - hands and faces are clean
   - every moment reads at a glance
   - the home looks lived-in, not staged
   - no colour has leaked onto the figures
   - the candle flames, the plane and the book are visible
2. **Tracking:** check that the boxes in `track.json` frame each statue group plus its prop in those test frames (draw them onto the contact sheet).
3. **Draft pass:** run the full low-res draft pass and confirm all 240 frames exist and nothing jumps between neighbouring frames.
4. **GPU path:** run the GPU launcher's code path once on CPU at a tiny size, for example `--final --w 640 --samples 16 --start 0 --end 2 --set 4k`, to prove it writes PNG + WebP + `track.json` + the zip.
5. **Hand over to the owner:**
   - `alaro-render-kit-4k.zip`
   - the contact sheet of the test frames
   - a short list of what changed, especially any `ZONES` nudges
   - the asset licences

## 9. Bringing the result back

The owner renders on the GPU machine and brings **`alaro-frames-4k.zip`** (WebP frames + `track.json`) back to the original website session. There, the frames are packed for the web (sized per device) and the hero is republished. Nothing else is needed from this session.

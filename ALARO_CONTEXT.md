# Alaro: full project context

This file is the brief for picking the project up again: in a new Claude session, on another machine, or with a new person. It covers the 3D camera model, the immersive 3D home hero on the website, and how both are rendered, built and published. Read it before changing anything.

- **Repo / branch:** `savio-1/testing` → `claude/eager-wozniak-m17no9`
- **Live preview:** https://claude.ai/artifact/PpLnDrjJ3xiSuceCPhmDFc. It is private: the owner shares it from the page's Share menu.
- **Website source this was built from:** `saviosunny9/testing` → `claude/caveman-cli-setup-ogqlwo`, copied into `site/`.
- **Older briefs still in the repo:**
  - `site/docs/SITE_CONTEXT.md`: the whole site, minus the hero.
  - `site/docs/ALARO_FIRST_DRAFT_CONTEXT.md`: the first redesign brief.
  - `site/docs/HERO_CONTEXT.md`: the original film hero brief, now replaced.
  - **Where they disagree with this file about the hero, this file wins.**

---

## 0. Current state (read first)

| Part | State |
|---|---|
| Camera model (Blender) | **Done.** One-to-one port of the site's procedural model, with a soft-touch matte shell. `.blend`, 3 GLBs and 6 product renders. |
| Immersive 3D hero | **Built and live**, all 240 frames, **draft quality** (960×540, low samples). Story, timing, tracking and UI are final candidates. |
| Final-quality frames | **Waiting on a GPU render.** The kit renders 1920×1080 on any GPU machine; frames come back as `alaro-frames-hd.zip`. |
| Rest of the site | Unchanged from `SITE_CONTEXT.md`, except that the old hero components were deleted. |

**Next steps:**
1. Run the GPU kit (§5.3).
2. Pack the HD frames (§5.4).
3. Republish the preview to the same link (§7).
4. Review on real phones; only headless Chromium has been tested so far.

---

## 1. Repository layout

```
ALARO_CONTEXT.md                     this file
.gitignore / .gitattributes          *.bat keeps CRLF, *.command keeps LF
HERO_CONTEXT.md, docs/, public/      the original hero brief and its film media (pre-dates this work)

alaro-camera/                        the 3D camera model
  build_alaro_camera.py              builds everything below (Blender Python)
  alaro-camera.blend                 studio scene, Graphite finish; all 3 finishes inside
  alaro-camera-{graphite,white,red}.glb
  renders/*.png                      6 product renders (Cycles, 1400×1400)
  README.md

site/                                the Alaro Next.js website
  app/, components/, lib/            site code (hero changed, see §4)
  components/hero/HomeStory.tsx      the immersive 3D hero
  components/hero/homeStory.ts       story config: moments, windows, iris, chapters
  components/hero/Hero.tsx           picks HomeStory or the reduced-motion stills
  components/hero/FilmPlayer.tsx     full-screen film; now takes startAt (seconds)
  lib/frameSequence.ts               scroll image-sequence loader/player
  app/globals.css                    design system + "Immersive hero" block (.hs-*)
  public/media/home/                 packed frames: lo/ hi/ atlases, manifest.json, track.json, stills/
  docs/STORYBOARD.md                 storyboard and scroll plan for the hero
  tools/home-scene/
    build_home.py                    builds and renders the 3D home (Blender Python)
    pack_frames.py                   frames → WebP atlases for the web
    render_gpu.bat / .command        one-click GPU render launchers
    RENDER_ON_GPU.md                 how to render the final frames elsewhere
    home.blend                       the whole home, story keyframed (camera, Alaro, sun, lamps, exposure), Cycles final settings
    alaro-home.glb                   the whole home as glTF: flat PBR colours, 7 lamps, story camera + Alaro pan/tilt animation
    frames/                          raw renders (git-ignored; hi/ = 960×540 draft PNGs)
```

**Toolchain:**
- Blender 5.2 as a Python module (`pip install bpy`). Scripts also run in Blender 4.2+ via `blender -b -P script.py -- args`.
- Node 22, Next.js 15, React 19, Tailwind 3, GSAP 3.15, Lenis, three.js 0.170.
- Pillow for packing.

---

## 2. The camera model (`alaro-camera/`)

### 2.1 Geometry
A port of `lib/three/alaroCamera.ts`, the procedural model behind every product render on the site. Dimensions are the same, in centimetres; the scene unit is metres, so the camera is **13.85 cm tall** with a **7.4 cm base**.

| Part | Spec (cm) |
|---|---|
| Base | lathe, radius 3.7, height 4.4; dark seam groove at 3.45–3.5; rotating cap above it |
| Logo | "alaro." wrapped on the base at 0.32 rad right of front, 1.5 cm up, 1.15 cm wide. Font: Inter Display Bold, because Switzer ships as woff2 only, which Blender can't load. |
| USB-C | real boolean recess at the back (0.95 × 0.32, r 0.16), with a tongue inside |
| Arm + stem | rear arm (bevelled), stem box 1.0 × 1.4 × 1.2; hinge knuckle |
| Head | lathe, radius 4.1, length 4.6; back groove ring; **speaker grille = 24 real holes** (4 × 6) on the head's left |
| Front | domed black glass (sphere R 24), inner window disc, rim torus, lens barrel + bezel ring (satin metal), refracting lens element over aperture/pupil/coating, two sensor dots |

**Rig:** `Alaro` (root) > `Alaro_Pan` (rotate Z) > `Alaro_Tilt` (rotate X; negative looks up). Front faces −Y in local space.

### 2.2 Materials: soft-touch, after wowfactories.com
The user asked for the finish of the Combine Driver on wowfactories.com: a soft-touch matte elastomer grip with satin bead-blasted metal.

- **Shell (`Alaro Soft-Touch {Graphite|White|Red}`):**
  - Principled BSDF, metallic 0, specular 0.32, sheen 0.2 (roughness 0.4, white)
  - roughness 0.58–0.68 driven by noise
  - fine stipple bump: noise scale 5200, strength 0.12
- **Finishes:**

  | Finish | Shell | Logo |
  |---|---|---|
  | Graphite | `#3a3b3e` | `#f2f2f2` |
  | Chalk White | `#eeedea` | `#2b2b2d` |
  | Nuuk Red | `#b8232b` | `#f7f2f0` |

- **Lens bezel (`Alaro Satin Bezel`):** metallic `#2a2b2e`, roughness 0.30–0.38, bead-blast bump.
- **Glass:** black `#020203` with coat 1, roughness 0.035. Inner window `#060608`. Rim `#0e0e10`, metallic.
- **Lens:** transmissive glass `#6a7aa6`, IOR 1.6, thin-film 320 nm, over a dark aperture, pupil and an iridescent coating ring.
- **Swap finish:** run `set_finish('red')` from the script, or swap material slots in Blender.

### 2.3 Outputs and commands
```bash
cd alaro-camera
python3 build_alaro_camera.py                     # .blend + 3 GLBs + 6 renders (~1 h on 4 CPUs)
python3 build_alaro_camera.py --no-render
python3 build_alaro_camera.py --quick             # low-res previews → renders/quick/ (git-ignored)
ALARO_VIEWS=rear-red,front-red python3 build_alaro_camera.py   # only some renders
```

**Studio for the product renders:**
- seamless sweep, lifted to the page colour `#f1f2f2` for camera rays only
- five area lights
- glossy rays see a dark world, so the black glass reads black instead of chrome
- **Standard view transform at exposure −2.4.** This keeps the finishes on their hex values; AgX turned the red salmon.

**GLBs:**
- metres, ~75k triangles, 1.4 MB each
- exported extensions: clearcoat, transmission, IOR, specular, sheen
- the procedural grain is baked to flat values on export: shell roughness 0.63 / sheen 0.2, bezel 0.34
- grain and lens thin-film don't export; add them back in three.js

**Using a GLB on the site:** to replace `createAlaroCamera()`, scale it ×100, because the site works in cm. The pan/tilt node names carry over.

**Renders** (`renders/`): `hero-graphite`, `three-quarter-white`, `front-red`, `rear-red`, `pan-tilt-graphite`, `detail-soft-touch-graphite`.

---

## 3. The immersive hero: concept and story

**Reference:** armory.in. Its hero is a pre-rendered **image sequence** scrubbed by scroll on a `<canvas>`, using GSAP ScrollTrigger + Lenis, with a low/high quality pass. That technique was chosen here because a path-traced home in Blender looks far more real than a real-time WebGL scene, especially on phones.

**Concept: "A day at home, kept."** One afternoon to night in a rendered open-plan home. Alaro sits on a walnut sideboard, wakes, and the view drops into its lens. It turns to six family moments. Each moment gets a detection box that **tracks the 3D prop frame by frame**, and a card playing the real clip from the brand film. Clicking a card opens the film at that scene.

**Full storyboard:** `site/docs/STORYBOARD.md`.

### 3.1 Beats (240 frames ↔ ~900vh of scroll; 640vh on phones)

| Frames | Time of day | Camera | On screen |
|---|---|---|---|
| 0–14 | 3:40 pm | wide from the reading-nook corner, slow push | preloader %, then H1 "This is home. / Alaro keeps what happens in it." |
| 14–43 | 4:10 pm | glide across the living room to a ¾ of Alaro (50 mm, shallow focus) | "01 · Alaro: It sits quietly on the sideboard." The status light wakes at f30. |
| 43–60 | 4:20 pm | Alaro turns to the camera; push along its axis into the black glass | "02 · Awake: Then it looks up. See what it sees." The iris closes onto the lens (f50–60). |
| 61–198 | 4:30–8:40 pm | **Alaro's POV**: camera at the lens, 17 mm, zooming in on each hold | Viewfinder (LIVE · room · clock), detection boxes, moment cards, captions, "Kept today" strip |
| 199–239 | 8:40–9:10 pm | pull back out of the glass, up and away to the lamp-lit home | "Six moments, kept. Nothing else stored.", then "Every moment, kept." with Buy and Watch the film |

### 3.2 The six moments (`components/hero/homeStory.ts`)

| Key (3D prop) | Box frames | Card frames | Title · who · room | Clip | Caption | Film at |
|---|---|---|---|---|---|---|
| `tower`: block tower on coffee table | 66–77 | 68–74 | Game night · Arlo & Dad · Living room | gamenight | Game nights that run late. | 3.0 s |
| `sofa` | 77–88 | 81–88 | Giggles on the sofa · Zoe · Living room | sofa | Giggles nobody planned. | 0 |
| `cake`: cake + lit candles, dining table | 95–114 | 99–114 | Grandpa's birthday · The whole family · Dining table | birthday | Wishes, made over candles. | 5.1 s |
| `plane`: paper plane mid-flight over island | 121–138 | 125–138 | First flight · Leo & Mum · Kitchen | kitchen | First flights, across the kitchen. | 10.1 s |
| `catbed`: cat bed by the window | 146–160 | 149–161 | Sunbathing · Milo · By the window | milo | And Milo, in the last of the sun. | 0 |
| `book`: open picture book on armchair | 171–191 | 175–192 | Bedtime story · Mira & Mum · Reading corner | storytime | Stories before bed. | 7.6 s |

**Rules for editing these windows:**
- Card windows must not overlap: allow a gap of at least 6 frames, or the captions cross-fade into each other.
- Keep `MOMENTS`, `IRIS`, `CHAPTERS` and `POV` in step with `AIM` in `build_home.py`.
- Names and the "Film at" times are placeholders carried over from the site (Mira, Arlo, Zoe, Leo, Milo, Grandpa).

---

## 4. The website hero (`site/`)

### 4.1 Components
- **`Hero.tsx`:** renders `HomeStory`, or `StillsHero` for `prefers-reduced-motion` (a stack of stills with moment cards, no pinning). It owns `FilmPlayer` with `startAt`.
- **`HomeStory.tsx`:**
  - one sticky stage; one `<canvas>` draws the frames
  - **HUD positions are written directly to the DOM in the GSAP ticker**, with no React re-render per frame. React state is only `pct`, `ready`, `failed` and `kept`.
  - **Scroll:** a ScrollTrigger (`top top` → `bottom bottom`) maps progress → frame. The frame tracks Lenis's (already smoothed) scroll directly; only jumps of more than 6 frames are eased. All easing is frame-rate independent (`follow(dt, ms)`).
  - **One frame at a time:** each scroll position shows the nearest whole rendered frame. A cross-fade between neighbouring frames was tried and rejected by the owner (it read as blurry / two frames at once).
  - **Layout:** cover-fit with 3.5% overscan. Horizontal focus follows the active moment's box (or Alaro), so phones crop toward the subject. Pointer parallax ±16/±9 px on fine pointers.
  - **Tracking:** boxes come from `track.json`, interpolated between frames, and are mapped through the same layout as the canvas. Label chips flip to stay on screen.
  - **Cards:** sit on the side away from the box (bottom on phones), joined to the box by a 1 px link line. Clips play only while visible.
  - **Iris:** a circle with a 200vmax black box-shadow. Closes onto the projected lens point (f50–60), opens from the centre (61–67), closes again (193–199), opens onto the lens (199–206).
  - **Viewfinder:** corners, REC dot, room and clock; visible f64–195. "Skip the story" fades while it's up.
  - **Other UI:** time-of-day rail (right), "Kept today" strip (bottom-right), preloader (`alaro.` + %), sr-only list of the moments.
- **`lib/frameSequence.ts`:** loads `manifest.json`, all `lo` atlases and the first two `hi` atlases (they drive the preloader %), then streams the other `hi` atlases as compressed blobs, nearest the current frame first (~12 MB for 1920×1080). Hi frames are decoded only for a window around the current frame (14 ahead / 6 behind in the scroll direction; 8 / 4 on phones or `deviceMemory` ≤ 4): `createImageBitmap` decodes an atlas off the main thread, it is cut into one `ImageBitmap` per frame and closed, and frames that leave the window are `close()`d. Drawing therefore never decodes on the main thread, and each frame step uploads one 1920×1080 frame instead of a 3840×2160 sheet (this was the old version's ~60 scroll hitches). The hero opens once the frames under the first view are decoded (or after 1.5 s). `lo` stays in memory as the fallback. Missing frames fall back to the nearest rendered one.
- **No grain over the hero:** the animated `film-grain` overlay (220% box, `mix-blend-mode: overlay`) was removed from the hero; it softened the renders and forced a full-screen blend every frame.
- **CSS:** `app/globals.css`, section "Immersive hero" (`.hs-*`). It follows the existing design system: Switzer light, mono labels, no bold, text only white/grey, fresh green only as tiny dots.
- **Header:** the hero section carries `data-header-theme="dark"`, so the header is white over the frames.

**Removed:** the old film hero (`HeroCopy`, `MomentTiles`, `HeroCamera`, `PreviewCopy`, `useHeroTimeline`). Its CSS (`.hero-*`, `.cam-*`, `.moment-*`) is still in `globals.css`, unused. `layout.tsx` now preloads `/media/home/lo/a00.webp`.

### 4.2 Assets (`public/media/home/`, produced by `pack_frames.py`)
| File | What |
|---|---|
| `lo/a00–a14.webp` | 480×270 frames, 4×4 per atlas, ~1.4 MB total |
| `hi/a00–a59.webp` | source-size frames, 2×2 per atlas. Draft 960×540 is ~4.2 MB total; HD will be ~30–50 MB. |
| `manifest.json` | sizes, grids, `have` (frames that exist) |
| `track.json` | per frame: `time` (hours), `pov`, `lens` [x, y], and boxes `alaro sofa tower cake plane catbed book` as [x0, y0, x1, y1], normalised 0..1, top-left origin |
| `stills/*.jpg` | intro, alaro, living, dining, kitchen, catbed, book, night (reduced motion / fallback) |

**Moment clips** come from the existing `public/media/moments/*.{webm,mp4,jpg}`.

### 4.3 Commands
```bash
cd site
npm install
npm run dev                  # http://localhost:3000
npm run build                # lint + typecheck + build
npm run export               # static site in out/ (relative URLs, fonts inlined): 195 files, ~15 MB
npx tsc --noEmit && npx next lint
```

**Verified:**
- build, typecheck and lint pass
- headless Chromium at 1440×900 and 390×844: all 18 sampled scroll points, every moment aligned, no failed requests

**Not yet verified:**
- real iOS/Android devices
- Safari
- the reduced-motion variant in a browser
- memory use with HD atlases on low-end phones

---

## 5. The 3D home and rendering (`site/tools/home-scene/`)

### 5.1 Scene (`build_home.py`)
- **Room:** 9 × 7 × 2.8 m, open plan. Units in metres, Z up; the room spans x −4.5..4.5, y −3.5..3.5.

| Area | What's there |
|---|---|
| Left wall | walnut sideboard with Alaro (White finish) facing +X, table lamp, books, bowl, art |
| Living | sofa (bouclé), cushions, throw, wool rug, walnut coffee table with the block tower, mug, book; art; oak bookshelf with books |
| Dining | oak table, 4 chairs, cake on stand with 5 candles + flames + candle light, plates, glasses, black cone pendant |
| Kitchen | sage cabinets along the back wall, stone counter, open shelf + jars, induction top, tap; island with stools, lemons, and the paper plane mid-air at 1.28 m; 2 opal globe pendants |
| Window wall | 4.4 m glazing with mullions, sheer curtains, plants + cat bed + yarn + bowl; outside is a soft emissive garden backdrop (reads as overexposed daylight) and a lawn |
| Reading nook | velvet armchair with an open picture book, throw, floor lamp, side table + mug, round rug, plant |

- **Materials:** all procedural (wood grain along each piece's long axis, oak plank floor, plaster, fabric weave with sheen, leaves with translucency).
- **Lighting:**
  - sun + Multiple-Scattering sky (`NISHITA` on Blender 4.x); sun elevation falls from 28° at 3:40 pm to below the horizon by ~7 pm
  - window portal light
  - night sky fades in
  - lamps fade on from ~6:45 pm
  - candles burn f84–112, then are blown out
  - AgX "Medium High Contrast", with exposure keyed per frame (`EXPOSURE`)
- **Story drivers:** `AIM` (Alaro's zone per frame), `ZONES` (aim points), `POV = (61, 199)`, `CLOCK` (time of day), per-zone POV zoom (17 → 30–52 mm on holds), DOF on close shots.
- **Every frame is set procedurally** by `apply_frame(R, f)`; `--blend` bakes it all to keyframes.

### 5.2 Commands
```bash
cd site/tools/home-scene
python3 build_home.py --test 0,43,105,130 --w 640 --h 360 --samples 12   # quick key frames → frames/test/
python3 build_home.py --render                       # draft: 960×540 PNG, 12 spp → frames/hi/ (+ track.json)
python3 build_home.py --render --final --gpu         # final: 1920×1080 WebP, 160 spp, full bounces → frames/hd/
python3 build_home.py --blend --glb                  # home.blend (keyframed, render-ready) + alaro-home.glb
python3 pack_frames.py                               # frames/hi → public/media/home
python3 pack_frames.py --src frames/hd               # HD frames → public/media/home
```

**The home as files:**
- **`home.blend`** (~1.3 MB, Blender 5.2): open it and press Render → Render Animation for the full sequence. It's set up as Cycles, 1920×1080, 160 spp, with exposure keyed per frame. All procedural materials are intact.
- **`alaro-home.glb`** (~3.7 MB): 447 objects, flat PBR colours (each procedural texture replaced by its average tone, because glTF can't carry procedural textures), 7 lamps, and the animations `Story CameraAction`, `Alaro_PanAction`, `Alaro_TiltAction` and `SunAction` (frames 0–239).
  - three.js plays these with an `AnimationMixer`.
  - Blender's glTF importer brings them in **unassigned**: set each object's action yourself after importing.

**Behaviour:**
- Renders go coarse to fine (every 16th frame, then 8th, 4th, 2nd, 1st) and **skip frames that already exist**. Restarts resume, and a partial set is usable at any time.
- Options: `--start/--end`, `--samples`, `--w`, `--force`, `--format png|webp`.
- **Draft cost on this 4-CPU cloud box:** ~35–50 s per frame, ~2 h for all 240.

### 5.3 Final quality on a GPU (the next step)
- **Kit:** `alaro-render-kit.zip` (sent in chat) holds `alaro-camera/build_alaro_camera.py` plus `site/tools/home-scene/` (build_home, pack_frames, launchers, guide).
- **Run it:** with Blender 4.2+ installed, double-click `render_gpu.bat` (Windows) or `render_gpu.command` (Mac/Linux).
  - It auto-detects OptiX / CUDA / HIP / Metal / oneAPI and falls back to CPU.
  - It renders 1920×1080 at final quality and zips `frames/hd` into `alaro-frames-hd.zip`.
- **Expected time:** ~40–80 min on an RTX 40-series card; ~2–4 h on an RTX 30-series card or Apple M-series.
- **Full guide:** `RENDER_ON_GPU.md`.
- **Known gap:** GPU detection is coded but has only been exercised on a CPU-only machine.

### 5.4 Bringing HD frames back
1. Unzip `alaro-frames-hd.zip` into `site/tools/home-scene/frames/hd/`.
2. `python3 pack_frames.py --src frames/hd`
3. `npm run export`
4. Republish (§7).

No code changes are needed: the player reads frame size from `manifest.json`. `track.json` doesn't change either, because the coordinates are normalised and the aspect is the same 16:9.

---

## 6. Decisions and why

| Decision | Reason |
|---|---|
| Pre-rendered image sequence, not real-time WebGL | Real GI, soft shadows and glass reflections; works on phones. Same technique as armory.in. |
| Frames packed as WebP atlases (lo 4×4, hi 2×2) | Few requests, and the artifact host caps file counts (≈255 per publish, 511 per version). |
| Real film clips in moment cards, no 3D people | Procedural people look uncanny. The 3D home shows *where*; the film shows *what*. |
| Iris into the lens | Carries the old hero's aperture idea, and hides the cut between the outside camera and Alaro's POV. |
| Draft at 960×540 | CPU-only cloud box: 1080p at final samples would take days here. The GPU kit closes the gap. |
| Standard transform for product shots, AgX for the home | Product shots keep brand hex colours; the interior needs AgX's highlight roll-off. |
| Alaro is White in the home scene | Reads best against the walnut sideboard. Change it in `sideboard_and_alaro()` (`alaro.build_camera('white')`). |

---

## 7. Publishing the preview

The live preview is a small wrapper page (a full-screen `<iframe src="site/index.html">`) with the static export published beside it under `site/`.

1. `cd site && npm run export`
2. Copy `out/` to `<preview dir>/site/`. The wrapper is `<preview dir>/index.html`, titled "Alaro Home Story".
3. Publish to the **same URL**, https://claude.ai/artifact/PpLnDrjJ3xiSuceCPhmDFc:
   - pass the wrapper as the page and every file under `site/` as supporting files
   - pass `null` for chunk files whose hashed names changed, so the stale ones are removed
4. Limits: 195 files / ~15 MB for the draft; HD will be ~50–60 MB, still within the limits.

**History:** version 1 had 28 frames; version 2 has all 240 draft frames.

---

## 8. Open items

- **HD frames:** run the GPU kit, pack, republish. Consider 2560 px (`--w 2560`) for large retina screens.
- **Real-device QA:** iOS Safari and Android Chrome. Check scroll feel, atlas decode hitches, and memory with HD atlases. If memory is tight on phones, serve `lo` plus a 1280-px set to small screens.
- **Placeholders:**
  - moment names, "Film at" times (sofa and milo have no known scene time, so they start at 0)
  - logo font (needs a Switzer `.otf` for an exact match)
  - business copy inherited from `SITE_CONTEXT.md`
- **Dead CSS:** the old hero's CSS in `globals.css` can be removed in a cleanup pass.
- **Licensing:** the 3D home and camera are original procedural builds. Clips and stills are the client's film. Fonts: Switzer (ITF Free Font License) and Inter (OFL).
- **Sound:** the header sound toggle still plays the old film's music and voiceover; the voiceover is timed to the film, not to the 3D story. Re-time it or drop the voice for the new hero.
- **Next direction (agreed, not built): people as statues.** Instead of real or animated people, each moment gets a life-size statue group frozen at the peak of the action (Leo mid-throw with the plane just leaving his hand, Zoe mid-laugh, candles being blown, a block half-pulled, a page mid-turn, Milo stretching). Hair and cloth are caught mid-movement in the material; the room around them keeps moving (candle flames, dust in the light, steam, curtains). The moment video cards stay as they are. Reference: `docs/reference/statue-frozen-motion.png` (weathered stone, frozen wind-blown cloth, slow low camera drift). Material to be chosen at build time (bronze/patina, sandstone, terracotta, marble, plaster). Figures: image-to-3D (Hunyuan3D / Tripo / Meshy / Rodin) or MPFB in Blender, with a frozen cloth-sim frame for the wind-blown hair and cloth; procedural dust, stains and edge wear. Open question: add a slight camera drift during the holds in Alaro's view for parallax, or keep the camera turning from one fixed spot like the real product.

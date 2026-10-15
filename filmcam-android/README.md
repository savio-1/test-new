# FilmCam (Android)

A camera app that shoots photos and video through a live film emulsion, at the phone's full
resolution: 4K or 8K video where the hardware allows, full-sensor stills, and every lens on the
phone. What you see in the viewfinder is what gets saved, borders included.

![The forty cameras, rendered by the app's own shaders](docs/looks.jpg)

*All forty cameras, rendered through the app's real shaders by `tools/look-preview`.*

## Cameras

Forty presets in six groups. Each one pairs a film stock with a format and the effects that go
with it, and every setting can be changed live afterwards. The names describe looks; none of them
is a real product or brand.

| Group | Cameras |
|---|---|
| **35mm** | Classic 35, Portrait, Verde, Vivid SLR, Disposable '98, Half Frame, Slide, Contact Strip, Cross-Pro, Redscale, Expired |
| **Cine** | Cine 800T, Cine 250D, Scope (anamorphic 2.39), Bleach Bypass, Super 8, Super 8 Reel, 16mm, K-64 Reel, 1929 Color (two-strip), Technicolour (three-strip) |
| **Instant** | Instant, Instant SQ, Instant Mini, Peel-Apart |
| **B&W** | Noir, Silver, Medium Format, Sepia, Silent Film (orthochromatic, 16 fps) |
| **Toy & Fun** | Toy Lens, Pinhole, 4-Lens Sampler, Fisheye, Stereo 3D, Prism, Flash Party |
| **Retro video** | Camcorder '98 (VHS), Mini DV, CCD 2005 |

These cover the kind of effects that retro camera apps such as Dazz are known for: half-frame
diptychs, a four-lens sampler grid, circular fisheye, red/cyan 3D, prism flare, camcorder
overlays, date stamps and instant prints. They are written from scratch, under their own names.

## Borders

Seventeen borders, burnt into photos and video alike. Borders, light leaks and stamps stay upright
whichever way the phone is held.

![The seventeen borders](docs/borders.jpg)

The stamp is a separate choice: off, a seven-segment date, a date with the year stuck at '98, or a
camcorder display (REC or PLAY plus the date and time).

## The film emulation

**Colour science per stock**
- White balance and dye crosstalk.
- Per-layer gamma: the crossovers that tint shadows and highlights.
- Hue shifts (greens toward olive, blues toward cyan, and so on).
- Saturation that falls off in deep shadows and highlights.
- An S-curve with highlight roll-off, split toning, faded blacks.
- Bleach bypass.

**Light**
- Halation: a red fringe *around* highlights, with adjustable size.
- Bloom.
- Anamorphic streaks that come off only the hottest points.
- Light leaks and edge burns that drift over time.
- Prism flare with a ghost image.
- A direct-flash look.

**Emulation**
- Grain that clumps, is strongest in the mid-tones and coarsest in the blue layer, and changes every film frame.
- Fade and warmth.

**Lens**
- Vignette, chromatic aberration, softness or sharpening.
- Toy-lens corner blur.
- Barrel distortion up to a full circular fisheye.
- Red/cyan stereo split.

**Projector**
- Gate weave and occasional frame slips that show the frame line.
- Flicker and per-channel colour flicker.
- Dust and scratches.
- 24/18/16/12 fps frame holds.
- A roll burn that flares in when recording starts and out when it stops.

**Tape**
- VHS line jitter, chroma bleed, a rolling tracking band, head-switching noise and scanlines.
- Interlace combing on motion.
- Lower resolution.

**Shutter speed**: 1/4000 to 1/2, in one of two ways:
- *Simulated*: motion trails blended across frames. Stills carry the trail from the live view.
- *Real*: the sensor exposes for that time and the ISO follows. This needs Camera2 manual-sensor
  support, which most mid-range and flagship phones have.

## Capture

- **Every lens.** The lens row is built from the phone's cameras: ultra-wide, main, telephoto and
  selfie, labelled `.5×`, `1×`, `3×` with their 35mm-equivalent focal lengths. On multi-lens
  phones it switches through the zoom ratio, the way the system camera does. Pinch to zoom
  between lenses.
- **Video**: 1080p, 4K or 8K at 24, 25, 30 or 60 fps. The app only offers what this lens, the GPU
  and the hardware encoder can all do; anything else is greyed out. 4K and up records HEVC, below
  that H.264, at high bitrates so the grain survives (about 50 Mb/s at 4K24, more at 8K). Audio is
  48 kHz AAC.
- **Photos**: full-sensor JPEGs (e.g. 50 MP where the phone exposes it), or 12 MP. Stills up to
  8192 px on the long side are developed on the GPU in tiles. They are rotated on the GPU too,
  so a 50 MP frame never needs a rotated copy in memory.
- **Multi-shot formats**: Half Frame takes two presses and puts both pictures side by side. The
  4-Lens Sampler fires four frames 0.25 s apart into a 2×2 grid.
- **Also**: tap to focus and meter, flash or torch, optional stabilisation, and the volume keys as
  a shutter. Files go to `Pictures/FilmCam` and `Movies/FilmCam`.

## Build and install

You need JDK 17 or newer and the Android SDK (platform 36). In Android Studio, open
`filmcam-android` and press Run. From the command line:

```bash
cd filmcam-android
echo "sdk.dir=$ANDROID_HOME" > local.properties
./gradlew assembleRelease          # app/build/outputs/apk/release/app-release.apk (~2 MB)
adb install app/build/outputs/apk/release/app-release.apk
```

The release build is minified and signed with the debug key so it installs directly. Add your own
`signingConfig` before publishing it anywhere.

It needs Android 10 (API 29) or newer and OpenGL ES 3.0.

## How it works

```
Camera2 stream (up to 8K) ──► SurfaceTexture (OES) ─┐
                                                    ▼
                  1 DEVELOP  crop to aspect, gate weave, slow-shutter blend with the last frame
                  2 BRIGHT   highlights from the frame's mip chain, ~480 px
                  3 BLUR     tight glow (halation), wide glow (bloom), one-way streaks
                  4 FINAL    lens, tape, stock colour, light, leaks, grain, dust, slips,
                             burns, stamps, border
                                                    │
                ┌───────────────────────────────────┼──────────────────────────────┐
                ▼                                   ▼                              ▼
          SurfaceView (screen)        HEVC/H.264 encoder surface      tiles ► full-res JPEG
                                      (landscape + rotation flag)     (from the sensor JPEG)
```

| Path | What it holds |
|---|---|
| `camera/LensCatalog.kt` | Every camera, physical lens, size, frame rate and manual control |
| `camera/Camera2Controller.kt` | Sessions, repeating requests, real shutter, focus, zoom, flash, stills |
| `gl/Shaders.kt` | All the GLSL |
| `gl/FilmRenderer.kt` | Runs the passes and holds the overlay textures |
| `gl/FilmEngine.kt` | The render thread: live frames, recording, tiled stills, the sampler |
| `film/FilmStock.kt` | 24 emulsions |
| `film/FilmLook.kt` | Every adjustable parameter, the borders and the 40 cameras |
| `film/FrameFx.kt` | Per-frame randomness: weave, slips, flicker, leaks, prism, tape tracking, scratches |
| `record/VideoRecorder.kt` | Codec choice, MP4 muxing and audio |

## Tuning looks without a phone

`tools/look-preview` runs the app's real shader code in headless Chromium. WebGL2 uses the same
GLSL ES 3.00, so you can try preset or border changes on any image:

```bash
cd filmcam-android/tools/look-preview
python3 extract.py ../..                     # pulls shaders + presets out of the Kotlin
npm i playwright                             # once, if it isn't installed
node run.js photo.jpg out '[{"name":"cine","cam":"cine800t","w":1280,"h":720}]'
```

It fails loudly on shader compile errors, which makes it a quick check before building.

## Status

Checked so far:
- The app builds cleanly (debug and minified release) and Android lint reports no errors.
- Every shader compiles and renders without GL errors in the WebGL2 harness.
- In the harness, all 40 cameras and 17 borders render as intended. Tiled output is seamless,
  stills in sensor orientation come out upright, and the landscape encoder path is correct.

Still to check on a real phone (it has **not been run on one yet**):
- The Camera2 sessions on different vendors' phones.
- 4K/8K recording and the frame rate the GPU sustains there.
- Lens switching and real shutter speed.

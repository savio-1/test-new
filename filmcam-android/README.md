# FilmCam (Android)

A camera app that is first a normal phone camera and then, one tap away, a film camera.
**Original** shows the phone's own picture, with iPhone-style photographic styles. A **look**
puts it through a live film emulsion. It shoots at the phone's full resolution: 720p to 8K
video, 12/50/200 MP stills where the sensor offers them, RAW (DNG), and every lens on the phone.
What you see in the viewfinder is what gets saved, borders included. It also records 10-bit
log video for grading, and develops photos and clips taken with any other camera.

The look definitions and shaders are shared with the coming iOS app through
[`../filmcam-shared`](../filmcam-shared) (see [the porting guide](../filmcam-shared/PORTING-iOS.md)).

![The cameras, rendered by the app's own shaders](docs/looks.jpg)

*Original plus all 58 looks, rendered through the app's real shaders by `tools/look-preview`.
Preview photo: Pietro De Grandi on Unsplash (Unsplash Licence).*

## The app

![FilmCam screens, light and dark](docs/ui.jpg)

The interface stays out of the picture.
- **Top bar:** flash, the camera name (*Original* and its style, or the look), the gallery and
  the settings button.
- **Chips under it:** the frame shape (`3:4`), photo size (`50 MP`) or video format (`4K · 30`),
  log, the self-timer and bursts. Each opens a small panel over the top of the picture.
- **Viewfinder:** rounded, the shape of the saved frame, with glass zoom pills (`.5  1×  2  3  10`).
- **Dock:** five items above the shutter (*Styles*, *Looks*, *Adjust*, *Frame* and *Text*). Each
  one opens a single tray, never a long panel.
- **Adjust:** pick a group (Light, Film, Lens, Motion, Retro), then a tool, and drag the ruler.
  While you drag, everything else fades away so you can judge the picture; only the ruler and
  its value stay. Double-tap the ruler to go back to the camera's own setting. A dot marks the
  tools you've changed.
- **Themes:** light (on a fine dot grid) and dark, or follow the system.
- **Grain:** every camera starts with the same light grain; turn it up per shot in *Adjust*.

## Original and photographic styles

![The sixteen styles](docs/styles.jpg)

The app opens as a plain phone camera: **Original**, with nothing applied. It shows the camera's
own picture through the same stream the system camera app uses. Phones keep some of their
processing (Samsung's scene optimiser, multi-frame HDR) for their own app, so photos can differ
slightly from it.

*Styles* works like the iPhone's photographic styles:
- **Sixteen styles.** Six undertone styles (Amber, Gold, Rose Gold, Neutral, Cool Rose, Cool)
  that shift white balance and lean on skin tones. Seven mood styles (Vibrant, Natural,
  Luminous, Dramatic, Quiet, Cozy, Ethereal) and two black-and-white ones (Muted B&W, Stark
  B&W).
- **The pad.** The chosen style turns into a dotted pad. Drag up and down for **Tone** (deeper
  and punchier at the bottom, lifted and softer at the top) and left and right for **Colour**
  (muted to rich). Double-tap it to centre it.
- **Palette.** The slider under the pad sets how much of the style's own character is applied.
- **Skin-aware.** Saturation boosts spare skin and already-strong colours. The tone curve is
  half hue-preserving, so bright reds don't turn neon and deep ones don't go to mud.

These are an emulation written for this app, tuned by eye against the iPhone's; Apple's own
processing isn't available to other apps. A look replaces the style. Take it off with *None* in
*Looks*, or by tapping the chosen look again, and the style comes back.

## Text overlays

Burn text into video while you record, and into photos.
- **Fonts:** ten bundled fonts (Inter and Inter Bold, Instrument Serif, DM Serif, Playfair, Bebas,
  Space Mono, a typewriter, a VHS face and a handwritten one), the system fonts, and any
  `.ttf`/`.otf` you import. The picker shows each one in a tile of the same size.
- **New text** starts in the middle of the frame, with no shadow.
- **On the viewfinder:** drag a text to move it (it snaps to the centre lines, with guides), pinch
  to resize, twist to rotate (it snaps to level and to 90°), and double-tap to retype. The red ×
  on the selected text deletes it; so does *Delete* in the tray.
- **In the tray:** size, rotation, opacity, letter spacing, colour, shadow (off by default),
  left/centre/right alignment, and a 3×3 placement grid.
- **Placement:** text is laid out in the upright frame, so it stays put when you turn the phone,
  and it sits above borders (a caption on an instant print works).

## Cameras

Fifty-eight looks in seven groups, on top of the Original camera. Each look pairs a film stock
with a format and the effects that go with it, and every setting can be changed live
afterwards. The names describe looks; none of them is a real product or brand.

| Group | Cameras |
|---|---|
| **35mm** | Medium 67, Night Classic, Quick Snap, Daily Classic, Classic Ultra, Street Snap, Amber M, Classic 35, Portrait, Verde, Vivid SLR, Disposable '98, Half Frame, Slide, Contact Strip, Cross-Pro, Redscale, Expired |
| **Cine** | Kino (teal and amber), Cine 800T, Cine 250D, Scope (anamorphic 2.39), Bleach Bypass, Super 8, Super 8 Reel, 16mm, K-64 Reel, 1929 Color (two-strip), Technicolour (three-strip) |
| **Instant** | Instant, Instant SQ, Instant Mini, Peel-Apart |
| **B&W** | Street Mono, Noir, Silver, Medium Format, Sepia, Silent Film (orthochromatic, 16 fps) |
| **Toy & Fun** | Fun Vivid, Toy Lens, Pinhole, 4-Lens Sampler, Fisheye, Stereo 3D, Prism, Flash Party |
| **Motion & Dream** | Golden Hour (mist filter), Summer Reel (Super 8 holiday, deep teal), Step Print, Panning, Spin (with a rainbow arc), Zoom Burst, Dreamy Soft, Stop Motion (6 fps) |
| **Retro video** | Camcorder '98 (VHS), Mini DV, CCD 2005 |

These cover the kind of effects that retro camera apps such as Dazz are known for: half-frame
diptychs, a four-lens sampler grid, circular fisheye, red/cyan 3D, prism flare, camcorder
overlays, date stamps and instant prints. The first ten in the table are in the spirit of the
cameras people ask for most (a 6×7 medium-format portrait camera, a night 1600 compact, a flash
disposable, a dated daily snapshot, a golden 400, a cine "kino" look, a toy-colour camera,
a crisp street compact, a muted amber one). All of them are written from scratch, under their
own names, with their own film stocks.

With no look and the Standard style, the camera's picture passes through untouched (checked
pixel for pixel in the harness). Borders, date stamps and text still work on it. A plain
Original photo in the sensor's 3:4 shape skips the GPU entirely, so the camera's own JPEG is
saved exactly as it came off the sensor, at full resolution (200 MP included).

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

**Blur and motion**
- Soft (gaussian), zoom, spin (radial) and motion (directional, any angle) blur.
- A "sharp centre" setting keeps the middle of the frame crisp while the edges move.
- Diffusion: a mist-filter glow over the whole picture.
- Frame holds down to 8 and 6 fps for stop motion. With a slow shutter this becomes a
  step-printed smear.

**Shutter speed**: 1/4000 to 1/2, in one of two ways:
- *Simulated*: motion trails blended across frames. Stills carry the trail from the live view.
- *Real*: the sensor exposes for that time and the ISO follows. This needs Camera2 manual-sensor
  support, which most mid-range and flagship phones have.

## Capture

- **Frame shapes:** 3:4, 4:5, 1:1, 2:3 and 9:16, separately for photo and video. The frame turns
  with the phone, so 9:16 becomes 16:9 when you hold it sideways. The viewfinder, the saved
  photo and the video file all have that shape.
- **Every lens, with zoom stops.** The zoom row offers `.5×  1×  2×  3×  5×  10×…` up to the
  most the phone can reach, with each stop's 35mm-equivalent focal length. Every stop uses the
  longest real lens that doesn't overshoot, then zooms digitally the rest of the way, the way the
  system camera does. Pinch to zoom anywhere in between; the exact zoom shows while you pinch.
- **Video**: 720p, 1080p, 4K or 8K at 24, 25, 30 or 60 fps. The app only offers what this lens, the GPU
  and the hardware encoder can all do; anything else is greyed out. 4K and up records HEVC, below
  that H.264, at high bitrates so the grain survives (about 50 Mb/s at 4K24, more at 8K). Audio is
  48 kHz AAC.
- **Photos**: every size the sensor offers, e.g. 12, 50 and 200 MP on a Galaxy S23 Ultra.
  Sizes from the sensor's full-resolution mode (the 50/108/200 MP modes of quad-Bayer sensors)
  are shot in that mode, with any digital zoom applied on the GPU. Which sizes appear depends on
  what the phone opens to other apps; some makers keep their biggest mode for their own camera.
  Stills up to 8192 px on the long side are developed on the GPU in tiles, so a 200 MP frame
  with a film look comes out at 50 MP; an Original photo keeps all 200. Stills are rotated on
  the GPU too, so a 50 MP frame never needs a rotated copy in memory.
- **RAW:** the *RAW* chip saves a DNG of the sensor data next to every photo (on cameras that
  hand out raw frames, and not in the full-sensor 50/200 MP mode).
- **Self-timer and bursts:** a 3, 5 or 10 s timer with a countdown on the viewfinder (for video
  too), and interval bursts of 3, 5, 10, 20 or unlimited shots, every 0.5 to 30 s. Press the
  shutter again to stop.
- **Multi-shot formats**: Half Frame takes two presses and puts both pictures side by side. The
  4-Lens Sampler fires four frames 0.25 s apart into a 2×2 grid.
- **Also**: tap to focus and meter, flash or torch, optional stabilisation, and the volume keys as
  a shutter. Files go to `Pictures/FilmCam` and `Movies/FilmCam`.

## The viewfinder is the photo

Stills are developed from the full-resolution sensor JPEG, not from the live view, so the app
makes sure the two agree:
- The light leaks, flicker and scratches in the photo are the ones on screen at the press, not
  a new random roll.
- The photo has the viewfinder's framing: the same shape, zoom and gate-weave margin.
- Effects that blur or sharpen (softness, low resolution, toy-lens corners, sharpening, tape
  noise) are sized for a 1080 p picture at any output size. Before, a 50 MP still came out much
  sharper and cleaner than the viewfinder. In the harness, the difference between a 3000×4000
  still and the viewfinder dropped by 22–55% for the soft, toy, tape and digicam cameras;
  cameras with only light sharpening stay within 1% either way.
- Video stabilisation (which crops the live view) is only used for video.

## Log

*Log* in video mode records flat footage for colour grading, with no film look. The app uses
the best path the phone allows and says which one it is in the log panel and under the title:

1. **HLG 10-bit** (Android 13+, on phones that open 10-bit HDR capture to apps, such as recent
   Galaxy S models). The sensor streams 10-bit HLG straight into a 10-bit HEVC (Main10)
   encoder, with no 8-bit step in between. This keeps the most range and doesn't band. The file
   is tagged Rec.2100 HLG / Rec.2020; grade it as such. It records the sensor's 16:9 frame.
2. **S-Log3 in camera.** Sony's published S-Log3 curve, applied to the sensor's linear signal by
   the camera's processor, with sharpening off. Rec.709 colours, 8-bit HEVC. 18% grey lands at
   41%, and the camera exposes a stop under so highlights keep a stop more room. In your
   editor: S-Log3 gamma, Rec.709 colour space.
3. **S-Log3 approx.** For phones that won't apply a custom curve: the same encoding made on the
   GPU from the camera's normal picture, with less highlight range.

*View assist* (on by default) shows log graded on screen while the file stays flat. *Save LUT*
writes a .cube to `Download/FilmCam` that matches it, for HLG or S-Log3.

**Why log could look dark before.** Some phones list custom tone curves but
quietly don't apply them. The app then decoded a normal picture as if it were log, which made
it dark. The camera now checks every frame's capture result. If the curve wasn't applied, it
switches to path 3 on its own; the panel and the title show which path is in use. With HLG
available, log uses path 1 by default, which doesn't rely on custom curves at all.

**RAW video** isn't offered: at 12 MP and 30 fps it would be around 700 MB/s of sensor data, far
beyond what a phone can write. The 10-bit HLG path is the closest real alternative, and RAW
stills are covered by DNG.

## Gallery, trimming and importing

- **Gallery:** everything the app saved, newest first. Tap a photo to view it (pinch and
  double-tap to zoom), or a clip to play it with a scrubber.
- **Trim:** drag the two handles over the clip's frames and *Save clip*. The cut is copied
  without re-encoding (seconds, no quality loss); it starts on the key frame before your first
  handle, at most a second early.
- **Import and develop:** *Import* (in the gallery) or *Develop* on any item brings a photo or
  video from the phone into the viewfinder. Pick any camera, adjust it, add borders, stamps and
  text, change the shape, and press the shutter: a photo is developed at up to 50 MP; a clip is
  decoded frame by frame through the film pipeline and re-encoded, with its own sound copied
  across. The original is never changed.

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
                  3 BLUR     tight glow (halation), wide glow (bloom), one-way streaks, diffusion
                  4 FINAL    lens, blur, tape, stock colour, light, diffusion, leaks, grain, dust, slips,
                             burns, stamps, border
                                                    │
                ┌───────────────────────────────────┼──────────────────────────────┐
                ▼                                   ▼                              ▼
          TextureView (screen)        HEVC/H.264 encoder surface      tiles ► full-res JPEG
                                      (landscape + rotation flag)     (from the sensor JPEG)
```

| Path | What it holds |
|---|---|
| `camera/LensCatalog.kt` | Every camera, physical lens, size, frame rate and manual control |
| `camera/Camera2Controller.kt` | Sessions, repeating requests, real shutter, focus, zoom, flash, stills |
| `gl/Shaders.kt` | All the GLSL |
| `gl/FilmRenderer.kt` | Runs the passes and holds the overlay textures |
| `gl/FilmEngine.kt` | The render thread: live frames, recording, tiled stills, the sampler |
| `film/FilmStock.kt` | 26 emulsions |
| `film/FilmLook.kt` | Every adjustable parameter, the borders, Original and the 58 cameras |
| `film/TextLayer.kt` | Text layers, the font library and text rendering |
| `ui/` | Compose UI: theme, icons, ruler, trays, text editor |
| `film/FrameFx.kt` | Per-frame randomness: weave, slips, flicker, leaks, prism, tape tracking, scratches |
| `camera/LogCurve.kt` | The S-Log3 and HLG curves, the view assist and the .cube LUTs |
| `film/PhotoStyle.kt` | The photographic styles and their settings |
| `ui/StylesTray.kt` | The style row, the dotted Tone/Colour pad and the Palette slider |
| `record/VideoRecorder.kt` | Codec choice, MP4 muxing, microphone or copied audio |
| `record/VideoExporter.kt` | Imported clips: preview playback, and developing them frame by frame |
| `record/Trimmer.kt` | Lossless trimming |
| `util/MediaLibrary.kt` | The app's own album, for the gallery |

## Shared with iOS

[`../filmcam-shared`](../filmcam-shared) holds every stock, look, style and option as JSON, and
the GLSL of every pass. `SpecExportTest` regenerates it from the Kotlin on every unit-test run,
so the iOS app will render exactly the same looks.
[PORTING-iOS.md](../filmcam-shared/PORTING-iOS.md) maps each Android part to its iOS
counterpart (AVFoundation, Metal, SwiftUI, Apple Log) and sets the order of work.

## Screens without a phone

`app/src/test/.../ScreenshotTest.kt` renders the real Compose screens with
[Paparazzi](https://github.com/cashapp/paparazzi), light and dark, with a sample frame in the
viewfinder:

```bash
./gradlew recordPaparazziDebug     # PNGs in app/src/test/snapshots/images
```

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
- In the harness, all 58 cameras, Original and 17 borders render as intended, and text overlays
  land upright in both the photo and the landscape video buffer. Tiled output is seamless,
  stills in sensor orientation come out upright, and the landscape encoder path is correct.
- Original is identical to its input; the log encode hits S-Log3's black, grey and clip
  values.
- Paparazzi renders every main screen (home, looks, adjust, focus mode, frame, text, settings,
  the size, burst and log panels, the countdown, editing an import, the gallery) in light and
  dark.

Still to check on a real phone (it has **not been run on one yet**):
- The Camera2 sessions on different vendors' phones.
- 4K/8K recording and the frame rate the GPU sustains there.
- Lens switching and real shutter speed.
- Which photo sizes each phone opens to apps, and the full-sensor 200 MP mode.
- Log: which of the three paths each phone gets, the 10-bit HLG session and encoder, and A/V
  sync of 10-bit takes.
- RAW (DNG) on logical multi-lens cameras.
- Developing imported clips (HDR clips from the phone's own camera may look flat, since the
  decoder's output isn't tone-mapped).

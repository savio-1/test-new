# FilmCam (Android)

A camera app that shoots photos and video through a live film emulsion. What you see in the
viewfinder is what gets saved: grain, halation, bloom, light leaks, shutter-speed motion
trails, gate weave, projector flicker, dust and scratches, film borders and a date stamp, all
rendered on the GPU in real time.

![The twelve film cameras on two test scenes](docs/looks.jpg)

*The twelve presets rendered by the app's own shaders (via `tools/look-preview`).*

## What it does

**Film cameras.** Each preset pairs a stock with a format and a set of effects:

| Camera | Stock | Character |
|---|---|---|
| Classic 35 | Gold 200 | Warm point-and-shoot, light grain |
| Portrait | Portrait 400 | Soft contrast, kind to skin |
| Cine 800T | Cine 800T | Cool tungsten cinema film with strong red halation, 24 fps |
| Super 8 | Reversal 100D | Rounded gate, heavy grain, 18 fps, weave, flicker, dust, slow shutter |
| 16mm | Portrait 400 | Documentary gate, 24 fps, moderate weave |
| Disposable | Superior 400 | Vignette, soft lens, fringing, orange date stamp |
| Instant | Instant | Cream instant-print border, faded colour |
| Slide | Chrome 100 | Punchy slide film on a 35mm strip with sprocket holes |
| K-64 Reel | K-64 | Rich reds, 1960s home-movie reel, 18 fps |
| Noir | Mono 400 | Pushed black and white in a filed-out carrier |
| Silver | Silver 100 | Fine-grain black and white |
| Expired | Expired 1998 | Colour shifts, fog, big light leaks |

The stock names describe the look; they are not measurements of any real product.

**Every effect can be adjusted live** (sliders icon, top right):

- **Shutter speed** 1/1000 to 1/2. Speeds slower than about 1/50 s leave motion trails, as a
  shutter left open across frames would. The trail is also carried into full-resolution stills.
- **Exposure**: real exposure compensation sent to the camera.
- **Halation**: the red-orange fringe around highlights, from light bouncing off the film base.
- **Bloom**: a wider, softer glow.
- **Grain** and **grain size**: two octaves of luminance grain, plus colour grain on colour
  stocks. It is strongest in the mid-tones and changes every film frame.
- **Light leaks**: warm blobs and an edge burn that drift and swell over time. Every photo gets
  its own leak.
- **Vignette, dust & scratches, gate weave, flicker, chromatic aberration, softness/sharpness,
  fade, warmth.**
- **Frame rate** for video: native, 24, 18 or 12 fps. Frames are held, the way a camera cranked
  slower looks.
- **Frame**: none, projector gate, instant print, 35mm strip or filed print.
- **Date stamp**: seven-segment orange date, burnt in like a compact camera's.

**Capture**

- Photos are full-resolution stills (up to 4096 px on the long side) from CameraX
  `ImageCapture`, developed through the same shaders as the preview.
- Video is H.264 1080p with AAC audio. It is encoded from the filtered frames, so the file looks
  exactly like the viewfinder.
- Borders, leaks and the date stamp stay upright when you hold the phone sideways.
- Other controls: tap to focus, pinch to zoom, flash or torch, front and back cameras, and the
  volume keys work as the shutter.
- Files are saved to `Pictures/FilmCam` and `Movies/FilmCam`.

## Build and install

You need JDK 17 or newer and the Android SDK (platform 36). Android Studio has both; open the
`filmcam-android` folder in it and press Run. From the command line:

```bash
cd filmcam-android
echo "sdk.dir=$ANDROID_HOME" > local.properties   # or let Android Studio write it
./gradlew assembleRelease                           # app/build/outputs/apk/release/app-release.apk (~3 MB)
adb install app/build/outputs/apk/release/app-release.apk
```

The release build is minified and signed with the debug key so it installs directly. Add your
own `signingConfig` before publishing it anywhere.

Requirements: Android 10 (API 29) or newer, and OpenGL ES 3.0.

## How it works

```
CameraX Preview ──► SurfaceTexture (OES) ─┐
                                          ▼
                       1 DEVELOP   crop to output aspect, gate weave, blend with the previous
                                   frame for slow shutters (MRT also keeps the raw frame)
                       2 BRIGHT    highlights, read from the frame's mip chain at ~480 px
                       3 BLUR      separable Gaussian: tight glow (halation), wide glow (bloom)
                       4 FINAL     stock colour science, halation, bloom, leaks, vignette,
                                   grain, dust, scratches, frame, date stamp
                                          │
                     ┌────────────────────┴───────────────────┐
                     ▼                                        ▼
               SurfaceView (screen)            MediaCodec input surface (while recording)

ImageCapture JPEG ─► upright bitmap ─► passes 1-4 offscreen at full size ─► JPEG in MediaStore
```

- `gl/Shaders.kt` holds all the GLSL. `gl/FilmRenderer.kt` runs the passes and
  `gl/FilmEngine.kt` is the render thread: EGL, camera frames, recording and stills.
- `film/FilmStock.kt` holds the colour science of each emulsion: white balance, a dye-crosstalk
  matrix, saturation, an S-curve, highlight roll-off, split toning, fade and halation colour.
  `film/FilmLook.kt` holds the adjustable parameters and the twelve presets.
- `film/FrameFx.kt` holds per-frame randomness that is easier to control on the CPU: weave,
  flicker, leak motion and scratches.
- `record/VideoRecorder.kt` handles H.264 + AAC into MP4. Both tracks are timestamped from
  `System.nanoTime`.
- `camera/CameraController.kt` is the CameraX binding. Photo mode uses 4:3 and video mode 16:9
  with a 30 fps AE range.
- `ui/` is the Jetpack Compose interface.

## Tuning looks without a phone

`tools/look-preview` runs the app's real shader code in headless Chromium (WebGL2 uses the
same GLSL ES 3.00), so you can try preset changes on any image:

```bash
cd filmcam-android/tools/look-preview
python3 extract.py ../..                     # pulls shaders + presets out of the Kotlin
npm i playwright                             # once, if it isn't installed
node run.js photo.jpg out '[{"name":"cine","cam":"cine800t","w":1280,"h":720}]'
```

It also fails loudly on shader compile errors, which is a quick check before building.

## Status

The app builds cleanly (debug and minified release) and passes Android lint with no errors.
All shaders compile, link and render without GL errors in the WebGL2 harness, which also
checked the encoder's landscape and rotated-frame paths. It has **not yet been run on a
physical phone**: camera binding, recording and still capture still need a device test.

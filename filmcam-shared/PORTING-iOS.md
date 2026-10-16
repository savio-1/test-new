# Porting FilmCam to iOS

The Android app is split so that the look of a picture is defined once (`spec/` and
`shaders/`), and only the camera, encoder, storage and UI are platform code. This is the plan
for the iOS app: Swift, SwiftUI, AVFoundation and Metal, targeting iOS 17+.

## 1. What maps to what

| Android (`filmcam-android/app/src/main/java/app/filmcam/`) | iOS |
|---|---|
| `camera/Camera2Controller.kt`, `LensCatalog.kt` | `AVCaptureSession` with an `AVCaptureDevice` per lens. Use the virtual devices (`.builtInTripleCamera` / `.builtInDualWideCamera`) and `videoZoomFactor` for zoom stops: `virtualDeviceSwitchOverVideoZoomFactors` gives the lens hand-over points, the equivalent of our lens ratios |
| Photo sizes (12/50/200 MP) | `AVCapturePhotoOutput.maxPhotoDimensions`, chosen from `activeFormat.supportedMaxPhotoDimensions` (24/48 MP on Pro iPhones) |
| Real shutter speed | `setExposureModeCustom(duration:iso:)` |
| RAW (DNG) | `AVCapturePhotoOutput` with a Bayer RAW format, or Apple ProRAW (`isAppleProRAWEnabled`). Both write DNG |
| Log video | `AVCaptureDevice.activeColorSpace = .appleLog` (iPhone 15 Pro and later): true Apple Log, 10-bit, ProRes or HEVC. Elsewhere `.HLG_BT2020` 10-bit HLG, which matches the Android 10-bit path. Keep the same view assist: `hlgView()` / `logView()` in `final.frag`, or an Apple Log decode |
| `gl/FilmEngine.kt`, `FilmRenderer.kt` (GLES 3) | A Metal renderer with the same four passes. Camera frames come in as `CVPixelBuffer`s through `CVMetalTextureCache` |
| `gl/Shaders.kt` → `shaders/*.frag` | Translate to Metal Shading Language: `glslangValidator -V` to SPIR-V, then `spirv-cross --msl`, or by hand (the code is plain arithmetic). `samplerExternalOES` becomes two planes (Y and CbCr) plus a YUV→RGB matrix in the develop pass |
| `record/VideoRecorder.kt` (MediaCodec + MediaMuxer) | `AVAssetWriter` with an `AVAssetWriterInputPixelBufferAdaptor` for the rendered frames and an audio input from `AVCaptureAudioDataOutput` |
| `record/Trimmer.kt` | `AVAssetExportSession` with `AVAssetExportPresetPassthrough` and a `timeRange` |
| `record/VideoExporter.kt` (import and develop) | `AVAssetReader` → Metal → `AVAssetWriter`; audio passthrough |
| `util/MediaSaver.kt`, `MediaLibrary.kt` | `PHPhotoLibrary`: an album called FilmCam, `PHAssetCreationRequest`; import with `PHPickerViewController` |
| `film/TextLayer.kt` (StaticLayout) | Core Text / `NSAttributedString` drawn into a `CGContext`, uploaded as a premultiplied texture, composited exactly like `uTextTex` |
| `ui/*.kt` (Compose) | SwiftUI: one view per file. `CameraScreen` → `CameraView`, `Trays.kt` → `LooksTray`/`AdjustTray`/`FrameTray`, `StylesTray.kt` → `StylesTray` (pad and palette slider), `Gallery.kt` → `GalleryView`/`ViewerView` |
| Fonts in `assets/fonts` | Same files in the app bundle (`UIAppFonts`) |
| `assets/looks`, `assets/styles` thumbnails | Same JPEGs in the asset catalog |

## 2. The render pipeline (identical on both)

1. **Develop** (`develop_camera.frag` / `develop_image.frag`): the camera frame to the working
   frame. Crop to the output aspect, gate weave, blend with the previous frame for slow
   shutters. Mip-mapped RGBA8.
2. **Bright** (`bright.frag`): highlights from a mip level into a buffer about 480 px across.
3. **Blur** (`blur.frag`): a separable 9-tap Gaussian, run for the tight glow (halation), the
   wide glow (bloom), the streak (one direction, steps 2/6/16/40) and diffusion. RGBA16F where
   the GPU allows.
4. **Final** (`final.frag`): the whole look. It renders to the screen, the video encoder or a
   still tile.

Coordinates: *screen space* is the working frame as it sits on the portrait display. *Frame
space* is that turned upright for however the phone is held (`uFrameRot`), so borders, stamps,
leaks and text are always upright in the file. `uTargetRot` turns the render target into
screen space (1 for the landscape encoder buffer). Stills render in tiles: `uTargetSize` is the
whole picture and `uTileOffset` this tile's place in it.

### How a look becomes uniforms

`FilmRenderer.drawFinal()` is the reference. Per frame:
- Stock → `uTemp` (= temperature + 0.6 × look.warmth), `uTint`, `uSat`, `uSatShadow`,
  `uSatHigh`, `uContrast`, `uFade` (= min(stock.fade + 0.18 × look.fade, 0.35)), `uRolloff`,
  `uBleach`, `uGamma`, `uHueShift`, `uShadowTint`, `uHighTint`, `uMixer` (row-major →
  column-major), `uMono`, `uHalColor`, `uColorGrain`.
- Look → the effect uniforms of the same names. `uHalThreshold` = 0.62 − 0.2 × halation;
  `uGrainSize` is clamped to 0.5..4; `uBlurDir` = (cos, sin) of blurAngle.
- Style (Original camera only) → `uStyleOn` (0 when the style is identity), `uStyleA` (warm,
  tint, sat, contrast), `uStyleB` (tone, bright, fade, mono), `uStyleShadow`, `uStyleHigh`,
  `uStyleUser` (pad tone, pad colour, palette, skin).
- Resolution → `uImageTexel`, `uBaseLod` = log2(image short side / output short side), and
  `uRefScale` = max(1, output short side / 1080). Effects are sized for a 1080 p picture, so a
  still matches the viewfinder at any resolution.
- Per-frame randomness (`FrameFx`, `FxAnimator` in `film/FrameFx.kt`): seed, time, gain, leaks,
  burns, scratches, prism, tape tracking, roll burn. Port `FxAnimator` as is; stills reuse the
  values on screen at the shutter press.
- Log → `uLogMode` (0 off, 1 encode S-Log3, 2 view S-Log3, 3 both, 4 view HLG), `uLogGain`.

Check a port by rendering the same image through both: `filmcam-android/tools/look-preview`
renders any camera or style with the shared shaders in a browser, which gives you reference
images.

## 3. Order of work

1. Metal renderer and the four passes; reproduce the harness's reference renders.
2. Camera preview through the renderer with the Original camera and styles.
3. Looks, Adjust, Frame and Text trays (SwiftUI) driven by `filmcam-spec.json`.
4. Photos: full-resolution capture, tiled develop, RAW, timer and burst.
5. Video: AVAssetWriter, frame-rate holds, roll burn, Apple Log / HLG.
6. Gallery, trim, import and develop.

## 4. Things that differ

- **8K and 200 MP** don't exist on iPhone; offer what `activeFormat` reports.
- **Photographic styles:** iPhone 16 and later have Apple's own styles in the system camera.
  If the SDK in use exposes them to other apps, offer them for the Original camera; otherwise
  use `photoStyle()`, which is what Android uses.
- **Log:** Apple Log is real log from the sensor, so it doesn't need the S-Log3 GPU fallback.
- **Volume-key shutter:** use `AVCaptureEventInteraction` (iOS 17.2+).

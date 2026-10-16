# FilmCam shared

The parts of FilmCam that are the same on every platform. Android ships today; this folder is
what the iOS app (`../filmcam-ios`) reads so that both render identical looks.

| Path | What it holds |
|---|---|
| `spec/filmcam-spec.json` | Every film stock, camera (look), photographic style, border, stamp, blur mode, shutter speed, frame rate, aspect ratio and the log constants |
| `shaders/*.vert, *.frag` | The GLSL ES 3.00 source of every render pass |
| `luts/*.png` | Film stock colour as 33³ LUT strips, baked by `filmcam-android/tools/film-lab` |
| `PORTING-iOS.md` | How the Android app maps onto iOS, and what to port in what order |

Both are **generated** from the Android sources by
`filmcam-android/app/src/test/java/app/filmcam/SpecExportTest.kt`, which runs with the unit
tests (`./gradlew testDebugUnitTest`). Change a look in Kotlin, run the tests, and commit the
regenerated files. Don't edit them by hand. On CI (`CI` set) a stale copy fails the build.

## The spec in brief

- **stocks[]:** colour science per emulsion. White balance (`temperature`, `tint`), 3×3 row-major
  `mixer`, per-channel `gamma`, `hueShift`, saturation by tone, S-curve `contrast`,
  `highlightRolloff`, split `shadowTint`/`highlightTint`, `fade`, `bleach`, `monochrome`,
  `halationColor`, `colorGrain`.
- **cameras[]:** `look` holds every effect strength (0..1 unless noted), a `stock` id, and the
  enums by id (`frame`, `stamp`, `blurMode`, `shutter`, `frameRate`, `multiShot`). The camera
  with id `original` is the no-look default.
- **styles[]:** photographic styles for the Original camera. Each style has `warm`, `tint`,
  `sat`, `contrast`, `tone`, `bright`, `fade`, `mono`, `shadowTint`, `highTint` and `skin`. The
  user adds pad `tone` and `color` (-1..1) and `palette` (0..1). The maths is `photoStyle()`
  in `shaders/final.frag`.
- Colours (`swatch`) are `#AARRGGBB` strings.

The uniforms each pass expects, and how a look turns into them, are in `PORTING-iOS.md`.

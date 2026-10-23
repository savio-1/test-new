# Installing FilmCam on your iPhone

FilmCam for iPhone is built by GitHub Actions on a Mac (workflow **FilmCam iOS**,
`.github/workflows/filmcam-ios.yml`). Every push to `claude/brave-allen-0xuvx9` that
touches the iOS app or the shared film engine produces an **unsigned** app,
`FilmCam-unsigned.ipa`.

Apple only runs signed apps. You sign it with your own Apple ID while installing over
USB. A free Apple ID is enough: the app then runs for **7 days**, and you re-install it
to renew. A paid developer account gives you a year.

Requirements: an iPhone on **iOS 17 or later**, a USB cable, and a Mac or a Windows PC.

## Option A: Sideloadly (Windows or Mac, no Xcode)

1. Download the app:
   1. Open the repository on GitHub, then go to **Actions → FilmCam iOS**.
   2. Open the latest green run and download the **FilmCam-unsigned-ipa** artifact.
   3. Unzip it. You get `FilmCam-unsigned.ipa`.
2. Install Sideloadly from <https://sideloadly.io>.
   - On Windows, also install iTunes and iCloud from Apple's website (not the
     Microsoft Store), so the PC can see the phone.
3. Connect the iPhone with USB, unlock it, and tap **Trust** on the phone.
4. Open Sideloadly:
   1. Drag `FilmCam-unsigned.ipa` into the window.
   2. Pick your iPhone and enter your Apple ID.
   3. Press **Start**.
   4. Enter the code Apple sends you if asked.
5. On the iPhone, open **Settings → General → VPN & Device Management**. Tap your Apple
   ID under *Developer App*, then **Trust**.
6. Turn on Developer Mode: **Settings → Privacy & Security → Developer Mode → On**. The
   phone restarts; confirm **Turn On** when it comes back.
7. Open FilmCam and allow the camera, the microphone (for video) and adding to Photos.

## Option B: Xcode on a Mac (builds from source)

1. Install Xcode 16 or later from the App Store.
2. Clone the repo and check out `claude/brave-allen-0xuvx9`.
3. Open `filmcam-ios/FilmCam.xcodeproj`.
   - Keep the folder layout. The build copies the shared film data from
     `filmcam-shared/` and `filmcam-android/app/src/main/assets/`.
4. Select the **FilmCam** target and open **Signing & Capabilities**:
   1. Tick *Automatically manage signing*.
   2. Choose your **Team** (add your Apple ID under Xcode → Settings → Accounts).
   3. If Xcode says the bundle id is taken, change `com.savio.sfilm` to something of
      your own, such as `com.yourname.sfilm`.
5. Connect the iPhone and pick it as the run destination. Turn on Developer Mode on the
   phone if Xcode asks (see step 6 above), then press **Run** (⌘R).
6. The first time, trust the developer profile on the phone (step 5 above).

## What's in the iPhone version

- **Same looks as Android.** It uses the same film engine: the same GLSL shaders, the
  same film-lab 3D LUTs and the same camera presets, read from
  `filmcam-shared/spec/filmcam-spec.json`.
- **Camera.**
  - A live film viewfinder at 3:4 for photo and 9:16 for video.
  - Lens stops (0.5× / 1× / 2× or tele, depending on the phone).
  - Front camera and tap to focus.
- **Looks, styles and adjustments.**
  - Looks are grouped by category.
  - Photographic styles have a tone/colour pad and a palette slider.
  - Adjust has Basic (exposure, temp, tint, contrast, highlights, shadows, saturation,
    vibrance, clarity, sharpness, fade), Light, Film and Lens.
  - Tap the picture to close a panel.
- **Photos.**
  - 12 MP photos are re-developed at full resolution and saved as JPEG with their EXIF
    data.
  - With the *Original* camera, and no style or adjustment, the iPhone's own picture is
    saved untouched.
- **Video.** HEVC video with sound, including film frame rates, roll burn and the
  camcorder date display.
- **Sound.** The shutter and record sound can be turned off in Settings. In some regions
  (Japan, Korea) iOS always plays it.

Not ported yet: gallery and trim (the thumbnail opens Photos), import, log, RAW,
multi-shot cameras, text overlays and timers. The iOS renderer uses OpenGL ES 3, which
Apple has deprecated but still ships; a Metal port is the longer-term plan (see
`filmcam-shared/PORTING-iOS.md`).

# Installing S film on your iPhone

S film for iPhone is built by GitHub Actions on a Mac (workflow **FilmCam iOS**,
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
7. Open S film and allow the camera, the microphone (for video), Photos and speech recognition (for live captions).

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

The iPhone app follows the Android app feature for feature, in the same editor design.

- **Same looks as Android.** The same film engine: the same GLSL shaders, film-lab 3D
  LUTs, studio looks and camera presets, read from `filmcam-shared/spec/filmcam-spec.json`.
- **Design.** The monochrome editor palette in dark, light (on a dot grid) or Auto, with
  Inter and Space Mono and the Android line icons.
- **Camera.**
  - Chips above the picture: frame shape (3:4, 4:5, 1:1, 2:3, 9:16, turning with the
    phone), photo size, RAW, self-timer and interval bursts; video resolution, frame rate
    and log.
  - Lens stops and pinch zoom; tap to focus, then drag up or down to set the exposure.
  - Flash (the torch while filming), front camera, real shutter speed, stabilisation.
  - Photos held sideways come out landscape, effects and borders turned to match.
- **Looks.** Favourites, All and every category; a heart and an intensity slider for the
  chosen look; None takes the look off. Import your own `.cube` LUTs (or a graded Hald
  image) into Custom.
- **Adjust.** Basic, Light, Motion, Film, Lens and Retro tools on the ruler (double-tap
  resets); your settings stay on as you change looks.
- **Frame.** Borders and date stamps.
- **Text.** Text layers with font families (and imported fonts or font zips),
  animations, effects and blends, set in front of or behind the person.
- **Gallery.** The S film album: swipe through shots, zoom, play, trim clips, share,
  delete, see the look a shot was made with and put it back on.
- **Import and develop.** Bring in a photo or clip from Photos, see it through any look,
  and save a developed copy.
- **Subtitles.** Generate subtitles with Gemini (your own key), words timed to the voice,
  kinetic caption templates, styling, SRT export and burn-in; live captions while filming.
- **Video.** HEVC with sound, film frame rates, roll burn, the camcorder display, and
  optional background-noise reduction. Log films 10-bit HLG, or Apple Log on iPhone 15
  Pro and later, straight from the sensor.
- **Multi-shot cameras.** Half-frame pairs and the four-lens sampler.

The iOS renderer uses OpenGL ES 3, which Apple has deprecated but still ships; a Metal
port is the longer-term plan (see `filmcam-shared/PORTING-iOS.md`).

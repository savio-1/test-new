package app.filmcam.film

/** What surrounds the picture. The same borders apply to photos and to video. */
enum class FrameStyle(val label: String, val shaderId: Int) {
    NONE("None", 0),
    GATE("Projector gate", 1),
    INSTANT("Instant", 2),
    FILMSTRIP("35mm strip", 3),
    FILED("Filed carrier", 4),
    INSTANT_SQUARE("Instant square", 5),
    INSTANT_MINI("Instant mini", 6),
    WHITE("White print", 7),
    MAT("Gallery mat", 8),
    BLACK("Black border", 9),
    STRIP_120("120 film", 10),
    SUPER8_STRIP("Super 8 strip", 11),
    SLIDE_MOUNT("Slide mount", 12),
    LETTERBOX("Scope 2.39", 13),
    ACADEMY("Academy 4:3", 14),
    DECKLE("Deckled print", 15),
    ROUNDED("Rounded print", 16),
}

/** Text burnt into the frame. */
enum class StampStyle(val label: String, val shaderId: Int) {
    NONE("Off", 0),
    DATE("Date", 1),
    DATE_98("Date '98", 2),
    CAMCORDER("Camcorder", 3),
}

/** Photo formats that put more than one exposure on a frame. */
enum class MultiShot(val label: String, val shots: Int) {
    SINGLE("Single", 1),
    HALF_FRAME("Half frame", 2),
    SAMPLER("4-lens sampler", 4),
}

/** Cadence the picture changes at. Frames are held, like a camera cranked slower. */
enum class FilmFrameRate(val label: String, val fps: Int) {
    NATIVE("Native", 0),
    FPS_24("24", 24),
    FPS_18("18", 18),
    FPS_16("16", 16),
    FPS_12("12", 12),
    FPS_8("8", 8),
    FPS_6("6", 6),
}

/** Camera-movement and lens blurs. */
enum class BlurMode(val label: String, val shaderId: Int) {
    NONE("Off", 0),
    GAUSSIAN("Soft", 1),
    ZOOM("Zoom", 2),
    SPIN("Spin", 3),
    MOTION("Motion", 4),
}

/** Shutter speeds. Simulated as motion trails, or set on the sensor with "real shutter". */
enum class ShutterSpeed(val label: String, val seconds: Float) {
    S4000("1/4000", 1f / 4000f),
    S1000("1/1000", 1f / 1000f),
    S500("1/500", 1f / 500f),
    S250("1/250", 1f / 250f),
    S125("1/125", 1f / 125f),
    S60("1/60", 1f / 60f),
    S48("1/48", 1f / 48f),
    S30("1/30", 1f / 30f),
    S15("1/15", 1f / 15f),
    S8("1/8", 1f / 8f),
    S4("1/4", 1f / 4f),
    S2("1/2", 1f / 2f);

    /**
     * Fraction of the previous frame that survives into the next one, for a frame interval of
     * [frameSeconds]. A shutter open for longer than a frame smears motion across frames.
     */
    fun persistence(frameSeconds: Float): Float {
        if (seconds < 1f / 50f) return 0f
        val tau = seconds * 0.5f
        return kotlin.math.exp(-frameSeconds / tau).coerceIn(0f, 0.92f)
    }
}

/**
 * Every adjustable parameter of the look. Effect strengths are 0..1 unless noted.
 * Immutable: the UI swaps whole instances and the render thread reads the latest one.
 */
data class FilmLook(
    val stock: FilmStock = FilmStocks.GOLD_200,
    // light
    val halation: Float = 0.35f,
    val halationSize: Float = 0.4f,
    val bloom: Float = 0.2f,
    /** Horizontal anamorphic streaks from bright lights. */
    val streak: Float = 0f,
    // emulsion
    val grain: Float = 0.2f,
    /** Grain cell size in pixels of a 1080-line frame (0.6..3). */
    val grainSize: Float = 1.2f,
    val fade: Float = 0f,
    /** Extra warmth on top of the stock's own, -1..1. */
    val warmth: Float = 0f,
    // light leaks
    val lightLeak: Float = 0f,
    /** Rainbow prism flare (a curved arc) plus a ghost image. */
    val prism: Float = 0f,
    /** Diffusion filter: the whole picture glows, highlights bloom, shadows lift. */
    val diffusion: Float = 0f,
    // lens
    val vignette: Float = 0.3f,
    val aberration: Float = 0.1f,
    /** -1 sharp .. +1 soft. */
    val softness: Float = 0f,
    /** Toy-lens blur that grows toward the corners. */
    val cornerBlur: Float = 0f,
    /** Barrel distortion; 1 is a full fisheye. */
    val distortion: Float = 0f,
    /** Black circle around the picture, for fisheye. */
    val circleMask: Boolean = false,
    /** Red/cyan stereo split. */
    val anaglyph: Float = 0f,
    /** Direct on-camera flash: hot centre, fast fall-off. */
    val flash: Float = 0f,
    // blur
    val blurMode: BlurMode = BlurMode.NONE,
    val blur: Float = 0.25f,
    /** Direction of motion blur in degrees (0 = horizontal in the upright frame). */
    val blurAngle: Float = 0f,
    /** Size of the sharp centre that zoom, spin and motion blur leave alone (0 = none). */
    val blurFocus: Float = 0.75f,
    // projection
    val gateWeave: Float = 0f,
    /** Occasional vertical slip showing the frame line. */
    val frameSlip: Float = 0f,
    val flicker: Float = 0f,
    /** Per-channel density pumping from frame to frame. */
    val colorFlicker: Float = 0f,
    val dust: Float = 0f,
    // video
    /** Tape look: line jitter, chroma bleed, scanlines, tracking noise. */
    val vhs: Float = 0f,
    /** Combing on motion, like an interlaced camcorder. */
    val interlace: Float = 0f,
    /** Lower resolution: 0 = full, 1 = ~240 lines. */
    val lowRes: Float = 0f,
    /** Burnt-in leader when a recording starts and stops. */
    val rollBurn: Boolean = false,
    // timing and capture
    val shutter: ShutterSpeed = ShutterSpeed.S125,
    val frameRate: FilmFrameRate = FilmFrameRate.NATIVE,
    // decoration
    val frame: FrameStyle = FrameStyle.NONE,
    val stamp: StampStyle = StampStyle.NONE,
    val multiShot: MultiShot = MultiShot.SINGLE,
    /** Real exposure compensation sent to the camera, in EV. */
    val exposureEv: Float = 0f,
    /** Photographic style; only the Original camera sets one. */
    val style: StyleSetting = StyleSetting(),
    // basic adjustments, after the stock (-1..1 unless noted)
    /** How much of the film stock's colour: 0 = the camera's own, 1 = all of it. */
    val intensity: Float = 1f,
    val tint: Float = 0f,
    val contrast: Float = 0f,
    val saturation: Float = 0f,
    val vibrance: Float = 0f,
    val highlights: Float = 0f,
    val shadows: Float = 0f,
    /** Local contrast in the mid-tones. */
    val clarity: Float = 0f,
    /** Unsharp mask, 0..1 (adds to the lens's own sharpening). */
    val sharpness: Float = 0f,
    // effects from the editor's looks: noise works on any look, the rest on studio looks
    /** Per-pixel digital noise, re-dealt every frame. */
    val noise: Float = 0f,
    /** Halftone dot screen: dots of [halftoneInk] on [halftonePaper], sized by the tone. 0..1 sets the cell. */
    val halftone: Float = 0f,
    /** Two-tone print: [halftonePaper] where the tone is above this, [halftoneInk] below (0 off). */
    val threshold: Float = 0f,
    val halftoneInk: Long = 0xFF111111,
    val halftonePaper: Long = 0xFFF4F1EA,
    /** Double exposure: two copies stepped along [blurAngle]. */
    val ghost: Float = 0f,
    /** Tilt-shift: everything outside a horizontal band at [tiltY] ([tiltSize] tall, 0 = top) goes soft. */
    val tiltShift: Float = 0f,
    val tiltY: Float = 0.5f,
    val tiltSize: Float = 0.25f,
    /**
     * Draw the effects with the photo editor's formulas (its studio looks): grain, vignette,
     * halation, bloom, light leak, dust, fringing, sharpening, clarity, the blurs and the fisheye
     * work on the graded picture the way the editor does, sized to the frame.
     */
    val studio: Boolean = false,
)

enum class CameraCategory(val label: String) {
    /** The no-filter camera. Pinned first in every row rather than given a tab. */
    ORIGINAL("Original"),
    /** Creators' grades and imported .cube LUTs. */
    CUSTOM("Custom"),
    /** The photo editor's own looks, by its shelves. */
    STUDIO_FILM("Studio Film"),
    STUDIO_COLOUR("Studio Colour"),
    STUDIO_MONO("Studio B&W"),
    STUDIO_PRINT("Studio Print"),
    STUDIO_FX("Studio FX"),
    /** Genesis film emulation (Cullen Kelly): its negative and print stocks. */
    GENESIS("Genesis"),
    FUJI("Fujifilm"),
    FUJI_RECIPE("Fuji Recipes"),
    FILM("35mm"),
    CINE("Cine"),
    INSTANT("Instant"),
    MONO("B&W"),
    TOY("Toy & Fun"),
    MOTION("Motion & Dream"),
    VIDEO("Retro video"),
}

/** A "camera": a stock plus a format and a set of effects that belong together. */
data class FilmCamera(
    val id: String,
    val name: String,
    val subtitle: String,
    val category: CameraCategory,
    val look: FilmLook,
)

object FilmCameras {
    /**
     * Every camera starts with the same faint, fine grain: a touch of texture that never reads
     * as noise (and costs the video encoder few bits). Turn it up in Film for more.
     */
    const val DEFAULT_GRAIN = 0.05f
    const val DEFAULT_GRAIN_SIZE = 0.95f

    /**
     * Every camera gets the same light grain, and a lens that is sharper than it used to be:
     * softness and fringing at 60% of the written value (lo-fi cameras stay soft, just not mushy).
     */
    private fun cam(id: String, name: String, sub: String, cat: CameraCategory, look: FilmLook) =
        FilmCamera(id, name, sub, cat, look.copy(
            grain = DEFAULT_GRAIN, grainSize = DEFAULT_GRAIN_SIZE,
            softness = if (look.softness > 0f) look.softness * 0.6f else look.softness,
            aberration = look.aberration * 0.6f,
        ))

    /** No filter: the phone's own picture, straight through. Borders, stamps and text still work. */
    val ORIGINAL = FilmCamera(
        "original", "Original", "No filter", CameraCategory.ORIGINAL,
        FilmLook(stock = FilmStocks.NEUTRAL, halation = 0f, bloom = 0f, grain = 0f, vignette = 0f, aberration = 0f),
    )

    val ALL: List<FilmCamera> = listOf(
        ORIGINAL,
    ) + CustomLooks.CAMERAS + StudioLooks.CAMERAS + GenesisLooks.CAMERAS + FujiRecipes.CAMERAS + listOf(
        // ------------------------------------------------------------ classic film stocks, straight
        cam("portra", "Portrait 400", "Warm portrait negative · creamy skin", CameraCategory.FILM,
            FilmLook(stock = FilmStocks.PORTRAIT_400, halation = 0.3f, bloom = 0.15f, vignette = 0.18f, aberration = 0.05f)),
        cam("gold", "Gold 200", "Golden everyday negative", CameraCategory.FILM,
            FilmLook(stock = FilmStocks.GOLD_200, halation = 0.32f, bloom = 0.15f, vignette = 0.22f, aberration = 0.06f)),
        cam("pastel", "Pastel 400", "Airy mint-and-cream negative", CameraCategory.FILM,
            FilmLook(stock = FilmStocks.PASTEL_400, halation = 0.28f, bloom = 0.2f, vignette = 0.15f, aberration = 0.04f)),
        cam("fresh", "Fresh 200", "Cool, crisp everyday negative", CameraCategory.FILM,
            FilmLook(stock = FilmStocks.FRESH_200, halation = 0.28f, bloom = 0.12f, vignette = 0.2f, aberration = 0.05f)),
        cam("chrome50", "Chrome 50", "Landscape slide · vivid greens and blues", CameraCategory.FILM,
            FilmLook(stock = FilmStocks.CHROME_50, halation = 0.18f, bloom = 0.1f, vignette = 0.25f, aberration = 0.03f,
                softness = -0.1f)),
        cam("mono", "Mono 400", "Classic black-and-white · punchy", CameraCategory.MONO,
            FilmLook(stock = FilmStocks.MONO_400, halation = 0.15f, bloom = 0.1f, vignette = 0.25f, aberration = 0f)),

        // ------------------------------------------------------------ after the retro camera apps
        cam("medium67", "Medium 67", "Pro 160 · 6×7 portraits", CameraCategory.FILM,
            FilmLook(stock = FilmStocks.PRO_160, halation = 0.25f, bloom = 0.2f, vignette = 0.25f, aberration = 0.04f,
                softness = -0.05f, frame = FrameStyle.WHITE)),
        cam("nightclassic", "Night Classic", "Night 1600 · warm low light", CameraCategory.FILM,
            FilmLook(stock = FilmStocks.NIGHT_1600, halation = 0.45f, bloom = 0.3f, vignette = 0.4f, aberration = 0.15f,
                flash = 0.15f, softness = 0.1f, stamp = StampStyle.DATE)),
        cam("quicksnap", "Quick Snap", "Snap 400 · flash disposable", CameraCategory.FILM,
            FilmLook(stock = FilmStocks.SNAP_400, halation = 0.4f, bloom = 0.3f, lightLeak = 0.2f, vignette = 0.55f,
                aberration = 0.4f, softness = 0.25f, flash = 0.28f, stamp = StampStyle.DATE_98)),
        cam("dailyclassic", "Daily Classic", "Daily 200 · faded & dated", CameraCategory.FILM,
            FilmLook(stock = FilmStocks.DAILY_200, halation = 0.35f, bloom = 0.25f, lightLeak = 0.2f, vignette = 0.35f,
                aberration = 0.12f, fade = 0.1f, stamp = StampStyle.DATE)),
        cam("classicultra", "Classic Ultra", "Ultra 400 · golden & bold", CameraCategory.FILM,
            FilmLook(stock = FilmStocks.ULTRA_400, halation = 0.35f, bloom = 0.22f, vignette = 0.35f, aberration = 0.12f)),
        cam("streetsnap", "Street Snap", "Street positive · crisp & cool", CameraCategory.FILM,
            FilmLook(stock = FilmStocks.STREET_POSITIVE, halation = 0.2f, bloom = 0.12f, vignette = 0.25f, aberration = 0.05f,
                softness = -0.2f, frame = FrameStyle.BLACK)),
        cam("amberm", "Amber M", "Amber 100 · muted & warm", CameraCategory.FILM,
            FilmLook(stock = FilmStocks.AMBER_100, halation = 0.3f, bloom = 0.25f, vignette = 0.4f, aberration = 0.1f,
                fade = 0.15f, lightLeak = 0.1f)),
        cam("kino", "Kino", "Kino 500T · teal & amber", CameraCategory.CINE,
            FilmLook(stock = FilmStocks.KINO_500T, halation = 0.6f, halationSize = 0.5f, bloom = 0.3f, vignette = 0.35f,
                gateWeave = 0.1f, aberration = 0.1f, frameRate = FilmFrameRate.FPS_24, shutter = ShutterSpeed.S48)),
        cam("funvivid", "Fun Vivid", "Fun 200 · toy-camera colour", CameraCategory.TOY,
            FilmLook(stock = FilmStocks.FUN_200, halation = 0.35f, bloom = 0.3f, lightLeak = 0.3f, vignette = 0.7f,
                cornerBlur = 0.35f, aberration = 0.35f, softness = 0.15f)),
        cam("streetmono", "Street Mono", "Mono 400 · hard & contrasty", CameraCategory.MONO,
            FilmLook(stock = FilmStocks.MONO_400.copy(id = "mono400hard", contrast = 1.55f), halation = 0.15f, bloom = 0.1f,
                vignette = 0.3f, softness = -0.25f, frame = FrameStyle.FILED)),

        // ------------------------------------------------------------ 35mm stills
        cam("classic35", "Classic 35", "Gold 200 · point & shoot", CameraCategory.FILM,
            FilmLook(stock = FilmStocks.GOLD_200, halation = 0.35f, bloom = 0.2f, grain = 0.38f, grainSize = 1.3f,
                vignette = 0.3f, aberration = 0.15f, lightLeak = 0.12f)),
        cam("portrait", "Portrait", "Portrait 400 · soft skin", CameraCategory.FILM,
            FilmLook(stock = FilmStocks.PORTRAIT_400, halation = 0.3f, bloom = 0.25f, grain = 0.3f, grainSize = 1.2f,
                vignette = 0.22f, softness = 0.1f, aberration = 0.08f)),
        cam("verde", "Verde", "Verde 400 · cool greens", CameraCategory.FILM,
            FilmLook(stock = FilmStocks.VERDE_400, halation = 0.3f, bloom = 0.2f, grain = 0.42f, grainSize = 1.4f,
                vignette = 0.3f, aberration = 0.12f)),
        cam("vivid", "Vivid SLR", "Vivid 100 · punchy, fine grain", CameraCategory.FILM,
            FilmLook(stock = FilmStocks.VIVID_100, halation = 0.2f, bloom = 0.12f, grain = 0.18f, grainSize = 1.0f,
                vignette = 0.2f, aberration = 0.05f, softness = -0.15f)),
        cam("disposable", "Disposable '98", "Verde 400 · flash & date", CameraCategory.FILM,
            FilmLook(stock = FilmStocks.VERDE_400, halation = 0.4f, bloom = 0.3f, grain = 0.5f, grainSize = 1.6f,
                lightLeak = 0.3f, vignette = 0.55f, aberration = 0.5f, softness = 0.3f, flash = 0.35f,
                stamp = StampStyle.DATE_98)),
        cam("halfframe", "Half Frame", "Two shots per frame", CameraCategory.FILM,
            FilmLook(stock = FilmStocks.GOLD_200, halation = 0.35f, bloom = 0.2f, grain = 0.5f, grainSize = 1.7f,
                vignette = 0.35f, aberration = 0.15f, lightLeak = 0.15f, multiShot = MultiShot.HALF_FRAME)),
        cam("slide", "Slide", "Chrome 100 · on the lightbox", CameraCategory.FILM,
            FilmLook(stock = FilmStocks.CHROME_100, halation = 0.2f, bloom = 0.15f, grain = 0.16f, grainSize = 1.0f,
                vignette = 0.25f, aberration = 0.05f, softness = -0.2f, frame = FrameStyle.SLIDE_MOUNT)),
        cam("strip", "Contact Strip", "Gold 200 · negative scan", CameraCategory.FILM,
            FilmLook(stock = FilmStocks.GOLD_200, halation = 0.3f, bloom = 0.15f, grain = 0.35f, grainSize = 1.3f,
                vignette = 0.2f, aberration = 0.08f, frame = FrameStyle.FILMSTRIP)),
        cam("crosspro", "Cross-Pro", "Slide film in negative chemistry", CameraCategory.FILM,
            FilmLook(stock = FilmStocks.CROSS_PRO, halation = 0.3f, bloom = 0.25f, grain = 0.45f, grainSize = 1.5f,
                vignette = 0.45f, aberration = 0.2f, lightLeak = 0.15f)),
        cam("redscale", "Redscale", "Film loaded backwards", CameraCategory.FILM,
            FilmLook(stock = FilmStocks.REDSCALE, halation = 0.45f, bloom = 0.3f, grain = 0.55f, grainSize = 1.7f,
                vignette = 0.45f, aberration = 0.15f)),
        cam("expired", "Expired", "Found in a drawer", CameraCategory.FILM,
            FilmLook(stock = FilmStocks.EXPIRED, halation = 0.45f, bloom = 0.35f, grain = 0.68f, grainSize = 1.9f,
                lightLeak = 0.7f, vignette = 0.5f, dust = 0.4f, flicker = 0.15f, colorFlicker = 0.3f,
                aberration = 0.3f, softness = 0.25f)),

        // ------------------------------------------------------------ cinema
        cam("cine800t", "Cine 800T", "Tungsten night · red halation", CameraCategory.CINE,
            FilmLook(stock = FilmStocks.CINE_800T, halation = 0.85f, halationSize = 0.55f, bloom = 0.4f, grain = 0.42f,
                grainSize = 1.5f, vignette = 0.35f, gateWeave = 0.12f, aberration = 0.12f,
                frameRate = FilmFrameRate.FPS_24, shutter = ShutterSpeed.S48)),
        cam("cine250d", "Cine 250D", "Daylight negative · wide latitude", CameraCategory.CINE,
            FilmLook(stock = FilmStocks.CINE_250D, halation = 0.4f, bloom = 0.25f, grain = 0.3f, grainSize = 1.3f,
                vignette = 0.3f, gateWeave = 0.1f, aberration = 0.08f, frameRate = FilmFrameRate.FPS_24,
                shutter = ShutterSpeed.S48)),
        cam("scope", "Scope", "Anamorphic 2.39 · streaks", CameraCategory.CINE,
            FilmLook(stock = FilmStocks.CINE_250D, halation = 0.45f, bloom = 0.2f, streak = 0.7f, grain = 0.32f,
                grainSize = 1.3f, vignette = 0.4f, distortion = 0.12f, gateWeave = 0.08f, aberration = 0.2f,
                frameRate = FilmFrameRate.FPS_24, shutter = ShutterSpeed.S48, frame = FrameStyle.LETTERBOX)),
        cam("bleach", "Bleach Bypass", "Silver retained · gritty", CameraCategory.CINE,
            FilmLook(stock = FilmStocks.BLEACH, halation = 0.3f, bloom = 0.15f, grain = 0.5f, grainSize = 1.4f,
                vignette = 0.4f, gateWeave = 0.1f, softness = -0.2f, frameRate = FilmFrameRate.FPS_24,
                shutter = ShutterSpeed.S48)),
        cam("super8", "Super 8", "Home movie · 18 fps", CameraCategory.CINE,
            FilmLook(stock = FilmStocks.SUPER8_REVERSAL, halation = 0.5f, bloom = 0.35f, grain = 0.75f, grainSize = 2.4f,
                lightLeak = 0.35f, vignette = 0.6f, gateWeave = 0.8f, frameSlip = 0.2f, flicker = 0.5f, colorFlicker = 0.3f,
                dust = 0.55f, aberration = 0.35f, softness = 0.45f, shutter = ShutterSpeed.S30, rollBurn = true,
                frameRate = FilmFrameRate.FPS_18, frame = FrameStyle.GATE)),
        cam("super8strip", "Super 8 Reel", "Projected strip with perfs", CameraCategory.CINE,
            FilmLook(stock = FilmStocks.SUPER8_REVERSAL, halation = 0.45f, bloom = 0.3f, grain = 0.7f, grainSize = 2.2f,
                lightLeak = 0.25f, vignette = 0.5f, gateWeave = 0.7f, flicker = 0.4f, dust = 0.5f, aberration = 0.3f,
                softness = 0.4f, shutter = ShutterSpeed.S30, rollBurn = true, frameRate = FilmFrameRate.FPS_18,
                frame = FrameStyle.SUPER8_STRIP)),
        cam("bolex16", "16mm", "Documentary · 24 fps", CameraCategory.CINE,
            FilmLook(stock = FilmStocks.PORTRAIT_400, halation = 0.45f, bloom = 0.25f, grain = 0.58f, grainSize = 1.8f,
                vignette = 0.45f, gateWeave = 0.4f, flicker = 0.25f, dust = 0.3f, aberration = 0.2f,
                softness = 0.2f, shutter = ShutterSpeed.S48, frameRate = FilmFrameRate.FPS_24, frame = FrameStyle.GATE)),
        cam("homemovie", "K-64 Reel", "Rich reds · 1960s reel", CameraCategory.CINE,
            FilmLook(stock = FilmStocks.K64, halation = 0.35f, bloom = 0.25f, grain = 0.45f, grainSize = 1.9f,
                lightLeak = 0.2f, vignette = 0.55f, gateWeave = 0.6f, frameSlip = 0.1f, flicker = 0.4f, dust = 0.45f,
                aberration = 0.25f, softness = 0.3f, shutter = ShutterSpeed.S30, rollBurn = true,
                frameRate = FilmFrameRate.FPS_18, frame = FrameStyle.GATE)),
        cam("twostrip", "1929 Color", "Two-strip · red and teal", CameraCategory.CINE,
            FilmLook(stock = FilmStocks.TWO_STRIP, halation = 0.4f, bloom = 0.3f, grain = 0.55f, grainSize = 1.9f,
                vignette = 0.6f, gateWeave = 0.5f, flicker = 0.45f, colorFlicker = 0.4f, dust = 0.5f, softness = 0.35f,
                frameRate = FilmFrameRate.FPS_18, frame = FrameStyle.ACADEMY)),
        cam("threestrip", "Technicolour", "Three-strip · 1950s saturation", CameraCategory.CINE,
            FilmLook(stock = FilmStocks.THREE_STRIP, halation = 0.35f, bloom = 0.3f, grain = 0.3f, grainSize = 1.5f,
                vignette = 0.4f, gateWeave = 0.25f, flicker = 0.15f, dust = 0.2f, softness = 0.15f,
                frameRate = FilmFrameRate.FPS_24, frame = FrameStyle.ACADEMY)),

        // ------------------------------------------------------------ instant
        cam("instant", "Instant", "Classic print · creamy", CameraCategory.INSTANT,
            FilmLook(stock = FilmStocks.INSTANT, halation = 0.25f, bloom = 0.35f, grain = 0.18f, grainSize = 1.1f,
                vignette = 0.4f, softness = 0.3f, aberration = 0.1f, frame = FrameStyle.INSTANT)),
        cam("instantsq", "Instant SQ", "Square print", CameraCategory.INSTANT,
            FilmLook(stock = FilmStocks.INSTANT, halation = 0.25f, bloom = 0.3f, grain = 0.18f, grainSize = 1.1f,
                vignette = 0.35f, softness = 0.25f, aberration = 0.1f, frame = FrameStyle.INSTANT_SQUARE)),
        cam("instantmini", "Instant Mini", "Credit-card print · flash", CameraCategory.INSTANT,
            FilmLook(stock = FilmStocks.INSTANT, halation = 0.3f, bloom = 0.35f, grain = 0.2f, grainSize = 1.1f,
                vignette = 0.45f, softness = 0.2f, flash = 0.3f, frame = FrameStyle.INSTANT_MINI)),
        cam("peel", "Peel-Apart", "Cool pack film · rough edge", CameraCategory.INSTANT,
            FilmLook(stock = FilmStocks.PEEL_APART, halation = 0.25f, bloom = 0.25f, grain = 0.25f, grainSize = 1.2f,
                vignette = 0.35f, softness = 0.15f, frame = FrameStyle.DECKLE)),

        // ------------------------------------------------------------ black and white
        cam("noir", "Noir", "Mono 400 · pushed", CameraCategory.MONO,
            FilmLook(stock = FilmStocks.MONO_400, halation = 0.2f, bloom = 0.15f, grain = 0.62f, grainSize = 1.6f,
                vignette = 0.45f, aberration = 0f, softness = -0.1f, frame = FrameStyle.FILED)),
        cam("silver", "Silver", "Mono 100 · fine grain", CameraCategory.MONO,
            FilmLook(stock = FilmStocks.SILVER_100, halation = 0.15f, bloom = 0.2f, grain = 0.22f, grainSize = 1.0f,
                vignette = 0.25f, aberration = 0f)),
        cam("medium", "Medium Format", "Silver 100 on 120 roll film", CameraCategory.MONO,
            FilmLook(stock = FilmStocks.SILVER_100, halation = 0.15f, bloom = 0.15f, grain = 0.15f, grainSize = 0.9f,
                vignette = 0.3f, aberration = 0f, softness = -0.1f, frame = FrameStyle.STRIP_120)),
        cam("sepia", "Sepia", "Toned print · 1940s", CameraCategory.MONO,
            FilmLook(stock = FilmStocks.SEPIA, halation = 0.2f, bloom = 0.25f, grain = 0.45f, grainSize = 1.5f,
                vignette = 0.55f, dust = 0.35f, softness = 0.2f, frame = FrameStyle.DECKLE)),
        cam("silent", "Silent Film", "Ortho · 16 fps · 1920s", CameraCategory.MONO,
            FilmLook(stock = FilmStocks.ORTHO, halation = 0.3f, bloom = 0.35f, grain = 0.6f, grainSize = 2.0f,
                vignette = 0.75f, gateWeave = 0.9f, frameSlip = 0.3f, flicker = 0.85f, dust = 0.8f, softness = 0.4f,
                shutter = ShutterSpeed.S30, frameRate = FilmFrameRate.FPS_16, rollBurn = true, frame = FrameStyle.ACADEMY)),

        // ------------------------------------------------------------ toy and fun
        cam("toy", "Toy Lens", "Plastic 120 · soft corners", CameraCategory.TOY,
            FilmLook(stock = FilmStocks.CROSS_PRO, halation = 0.4f, bloom = 0.35f, grain = 0.5f, grainSize = 1.7f,
                lightLeak = 0.45f, vignette = 0.85f, cornerBlur = 0.75f, distortion = 0.08f, aberration = 0.35f,
                softness = 0.25f, frame = FrameStyle.STRIP_120)),
        cam("pinhole", "Pinhole", "No lens · long exposure", CameraCategory.TOY,
            FilmLook(stock = FilmStocks.PORTRAIT_400, halation = 0.3f, bloom = 0.4f, grain = 0.5f, grainSize = 1.6f,
                vignette = 0.95f, cornerBlur = 0.4f, softness = 0.85f, shutter = ShutterSpeed.S4)),
        cam("sampler", "4-Lens Sampler", "Four shots, one frame", CameraCategory.TOY,
            FilmLook(stock = FilmStocks.VIVID_100, halation = 0.3f, bloom = 0.2f, grain = 0.4f, grainSize = 1.5f,
                vignette = 0.5f, aberration = 0.2f, softness = 0.15f, multiShot = MultiShot.SAMPLER)),
        cam("fisheye", "Fisheye", "Circular 180°", CameraCategory.TOY,
            FilmLook(stock = FilmStocks.GOLD_200, halation = 0.35f, bloom = 0.25f, grain = 0.4f, grainSize = 1.5f,
                vignette = 0.3f, distortion = 1f, circleMask = true, aberration = 0.4f)),
        cam("stereo", "Stereo 3D", "Red/cyan anaglyph", CameraCategory.TOY,
            FilmLook(stock = FilmStocks.PORTRAIT_400, halation = 0.25f, bloom = 0.2f, grain = 0.35f, grainSize = 1.4f,
                vignette = 0.3f, anaglyph = 0.6f)),
        cam("prism", "Prism", "Rainbow flare & ghost", CameraCategory.TOY,
            FilmLook(stock = FilmStocks.PORTRAIT_400, halation = 0.35f, bloom = 0.35f, grain = 0.3f, grainSize = 1.3f,
                prism = 0.7f, vignette = 0.3f, aberration = 0.25f)),
        cam("party", "Flash Party", "Direct flash · night out", CameraCategory.TOY,
            FilmLook(stock = FilmStocks.VIVID_100, halation = 0.3f, bloom = 0.25f, grain = 0.45f, grainSize = 1.5f,
                vignette = 0.6f, flash = 0.75f, aberration = 0.2f, stamp = StampStyle.DATE)),
        // The direct-flash look all over social feeds: a bright, crisp subject, glossy skin
        // highlights, a background that drops away into the dark, a cool flash white.
        cam("viralflash", "Viral Flash", "Direct flash · glossy and crisp", CameraCategory.TOY,
            FilmLook(stock = FilmStocks.NEUTRAL, flash = 0.7f, contrast = 0.35f, shadows = -0.35f, highlights = 0.12f,
                clarity = 0.35f, sharpness = 0.3f, warmth = -0.12f, saturation = 0.06f, bloom = 0.18f, halation = 0.1f,
                vignette = 0.25f, aberration = 0.04f)),
        // The same flash on an early-2000s pocket camera: warmer, softer, a date in the corner.
        cam("y2kflash", "Y2K Flash", "Pocket digicam flash · date stamp", CameraCategory.TOY,
            FilmLook(stock = FilmStocks.DIGICAM, flash = 0.65f, contrast = 0.2f, shadows = -0.25f, warmth = 0.08f,
                bloom = 0.22f, halation = 0.15f, vignette = 0.3f, aberration = 0.12f, softness = 0.1f, stamp = StampStyle.DATE)),

        // ------------------------------------------------------------ motion and dream
        cam("golden", "Golden Hour", "Mist filter · glowing haze", CameraCategory.MOTION,
            FilmLook(stock = FilmStocks.GOLDEN, halation = 0.55f, halationSize = 0.7f, bloom = 0.55f, diffusion = 0.65f,
                grain = 0.3f, grainSize = 1.4f, lightLeak = 0.25f, vignette = 0.3f, softness = 0.15f, aberration = 0.1f)),
        cam("summer", "Summer Reel", "Super 8 holiday · deep teal sea", CameraCategory.MOTION,
            FilmLook(stock = FilmStocks.SUMMER_REEL, halation = 0.45f, bloom = 0.25f, grain = 0.62f, grainSize = 2.2f,
                vignette = 0.55f, gateWeave = 0.6f, flicker = 0.3f, colorFlicker = 0.2f, dust = 0.2f, aberration = 0.2f,
                softness = 0.4f, shutter = ShutterSpeed.S30, frameRate = FilmFrameRate.FPS_18, rollBurn = true)),
        cam("steprint", "Step Print", "Smeared motion · 8 fps", CameraCategory.MOTION,
            FilmLook(stock = FilmStocks.PORTRAIT_400, halation = 0.35f, bloom = 0.25f, grain = 0.5f, grainSize = 1.7f,
                fade = 0.25f, vignette = 0.35f, blurMode = BlurMode.MOTION, blur = 0.35f, blurFocus = 0f,
                shutter = ShutterSpeed.S4, frameRate = FilmFrameRate.FPS_8)),
        cam("pan", "Panning", "Horizontal motion blur", CameraCategory.MOTION,
            FilmLook(stock = FilmStocks.GOLD_200, halation = 0.3f, bloom = 0.2f, grain = 0.45f, grainSize = 1.6f,
                fade = 0.25f, warmth = 0.15f, vignette = 0.3f, blurMode = BlurMode.MOTION, blur = 0.6f, blurFocus = 0.25f,
                shutter = ShutterSpeed.S15)),
        cam("spin", "Spin", "Twirled frame · rainbow arc", CameraCategory.MOTION,
            FilmLook(stock = FilmStocks.VERDE_400, halation = 0.4f, bloom = 0.35f, grain = 0.45f, grainSize = 1.6f,
                prism = 0.5f, lightLeak = 0.2f, vignette = 0.4f, blurMode = BlurMode.SPIN, blur = 0.6f, blurFocus = 0.25f,
                aberration = 0.3f)),
        cam("zoomburst", "Zoom Burst", "Zoomed during the exposure", CameraCategory.MOTION,
            FilmLook(stock = FilmStocks.VIVID_100, halation = 0.35f, bloom = 0.3f, grain = 0.4f, grainSize = 1.5f,
                vignette = 0.35f, blurMode = BlurMode.ZOOM, blur = 0.6f, blurFocus = 0.25f, aberration = 0.25f)),
        cam("dream", "Dreamy Soft", "Soft focus · pastel", CameraCategory.MOTION,
            FilmLook(stock = FilmStocks.PORTRAIT_400, halation = 0.4f, bloom = 0.45f, diffusion = 0.5f, grain = 0.25f,
                grainSize = 1.3f, fade = 0.35f, vignette = 0.25f, blurMode = BlurMode.GAUSSIAN, blur = 0.25f, blurFocus = 0.35f)),
        cam("stopmotion", "Stop Motion", "6 fps · jittery frames", CameraCategory.MOTION,
            FilmLook(stock = FilmStocks.K64, halation = 0.35f, bloom = 0.25f, grain = 0.5f, grainSize = 1.8f,
                vignette = 0.45f, gateWeave = 1f, flicker = 0.55f, colorFlicker = 0.35f, dust = 0.35f, softness = 0.2f,
                frameRate = FilmFrameRate.FPS_6)),

        // ------------------------------------------------------------ retro video
        cam("vhs", "Camcorder '98", "VHS tape · REC overlay", CameraCategory.VIDEO,
            FilmLook(stock = FilmStocks.VHS_TAPE, halation = 0.25f, bloom = 0.4f, grain = 0.25f, grainSize = 1.2f,
                vignette = 0.2f, aberration = 0.25f, softness = 0.2f, vhs = 0.75f, lowRes = 0.55f, interlace = 0.3f,
                shutter = ShutterSpeed.S60, stamp = StampStyle.CAMCORDER, frame = FrameStyle.ACADEMY)),
        cam("minidv", "Mini DV", "2003 digital tape", CameraCategory.VIDEO,
            FilmLook(stock = FilmStocks.MINI_DV, halation = 0.1f, bloom = 0.2f, grain = 0.2f, grainSize = 0.8f,
                vignette = 0.15f, aberration = 0.1f, softness = -0.5f, vhs = 0.15f, lowRes = 0.35f, interlace = 0.8f,
                stamp = StampStyle.CAMCORDER, frame = FrameStyle.ACADEMY)),
        cam("ccd", "CCD 2005", "Early digicam · date", CameraCategory.VIDEO,
            FilmLook(stock = FilmStocks.DIGICAM, halation = 0.15f, bloom = 0.35f, grain = 0.28f, grainSize = 0.8f,
                vignette = 0.25f, aberration = 0.35f, softness = -0.55f, lowRes = 0.25f, flash = 0.2f,
                stamp = StampStyle.DATE)),
    )

    /** The Original camera is the default: no look until you pick one. */
    fun byId(id: String?): FilmCamera = ALL.firstOrNull { it.id == id } ?: CustomLooks.imported.firstOrNull { it.id == id } ?: ORIGINAL
}

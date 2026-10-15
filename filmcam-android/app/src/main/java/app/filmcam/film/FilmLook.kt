package app.filmcam.film

/** What surrounds the picture: none, a projector gate, an instant print, a negative strip... */
enum class FrameStyle(val label: String, val shaderId: Int) {
    NONE("None", 0),
    GATE("Gate", 1),
    INSTANT("Instant", 2),
    FILMSTRIP("35mm strip", 3),
    FILED("Filed print", 4),
}

/** Cadence the picture changes at. Frames are held, like a camera cranked slower. */
enum class FilmFrameRate(val label: String, val fps: Int) {
    NATIVE("30", 0),
    FPS_24("24", 24),
    FPS_18("18", 18),
    FPS_12("12", 12),
}

/** Simulated shutter speeds. Slower ones leave motion trails, like a long exposure. */
enum class ShutterSpeed(val label: String, val seconds: Float) {
    S1000("1/1000", 1f / 1000f),
    S500("1/500", 1f / 500f),
    S250("1/250", 1f / 250f),
    S125("1/125", 1f / 125f),
    S60("1/60", 1f / 60f),
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
    val halation: Float = 0.35f,
    val bloom: Float = 0.2f,
    val grain: Float = 0.35f,
    /** Grain cell size in pixels of a 1080-line frame (0.6..3). */
    val grainSize: Float = 1.3f,
    val lightLeak: Float = 0f,
    val vignette: Float = 0.3f,
    val gateWeave: Float = 0f,
    val flicker: Float = 0f,
    val dust: Float = 0f,
    val aberration: Float = 0.1f,
    /** -1 sharp .. +1 soft. */
    val softness: Float = 0f,
    /** Extra fade on top of the stock's own. */
    val fade: Float = 0f,
    /** Extra warmth on top of the stock's own, -1..1. */
    val warmth: Float = 0f,
    val shutter: ShutterSpeed = ShutterSpeed.S125,
    val frameRate: FilmFrameRate = FilmFrameRate.NATIVE,
    val frame: FrameStyle = FrameStyle.NONE,
    val dateStamp: Boolean = false,
    /** Real exposure compensation sent to the camera, in EV. */
    val exposureEv: Float = 0f,
)

/** A "camera": a stock plus a format and a set of effects that belong together. */
data class FilmCamera(
    val id: String,
    val name: String,
    val subtitle: String,
    val look: FilmLook,
)

object FilmCameras {
    val ALL: List<FilmCamera> = listOf(
        FilmCamera(
            "classic35", "Classic 35", "Gold 200 · point & shoot",
            FilmLook(stock = FilmStocks.GOLD_200, halation = 0.35f, bloom = 0.2f, grain = 0.38f, grainSize = 1.3f,
                vignette = 0.3f, aberration = 0.15f, lightLeak = 0.12f),
        ),
        FilmCamera(
            "portrait", "Portrait", "Portrait 400 · soft skin",
            FilmLook(stock = FilmStocks.PORTRAIT_400, halation = 0.3f, bloom = 0.25f, grain = 0.3f, grainSize = 1.2f,
                vignette = 0.22f, softness = 0.1f, aberration = 0.08f),
        ),
        FilmCamera(
            "cine800t", "Cine 800T", "Tungsten cinema · red halation",
            FilmLook(stock = FilmStocks.CINE_800T, halation = 0.85f, bloom = 0.4f, grain = 0.42f, grainSize = 1.5f,
                vignette = 0.35f, gateWeave = 0.12f, aberration = 0.12f, frameRate = FilmFrameRate.FPS_24,
                shutter = ShutterSpeed.S60),
        ),
        FilmCamera(
            "super8", "Super 8", "Home movie · 18 fps",
            FilmLook(stock = FilmStocks.SUPER8_REVERSAL, halation = 0.5f, bloom = 0.35f, grain = 0.75f, grainSize = 2.4f,
                lightLeak = 0.35f, vignette = 0.6f, gateWeave = 0.8f, flicker = 0.5f, dust = 0.55f,
                aberration = 0.35f, softness = 0.45f, shutter = ShutterSpeed.S30,
                frameRate = FilmFrameRate.FPS_18, frame = FrameStyle.GATE),
        ),
        FilmCamera(
            "bolex16", "16mm", "Documentary · 24 fps",
            FilmLook(stock = FilmStocks.PORTRAIT_400, halation = 0.45f, bloom = 0.25f, grain = 0.58f, grainSize = 1.8f,
                vignette = 0.45f, gateWeave = 0.4f, flicker = 0.25f, dust = 0.3f, aberration = 0.2f,
                softness = 0.2f, shutter = ShutterSpeed.S60, frameRate = FilmFrameRate.FPS_24, frame = FrameStyle.GATE),
        ),
        FilmCamera(
            "disposable", "Disposable", "Superior 400 · flash & date",
            FilmLook(stock = FilmStocks.GREEN_400, halation = 0.4f, bloom = 0.3f, grain = 0.5f, grainSize = 1.6f,
                lightLeak = 0.3f, vignette = 0.55f, aberration = 0.5f, softness = 0.3f, dateStamp = true),
        ),
        FilmCamera(
            "instant", "Instant", "Square-ish print · creamy",
            FilmLook(stock = FilmStocks.INSTANT, halation = 0.25f, bloom = 0.35f, grain = 0.18f, grainSize = 1.1f,
                vignette = 0.4f, softness = 0.3f, aberration = 0.1f, frame = FrameStyle.INSTANT),
        ),
        FilmCamera(
            "slide", "Slide", "Chrome 100 · on the lightbox",
            FilmLook(stock = FilmStocks.CHROME_100, halation = 0.2f, bloom = 0.15f, grain = 0.16f, grainSize = 1.0f,
                vignette = 0.25f, aberration = 0.05f, softness = -0.2f, frame = FrameStyle.FILMSTRIP),
        ),
        FilmCamera(
            "homemovie", "K-64 Reel", "Rich reds · 1960s reel",
            FilmLook(stock = FilmStocks.K64, halation = 0.35f, bloom = 0.25f, grain = 0.45f, grainSize = 1.9f,
                lightLeak = 0.2f, vignette = 0.55f, gateWeave = 0.6f, flicker = 0.4f, dust = 0.45f,
                aberration = 0.25f, softness = 0.3f, shutter = ShutterSpeed.S30,
                frameRate = FilmFrameRate.FPS_18, frame = FrameStyle.GATE),
        ),
        FilmCamera(
            "noir", "Noir", "Mono 400 · pushed",
            FilmLook(stock = FilmStocks.MONO_400, halation = 0.2f, bloom = 0.15f, grain = 0.62f, grainSize = 1.6f,
                vignette = 0.45f, aberration = 0f, softness = -0.1f, frame = FrameStyle.FILED),
        ),
        FilmCamera(
            "silver", "Silver", "Mono 100 · fine grain",
            FilmLook(stock = FilmStocks.SILVER_100, halation = 0.15f, bloom = 0.2f, grain = 0.22f, grainSize = 1.0f,
                vignette = 0.25f, aberration = 0f),
        ),
        FilmCamera(
            "expired", "Expired", "Found in a drawer",
            FilmLook(stock = FilmStocks.EXPIRED, halation = 0.45f, bloom = 0.35f, grain = 0.68f, grainSize = 1.9f,
                lightLeak = 0.7f, vignette = 0.5f, dust = 0.4f, flicker = 0.15f, aberration = 0.3f, softness = 0.25f),
        ),
    )

    fun byId(id: String?): FilmCamera = ALL.firstOrNull { it.id == id } ?: ALL.first()
}

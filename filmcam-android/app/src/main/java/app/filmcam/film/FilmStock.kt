package app.filmcam.film

/**
 * The colour science of one emulsion. Everything here feeds the final shader pass; the
 * values are hand-tuned looks, not measurements of any real product.
 */
data class FilmStock(
    val id: String,
    val name: String,
    /** -1 cool .. +1 warm. */
    val temperature: Float = 0f,
    /** -1 green .. +1 magenta. */
    val tint: Float = 0f,
    val saturation: Float = 1f,
    /** Saturation multiplier in the deep shadows and in the highlights (film desaturates both). */
    val satShadows: Float = 0.85f,
    val satHighlights: Float = 0.8f,
    /** Exponent of the S-curve: 1 = linear, >1 = punchier. */
    val contrast: Float = 1.1f,
    /** Black lift (milky shadows). */
    val fade: Float = 0f,
    /** Highlight roll-off: how far the whites are pulled down. */
    val highlightRolloff: Float = 0.04f,
    /** Per-channel gamma: the layer crossovers that give each film its shadow/highlight casts. */
    val gamma: Rgb = Rgb(1f, 1f, 1f),
    /** Hue nudges for reds, greens and blues; 1 = 30 degrees toward the next hue. */
    val hueShift: Rgb = Rgb(0f, 0f, 0f),
    /** Additive colour pushed into the shadows / highlights (split toning). */
    val shadowTint: Rgb = Rgb(0f, 0f, 0f),
    val highlightTint: Rgb = Rgb(0f, 0f, 0f),
    /** Row-major 3x3 channel mixer (dye crosstalk). */
    val mixer: FloatArray = IDENTITY,
    val monochrome: Boolean = false,
    /** Bleach bypass: silver left in the print, high contrast and low saturation. */
    val bleach: Float = 0f,
    /** Colour of the halo that bleeds around highlights. */
    val halationColor: Rgb = Rgb(1f, 0.32f, 0.12f),
    /** How much of the grain is chromatic (0 = pure luminance grain). */
    val colorGrain: Float = 0.35f,
    /** Swatch shown on the picker. */
    val swatch: Long = 0xFFE8A33D,
) {
    companion object {
        val IDENTITY = floatArrayOf(1f, 0f, 0f, 0f, 1f, 0f, 0f, 0f, 1f)
    }
}

data class Rgb(val r: Float, val g: Float, val b: Float)

private fun mono(r: Float, g: Float, b: Float) = floatArrayOf(r, g, b, r, g, b, r, g, b)

object FilmStocks {
    // ---------------------------------------------------------------- colour negative
    val GOLD_200 = FilmStock(
        id = "gold200", name = "Gold 200",
        temperature = 0.35f, tint = 0.05f, saturation = 1.12f, contrast = 1.18f, fade = 0.03f,
        gamma = Rgb(0.97f, 1f, 1.06f), hueShift = Rgb(0.25f, -0.35f, -0.1f),
        shadowTint = Rgb(0.02f, 0.01f, -0.01f), highlightTint = Rgb(0.04f, 0.025f, -0.03f),
        mixer = floatArrayOf(1.04f, -0.02f, -0.02f, -0.03f, 1.05f, -0.02f, -0.02f, -0.06f, 1.08f),
        swatch = 0xFFE8B23D,
    )
    val PORTRAIT_400 = FilmStock(
        id = "portrait400", name = "Portrait 400",
        temperature = 0.15f, tint = 0.06f, saturation = 0.9f, contrast = 1.02f, fade = 0.05f,
        gamma = Rgb(0.98f, 1f, 1.03f), hueShift = Rgb(0.2f, -0.3f, -0.2f), satHighlights = 0.75f,
        shadowTint = Rgb(-0.01f, 0.005f, 0.02f), highlightTint = Rgb(0.03f, 0.015f, -0.005f),
        mixer = floatArrayOf(1.02f, 0.0f, -0.02f, -0.02f, 1.03f, -0.01f, 0.0f, -0.03f, 1.03f),
        swatch = 0xFFD9A07A,
    )
    val VERDE_400 = FilmStock(
        id = "verde400", name = "Verde 400",
        temperature = -0.08f, tint = -0.12f, saturation = 1.06f, contrast = 1.1f, fade = 0.04f,
        gamma = Rgb(1.03f, 0.98f, 1f), hueShift = Rgb(-0.1f, 0.35f, -0.25f),
        shadowTint = Rgb(-0.015f, 0.02f, 0.01f), highlightTint = Rgb(0.01f, 0.0f, 0.015f),
        mixer = floatArrayOf(1.0f, 0.02f, -0.02f, -0.04f, 1.08f, -0.04f, 0.0f, 0.03f, 0.97f),
        swatch = 0xFF5B9A6B,
    )
    val VIVID_100 = FilmStock(
        id = "vivid100", name = "Vivid 100",
        temperature = 0.08f, saturation = 1.28f, contrast = 1.24f, fade = 0.01f, satShadows = 0.95f,
        hueShift = Rgb(0.1f, -0.15f, 0.1f), highlightTint = Rgb(0.015f, 0.01f, -0.01f),
        mixer = floatArrayOf(1.08f, -0.05f, -0.03f, -0.03f, 1.07f, -0.04f, -0.02f, -0.06f, 1.08f),
        colorGrain = 0.2f, swatch = 0xFFE0573A,
    )
    val EXPIRED = FilmStock(
        id = "expired", name = "Expired '98",
        temperature = 0.1f, tint = 0.22f, saturation = 0.8f, contrast = 0.92f, fade = 0.12f, highlightRolloff = 0.12f,
        gamma = Rgb(0.95f, 1.04f, 0.92f),
        shadowTint = Rgb(0.0f, 0.03f, 0.05f), highlightTint = Rgb(0.06f, 0.02f, 0.02f),
        mixer = floatArrayOf(0.96f, 0.08f, -0.04f, 0.04f, 0.9f, 0.06f, 0.06f, 0.06f, 0.88f),
        colorGrain = 0.7f, swatch = 0xFFB07AA1,
    )
    val CROSS_PRO = FilmStock(
        id = "cross", name = "Cross-Pro",
        temperature = 0.05f, tint = -0.18f, saturation = 1.3f, contrast = 1.45f, fade = 0.02f,
        gamma = Rgb(0.88f, 0.92f, 1.32f), hueShift = Rgb(0.4f, -0.5f, -0.5f),
        shadowTint = Rgb(-0.02f, 0.02f, 0.05f), highlightTint = Rgb(0.04f, 0.05f, -0.06f),
        mixer = floatArrayOf(1.1f, -0.06f, -0.04f, -0.02f, 1.1f, -0.08f, -0.08f, 0.04f, 1.04f),
        swatch = 0xFFC9D63A,
    )
    val REDSCALE = FilmStock(
        id = "redscale", name = "Redscale",
        temperature = 0.6f, saturation = 1.15f, contrast = 1.2f, fade = 0.05f,
        gamma = Rgb(0.85f, 1.15f, 1.9f),
        shadowTint = Rgb(0.03f, -0.01f, -0.02f), highlightTint = Rgb(0.06f, 0.02f, -0.04f),
        mixer = floatArrayOf(0.75f, 0.3f, 0.05f, 0.25f, 0.6f, 0.05f, 0.1f, 0.2f, 0.25f),
        halationColor = Rgb(1f, 0.25f, 0.05f), colorGrain = 0.45f, swatch = 0xFFD0461C,
    )

    // ---------------------------------------------------------------- cinema
    val CINE_800T = FilmStock(
        id = "cine800t", name = "Cine 800T",
        temperature = -0.45f, tint = 0.08f, saturation = 1.04f, contrast = 1.12f, fade = 0.04f,
        gamma = Rgb(1.02f, 1f, 0.96f), hueShift = Rgb(0.1f, 0.15f, -0.2f),
        shadowTint = Rgb(-0.02f, 0.01f, 0.035f), highlightTint = Rgb(0.03f, 0.0f, -0.02f),
        mixer = floatArrayOf(1.06f, -0.04f, -0.02f, -0.02f, 1.02f, 0.0f, -0.02f, 0.02f, 1.0f),
        halationColor = Rgb(1f, 0.16f, 0.06f), colorGrain = 0.45f,
        swatch = 0xFF4E7FA8,
    )
    val CINE_250D = FilmStock(
        id = "cine250d", name = "Cine 250D",
        temperature = 0.06f, saturation = 0.95f, contrast = 1.06f, fade = 0.03f, highlightRolloff = 0.08f,
        gamma = Rgb(0.99f, 1f, 1.02f), hueShift = Rgb(0.15f, -0.25f, -0.15f), satHighlights = 0.7f,
        shadowTint = Rgb(-0.015f, 0.008f, 0.02f), highlightTint = Rgb(0.025f, 0.012f, -0.01f),
        mixer = floatArrayOf(1.03f, -0.02f, -0.01f, -0.02f, 1.03f, -0.01f, -0.01f, -0.03f, 1.04f),
        halationColor = Rgb(1f, 0.3f, 0.12f), colorGrain = 0.3f, swatch = 0xFFB9A27A,
    )
    val BLEACH = FilmStock(
        id = "bleach", name = "Bleach Bypass",
        temperature = -0.05f, saturation = 0.7f, contrast = 1.32f, fade = 0.02f, bleach = 0.8f,
        shadowTint = Rgb(-0.01f, 0.0f, 0.015f), highlightTint = Rgb(0.01f, 0.01f, 0.0f),
        colorGrain = 0.15f, halationColor = Rgb(0.9f, 0.7f, 0.55f), swatch = 0xFF7D8A86,
    )
    val TWO_STRIP = FilmStock(
        id = "twostrip", name = "Two-Strip",
        temperature = 0.1f, saturation = 1.05f, contrast = 1.25f, fade = 0.05f,
        // Only red-orange and blue-green dyes: R from red, G and B share the green record.
        mixer = floatArrayOf(0.95f, 0.1f, -0.05f, 0.1f, 0.75f, 0.15f, 0.05f, 0.7f, 0.25f),
        shadowTint = Rgb(0.0f, 0.01f, 0.02f), highlightTint = Rgb(0.04f, 0.02f, -0.01f),
        halationColor = Rgb(1f, 0.4f, 0.25f), colorGrain = 0.2f, swatch = 0xFFC2593F,
    )
    val THREE_STRIP = FilmStock(
        id = "threestrip", name = "Three-Strip",
        temperature = 0.12f, saturation = 1.38f, contrast = 1.28f, fade = 0.02f, satShadows = 1f,
        hueShift = Rgb(-0.15f, 0.1f, 0.25f),
        mixer = floatArrayOf(1.15f, -0.1f, -0.05f, -0.08f, 1.12f, -0.04f, -0.05f, -0.1f, 1.15f),
        shadowTint = Rgb(0.0f, 0.0f, 0.02f), highlightTint = Rgb(0.03f, 0.02f, -0.01f),
        colorGrain = 0.15f, swatch = 0xFF2E7DC4,
    )
    val SUPER8_REVERSAL = FilmStock(
        id = "s8rev", name = "Reversal 100D",
        temperature = 0.22f, tint = 0.04f, saturation = 1.2f, contrast = 1.32f, fade = 0.035f,
        gamma = Rgb(0.97f, 1f, 1.05f), hueShift = Rgb(0.2f, -0.2f, 0.1f),
        shadowTint = Rgb(0.0f, 0.005f, 0.03f), highlightTint = Rgb(0.05f, 0.03f, -0.03f),
        mixer = floatArrayOf(1.08f, -0.04f, -0.04f, -0.03f, 1.06f, -0.03f, -0.02f, -0.03f, 1.05f),
        colorGrain = 0.5f, swatch = 0xFFE07B39,
    )
    val K64 = FilmStock(
        id = "k64", name = "K-64",
        temperature = 0.18f, saturation = 1.18f, contrast = 1.3f, fade = 0.015f, satShadows = 1f,
        hueShift = Rgb(-0.1f, -0.2f, -0.15f),
        shadowTint = Rgb(0.0f, 0.0f, 0.015f), highlightTint = Rgb(0.03f, 0.015f, -0.02f),
        mixer = floatArrayOf(1.12f, -0.08f, -0.04f, -0.04f, 1.06f, -0.02f, -0.04f, 0.0f, 1.04f),
        colorGrain = 0.25f, swatch = 0xFFC8332B,
    )

    // ---------------------------------------------------------------- slide and instant
    val CHROME_100 = FilmStock(
        id = "chrome100", name = "Chrome 100",
        temperature = -0.05f, saturation = 1.32f, contrast = 1.42f, fade = 0.0f, highlightRolloff = 0.02f, satShadows = 1f,
        gamma = Rgb(1f, 1f, 0.96f), hueShift = Rgb(0f, 0.1f, 0.2f),
        shadowTint = Rgb(0.0f, -0.005f, 0.02f), highlightTint = Rgb(0.01f, 0.01f, 0.0f),
        mixer = floatArrayOf(1.08f, -0.06f, -0.02f, -0.04f, 1.08f, -0.04f, -0.02f, -0.04f, 1.06f),
        halationColor = Rgb(1f, 0.55f, 0.35f), colorGrain = 0.2f,
        swatch = 0xFF2F6DD0,
    )
    val INSTANT = FilmStock(
        id = "instant", name = "Instant",
        temperature = 0.12f, tint = 0.05f, saturation = 0.82f, contrast = 0.96f, fade = 0.08f, highlightRolloff = 0.1f,
        gamma = Rgb(0.97f, 0.98f, 0.94f),
        shadowTint = Rgb(-0.02f, 0.02f, 0.04f), highlightTint = Rgb(0.05f, 0.035f, 0.0f),
        mixer = floatArrayOf(1.0f, 0.04f, -0.04f, 0.02f, 0.96f, 0.02f, 0.02f, 0.06f, 0.92f),
        halationColor = Rgb(1f, 0.6f, 0.4f), colorGrain = 0.15f,
        swatch = 0xFF8FC1B5,
    )
    val PEEL_APART = FilmStock(
        id = "peel", name = "Peel-Apart",
        temperature = -0.12f, tint = -0.05f, saturation = 0.95f, contrast = 1.05f, fade = 0.06f, highlightRolloff = 0.08f,
        gamma = Rgb(1.04f, 0.98f, 0.94f), hueShift = Rgb(0f, 0.2f, -0.3f),
        shadowTint = Rgb(-0.03f, 0.01f, 0.04f), highlightTint = Rgb(0.03f, 0.03f, 0.01f),
        colorGrain = 0.2f, swatch = 0xFF6FA6B8,
    )

    // ---------------------------------------------------------------- black and white
    val MONO_400 = FilmStock(
        id = "mono400", name = "Mono 400",
        saturation = 1f, contrast = 1.38f, fade = 0.02f, monochrome = true,
        // Panchromatic B&W: a touch red-sensitive, blue darkened, like a light yellow filter.
        mixer = mono(0.36f, 0.56f, 0.08f),
        halationColor = Rgb(0.8f, 0.8f, 0.8f), colorGrain = 0f,
        swatch = 0xFF9A9A9A,
    )
    val SILVER_100 = FilmStock(
        id = "silver100", name = "Silver 100",
        contrast = 1.12f, fade = 0.04f, monochrome = true, highlightRolloff = 0.06f,
        mixer = mono(0.28f, 0.62f, 0.10f),
        shadowTint = Rgb(-0.004f, 0.0f, 0.008f), highlightTint = Rgb(0.02f, 0.012f, 0.0f),
        halationColor = Rgb(0.85f, 0.82f, 0.78f), colorGrain = 0f,
        swatch = 0xFFD8D2C4,
    )
    val SEPIA = FilmStock(
        id = "sepia", name = "Sepia Toned",
        contrast = 1.18f, fade = 0.08f, monochrome = true, highlightRolloff = 0.1f,
        mixer = mono(0.3f, 0.59f, 0.11f),
        shadowTint = Rgb(0.03f, 0.008f, -0.02f), highlightTint = Rgb(0.07f, 0.035f, -0.04f),
        halationColor = Rgb(0.9f, 0.75f, 0.55f), colorGrain = 0f, swatch = 0xFFA0784A,
    )
    val ORTHO = FilmStock(
        id = "ortho", name = "Ortho 25",
        contrast = 1.3f, fade = 0.06f, monochrome = true, highlightRolloff = 0.12f,
        // Orthochromatic emulsion: blind to red, so skies go white and lips go dark.
        mixer = mono(0.02f, 0.48f, 0.5f),
        shadowTint = Rgb(0.01f, 0.004f, -0.006f), highlightTint = Rgb(0.04f, 0.025f, -0.01f),
        halationColor = Rgb(0.85f, 0.85f, 0.85f), colorGrain = 0f, swatch = 0xFF6E6658,
    )

    // ---------------------------------------------------------------- video and digital
    val VHS_TAPE = FilmStock(
        id = "vhs", name = "VHS Tape",
        temperature = 0.06f, tint = 0.1f, saturation = 1.18f, contrast = 1.08f, fade = 0.07f, highlightRolloff = 0.02f,
        satShadows = 0.7f, gamma = Rgb(0.95f, 1f, 1.02f), hueShift = Rgb(-0.2f, 0.2f, 0.3f),
        shadowTint = Rgb(0.0f, 0.0f, 0.04f), highlightTint = Rgb(0.03f, 0.02f, 0.0f),
        halationColor = Rgb(1f, 0.85f, 0.8f), colorGrain = 0.8f, swatch = 0xFF5A4E8C,
    )
    val MINI_DV = FilmStock(
        id = "minidv", name = "Mini DV",
        temperature = -0.18f, tint = -0.04f, saturation = 1.08f, contrast = 1.12f, fade = 0.02f, highlightRolloff = 0f,
        gamma = Rgb(1f, 0.98f, 0.95f), hueShift = Rgb(0f, 0.2f, 0.1f),
        halationColor = Rgb(1f, 1f, 1f), colorGrain = 0.9f, swatch = 0xFF4C6C8C,
    )
    val DIGICAM = FilmStock(
        id = "ccd", name = "CCD 2005",
        temperature = -0.15f, tint = 0.03f, saturation = 1.22f, contrast = 1.22f, fade = 0f, highlightRolloff = 0f,
        satShadows = 1f, satHighlights = 0.95f, gamma = Rgb(1f, 0.98f, 0.94f), hueShift = Rgb(0f, 0.3f, 0.25f),
        shadowTint = Rgb(0f, 0f, 0.02f), halationColor = Rgb(1f, 1f, 1f), colorGrain = 1f,
        swatch = 0xFF7BB0E0,
    )

    val ALL = listOf(
        GOLD_200, PORTRAIT_400, VERDE_400, VIVID_100, EXPIRED, CROSS_PRO, REDSCALE,
        CINE_800T, CINE_250D, BLEACH, TWO_STRIP, THREE_STRIP, SUPER8_REVERSAL, K64,
        CHROME_100, INSTANT, PEEL_APART,
        MONO_400, SILVER_100, SEPIA, ORTHO,
        VHS_TAPE, MINI_DV, DIGICAM,
    )

    fun byId(id: String): FilmStock = ALL.firstOrNull { it.id == id } ?: GOLD_200
}

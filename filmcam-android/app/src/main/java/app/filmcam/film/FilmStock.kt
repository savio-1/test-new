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
    /** Exponent of the S-curve: 1 = linear, >1 = punchier. */
    val contrast: Float = 1.1f,
    /** Black lift (milky shadows). */
    val fade: Float = 0f,
    /** Highlight roll-off: how far the whites are pulled down. */
    val highlightRolloff: Float = 0.04f,
    /** Additive colour pushed into the shadows / highlights (split toning). */
    val shadowTint: Rgb = Rgb(0f, 0f, 0f),
    val highlightTint: Rgb = Rgb(0f, 0f, 0f),
    /** Row-major 3x3 channel mixer (dye crosstalk). */
    val mixer: FloatArray = IDENTITY,
    val monochrome: Boolean = false,
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

object FilmStocks {
    val GOLD_200 = FilmStock(
        id = "gold200", name = "Gold 200",
        temperature = 0.35f, tint = 0.05f, saturation = 1.12f, contrast = 1.18f, fade = 0.03f,
        shadowTint = Rgb(0.02f, 0.01f, -0.01f), highlightTint = Rgb(0.04f, 0.025f, -0.03f),
        mixer = floatArrayOf(1.04f, -0.02f, -0.02f, -0.03f, 1.05f, -0.02f, -0.02f, -0.06f, 1.08f),
        swatch = 0xFFE8B23D,
    )
    val PORTRAIT_400 = FilmStock(
        id = "portrait400", name = "Portrait 400",
        temperature = 0.15f, tint = 0.06f, saturation = 0.9f, contrast = 1.02f, fade = 0.05f,
        shadowTint = Rgb(-0.01f, 0.005f, 0.02f), highlightTint = Rgb(0.03f, 0.015f, -0.005f),
        mixer = floatArrayOf(1.02f, 0.0f, -0.02f, -0.02f, 1.03f, -0.01f, 0.0f, -0.03f, 1.03f),
        swatch = 0xFFD9A07A,
    )
    val CINE_800T = FilmStock(
        id = "cine800t", name = "Cine 800T",
        temperature = -0.45f, tint = 0.08f, saturation = 1.04f, contrast = 1.12f, fade = 0.04f,
        shadowTint = Rgb(-0.02f, 0.01f, 0.035f), highlightTint = Rgb(0.03f, 0.0f, -0.02f),
        mixer = floatArrayOf(1.06f, -0.04f, -0.02f, -0.02f, 1.02f, 0.0f, -0.02f, 0.02f, 1.0f),
        halationColor = Rgb(1f, 0.16f, 0.06f), colorGrain = 0.45f,
        swatch = 0xFF4E7FA8,
    )
    val GREEN_400 = FilmStock(
        id = "green400", name = "Superior 400",
        temperature = -0.08f, tint = -0.12f, saturation = 1.06f, contrast = 1.1f, fade = 0.04f,
        shadowTint = Rgb(-0.015f, 0.02f, 0.01f), highlightTint = Rgb(0.01f, 0.0f, 0.015f),
        mixer = floatArrayOf(1.0f, 0.02f, -0.02f, -0.04f, 1.08f, -0.04f, 0.0f, 0.03f, 0.97f),
        swatch = 0xFF5B9A6B,
    )
    val CHROME_100 = FilmStock(
        id = "chrome100", name = "Chrome 100",
        temperature = -0.05f, saturation = 1.32f, contrast = 1.42f, fade = 0.0f, highlightRolloff = 0.02f,
        shadowTint = Rgb(0.0f, -0.005f, 0.02f), highlightTint = Rgb(0.01f, 0.01f, 0.0f),
        mixer = floatArrayOf(1.08f, -0.06f, -0.02f, -0.04f, 1.08f, -0.04f, -0.02f, -0.04f, 1.06f),
        halationColor = Rgb(1f, 0.55f, 0.35f), colorGrain = 0.2f,
        swatch = 0xFF2F6DD0,
    )
    val K64 = FilmStock(
        id = "k64", name = "K-64",
        temperature = 0.18f, saturation = 1.18f, contrast = 1.3f, fade = 0.015f,
        shadowTint = Rgb(0.0f, 0.0f, 0.015f), highlightTint = Rgb(0.03f, 0.015f, -0.02f),
        mixer = floatArrayOf(1.12f, -0.08f, -0.04f, -0.04f, 1.06f, -0.02f, -0.04f, 0.0f, 1.04f),
        colorGrain = 0.25f,
        swatch = 0xFFC8332B,
    )
    val SUPER8_REVERSAL = FilmStock(
        id = "s8rev", name = "Reversal 100D",
        temperature = 0.22f, tint = 0.04f, saturation = 1.2f, contrast = 1.32f, fade = 0.035f,
        shadowTint = Rgb(0.0f, 0.005f, 0.03f), highlightTint = Rgb(0.05f, 0.03f, -0.03f),
        mixer = floatArrayOf(1.08f, -0.04f, -0.04f, -0.03f, 1.06f, -0.03f, -0.02f, -0.03f, 1.05f),
        colorGrain = 0.5f,
        swatch = 0xFFE07B39,
    )
    val INSTANT = FilmStock(
        id = "instant", name = "Instant",
        temperature = 0.12f, tint = 0.05f, saturation = 0.82f, contrast = 0.96f, fade = 0.08f, highlightRolloff = 0.1f,
        shadowTint = Rgb(-0.02f, 0.02f, 0.04f), highlightTint = Rgb(0.05f, 0.035f, 0.0f),
        mixer = floatArrayOf(1.0f, 0.04f, -0.04f, 0.02f, 0.96f, 0.02f, 0.02f, 0.06f, 0.92f),
        halationColor = Rgb(1f, 0.6f, 0.4f), colorGrain = 0.15f,
        swatch = 0xFF8FC1B5,
    )
    val EXPIRED = FilmStock(
        id = "expired", name = "Expired 1998",
        temperature = 0.1f, tint = 0.22f, saturation = 0.8f, contrast = 0.92f, fade = 0.12f, highlightRolloff = 0.12f,
        shadowTint = Rgb(0.0f, 0.03f, 0.05f), highlightTint = Rgb(0.06f, 0.02f, 0.02f),
        mixer = floatArrayOf(0.96f, 0.08f, -0.04f, 0.04f, 0.9f, 0.06f, 0.06f, 0.06f, 0.88f),
        colorGrain = 0.7f,
        swatch = 0xFFB07AA1,
    )
    val MONO_400 = FilmStock(
        id = "mono400", name = "Mono 400",
        saturation = 1f, contrast = 1.38f, fade = 0.02f, monochrome = true,
        // Panchromatic B&W: a touch red-sensitive, blue darkened, like a light yellow filter.
        mixer = floatArrayOf(0.36f, 0.56f, 0.08f, 0.36f, 0.56f, 0.08f, 0.36f, 0.56f, 0.08f),
        halationColor = Rgb(0.8f, 0.8f, 0.8f), colorGrain = 0f,
        swatch = 0xFF9A9A9A,
    )
    val SILVER_100 = FilmStock(
        id = "silver100", name = "Silver 100",
        contrast = 1.12f, fade = 0.04f, monochrome = true, highlightRolloff = 0.06f,
        mixer = floatArrayOf(0.28f, 0.62f, 0.10f, 0.28f, 0.62f, 0.10f, 0.28f, 0.62f, 0.10f),
        shadowTint = Rgb(-0.004f, 0.0f, 0.008f), highlightTint = Rgb(0.02f, 0.012f, 0.0f),
        halationColor = Rgb(0.85f, 0.82f, 0.78f), colorGrain = 0f,
        swatch = 0xFFD8D2C4,
    )

    val ALL = listOf(
        GOLD_200, PORTRAIT_400, CINE_800T, GREEN_400, CHROME_100, K64,
        SUPER8_REVERSAL, INSTANT, EXPIRED, MONO_400, SILVER_100,
    )

    fun byId(id: String): FilmStock = ALL.firstOrNull { it.id == id } ?: GOLD_200
}

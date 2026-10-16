package app.filmcam.film

/**
 * Photographic styles for the Original camera, after the iPhone's: a style sets a palette and
 * a mood, and a pad fine-tunes it. Pad Y is Tone (down: deeper shadows and more contrast; up:
 * lifted, softer), pad X is Colour (left: muted towards black and white; right: richer). The
 * Palette slider is how much of the style's own character is applied (0 = Standard plus the
 * pad). The same numbers drive Android and iOS (shared/filmcam-spec.json).
 *
 * Undertone styles (Amber .. Cool) mostly shift white balance and skin undertones; mood styles
 * (Vibrant .. Stark B&W) change tone and saturation.
 */
enum class PhotoStyle(
    val label: String,
    /** White balance shift: + warm, - cool. */
    val warm: Float = 0f,
    /** + magenta / rose, - green / yellow. */
    val tint: Float = 0f,
    /** Saturation offset. */
    val sat: Float = 0f,
    /** Contrast offset. */
    val contrast: Float = 0f,
    /** Built-in tone: + lifted, - deep. */
    val tone: Float = 0f,
    /** Mid-tone brightness lift. */
    val bright: Float = 0f,
    /** Black lift. */
    val fade: Float = 0f,
    /** 1 = black and white. */
    val mono: Float = 0f,
    val shadowTint: Rgb = Rgb(0f, 0f, 0f),
    val highTint: Rgb = Rgb(0f, 0f, 0f),
    /** How strongly skin is pulled along with the undertone (1 = like everything else). */
    val skin: Float = 1f,
    /** Swatch for the tile and the pad. */
    val swatch: Long = 0xFF8FA3B8,
) {
    STANDARD("Standard"),
    AMBER("Amber", warm = 0.38f, tint = 0.06f, contrast = -0.04f, highTint = Rgb(0.03f, 0.012f, -0.03f), skin = 1.3f, swatch = 0xFFD99A4E),
    GOLD("Gold", warm = 0.3f, tint = -0.02f, bright = 0.05f, highTint = Rgb(0.03f, 0.026f, -0.04f), skin = 1.2f, swatch = 0xFFE2BE58),
    ROSE_GOLD("Rose Gold", warm = 0.16f, tint = 0.2f, highTint = Rgb(0.035f, 0f, 0.012f), skin = 1.3f, swatch = 0xFFE3A39A),
    NEUTRAL("Neutral", warm = -0.16f, tint = -0.02f, sat = -0.05f, skin = 1.2f, swatch = 0xFFB9B6AE),
    COOL_ROSE("Cool Rose", warm = -0.26f, tint = 0.13f, highTint = Rgb(0.01f, 0f, 0.025f), skin = 1.2f, swatch = 0xFFB3A2C4),
    COOL("Cool", warm = -0.36f, tint = -0.02f, shadowTint = Rgb(-0.01f, 0f, 0.02f), swatch = 0xFF7FA7D2),
    VIBRANT("Vibrant", warm = 0.03f, sat = 0.38f, contrast = 0.12f, skin = 0.6f, swatch = 0xFFE0566B),
    NATURAL("Natural", sat = -0.12f, contrast = -0.08f, tone = 0.1f, swatch = 0xFF9DB08C),
    LUMINOUS("Luminous", warm = 0.05f, sat = 0.12f, contrast = -0.06f, tone = 0.35f, bright = 0.12f, swatch = 0xFFF2D7A6),
    DRAMATIC("Dramatic", warm = -0.12f, sat = -0.12f, contrast = 0.18f, tone = -0.3f,
        shadowTint = Rgb(-0.012f, 0f, 0.02f), swatch = 0xFF3D5A73),
    QUIET("Quiet", warm = 0.08f, sat = -0.35f, contrast = -0.25f, tone = 0.2f, fade = 0.08f, swatch = 0xFFB8AFA2),
    COZY("Cozy", warm = 0.3f, tint = 0.03f, sat = 0.05f, contrast = 0.08f, tone = -0.25f,
        shadowTint = Rgb(0.02f, 0.005f, -0.015f), swatch = 0xFF9C5B3A),
    ETHEREAL("Ethereal", tint = 0.1f, sat = -0.25f, contrast = -0.3f, tone = 0.45f, fade = 0.06f,
        highTint = Rgb(0.02f, 0f, 0.02f), swatch = 0xFFE7D3E3),
    MUTED_BW("Muted B&W", contrast = -0.2f, fade = 0.05f, mono = 1f, swatch = 0xFF9A9A9A),
    STARK_BW("Stark B&W", contrast = 0.4f, tone = -0.3f, mono = 1f, swatch = 0xFF2A2A2A);
}

/** A style plus where the pad and the palette slider are. */
data class StyleSetting(
    val style: PhotoStyle = PhotoStyle.STANDARD,
    /** -1 deep .. +1 lifted. */
    val tone: Float = 0f,
    /** -1 muted .. +1 rich. */
    val color: Float = 0f,
    /** 0..1: how much of the style's character. */
    val palette: Float = 1f,
) {
    /** Exactly the camera's picture. */
    val isIdentity get() = (style == PhotoStyle.STANDARD || palette == 0f) && tone == 0f && color == 0f
}

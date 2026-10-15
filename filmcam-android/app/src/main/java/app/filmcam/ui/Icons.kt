package app.filmcam.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

/**
 * One family of line icons: 24px grid, 1.6px stroke, round caps and joins. Drawn here so
 * the app needs no icon library and every glyph has the same weight.
 */
object Ico {
    private fun icon(name: String, vararg strokes: String, fills: List<String> = emptyList()): ImageVector =
        ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f).apply {
            for (d in strokes) addPath(
                addPathNodes(d), stroke = SolidColor(Color.Black), strokeLineWidth = 1.6f,
                strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round,
            )
            for (d in fills) addPath(addPathNodes(d), fill = SolidColor(Color.Black))
        }.build()

    private fun c(cx: Float, cy: Float, r: Float) = "M${cx - r} ${cy}a$r $r 0 1 0 ${2 * r} 0a$r $r 0 1 0 ${-2 * r} 0"
    private fun dots(vararg p: Pair<Float, Float>, r: Float = 0.9f) = p.map { c(it.first, it.second, r) }

    // ---- camera
    val Flash = icon("flash", "M13 2.5L4.5 13.5H11L10 21.5l8.5-11H12z")
    val FlashOff = icon("flashOff", "M13 2.5l-3.2 4.1 M7.3 9.9L4.5 13.5H11L10 21.5l4.1-5.3 M16.3 12.5l2.2-2H12.6", "M3 3l18 18")
    val Flip = icon("flip", "M4 10a8 8 0 0 1 13.7-4.3L20 8", "M20 3.5V8h-4.5", "M20 14a8 8 0 0 1-13.7 4.3L4 16", "M4 20.5V16h4.5")
    val Tune = icon("tune", "M4 7h10", "M18 7h2", "M4 17h2", "M10 17h10", c(16f, 7f, 2f), c(8f, 17f, 2f))
    val Close = icon("close", "M6 6l12 12", "M18 6L6 18")
    val Check = icon("check", "M5 12.5l4.5 4.5L19 7")
    val Plus = icon("plus", "M12 5v14", "M5 12h14")
    val Trash = icon("trash", "M4 7h16", "M9 7V4.5h6V7", "M6 7l1 13h10l1-13", "M10 11v5", "M14 11v5")
    val Reset = icon("reset", "M4 12a8 8 0 1 0 2.3-5.6", "M4 4.5V9h4.5")
    val Sun = icon("sun", c(12f, 12f, 4f), "M12 2.5v2", "M12 19.5v2", "M4.9 4.9l1.4 1.4", "M17.7 17.7l1.4 1.4", "M2.5 12h2", "M19.5 12h2", "M4.9 19.1l1.4-1.4", "M17.7 6.3l1.4-1.4")
    val Moon = icon("moon", "M19.5 14.5A8 8 0 1 1 9.5 4.5a6.5 6.5 0 0 0 10 10z")
    val Auto = icon("auto", c(12f, 12f, 8f), fills = listOf("M12 4a8 8 0 0 0 0 16z"))
    val Chevron = icon("chevron", "M6 9l6 6 6-6")

    // ---- docks
    val Film = icon("film", "M4.5 4h15v16h-15z", "M8.5 4v16", "M15.5 4v16", "M4.5 8h4", "M4.5 12h4", "M4.5 16h4", "M15.5 8h4", "M15.5 12h4", "M15.5 16h4")
    val Adjust = icon("adjust", "M6 4v4", "M6 12v8", "M12 4v10", "M12 18v2", "M18 4v2", "M18 10v10", c(6f, 10f, 2f), c(12f, 16f, 2f), c(18f, 8f, 2f))
    val Frame = icon("frame", "M5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4z", "M8 8h8v6.5H8z")
    val Text = icon("text", "M5 7V5h14v2", "M12 5v14", "M9.5 19h5")

    // ---- adjustments
    val Exposure = icon("exposure", c(12f, 12f, 8.5f), "M8 10h4", "M10 8v4", "M12.5 15h4")
    val Shutter = icon("shutter", c(12f, 12f, 8.5f), "M12 3.5L14.5 9", "M20.4 11L14.6 12.6", "M16.3 19.4L12.4 15", "M6 18l4.6-3.3", "M4.4 8.5l5.8 1.9")
    val Halation = icon("halation", c(12f, 12f, 3.2f), c(12f, 12f, 7.5f), fills = listOf(c(12f, 12f, 1.6f)))
    val Size = icon("size", c(12f, 12f, 2.5f), c(12f, 12f, 6f), c(12f, 12f, 9.2f))
    val Bloom = icon("bloom", "M12 3v4", "M12 17v4", "M3 12h4", "M17 12h4", "M6.3 6.3l2.4 2.4", "M15.3 15.3l2.4 2.4", "M6.3 17.7l2.4-2.4", "M15.3 8.7l2.4-2.4")
    val Streak = icon("streak", "M2.5 12h19", c(12f, 12f, 2.6f))
    val Leak = icon("leak", "M4 20C7.5 12.5 12 8 20 4.5", "M4 13.5c2.2-3 5-5.6 8.5-7.5", "M10 20.5c2.5-4.5 6-8 10.5-10")
    val Prism = icon("prism", "M12 4.5l7.5 14h-15z", "M2.5 12.5h5.5", "M15.5 11.5l6-2.5", "M15.8 13.5l6 2")
    val Diffusion = icon("diffusion", "M7 18.5h10a4 4 0 0 0 .6-8A6 6 0 0 0 6.2 10a4.3 4.3 0 0 0 .8 8.5z")
    val FlashLook = icon("flashlook", "M12 3.5v3", "M12 17.5v3", "M3.5 12h3", "M17.5 12h3", c(12f, 12f, 4.5f), fills = listOf(c(12f, 12f, 2f)))
    val Grain = icon("grain", fills = dots(7f to 6.5f, 12f to 5.5f, 17f to 7f, 5.5f to 11.5f, 10.5f to 10.5f, 15.5f to 12f, 19f to 11f, 8f to 16f, 13f to 15.5f, 17.5f to 17.5f, 6f to 19.5f, 11.5f to 19.5f))
    val GrainSize = icon("grainsize", fills = dots(7f to 7f, 16.5f to 7.5f, 11.5f to 12.5f, 6.5f to 17.5f, 17f to 17f, r = 1.9f))
    val Fade = icon("fade", c(12f, 12f, 8.5f), fills = listOf("M12 3.5a8.5 8.5 0 0 1 0 17z"))
    val Warmth = icon("warmth", "M10 14.5V5.5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z", "M12 9v8.5")
    val Vignette = icon("vignette", "M4 4h16v16H4z", c(12f, 12f, 5.5f))
    val Aberration = icon("aberration", c(10f, 12f, 5.5f), c(14f, 12f, 5.5f))
    val Softness = icon("softness", "M12 3.5c3 4 6.5 7.5 6.5 10.5a6.5 6.5 0 0 1-13 0c0-3 3.5-6.5 6.5-10.5z")
    val Corners = icon("corners", "M4 9V4h5", "M15 4h5v5", "M20 15v5h-5", "M9 20H4v-5", c(12f, 12f, 3f))
    val Fisheye = icon("fisheye", c(12f, 12f, 8.5f), "M12 3.5c-3.3 3.3-3.3 13.7 0 17", "M12 3.5c3.3 3.3 3.3 13.7 0 17", "M3.5 12h17")
    val Stereo = icon("stereo", "M3 10h18", "M5 10v3.5a3 3 0 0 0 6 0V10", "M13 10v3.5a3 3 0 0 0 6 0V10")
    val Blur = icon("blur", "M4 8h11", "M18 8h2", "M4 12h16", "M4 16h8", "M15 16h5")
    val Focus = icon("focus", "M4 9V4h5", "M15 4h5v5", "M20 15v5h-5", "M9 20H4v-5", fills = listOf(c(12f, 12f, 1.8f)))
    val Direction = icon("direction", "M4 12h16", "M16 8l4 4-4 4")
    val Weave = icon("weave", "M3 12c3-4.5 6 4.5 9 0s6 4.5 9 0")
    val Slip = icon("slip", "M12 3.5v17", "M8.5 7l3.5-3.5L15.5 7", "M8.5 17l3.5 3.5 3.5-3.5")
    val Flicker = icon("flicker", "M9 18h6", "M10 21h4", "M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.6 1 2.5h6c0-.9.2-1.7 1-2.5A6 6 0 0 0 12 3z")
    val ColorFlicker = icon("colorflicker", c(9f, 9.5f, 4.5f), c(15f, 9.5f, 4.5f), c(12f, 15f, 4.5f))
    val Dust = icon("dust", "M14 3.5l-2 17", fills = dots(6f to 7f, 18f to 6f, 7.5f to 14f, 17f to 13f, 5.5f to 19f, 18.5f to 19.5f, r = 1.1f))
    val FrameRate = icon("framerate", "M3.5 6h17v12h-17z", "M7.75 6v12", "M12 6v12", "M16.25 6v12")
    val Burn = icon("burn", "M12 3c1 3.5 5.5 5.5 5.5 10.5a5.5 5.5 0 0 1-11 0c0-2.7 1.6-4.4 2.7-5.5.5 2.2 1.5 3.3 2.8 3.3 0-3.3-1.1-5.3 0-8.3z")
    val Tape = icon("tape", "M3 6h18v12H3z", c(8f, 12f, 2f), c(16f, 12f, 2f), "M10 12h4", "M6.5 18l1.5-2.5h8l1.5 2.5")
    val Interlace = icon("interlace", "M4 6h16", "M4 9.5h16", "M4 13h16", "M4 16.5h16", "M4 20h10")
    val LowRes = icon("lowres", "M4 4h8v8H4z", "M12 12h8v8h-8z", "M12 4h8v8", "M4 12v8h8")
    val Stamp = icon("stamp", "M4 6h16v14H4z", "M8 3.5v4", "M16 3.5v4", "M4 10.5h16")

    // ---- text
    val AlignLeft = icon("alignL", "M4 6h16", "M4 10h10", "M4 14h16", "M4 18h10")
    val AlignCenter = icon("alignC", "M4 6h16", "M7 10h10", "M4 14h16", "M7 18h10")
    val AlignRight = icon("alignR", "M4 6h16", "M10 10h10", "M4 14h16", "M10 18h10")
    val Rotate = icon("rotate", "M20 12a8 8 0 1 1-2.3-5.6", "M20 4.5V9h-4.5")
    val Opacity = icon("opacity", c(12f, 12f, 8.5f), fills = listOf("M12 3.5a8.5 8.5 0 0 1 0 17z"))
    val Shadow = icon("shadow", "M5 5h10v10H5z", "M9 19h10V9")
    val Spacing = icon("spacing", "M4 5v14", "M20 5v14", "M8 12h8", "M10.5 9.5L8 12l2.5 2.5", "M13.5 9.5L16 12l-2.5 2.5")
    val TextSize = icon("textsize", "M4 19l5-14 5 14", "M5.8 14h6.4", "M17.5 9.5l2-2 2 2", "M19.5 7.5v9", "M17.5 14.5l2 2 2-2")
    val Fonts = icon("fonts", "M3.5 18.5l4.5-13 4.5 13", "M5 14.5h6", "M20 18.5v-5.8a2.7 2.7 0 1 0-2.7 2.7H20")
    val Import = icon("import", "M12 4v11", "M7.5 10.5L12 15l4.5-4.5", "M5 20h14")

    // ---- capture options and media
    val Timer = icon("timer", c(12f, 13.5f, 7.5f), "M12 9.5v4l2.5 2", "M9.5 2.5h5", "M18.5 6.5l1.5-1.5")
    val Burst = icon("burst", "M7 7.5h10a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 17 18.5H7A1.5 1.5 0 0 1 5.5 17V9A1.5 1.5 0 0 1 7 7.5z", "M8 5h8", "M10 2.8h4")
    val Ratio = icon("ratio", "M5.5 4.5h13a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z", "M8 8h3", "M8 8v3", "M16 16h-3", "M16 16v-3")
    val Log = icon("log", "M4 19.5h16", "M4 19.5V4.5", "M4 17C8 9 12 7 20 6")
    val Gallery = icon("gallery", "M4.5 4.5h6v6h-6z", "M13.5 4.5h6v6h-6z", "M4.5 13.5h6v6h-6z", "M13.5 13.5h6v6h-6z")
    val Share = icon("share", "M12 15V4", "M8 7.5L12 3.5l4 4", "M6.5 11.5H5v8h14v-8h-1.5")
    val Scissors = icon("scissors", c(6.5f, 6.5f, 2.5f), c(6.5f, 17.5f, 2.5f), "M8.6 8L19.5 18", "M8.6 16L19.5 6")
    val Wand = icon("wand", "M4 20L15 9", "M13.5 7.5l3 3", "M18 3.5v3", "M16.5 5h3", "M20 9.5v2", "M19 10.5h2", "M9.5 3.5v2", "M8.5 4.5h2")
    val Back = icon("back", "M15 5l-7 7 7 7")
    val Play = icon("play", fills = listOf("M8 5.5v13l10.5-6.5z"))
    val Pause = icon("pause", fills = listOf("M7 5h3.5v14H7z", "M13.5 5H17v14h-3.5z"))
}

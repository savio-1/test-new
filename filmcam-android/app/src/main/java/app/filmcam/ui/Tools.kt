package app.filmcam.ui

import androidx.compose.ui.graphics.vector.ImageVector
import app.filmcam.film.BlurMode
import app.filmcam.film.FilmFrameRate
import app.filmcam.film.FilmLook
import app.filmcam.film.ShutterSpeed
import kotlin.math.roundToInt

enum class ToolGroup(val label: String) { BASIC("Basic"), LIGHT("Light"), MOTION("Motion"), FILM("Film"), LENS("Lens"), RETRO("Retro") }

/**
 * One adjustment: an icon in the tool row and a ruler. Choices (shutter speed, blur type...)
 * are rulers that snap, with the option index as the value.
 */
class Tool(
    val id: String,
    val label: String,
    val icon: ImageVector,
    val group: ToolGroup,
    val min: Float = 0f,
    val max: Float = 1f,
    val options: List<String>? = null,
    val format: (Float) -> String = { "${(it * 100).roundToInt()}" },
    val visible: (FilmLook) -> Boolean = { true },
    val get: (FilmLook) -> Float,
    val set: (FilmLook, Float) -> FilmLook,
)

object Tools {
    private val onOff = listOf("Off", "On")
    private fun signed(v: Float) = "%+d".format((v * 100).roundToInt())

    fun all(evMin: Float, evMax: Float): List<Tool> = listOf(
        // Basic: the everyday corrections, on top of any look (or the Original camera)
        Tool("exposure", "Exposure", Ico.Exposure, ToolGroup.BASIC, evMin, evMax, format = { "%+.1f".format(it) },
            get = { it.exposureEv }, set = { l, v -> l.copy(exposureEv = (v * 10).roundToInt() / 10f) }),
        Tool("strength", "Strength", Ico.Film, ToolGroup.BASIC, visible = { it.stock.id != "neutral" },
            get = { it.intensity }, set = { l, v -> l.copy(intensity = v) }),
        Tool("warmth", "Temp", Ico.Warmth, ToolGroup.BASIC, -1f, 1f, format = ::signed,
            get = { it.warmth }, set = { l, v -> l.copy(warmth = v) }),
        Tool("tint", "Tint", Ico.Tint, ToolGroup.BASIC, -1f, 1f, format = ::signed,
            get = { it.tint }, set = { l, v -> l.copy(tint = v) }),
        Tool("contrast", "Contrast", Ico.Contrast, ToolGroup.BASIC, -1f, 1f, format = ::signed,
            get = { it.contrast }, set = { l, v -> l.copy(contrast = v) }),
        Tool("highlights", "Highlights", Ico.Highlights, ToolGroup.BASIC, -1f, 1f, format = ::signed,
            get = { it.highlights }, set = { l, v -> l.copy(highlights = v) }),
        Tool("shadows", "Shadows", Ico.Shadows, ToolGroup.BASIC, -1f, 1f, format = ::signed,
            get = { it.shadows }, set = { l, v -> l.copy(shadows = v) }),
        Tool("saturation", "Saturation", Ico.Saturation, ToolGroup.BASIC, -1f, 1f, format = ::signed,
            get = { it.saturation }, set = { l, v -> l.copy(saturation = v) }),
        Tool("vibrance", "Vibrance", Ico.Vibrance, ToolGroup.BASIC, -1f, 1f, format = ::signed,
            get = { it.vibrance }, set = { l, v -> l.copy(vibrance = v) }),
        Tool("clarity", "Clarity", Ico.Clarity, ToolGroup.BASIC, -1f, 1f, format = ::signed,
            get = { it.clarity }, set = { l, v -> l.copy(clarity = v) }),
        Tool("sharpness", "Sharpness", Ico.Sharpness, ToolGroup.BASIC,
            get = { it.sharpness }, set = { l, v -> l.copy(sharpness = v) }),
        Tool("fade", "Fade", Ico.Fade, ToolGroup.BASIC, get = { it.fade }, set = { l, v -> l.copy(fade = v) }),
        // Light
        Tool("shutter", "Shutter", Ico.Shutter, ToolGroup.LIGHT, 0f, ShutterSpeed.entries.lastIndex.toFloat(),
            options = ShutterSpeed.entries.map { it.label },
            get = { it.shutter.ordinal.toFloat() }, set = { l, v -> l.copy(shutter = ShutterSpeed.entries[v.roundToInt()]) }),
        Tool("halation", "Halation", Ico.Halation, ToolGroup.LIGHT, get = { it.halation }, set = { l, v -> l.copy(halation = v) }),
        Tool("halsize", "Halo size", Ico.Size, ToolGroup.LIGHT, get = { it.halationSize }, set = { l, v -> l.copy(halationSize = v) }),
        Tool("bloom", "Bloom", Ico.Bloom, ToolGroup.LIGHT, get = { it.bloom }, set = { l, v -> l.copy(bloom = v) }),
        Tool("diffusion", "Mist", Ico.Diffusion, ToolGroup.LIGHT, get = { it.diffusion }, set = { l, v -> l.copy(diffusion = v) }),
        Tool("streak", "Streaks", Ico.Streak, ToolGroup.LIGHT, get = { it.streak }, set = { l, v -> l.copy(streak = v) }),
        Tool("leak", "Leaks", Ico.Leak, ToolGroup.LIGHT, get = { it.lightLeak }, set = { l, v -> l.copy(lightLeak = v) }),
        Tool("prism", "Prism", Ico.Prism, ToolGroup.LIGHT, get = { it.prism }, set = { l, v -> l.copy(prism = v) }),
        Tool("flash", "Flash", Ico.FlashLook, ToolGroup.LIGHT, get = { it.flash }, set = { l, v -> l.copy(flash = v) }),
        // Film
        Tool("grain", "Grain", Ico.Grain, ToolGroup.FILM, get = { it.grain }, set = { l, v -> l.copy(grain = v) }),
        Tool("grainsize", "Grain size", Ico.GrainSize, ToolGroup.FILM, 0.6f, 3f, format = { "%.1f".format(it) },
            get = { it.grainSize }, set = { l, v -> l.copy(grainSize = v) }),
        Tool("vignette", "Vignette", Ico.Vignette, ToolGroup.FILM, get = { it.vignette }, set = { l, v -> l.copy(vignette = v) }),
        Tool("dust", "Dust", Ico.Dust, ToolGroup.FILM, get = { it.dust }, set = { l, v -> l.copy(dust = v) }),
        Tool("burn", "Roll burn", Ico.Burn, ToolGroup.FILM, 0f, 1f, options = onOff,
            get = { if (it.rollBurn) 1f else 0f }, set = { l, v -> l.copy(rollBurn = v >= 0.5f) }),
        // Lens
        Tool("softness", "Softness", Ico.Softness, ToolGroup.LENS, -1f, 1f, format = ::signed,
            get = { it.softness }, set = { l, v -> l.copy(softness = v) }),
        Tool("aberration", "Fringing", Ico.Aberration, ToolGroup.LENS, get = { it.aberration }, set = { l, v -> l.copy(aberration = v) }),
        Tool("corners", "Toy lens", Ico.Corners, ToolGroup.LENS, get = { it.cornerBlur }, set = { l, v -> l.copy(cornerBlur = v) }),
        Tool("fisheye", "Fisheye", Ico.Fisheye, ToolGroup.LENS, get = { it.distortion }, set = { l, v -> l.copy(distortion = v) }),
        Tool("circle", "Circle", Ico.Focus, ToolGroup.LENS, 0f, 1f, options = onOff,
            get = { if (it.circleMask) 1f else 0f }, set = { l, v -> l.copy(circleMask = v >= 0.5f) }),
        Tool("stereo", "3D", Ico.Stereo, ToolGroup.LENS, get = { it.anaglyph }, set = { l, v -> l.copy(anaglyph = v) }),
        // Motion
        Tool("blurmode", "Blur", Ico.Blur, ToolGroup.MOTION, 0f, BlurMode.entries.lastIndex.toFloat(),
            options = BlurMode.entries.map { it.label },
            get = { it.blurMode.ordinal.toFloat() }, set = { l, v ->
                val mode = BlurMode.entries[v.roundToInt()]
                // Turning a blur on starts gentle: a quarter strength with a wide sharp centre.
                if (l.blurMode == BlurMode.NONE && mode != BlurMode.NONE) l.copy(blurMode = mode, blur = 0.25f, blurFocus = 0.75f)
                else l.copy(blurMode = mode)
            }),
        Tool("blur", "Amount", Ico.Halation, ToolGroup.MOTION, visible = { it.blurMode != BlurMode.NONE },
            get = { it.blur }, set = { l, v -> l.copy(blur = v) }),
        Tool("blurfocus", "Sharp centre", Ico.Focus, ToolGroup.MOTION, visible = { it.blurMode != BlurMode.NONE },
            get = { it.blurFocus }, set = { l, v -> l.copy(blurFocus = v) }),
        Tool("blurangle", "Direction", Ico.Direction, ToolGroup.MOTION, 0f, 180f, format = { "${it.roundToInt()}°" },
            visible = { it.blurMode == BlurMode.MOTION }, get = { it.blurAngle }, set = { l, v -> l.copy(blurAngle = v) }),
        Tool("fps", "Frame rate", Ico.FrameRate, ToolGroup.MOTION, 0f, FilmFrameRate.entries.lastIndex.toFloat(),
            options = FilmFrameRate.entries.map { if (it == FilmFrameRate.NATIVE) "Native" else it.label },
            get = { it.frameRate.ordinal.toFloat() }, set = { l, v -> l.copy(frameRate = FilmFrameRate.entries[v.roundToInt()]) }),
        Tool("weave", "Weave", Ico.Weave, ToolGroup.MOTION, get = { it.gateWeave }, set = { l, v -> l.copy(gateWeave = v) }),
        Tool("slip", "Slips", Ico.Slip, ToolGroup.MOTION, get = { it.frameSlip }, set = { l, v -> l.copy(frameSlip = v) }),
        Tool("flicker", "Flicker", Ico.Flicker, ToolGroup.MOTION, get = { it.flicker }, set = { l, v -> l.copy(flicker = v) }),
        Tool("cflicker", "Colour pump", Ico.ColorFlicker, ToolGroup.MOTION, get = { it.colorFlicker }, set = { l, v -> l.copy(colorFlicker = v) }),
        // Retro
        Tool("vhs", "Tape", Ico.Tape, ToolGroup.RETRO, get = { it.vhs }, set = { l, v -> l.copy(vhs = v) }),
        Tool("interlace", "Interlace", Ico.Interlace, ToolGroup.RETRO, get = { it.interlace }, set = { l, v -> l.copy(interlace = v) }),
        Tool("lowres", "Low res", Ico.LowRes, ToolGroup.RETRO, get = { it.lowRes }, set = { l, v -> l.copy(lowRes = v) }),
    )
}

package app.filmcam.film

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import android.util.Log
import androidx.core.graphics.createBitmap
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

enum class TextAlign { LEFT, CENTER, RIGHT }

/**
 * A finish on the letters that helps them read over a busy picture. [amount] (0..1 on the
 * layer) sets how strong it is; the colour is the layer's fxColor, or the effect's own.
 */
enum class TextFx(val label: String) {
    NONE("None"),
    /** A soft shadow just under the letters. */
    SHADOW("Soft shadow"),
    /** A hard copy of the letters, offset down and right. */
    DROP("Drop shadow"),
    /** A blurred halo in the text's colour (or the chosen one). */
    GLOW("Glow"),
    /** Soft focus: the letters bloom into a blur of themselves. */
    BLUR("Soft blur"),
    /** A clean stroke around each letter. */
    OUTLINE("Outline"),
    /** A dark, diffuse cloud behind the words, like a soft vignette under them. */
    HAZE("Haze"),
}

/**
 * A line (or lines) of text burnt into the picture. Position and size are relative to the
 * upright frame, so the layer looks the same at any resolution and survives rotation.
 */
data class TextLayer(
    val id: Long = System.nanoTime(),
    val text: String = "Summer '26",
    val font: String = FontLibrary.DEFAULT,
    /** Text size as a fraction of the frame's short side. */
    val size: Float = 0.07f,
    /** Centre of the text block in the frame, 0..1, y down. */
    val x: Float = 0.5f,
    val y: Float = 0.5f,
    /** Clockwise, in degrees. */
    val rotation: Float = 0f,
    val align: TextAlign = TextAlign.CENTER,
    val color: Int = Color.WHITE,
    val opacity: Float = 1f,
    val shadow: Boolean = false,
    /** Extra letter spacing in ems. */
    val tracking: Float = 0f,
    /** Set behind the subject (people, or whatever was picked): it passes in front of the text. */
    val behind: Boolean = false,
    /** Longest line as a fraction of the frame width; longer text wraps (0: only at line breaks). */
    val wrap: Float = 0f,
    /** A box behind the text, as subtitles have, in [boxColor] (its alpha is the box's opacity). */
    val box: Boolean = false,
    val boxColor: Int = DEFAULT_BOX,
    /** An outline around the letters in this colour; 0 for none. */
    val outline: Int = 0,
    /** Space between lines, as a multiple of the font's own. */
    val lineSpacing: Float = 1f,
    /** How the text moves in video (and the viewfinder); stills show it at rest. */
    val anim: TextAnim = TextAnim.NONE,
    /**
     * How much of the text shows, left to right, 0..1: letters fade in one after another
     * (kinetic captions). Not saved: it is a moment of an animation.
     */
    val reveal: Float = 1f,
    /** Soft focus on the letters, as a fraction of the text size (kinetic captions). Not saved. */
    val blur: Float = 0f,
    /** A finish on the letters, how strong (0..1), and its colour (0: the effect's own). */
    val fx: TextFx = TextFx.NONE,
    val fxAmount: Float = 0.5f,
    val fxColor: Int = 0,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("id", id).put("text", text).put("font", font).put("size", size.toDouble())
        .put("x", x.toDouble()).put("y", y.toDouble()).put("rotation", rotation.toDouble())
        .put("align", align.name).put("color", color).put("opacity", opacity.toDouble())
        .put("shadow", shadow).put("tracking", tracking.toDouble()).put("behind", behind).put("wrap", wrap.toDouble()).put("box", box)
        .put("boxColor", boxColor).put("outline", outline)
        .put("lineSpacing", lineSpacing.toDouble()).put("anim", anim.name)
        .put("fx", fx.name).put("fxAmount", fxAmount.toDouble()).put("fxColor", fxColor)

    companion object {
        fun fromJson(o: JSONObject) = TextLayer(
            id = o.optLong("id", System.nanoTime()),
            text = o.optString("text", ""),
            font = o.optString("font", FontLibrary.DEFAULT),
            size = o.optDouble("size", 0.07).toFloat(),
            x = o.optDouble("x", 0.5).toFloat(),
            y = o.optDouble("y", 0.8).toFloat(),
            rotation = o.optDouble("rotation", 0.0).toFloat(),
            align = runCatching { TextAlign.valueOf(o.optString("align")) }.getOrDefault(TextAlign.CENTER),
            color = o.optInt("color", Color.WHITE),
            opacity = o.optDouble("opacity", 1.0).toFloat(),
            shadow = o.optBoolean("shadow", false),
            tracking = o.optDouble("tracking", 0.0).toFloat(),
            behind = o.optBoolean("behind", false),
            wrap = o.optDouble("wrap", 0.0).toFloat(),
            box = o.optBoolean("box", false),
            boxColor = o.optInt("boxColor", DEFAULT_BOX),
            outline = o.optInt("outline", 0),
            lineSpacing = o.optDouble("lineSpacing", 1.0).toFloat(),
            anim = runCatching { TextAnim.valueOf(o.optString("anim")) }.getOrDefault(TextAnim.NONE),
            fx = runCatching { TextFx.valueOf(o.optString("fx")) }.getOrDefault(TextFx.NONE),
            fxAmount = o.optDouble("fxAmount", 0.5).toFloat(),
            fxColor = o.optInt("fxColor", 0),
        )

        /** Black at 60%: the classic subtitle box. */
        const val DEFAULT_BOX = 0x99000000.toInt()

        fun listToJson(layers: List<TextLayer>): String = JSONArray().apply { layers.forEach { put(it.toJson()) } }.toString()

        fun listFromJson(s: String?): List<TextLayer> = runCatching {
            val a = JSONArray(s ?: return emptyList())
            List(a.length()) { fromJson(a.getJSONObject(it)) }
        }.getOrDefault(emptyList())
    }
}

/**
 * Text animations. The stop-motion ones hold each pose for a few frames (12 or 8 a second),
 * as if moved by hand between shots; the others move smoothly. [fps] is how often the pose
 * changes, so the overlay is only redrawn that often.
 */
enum class TextAnim(val label: String, val fps: Int) {
    NONE("None", 0),
    WIGGLE("Wiggle", 12),
    JIGGLE("Jiggle", 12),
    STOP_MOTION("Stop-motion", 8),
    FLOAT("Float", 30),
    SWING("Swing", 30),
    BOUNCE("Bounce", 30),
    PULSE("Pulse", 30),
    SPIN("Spin", 30),
    FLICKER("Flicker", 12),
    TYPEWRITER("Typewriter", 12);

    /**
     * Where the text is at [t] seconds: an offset (in text heights), extra rotation (degrees),
     * scale, opacity and how many characters show. [seed] keeps two layers out of step.
     * A negative [t] is the rest pose (stills).
     */
    fun pose(t: Float, seed: Long, length: Int): TextPose {
        if (this == NONE || t < 0f) return TextPose.REST
        val twoPi = (2 * Math.PI).toFloat()
        fun rnd(k: Long, salt: Int): Float {
            // A small hash: the same frame always gets the same pose, so playback is stable.
            var h = (k * 0x9E3779B97F4A7C15uL.toLong()) xor (seed * 0xBF58476D1CE4E5B9uL.toLong()) xor salt.toLong()
            h = (h xor (h ushr 31)) * 0x94D049BB133111EBuL.toLong()
            h = h xor (h ushr 29)
            return ((h ushr 11).toDouble() / (1L shl 53).toDouble()).toFloat() * 2f - 1f
        }
        val k = (t * fps).toLong()
        return when (this) {
            WIGGLE -> TextPose(rnd(k, 1) * 0.04f, rnd(k, 2) * 0.04f, rnd(k, 3) * 4f)
            JIGGLE -> TextPose(rnd(k, 1) * 0.05f, rnd(k, 2) * 0.05f, rnd(k, 3) * 1.5f, 1f + rnd(k, 4) * 0.06f)
            STOP_MOTION -> TextPose(rnd(k, 1) * 0.025f, rnd(k, 2) * 0.025f, rnd(k, 3) * 2f, 1f + rnd(k, 4) * 0.02f)
            FLOAT -> TextPose(0f, 0.18f * kotlin.math.sin(twoPi * t / 2.6f), 1.5f * kotlin.math.sin(twoPi * t / 3.9f))
            SWING -> TextPose(0f, 0f, 9f * kotlin.math.sin(twoPi * t / 2.2f))
            BOUNCE -> TextPose(0f, -0.35f * kotlin.math.abs(kotlin.math.sin(Math.PI.toFloat() * t / 0.9f)))
            PULSE -> TextPose(scale = 1f + 0.07f * kotlin.math.sin(twoPi * t / 1.4f))
            SPIN -> TextPose(rotation = (t / 4f % 1f) * 360f)
            FLICKER -> TextPose(alpha = if (rnd(k, 5) > 0.82f) 0.25f else 0.75f + 0.25f * rnd(k, 6))
            TYPEWRITER -> {
                val step = 0.09f
                val cycle = length * step + 1.6f
                TextPose(chars = ((t % cycle) / step).toInt().coerceAtMost(length))
            }
            NONE -> TextPose.REST
        }
    }
}

/** One moment of a text animation (see [TextAnim.pose]). */
data class TextPose(
    val dx: Float = 0f, val dy: Float = 0f, val rotation: Float = 0f, val scale: Float = 1f,
    val alpha: Float = 1f, val chars: Int = Int.MAX_VALUE,
) {
    companion object { val REST = TextPose() }
}

/** A typeface the user can pick, and which scripts it has its own letters for. */
class FontEntry(val key: String, val label: String, val typeface: Typeface, val latin: Boolean = true, val telugu: Boolean = false)

/**
 * Fonts for text overlays: a few system faces, a curated set bundled with the app (SIL Open
 * Font Licence, see assets/fonts/licenses) and any .ttf/.otf the user imports.
 */
class FontLibrary(private val context: Context) {
    private val dir = File(context.filesDir, "fonts").apply { mkdirs() }

    var fonts: List<FontEntry> = load()
        private set

    private fun load(): List<FontEntry> {
        val out = ArrayList<FontEntry>()
        out += FontEntry("sys:sans", "Sans", Typeface.create("sans-serif", Typeface.NORMAL))
        out += FontEntry("sys:sans-bold", "Sans Bold", Typeface.create("sans-serif", Typeface.BOLD))
        out += FontEntry("sys:serif", "Serif", Typeface.SERIF)
        for ((file, label) in BUNDLED) {
            runCatching { Typeface.createFromAsset(context.assets, "fonts/$file") }
                .onSuccess { out += FontEntry("asset:$file", label, it, latin = file !in TELUGU_ONLY, telugu = file in TELUGU) }
        }
        // Variable fonts at a chosen weight: "file#weight".
        for ((spec, label) in WEIGHTED) {
            val (file, weight) = spec.split('#')
            runCatching {
                Typeface.Builder(context.assets, "fonts/$file").setFontVariationSettings("'wght' $weight").build()
            }.onSuccess { out += FontEntry("asset:$spec", label, it, latin = file !in TELUGU_ONLY, telugu = file in TELUGU) }
        }
        // Imported fonts: their scripts aren't known, so they are offered for both.
        dir.listFiles()?.sortedBy { it.name }?.forEach { f ->
            runCatching { Typeface.createFromFile(f) }.onSuccess {
                out += FontEntry("file:${f.name}", f.nameWithoutExtension.take(18), it, latin = true, telugu = true)
            }
        }
        return out
    }

    fun typeface(key: String): Typeface = fonts.firstOrNull { it.key == key }?.typeface ?: fonts.first().typeface

    fun label(key: String): String = fonts.firstOrNull { it.key == key }?.label ?: "Sans"

    /** Copies a font the user picked into app storage. Returns its key, or null if unreadable. */
    fun import(uri: Uri): String? = try {
        val name = (uri.lastPathSegment ?: "font").substringAfterLast('/').substringAfterLast(':')
            .replace(Regex("[^A-Za-z0-9._ -]"), "_").let { if (it.contains('.')) it else "$it.ttf" }
        val target = File(dir, name)
        context.contentResolver.openInputStream(uri)?.use { input -> target.outputStream().use { input.copyTo(it) } }
        val tf = Typeface.createFromFile(target)
        if (tf == Typeface.DEFAULT) { target.delete(); null } else {
            fonts = load()
            "file:${target.name}"
        }
    } catch (e: Exception) {
        Log.w("FontLibrary", "import", e)
        null
    }

    companion object {
        const val DEFAULT = "asset:InstrumentSerif.ttf"
        val BUNDLED = listOf(
            "InstrumentSerif.ttf" to "Instrument",
            "InstrumentSerif-Italic.ttf" to "Instrument Italic",
            "Inter.ttf" to "Inter",
            "InterBold.ttf" to "Inter Bold",
            "DMSerifDisplay.ttf" to "DM Serif",
            "PlayfairDisplay.ttf" to "Playfair",
            "BebasNeue.ttf" to "Bebas",
            "SpaceMono.ttf" to "Space Mono",
            "CourierPrime.ttf" to "Typewriter",
            "VT323.ttf" to "VHS",
            "Caveat.ttf" to "Handwritten",
            "Poppins-SemiBold.ttf" to "Poppins",
            "Poppins-Bold.ttf" to "Poppins Bold",
            "Anton-Regular.ttf" to "Anton",
            "ArchivoBlack-Regular.ttf" to "Archivo Black",
            "Bangers-Regular.ttf" to "Bangers",
            "Righteous-Regular.ttf" to "Righteous",
            "Lobster-Regular.ttf" to "Lobster",
            "Pacifico-Regular.ttf" to "Pacifico",
            // Telugu
            "NotoSansTelugu.ttf" to "తెలుగు Sans",
            "Ramabhadra.ttf" to "రామభద్ర",
            "Mandali.ttf" to "మండలి",
            "Gurajada.ttf" to "గురజాడ",
            "TenaliRamakrishna.ttf" to "తెనాలి",
            "HindGuntur-SemiBold.ttf" to "హింద్ గుంటూరు",
            "HindGuntur-Bold.ttf" to "హింద్ గుంటూరు Bold",
            "NTR-Regular.ttf" to "ఎన్టీఆర్",
            "Suravaram-Regular.ttf" to "సురవరం",
            "Ponnala-Regular.ttf" to "పొన్నాల",
            "Mallanna-Regular.ttf" to "మల్లన్న",
            "Gidugu-Regular.ttf" to "గిడుగు",
            "Dhurjati-Regular.ttf" to "ధూర్జటి",
            "Timmana-Regular.ttf" to "తిమ్మన",
            "SreeKrushnadevaraya-Regular.ttf" to "శ్రీకృష్ణదేవరాయ",
            "Peddana-Regular.ttf" to "పెద్దన",
            "LakkiReddy-Regular.ttf" to "లక్కిరెడ్డి",
        )
        val WEIGHTED = listOf(
            "InterTight.ttf#500" to "Inter Tight",
            "InterTight.ttf#700" to "Inter Tight Bold",
            "InterTight.ttf#800" to "Inter Tight Heavy",
            "InterTight-Italic.ttf#700" to "Inter Tight Italic",
            "NotoSansTelugu.ttf#700" to "తెలుగు Bold",
            "Montserrat.ttf#600" to "Montserrat",
            "Montserrat.ttf#800" to "Montserrat Heavy",
            "Oswald.ttf#600" to "Oswald",
            "Nunito.ttf#800" to "Nunito",
            "Rubik.ttf#700" to "Rubik",
            "Lora.ttf#600" to "Lora",
            "AnekTelugu.ttf#600" to "అనేక్",
            "AnekTelugu.ttf#800" to "అనేక్ Heavy",
            "BalooTammudu2.ttf#700" to "బాలూ తమ్ముడు",
            "NotoSerifTelugu.ttf#700" to "తెలుగు Serif",
        )
        /** Fonts with Telugu letters, and those with none of their own Latin ones. */
        val TELUGU = setOf(
            "NotoSansTelugu.ttf", "Ramabhadra.ttf", "Mandali.ttf", "Gurajada.ttf", "TenaliRamakrishna.ttf",
            "HindGuntur-SemiBold.ttf", "HindGuntur-Bold.ttf", "NTR-Regular.ttf", "Suravaram-Regular.ttf",
            "Ponnala-Regular.ttf", "Mallanna-Regular.ttf", "Gidugu-Regular.ttf", "Dhurjati-Regular.ttf",
            "Timmana-Regular.ttf", "SreeKrushnadevaraya-Regular.ttf", "Peddana-Regular.ttf", "LakkiReddy-Regular.ttf",
            "AnekTelugu.ttf", "BalooTammudu2.ttf", "NotoSerifTelugu.ttf",
        )
        val TELUGU_ONLY = setOf("Ponnala-Regular.ttf")
        /** Subtitle defaults: a bold sans for Latin, a bold Telugu face. */
        const val SUBTITLE_LATIN = "asset:InterBold.ttf"
        const val SUBTITLE_TELUGU = "asset:NotoSansTelugu.ttf#700"
        /** Kinetic captions: Inter Tight for the words, an italic serif for the odd accent. */
        const val CAPTION_SANS = "asset:InterTight.ttf#700"
        const val CAPTION_SANS_ITALIC = "asset:InterTight-Italic.ttf#700"
        const val CAPTION_SERIF = "asset:InstrumentSerif-Italic.ttf"
    }
}

/** Lays out and draws text layers. Shared by the renderer and the on-screen editor. */
object TextRenderer {
    private fun paint(layer: TextLayer, fonts: FontLibrary, shortSide: Float) = TextPaint(TextPaint.ANTI_ALIAS_FLAG).apply {
        typeface = fonts.typeface(layer.font)
        textSize = max(1f, layer.size * shortSide)
        color = layer.color
        alpha = (layer.opacity.coerceIn(0f, 1f) * 255).toInt()
        letterSpacing = layer.tracking
        if (layer.shadow) setShadowLayer(textSize * 0.09f, 0f, textSize * 0.035f, Color.argb((150 * layer.opacity).toInt(), 0, 0, 0))
    }

    private fun layout(layer: TextLayer, p: TextPaint, frameW: Float, fixedWidth: Int = 0): StaticLayout {
        val text = layer.text.ifEmpty { " " }
        val desired = ceil(text.lines().maxOf { StaticLayout.getDesiredWidth(it, p) }).toInt().coerceAtLeast(1) + 2
        val width = when {
            fixedWidth > 0 -> fixedWidth
            layer.wrap > 0f -> min(desired, max(1, (layer.wrap * frameW).toInt()))
            else -> desired
        }
        val align = when (layer.align) {
            TextAlign.LEFT -> Layout.Alignment.ALIGN_NORMAL
            TextAlign.CENTER -> Layout.Alignment.ALIGN_CENTER
            TextAlign.RIGHT -> Layout.Alignment.ALIGN_OPPOSITE
        }
        return StaticLayout.Builder.obtain(text, 0, text.length, p, width).setAlignment(align).setIncludePad(false)
            .setLineSpacing(0f, layer.lineSpacing.coerceIn(0.5f, 3f))
            .setBreakStrategy(android.graphics.text.LineBreaker.BREAK_STRATEGY_BALANCED).build()
    }

    /** Padding of the subtitle box around the text, in pixels. */
    private fun boxPad(p: TextPaint) = p.textSize * 0.35f to p.textSize * 0.16f

    /** Size in pixels of a layer's text block in a [w]x[h] frame (box included). */
    fun blockSize(layer: TextLayer, fonts: FontLibrary, w: Float, h: Float): Pair<Float, Float> {
        val p = paint(layer, fonts, min(w, h))
        val l = layout(layer, p, w)
        if (!layer.box) return l.width.toFloat() to l.height.toFloat()
        val (px, py) = boxPad(p)
        return l.width + 2 * px to l.height + 2 * py
    }

    /**
     * Draws all layers onto [canvas] covering a [w]x[h] frame, each posed for [t] seconds into
     * its animation (negative: at rest, as in stills).
     */
    fun draw(canvas: Canvas, layers: List<TextLayer>, fonts: FontLibrary, w: Float, h: Float, t: Float = -1f) {
        for (layer in layers) {
            if (layer.text.isBlank()) continue
            if (layer.reveal <= 0f || layer.opacity <= 0f) continue
            val pose = layer.anim.pose(t, layer.id, layer.text.length)
            val p = paint(layer, fonts, min(w, h))
            if (pose.alpha < 1f) p.alpha = (p.alpha * pose.alpha).toInt()
            if (layer.blur > 0.002f) p.maskFilter = android.graphics.BlurMaskFilter(layer.blur * p.textSize, android.graphics.BlurMaskFilter.Blur.NORMAL)
            val full = layout(layer, p, w)
            // Typewriter: the letters so far, laid out in the same block as the whole text.
            val l = if (pose.chars < layer.text.length) layout(layer.copy(text = layer.text.take(pose.chars)), p, w, full.width) else full
            canvas.save()
            canvas.translate(layer.x * w + pose.dx * p.textSize, layer.y * h + pose.dy * p.textSize)
            canvas.rotate(layer.rotation + pose.rotation)
            if (pose.scale != 1f) canvas.scale(pose.scale, pose.scale)
            canvas.translate(-full.width / 2f, -full.height / 2f)
            // Letter by letter: draw the block into a layer, then fade it out to the right of
            // the reveal edge (so shadows and outlines go with their letters).
            val revealing = layer.reveal < 1f
            if (revealing) {
                val pad = p.textSize * 2f
                canvas.saveLayer(-pad, -pad, full.width + pad, full.height + pad, null)
            }
            underFx(canvas, layer, l, p)
            if (layer.box) {
                val (px, py) = boxPad(p)
                // The box hugs the lines actually used, not the full wrap width.
                var left = Float.MAX_VALUE
                var right = 0f
                for (i in 0 until l.lineCount) { left = min(left, l.getLineLeft(i)); right = max(right, l.getLineRight(i)) }
                val bg = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
                    color = layer.boxColor
                    alpha = (Color.alpha(layer.boxColor) * layer.opacity.coerceIn(0f, 1f)).toInt()
                }
                canvas.drawRoundRect(left - px, -py, right + px, l.height + py, p.textSize * 0.22f, p.textSize * 0.22f, bg)
            }
            if (layer.outline != 0) {
                // The stroke first, then the letters over it: a clean edge on both sides.
                val fill = p.color
                val fillAlpha = p.alpha
                p.style = android.graphics.Paint.Style.STROKE
                p.strokeJoin = android.graphics.Paint.Join.ROUND
                p.strokeWidth = p.textSize * 0.14f
                p.color = layer.outline
                p.alpha = (Color.alpha(layer.outline) * layer.opacity.coerceIn(0f, 1f)).toInt()
                l.draw(canvas)
                p.style = android.graphics.Paint.Style.FILL
                p.color = fill
                p.alpha = fillAlpha
            }
            l.draw(canvas)
            if (layer.fx == TextFx.SHADOW) p.clearShadowLayer()
            if (revealing) {
                val pad = p.textSize * 2f
                val soft = max(full.width * 0.35f, p.textSize * 0.6f)
                // The edge travels from fully left of the text to fully past it.
                val edge = -soft + layer.reveal * (full.width + soft)
                val mask = android.graphics.Paint().apply {
                    shader = android.graphics.LinearGradient(edge, 0f, edge + soft, 0f, Color.BLACK, Color.TRANSPARENT, android.graphics.Shader.TileMode.CLAMP)
                    xfermode = android.graphics.PorterDuffXfermode(android.graphics.PorterDuff.Mode.DST_IN)
                }
                canvas.drawRect(-pad, -pad, full.width + pad, full.height + pad, mask)
                canvas.restore()
            }
            canvas.restore()
        }
    }

    /**
     * The layer's effect, drawn under its letters with the same layout [l] (whose paint is [p]);
     * a soft shadow is set on [p] itself and cleared after the letters are drawn.
     */
    private fun underFx(canvas: Canvas, layer: TextLayer, l: StaticLayout, p: TextPaint) {
        val a = layer.fxAmount.coerceIn(0f, 1f)
        val ts = p.textSize
        val op = layer.opacity.coerceIn(0f, 1f)
        fun tint(c: Int, alpha: Float) { p.color = c; p.alpha = (Color.alpha(c) * alpha * op).toInt().coerceIn(0, 255) }
        val fill = p.color
        val fillAlpha = p.alpha
        val mask = p.maskFilter
        fun restore() { p.color = fill; p.alpha = fillAlpha; p.maskFilter = mask; p.style = android.graphics.Paint.Style.FILL }
        when (layer.fx) {
            TextFx.NONE -> Unit
            TextFx.SHADOW -> {
                val c = if (layer.fxColor != 0) layer.fxColor else Color.BLACK
                p.setShadowLayer(ts * (0.05f + 0.25f * a), 0f, ts * (0.02f + 0.05f * a),
                    Color.argb(((0.35f + 0.55f * a) * 255 * op).toInt(), Color.red(c), Color.green(c), Color.blue(c)))
            }
            TextFx.DROP -> {
                val d = ts * (0.035f + 0.07f * a)
                tint(if (layer.fxColor != 0) layer.fxColor else Color.BLACK, 0.55f + 0.45f * a)
                canvas.translate(d, d); l.draw(canvas); canvas.translate(-d, -d)
                restore()
            }
            TextFx.GLOW, TextFx.BLUR -> {
                val glow = layer.fx == TextFx.GLOW
                tint(if (glow && layer.fxColor != 0) layer.fxColor else fill or (0xFF shl 24), if (glow) 0.55f + 0.45f * a else 0.5f + 0.4f * a)
                p.maskFilter = android.graphics.BlurMaskFilter(ts * (if (glow) 0.08f + 0.32f * a else 0.05f + 0.2f * a), android.graphics.BlurMaskFilter.Blur.NORMAL)
                l.draw(canvas)
                if (glow && a > 0.5f) l.draw(canvas)
                restore()
                // Soft blur also softens the letters themselves a little.
                if (!glow && layer.blur <= 0.002f) p.maskFilter = android.graphics.BlurMaskFilter(ts * 0.03f * a + 0.5f, android.graphics.BlurMaskFilter.Blur.NORMAL)
            }
            TextFx.OUTLINE -> {
                tint(if (layer.fxColor != 0) layer.fxColor else Color.BLACK, 1f)
                p.style = android.graphics.Paint.Style.STROKE
                p.strokeJoin = android.graphics.Paint.Join.ROUND
                p.strokeWidth = ts * (0.04f + 0.14f * a)
                l.draw(canvas)
                restore()
            }
            TextFx.HAZE -> {
                tint(if (layer.fxColor != 0) layer.fxColor else Color.BLACK, 0.3f + 0.45f * a)
                p.style = android.graphics.Paint.Style.FILL_AND_STROKE
                p.strokeWidth = ts * 0.45f
                p.maskFilter = android.graphics.BlurMaskFilter(ts * (0.45f + 0.55f * a), android.graphics.BlurMaskFilter.Blur.NORMAL)
                l.draw(canvas)
                restore()
            }
        }
    }

    /** A transparent bitmap of the text for the GPU, [w]x[h] in frame orientation. */
    fun render(layers: List<TextLayer>, fonts: FontLibrary, w: Int, h: Int): Bitmap {
        val bmp = createBitmap(w, h)
        draw(Canvas(bmp), layers, fonts, w.toFloat(), h.toFloat())
        return bmp
    }
}

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
) {
    fun toJson(): JSONObject = JSONObject()
        .put("id", id).put("text", text).put("font", font).put("size", size.toDouble())
        .put("x", x.toDouble()).put("y", y.toDouble()).put("rotation", rotation.toDouble())
        .put("align", align.name).put("color", color).put("opacity", opacity.toDouble())
        .put("shadow", shadow).put("tracking", tracking.toDouble()).put("behind", behind).put("wrap", wrap.toDouble()).put("box", box)
        .put("boxColor", boxColor).put("outline", outline)

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

    private fun layout(layer: TextLayer, p: TextPaint, frameW: Float): StaticLayout {
        val text = layer.text.ifEmpty { " " }
        val desired = ceil(text.lines().maxOf { StaticLayout.getDesiredWidth(it, p) }).toInt().coerceAtLeast(1) + 2
        val width = if (layer.wrap > 0f) min(desired, max(1, (layer.wrap * frameW).toInt())) else desired
        val align = when (layer.align) {
            TextAlign.LEFT -> Layout.Alignment.ALIGN_NORMAL
            TextAlign.CENTER -> Layout.Alignment.ALIGN_CENTER
            TextAlign.RIGHT -> Layout.Alignment.ALIGN_OPPOSITE
        }
        return StaticLayout.Builder.obtain(text, 0, text.length, p, width).setAlignment(align).setIncludePad(false)
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

    /** Draws all layers onto [canvas] covering a [w]x[h] frame. */
    fun draw(canvas: Canvas, layers: List<TextLayer>, fonts: FontLibrary, w: Float, h: Float) {
        for (layer in layers) {
            if (layer.text.isBlank()) continue
            val p = paint(layer, fonts, min(w, h))
            val l = layout(layer, p, w)
            canvas.save()
            canvas.translate(layer.x * w, layer.y * h)
            canvas.rotate(layer.rotation)
            canvas.translate(-l.width / 2f, -l.height / 2f)
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
            canvas.restore()
        }
    }

    /** A transparent bitmap of the text for the GPU, [w]x[h] in frame orientation. */
    fun render(layers: List<TextLayer>, fonts: FontLibrary, w: Int, h: Int): Bitmap {
        val bmp = createBitmap(w, h)
        draw(Canvas(bmp), layers, fonts, w.toFloat(), h.toFloat())
        return bmp
    }
}

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
    val y: Float = 0.82f,
    /** Clockwise, in degrees. */
    val rotation: Float = 0f,
    val align: TextAlign = TextAlign.CENTER,
    val color: Int = Color.WHITE,
    val opacity: Float = 1f,
    val shadow: Boolean = true,
    /** Extra letter spacing in ems. */
    val tracking: Float = 0f,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("id", id).put("text", text).put("font", font).put("size", size.toDouble())
        .put("x", x.toDouble()).put("y", y.toDouble()).put("rotation", rotation.toDouble())
        .put("align", align.name).put("color", color).put("opacity", opacity.toDouble())
        .put("shadow", shadow).put("tracking", tracking.toDouble())

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
            shadow = o.optBoolean("shadow", true),
            tracking = o.optDouble("tracking", 0.0).toFloat(),
        )

        fun listToJson(layers: List<TextLayer>): String = JSONArray().apply { layers.forEach { put(it.toJson()) } }.toString()

        fun listFromJson(s: String?): List<TextLayer> = runCatching {
            val a = JSONArray(s ?: return emptyList())
            List(a.length()) { fromJson(a.getJSONObject(it)) }
        }.getOrDefault(emptyList())
    }
}

/** A typeface the user can pick. */
class FontEntry(val key: String, val label: String, val typeface: Typeface)

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
                .onSuccess { out += FontEntry("asset:$file", label, it) }
        }
        dir.listFiles()?.sortedBy { it.name }?.forEach { f ->
            runCatching { Typeface.createFromFile(f) }.onSuccess {
                out += FontEntry("file:${f.name}", f.nameWithoutExtension.take(18), it)
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
            "DMSerifDisplay.ttf" to "DM Serif",
            "PlayfairDisplay.ttf" to "Playfair",
            "BebasNeue.ttf" to "Bebas",
            "SpaceMono.ttf" to "Space Mono",
            "CourierPrime.ttf" to "Typewriter",
            "VT323.ttf" to "VHS",
            "Caveat.ttf" to "Handwritten",
        )
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

    private fun layout(layer: TextLayer, p: TextPaint): StaticLayout {
        val text = layer.text.ifEmpty { " " }
        val width = ceil(text.lines().maxOf { StaticLayout.getDesiredWidth(it, p) }).toInt().coerceAtLeast(1) + 2
        val align = when (layer.align) {
            TextAlign.LEFT -> Layout.Alignment.ALIGN_NORMAL
            TextAlign.CENTER -> Layout.Alignment.ALIGN_CENTER
            TextAlign.RIGHT -> Layout.Alignment.ALIGN_OPPOSITE
        }
        return StaticLayout.Builder.obtain(text, 0, text.length, p, width).setAlignment(align).setIncludePad(false).build()
    }

    /** Size in pixels of a layer's text block in a [w]x[h] frame. */
    fun blockSize(layer: TextLayer, fonts: FontLibrary, w: Float, h: Float): Pair<Float, Float> {
        val l = layout(layer, paint(layer, fonts, min(w, h)))
        return l.width.toFloat() to l.height.toFloat()
    }

    /** Draws all layers onto [canvas] covering a [w]x[h] frame. */
    fun draw(canvas: Canvas, layers: List<TextLayer>, fonts: FontLibrary, w: Float, h: Float) {
        for (layer in layers) {
            if (layer.text.isBlank()) continue
            val l = layout(layer, paint(layer, fonts, min(w, h)))
            canvas.save()
            canvas.translate(layer.x * w, layer.y * h)
            canvas.rotate(layer.rotation)
            canvas.translate(-l.width / 2f, -l.height / 2f)
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

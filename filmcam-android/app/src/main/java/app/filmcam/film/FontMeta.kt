package app.filmcam.film

import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * What a font file says about itself: its family and style names, weight and slant, and for a
 * variable font each named instance it carries (Thin, Regular, Bold Italic...). Read straight
 * from the OpenType tables, so imported fonts group into families by their real names.
 */
object FontMeta {
    /** One face: a static font, or a named instance of a variable one ([variation] set). */
    data class Face(val family: String, val style: String, val weight: Int, val italic: Boolean, val variation: String? = null)

    /** The faces in [bytes] (a .ttf/.otf; a collection's first font), or empty if unreadable. */
    fun read(bytes: ByteArray): List<Face> = runCatching { parse(ByteBuffer.wrap(bytes).order(ByteOrder.BIG_ENDIAN)) }.getOrDefault(emptyList())

    private fun parse(b: ByteBuffer): List<Face> {
        var base = 0
        if (b.getInt(0) == 0x74746366) base = b.getInt(12)   // 'ttcf': the first font in the collection
        val numTables = b.getShort(base + 4).toInt() and 0xFFFF
        val tables = HashMap<String, Int>()
        for (i in 0 until numTables) {
            val r = base + 12 + i * 16
            val tag = String(ByteArray(4) { b.get(r + it) }, Charsets.US_ASCII)
            tables[tag] = b.getInt(r + 8)
        }
        val names = tables["name"]?.let { names(b, it) } ?: emptyMap()
        val family = names[16] ?: names[1] ?: return emptyList()
        val sub = names[17] ?: names[2] ?: "Regular"
        val os2 = tables["OS/2"]
        val weight = os2?.let { b.getShort(it + 4).toInt() and 0xFFFF } ?: 400
        val italic = os2?.let { (b.getShort(it + 62).toInt() and 1) != 0 } ?: sub.contains("Italic", true)
        val fvar = tables["fvar"]
        if (fvar != null) {
            val axesOff = b.getShort(fvar + 4).toInt() and 0xFFFF
            val axisCount = b.getShort(fvar + 8).toInt() and 0xFFFF
            val axisSize = b.getShort(fvar + 10).toInt() and 0xFFFF
            val instCount = b.getShort(fvar + 12).toInt() and 0xFFFF
            val instSize = b.getShort(fvar + 14).toInt() and 0xFFFF
            val tags = List(axisCount) { i ->
                val a = fvar + axesOff + i * axisSize
                String(ByteArray(4) { b.get(a + it) }, Charsets.US_ASCII)
            }
            val faces = ArrayList<Face>()
            val instStart = fvar + axesOff + axisCount * axisSize
            for (i in 0 until instCount) {
                val r = instStart + i * instSize
                val nameId = b.getShort(r).toInt() and 0xFFFF
                val coords = List(axisCount) { k -> b.getInt(r + 4 + k * 4) / 65536f }
                val style = names[nameId] ?: continue
                val w = tags.indexOf("wght").let { if (it >= 0) coords[it].toInt() else weight }
                val ital = tags.indexOf("ital").let { it >= 0 && coords[it] >= 0.5f } || tags.indexOf("slnt").let { it >= 0 && coords[it] != 0f } ||
                    (italic && style.contains("Italic", true))
                val settings = tags.indices.joinToString(", ") { "'${tags[it]}' ${fmt(coords[it])}" }
                faces += Face(family, style, w, ital, settings)
            }
            if (faces.isNotEmpty()) return faces.distinctBy { it.style }
        }
        return listOf(Face(family, sub, weight, italic))
    }

    private fun fmt(v: Float) = if (v == v.toInt().toFloat()) v.toInt().toString() else "%.2f".format(v)

    /** Name records by id: Windows Unicode (English first) preferred, then Mac Roman. */
    private fun names(b: ByteBuffer, t: Int): Map<Int, String> {
        val count = b.getShort(t + 2).toInt() and 0xFFFF
        val strings = t + (b.getShort(t + 4).toInt() and 0xFFFF)
        val out = HashMap<Int, Pair<Int, String>>()
        for (i in 0 until count) {
            val r = t + 6 + i * 12
            val platform = b.getShort(r).toInt() and 0xFFFF
            val lang = b.getShort(r + 4).toInt() and 0xFFFF
            val id = b.getShort(r + 6).toInt() and 0xFFFF
            val len = b.getShort(r + 8).toInt() and 0xFFFF
            val off = b.getShort(r + 10).toInt() and 0xFFFF
            val raw = ByteArray(len) { b.get(strings + off + it) }
            val (rank, text) = when (platform) {
                3, 0 -> (if (lang == 0x409 || platform == 0) 0 else 1) to String(raw, Charsets.UTF_16BE)
                1 -> 2 to String(raw, Charsets.ISO_8859_1)
                else -> continue
            }
            val have = out[id]
            if (text.isNotBlank() && (have == null || rank < have.first)) out[id] = rank to text.trim()
        }
        return out.mapValues { it.value.second }
    }
}

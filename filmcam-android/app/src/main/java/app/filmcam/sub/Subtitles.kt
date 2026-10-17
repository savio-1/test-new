package app.filmcam.sub

import app.filmcam.film.FontLibrary
import app.filmcam.film.TextAlign
import app.filmcam.film.TextLayer
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToLong

/** One subtitle: when it shows, and its line in each language. */
data class Cue(
    val startMs: Long,
    val endMs: Long,
    /** Language spoken in this cue ("te", "en", ...). */
    val language: String = "",
    val english: String = "",
    val telugu: String = "",
) {
    fun toJson(): JSONObject = JSONObject().put("start", startMs).put("end", endMs).put("language", language)
        .put("english", english).put("telugu", telugu)

    companion object {
        fun fromJson(o: JSONObject) = Cue(
            o.optLong("start"), o.optLong("end"), o.optString("language"), o.optString("english"), o.optString("telugu"),
        )
    }
}

/** Which language the subtitles show. */
enum class SubtitleLanguage(val label: String) { ENGLISH("English"), TELUGU("తెలుగు"), BOTH("Both") }

/** What sits behind the letters so they read over any picture. */
enum class SubtitleBackground(val label: String) { NONE("None"), SHADOW("Shadow"), OUTLINE("Outline"), BOX("Box") }

/** How subtitles look in the video. */
data class SubtitleStyle(
    val language: SubtitleLanguage = SubtitleLanguage.ENGLISH,
    val latinFont: String = FontLibrary.SUBTITLE_LATIN,
    val teluguFont: String = FontLibrary.SUBTITLE_TELUGU,
    /** Text size as a fraction of the frame's short side. */
    val size: Float = 0.045f,
    /**
     * Where the block sits, 0..1 (y from the top). [x] is the block's left edge, centre or
     * right edge as [align] is LEFT, CENTER or RIGHT; [y] is its centre.
     */
    val x: Float = 0.5f,
    val y: Float = 0.86f,
    val align: TextAlign = TextAlign.CENTER,
    val color: Int = 0xFFFFFFFF.toInt(),
    val background: SubtitleBackground = SubtitleBackground.BOX,
    /** Colour of the box or outline (opaque), and the box's opacity. */
    val backColor: Int = 0xFF000000.toInt(),
    val backOpacity: Float = 0.6f,
) {
    fun toJson(): JSONObject = JSONObject().put("language", language.name).put("latinFont", latinFont)
        .put("teluguFont", teluguFont).put("size", size.toDouble()).put("x", x.toDouble()).put("y", y.toDouble())
        .put("align", align.name).put("color", color).put("background", background.name)
        .put("backColor", backColor).put("backOpacity", backOpacity.toDouble())

    companion object {
        fun fromJson(o: JSONObject?) = if (o == null) SubtitleStyle() else SubtitleStyle(
            language = runCatching { SubtitleLanguage.valueOf(o.optString("language")) }.getOrDefault(SubtitleLanguage.ENGLISH),
            latinFont = o.optString("latinFont", FontLibrary.SUBTITLE_LATIN),
            teluguFont = o.optString("teluguFont", FontLibrary.SUBTITLE_TELUGU),
            size = o.optDouble("size", 0.045).toFloat(),
            x = o.optDouble("x", 0.5).toFloat(),
            y = o.optDouble("y", 0.86).toFloat(),
            align = runCatching { TextAlign.valueOf(o.optString("align")) }.getOrDefault(TextAlign.CENTER),
            color = o.optInt("color", 0xFFFFFFFF.toInt()),
            // Tracks saved before backgrounds had a choice kept a box flag.
            background = runCatching { SubtitleBackground.valueOf(o.optString("background")) }.getOrElse {
                if (o.optBoolean("box", true)) SubtitleBackground.BOX else SubtitleBackground.SHADOW
            },
            backColor = o.optInt("backColor", 0xFF000000.toInt()),
            backOpacity = o.optDouble("backOpacity", 0.6).toFloat(),
        )
    }
}

/** A clip's subtitles: the cues and their style. */
data class SubtitleTrack(val cues: List<Cue>, val style: SubtitleStyle = SubtitleStyle()) {

    fun at(timeMs: Long): Cue? = cues.firstOrNull { timeMs >= it.startMs && timeMs < it.endMs }

    /**
     * Text layers for the moment [timeMs], in a frame of aspect [aspect] (width / height).
     * Both languages stack: Telugu above, English below, the pair centred on [SubtitleStyle.y]
     * and lined up on [SubtitleStyle.x] by [SubtitleStyle.align], kept inside the frame.
     */
    fun layersAt(timeMs: Long, aspect: Float, fonts: FontLibrary?): List<TextLayer> =
        at(timeMs)?.let { layersFor(it, aspect, fonts) } ?: emptyList()

    fun layersFor(cue: Cue, aspect: Float, fonts: FontLibrary?): List<TextLayer> {
        val s = style
        val lines = when (s.language) {
            SubtitleLanguage.ENGLISH -> listOf(cue.english to s.latinFont)
            SubtitleLanguage.TELUGU -> listOf(cue.telugu to s.teluguFont)
            SubtitleLanguage.BOTH -> listOf(cue.telugu to s.teluguFont, cue.english to s.latinFont)
        }.filter { it.first.isNotBlank() }
        if (lines.isEmpty()) return emptyList()
        val margin = 0.03f
        // Room for a line: from the anchor to the edge it grows towards.
        val room = when (s.align) {
            TextAlign.LEFT -> 1f - margin - s.x
            TextAlign.RIGHT -> s.x - margin
            TextAlign.CENTER -> 2f * min(s.x, 1f - s.x) - 2 * margin
        }.coerceIn(0.35f, 0.9f)
        val alpha = (s.backOpacity.coerceIn(0f, 1f) * 255).toInt()
        val base = lines.map { (text, font) ->
            TextLayer(
                id = 0L, text = text.trim(), font = font, size = s.size, color = s.color, align = s.align,
                shadow = s.background == SubtitleBackground.SHADOW, wrap = room,
                box = s.background == SubtitleBackground.BOX, boxColor = (s.backColor and 0xFFFFFF) or (alpha shl 24),
                outline = if (s.background == SubtitleBackground.OUTLINE) s.backColor or (0xFF shl 24) else 0,
            )
        }
        // Sizes as fractions of the frame, so the block can be stacked and kept on screen.
        val w = 1000f * max(aspect, 0.01f)
        val h = 1000f
        val sizes = base.map { l -> fonts?.let { app.filmcam.film.TextRenderer.blockSize(l, it, w, h) }?.let { it.first / w to it.second / h } ?: (0.6f to s.size * 1.4f) }
        val gap = 0.008f
        val total = sizes.sumOf { it.second.toDouble() }.toFloat() + gap * (sizes.size - 1)
        val centre = s.y.coerceIn(min(0.5f, total / 2 + margin), max(0.5f, 1f - total / 2 - margin))
        var top = centre - total / 2
        return base.mapIndexed { i, l ->
            val (bw, bh) = sizes[i]
            val cx = when (s.align) {
                TextAlign.LEFT -> s.x + bw / 2
                TextAlign.RIGHT -> s.x - bw / 2
                TextAlign.CENTER -> s.x
            }.coerceIn(min(0.5f, bw / 2 + margin / 2), max(0.5f, 1f - bw / 2 - margin / 2))
            val y = top + bh / 2
            top += bh + gap
            l.copy(id = i.toLong() + 1, x = cx, y = y)
        }
    }

    fun toJson(): JSONObject = JSONObject()
        .put("cues", JSONArray().apply { cues.forEach { put(it.toJson()) } })
        .put("style", style.toJson())

    /** SubRip (.srt) text in [language] (BOTH writes the two lines together). */
    fun toSrt(language: SubtitleLanguage = style.language): String = buildString {
        cues.forEachIndexed { i, c ->
            val text = when (language) {
                SubtitleLanguage.ENGLISH -> c.english
                SubtitleLanguage.TELUGU -> c.telugu
                SubtitleLanguage.BOTH -> listOf(c.telugu, c.english).filter { it.isNotBlank() }.joinToString("\n")
            }.trim()
            append(i + 1).append('\n')
            append(srtTime(c.startMs)).append(" --> ").append(srtTime(c.endMs)).append('\n')
            append(text.ifEmpty { " " }).append("\n\n")
        }
    }

    companion object {
        fun fromJson(o: JSONObject): SubtitleTrack {
            val a = o.optJSONArray("cues") ?: JSONArray()
            return SubtitleTrack(List(a.length()) { Cue.fromJson(a.getJSONObject(it)) }, SubtitleStyle.fromJson(o.optJSONObject("style")))
        }

        fun srtTime(ms: Long): String {
            val t = max(0L, ms)
            return "%02d:%02d:%02d,%03d".format(t / 3_600_000, t / 60_000 % 60, t / 1000 % 60, t % 1000)
        }

        /**
         * Tidies cues from a model: in order, inside the clip, no overlaps, each on screen long
         * enough to read (at least 0.7 s), empty ones dropped.
         */
        fun clean(raw: List<Cue>, durationMs: Long): List<Cue> {
            val end = if (durationMs > 0) durationMs else Long.MAX_VALUE
            val sorted = raw.filter { it.english.isNotBlank() || it.telugu.isNotBlank() }
                .map { it.copy(startMs = it.startMs.coerceIn(0, end), endMs = it.endMs.coerceIn(0, end)) }
                .sortedBy { it.startMs }
            val out = ArrayList<Cue>()
            for ((i, c) in sorted.withIndex()) {
                val next = sorted.getOrNull(i + 1)?.startMs ?: end
                var e = max(c.endMs, c.startMs + 700)
                if (e > next) e = max(next, c.startMs + 300)
                if (e > end) e = end
                if (e > c.startMs) out += c.copy(endMs = e)
            }
            return out
        }

        /** Seconds (as a model writes them: 3.2, "3.2", "00:03.2", "0:00:03,200") to milliseconds. */
        fun parseTime(v: Any?): Long {
            return when (v) {
                is Number -> (v.toDouble() * 1000).roundToLong()
                is String -> {
                    val s = v.trim().removeSuffix("s").replace(',', '.')
                    val parts = s.split(':')
                    var secs = 0.0
                    for (p in parts) secs = secs * 60 + (p.toDoubleOrNull() ?: 0.0)
                    (secs * 1000).roundToLong()
                }
                else -> 0L
            }
        }
    }
}

package app.filmcam.sub

import android.graphics.Typeface
import android.text.TextPaint
import app.filmcam.film.FontLibrary
import app.filmcam.film.TextAlign
import app.filmcam.film.TextLayer
import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * How subtitles are set. Classic is a line at a time; the others are kinetic: the words come in
 * one by one as they are said, each revealed letter by letter out of a soft blur, and grouped
 * into short phrases that are set like a poster (a big word, small words tucked against it).
 */
enum class CaptionTemplate(val label: String, val blurb: String) {
    CLASSIC("Classic", "A line at a time"),
    SCATTER("Scatter", "Phrases land around the frame: one big word, small ones tucked on it"),
    STACK("Stack", "Lines build up in the middle, sans, serif and italic mixed"),
    FOCUS("Focus", "One or two words at a time, centred"),
    SIDES("Sides", "Words stack down the left and right edges, leaving the middle to the subject"),
    CASCADE("Cascade", "Each phrase steps down diagonally, word by word"),
    HIGHLIGHT("Highlight", "The whole line shows; the word being said lights up"),
    LOWER("Lower third", "Lines build up low on the left, the key word in the serif"),
    HEADLINE("Headline", "Big capitals across the top of the frame"),
    PUNCH("Punch", "One huge word at a time"),
}

/** How a word comes in. */
enum class WordAnim(val label: String) { BLUR("Blur in"), FADE("Fade"), RISE("Rise"), POP("Pop"), TYPE("Type"), NONE("Cut") }

/** Whether a word sits in front of the subject or behind it. AUTO follows the template's mix. */
enum class WordDepth(val label: String) { AUTO("Auto"), FRONT("In front"), BEHIND("Behind") }

/**
 * A change to one word of a kinetic caption: where it sits (its centre, 0..1 of the frame),
 * its size (fraction of the frame's short side), font, colour, entrance and depth. Unset
 * fields keep the template's choice. [text] is the word it was made for: if the line is
 * retyped and the word changes, the edit no longer applies.
 */
data class WordEdit(
    val text: String = "",
    val x: Float? = null,
    val y: Float? = null,
    val size: Float? = null,
    val font: String? = null,
    val color: Int? = null,
    val anim: WordAnim? = null,
    val depth: WordDepth = WordDepth.AUTO,
) {
    val isEmpty get() = x == null && y == null && size == null && font == null && color == null && anim == null && depth == WordDepth.AUTO

    fun toJson(): JSONObject = JSONObject().put("text", text).apply {
        x?.let { put("x", it.toDouble()) }; y?.let { put("y", it.toDouble()) }
        size?.let { put("size", it.toDouble()) }; font?.let { put("font", it) }
        color?.let { put("color", it) }; anim?.let { put("anim", it.name) }
        if (depth != WordDepth.AUTO) put("depth", depth.name)
    }

    companion object {
        fun fromJson(o: JSONObject) = WordEdit(
            text = o.optString("text"),
            x = if (o.has("x")) o.optDouble("x").toFloat() else null,
            y = if (o.has("y")) o.optDouble("y").toFloat() else null,
            size = if (o.has("size")) o.optDouble("size").toFloat() else null,
            font = if (o.has("font")) o.optString("font") else null,
            color = if (o.has("color")) o.optInt("color") else null,
            anim = if (o.has("anim")) runCatching { WordAnim.valueOf(o.optString("anim")) }.getOrNull() else null,
            depth = runCatching { WordDepth.valueOf(o.optString("depth")) }.getOrDefault(WordDepth.AUTO),
        )
    }
}

/** A word of a cue and when it is said. [id] is "cue:word" (both counted from 0). */
data class Word(val id: String, val text: String, val startMs: Long, val endMs: Long, val cue: Int, val index: Int)

/** Words shown together, from when the first is said until the next phrase takes over. */
data class Phrase(val words: List<Word>, val startMs: Long, val endMs: Long, val index: Int)

/**
 * Kinetic captions: turns a track's cues into word layers for any moment.
 *
 * Studied from short-form edits (podcast and talking-head reels): the words arrive as they are
 * spoken, each one revealed left to right out of a blur in about a quarter of a second; a
 * phrase holds two to four words and is replaced whole by the next; the one word that carries
 * the meaning is set three times the size of the small words around it, which sit tight on its
 * shoulder (overlapping its cap height); successive phrases jump between a few spots (the top
 * corners, beside the head, the chest) so the eye follows them; and some big words pass behind
 * the speaker's head while the rest stay in front. The face is Inter Tight Bold, with an italic
 * serif for the odd accent word.
 */
object Kinetic {
    /** Small words that never carry a phrase. */
    private val STOP = setOf(
        "a", "an", "the", "of", "to", "in", "on", "at", "by", "for", "with", "from", "as", "and", "but", "or", "so",
        "if", "is", "are", "was", "were", "be", "been", "am", "it", "its", "it's", "that", "this", "these", "those",
        "i", "i'm", "i've", "i'd", "i'll", "you", "your", "you're", "we", "our", "they", "their", "he", "she", "his",
        "her", "me", "my", "us", "them", "do", "did", "does", "have", "has", "had", "not", "no", "just", "what",
        "when", "then", "than", "there", "here", "will", "would", "can", "could", "about", "up", "out", "all",
        "one", "who", "how", "why", "where", "which", "know", "like", "get", "got",
    )

    /** Where a talking head's crown usually is in a vertical frame: words set behind go across it. */
    const val HEAD_TOP = 0.25f

    /** The time a word takes to come in, and a phrase to go. */
    const val IN_MS = 260L
    /** How long before a timed word is said it starts to come in. */
    const val ANTICIPATE_MS = 60L
    const val OUT_MS = 120L

    private fun bare(w: String) = w.lowercase().trim { !it.isLetterOrDigit() && it != '\'' }

    fun isSmall(w: String) = bare(w) in STOP || bare(w).length <= 2

    // ------------------------------------------------------------------ words and phrases

    /** The words of each cue in the language shown, timed through the cue by their length. */
    fun words(track: SubtitleTrack): List<List<Word>> = track.cues.mapIndexed { ci, c ->
        val text = when (track.style.language) {
            SubtitleLanguage.TELUGU -> c.telugu.ifBlank { c.english }
            else -> c.english.ifBlank { c.telugu }
        }
        val parts = text.split(Regex("\\s+")).filter { it.isNotBlank() }
        if (parts.isEmpty()) return@mapIndexed emptyList()
        // Aligned to the sound: each word starts coming in just before it is said, so it is
        // forming as it is heard.
        if (c.timedText == text && c.wordStarts.size == parts.size) {
            // Found in the sound, so they may fall a little outside the line's written times.
            val at = c.wordStarts.map { it - ANTICIPATE_MS }
            return@mapIndexed parts.mapIndexed { wi, w ->
                val s = at[wi]
                val e = (at.getOrNull(wi + 1) ?: c.endMs).coerceAtLeast(s)
                Word("$ci:$wi", w, s, e, ci, wi)
            }
        }
        // Longer words take longer to say; a comma or full stop adds a breath after the word.
        val weights = parts.map { w -> 1.5f + bare(w).length.coerceAtLeast(1) + if (w.last() in ",.;:!?") 2.5f else 0f }
        val total = weights.sum()
        val span = (c.endMs - c.startMs).coerceAtLeast(1)
        var acc = 0f
        parts.mapIndexed { wi, w ->
            val s = c.startMs + (span * acc / total).toLong()
            acc += weights[wi]
            val e = c.startMs + (span * acc / total).toLong()
            Word("$ci:$wi", w, s, e, ci, wi)
        }
    }

    private class Limits(val words: Int, val chars: Int)

    private fun limits(t: CaptionTemplate) = when (t) {
        CaptionTemplate.SCATTER -> Limits(3, 20)
        CaptionTemplate.STACK -> Limits(2, 15)
        CaptionTemplate.FOCUS -> Limits(2, 14)
        CaptionTemplate.SIDES -> Limits(3, 22)
        CaptionTemplate.CASCADE -> Limits(4, 24)
        CaptionTemplate.HIGHLIGHT -> Limits(6, 34)
        CaptionTemplate.LOWER -> Limits(4, 26)
        CaptionTemplate.HEADLINE -> Limits(3, 18)
        CaptionTemplate.PUNCH -> Limits(2, 14)
        CaptionTemplate.CLASSIC -> Limits(99, 999)
    }

    /**
     * Words grouped into phrases: a phrase ends at punctuation, at the template's word or
     * character limit, at a pause, or with its cue. Each holds until the next one starts (or a
     * moment after its last word, at a long silence).
     */
    fun phrases(track: SubtitleTrack): List<Phrase> {
        val lim = limits(track.style.template)
        val groups = ArrayList<List<Word>>()
        val opens = "\"\u201c\u2018'(["
        val ends = ",.;:!?"
        for (cue in words(track)) {
            var cur = ArrayList<Word>()
            fun flush() { if (cur.isNotEmpty()) { groups += cur; cur = ArrayList() } }
            for ((i, w) in cue.withIndex()) {
                val chars = cur.sumOf { it.text.length + 1 } + w.text.length
                val pause = cur.isNotEmpty() && w.startMs - cur.last().endMs > 350
                // A quotation starts its own phrase.
                if (w.text.first() in opens || cur.size >= lim.words || chars > lim.chars || pause) flush()
                cur += w
                // Punch: every word that carries meaning is its own beat (a small word rides with it).
                if (track.style.template == CaptionTemplate.PUNCH && !isSmall(w.text)) { flush(); continue }
                if (w.text.last() in ends || w.text.trimEnd('\u201d', '\u2019', '"', '\'', ')').lastOrNull()?.let { it in ends } == true) { flush(); continue }
                // A phrase closes on its key word ("on my | podcast"), keeping a last small word
                // that ends the sentence ("struggles with?").
                if (!isSmall(w.text) && (cur.size >= 2 || bare(w.text).length >= 7 || w.text.last() in "\u201d\u2019\"")) {
                    val next = cue.getOrNull(i + 1)
                    if (next != null && isSmall(next.text) && next.text.last() in ends && lim.words > 2) continue
                    flush()
                }
            }
            flush()
        }
        return groups.mapIndexed { i, g ->
            val next = groups.getOrNull(i + 1)?.first()?.startMs ?: Long.MAX_VALUE
            val linger = g.last().endMs + 700
            val end = min(next, max(linger, g.last().startMs + IN_MS + 400))
            Phrase(g, g.first().startMs, end, i)
        }
    }

    /** The phrases of a track, which of them go behind the subject, and the spot each takes. */
    class Plan(val phrases: List<Phrase>, val behind: BooleanArray, val slots: IntArray)

    /** Plans are cached per track (the editor and an export ask for every frame). */
    private var cacheKey: SubtitleTrack? = null
    private var cache: Plan? = null
    fun plan(track: SubtitleTrack): Plan = synchronized(this) {
        cache?.takeIf { cacheKey === track }?.let { return it }
        val ps = phrases(track)
        val st = track.style
        val behind = BooleanArray(ps.size) { i ->
            val p = ps[i]
            st.behindSubject && behindPhrase(p, st.seed) && !isSmall(p.words[emphasis(p.words)].text)
        }
        // Spots: never the same twice running; phrases going behind take the high ones, where
        // the head covers only part of the word.
        val slots = IntArray(ps.size)
        for (i in ps.indices) {
            val pool = SLOTS.indices.filter { SLOTS[it].crown == behind[i] }
            slots[i] = slotIndexFor(i, st.seed, pool, if (i > 0) slots[i - 1] else -1)
        }
        Plan(ps, behind, slots).also { cache = it; cacheKey = track }
    }

    // ------------------------------------------------------------------ measuring

    /** Text widths as a fraction of the frame width, for a size given as a fraction of the short side. */
    private class Ruler(val fonts: FontLibrary?, aspect: Float, val tracking: Float = 0f) {
        val w = 1000f * max(aspect, 0.05f)
        val h = 1000f
        val short = min(w, h)
        private val paint by lazy { TextPaint(TextPaint.ANTI_ALIAS_FLAG) }
        private val faces = HashMap<String, Typeface>()

        fun width(text: String, font: String, size: Float): Float {
            val f = fonts
            if (f == null) {
                // No fonts (tests): a bold sans is about 0.56 em a letter, the italic serif 0.45.
                val em = (if (font.contains("Serif")) 0.45f else 0.56f) + tracking
                return text.length * em * size * short / w
            }
            paint.typeface = faces.getOrPut(font) { f.typeface(font) }
            paint.textSize = size * short
            paint.letterSpacing = tracking
            return paint.measureText(text) / w
        }

        /** Height of one line of text of [size], as a fraction of the frame height. */
        fun lineH(size: Float) = size * short / h * 1.18f
        fun sizeFor(text: String, font: String, widthFrac: Float) = widthFrac / max(width(text, font, 1f), 1e-4f)
    }

    // ------------------------------------------------------------------ layout

    /** A word placed: where its centre goes and how it is set. */
    data class Placed(
        val word: Word, val x: Float, val y: Float, val size: Float, val font: String, val color: Int,
        val behind: Boolean, val big: Boolean,
    )

    /** A phrase's spot: anchor x (left, centre or right edge by [align]) and the big word's centre y. */
    private class Slot(val x: Float, val y: Float, val align: TextAlign, val width: Float, val crown: Boolean = false)

    // Portrait spots, from the reels: the top corners, beside the head, the chest, low down.
    // Words going behind the subject take the crown spots: wide (wider than a head, so both
    // ends always show) and across the top of the head, so the hair hides only part of them.
    private val SLOTS = listOf(
        Slot(0.06f, 0.15f, TextAlign.LEFT, 0.50f),                 // top left
        Slot(0.94f, 0.15f, TextAlign.RIGHT, 0.50f),                // top right
        Slot(0.50f, 0.20f, TextAlign.CENTER, 0.62f),               // above the head
        Slot(0.50f, 0.56f, TextAlign.CENTER, 0.66f),               // chest
        Slot(0.07f, 0.42f, TextAlign.LEFT, 0.44f),                 // left of the shoulder
        Slot(0.93f, 0.42f, TextAlign.RIGHT, 0.44f),                // right of the shoulder
        Slot(0.50f, 0.72f, TextAlign.CENTER, 0.60f),               // low
        Slot(0.50f, HEAD_TOP - 0.01f, TextAlign.CENTER, 0.82f, crown = true),  // across the crown
        Slot(0.05f, HEAD_TOP - 0.04f, TextAlign.LEFT, 0.62f, crown = true),    // crown, from the left
        Slot(0.95f, HEAD_TOP - 0.04f, TextAlign.RIGHT, 0.62f, crown = true),   // crown, from the right
    )

    /** A stable pseudo-random number for [k] (and the style's shuffle seed), 0 until 1. */
    private fun rnd(k: Int, salt: Int, seed: Int): Float {
        var h = k * 0x9E3779B1.toInt() xor (salt * 0x85EBCA77.toInt()) xor (seed * 0xC2B2AE3D.toInt())
        h = h xor (h ushr 15); h *= 0x2C1B3C6D; h = h xor (h ushr 12); h *= 0x297A2D39; h = h xor (h ushr 15)
        return (h ushr 8) / 16777216f
    }

    /** Whether the phrase is one of those that go (partly) behind the subject, about two in five. */
    private fun behindPhrase(p: Phrase, seed: Int) = rnd(p.index, 7, seed) < 0.42f

    /** The phrase's most important word: the longest one that isn't a small word. */
    fun emphasis(words: List<Word>): Int {
        var best = 0
        var score = -1f
        words.forEachIndexed { i, w ->
            val s = bare(w.text).length + (if (isSmall(w.text)) 0f else 6f) + i * 0.1f
            if (s > score) { score = s; best = i }
        }
        return best
    }

    /** Lays out one phrase in [template] (no animation: final places). */
    fun place(track: SubtitleTrack, p: Phrase, aspect: Float, fonts: FontLibrary?, stackOf: List<Phrase> = emptyList()): List<Placed> {
        val plan = plan(track)
        val st = track.style
        val ruler = Ruler(fonts, aspect, st.tracking)
        val telugu = st.language == SubtitleLanguage.TELUGU
        val sans = if (telugu) st.teluguFont else st.captionFont
        val serif = if (telugu) st.teluguFont else st.accentFont
        val wide = if (aspect > 1f) 0.55f else 1f
        val scale = st.captionScale
        val behindOn = st.behindSubject
        val out = ArrayList<Placed>()
        val m = 0.04f

        fun txt(w: Word) = shown(st.template, w.text)
        fun lineWidth(words: List<Word>, font: String, size: Float) =
            words.sumOf { ruler.width(txt(it), font, size).toDouble() }.toFloat() + ruler.width(" ", font, size) * (words.size - 1)

        /** Places [words] on one line with its left edge at [left] and centre at [y]. */
        fun line(words: List<Word>, left: Float, y: Float, font: String, size: Float, behind: Boolean, big: Boolean) {
            var x = left
            val space = ruler.width(" ", font, size)
            for (w in words) {
                val ww = ruler.width(txt(w), font, size)
                out += Placed(w, x + ww / 2, y, size, font, st.color, behind, big)
                x += ww + space
            }
        }

        /** [words] broken into lines no wider than [maxW]. */
        fun wrap(words: List<Word>, font: String, size: Float, maxW: Float): List<List<Word>> {
            val lines = ArrayList<List<Word>>()
            var cur = ArrayList<Word>()
            for (w in words) {
                if (cur.isNotEmpty() && lineWidth(cur + w, font, size) > maxW) { lines += cur; cur = ArrayList() }
                cur += w
            }
            if (cur.isNotEmpty()) lines += cur
            return lines
        }

        when (st.template) {
            CaptionTemplate.SCATTER -> {
                val e = emphasis(p.words)
                val goBehind = plan.behind.getOrElse(p.index) { false }
                val slot = SLOTS[plan.slots.getOrElse(p.index) { 3 }]
                val accent = rnd(p.index, 3, st.seed) < 0.22f && !telugu
                val bigFont = if (accent) serif else sans
                val bigWord = p.words[e]
                var big = (ruler.sizeFor(bigWord.text, bigFont, slot.width * wide) * scale).coerceIn(0.085f, if (slot.crown) 0.26f else 0.2f)
                // Never wider than the frame allows.
                val maxW = 1f - 2 * m
                if (ruler.width(bigWord.text, bigFont, big) > maxW) big = ruler.sizeFor(bigWord.text, bigFont, maxW)
                val small = (big * 0.4f).coerceIn(0.05f, 0.075f) * if (scale < 1f) scale else 1f
                val bw = ruler.width(bigWord.text, bigFont, big)
                val bigLeft = when (slot.align) {
                    TextAlign.LEFT -> slot.x
                    TextAlign.RIGHT -> slot.x - bw
                    TextAlign.CENTER -> slot.x - bw / 2
                }.coerceIn(m, max(m, 1f - m - bw))
                val by = slot.y
                val bh = ruler.lineH(big)
                line(listOf(bigWord), bigLeft, by, bigFont, big, goBehind, big = true)
                val before = p.words.subList(0, e)
                val after = p.words.subList(e + 1, p.words.size)
                if (before.isNotEmpty()) {
                    val lw = lineWidth(before, sans, small)
                    val left = when (slot.align) {
                        TextAlign.LEFT -> bigLeft + bw * 0.02f
                        TextAlign.RIGHT -> bigLeft + bw - lw
                        TextAlign.CENTER -> bigLeft + (bw - lw) / 2
                    }.coerceIn(m, max(m, 1f - m - lw))
                    // Tucked onto the big word's shoulder, overlapping its cap height a little.
                    line(before, left, by - bh * 0.47f, sans, small, false, big = false)
                }
                if (after.isNotEmpty()) {
                    val lw = lineWidth(after, sans, small)
                    val left = (if (slot.align == TextAlign.RIGHT) bigLeft + bw * 0.04f else bigLeft + bw - lw)
                        .coerceIn(m, max(m, 1f - m - lw))
                    line(after, left, by + bh * 0.40f, sans, small, false, big = false)
                }
            }
            CaptionTemplate.STACK -> {
                // A block of up to three phrases, one a line, building up in the middle.
                val lines = stackOf.ifEmpty { listOf(p) }
                val fontsCycle = listOf(sans, serif, st.captionItalic)
                val stackBehind = behindOn && lines.size > 1 && behindPhrase(lines.first(), st.seed)
                val placedLines = lines.mapIndexed { li, ph ->
                    val bigLine = ph.words.any { !isSmall(it.text) && bare(it.text).length >= 5 } || ph.words.size == 1
                    val font = if (bigLine && !telugu) fontsCycle[(li + rnd(ph.index, 5, st.seed).times(3).toInt()) % 3] else sans
                    // The line going behind is set wide, so the head never hides all of it.
                    val target = if (stackBehind && li == 0 && bigLine) 0.84f else if (bigLine) 0.64f else 0.34f
                    var size = (ruler.sizeFor(ph.words.joinToString(" ") { it.text }, font, target * wide) * scale)
                        .coerceIn(if (bigLine) 0.075f else 0.042f, if (stackBehind && li == 0) 0.24f else if (bigLine) 0.16f else 0.065f)
                    val lw0 = lineWidth(ph.words, font, size)
                    if (lw0 > 1f - 2 * m) size *= (1f - 2 * m) / lw0
                    Triple(ph, font, size)
                }
                // Stack the lines tight: centre to centre a little over half the two sizes, so
                // caps of one line nearly touch the descenders of the one above.
                val gaps = placedLines.zipWithNext { a, b -> 0.53f * (a.third + b.third) * ruler.short / ruler.h }
                val total = gaps.sum()
                // A block that sends a line behind the subject sits at head height, where the head
                // covers only part of that line; the biggest line is the one that goes behind.
                val biggest = 0
                val blockBehind = stackBehind && placedLines[0].third > 0.07f
                // Normally the block is centred on the chest; one with a line going behind is moved so
                // that line sits across the top of the head (the hair hides only the letters' feet).
                val offsetToBiggest = gaps.take(biggest).sum()
                var cy = if (blockBehind) HEAD_TOP - offsetToBiggest else 0.58f - total / 2
                placedLines.forEachIndexed { li, (ph, font, size) ->
                    if (li > 0) cy += gaps[li - 1]
                    val lw = lineWidth(ph.words, font, size)
                    // Lines step left and right of the centre, as hand-set type does.
                    val shift = listOf(-0.05f, 0.06f, -0.02f)[li % 3] * (if (rnd(ph.index, 9, st.seed) < 0.5f) 1 else -1)
                    val left = (0.5f - lw / 2 + shift).coerceIn(m, max(m, 1f - m - lw))
                    if (ph === p) line(ph.words, left, cy, font, size, blockBehind && li == biggest, size > 0.07f)
                }
            }
            CaptionTemplate.FOCUS -> {
                val behind = behindOn && behindPhrase(p, st.seed)
                var size = 0.075f * scale
                val lw0 = lineWidth(p.words, sans, size)
                if (lw0 > 0.84f) size *= 0.84f / lw0
                val lw = lineWidth(p.words, sans, size)
                // Behind-phrases rise to head height, where the head only covers part of them.
                line(p.words, 0.5f - lw / 2, if (behind) 0.3f else 0.52f, sans, size, behind, big = true)
            }
            CaptionTemplate.SIDES -> {
                // Down one edge of the frame, alternating sides, so the middle stays clear.
                val left = (p.index + st.seed) % 2 == 0
                // Narrow enough to stay clear of a centred head and shoulders.
                val colW = if (aspect > 1f) 0.2f else 0.25f
                val e = emphasis(p.words)
                val accent = rnd(p.index, 3, st.seed) < 0.25f && !telugu
                val bigFont = if (accent) serif else sans
                var big = (ruler.sizeFor(txt(p.words[e]), bigFont, colW) * scale).coerceIn(0.05f, 0.12f)
                if (ruler.width(txt(p.words[e]), bigFont, big) > colW * 1.15f) big = ruler.sizeFor(txt(p.words[e]), bigFont, colW * 1.15f)
                val small = (big * 0.5f).coerceIn(0.035f, 0.06f) * if (scale < 1f) scale else 1f
                // The key word on a line of its own, the others grouped on small lines.
                class Ln(val words: List<Word>, val font: String, val size: Float, val big: Boolean)
                val lines = ArrayList<Ln>()
                var run = ArrayList<Word>()
                fun flushRun() { if (run.isNotEmpty()) { wrap(run, sans, small, colW).forEach { lines += Ln(it, sans, small, false) }; run = ArrayList() } }
                p.words.forEachIndexed { i, w -> if (i == e) { flushRun(); lines += Ln(listOf(w), bigFont, big, true) } else run += w }
                flushRun()
                val heights = lines.map { ruler.lineH(it.size) * 0.95f }
                var y = 0.40f + (rnd(p.index, 4, st.seed) - 0.5f) * 0.16f - heights.sum() / 2
                for ((k, ln) in lines.withIndex()) {
                    y += heights[k] / 2
                    val lw = lineWidth(ln.words, ln.font, ln.size)
                    val x = if (left) m + 0.01f else 1f - m - 0.01f - lw
                    line(ln.words, x, y, ln.font, ln.size, false, ln.big)
                    y += heights[k] / 2
                }
            }
            CaptionTemplate.CASCADE -> {
                // A staircase: each word a step lower and further along, the key word bigger.
                val e = emphasis(p.words)
                val base = 0.072f * scale
                val sizes = p.words.indices.map { if (it == e) base * 1.4f else base }
                val widths = p.words.mapIndexed { i, w -> ruler.width(txt(w), sans, sizes[i]) }
                val n = p.words.size
                val maxW = widths.maxOrNull() ?: 0f
                val dx = if (n > 1) min(0.13f, (1f - 2 * m - maxW) / (n - 1)).coerceAtLeast(0f) else 0f
                val dys = sizes.map { ruler.lineH(it) * 0.92f }
                val forward = (p.index + st.seed) % 2 == 0
                var y = 0.5f + (rnd(p.index, 4, st.seed) - 0.5f) * 0.12f - dys.sum() / 2
                p.words.forEachIndexed { i, w ->
                    y += dys[i] / 2
                    val x = if (forward) (0.5f - (dx * (n - 1) + widths.last()) / 2 + dx * i)
                        else (0.5f + (dx * (n - 1) + widths.first()) / 2 - dx * i - widths[i])
                    line(listOf(w), x.coerceIn(m, max(m, 1f - m - widths[i])), y, sans, sizes[i], false, i == e)
                    y += dys[i] / 2
                }
            }
            CaptionTemplate.HIGHLIGHT, CaptionTemplate.LOWER -> {
                val lower = st.template == CaptionTemplate.LOWER
                val size = (if (lower) 0.058f else 0.062f) * scale
                val maxW = (if (lower) 0.7f else 0.84f) * wide
                val e = emphasis(p.words)
                val lines = wrap(p.words, sans, size, maxW)
                val lh = ruler.lineH(size) * 1.02f
                var y = (if (lower) 0.86f else 0.74f) - lh * lines.size + lh / 2
                for (ln in lines) {
                    if (lower) {
                        // Left-aligned; the key word in the accent face, a size up.
                        var x = m + 0.03f
                        for (w in ln) {
                            val key = w === p.words[e] && !telugu
                            val f = if (key) serif else sans
                            val sz = if (key) size * 1.25f else size
                            val ww = ruler.width(txt(w), f, sz)
                            out += Placed(w, x + ww / 2, y, sz, f, st.color, false, key)
                            x += ww + ruler.width(" ", sans, size)
                        }
                    } else {
                        line(ln, 0.5f - lineWidth(ln, sans, size) / 2, y, sans, size, false, false)
                    }
                    y += lh
                }
            }
            CaptionTemplate.HEADLINE -> {
                // Capitals filling the width; a phrase going behind sits across the crown.
                val behind = behindOn && behindPhrase(p, st.seed)
                val target = 0.88f
                var size = (ruler.sizeFor(p.words.joinToString(" ") { txt(it) }, sans, target) * scale).coerceIn(0.06f, 0.2f)
                val lines = if (size >= 0.085f || p.words.size == 1) listOf(p.words) else {
                    size = 0.085f * scale
                    wrap(p.words, sans, size, target)
                }
                val lh = ruler.lineH(size) * 0.9f
                var y = (if (behind) HEAD_TOP - 0.01f else 0.15f) - lh * (lines.size - 1) / 2
                for (ln in lines) {
                    var sz = size
                    val lw0 = lineWidth(ln, sans, sz)
                    if (lw0 > 1f - 2 * m) sz *= (1f - 2 * m) / lw0
                    line(ln, 0.5f - lineWidth(ln, sans, sz) / 2, y, sans, sz, behind, true)
                    y += lh
                }
            }
            CaptionTemplate.PUNCH -> {
                val e = emphasis(p.words)
                val behind = behindOn && behindPhrase(p, st.seed) && !isSmall(p.words[e].text)
                val w = p.words[e]
                var big = (ruler.sizeFor(txt(w), sans, 0.78f * wide) * scale).coerceIn(0.1f, 0.3f)
                if (ruler.width(txt(w), sans, big) > 1f - 2 * m) big = ruler.sizeFor(txt(w), sans, 1f - 2 * m)
                val by = if (behind) HEAD_TOP + 0.02f else 0.5f
                val bw = ruler.width(txt(w), sans, big)
                line(listOf(w), 0.5f - bw / 2, by, sans, big, behind, true)
                val rest = p.words.filterIndexed { i, _ -> i != e }
                if (rest.isNotEmpty()) {
                    val small = (big * 0.32f).coerceIn(0.04f, 0.07f)
                    val lw = lineWidth(rest, sans, small)
                    line(rest, 0.5f - lw / 2, by - ruler.lineH(big) * 0.55f, sans, small, false, false)
                }
            }
            CaptionTemplate.CLASSIC -> Unit
        }
        // The person's own changes win.
        return out.map { pl ->
            val e = track.edits[pl.word.id]?.takeIf { it.text.isEmpty() || it.text == pl.word.text } ?: return@map pl
            pl.copy(
                x = e.x ?: pl.x, y = e.y ?: pl.y, size = e.size ?: pl.size, font = e.font ?: pl.font, color = e.color ?: pl.color,
                behind = when (e.depth) { WordDepth.AUTO -> pl.behind; WordDepth.FRONT -> false; WordDepth.BEHIND -> true },
            )
        }
    }

    /** Picks a spot from [pool], weighted to the chest (as the reels do), avoiding [prev]. */
    private fun slotIndexFor(i: Int, seed: Int, pool: List<Int>, prev: Int): Int {
        val choices = pool.filter { it != prev }.ifEmpty { pool }
        val weights = choices.map { if (it == 3) 2.2f else 1f }
        var r = rnd(i, 1, seed) * weights.sum()
        for ((k, c) in choices.withIndex()) { r -= weights[k]; if (r <= 0f) return c }
        return choices.last()
    }

    // ------------------------------------------------------------------ animation

    private fun ease(x: Float) = 1f - (1f - x.coerceIn(0f, 1f)).let { it * it * it }
    private fun backOut(x: Float): Float { val c = 1.7f; val t = x.coerceIn(0f, 1f) - 1f; return 1f + (c + 1f) * t * t * t + c * t * t }

    /** Word layers for the moment [timeMs]. */
    fun layersAt(track: SubtitleTrack, timeMs: Long, aspect: Float, fonts: FontLibrary?): List<TextLayer> {
        val all = plan(track).phrases
        val st = track.style
        val visible: List<Pair<Phrase, List<Phrase>>> = when (st.template) {
            CaptionTemplate.STACK -> {
                // Blocks of up to three lines; a block shows from its first phrase to its last one's end.
                val blocks = stackBlocks(all, track)
                val b = blocks.firstOrNull { blk -> timeMs >= blk.first().startMs && timeMs < blk.last().endMs } ?: return emptyList()
                b.filter { it.startMs <= timeMs }.map { it to b }
            }
            else -> all.firstOrNull { timeMs >= it.startMs && timeMs < it.endMs }?.let { listOf(it to emptyList()) } ?: return emptyList()
        }
        val out = ArrayList<TextLayer>()
        val r = Ruler(null, aspect)
        for ((p, block) in visible) {
            val end = if (block.isNotEmpty()) block.last().endMs else p.endMs
            val leaving = ((end - timeMs).toFloat() / OUT_MS).coerceIn(0f, 1f)
            if (st.template == CaptionTemplate.HIGHLIGHT) { highlight(track, p, timeMs, aspect, fonts, leaving, r, out); continue }
            for (pl in place(track, p, aspect, fonts, stackOf = block)) {
                if (timeMs < pl.word.startMs) continue
                val e = track.edits[pl.word.id]?.takeIf { it.text.isEmpty() || it.text == pl.word.text }
                val anim = e?.anim ?: st.wordAnim
                val u = (timeMs - pl.word.startMs).toFloat() / IN_MS
                var reveal = 1f
                var blur = 0f
                var alpha = 1f
                var dy = 0f
                var scale = 1f
                when (anim) {
                    WordAnim.BLUR -> { reveal = ease(u * 1.15f); blur = 0.14f * (1f - ease(u)); dy = 0.05f * (1f - ease(u)) }
                    WordAnim.FADE -> alpha = ease(u)
                    WordAnim.RISE -> { alpha = ease(u); dy = 0.4f * (1f - ease(u)) }
                    WordAnim.POP -> { alpha = ease(u * 2f); scale = 0.55f + 0.45f * backOut(u) }
                    WordAnim.TYPE -> reveal = if (u >= 1f) 1f else ((u * pl.word.text.length).toInt() + 1f) / (pl.word.text.length + 1f)
                    WordAnim.NONE -> Unit
                }
                // Going: the whole phrase fades and softens in its last moment.
                if (leaving < 1f) { alpha *= leaving; blur += 0.1f * (1f - leaving) }
                if (alpha <= 0.01f) continue
                out += TextLayer(
                    id = layerId(pl.word), text = shown(st.template, pl.word.text), font = pl.font, size = pl.size * scale,
                    x = pl.x, y = pl.y + dy * r.lineH(pl.size), color = pl.color, opacity = alpha,
                    tracking = st.tracking, fx = st.effect, fxAmount = st.effectAmount, fxColor = st.effectColor,
                    behind = pl.behind, reveal = reveal, blur = blur, blend = st.blend,
                )
            }
        }
        return out
    }

    /**
     * Highlight: the whole line is up from its first word; words not yet said are dim, the
     * word being said is in the accent colour and pops a little, words said are full white.
     */
    private fun highlight(track: SubtitleTrack, p: Phrase, timeMs: Long, aspect: Float, fonts: FontLibrary?, leaving: Float, r: Ruler, out: ArrayList<TextLayer>) {
        val st = track.style
        val enter = ease((timeMs - p.startMs).toFloat() / IN_MS)
        for (pl in place(track, p, aspect, fonts)) {
            val edit = track.edits[pl.word.id]?.takeIf { it.text.isEmpty() || it.text == pl.word.text }
            val said = timeMs >= pl.word.startMs
            val now = said && timeMs < pl.word.endMs
            val pop = if (now) ease((timeMs - pl.word.startMs) / 120f) else 0f
            val alpha = (if (said) 1f else 0.5f) * enter * leaving
            if (alpha <= 0.01f) continue
            out += TextLayer(
                id = layerId(pl.word), text = shown(st.template, pl.word.text), font = pl.font, size = pl.size * (1f + 0.12f * pop),
                x = pl.x, y = pl.y + 0.25f * (1f - enter) * r.lineH(pl.size),
                color = if (now && edit?.color == null) st.accentColor else pl.color, opacity = alpha,
                tracking = st.tracking, fx = st.effect, fxAmount = st.effectAmount, fxColor = st.effectColor,
                behind = pl.behind, blend = st.blend,
            )
        }
    }

    /** The word as the template shows it (Headline sets capitals). */
    fun shown(template: CaptionTemplate, text: String) = if (template == CaptionTemplate.HEADLINE) text.uppercase() else text

    /** Stack blocks: up to three consecutive phrases, broken by a long silence. */
    fun stackBlocks(all: List<Phrase>, track: SubtitleTrack): List<List<Phrase>> {
        val out = ArrayList<List<Phrase>>()
        var cur = ArrayList<Phrase>()
        for (p in all) {
            val gap = cur.isNotEmpty() && p.startMs - cur.last().words.last().endMs > 600
            if (cur.size >= 3 || gap) { out += cur; cur = ArrayList() }
            cur += p
        }
        if (cur.isNotEmpty()) out += cur
        return out
    }

    /** The phrase holding the word [id] ("cue:word"), if any. */
    fun phraseOf(track: SubtitleTrack, id: String): Phrase? = plan(track).phrases.firstOrNull { p -> p.words.any { it.id == id } }

    /** The phrase on screen at [timeMs] (or the last one begun before it). */
    fun phraseAt(track: SubtitleTrack, timeMs: Long): Phrase? {
        val ps = plan(track).phrases
        return ps.firstOrNull { timeMs >= it.startMs && timeMs < it.endMs } ?: ps.lastOrNull { it.startMs <= timeMs }
    }

    /** Where the word [id] settles, with every template rule and edit applied (for the editor). */
    fun placedWord(track: SubtitleTrack, id: String, aspect: Float, fonts: FontLibrary?): Placed? {
        val p = phraseOf(track, id) ?: return null
        val block = if (track.style.template == CaptionTemplate.STACK) stackBlocks(plan(track).phrases, track).firstOrNull { p in it }.orEmpty() else emptyList()
        return place(track, p, aspect, fonts, stackOf = block).firstOrNull { it.word.id == id }
    }

    /** Layer ids carry the word: cue * 1000 + word + 1. */
    fun layerId(w: Word) = w.cue * 1000L + w.index + 1
    fun wordIdOf(layerId: Long): String = "${(layerId - 1) / 1000}:${(layerId - 1) % 1000}"
}

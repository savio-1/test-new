package app.filmcam.sub

import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin

/**
 * Finds when each word of the subtitles is said, so kinetic captions land on the voice.
 *
 * A small acoustic model (about 330 thousand weights, distilled from Meta's MMS forced-alignment
 * model) turns the clip's sound into letter probabilities every 20 ms; each cue's words, written
 * in Latin letters (Telugu romanised), are then forced through those probabilities. A cue is
 * matched only near where the transcript says it is, with "anything else" allowed before and
 * after it, so a cue time that is a little off, or speech nobody wrote down, doesn't pull the
 * words away. Words come out to within a frame or two of when they start.
 */
class WordAligner(private val model: AlignModel) {

    /**
     * The track with word start times on every cue whose text could be matched to the sound
     * [pcm] (16 kHz mono, -1..1). Cues whose shown text isn't the language spoken (a
     * translation) keep the even estimate.
     */
    fun align(pcm: FloatArray, track: SubtitleTrack): SubtitleTrack {
        val lp = model.logProbs(pcm)
        return alignWith(lp, track)
    }

    /** As [align], from letter log-probabilities already worked out ([T] x [AlignModel.VOCAB]). */
    fun alignWith(lp: Array<FloatArray>, track: SubtitleTrack): SubtitleTrack {
        val T = lp.size
        var prevEnd = 0
        val cues = track.cues.map { c ->
            val text = shownText(c, track.style.language)
            val words = text.split(Regex("\\s+")).filter { it.isNotBlank() }
            // Marked as done either way (no times: the even estimate), so it isn't tried again.
            if (words.isEmpty() || !spoken(c, track.style.language)) return@map c.copy(wordStarts = emptyList(), timedText = text)
            val starts = alignCue(lp, T, words, c.startMs, c.endMs, prevEnd) ?: return@map c.copy(wordStarts = emptyList(), timedText = text)
            prevEnd = starts.second
            c.copy(wordStarts = starts.first, timedText = text)
        }
        return track.copy(cues = cues)
    }

    /**
     * Word starts for one cue, and the frame after its last letter; null when the words don't
     * fit the sound (too few frames, nothing to spell, or a poor match).
     */
    private fun alignCue(lp: Array<FloatArray>, T: Int, words: List<String>, startMs: Long, endMs: Long, prevEnd: Int): Pair<List<Long>, Int>? {
        val toks = ArrayList<Int>()
        val owner = ArrayList<Int>()
        words.forEachIndexed { wi, w ->
            for (ch in Romanizer.roman(w)) {
                val k = AlignModel.LABELS.indexOf(ch)
                if (k > 0) { toks += k; owner += wi }
            }
        }
        if (toks.isEmpty()) return null
        val a = max(prevEnd, ((startMs - PAD_MS) / FRAME_MS).toInt()).coerceIn(0, T)
        val b = min(T, ((endMs + PAD_MS) / FRAME_MS).toInt() + 1)
        if (b - a < toks.size + 2) return null
        val path = viterbi(lp, a, b, toks.toIntArray())
        val starts = LongArray(words.size) { -1L }
        var last = a
        var hit = 0
        for (t in path.indices) {
            val s = path[t]
            if (s >= 1 && s <= 2 * toks.size + 1 && (s - 1) % 2 == 1) {
                val w = owner[(s - 1) / 2]
                if (starts[w] < 0) starts[w] = ((a + t) * FRAME_MS + OFFSET_MS).toLong().coerceAtLeast(0)
                last = a + t
                hit++
            }
        }
        if (hit == 0) return null
        // Words with nothing to spell (symbols, emoji) go evenly between their neighbours.
        val known = starts.indices.filter { starts[it] >= 0 }
        for (i in starts.indices) if (starts[i] < 0) {
            val p = known.lastOrNull { it < i }
            val n = known.firstOrNull { it > i }
            starts[i] = when {
                p != null && n != null -> starts[p] + (starts[n] - starts[p]) * (i - p) / (n - p)
                p != null -> starts[p]
                n != null -> starts[n]
                else -> startMs
            }
        }
        for (i in 1 until starts.size) if (starts[i] < starts[i - 1]) starts[i] = starts[i - 1]
        return starts.toList() to last + 1
    }

    /**
     * Best path of the letters [toks] through frames [a]..[b): CTC states (blank, letter,
     * blank, letter ... blank) with an "anything else" state before and after. Returns the
     * state of each frame (0: before, 2n+2: after).
     */
    private fun viterbi(lp: Array<FloatArray>, a: Int, b: Int, toks: IntArray): IntArray {
        val T = b - a
        val n = toks.size
        val S = 2 * n + 3
        val neg = -1e30f
        var prev = FloatArray(S) { neg }
        var cur = FloatArray(S)
        val back = Array(T) { ByteArray(S) }   // how far back the best state was (0, 1 or 2)
        fun garbage(t: Int): Float { val r = lp[a + t]; var m = r[0]; for (v in 1 until r.size) if (r[v] > m) m = r[v]; return m - GARBAGE_PENALTY }
        fun em(t: Int, s: Int, g: Float): Float = when {
            s == 0 || s == S - 1 -> g
            (s - 1) % 2 == 0 -> lp[a + t][0]
            else -> lp[a + t][toks[(s - 1) / 2]]
        }
        val g0 = garbage(0)
        prev[0] = em(0, 0, g0); prev[1] = em(0, 1, g0); prev[2] = em(0, 2, g0)
        for (t in 1 until T) {
            val g = garbage(t)
            val bt = back[t]
            for (s in 0 until S) {
                var best = prev[s]
                var step = 0
                if (s >= 1 && prev[s - 1] > best) { best = prev[s - 1]; step = 1 }
                // Straight from one letter to the next when they differ (no blank between).
                if (s in 3..S - 2 && (s - 1) % 2 == 1) {
                    val k = (s - 1) / 2
                    if (k >= 1 && toks[k] != toks[k - 1] && prev[s - 2] > best) { best = prev[s - 2]; step = 2 }
                }
                if (s == 2 && prev[0] > best) { best = prev[0]; step = 2 }
                if (s == S - 1 && prev[S - 3] > best) { best = prev[S - 3]; step = 2 }
                cur[s] = best + em(t, s, g)
                bt[s] = step.toByte()
            }
            val tmp = prev; prev = cur; cur = tmp
        }
        var s = S - 1
        if (prev[S - 2] > prev[s]) s = S - 2
        if (prev[S - 3] > prev[s]) s = S - 3
        val path = IntArray(T)
        for (t in T - 1 downTo 0) {
            path[t] = s
            if (t > 0) s -= back[t][s]
        }
        return path
    }

    companion object {
        /** Whether some cue's shown words haven't been through the aligner yet. */
        fun needsAligning(track: SubtitleTrack): Boolean =
            track.cues.any { it.timedText != shownText(it, track.style.language) && shownText(it, track.style.language).isNotBlank() }

        const val FRAME_MS = 20.0
        /** How far outside its written times a cue's words may be found. */
        const val PAD_MS = 1000L
        /** The model marks a letter a little after it starts; measured on hand-aligned speech. */
        const val OFFSET_MS = -40.0
        const val GARBAGE_PENALTY = 1.0f

        /** The words shown for a cue in [language] (kinetic captions show English for Both). */
        fun shownText(c: Cue, language: SubtitleLanguage): String = when (language) {
            SubtitleLanguage.TELUGU -> c.telugu.ifBlank { c.english }
            else -> c.english.ifBlank { c.telugu }
        }

        /** Whether the words shown are the words said (not a translation), as far as the cue says. */
        fun spoken(c: Cue, language: SubtitleLanguage): Boolean {
            val l = c.language.lowercase()
            if (l.isBlank()) return true
            return when (language) {
                SubtitleLanguage.TELUGU -> l.startsWith("te") || c.telugu.isBlank()
                else -> !l.startsWith("te") || c.english.isBlank()
            }
        }
    }
}

/** Spelling words in the Latin letters the alignment model knows: Telugu by sound, numbers in words. */
object Romanizer {
    private val vowels = mapOf(
        'అ' to "a", 'ఆ' to "aa", 'ఇ' to "i", 'ఈ' to "ii", 'ఉ' to "u", 'ఊ' to "uu", 'ఋ' to "ra", 'ౠ' to "rra", 'ఌ' to "la",
        'ఎ' to "e", 'ఏ' to "ee", 'ఐ' to "ai", 'ఒ' to "o", 'ఓ' to "oo", 'ఔ' to "au",
    )
    private val consonants = mapOf(
        'క' to "k", 'ఖ' to "kh", 'గ' to "g", 'ఘ' to "gh", 'ఙ' to "ng", 'చ' to "c", 'ఛ' to "ch", 'జ' to "j", 'ఝ' to "jh", 'ఞ' to "ny",
        'ట' to "tt", 'ఠ' to "tth", 'డ' to "dd", 'ఢ' to "ddh", 'ణ' to "nn", 'త' to "t", 'థ' to "th", 'ద' to "d", 'ధ' to "dh", 'న' to "n",
        'ప' to "p", 'ఫ' to "ph", 'బ' to "b", 'భ' to "bh", 'మ' to "m", 'య' to "y", 'ర' to "r", 'ఱ' to "rr", 'ల' to "l", 'ళ' to "ll",
        'ఴ' to "lll", 'వ' to "v", 'శ' to "sh", 'ష' to "ss", 'స' to "s", 'హ' to "h",
    )
    private val signs = mapOf(
        'ా' to "aa", 'ి' to "i", 'ీ' to "ii", 'ు' to "u", 'ూ' to "uu", 'ృ' to "ra", 'ౄ' to "rra", 'ె' to "e", 'ే' to "ee", 'ై' to "ai",
        'ొ' to "o", 'ో' to "oo", 'ౌ' to "au",
    )
    private const val VIRAMA = '్'
    private val ones = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(" ")
    private val tens = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split(" ")

    private fun number(n: Long): String = when {
        n < 20 -> ones[n.toInt()]
        n < 100 -> tens[(n / 10).toInt()] + (if (n % 10 == 0L) "" else ones[(n % 10).toInt()])
        n < 1000 -> ones[(n / 100).toInt()] + "hundred" + (if (n % 100 == 0L) "" else number(n % 100))
        n < 1_000_000 -> number(n / 1000) + "thousand" + (if (n % 1000 == 0L) "" else number(n % 1000))
        else -> n.toString().map { ones[it - '0'] }.joinToString("")
    }

    fun roman(word: String): String {
        val s = word.lowercase()
        val out = StringBuilder()
        var i = 0
        while (i < s.length) {
            val c = s[i]
            val con = consonants[c]
            if (con != null) {
                out.append(con)
                val nx = s.getOrNull(i + 1)
                val sign = nx?.let { signs[it] }
                when {
                    sign != null -> { out.append(sign); i += 2; continue }
                    nx == VIRAMA -> { i += 2; continue }
                    else -> out.append('a')
                }
                i++
                continue
            }
            when {
                vowels[c] != null -> out.append(vowels[c])
                c == 'ం' -> out.append('m')
                c == 'ః' -> out.append('h')
                c in '౦'..'౯' -> out.append(('0' + (c - '౦')))
                c in 'a'..'z' || c == '\'' || c in '0'..'9' -> out.append(c)
            }
            i++
        }
        val r = Regex("[0-9]+").replace(out) { m ->
            val d = m.value
            if (d.length <= 6) number(d.toLong()) else d.map { ones[it - '0'] }.joinToString("")
        }
        return r.trim('\'')
    }
}

/**
 * The small acoustic model: 40 log-mel bands every 10 ms in, the log-probability of each of
 * [LABELS] every 20 ms out. Two convolutions, eight depthwise-separable residual blocks with
 * layer norm, and a 1x1 output; weights stored as float16.
 */
class AlignModel private constructor(
    private val c1w: FloatArray, private val c1b: FloatArray,
    private val c2w: FloatArray, private val c2b: FloatArray,
    private val blocks: List<BlockW>,
    private val ow: FloatArray, private val ob: FloatArray,
) {
    class BlockW(val dw: FloatArray, val db: FloatArray, val pw: FloatArray, val pb: FloatArray, val g: FloatArray, val b: FloatArray)

    /** Letter log-probabilities for [pcm] (16 kHz mono, -1..1): one row per 20 ms frame. */
    fun logProbs(pcm: FloatArray): Array<FloatArray> {
        val mel = Features.logMel(pcm)
        val t10 = mel[0].size
        if (t10 == 0) return emptyArray()
        val t20 = (t10 - 1) / 2 + 1
        val out = Array(t20) { FloatArray(VOCAB) }
        // In pieces with a margin of context either side, so long clips need little memory.
        val piece = 3000
        val margin = 120
        var s20 = 0
        while (s20 < t20) {
            val e20 = min(t20, s20 + piece)
            val a20 = max(0, s20 - margin)
            val b20 = min(t20, e20 + margin)
            val part = forward(mel, a20 * 2, min(t10, b20 * 2))
            for (t in s20 until e20) {
                val row = out[t]
                val k = t - a20
                for (v in 0 until VOCAB) row[v] = part[v][k]
            }
            s20 = e20
        }
        return out
    }

    /** The network on mel frames [from]..[to) (from even); output [VOCAB][frames]. */
    private fun forward(mel: Array<FloatArray>, from: Int, to: Int): Array<FloatArray> {
        val n = to - from
        val x0 = Array(MEL) { m -> FloatArray(n) { mel[m][from + it] } }
        // conv1: 40 -> C, k5, pad 2, relu
        val h1 = Array(C) { FloatArray(n) }
        for (o in 0 until C) {
            val row = h1[o]
            java.util.Arrays.fill(row, c1b[o])
            for (i in 0 until MEL) {
                val xi = x0[i]
                val base = (o * MEL + i) * 5
                for (k in 0 until 5) {
                    val w = c1w[base + k]
                    val off = k - 2
                    val lo = max(0, -off)
                    val hi = min(n, n - off)
                    for (t in lo until hi) row[t] += w * xi[t + off]
                }
            }
            for (t in 0 until n) if (row[t] < 0f) row[t] = 0f
        }
        // conv2: C -> C, k3, stride 2, pad 1, relu
        val m = (n - 1) / 2 + 1
        var x = Array(C) { FloatArray(m) }
        for (o in 0 until C) {
            val row = x[o]
            java.util.Arrays.fill(row, c2b[o])
            for (i in 0 until C) {
                val xi = h1[i]
                val base = (o * C + i) * 3
                val w0 = c2w[base]; val w1 = c2w[base + 1]; val w2 = c2w[base + 2]
                for (t in 0 until m) {
                    val c = 2 * t
                    var acc = w1 * xi[c]
                    if (c - 1 >= 0) acc += w0 * xi[c - 1]
                    if (c + 1 < n) acc += w2 * xi[c + 1]
                    row[t] += acc
                }
            }
            for (t in 0 until m) if (row[t] < 0f) row[t] = 0f
        }
        val hN = Array(C) { FloatArray(m) }
        val hD = Array(C) { FloatArray(m) }
        for (bw in blocks) {
            // layer norm over channels, per frame
            for (t in 0 until m) {
                var mean = 0f
                for (c in 0 until C) mean += x[c][t]
                mean /= C
                var v = 0f
                for (c in 0 until C) { val d = x[c][t] - mean; v += d * d }
                val inv = 1f / kotlin.math.sqrt(v / C + 1e-5f)
                for (c in 0 until C) hN[c][t] = (x[c][t] - mean) * inv * bw.g[c] + bw.b[c]
            }
            // depthwise k9
            for (c in 0 until C) {
                val src = hN[c]
                val dst = hD[c]
                java.util.Arrays.fill(dst, bw.db[c])
                for (k in 0 until 9) {
                    val w = bw.dw[c * 9 + k]
                    val off = k - 4
                    val lo = max(0, -off)
                    val hi = min(m, m - off)
                    for (t in lo until hi) dst[t] += w * src[t + off]
                }
            }
            // pointwise, relu, residual
            val nx = Array(C) { FloatArray(m) }
            for (o in 0 until C) {
                val row = nx[o]
                java.util.Arrays.fill(row, bw.pb[o])
                for (i in 0 until C) {
                    val w = bw.pw[o * C + i]
                    if (w == 0f) continue
                    val src = hD[i]
                    for (t in 0 until m) row[t] += w * src[t]
                }
                val res = x[o]
                for (t in 0 until m) row[t] = (if (row[t] > 0f) row[t] else 0f) + res[t]
            }
            x = nx
        }
        // output 1x1 and log-softmax over letters
        val out = Array(VOCAB) { FloatArray(m) }
        for (o in 0 until VOCAB) {
            val row = out[o]
            java.util.Arrays.fill(row, ob[o])
            for (i in 0 until C) {
                val w = ow[o * C + i]
                val src = x[i]
                for (t in 0 until m) row[t] += w * src[t]
            }
        }
        for (t in 0 until m) {
            var mx = out[0][t]
            for (v in 1 until VOCAB) if (out[v][t] > mx) mx = out[v][t]
            var sum = 0.0
            for (v in 0 until VOCAB) sum += exp((out[v][t] - mx).toDouble())
            val lse = mx + ln(sum).toFloat()
            for (v in 0 until VOCAB) out[v][t] -= lse
        }
        return out
    }

    companion object {
        const val MEL = 40
        const val C = 160
        const val BLOCKS = 8
        const val VOCAB = 28
        /** The letters, index 0 the CTC blank. */
        val LABELS: List<Char> = listOf('-', 'a', 'i', 'e', 'n', 'o', 'u', 't', 's', 'r', 'm', 'k', 'l', 'd', 'g', 'h', 'y', 'b', 'p', 'w', 'c', 'v', 'j', 'z', 'f', '\'', 'q', 'x')

        /** Reads the weights (float16, little-endian, in the order the exporter writes them). */
        fun load(bytes: ByteArray): AlignModel {
            val bb = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
            fun take(n: Int) = FloatArray(n) { half(bb.short) }
            val c1w = take(C * MEL * 5); val c1b = take(C)
            val c2w = take(C * C * 3); val c2b = take(C)
            val blocks = List(BLOCKS) { BlockW(take(C * 9), take(C), take(C * C), take(C), take(C), take(C)) }
            val ow = take(VOCAB * C); val ob = take(VOCAB)
            return AlignModel(c1w, c1b, c2w, c2b, blocks, ow, ob)
        }

        fun fromAssets(context: android.content.Context): AlignModel =
            load(context.assets.open("align/model.bin").use { it.readBytes() })

        private fun half(h: Short): Float {
            val bits = h.toInt() and 0xFFFF
            val sign = bits and 0x8000
            val exp = (bits ushr 10) and 0x1F
            val mant = bits and 0x3FF
            val f = when (exp) {
                0 -> if (mant == 0) 0 else {
                    // subnormal
                    var e = -1; var mm = mant
                    while (mm and 0x400 == 0) { mm = mm shl 1; e-- }
                    ((e + 127 - 14) shl 23) or ((mm and 0x3FF) shl 13)
                }
                0x1F -> 0x7F800000 or (mant shl 13)
                else -> ((exp + 112) shl 23) or (mant shl 13)
            }
            return java.lang.Float.intBitsToFloat((sign shl 16) or f)
        }
    }
}

/** 40-band log-mel features every 10 ms, as the alignment model was trained on. */
object Features {
    const val SR = 16000
    const val NFFT = 512
    const val HOP = 160
    private const val MELS = 40

    private val window = FloatArray(NFFT) { (0.5 - 0.5 * cos(2 * PI * it / NFFT)).toFloat() }
    private val fb: Array<FloatArray> by lazy {
        fun hz2m(f: Double) = 2595 * log10(1 + f / 700)
        fun m2hz(m: Double) = 700 * (10.0.pow(m / 2595) - 1)
        val lo = hz2m(60.0); val hi = hz2m(7600.0)
        val pts = DoubleArray(MELS + 2) { m2hz(lo + (hi - lo) * it / (MELS + 1)) }
        Array(MELS) { i ->
            FloatArray(NFFT / 2 + 1) { k ->
                val f = k * SR.toDouble() / NFFT
                max(0.0, min((f - pts[i]) / (pts[i + 1] - pts[i]), (pts[i + 2] - f) / (pts[i + 2] - pts[i + 1]))).toFloat()
            }
        }
    }

    /** [MELS] rows of frames: frame m covers samples 160m .. 160m+512 (zeros past the end). */
    fun logMel(pcm: FloatArray): Array<FloatArray> {
        val T = pcm.size / HOP
        val out = Array(MELS) { FloatArray(T) }
        val re = DoubleArray(NFFT)
        val im = DoubleArray(NFFT)
        val power = DoubleArray(NFFT / 2 + 1)
        val bands = fb
        for (t in 0 until T) {
            val s = t * HOP
            for (i in 0 until NFFT) {
                val j = s + i
                re[i] = if (j < pcm.size) (pcm[j] * window[i]).toDouble() else 0.0
                im[i] = 0.0
            }
            Fft.transform(re, im)
            for (k in 0..NFFT / 2) power[k] = re[k] * re[k] + im[k] * im[k]
            for (m in 0 until MELS) {
                val w = bands[m]
                var acc = 0.0
                for (k in w.indices) if (w[k] != 0f) acc += w[k] * power[k]
                out[m][t] = ln(acc + 1e-6).toFloat()
            }
        }
        // Each band less its mean over the clip.
        for (m in 0 until MELS) {
            val row = out[m]
            var mean = 0.0
            for (v in row) mean += v
            mean /= max(1, row.size)
            for (i in row.indices) row[i] = (row[i] - mean).toFloat()
        }
        return out
    }
}

/** In-place radix-2 complex FFT. */
object Fft {
    fun transform(re: DoubleArray, im: DoubleArray) {
        val n = re.size
        var j = 0
        for (i in 1 until n) {
            var bit = n shr 1
            while (j and bit != 0) { j = j xor bit; bit = bit shr 1 }
            j = j xor bit
            if (i < j) {
                var t = re[i]; re[i] = re[j]; re[j] = t
                t = im[i]; im[i] = im[j]; im[j] = t
            }
        }
        var len = 2
        while (len <= n) {
            val ang = -2 * PI / len
            val wr = cos(ang); val wi = sin(ang)
            var i = 0
            while (i < n) {
                var cr = 1.0; var ci = 0.0
                for (k in 0 until len / 2) {
                    val ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci
                    val ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr
                    re[i + k + len / 2] = re[i + k] - ar; im[i + k + len / 2] = im[i + k] - ai
                    re[i + k] += ar; im[i + k] += ai
                    val nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr
                }
                i += len
            }
            len = len shl 1
        }
    }
}

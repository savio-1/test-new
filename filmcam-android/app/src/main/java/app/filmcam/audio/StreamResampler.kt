package app.filmcam.audio

import kotlin.math.PI
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Streaming rational-ratio polyphase resampler with a Kaiser-windowed sinc kernel (16 zero
 * crossings each side, beta 8.6, cutoff 0.92 x the lower Nyquist frequency).
 *
 * Output sample k sits exactly at input time k * inRate / outRate (zero-phase kernel, no
 * fractional delay), so an up-and-back-down round trip lines up sample-exactly with the input.
 * Output k needs input up to index [needInput] (k); it is produced as soon as that sample has
 * been pushed, independently of how the input is chunked. Samples before index 0 count as 0.
 *
 * Per-phase coefficients are tabulated when the reduced interpolation factor is <= 1024 (all
 * common rates: 8/11.025/16/22.05/24/32/44.1/88.2/96 kHz); otherwise a 1024-phase table is
 * interpolated linearly. Each tabulated phase is normalised to unity DC gain.
 *
 * Not thread-safe; [process] allocates nothing.
 */
internal class StreamResampler(val inRate: Int, val outRate: Int) {
    /** Reduced ratio outRate/inRate = up/down. */
    val up: Int
    val down: Int
    /** Half kernel width in input samples; output k reads inputs n0-half+1 .. n0+half. */
    val half: Int
    private val taps: Int
    private val phases: Int
    private val exact: Boolean
    private val table: FloatArray
    private val hist: FloatArray
    private val mask: Int
    private var inCount = 0L
    private var outCount = 0L

    init {
        require(inRate > 0 && outRate > 0)
        val g = gcd(inRate, outRate)
        up = outRate / g
        down = inRate / g
        half = halfWidth(inRate, outRate)
        taps = 2 * half
        exact = up <= MAX_PHASES
        phases = if (exact) up else MAX_PHASES
        val rows = if (exact) phases else phases + 1
        val cutoff = CUTOFF * min(1.0, outRate.toDouble() / inRate)
        table = FloatArray(rows * taps)
        val i0b = besselI0(BETA)
        for (p in 0 until rows) {
            val frac = p.toDouble() / phases
            var sum = 0.0
            val tmp = DoubleArray(taps)
            for (i in 0 until taps) {
                val tau = frac + half - 1 - i
                val x = tau / half
                val w = if (x <= -1.0 || x >= 1.0) 0.0 else besselI0(BETA * sqrt(1.0 - x * x)) / i0b
                val arg = PI * cutoff * tau
                val s = if (tau == 0.0) 1.0 else sin(arg) / arg
                tmp[i] = cutoff * s * w
                sum += tmp[i]
            }
            for (i in 0 until taps) table[p * taps + i] = (tmp[i] / sum).toFloat()
        }
        var size = 1
        while (size < taps + 2) size = size shl 1
        hist = FloatArray(size)
        mask = size - 1
    }

    /** Index of the last input sample output [k] depends on. */
    fun needInput(k: Long): Long = needInput(k, up, down, half)

    /** Upper bound on outputs produced from [n] more inputs. */
    fun maxOutput(n: Int): Int = (n.toLong() * up / down + 2).toInt()

    fun reset() {
        hist.fill(0f)
        inCount = 0
        outCount = 0
    }

    /** Pushes [n] samples and writes every output that became available to [out]; returns the count. */
    fun process(x: FloatArray, off: Int, n: Int, out: FloatArray, outOff: Int): Int {
        var produced = 0
        for (s in 0 until n) {
            hist[(inCount and mask.toLong()).toInt()] = x[off + s]
            inCount++
            while (true) {
                val num = outCount * down
                val n0 = num / up
                if (n0 + half >= inCount) break
                val p = (num - n0 * up).toInt()
                val base = (n0 - half + 1).toInt()
                var acc = 0f
                if (exact) {
                    val row = p * taps
                    for (i in 0 until taps) acc += table[row + i] * hist[(base + i) and mask]
                } else {
                    val pos = p.toDouble() / up * phases
                    val q = floor(pos).toInt()
                    val mu = (pos - q).toFloat()
                    val r0 = q * taps
                    val r1 = r0 + taps
                    for (i in 0 until taps) {
                        val c = table[r0 + i] + mu * (table[r1 + i] - table[r0 + i])
                        acc += c * hist[(base + i) and mask]
                    }
                }
                out[outOff + produced++] = acc
                outCount++
            }
        }
        return produced
    }

    companion object {
        private const val ZERO_CROSSINGS = 16
        private const val BETA = 8.6
        private const val CUTOFF = 0.92
        private const val MAX_PHASES = 1024

        fun halfWidth(inRate: Int, outRate: Int): Int =
            ceil(ZERO_CROSSINGS / (CUTOFF * min(1.0, outRate.toDouble() / inRate))).toInt()

        fun needInput(k: Long, up: Int, down: Int, half: Int): Long = (k * down) / up + half

        fun gcd(a: Int, b: Int): Int {
            var x = a
            var y = b
            while (y != 0) { val t = x % y; x = y; y = t }
            return x
        }

        private fun besselI0(x: Double): Double {
            var sum = 1.0
            var term = 1.0
            val q = x * x / 4
            var k = 1
            while (term > 1e-12 * sum) {
                term *= q / (k.toDouble() * k)
                sum += term
                k++
            }
            return sum
        }
    }
}

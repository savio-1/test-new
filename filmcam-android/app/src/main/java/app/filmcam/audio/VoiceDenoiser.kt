package app.filmcam.audio

import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Streaming voice denoiser for interleaved 16-bit PCM, built on [RnNoise].
 *
 * Each channel runs its own RnNoise state at 48 kHz; other sample rates are resampled to
 * 48 kHz and back ([StreamResampler], zero-phase, so the round trip is sample-aligned). The
 * denoised signal is blended with the dry input, delayed to line up exactly:
 *
 *     out = w * denoised + (1 - w) * dry
 *     w   = wetPause + (wetSpeech - wetPause) * clamp(1.4 * vadSmoothed, 0, 1)
 *     wetPause = 0.85 + 0.15 * min(1, 2s),  wetSpeech = 0.35 + 0.5s   (s = strength)
 *
 * vadSmoothed is the per-frame RnNoise VAD probability averaged over +-5 frames (+-50 ms,
 * symmetric, so it looks 50 ms ahead), then linearly interpolated between frame centres so w
 * changes smoothly sample by sample. strength <= 0 is a bypass: pure dry, same latency.
 *
 * Output has the same length as the input and lags it by exactly [latencyFrames] sample frames
 * (the first [latencyFrames] output frames are silence); [flush] returns the remaining tail.
 * Results do not depend on how the input is chunked. Not thread-safe: use one instance per
 * stream from one thread at a time. After construction nothing is allocated except the arrays
 * returned by the allocating [process] / [flush] overloads.
 */
class VoiceDenoiser(
    model: RnNoiseModel,
    val sampleRate: Int,
    val channels: Int,
    val strength: Float = 0.6f,
) {
    private val bypass = strength <= 0f
    private val s = strength.coerceIn(0f, 1f)
    private val wetPause = 0.85f + 0.15f * min(1f, s * 2f)
    private val wetSpeech = 0.35f + 0.5f * s
    private val native = sampleRate == RnNoise.SAMPLE_RATE

    /** Output delay in sample frames at [sampleRate]. */
    val latencyFrames: Int

    private val chans: Array<Channel>
    private var phase = 0 // index of the channel the next interleaved input sample belongs to

    init {
        require(sampleRate in 8000..192000) { "unsupported sample rate $sampleRate" }
        require(channels in 1..8) { "unsupported channel count $channels" }
        latencyFrames = computeLatency()
        chans = Array(channels) { Channel(model) }
    }

    /** Processes [length] interleaved samples (any length, frames may straddle calls). */
    fun process(pcm: ShortArray, offset: Int, length: Int): ShortArray {
        val out = ShortArray(length)
        process(pcm, offset, length, out, 0)
        return out
    }

    /** Non-allocating variant: writes [length] output samples to [out] at [outOffset]. */
    fun process(pcm: ShortArray, offset: Int, length: Int, out: ShortArray, outOffset: Int) {
        require(offset >= 0 && length >= 0 && offset + length <= pcm.size)
        require(outOffset >= 0 && outOffset + length <= out.size)
        for (c in 0 until channels) {
            // First sample of channel c in this chunk.
            val first = (c - phase + channels) % channels
            if (first >= length) continue
            val count = (length - first + channels - 1) / channels
            chans[c].process(pcm, offset + first, channels, count, out, outOffset + first)
        }
        phase = ((phase + length) % channels)
    }

    /**
     * Drains the delayed tail: returns latencyFrames * channels samples (the output for
     * latencyFrames frames of silence after the real input) and resets the denoiser.
     */
    fun flush(): ShortArray {
        require(phase == 0) { "flush() called mid-frame" }
        val n = latencyFrames * channels
        val zeros = ShortArray(n)
        val out = process(zeros, 0, n)
        reset()
        return out
    }

    /** Back to the initial state (empty delay line, fresh RnNoise states). */
    fun reset() {
        for (ch in chans) ch.reset()
        phase = 0
    }

    // ------------------------------------------------------------------ latency

    /**
     * Smallest delay L such that output frame j (emitted when input frame j+L arrives) has
     * everything it needs: the denoised sample and the smoothed VAD around it. The dependency
     * pattern repeats every second, so scanning one second gives the exact maximum.
     */
    private fun computeLatency(): Int {
        if (native) return maxLookahead(RnNoise.SAMPLE_RATE.toLong(), null, null).toInt()
        val upHalf = StreamResampler.halfWidth(sampleRate, RnNoise.SAMPLE_RATE)
        val downHalf = StreamResampler.halfWidth(RnNoise.SAMPLE_RATE, sampleRate)
        val gU = StreamResampler.gcd(sampleRate, RnNoise.SAMPLE_RATE)
        val upP = intArrayOf(RnNoise.SAMPLE_RATE / gU, sampleRate / gU, upHalf)
        val downP = intArrayOf(sampleRate / gU, RnNoise.SAMPLE_RATE / gU, downHalf)
        return maxLookahead(sampleRate.toLong(), upP, downP).toInt()
    }

    private fun maxLookahead(period: Long, upP: IntArray?, downP: IntArray?): Long {
        var worst = 0L
        for (j in 0 until period) {
            // 48 kHz denoised samples the down-resampler reads for output j.
            val lastD = if (downP == null) j else StreamResampler.needInput(j, downP[0], downP[1], downP[2])
            // d[k] = RnNoise output k + 480, inside frame k/480 + 1.
            var needU = FRAME * (lastD / FRAME + 2) - 1
            // The weight needs smoothed VAD of frames f and f+1, i.e. raw VAD up to f+1+K.
            val f = j * 100 / sampleRate
            needU = maxOf(needU, FRAME * (f + 2 + VAD_HALF) - 1)
            val needX = if (upP == null) needU else StreamResampler.needInput(needU, upP[0], upP[1], upP[2])
            worst = maxOf(worst, needX - j)
        }
        return worst
    }

    // ------------------------------------------------------------------ per channel

    private inner class Channel(model: RnNoiseModel) {
        private val rn = RnNoise(model)
        private val upRs = if (native || bypass) null else StreamResampler(sampleRate, RnNoise.SAMPLE_RATE)
        private val downRs = if (native || bypass) null else StreamResampler(RnNoise.SAMPLE_RATE, sampleRate)

        private val ringSize: Int
        private val ringMask: Int
        private val dry: FloatArray
        private val den: FloatArray
        private var inCount = 0L // input samples received
        private var denCount = 0L // denoised samples (input rate) produced

        private val block = FloatArray(BLOCK)
        private val upBuf = FloatArray(upRs?.maxOutput(BLOCK) ?: 0)
        private val downBuf = FloatArray(downRs?.maxOutput(FRAME) ?: 0)
        private val frame = FloatArray(FRAME)
        private val rnOut = FloatArray(FRAME)
        private var frameFill = 0
        private var frames = 0L // RnNoise frames processed
        private val vad = FloatArray(VAD_RING)
        private val vadSmooth = FloatArray(VAD_RING)

        init {
            var size = 1
            while (size < latencyFrames + BLOCK + 64) size = size shl 1
            ringSize = size
            ringMask = size - 1
            dry = FloatArray(size)
            den = FloatArray(size)
        }

        fun reset() {
            rn.reset(); upRs?.reset(); downRs?.reset()
            dry.fill(0f); den.fill(0f); vad.fill(0f); vadSmooth.fill(0f)
            inCount = 0; denCount = 0; frameFill = 0; frames = 0
        }

        fun process(src: ShortArray, srcOff: Int, stride: Int, count: Int, dst: ShortArray, dstOff: Int) {
            var done = 0
            while (done < count) {
                val nb = min(BLOCK, count - done)
                for (i in 0 until nb) {
                    val v = src[srcOff + (done + i) * stride].toFloat()
                    block[i] = v
                    dry[((inCount + i) and ringMask.toLong()).toInt()] = v
                }
                if (!bypass) {
                    if (upRs != null) {
                        val nu = upRs.process(block, 0, nb, upBuf, 0)
                        feed48(upBuf, nu)
                    } else {
                        feed48(block, nb)
                    }
                }
                for (i in 0 until nb) {
                    val o = inCount + i - latencyFrames
                    val y = if (o < 0) 0f else output(o)
                    dst[dstOff + (done + i) * stride] = toShort(y)
                }
                inCount += nb
                done += nb
            }
        }

        private fun feed48(x: FloatArray, n: Int) {
            var i = 0
            while (i < n) {
                val take = min(FRAME - frameFill, n - i)
                System.arraycopy(x, i, frame, frameFill, take)
                frameFill += take
                i += take
                if (frameFill == FRAME) {
                    frameFill = 0
                    runFrame()
                }
            }
        }

        private fun runFrame() {
            val g = frames
            val p = rn.process(frame, 0, rnOut, 0)
            vad[(g and VAD_MASK).toInt()] = p
            frames++
            // Smoothed VAD of frame g-K = mean of raw VAD g-2K .. g (frames < 0 count as 0).
            val c = g - VAD_HALF
            if (c >= 0) {
                var sum = 0f
                for (d in -VAD_HALF..VAD_HALF) {
                    val idx = c + d
                    if (idx >= 0) sum += vad[(idx and VAD_MASK).toInt()]
                }
                vadSmooth[(c and VAD_MASK).toInt()] = sum / (2 * VAD_HALF + 1)
            }
            // The first output frame is the overlap tail before time 0: drop it.
            if (g == 0L) return
            if (downRs != null) {
                val nd = downRs.process(rnOut, 0, FRAME, downBuf, 0)
                pushDen(downBuf, nd)
            } else {
                pushDen(rnOut, FRAME)
            }
        }

        private fun pushDen(x: FloatArray, n: Int) {
            for (i in 0 until n) {
                den[((denCount + i) and ringMask.toLong()).toInt()] = x[i]
            }
            denCount += n
        }

        private fun output(o: Long): Float {
            val d = dry[(o and ringMask.toLong()).toInt()]
            if (bypass) return d
            check(denCount > o && inCount - o < ringSize) { "VoiceDenoiser latency underestimated" }
            val wet = den[(o and ringMask.toLong()).toInt()]
            // Position of o on the 48 kHz frame grid: frame f plus fraction a.
            val t100 = o * 100
            val f = t100 / sampleRate
            val a = (t100 - f * sampleRate).toFloat() / sampleRate
            check(frames >= f + 2 + VAD_HALF && frames - f < VAD_RING - 2 * VAD_HALF - 2) {
                "VoiceDenoiser VAD look-ahead underestimated"
            }
            val v0 = vadSmooth[(f and VAD_MASK).toInt()]
            val v1 = vadSmooth[((f + 1) and VAD_MASK).toInt()]
            val v = v0 + a * (v1 - v0)
            val k = (1.4f * v).coerceIn(0f, 1f)
            val w = wetPause + (wetSpeech - wetPause) * k
            return w * wet + (1f - w) * d
        }
    }

    private companion object {
        const val FRAME = RnNoise.FRAME_SIZE
        const val BLOCK = 480
        const val VAD_HALF = 5 // +-5 frames = +-50 ms
        const val VAD_RING = 128
        const val VAD_MASK = (VAD_RING - 1).toLong()

        fun toShort(v: Float): Short {
            val r = v.roundToInt()
            return (if (r > 32767) 32767 else if (r < -32768) -32768 else r).toShort()
        }
    }
}

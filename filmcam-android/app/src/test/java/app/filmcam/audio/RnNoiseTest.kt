package app.filmcam.audio

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.Random
import kotlin.math.abs
import kotlin.math.log10
import kotlin.math.sqrt

/**
 * Golden test against the C reference (RNNoise v0.1.1 examples/demo_vad.c: s16le in, the
 * processed frames after the first one as truncated s16le out, one float32 VAD per frame), plus
 * VoiceDenoiser behaviour and a speed check.
 *
 * Resources: rnnoise/in.raw is 3 s of 48 kHz noisy speech (150 ms of digital silence, then a
 * LibriSpeech clip with white + band-limited noise + 120 Hz hum); out.raw / vad.f32 are what
 * the C demo_vad produced from it.
 */
class RnNoiseTest {
    private val model: RnNoiseModel by lazy {
        val dir = File(System.getProperty("user.dir")!!)
        val f = listOf("src/main/assets/rnnoise/model.bin", "app/src/main/assets/rnnoise/model.bin")
            .map { dir.resolve(it) }.first { it.exists() }
        RnNoiseModel.load(f.readBytes())
    }

    private fun resource(name: String): ByteArray =
        javaClass.getResourceAsStream("/rnnoise/$name")!!.use { it.readBytes() }

    private fun shorts(b: ByteArray): ShortArray {
        val s = ShortArray(b.size / 2)
        ByteBuffer.wrap(b).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().get(s)
        return s
    }

    private fun floats(b: ByteArray): FloatArray {
        val f = FloatArray(b.size / 4)
        ByteBuffer.wrap(b).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer().get(f)
        return f
    }

    @Test
    fun matchesCReference() {
        val input = shorts(resource("in.raw"))
        val refOut = shorts(resource("out.raw"))
        val refVad = floats(resource("vad.f32"))
        val frames = input.size / RnNoise.FRAME_SIZE
        assertEquals(frames, refVad.size)
        assertEquals((frames - 1) * RnNoise.FRAME_SIZE, refOut.size)

        val rn = RnNoise(model)
        val x = FloatArray(RnNoise.FRAME_SIZE)
        val out = ShortArray(refOut.size)
        val vad = FloatArray(frames)
        for (f in 0 until frames) {
            for (i in 0 until RnNoise.FRAME_SIZE) x[i] = input[f * RnNoise.FRAME_SIZE + i].toFloat()
            vad[f] = rn.process(x, x)
            // demo_vad: tmp[i] = x[i] (C float -> short truncation), first frame not written.
            if (f > 0) for (i in 0 until RnNoise.FRAME_SIZE) out[(f - 1) * RnNoise.FRAME_SIZE + i] = x[i].toInt().toShort()
        }

        var diff2 = 0.0
        var sig2 = 0.0
        var maxDiff = 0
        var exact = 0
        for (i in refOut.indices) {
            val d = out[i] - refOut[i]
            diff2 += d.toDouble() * d
            sig2 += refOut[i].toDouble() * refOut[i]
            maxDiff = maxOf(maxDiff, abs(d))
            if (d == 0) exact++
        }
        val relRms = sqrt(diff2 / sig2)
        var vadMax = 0f
        var vadOk = 0
        for (f in 0 until frames) {
            val d = abs(vad[f] - refVad[f])
            vadMax = maxOf(vadMax, d)
            if (d <= 0.02f) vadOk++
        }
        println(
            "RNNoise golden: samples=${refOut.size} identical=${exact} (%.4f%%) maxAbsDiff=$maxDiff relRmsDiff=%.3e; "
                .format(100.0 * exact / refOut.size, relRms) +
                "VAD frames=$frames within0.02=$vadOk maxDiff=%.3e".format(vadMax),
        )
        // The port reproduces the float C build operation for operation, so the match is exact.
        assertArrayEquals("output samples", refOut, out)
        assertArrayEquals("VAD", refVad, vad, 0f)
    }

    // ------------------------------------------------------------------ VoiceDenoiser

    private fun runChunked(d: VoiceDenoiser, input: ShortArray, chunk: Int): ShortArray {
        val out = ShortArray(input.size)
        var off = 0
        while (off < input.size) {
            val n = minOf(chunk, input.size - off)
            val o = d.process(input, off, n)
            System.arraycopy(o, 0, out, off, n)
            off += n
        }
        return out
    }

    @Test
    fun impulseComesOutAfterExactlyLatencyFrames() {
        for ((rate, ch) in listOf(48000 to 1, 44100 to 2, 16000 to 1, 32000 to 2)) {
            val d = VoiceDenoiser(model, rate, ch, strength = 0f)
            val frames = rate // 1 s
            val input = ShortArray(frames * ch)
            val at = 1234
            for (c in 0 until ch) input[at * ch + c] = (10000 + c).toShort()
            val out = runChunked(d, input, 37) + d.flush()
            assertEquals((frames + d.latencyFrames) * ch, out.size)
            for (i in out.indices) {
                val expect = if (i / ch == at + d.latencyFrames) (10000 + i % ch).toShort() else 0
                assertEquals("rate $rate sample $i", expect, out[i])
            }
            println("VoiceDenoiser latency at $rate Hz: ${d.latencyFrames} frames (%.1f ms)".format(1000.0 * d.latencyFrames / rate))
        }
    }

    private fun noisySpeech(rate: Int, channels: Int, seconds: Double): ShortArray {
        // The golden 48 kHz clip read at another rate is fine for consistency tests.
        val src = shorts(resource("in.raw"))
        val frames = (rate * seconds).toInt()
        val out = ShortArray(frames * channels)
        for (i in 0 until frames) for (c in 0 until channels) {
            out[i * channels + c] = src[(i + 997 * c) % src.size]
        }
        return out
    }

    @Test
    fun chunkSizeIndependent() {
        for ((rate, ch) in listOf(48000 to 1, 44100 to 2, 16000 to 1)) {
            val input = noisySpeech(rate, ch, 3.0)
            val a = runChunked(VoiceDenoiser(model, rate, ch, 0.6f), input, 37)
            val b = runChunked(VoiceDenoiser(model, rate, ch, 0.6f), input, 4800)
            assertArrayEquals("rate $rate ch $ch chunks 37 vs 4800", a, b)
            if (rate == 16000) {
                // Sample-by-sample proves the latency covers every look-ahead (else it throws).
                val c = runChunked(VoiceDenoiser(model, rate, ch, 0.6f), input, 1)
                assertArrayEquals("rate $rate chunks 1 vs 4800", c, b)
            }
        }
    }

    @Test
    fun sampleBySampleAt44100Stereo() {
        val input = noisySpeech(44100, 2, 1.5)
        val a = runChunked(VoiceDenoiser(model, 44100, 2, 1f), input, 1)
        val b = runChunked(VoiceDenoiser(model, 44100, 2, 1f), input, 4410)
        assertArrayEquals(a, b)
    }

    /** Streams [x] through a resampler and returns the time-aligned result (output k = time k). */
    private fun resampleAll(x: FloatArray, from: Int, to: Int): FloatArray {
        if (from == to) return x.copyOf()
        val r = StreamResampler(from, to)
        val nOut = (x.size.toLong() * to / from).toInt()
        val pad = FloatArray(r.half + 2)
        val buf = FloatArray(r.maxOutput(x.size) + r.maxOutput(pad.size))
        var n = r.process(x, 0, x.size, buf, 0)
        n += r.process(pad, 0, pad.size, buf, n)
        assertTrue(n >= nOut)
        return buf.copyOf(nOut)
    }

    /** 2.5 s of clean LibriSpeech speech (RMS 3000) at [rate]. */
    private fun cleanSpeech(rate: Int): FloatArray {
        val s = shorts(resource("speech16k.raw"))
        return resampleAll(FloatArray(s.size) { s[it].toFloat() }, 16000, rate)
    }

    @Test
    fun resamplerRoundTripIsTransparentAndAligned() {
        for (rate in listOf(8000, 16000, 22050, 32000, 44100, 96000)) {
            val n = rate
            val band = minOf(rate, 48000) // tones must survive the 48 kHz stage
            val x = FloatArray(n) { i ->
                val t = i.toDouble() / rate
                (3000 * Math.sin(2 * Math.PI * 0.05 * band * t) + 2000 * Math.sin(2 * Math.PI * 0.13 * band * t + 1) +
                    1000 * Math.sin(2 * Math.PI * 0.31 * band * t + 2)).toFloat()
            }
            val y = resampleAll(resampleAll(x, rate, 48000), 48000, rate)
            var e = 0.0
            var p = 0.0
            for (i in n / 4 until 3 * n / 4) {
                e += (y[i] - x[i]).toDouble().let { it * it }
                p += x[i].toDouble() * x[i]
            }
            val db = 10 * log10(p / e)
            println("Resampler round trip $rate -> 48000 -> $rate: SNR %.1f dB".format(db))
            assertTrue("rate $rate round-trip SNR $db dB", db > 60)
        }
    }

    @Test
    fun denoisedPathIsAlignedWithDry() {
        // On clean speech RnNoise is close to transparent, so the wet output must line up with
        // the dry input at lag 0 (a misaligned wet path would comb-filter against the dry one).
        for (rate in listOf(48000, 44100, 16000)) {
            val sp = cleanSpeech(rate)
            val input = ShortArray(sp.size) { sp[it].toInt().toShort() }
            val d = VoiceDenoiser(model, rate, 1, 1f)
            val out = runChunked(d, input, 4800) + d.flush()
            val l = d.latencyFrames
            var bestLag = 0
            var best = Double.NEGATIVE_INFINITY
            for (lag in -8..8) {
                var s = 0.0
                for (i in rate / 4 until input.size - 16) s += input[i].toDouble() * out[i + l + lag]
                if (s > best) { best = s; bestLag = lag }
            }
            assertEquals("rate $rate best lag", 0, bestLag)
        }
    }

    @Test
    fun reducesWhiteNoise() {
        // 2.5 s of speech in white noise, then 2 s of the same noise alone; measure the last 1.5 s.
        for ((rate, ch) in listOf(48000 to 2, 44100 to 1, 44100 to 2)) {
            val sp = cleanSpeech(rate)
            val frames = rate * 9 / 2
            val rnd = Random(42L + rate + ch)
            val input = ShortArray(frames * ch)
            for (i in 0 until frames) for (c in 0 until ch) {
                val v = (if (i < sp.size) sp[i] else 0f) + rnd.nextGaussian() * 1000
                input[i * ch + c] = v.toInt().coerceIn(-32768, 32767).toShort()
            }
            val d = VoiceDenoiser(model, rate, ch, strength = 1f)
            val out = runChunked(d, input, 1000) + d.flush()
            val l = d.latencyFrames
            for (c in 0 until ch) {
                var ein = 0.0
                var eout = 0.0
                for (i in 3 * rate until frames) {
                    ein += input[i * ch + c].toDouble().let { it * it }
                    eout += out[(i + l) * ch + c].toDouble().let { it * it }
                }
                val db = 10 * log10(ein / eout)
                println("White noise reduction in the pause at $rate Hz, $ch ch, channel $c, strength 1: %.1f dB".format(db))
                assertTrue("only $db dB", db > 6.0)
            }
        }
    }

    @Test
    fun speed() {
        val src = shorts(resource("in.raw"))
        val seconds = 10
        val n = 48000 * seconds
        val x = FloatArray(n) { src[it % src.size].toFloat() }
        val frame = FloatArray(RnNoise.FRAME_SIZE)
        fun run(): Long {
            val rn = RnNoise(model)
            val t0 = System.nanoTime()
            var f = 0
            while (f + RnNoise.FRAME_SIZE <= n) {
                System.arraycopy(x, f, frame, 0, RnNoise.FRAME_SIZE)
                rn.process(frame, frame)
                f += RnNoise.FRAME_SIZE
            }
            return System.nanoTime() - t0
        }
        run() // JIT warm-up
        val ns = (0 until 3).minOf { run() }
        println("RnNoise speed: ${seconds} s of 48 kHz mono in %.1f ms (%.0fx real time)".format(ns / 1e6, seconds * 1e9 / ns))

        val pcm = ShortArray(44100 * seconds * 2) { src[(it / 2) % src.size] }
        runChunked(VoiceDenoiser(model, 44100, 2), pcm, 4410)
        val t0 = System.nanoTime()
        runChunked(VoiceDenoiser(model, 44100, 2), pcm, 4410)
        val vdNs = System.nanoTime() - t0
        println("VoiceDenoiser speed: ${seconds} s of 44.1 kHz stereo in %.1f ms".format(vdNs / 1e6))
        assertTrue("too slow: ${ns / 1e6} ms", ns < 2_000_000_000L)
    }
}

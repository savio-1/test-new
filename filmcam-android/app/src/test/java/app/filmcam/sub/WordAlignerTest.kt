package app.filmcam.sub

import org.json.JSONObject
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs

/**
 * The phone's word timing against the training code: the same letter probabilities from the
 * same weights, and words found where the hand alignment of the clip puts them.
 */
class WordAlignerTest {
    private fun res(name: String) = javaClass.classLoader!!.getResourceAsStream("align/$name")!!.use { it.readBytes() }
    private val model by lazy { AlignModel.load(File("src/main/assets/align/model.bin").readBytes()) }

    private fun pcm(): FloatArray {
        val sb = ByteBuffer.wrap(res("clip.raw")).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
        return FloatArray(sb.remaining()) { sb.get(it) / 32768f }
    }

    @Test fun matchesTheTrainingModel() {
        val lp = model.logProbs(pcm())
        val ref = ByteBuffer.wrap(res("emis.f32")).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer()
        val frames = ref.remaining() / AlignModel.VOCAB
        var worst = 0f
        var sumSq = 0.0
        val n = minOf(frames, lp.size)
        for (t in 0 until n) for (v in 0 until AlignModel.VOCAB) {
            // Only where the letter is at all likely: far-off log-probabilities don't matter.
            val r = ref.get(t * AlignModel.VOCAB + v)
            if (r < -12f) continue
            val d = abs(lp[t][v] - r)
            worst = maxOf(worst, d); sumSq += d * d
        }
        println("frames ${lp.size} vs $frames, worst ${"%.4f".format(worst)}")
        assertTrue("frame count ${lp.size} vs $frames", abs(lp.size - frames) <= 1)
        assertTrue("worst difference $worst", worst < 0.05f)
    }

    @Test fun wordsLandWhereTheyAreSaid() {
        val o = JSONObject(String(res("words.json")))
        val words = o.getJSONArray("words")
        val cuesJ = o.getJSONArray("cues")
        val cues = List(cuesJ.length()) { i ->
            val c = cuesJ.getJSONObject(i)
            Cue(c.getLong("start"), c.getLong("end"), "en", english = c.getString("text"))
        }
        val t0 = System.nanoTime()
        val track = WordAligner(model).align(pcm(), SubtitleTrack(cues))
        println("aligned ${pcm().size / 16000.0} s in ${(System.nanoTime() - t0) / 1e6} ms")
        val got = track.cues.flatMap { it.wordStarts }
        assertTrue("every word timed (${got.size} of ${words.length()})", got.size == words.length())
        var close = 0
        for (i in got.indices) {
            val gt = words.getJSONObject(i).getDouble("start") * 1000
            if (abs(got[i] - gt) < 100) close++
        }
        println("within 100 ms: $close of ${got.size}")
        assertTrue("$close of ${got.size} within 100 ms", close >= got.size * 0.85)
        // Kinetic captions use them.
        val ws = Kinetic.words(track).flatten()
        assertTrue(ws.map { it.startMs } == got.map { it - Kinetic.ANTICIPATE_MS })
    }
}

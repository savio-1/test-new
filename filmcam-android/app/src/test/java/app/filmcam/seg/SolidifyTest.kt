package app.filmcam.seg

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SolidifyTest {
    private fun at(m: ByteArray, w: Int, x: Int, y: Int) = m[y * w + x].toInt() and 0xFF

    @Test fun hairStrandsCountAndTheHairZoneGrows() {
        val w = 256; val h = 256
        val hair = ByteArray(w * h)
        // A head of hair: confident in the middle, faint flyaway strands round it.
        for (y in 0 until h) for (x in 0 until w) {
            val d = Math.hypot((x - 128).toDouble(), (y - 100).toDouble())
            hair[y * w + x] = when { d < 40 -> 255; d < 46 -> 110; else -> 0 }.toByte()
        }
        val out = SubjectMasker.hairZone(hair, null, w, h)
        assertEquals(255, at(out, w, 128, 100))
        assertTrue("strands count", at(out, w, 128 + 43, 100) > 0.7 * 255)
        assertTrue("the zone grows", at(out, w, 128 + 47, 100) > 0.7 * 255)
        assertTrue("only a little", at(out, w, 128 + 50, 100) < 0.1 * 255)
        assertEquals(0, at(out, w, 10, 10))
    }

    @Test fun theLastHairZoneIsHeldFaintly() {
        val w = 64; val h = 64
        val prev = ByteArray(w * h) { if (it % w < 20) 255.toByte() else 0 }
        val out = SubjectMasker.hairZone(ByteArray(w * h), prev, w, h)
        assertTrue(at(out, w, 5, 5) in 140..160)
        assertEquals(0, at(out, w, 50, 5))
    }
}

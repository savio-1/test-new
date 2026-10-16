package app.filmcam.seg

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SubjectTrackerTest {
    private val w = 160
    private val h = 120

    private fun frame(vararg discs: Triple<Int, Int, Int>): BooleanArray = BooleanArray(w * h) { i ->
        val x = i % w
        val y = i / w
        discs.any { (cx, cy, r) -> (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r }
    }

    private fun BooleanArray.at(x: Int, y: Int) = this[y * w + x]

    @Test fun followsAMovingSubject() {
        val t = SubjectTracker(20f / w, 60f / h)
        for (f in 0 until 60) {
            val cx = 20 + f * 2
            val region = t.follow(frame(Triple(cx, 60, 12)), w, h)
            assertNotNull("frame $f", region)
            assertTrue("frame $f", region!!.at(cx, 60))
        }
    }

    @Test fun staysOnThePickedOneOfTwo() {
        // Two people walk towards each other, pass close (not touching) and walk on.
        val t = SubjectTracker(20f / w, 40f / h)
        for (f in 0 until 50) {
            val a = 20 + f * 2           // the picked one, left to right, upper lane
            val b = 140 - f * 2          // the other, right to left, lower lane
            val region = t.follow(frame(Triple(a, 40, 10), Triple(b, 80, 10)), w, h)!!
            assertTrue("frame $f picked", region.at(a, 40))
            assertFalse("frame $f other", region.at(b, 80))
        }
    }

    @Test fun findsItAgainAfterLosingIt() {
        val t = SubjectTracker(60f / w, 60f / h)
        assertNotNull(t.follow(frame(Triple(60, 60, 12)), w, h))
        repeat(10) { assertNull(t.follow(frame(), w, h)) }
        val region = t.follow(frame(Triple(66, 60, 12)), w, h)
        assertNotNull(region)
        assertTrue(region!!.at(66, 60))
    }

    @Test fun regionsAndDilation() {
        val m = frame(Triple(30, 30, 5), Triple(100, 80, 5))
        val (labels, sizes) = Regions.label(m, w, h)
        assertEquals(3, sizes.size)
        assertTrue(labels[30 * w + 30] != labels[80 * w + 100])
        val d = Regions.dilate(BooleanArray(w * h).also { it[50 * w + 50] = true }, w, h, 2)
        assertEquals(25, d.count { it })
        assertTrue(d[52 * w + 52])
        assertFalse(d[53 * w + 50])
    }
}

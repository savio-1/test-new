package app.filmcam.film

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TextAnimTest {
    @Test fun stillsShowTextAtRest() {
        for (a in TextAnim.entries) assertEquals(a.name, TextPose.REST, a.pose(-1f, 42L, 10))
        assertEquals(TextPose.REST, TextAnim.NONE.pose(3.7f, 42L, 10))
    }

    @Test fun stopMotionHoldsEachPoseForAFrame() {
        // 12 poses a second: two moments inside the same twelfth agree, the next one differs.
        val a = TextAnim.WIGGLE.pose(1.001f, 7L, 5)
        val b = TextAnim.WIGGLE.pose(1.07f, 7L, 5)
        val c = TextAnim.WIGGLE.pose(1.09f, 7L, 5)
        assertEquals(a, b)
        assertNotEquals(a, c)
        // And replaying gives the same poses (the export matches the preview).
        assertEquals(c, TextAnim.WIGGLE.pose(1.09f, 7L, 5))
        assertTrue(kotlin.math.abs(a.rotation) <= 4f)
    }

    @Test fun layersWiggleOutOfStep() {
        assertNotEquals(TextAnim.JIGGLE.pose(2.5f, 1L, 5), TextAnim.JIGGLE.pose(2.5f, 2L, 5))
    }

    @Test fun smoothOnesMoveSmoothly() {
        val spin = TextAnim.SPIN.pose(1f, 0L, 3).rotation
        assertEquals(90f, spin, 0.01f)
        val float0 = TextAnim.FLOAT.pose(0f, 0L, 3).dy
        val float1 = TextAnim.FLOAT.pose(0.01f, 0L, 3).dy
        assertTrue(kotlin.math.abs(float1 - float0) < 0.01f)
    }

    @Test fun typewriterTypesThenStartsAgain() {
        assertEquals(0, TextAnim.TYPEWRITER.pose(0f, 0L, 10).chars)
        assertEquals(5, TextAnim.TYPEWRITER.pose(0.46f, 0L, 10).chars)
        assertEquals(10, TextAnim.TYPEWRITER.pose(1.5f, 0L, 10).chars)
        // 10 letters at 0.09 s, then 1.6 s of the whole line: the loop is 2.5 s.
        assertEquals(0, TextAnim.TYPEWRITER.pose(2.51f, 0L, 10).chars)
    }

    @Test fun lineSpacingAndAnimationAreSaved() {
        val layer = TextLayer(id = 3, text = "a\nb", lineSpacing = 1.4f, anim = TextAnim.FLOAT)
        val back = TextLayer.fromJson(layer.toJson())
        assertEquals(1.4f, back.lineSpacing, 1e-6f)
        assertEquals(TextAnim.FLOAT, back.anim)
        // Layers saved before these existed load at rest, with normal spacing.
        val old = TextLayer.fromJson(org.json.JSONObject().put("text", "x"))
        assertEquals(1f, old.lineSpacing, 0f)
        assertEquals(TextAnim.NONE, old.anim)
    }
}

package app.filmcam.film

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class CubeLutTest {
    /** An identity .cube of [n] points per side (red fastest), optionally with a domain. */
    private fun identity(n: Int, header: String = ""): String = buildString {
        append("# made by a test\nTITLE \"Identity\"\nLUT_3D_SIZE $n\n").append(header)
        for (b in 0 until n) for (g in 0 until n) for (r in 0 until n) {
            append("%.6f %.6f %.6f\n".format(r / (n - 1f), g / (n - 1f), b / (n - 1f)))
        }
    }

    @Test fun identityStaysIdentity() {
        val lut = CubeLut.parse(identity(17))
        assertEquals("Identity", lut.title)
        val o = FloatArray(3)
        for ((r, g, b) in listOf(Triple(0.1f, 0.5f, 0.9f), Triple(1f, 0f, 0.33f), Triple(0.77f, 0.77f, 0.2f))) {
            lut.sample(r, g, b, o)
            assertEquals(r, o[0], 1e-4f); assertEquals(g, o[1], 1e-4f); assertEquals(b, o[2], 1e-4f)
        }
    }

    @Test fun stripIsLaidOutAsTheShaderReadsIt() {
        val px = CubeLut.parse(identity(2)).toStrip()
        assertEquals(33 * 33 * 33, px.size)
        fun at(r: Int, g: Int, b: Int) = px[g * 33 * 33 + b * 33 + r]
        assertEquals(0xFFFF0000.toInt(), at(32, 0, 0))     // pure red in, pure red out
        assertEquals(0xFF00FF00.toInt(), at(0, 32, 0))
        assertEquals(0xFF0000FF.toInt(), at(0, 0, 32))
        assertEquals(0xFF808080.toInt(), at(16, 16, 16))          // 0.5 -> 128
    }

    @Test fun redChangesFastestInTheFile() {
        // A 2-point LUT whose output is red-only where the file's first index (red) is 1.
        val text = "LUT_3D_SIZE 2\n" + listOf("0 0 0", "1 0 0", "0 0 0", "0 0 0", "0 0 0", "0 0 0", "0 0 0", "0 0 0").joinToString("\n")
        val o = FloatArray(3)
        CubeLut.parse(text).sample(1f, 0f, 0f, o)
        assertEquals(1f, o[0], 1e-6f)
        CubeLut.parse(text).sample(0f, 1f, 0f, o)
        assertEquals(0f, o[0], 1e-6f)
    }

    @Test fun honoursTheDomain() {
        // Domain 0..2: an input of 1.0 sits half-way along the axis.
        val lut = CubeLut.parse(identity(3, "DOMAIN_MIN 0 0 0\nDOMAIN_MAX 2 2 2\n"))
        val o = FloatArray(3)
        lut.sample(1f, 1f, 1f, o)
        assertEquals(0.5f, o[0], 1e-4f)
    }

    @Test fun refusesWhatItCantUse() {
        for ((text, why) in listOf(
            "LUT_1D_SIZE 1024\n0 0 0" to "1D",
            "LUT_3D_SIZE 2\n0 0 0\n1 1 1" to "Expected 8 rows",
            "0 0 0\n1 1 1" to "No LUT_3D_SIZE",
            "hello" to "Not a 3D",
        )) {
            try {
                CubeLut.parse(text)
                fail("parsed: $why")
            } catch (e: CubeException) {
                assertTrue("${e.message} should mention $why", e.message!!.contains(why))
            }
        }
    }

    @Test fun customLookIsRegistered() {
        val cam = FilmCameras.byId("cu_sleepycharlie")
        assertEquals(CameraCategory.CUSTOM, cam.category)
        assertEquals("cu_sleepycharlie", cam.look.stock.id)
        assertTrue(FilmStocks.ALL.any { it.id == "cu_sleepycharlie" })
    }
}

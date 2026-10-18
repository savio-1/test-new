package app.filmcam.film

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class FontMetaTest {
    private fun faces(name: String) = FontMeta.read(File("src/main/assets/fonts/$name").readBytes())

    @Test fun staticFontsGiveFamilyAndStyle() {
        val f = faces("InstrumentSerif-Italic.ttf").single()
        assertEquals("Instrument Serif", f.family)
        assertEquals("Italic", f.style)
        assertTrue(f.italic)
        val p = faces("Poppins-Bold.ttf").single()
        assertEquals("Poppins", p.family)
        assertEquals(700, p.weight)
    }

    @Test fun variableFontsListTheirNamedInstances() {
        val all = faces("InterTight.ttf")
        println(all.joinToString("\n"))
        assertTrue(all.size > 1)
        assertTrue(all.all { it.family == "Inter Tight" })
        val bold = all.first { it.style == "Bold" }
        assertEquals(700, bold.weight)
        assertTrue(bold.variation!!.contains("'wght' 700"))
    }
}

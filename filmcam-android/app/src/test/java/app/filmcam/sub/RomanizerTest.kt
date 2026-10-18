package app.filmcam.sub

import org.junit.Assert.assertEquals
import org.junit.Test

class RomanizerTest {
    /** The same spellings as the alignment model's training romaniser (uroman) gives. */
    private val cases = listOf(
        "ఎలా" to "elaa",
        "ఉన్నారు" to "unnaaru",
        "మనం" to "manam",
        "బీచ్‌కి" to "biicki",
        "వెళ్తున్నాం" to "velltunnaam",
        "అధ్యక్షుడు" to "adhyakssuddu",
        "ప్రకటనతో" to "prakattanatoo",
        "దుః" to "duh",
        "తెలుగు" to "telugu",
        "Hello," to "hello",
        "don't" to "don't",
        "2024" to "twothousandtwentyfour",
        "5" to "five",
        "“question”" to "question",
        "౧౨" to "twelve",
    )

    @Test fun spellsLikeTheTrainingRomaniser() {
        for ((w, r) in cases) assertEquals(w, r, Romanizer.roman(w))
    }
}

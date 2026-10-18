package app.filmcam.sub

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class KineticTest {
    private val cues = listOf(
        Cue(0, 3200, "en", "You know “the one question” that every single guest on my podcast struggles with?"),
        Cue(3300, 5600, "en", "And I think I know why, but I've never said it out loud."),
        Cue(5700, 8200, "en", "My best performing viral videos were just random ideas."),
    )

    private fun track(style: SubtitleStyle = SubtitleStyle()) = SubtitleTrack(cues, style)

    private fun texts(t: SubtitleTrack) = Kinetic.phrases(t).map { p -> p.words.joinToString(" ") { it.text } }

    @Test fun wordsAreTimedInOrderInsideTheirCue() {
        for ((ci, ws) in Kinetic.words(track()).withIndex()) {
            val c = cues[ci]
            assertEquals(c.english.split(" ").size, ws.size)
            ws.zipWithNext().forEach { (a, b) -> assertTrue(a.startMs <= b.startMs && a.endMs <= b.startMs + 1) }
            assertTrue(ws.first().startMs >= c.startMs && ws.last().endMs <= c.endMs)
            // Longer words get longer.
            val q = ws.first { it.text.startsWith("question") || it.text.startsWith("performing") || it.text.startsWith("never") }
            val short = ws.first { it.text.length <= 2 }
            assertTrue(q.endMs - q.startMs > short.endMs - short.startMs)
        }
    }

    @Test fun phrasesBreakLikeAnEditorWould() {
        val p = texts(track(SubtitleStyle(template = CaptionTemplate.SCATTER)))
        // A quotation is its own phrase; key words close phrases; "with?" stays with its verb.
        assertEquals("You know", p[0])
        assertEquals("“the one question”", p[1])
        assertTrue(p.toString(), p.contains("on my podcast"))
        assertTrue(p.toString(), p.contains("struggles with?"))
        assertTrue(p.all { it.split(" ").size <= 3 })
        // Every word appears once, in order.
        assertEquals(cues.joinToString(" ") { it.english }, p.joinToString(" "))
    }

    @Test fun phrasesHoldUntilTheNextAndNeverOverlap() {
        val ps = Kinetic.phrases(track())
        ps.zipWithNext().forEach { (a, b) -> assertTrue(a.endMs <= b.startMs); assertTrue(a.endMs > a.startMs) }
    }

    @Test fun scatterKeepsWordsInFrameWithABigAndSmallWords() {
        val t = track(SubtitleStyle(template = CaptionTemplate.SCATTER))
        for (p in Kinetic.phrases(t)) {
            val placed = Kinetic.place(t, p, 9f / 16f, null)
            assertEquals(p.words.size, placed.size)
            assertEquals(1, placed.count { it.big })
            for (w in placed) {
                assertTrue("${w.word.text} x ${w.x}", w.x in 0.02f..0.98f)
                assertTrue("${w.word.text} y ${w.y}", w.y in 0.05f..0.95f)
            }
            if (placed.size > 1) {
                val big = placed.first { it.big }
                placed.filter { !it.big }.forEach { assertTrue(it.size < big.size * 0.8f) }
            }
        }
    }

    @Test fun consecutivePhrasesLandInDifferentSpots() {
        val t = track(SubtitleStyle(template = CaptionTemplate.SCATTER))
        val plan = Kinetic.plan(t)
        plan.slots.toList().zipWithNext().forEach { (a, b) -> assertTrue(a != b) }
        assertTrue("uses several spots", plan.slots.toSet().size >= 4)
    }

    @Test fun behindIsAMixNeverAll() {
        val t = track(SubtitleStyle(template = CaptionTemplate.SCATTER, behindSubject = true))
        val placed = Kinetic.phrases(t).flatMap { Kinetic.place(t, it, 9f / 16f, null) }
        val behind = placed.count { it.behind }
        assertTrue("some behind ($behind)", behind >= 2)
        assertTrue("most in front", behind < placed.size / 2)
        // Only big words go behind (small ones would vanish entirely), and only high up.
        placed.filter { it.behind }.forEach { assertTrue(it.big); assertTrue(it.y < 0.3f) }
        // Off: nothing behind.
        val off = track(SubtitleStyle(template = CaptionTemplate.SCATTER))
        assertEquals(0, Kinetic.phrases(off).flatMap { Kinetic.place(off, it, 9f / 16f, null) }.count { it.behind })
    }

    @Test fun wordsComeInAndPhrasesGo() {
        val t = track(SubtitleStyle(template = CaptionTemplate.SCATTER))
        // A phrase on screen long enough to settle before it goes.
        val first = Kinetic.phrases(t).first { it.endMs - it.words.first().startMs > 900 }.words.first()
        assertTrue(Kinetic.layersAt(t, first.startMs - 1, 9f / 16f, null).isEmpty())
        val entering = Kinetic.layersAt(t, first.startMs + 60, 9f / 16f, null).first { it.text == first.text }
        assertTrue(entering.reveal < 1f && entering.blur > 0f)
        val settled = Kinetic.layersAt(t, first.startMs + Kinetic.IN_MS + 50, 9f / 16f, null).first { it.text == first.text }
        assertEquals(1f, settled.reveal, 1e-3f)
        assertEquals(0f, settled.blur, 1e-3f)
        // After the last phrase, nothing.
        assertTrue(Kinetic.layersAt(t, 20_000, 9f / 16f, null).isEmpty())
    }

    @Test fun editsOverrideTheTemplateAndSurviveSaving() {
        val t0 = track(SubtitleStyle(template = CaptionTemplate.SCATTER))
        val w = Kinetic.words(t0)[0][1]   // "know"
        val t = t0.withEdit(w.id, WordEdit(text = w.text, x = 0.3f, y = 0.8f, color = 0xFFFF0000.toInt(), depth = WordDepth.BEHIND, anim = WordAnim.POP))
        val p = Kinetic.phrases(t).first { ph -> ph.words.any { it.id == w.id } }
        val placed = Kinetic.place(t, p, 9f / 16f, null).first { it.word.id == w.id }
        assertEquals(0.3f, placed.x, 1e-6f)
        assertEquals(0.8f, placed.y, 1e-6f)
        assertEquals(0xFFFF0000.toInt(), placed.color)
        assertTrue(placed.behind)
        val back = SubtitleTrack.fromJson(t.toJson())
        assertEquals(t.edits, back.edits)
        assertEquals(t.style, back.style)
        // Retyping the word drops the edit for it.
        val retyped = t.copy(cues = t.cues.toMutableList().also { it[0] = it[0].copy(english = it[0].english.replace("know", "see")) })
        val again = Kinetic.place(retyped, Kinetic.phrases(retyped).first(), 9f / 16f, null).first { it.word.id == w.id }
        assertTrue(again.x != 0.3f || again.y != 0.8f)
    }

    @Test fun everyTemplateShowsEveryWordAtSomePoint() {
        for (tpl in CaptionTemplate.entries.filter { it != CaptionTemplate.CLASSIC }) {
            val t = track(SubtitleStyle(template = tpl, behindSubject = true))
            val seen = HashSet<String>()
            var ms = 0L
            while (ms < 9000) { Kinetic.layersAt(t, ms, 9f / 16f, null).forEach { seen += it.text.lowercase() }; ms += 33 }
            val all = cues.flatMap { it.english.split(" ") }.map { it.lowercase() }.toSet()
            assertEquals("$tpl", all, seen)
        }
    }

    @Test fun oldTracksStayClassic() {
        val o = org.json.JSONObject().put("cues", org.json.JSONArray()).put("style", org.json.JSONObject().put("size", 0.05))
        assertEquals(CaptionTemplate.CLASSIC, SubtitleTrack.fromJson(o).style.template)
        assertEquals(CaptionTemplate.SCATTER, SubtitleStyle().template)
    }
}

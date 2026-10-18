package app.filmcam.sub

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SubtitlesTest {
    @Test fun parsesAModelReply() {
        val reply = """```json
            {"cues":[
              {"start":0.4,"end":2.9,"language":"te","spoken":"ఎలా ఉన్నావు?","english":"How are you?","telugu":""},
              {"start":"00:03.1","end":"5.0s","language":"en","spoken":"I'm good","english":"","telugu":"నేను బాగున్నాను"}
            ]}
            ```"""
        val cues = GeminiTranscriber.parseCues(reply)
        assertEquals(2, cues.size)
        assertEquals(400L, cues[0].startMs)
        assertEquals("ఎలా ఉన్నావు?", cues[0].telugu)          // the spoken Telugu fills the Telugu line
        assertEquals("How are you?", cues[0].english)
        assertEquals(3100L, cues[1].startMs)
        assertEquals(5000L, cues[1].endMs)
        assertEquals("I'm good", cues[1].english)              // the spoken English fills the English line
    }

    @Test fun parsesABareArray() {
        val cues = GeminiTranscriber.parseCues("""[{"start":1,"end":2,"language":"en","spoken":"Hi","english":"Hi","telugu":"హాయ్"}]""")
        assertEquals(1, cues.size)
        assertEquals("హాయ్", cues[0].telugu)
    }

    @Test fun cleansOverlapsAndShortCues() {
        val raw = listOf(
            Cue(5000, 6000, english = "b"),
            Cue(1000, 1200, english = "a"),          // too short: grows to 0.7 s
            Cue(5500, 9000, english = "c"),          // overlaps b: b ends where c starts
            Cue(9500, 99_000, english = "d"),        // past the end of the clip
            Cue(2000, 3000),                         // empty: dropped
        )
        val c = SubtitleTrack.clean(raw, durationMs = 12_000)
        assertEquals(listOf("a", "b", "c", "d"), c.map { it.english })
        assertEquals(1700L, c[0].endMs)
        assertEquals(5500L, c[1].endMs)
        assertEquals(12_000L, c[3].endMs)
        for (i in 1 until c.size) assertTrue(c[i].startMs >= c[i - 1].endMs)
    }

    @Test fun writesSrt() {
        val t = SubtitleTrack(listOf(Cue(1500, 3250, "te", "Hello", "హలో"), Cue(3_661_001, 3_662_000, "en", "Bye", "బై")))
        val srt = t.toSrt(SubtitleLanguage.BOTH)
        assertEquals("1\n00:00:01,500 --> 00:00:03,250\nహలో\nHello\n\n2\n01:01:01,001 --> 01:01:02,000\nబై\nBye\n\n", srt)
        assertTrue(t.toSrt(SubtitleLanguage.TELUGU).contains("\nహలో\n"))
    }

    @Test fun parsesTimes() {
        assertEquals(3200L, SubtitleTrack.parseTime(3.2))
        assertEquals(3200L, SubtitleTrack.parseTime("3.2"))
        assertEquals(63_500L, SubtitleTrack.parseTime("01:03.5"))
        assertEquals(3_723_250L, SubtitleTrack.parseTime("1:02:03,250"))
    }

    @Test fun picksTheCueShowingAndStacksBothLanguages() {
        val t = SubtitleTrack(listOf(Cue(0, 2000, english = "One", telugu = "ఒకటి")), SubtitleStyle(template = CaptionTemplate.CLASSIC, language = SubtitleLanguage.BOTH))
        val layers = t.layersAt(1000, 9f / 16f, null)
        assertEquals(listOf("ఒకటి", "One"), layers.map { it.text })
        assertTrue(layers[0].y < layers[1].y)                  // Telugu above English
        assertTrue(layers.all { it.y in 0f..1f && it.wrap > 0f })
        assertTrue(t.layersAt(2500, 1f, null).isEmpty())
    }

    @Test fun placesTheBlockByItsEdgeOrCentre() {
        fun track(x: Float, align: app.filmcam.film.TextAlign) =
            SubtitleTrack(listOf(Cue(0, 2000, english = "Hello")), SubtitleStyle(template = CaptionTemplate.CLASSIC, x = x, y = 0.5f, align = align))
        // Without fonts a line is taken as 0.6 of the frame wide.
        val left = track(0.05f, app.filmcam.film.TextAlign.LEFT).layersAt(500, 1f, null).single()
        assertEquals(0.05f, left.x - 0.3f, 1e-4f)                     // left edge on the anchor
        assertEquals(app.filmcam.film.TextAlign.LEFT, left.align)
        val right = track(0.95f, app.filmcam.film.TextAlign.RIGHT).layersAt(500, 1f, null).single()
        assertEquals(0.95f, right.x + 0.3f, 1e-4f)                    // right edge on the anchor
        assertEquals(0.5f, track(0.5f, app.filmcam.film.TextAlign.CENTER).layersAt(500, 1f, null).single().x, 1e-4f)
        // Dragged past the edge, the block stays inside the frame.
        val off = SubtitleTrack(listOf(Cue(0, 2000, english = "Hello")), SubtitleStyle(template = CaptionTemplate.CLASSIC, x = 1f, y = 0f)).layersAt(500, 1f, null).single()
        assertTrue(off.x + 0.3f <= 1f && off.y - 0.045f * 1.4f / 2 >= 0f)
    }

    @Test fun backgroundsBecomeBoxOutlineOrShadow() {
        fun layer(b: SubtitleBackground) = SubtitleTrack(listOf(Cue(0, 2000, english = "Hi")),
            SubtitleStyle(template = CaptionTemplate.CLASSIC, background = b, backColor = 0xFF102030.toInt(), backOpacity = 0.5f, color = 0xFFFFE14D.toInt())).layersAt(0, 1f, null).single()
        val box = layer(SubtitleBackground.BOX)
        assertTrue(box.box && !box.shadow && box.outline == 0)
        assertEquals(0x7F102030, box.boxColor)                        // the colour at half opacity
        assertEquals(0xFFFFE14D.toInt(), box.color)
        val outline = layer(SubtitleBackground.OUTLINE)
        assertTrue(!outline.box && outline.outline == 0xFF102030.toInt())
        assertTrue(layer(SubtitleBackground.SHADOW).shadow)
        val none = layer(SubtitleBackground.NONE)
        assertTrue(!none.box && !none.shadow && none.outline == 0)
    }

    @Test fun stylesSurviveSavingAndOldTracksLoad() {
        val st = SubtitleStyle(language = SubtitleLanguage.TELUGU, x = 0.2f, y = 0.3f, align = app.filmcam.film.TextAlign.LEFT,
            color = 0xFF4DD9FF.toInt(), background = SubtitleBackground.OUTLINE, backColor = 0xFF7A2BD9.toInt(), backOpacity = 0.9f, size = 0.06f)
        assertEquals(st, SubtitleStyle.fromJson(st.toJson()))
        // Saved before there was a choice of background: a box flag.
        assertEquals(SubtitleBackground.SHADOW, SubtitleStyle.fromJson(org.json.JSONObject("""{"box":false,"y":0.12}""")).background)
        val old = SubtitleStyle.fromJson(org.json.JSONObject("""{"box":true,"y":0.12}"""))
        assertEquals(SubtitleBackground.BOX, old.background)
        assertEquals(0.5f, old.x)
        assertEquals(0.12f, old.y, 1e-6f)
    }

    @Test fun decimatesTo16k() {
        val d = Decimator(48_000, 16_000)
        // 480 samples (10 ms) of a constant level, split across two blocks.
        val pcm = java.nio.ByteBuffer.allocate(960).order(java.nio.ByteOrder.LITTLE_ENDIAN)
        repeat(480) { pcm.putShort(1000) }
        val a = d.process(pcm, 0, 302)        // an odd split point: 151 samples
        val b = d.process(pcm, 302, 658)      // the other 329
        val all = java.nio.ByteBuffer.wrap(a + b).order(java.nio.ByteOrder.LITTLE_ENDIAN)
        assertEquals(160, (a.size + b.size) / 2)
        repeat(160) { assertEquals(1000.toShort(), all.short) }
        // 44.1 kHz comes down too.
        val d2 = Decimator(44_100, 16_000)
        val n = d2.process(java.nio.ByteBuffer.allocate(882 * 2), 0, 882 * 2).size / 2
        assertTrue(n in 319..321)
    }

    @Test fun adtsHeader() {
        // AAC-LC, 44.1 kHz (index 4), stereo, 371-byte frame: the canonical header.
        val h = AudioExtract.adtsHeader(371, objectType = 2, freqIndex = 4, channels = 2)
        assertArrayEquals(byteArrayOf(0xFF.toByte(), 0xF1.toByte(), 0x50, 0x80.toByte(), 0x2F, 0x5F, 0xFC.toByte()), h)
    }
}

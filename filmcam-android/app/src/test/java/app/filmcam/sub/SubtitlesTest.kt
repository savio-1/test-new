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
        val t = SubtitleTrack(listOf(Cue(0, 2000, english = "One", telugu = "ఒకటి")), SubtitleStyle(language = SubtitleLanguage.BOTH))
        val layers = t.layersAt(1000, 9f / 16f, null)
        assertEquals(listOf("ఒకటి", "One"), layers.map { it.text })
        assertTrue(layers[0].y < layers[1].y)                  // Telugu above English
        assertTrue(layers.all { it.y in 0f..1f && it.wrap > 0f })
        assertTrue(t.layersAt(2500, 1f, null).isEmpty())
    }

    @Test fun adtsHeader() {
        // AAC-LC, 44.1 kHz (index 4), stereo, 371-byte frame: the canonical header.
        val h = AudioExtract.adtsHeader(371, objectType = 2, freqIndex = 4, channels = 2)
        assertArrayEquals(byteArrayOf(0xFF.toByte(), 0xF1.toByte(), 0x50, 0x80.toByte(), 0x2F, 0x5F, 0xFC.toByte()), h)
    }
}

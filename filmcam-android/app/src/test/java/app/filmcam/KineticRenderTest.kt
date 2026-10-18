package app.filmcam

import android.graphics.BitmapFactory
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import app.filmcam.film.FontLibrary
import app.filmcam.film.TextRenderer
import app.filmcam.sub.CaptionTemplate
import app.filmcam.sub.Cue
import app.filmcam.sub.SubtitleStyle
import app.filmcam.sub.SubtitleTrack
import app.filmcam.sub.WordAnim
import org.junit.Rule
import org.junit.Test

/**
 * Kinetic captions drawn by the real renderer and fonts over a frame of a talking-head clip,
 * at twelve moments, to judge the templates (./gradlew recordPaparazziDebug). Text set behind
 * the subject is composited as the engine does (behind words, then the person, then the
 * rest), with a hand-traced silhouette standing in for the phone's segmentation.
 */
class KineticRenderTest {
    @get:Rule
    val paparazzi = Paparazzi(deviceConfig = DeviceConfig.PIXEL_6, maxPercentDifference = 1.0)

    private val cues = listOf(
        Cue(0, 3200, "en", "You know “the one question” that every single guest on my podcast struggles with?"),
        Cue(3300, 5600, "en", "And I think I know why, but I've never said it out loud."),
        Cue(5700, 8200, "en", "My best performing viral videos were just random ideas."),
    )

    /** The person in kinetic_bg1.jpg (540 x 982): head and hair, neck, shoulders and body. */
    private fun silhouette(sx: Float, sy: Float) = Path().apply {
        addOval(Rect(140f * sx, 220f * sy, 375f * sx, 470f * sy))
        moveTo(215f * sx, 430f * sy); lineTo(320f * sx, 430f * sy); lineTo(330f * sx, 470f * sy)
        lineTo(470f * sx, 500f * sy); lineTo(520f * sx, 620f * sy); lineTo(530f * sx, 982f * sy)
        lineTo(0f, 982f * sy); lineTo(30f * sx, 560f * sy); lineTo(70f * sx, 490f * sy)
        lineTo(205f * sx, 465f * sy); close()
    }

    private fun grid(style: SubtitleStyle, times: List<Long>) {
        val bg = javaClass.classLoader!!.getResourceAsStream("kinetic_bg1.jpg").use { BitmapFactory.decodeStream(it) }.asImageBitmap()
        val track = SubtitleTrack(cues, style)
        val fonts = FontLibrary(paparazzi.context)
        paparazzi.snapshot {
            Canvas(Modifier.fillMaxSize().background(Color.Black)) {
                val cols = 4
                val cw = size.width / cols
                val ch = cw * bg.height / bg.width
                times.forEachIndexed { k, t ->
                    val ox = (k % cols) * cw
                    val oy = (k / cols) * (ch + 4f)
                    translate(ox, oy) {
                        val dst = IntSize(cw.toInt(), ch.toInt())
                        drawImage(bg, IntOffset.Zero, IntSize(bg.width, bg.height), IntOffset.Zero, dst)
                        val layers = track.layersAt(t, bg.width.toFloat() / bg.height, fonts)
                        drawIntoCanvas { c -> TextRenderer.draw(c.nativeCanvas, layers.filter { it.behind }, fonts, cw, ch) }
                        // The subject passes in front of the words set behind it.
                        clipPath(silhouette(cw / bg.width, ch / bg.height)) {
                            drawImage(bg, IntOffset.Zero, IntSize(bg.width, bg.height), IntOffset.Zero, dst)
                        }
                        drawIntoCanvas { c -> TextRenderer.draw(c.nativeCanvas, layers.filter { !it.behind }, fonts, cw, ch) }
                        drawRect(Color.Black, Offset(0f, ch - 22f), Size(110f, 22f))
                        drawIntoCanvas { c ->
                            c.nativeCanvas.drawText("%.2fs".format(t / 1000f), 6f, ch - 6f,
                                android.graphics.Paint().apply { color = android.graphics.Color.WHITE; textSize = 16f })
                        }
                    }
                }
            }
        }
    }

    /**
     * Full-size frames written to build/kinetic/<name>/f0000.png ... for [fromMs]..[toMs] at
     * [fps], to review the motion as a video (ffmpeg) rather than in a shrunk snapshot.
     */
    private fun frames(name: String, style: SubtitleStyle, fromMs: Long = 0L, toMs: Long = 8400L, fps: Int = 30) {
        val bg = javaClass.classLoader!!.getResourceAsStream("kinetic_bg1.jpg").use { BitmapFactory.decodeStream(it) }
        val track = SubtitleTrack(cues, style)
        val fonts = FontLibrary(paparazzi.context)
        val w = bg.width
        val h = bg.height
        val dir = java.io.File("build/kinetic/$name").apply { deleteRecursively(); mkdirs() }
        val person = android.graphics.Path().apply {
            addOval(140f, 220f, 375f, 470f, android.graphics.Path.Direction.CW)
            moveTo(215f, 430f); lineTo(320f, 430f); lineTo(330f, 470f); lineTo(470f, 500f); lineTo(520f, 620f)
            lineTo(530f, 982f); lineTo(0f, 982f); lineTo(30f, 560f); lineTo(70f, 490f); lineTo(205f, 465f); close()
        }
        var k = 0
        var t = fromMs
        while (t <= toMs) {
            val out = android.graphics.Bitmap.createBitmap(w, h, android.graphics.Bitmap.Config.ARGB_8888)
            val c = android.graphics.Canvas(out)
            c.drawBitmap(bg, 0f, 0f, null)
            val layers = track.layersAt(t, w.toFloat() / h, fonts)
            TextRenderer.draw(c, layers.filter { it.behind }, fonts, w.toFloat(), h.toFloat())
            c.save(); c.clipPath(person); c.drawBitmap(bg, 0f, 0f, null); c.restore()
            TextRenderer.draw(c, layers.filter { !it.behind }, fonts, w.toFloat(), h.toFloat())
            java.io.File(dir, "f%04d.png".format(k)).outputStream().use { out.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
            k++
            t += 1000L / fps
        }
    }

    /** Every effect on the same moment, plus wide letter spacing, to judge them side by side. */
    @Test fun effects() {
        val bg = javaClass.classLoader!!.getResourceAsStream("kinetic_bg1.jpg").use { BitmapFactory.decodeStream(it) }.asImageBitmap()
        val fonts = FontLibrary(paparazzi.context)
        val cells = app.filmcam.film.TextFx.entries.map { SubtitleStyle(template = CaptionTemplate.SCATTER, effect = it, effectAmount = 0.6f) } +
            SubtitleStyle(template = CaptionTemplate.SCATTER, tracking = 0.12f)
        paparazzi.snapshot {
            Canvas(Modifier.fillMaxSize().background(Color.Black)) {
                val cols = 4
                val cw = size.width / cols
                val ch = cw * bg.height / bg.width
                cells.forEachIndexed { k, style ->
                    translate((k % cols) * cw, (k / cols) * (ch + 4f)) {
                        drawImage(bg, IntOffset.Zero, IntSize(bg.width, bg.height), IntOffset.Zero, IntSize(cw.toInt(), ch.toInt()))
                        val layers = SubtitleTrack(cues, style).layersAt(1500, bg.width.toFloat() / bg.height, fonts)
                        drawIntoCanvas { c -> TextRenderer.draw(c.nativeCanvas, layers, fonts, cw, ch) }
                        drawIntoCanvas { c ->
                            c.nativeCanvas.drawText(if (style.tracking > 0f) "spacing +12" else style.effect.label, 6f, ch - 6f,
                                android.graphics.Paint().apply { color = android.graphics.Color.YELLOW; textSize = 18f })
                        }
                    }
                }
            }
        }
    }

    /** Full-size stills of every effect at a settled moment (build/kinetic/effects). */
    @Test fun effectStills() {
        val bg = javaClass.classLoader!!.getResourceAsStream("kinetic_bg1.jpg").use { BitmapFactory.decodeStream(it) }
        val fonts = FontLibrary(paparazzi.context)
        val dir = java.io.File("build/kinetic/effects").apply { deleteRecursively(); mkdirs() }
        val cells = app.filmcam.film.TextFx.entries.map { it.name to SubtitleStyle(template = CaptionTemplate.SCATTER, effect = it, effectAmount = 0.6f) } +
            ("SPACING" to SubtitleStyle(template = CaptionTemplate.SCATTER, tracking = 0.12f))
        for ((name, style) in cells) {
            val out = android.graphics.Bitmap.createBitmap(bg.width, bg.height, android.graphics.Bitmap.Config.ARGB_8888)
            val c = android.graphics.Canvas(out)
            c.drawBitmap(bg, 0f, 0f, null)
            TextRenderer.draw(c, SubtitleTrack(cues, style).layersAt(2950, bg.width.toFloat() / bg.height, fonts), fonts, bg.width.toFloat(), bg.height.toFloat())
            java.io.File(dir, "$name.png").outputStream().use { out.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
        }
    }

    @Test fun videoScatter() = frames("scatter", SubtitleStyle(template = CaptionTemplate.SCATTER, behindSubject = true))
    @Test fun videoStack() = frames("stack", SubtitleStyle(template = CaptionTemplate.STACK, behindSubject = true))
    @Test fun videoFocus() = frames("focus", SubtitleStyle(template = CaptionTemplate.FOCUS))

    // Moments across the clip, with a few mid-entrance ones to see the letter reveal.
    private val times = listOf(150L, 520L, 900L, 1300L, 1750L, 2150L, 2700L, 3450L, 4050L, 4700L, 6000L, 7400L)

    @Test fun scatter() = grid(SubtitleStyle(template = CaptionTemplate.SCATTER), times)
    @Test fun scatterBehind() = grid(SubtitleStyle(template = CaptionTemplate.SCATTER, behindSubject = true), times)
    @Test fun stack() = grid(SubtitleStyle(template = CaptionTemplate.STACK), times)
    @Test fun focus() = grid(SubtitleStyle(template = CaptionTemplate.FOCUS, behindSubject = true), times)
    @Test fun entrance() = grid(
        SubtitleStyle(template = CaptionTemplate.SCATTER, wordAnim = WordAnim.BLUR),
        listOf(0L, 40L, 80L, 120L, 160L, 200L, 240L, 300L, 600L, 650L, 700L, 760L),
    )
}

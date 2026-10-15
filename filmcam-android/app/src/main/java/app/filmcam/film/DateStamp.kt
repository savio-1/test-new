package app.filmcam.film

import android.graphics.Bitmap
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import androidx.core.graphics.createBitmap
import java.time.LocalDate

/**
 * Draws the orange seven-segment date a compact camera burns into the corner of the frame,
 * e.g. `'26 10 15`. The bitmap is black where there is no light, so it is screened on.
 */
object DateStamp {
    const val WIDTH = 512
    const val HEIGHT = 112

    fun text(date: LocalDate = LocalDate.now()): String =
        "'%02d %2d %2d".format(date.year % 100, date.monthValue, date.dayOfMonth)

    /** Today's month and day, but in 1998, like a camera whose clock was never set. */
    fun text98(date: LocalDate = LocalDate.now()): String =
        "'98 %2d %2d".format(date.monthValue, date.dayOfMonth)

    fun render(text: String = text()): Bitmap {
        val bmp = createBitmap(WIDTH, HEIGHT)
        val canvas = Canvas(bmp)
        canvas.drawColor(Color.BLACK)

        val path = Path()
        val digitW = 46f
        val digitH = 78f
        val gap = 14f
        var x = 20f
        val y = (HEIGHT - digitH) / 2f
        for (ch in text) {
            when {
                ch.isDigit() -> { addDigit(path, ch - '0', x, y, digitW, digitH); x += digitW + gap }
                ch == '\'' -> { path.addRect(x, y, x + 7f, y + 18f, Path.Direction.CW); x += 16f }
                else -> x += digitW * 0.55f
            }
        }
        // Italic slant like the LCD stamps.
        val m = android.graphics.Matrix().apply { setSkew(-0.12f, 0f, 0f, HEIGHT / 2f) }
        path.transform(m)

        val glow = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.rgb(255, 92, 20)
            maskFilter = BlurMaskFilter(14f, BlurMaskFilter.Blur.NORMAL)
            alpha = 200
        }
        val core = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(255, 168, 70) }
        canvas.drawPath(path, glow)
        canvas.drawPath(path, core)
        return bmp
    }

    // Segments a..g, standard layout.
    private val DIGITS = intArrayOf(
        0b1111110, 0b0110000, 0b1101101, 0b1111001, 0b0110011,
        0b1011011, 0b1011111, 0b1110000, 0b1111111, 0b1111011,
    )

    private fun addDigit(p: Path, d: Int, x: Float, y: Float, w: Float, h: Float) {
        val t = 8f // segment thickness
        val half = h / 2f
        val bits = DIGITS[d]
        fun on(i: Int) = bits and (1 shl (6 - i)) != 0
        if (on(0)) hSeg(p, x, y, w, t)                // a
        if (on(1)) vSeg(p, x + w - t, y, half, t)     // b
        if (on(2)) vSeg(p, x + w - t, y + half, half, t) // c
        if (on(3)) hSeg(p, x, y + h - t, w, t)        // d
        if (on(4)) vSeg(p, x, y + half, half, t)      // e
        if (on(5)) vSeg(p, x, y, half, t)             // f
        if (on(6)) hSeg(p, x, y + half - t / 2f, w, t) // g
    }

    private fun hSeg(p: Path, x: Float, y: Float, w: Float, t: Float) {
        val g = 2f
        p.moveTo(x + g + t / 2f, y + t / 2f)
        p.lineTo(x + g + t, y)
        p.lineTo(x + w - g - t, y)
        p.lineTo(x + w - g - t / 2f, y + t / 2f)
        p.lineTo(x + w - g - t, y + t)
        p.lineTo(x + g + t, y + t)
        p.close()
    }

    private fun vSeg(p: Path, x: Float, y: Float, h: Float, t: Float) {
        val g = 2f
        p.moveTo(x + t / 2f, y + g + t / 2f)
        p.lineTo(x + t, y + g + t)
        p.lineTo(x + t, y + h - g - t)
        p.lineTo(x + t / 2f, y + h - g - t / 2f)
        p.lineTo(x, y + h - g - t)
        p.lineTo(x, y + g + t)
        p.close()
    }
}

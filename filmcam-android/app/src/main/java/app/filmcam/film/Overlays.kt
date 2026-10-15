package app.filmcam.film

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import androidx.core.graphics.createBitmap
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Camcorder on-screen display, in two strips of one texture: the top-left "REC" line and
 * the bottom date/time line. Black means transparent; the shader screens it on.
 */
object CamcorderOsd {
    const val WIDTH = 1024
    const val HEIGHT = 256

    fun timeText(now: LocalDateTime = LocalDateTime.now()): String =
        now.format(DateTimeFormatter.ofPattern("MMM.dd yyyy  h:mm:ss a", Locale.US)).uppercase(Locale.US)

    fun render(recording: Boolean, time: String = timeText()): Bitmap {
        val bmp = createBitmap(WIDTH, HEIGHT)
        val c = Canvas(bmp)
        c.drawColor(Color.BLACK)
        val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
            textSize = 84f
            color = Color.rgb(245, 245, 240)
            letterSpacing = 0.04f
        }
        // Top strip: record light or play symbol.
        if (recording) {
            val dot = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(240, 40, 30) }
            c.drawCircle(46f, 64f, 26f, dot)
            c.drawText("REC", 92f, 94f, text)
        } else {
            c.drawText("▶ PLAY", 12f, 94f, text)
        }
        c.drawText("SP", 600f, 94f, text)
        // Bottom strip: date and time.
        text.textSize = 66f
        c.drawText(time, 12f, 214f, text)
        return bmp
    }
}

/** The printing along the edge of a 35mm or 120 negative: frame numbers and stock codes. */
object EdgePrint {
    const val WIDTH = 1024
    const val HEIGHT = 64

    fun render(): Bitmap {
        val bmp = createBitmap(WIDTH, HEIGHT)
        val c = Canvas(bmp)
        c.drawColor(Color.BLACK)
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
            textSize = 40f
            color = Color.rgb(232, 150, 70)
            letterSpacing = 0.08f
        }
        c.drawText("▸ 14", 30f, 46f, p)
        c.drawText("FC 400-5", 250f, 46f, p)
        c.drawText("▸ 14A", 560f, 46f, p)
        c.drawText("SAFETY FILM", 760f, 46f, p)
        return bmp
    }
}

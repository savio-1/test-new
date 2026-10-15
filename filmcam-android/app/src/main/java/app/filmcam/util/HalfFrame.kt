package app.filmcam.util

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import androidx.core.graphics.createBitmap
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * A half-frame camera puts two upright 3:4 pictures side by side on one 35mm frame.
 * Each picture is centre-cropped to 3:4 portrait; the pair sits on black with a thin gap.
 */
object HalfFrame {
    fun compose(first: Bitmap, second: Bitmap): Bitmap {
        val h = min(min(first.height, second.height), (min(first.width, second.width) * 4f / 3f).roundToInt())
        val w = (h * 3f / 4f).roundToInt()
        val gap = (h * 0.025f).roundToInt()
        val out = createBitmap(w * 2 + gap * 3, h + gap * 2)
        val c = Canvas(out)
        c.drawColor(Color.rgb(10, 9, 8))
        val paint = Paint(Paint.FILTER_BITMAP_FLAG)
        listOf(first, second).forEachIndexed { i, b ->
            val srcW = min(b.width, (b.height * 3f / 4f).roundToInt())
            val srcH = min(b.height, (srcW * 4f / 3f).roundToInt())
            val sx = (b.width - srcW) / 2
            val sy = (b.height - srcH) / 2
            val x = gap + i * (w + gap)
            c.drawBitmap(b, Rect(sx, sy, sx + srcW, sy + srcH), Rect(x, gap, x + w, gap + h), paint)
        }
        return out
    }
}

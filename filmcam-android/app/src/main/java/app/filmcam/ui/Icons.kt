package app.filmcam.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

// Small hand-drawn icons, so the app needs no icon library.

@Composable
fun FlashIcon(on: Boolean, tint: Color, modifier: Modifier = Modifier, size: Dp = 22.dp) {
    Canvas(modifier.size(size)) {
        val w = this.size.width
        val h = this.size.height
        val p = Path().apply {
            moveTo(w * 0.58f, h * 0.04f)
            lineTo(w * 0.18f, h * 0.56f)
            lineTo(w * 0.47f, h * 0.56f)
            lineTo(w * 0.40f, h * 0.96f)
            lineTo(w * 0.82f, h * 0.42f)
            lineTo(w * 0.53f, h * 0.42f)
            close()
        }
        if (on) drawPath(p, tint, style = Fill)
        else {
            drawPath(p, tint, style = Stroke(width = w * 0.07f))
            drawLine(tint, Offset(w * 0.1f, h * 0.1f), Offset(w * 0.9f, h * 0.9f), strokeWidth = w * 0.08f, cap = StrokeCap.Round)
        }
    }
}

@Composable
fun FlipIcon(tint: Color, modifier: Modifier = Modifier, size: Dp = 24.dp) {
    Canvas(modifier.size(size)) {
        val w = this.size.width
        val sw = w * 0.08f
        val r = w * 0.32f
        val c = Offset(w / 2, w / 2)
        drawArc(tint, 200f, 140f, false, Offset(c.x - r, c.y - r), Size(r * 2, r * 2), style = Stroke(sw, cap = StrokeCap.Round))
        drawArc(tint, 20f, 140f, false, Offset(c.x - r, c.y - r), Size(r * 2, r * 2), style = Stroke(sw, cap = StrokeCap.Round))
        // Arrow heads
        val a1 = Path().apply {
            moveTo(c.x + r * 0.94f + w * 0.1f, c.y - r * 0.34f - w * 0.02f)
            lineTo(c.x + r * 0.94f, c.y - r * 0.34f + w * 0.12f)
            lineTo(c.x + r * 0.94f - w * 0.1f, c.y - r * 0.34f - w * 0.02f)
            close()
        }
        val a2 = Path().apply {
            moveTo(c.x - r * 0.94f - w * 0.1f, c.y + r * 0.34f + w * 0.02f)
            lineTo(c.x - r * 0.94f, c.y + r * 0.34f - w * 0.12f)
            lineTo(c.x - r * 0.94f + w * 0.1f, c.y + r * 0.34f + w * 0.02f)
            close()
        }
        drawPath(a1, tint)
        drawPath(a2, tint)
    }
}

@Composable
fun SlidersIcon(tint: Color, modifier: Modifier = Modifier, size: Dp = 22.dp) {
    Canvas(modifier.size(size)) {
        val w = this.size.width
        val sw = w * 0.08f
        val ys = floatArrayOf(0.25f, 0.5f, 0.75f)
        val knobs = floatArrayOf(0.65f, 0.3f, 0.55f)
        for (i in 0..2) {
            val y = w * ys[i]
            drawLine(tint, Offset(w * 0.1f, y), Offset(w * 0.9f, y), strokeWidth = sw, cap = StrokeCap.Round)
            drawCircle(tint, radius = w * 0.1f, center = Offset(w * knobs[i], y))
        }
    }
}

@Composable
fun DateIcon(on: Boolean, tint: Color, modifier: Modifier = Modifier, size: Dp = 22.dp) {
    Canvas(modifier.size(size)) {
        val w = this.size.width
        val sw = w * 0.08f
        drawRoundRect(
            tint, Offset(w * 0.12f, w * 0.2f), Size(w * 0.76f, w * 0.66f), CornerRadius(w * 0.1f),
            style = if (on) Fill else Stroke(sw),
        )
        drawLine(tint, Offset(w * 0.32f, w * 0.1f), Offset(w * 0.32f, w * 0.28f), strokeWidth = sw, cap = StrokeCap.Round)
        drawLine(tint, Offset(w * 0.68f, w * 0.1f), Offset(w * 0.68f, w * 0.28f), strokeWidth = sw, cap = StrokeCap.Round)
        val inner = if (on) Color.Black.copy(alpha = 0.7f) else tint
        drawLine(inner, Offset(w * 0.28f, w * 0.52f), Offset(w * 0.72f, w * 0.52f), strokeWidth = sw, cap = StrokeCap.Round)
        drawLine(inner, Offset(w * 0.28f, w * 0.68f), Offset(w * 0.56f, w * 0.68f), strokeWidth = sw, cap = StrokeCap.Round)
    }
}

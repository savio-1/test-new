package app.filmcam.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.roundToInt

/**
 * The adjustment ruler: ticks slide under a fixed centre line, with the value in a bubble
 * above it. With [options] it snaps between named stops instead. Double-tap resets.
 * [onActive] reports drag start/end so the screen can hide everything else meanwhile.
 */
@Composable
fun Ruler(
    value: Float,
    min: Float,
    max: Float,
    default: Float,
    format: (Float) -> String,
    onChange: (Float) -> Unit,
    onActive: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    options: List<String>? = null,
) {
    val p = LocalPalette.current
    val density = LocalDensity.current
    val haptics = LocalHapticFeedback.current
    val measurer = rememberTextMeasurer()
    val current by rememberUpdatedState(value)
    val emit by rememberUpdatedState(onChange)
    val active by rememberUpdatedState(onActive)
    var dragging by remember { mutableStateOf(false) }
    // Discrete rulers move freely while dragging and snap on release.
    var freePos by remember { mutableFloatStateOf(value) }
    val shown = if (options != null && dragging) freePos else value

    val discrete = options != null
    val ticks = 60
    val tickPx = with(density) { if (discrete) 64.dp.toPx() else 9.dp.toPx() }
    val pxPerUnit = if (discrete) tickPx else ticks * tickPx / (max - min)

    Column(modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            if (discrete) options!![shown.roundToInt().coerceIn(0, options.lastIndex)] else format(shown),
            color = p.text, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, fontFamily = FontFamily.Monospace,
            modifier = Modifier
                .border(1.dp, p.accent, RoundedCornerShape(10.dp))
                .background(p.surface.copy(alpha = 0.92f), RoundedCornerShape(10.dp))
                .padding(horizontal = 10.dp, vertical = 3.dp),
        )
        Box(Modifier.fillMaxWidth().height(10.dp), contentAlignment = Alignment.Center) {
            Canvas(Modifier.fillMaxWidth().height(10.dp)) {
                drawLine(p.accent, Offset(size.width / 2, 0f), Offset(size.width / 2, size.height), strokeWidth = 1.5.dp.toPx())
            }
        }
        Canvas(
            Modifier
                .fillMaxWidth()
                .height(if (discrete) 46.dp else 34.dp)
                .graphicsLayer(compositingStrategy = CompositingStrategy.Offscreen)
                .pointerInput(min, max, discrete) {
                    detectTapGestures(onDoubleTap = {
                        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                        emit(default)
                    })
                }
                .pointerInput(min, max, discrete) {
                    var last = 0f
                    detectHorizontalDragGestures(
                        onDragStart = {
                            dragging = true
                            freePos = current
                            last = current
                            active(true)
                        },
                        onDragEnd = {
                            dragging = false
                            if (discrete) emit(freePos.roundToInt().toFloat().coerceIn(min, max))
                            active(false)
                        },
                        onDragCancel = { dragging = false; active(false) },
                    ) { pointer, dx ->
                        pointer.consume()
                        if (discrete) {
                            val before = freePos.roundToInt()
                            freePos = (freePos - dx / pxPerUnit).coerceIn(min, max)
                            val now = freePos.roundToInt()
                            if (now != before) {
                                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                emit(now.toFloat())
                            }
                        } else {
                            val next = (current - dx / pxPerUnit).coerceIn(min, max)
                            // A small tick of feedback on each tenth of the range.
                            val step = (max - min) / 10f
                            if (floor((next - min) / step) != floor((last - min) / step)) {
                                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                            }
                            last = next
                            emit(next)
                        }
                    }
                },
        ) {
            val cx = size.width / 2
            if (discrete) {
                options!!.forEachIndexed { i, label ->
                    val x = cx + (i - shown) * pxPerUnit
                    if (x < -tickPx || x > size.width + tickPx) return@forEachIndexed
                    val near = abs(i - shown) < 0.5f
                    drawLine(if (near) p.text else p.faint, Offset(x, 0f), Offset(x, 14.dp.toPx()),
                        strokeWidth = 1.5.dp.toPx(), cap = StrokeCap.Round)
                    val t = measurer.measure(label, TextStyle(fontSize = 11.sp, color = if (near) p.text else p.muted, fontFamily = FontFamily.Monospace))
                    drawText(t, topLeft = Offset(x - t.size.width / 2f, 20.dp.toPx()))
                }
            } else {
                val unit = (max - min) / ticks
                for (i in 0..ticks) {
                    val v = min + i * unit
                    val x = cx + (v - shown) * pxPerUnit
                    if (x < 0f || x > size.width) continue
                    val major = i % 10 == 0
                    val h = if (major) 18.dp.toPx() else 10.dp.toPx()
                    drawLine(if (major) p.muted else p.faint, Offset(x, (18.dp.toPx() - h) / 2 + 2.dp.toPx()),
                        Offset(x, (18.dp.toPx() + h) / 2 + 2.dp.toPx()), strokeWidth = 1.dp.toPx(), cap = StrokeCap.Round)
                }
                // Default marked with a dot, so "back to neutral" is easy to find by eye.
                val dx = cx + (default - shown) * pxPerUnit
                if (dx in 0f..size.width) drawCircle(p.accent, 2.dp.toPx(), Offset(dx, 28.dp.toPx()))
            }
            // Fade the ends.
            drawRect(
                Brush.horizontalGradient(0f to Color.Transparent, 0.18f to Color.Black, 0.82f to Color.Black, 1f to Color.Transparent),
                blendMode = BlendMode.DstIn,
            )
        }
    }
}

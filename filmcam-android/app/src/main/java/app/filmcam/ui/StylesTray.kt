package app.filmcam.ui

import android.graphics.BitmapFactory
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.filmcam.film.PhotoStyle
import app.filmcam.film.StyleSetting
import kotlin.math.abs

/**
 * Photographic styles, after the iPhone's: a row of styles; the chosen one turns into a pad
 * (drag for Tone up and down, Colour left and right; double-tap to centre it) and the slider
 * under it sets the Palette, how much of the style is applied.
 */
@Composable
fun StylesTray(ui: UiState, actions: CameraActions, chrome: Float) {
    val p = LocalPalette.current
    val current = if (ui.isOriginal) ui.style else StyleSetting()
    TrayCard(chrome) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
            Text(
                current.style.label.uppercase(), color = p.text, fontSize = 13.sp, fontWeight = FontWeight.Medium,
                letterSpacing = 2.sp, modifier = Modifier.alpha(chrome),
            )
            if (!ui.isOriginal) {
                Text("Styles are for the Original camera; picking one takes the look off.",
                    color = p.muted, fontSize = 10.sp, modifier = Modifier.padding(top = 2.dp).alpha(chrome))
            }
            Spacer(Modifier.height(6.dp))
            // Page indicator dot over the chosen style, as on the iPhone.
            val styles = PhotoStyle.entries
            val sel = styles.indexOf(current.style)
            val state = rememberLazyListState((sel - 2).coerceAtLeast(0))
            LaunchedEffect(Unit) { state.scrollToItem((sel - 2).coerceAtLeast(0)) }
            LazyRow(
                state = state,
                contentPadding = PaddingValues(horizontal = 14.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                itemsIndexed(styles, key = { _, s -> s.name }) { _, s ->
                    if (s == current.style && ui.isOriginal) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Box(Modifier.size(4.dp).clip(RoundedCornerShape(2.dp)).background(p.text))
                            Spacer(Modifier.height(4.dp))
                            StylePad(current, ui) { actions.setStyle(it) }
                        }
                    } else {
                        StyleTile(s, Modifier.alpha(chrome)) { actions.setStyle(StyleSetting(s)) }
                    }
                }
            }
            Spacer(Modifier.height(10.dp))
            PaletteSlider(current, enabled = ui.isOriginal && current.style != PhotoStyle.STANDARD, ui = ui) {
                actions.setStyle(current.copy(palette = it))
            }
        }
    }
}

@Composable
private fun StyleTile(style: PhotoStyle, modifier: Modifier, onClick: () -> Unit) {
    val thumb = rememberAssetThumb("styles/${style.name.lowercase()}.jpg")
    Box(
        modifier
            .size(width = 58.dp, height = 70.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(Color(style.swatch))
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onClick),
    ) {
        if (thumb != null) Image(thumb, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
    }
}

@Composable
fun rememberAssetThumb(path: String): ImageBitmap? {
    val ctx = LocalContext.current
    return remember(path) {
        runCatching { ctx.assets.open(path).use { BitmapFactory.decodeStream(it)?.asImageBitmap() } }.getOrNull()
    }
}

/** The chosen style's pad: a dotted square, dark to light going up, grey to colour going right. */
@Composable
private fun StylePad(setting: StyleSetting, ui: UiState, onChange: (StyleSetting) -> Unit) {
    val haptics = LocalHapticFeedback.current
    val latest by rememberUpdatedState(setting)
    val change by rememberUpdatedState(onChange)
    val hue = Color(setting.style.swatch)
    val mono = setting.style.mono > 0f
    Canvas(
        Modifier
            .size(84.dp)
            .clip(RoundedCornerShape(16.dp))
            .pointerInput(Unit) {
                detectTapGestures(onDoubleTap = {
                    haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                    change(latest.copy(tone = 0f, color = 0f))
                })
            }
            .pointerInput(Unit) {
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false)
                    fun apply(o: Offset) {
                        val c = (o.x / size.width * 2f - 1f).coerceIn(-1f, 1f)
                        val t = (1f - o.y / size.height * 2f).coerceIn(-1f, 1f)
                        // A gentle snap to the centre lines, where the style is as designed.
                        val cs = if (abs(c) < 0.06f) 0f else c
                        val ts = if (abs(t) < 0.06f) 0f else t
                        change(latest.copy(tone = ts, color = cs))
                    }
                    var dragging = false
                    var pos = down.position
                    do {
                        val ev = awaitPointerEvent()
                        val ch = ev.changes.firstOrNull() ?: break
                        if (!dragging && (ch.position - down.position).getDistance() > viewConfiguration.touchSlop) {
                            dragging = true
                            ui.adjusting = true
                        }
                        if (dragging) {
                            pos = ch.position
                            apply(pos)
                            ch.consume()
                        }
                    } while (ev.changes.any { it.pressed })
                    if (dragging) ui.adjusting = false
                }
            },
    ) {
        val w = size.width
        val h = size.height
        // Tone runs bottom (deep) to top (light); colour runs left (muted) to right (rich).
        drawRect(Brush.verticalGradient(listOf(lerp(hue, Color.White, 0.55f), lerp(hue, Color.Black, 0.82f))))
        drawRect(
            Brush.horizontalGradient(
                listOf(Color(0xFF8A8A8A).copy(alpha = 0.85f), if (mono) Color(0x00FFFFFF) else hue.copy(alpha = 0.15f)),
            ),
        )
        val n = 9
        val kx = (setting.color + 1f) / 2f * w
        val ky = (1f - setting.tone) / 2f * h
        val step = w / (n + 1)
        for (i in 1..n) for (j in 1..n) {
            val x = i * step
            val y = j * step
            // Dots light up along the knob's row and column.
            val near = 1f - (minOf(abs(x - kx), abs(y - ky)) / (step * 1.2f)).coerceIn(0f, 1f)
            drawCircle(Color.White.copy(alpha = 0.32f + 0.5f * near), (1.1f + 1.1f * near) * density, Offset(x, y))
        }
        drawCircle(Color.Black.copy(alpha = 0.25f), 7.5f * density, Offset(kx, ky + 1f * density))
        drawCircle(Color.White, 6.5f * density, Offset(kx, ky))
    }
}

/** Palette: how much of the style's character, from none (grey end) to all of it. */
@Composable
private fun PaletteSlider(setting: StyleSetting, enabled: Boolean, ui: UiState, onChange: (Float) -> Unit) {
    val p = LocalPalette.current
    val latestChange by rememberUpdatedState(onChange)
    val hue = Color(setting.style.swatch)
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.alpha(if (enabled) 1f else 0.35f)) {
        Text("PALETTE", color = p.muted, fontSize = 9.sp, letterSpacing = 1.4.sp)
        Spacer(Modifier.width(10.dp))
        Canvas(
            Modifier
                .size(width = 150.dp, height = 24.dp)
                .pointerInput(enabled) {
                    if (!enabled) return@pointerInput
                    awaitEachGesture {
                        val down = awaitFirstDown()
                        ui.adjusting = true
                        latestChange((down.position.x / size.width).coerceIn(0f, 1f))
                        do {
                            val ev = awaitPointerEvent()
                            val ch = ev.changes.firstOrNull() ?: break
                            if (ch.positionChange() != Offset.Zero) {
                                latestChange((ch.position.x / size.width).coerceIn(0f, 1f))
                                ch.consume()
                            }
                        } while (ev.changes.any { it.pressed })
                        ui.adjusting = false
                    }
                },
        ) {
            val th = 8.dp.toPx()
            val y = (size.height - th) / 2
            drawRoundRect(
                Brush.horizontalGradient(listOf(Color(0xFF9A9A9A), if (setting.style.mono > 0f) Color(0xFF222222) else hue)),
                Offset(0f, y), androidx.compose.ui.geometry.Size(size.width, th), CornerRadius(th / 2),
            )
            val x = setting.palette.coerceIn(0f, 1f) * size.width
            drawCircle(Color.Black.copy(alpha = 0.2f), 9.dp.toPx(), Offset(x, size.height / 2 + 1f))
            drawCircle(Color.White, 8.dp.toPx(), Offset(x, size.height / 2))
        }
        Spacer(Modifier.width(10.dp))
        Text("${(setting.palette * 100).toInt()}", color = p.muted, fontSize = 10.sp, modifier = Modifier.width(24.dp))
    }
}

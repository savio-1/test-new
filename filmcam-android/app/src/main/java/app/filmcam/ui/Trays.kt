package app.filmcam.ui

import android.graphics.BitmapFactory
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.filmcam.camera.CaptureMode
import app.filmcam.camera.VideoResolution
import app.filmcam.film.CameraCategory
import app.filmcam.film.FilmCamera
import app.filmcam.film.FilmCameras
import app.filmcam.film.FrameStyle
import app.filmcam.film.StampStyle

// ------------------------------------------------------------------ shared pieces

/** A row of small-caps text tabs. */
@Composable
fun <T> TextTabs(items: List<T>, selected: T, label: (T) -> String, modifier: Modifier = Modifier, onPick: (T) -> Unit) {
    val p = LocalPalette.current
    LazyRow(modifier, contentPadding = PaddingValues(horizontal = 14.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        items(items) { item ->
            val sel = item == selected
            Text(
                label(item).uppercase(), color = if (sel) p.text else p.faint,
                fontSize = 10.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.8.sp,
                modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable { onPick(item) }.padding(horizontal = 8.dp, vertical = 6.dp),
            )
        }
    }
}

/** Pill-shaped segmented control; the chosen segment is inverted. */
@Composable
fun <T> Segmented(
    options: List<T>, selected: T, label: (T) -> String, modifier: Modifier = Modifier,
    enabled: (T) -> Boolean = { true }, onPick: (T) -> Unit,
) {
    val p = LocalPalette.current
    Row(modifier.clip(RoundedCornerShape(12.dp)).background(p.surfaceHigh).padding(3.dp)) {
        for (o in options) {
            val sel = o == selected
            val on = enabled(o)
            Text(
                label(o), color = if (sel) p.bg else if (on) p.text else p.faint,
                fontSize = 12.sp, fontWeight = FontWeight.Medium, textAlign = TextAlign.Center,
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(9.dp))
                    .background(if (sel) p.text else Color.Transparent)
                    .clickable(enabled = on) { onPick(o) }
                    .padding(vertical = 8.dp),
            )
        }
    }
}

/** A round tool button with a label under it, as in the adjustment row. */
@Composable
fun ToolButton(icon: ImageVector, label: String, selected: Boolean, changed: Boolean = false, danger: Boolean = false, onClick: () -> Unit) {
    val p = LocalPalette.current
    Column(
        Modifier
            .width(58.dp)
            .clip(RoundedCornerShape(12.dp))
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier
                .size(44.dp)
                .clip(CircleShape)
                .background(if (selected) p.text else p.surfaceHigh),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, null, tint = if (selected) p.bg else if (danger) p.danger else p.text, modifier = Modifier.size(20.dp))
        }
        Spacer(Modifier.height(5.dp))
        Text(label, color = if (selected) p.text else if (danger) p.danger else p.muted, fontSize = 10.sp, maxLines = 1)
        Spacer(Modifier.height(3.dp))
        // A dot marks tools moved away from the camera's own setting.
        Box(Modifier.size(3.dp).clip(CircleShape).background(if (changed) p.accent else Color.Transparent))
    }
}

// ------------------------------------------------------------------ looks

@Composable
fun LooksTray(ui: UiState, actions: CameraActions, chrome: Float) {
    TrayCard(chrome) {
        Column {
            val category = if (ui.category == CameraCategory.ORIGINAL) CameraCategory.FILM else ui.category
            TextTabs(CameraCategory.entries.filter { it != CameraCategory.ORIGINAL }, category, { it.label }) { ui.category = it }
            Spacer(Modifier.height(8.dp))
            // "Original" (no filter) leads every row.
            val cams = listOf(FilmCameras.ORIGINAL) + FilmCameras.ALL.filter { it.category == category }
            val state = rememberLazyListState(cams.indexOf(ui.camera).coerceAtLeast(0))
            LaunchedEffect(ui.category) { state.scrollToItem(cams.indexOf(ui.camera).coerceAtLeast(0)) }
            LazyRow(state = state, contentPadding = PaddingValues(horizontal = 14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(cams, key = { it.id }) { cam -> LookCard(cam, cam.id == ui.camera.id) { actions.selectCamera(cam) } }
            }
        }
    }
}

@Composable
private fun LookCard(cam: FilmCamera, selected: Boolean, onClick: () -> Unit) {
    val p = LocalPalette.current
    val thumb = rememberLookThumb(cam.id)
    Column(
        Modifier.width(64.dp).clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier
                .size(width = 62.dp, height = 64.dp)
                .border(if (selected) 2.dp else 0.dp, if (selected) p.text else Color.Transparent, RoundedCornerShape(14.dp))
                .padding(if (selected) 3.dp else 0.dp)
                .clip(RoundedCornerShape(if (selected) 11.dp else 14.dp))
                .background(Brush.verticalGradient(listOf(Color(cam.look.stock.swatch), Color(cam.look.stock.swatch).copy(alpha = 0.4f)))),
        ) {
            if (thumb != null) Image(thumb, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        }
        Spacer(Modifier.height(4.dp))
        Text(cam.name, color = if (selected) p.text else p.muted, fontSize = 10.sp, maxLines = 1,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal)
    }
}

@Composable
private fun rememberLookThumb(id: String): ImageBitmap? {
    val ctx = LocalContext.current
    return remember(id) {
        runCatching { ctx.assets.open("looks/$id.jpg").use { BitmapFactory.decodeStream(it)?.asImageBitmap() } }.getOrNull()
    }
}

// ------------------------------------------------------------------ adjust

@Composable
fun AdjustTray(ui: UiState, actions: CameraActions, chrome: Float) {
    val p = LocalPalette.current
    val tools = remember(ui.evMin, ui.evMax) { Tools.all(ui.evMin, ui.evMax) }
    val visible = tools.filter { it.group == ui.toolGroup && it.visible(ui.look) }
    val tool = visible.firstOrNull { it.id == ui.toolId } ?: visible.firstOrNull()
    val preset = ui.camera.look
    TrayCard(chrome) {
        Column {
            Row(Modifier.alpha(chrome), verticalAlignment = Alignment.CenterVertically) {
                TextTabs(ToolGroup.entries, ui.toolGroup, { it.label }, Modifier.weight(1f)) { g ->
                    ui.toolGroup = g
                    ui.toolId = tools.firstOrNull { it.group == g }?.id ?: ui.toolId
                }
                IconCircle(Ico.Reset, size = 34.dp, modifier = Modifier.padding(end = 8.dp)) { actions.resetLook() }
            }
            Spacer(Modifier.height(6.dp))
            LazyRow(
                Modifier.alpha(chrome),
                contentPadding = PaddingValues(horizontal = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                items(visible, key = { it.id }) { t ->
                    ToolButton(t.icon, t.label, t.id == tool?.id, changed = t.get(ui.look) != t.get(preset)) { ui.toolId = t.id }
                }
            }
            if (tool != null) {
                Spacer(Modifier.height(10.dp))
                Text(tool.label, color = p.muted, fontSize = 10.sp, letterSpacing = 1.sp,
                    modifier = Modifier.align(Alignment.CenterHorizontally))
                Spacer(Modifier.height(4.dp))
                Ruler(
                    value = tool.get(ui.look), min = tool.min, max = tool.max, default = tool.get(preset),
                    format = tool.format, options = tool.options,
                    onChange = { v -> actions.updateLook(tool.set(ui.look, v)) },
                    onActive = { ui.adjusting = it },
                )
            }
        }
    }
}

// ------------------------------------------------------------------ frame

@Composable
fun FrameTray(ui: UiState, actions: CameraActions, chrome: Float) {
    val p = LocalPalette.current
    TrayCard(chrome) {
        Column {
            LazyRow(contentPadding = PaddingValues(horizontal = 14.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                items(FrameStyle.entries) { style ->
                    val sel = ui.look.frame == style
                    Column(
                        Modifier.width(58.dp).clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {
                            actions.setFrame(style)
                        },
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Canvas(
                            Modifier
                                .size(width = 48.dp, height = 64.dp)
                                .border(if (sel) 2.dp else 1.dp, if (sel) p.text else p.line, RoundedCornerShape(10.dp))
                                .padding(if (sel) 3.dp else 1.dp)
                                .clip(RoundedCornerShape(8.dp)),
                        ) { drawBorderThumb(style) }
                        Spacer(Modifier.height(5.dp))
                        Text(style.label, color = if (sel) p.text else p.muted, fontSize = 9.sp, maxLines = 1)
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
            Row(Modifier.padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Ico.Stamp, null, tint = p.muted, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(10.dp))
                Segmented(StampStyle.entries, ui.look.stamp, { it.label }, Modifier.weight(1f)) { actions.setStamp(it) }
            }
        }
    }
}

/** A small picture of each border, so the list reads at a glance. */
private fun DrawScope.drawBorderThumb(style: FrameStyle) {
    val w = size.width
    val h = size.height
    val s = minOf(w, h)
    val pic = Brush.linearGradient(listOf(Color(0xFFE2A25E), Color(0xFF7F9A92), Color(0xFF34424B)), Offset(0f, 0f), Offset(w, h))
    val cream = Color(0xFFF1ECE2)
    val dark = Color(0xFF0C0B0A)
    fun picture(l: Float, t: Float, r: Float, b: Float, radius: Float = 0f) =
        drawRoundRect(pic, Offset(l, t), Size(r - l, b - t), CornerRadius(radius))
    when (style) {
        FrameStyle.NONE -> picture(0f, 0f, w, h)
        FrameStyle.GATE -> { drawRect(dark); picture(s * .06f, s * .06f, w - s * .06f, h - s * .06f, s * .12f) }
        FrameStyle.INSTANT -> { drawRect(cream); picture(s * .08f, s * .08f, w - s * .08f, h - s * .3f) }
        FrameStyle.INSTANT_SQUARE -> { drawRect(cream); picture(s * .08f, s * .08f, w - s * .08f, s * .08f + (w - s * .16f)) }
        FrameStyle.INSTANT_MINI -> { drawRect(cream); picture(s * .11f, s * .08f, w - s * .11f, h - s * .28f) }
        FrameStyle.FILMSTRIP -> {
            drawRect(dark); picture(s * .22f, s * .03f, w - s * .22f, h - s * .03f, 2f)
            var y = 2f
            while (y < h) { for (x in listOf(s * .06f, w - s * .14f)) drawRoundRect(cream, Offset(x, y), Size(s * .08f, s * .06f), CornerRadius(1.5f)); y += s * .15f }
        }
        FrameStyle.FILED -> { drawRect(dark); picture(s * .07f, s * .07f, w - s * .07f, h - s * .07f) }
        FrameStyle.WHITE -> { drawRect(cream); picture(s * .06f, s * .06f, w - s * .06f, h - s * .06f) }
        FrameStyle.MAT -> {
            drawRect(cream); drawRect(Color(0xFF333333), Offset(s * .15f, s * .15f), Size(w - s * .3f, h - s * .3f))
            picture(s * .17f, s * .17f, w - s * .17f, h - s * .17f)
        }
        FrameStyle.BLACK -> { drawRect(dark); picture(s * .06f, s * .06f, w - s * .06f, h - s * .06f) }
        FrameStyle.STRIP_120 -> {
            drawRect(dark)
            var y = -s * .45f
            while (y < h) { picture(s * .09f, y, w - s * .09f, y + w - s * .18f, 2f); y += w - s * .12f }
        }
        FrameStyle.SUPER8_STRIP -> {
            drawRect(Color(0xFF120D09))
            var y = -s * .2f
            val cell = (w - s * .32f) * 0.75f
            while (y < h) {
                picture(s * .26f, y, w - s * .06f, y + cell, 4f)
                drawRoundRect(cream, Offset(s * .06f, y + cell * .35f), Size(s * .1f, s * .12f), CornerRadius(2f))
                y += cell + s * .08f
            }
        }
        FrameStyle.SLIDE_MOUNT -> { drawRect(Color(0xFFE6E2D9)); picture(s * .18f, h * .22f, w - s * .18f, h - h * .22f, 4f) }
        FrameStyle.LETTERBOX -> { drawRect(Color.Black); picture(0f, h / 2 - w / 4.8f, w, h / 2 + w / 4.8f) }
        FrameStyle.ACADEMY -> { drawRect(Color.Black); picture(0f, h / 2 - w * 2f / 3f, w, h / 2 + w * 2f / 3f) }
        FrameStyle.DECKLE -> {
            drawRect(Color(0xFF1A1715))
            drawRoundRect(cream, Offset(3f, 3f), Size(w - 6f, h - 6f), CornerRadius(4f))
            picture(s * .13f, s * .13f, w - s * .13f, h - s * .13f)
        }
        FrameStyle.ROUNDED -> { drawRect(Color.Black); picture(s * .05f, s * .05f, w - s * .05f, h - s * .05f, s * .15f) }
    }
}

// ------------------------------------------------------------------ settings

@Composable
fun SettingsSheet(ui: UiState, actions: CameraActions) {
    val p = LocalPalette.current
    Box(
        Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.45f))
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { ui.settingsOpen = false },
        contentAlignment = Alignment.BottomCenter,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(10.dp)
                .navigationBarsPadding()
                .clip(RoundedCornerShape(28.dp))
                .background(p.surface)
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {}
                .padding(horizontal = 18.dp, vertical = 16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Settings", color = p.text, fontSize = 26.sp, fontFamily = SerifDisplay, modifier = Modifier.weight(1f))
                IconCircle(Ico.Close, size = 36.dp) { ui.settingsOpen = false }
            }
            SettingLabel("Appearance")
            Segmented(ThemeMode.entries, ui.theme, { it.label }, Modifier.fillMaxWidth()) { actions.setTheme(it) }

            if (ui.mode == CaptureMode.VIDEO) {
                SettingLabel("Video resolution")
                Segmented(VideoResolution.entries, ui.videoRes, { it.label }, Modifier.fillMaxWidth(),
                    enabled = { it in ui.availableVideoRes }) { actions.setVideoResolution(it) }
                SettingLabel("Frame rate")
                Segmented(listOf(24, 25, 30, 60), ui.fps, { "$it" }, Modifier.fillMaxWidth(),
                    enabled = { it in ui.availableFps }) { actions.setFps(it) }
                if (ui.encoderInfo.isNotEmpty()) {
                    Text(ui.encoderInfo, color = p.muted, fontSize = 11.sp, fontFamily = FontFamily.Monospace, modifier = Modifier.padding(top = 8.dp))
                }
                if (ui.stabilizationSupported) SettingSwitch("Stabilisation", "Steadier, slightly cropped", ui.stabilization) { actions.setStabilization(it) }
                SettingSwitch("Log", "Flat S-Log3 video for colour grading", ui.log) { actions.setLog(it) }
            } else if (ui.photoSizes.isNotEmpty()) {
                SettingLabel("Photo size")
                Segmented(ui.photoSizes, ui.photoSize ?: ui.photoSizes.last(), { it.label }, Modifier.fillMaxWidth()) { actions.setPhotoSize(it) }
            }
            if (ui.manualSupported) {
                SettingSwitch("Real shutter speed", "The sensor exposes for the chosen speed", ui.realShutter) { actions.setRealShutter(it) }
            }
            Spacer(Modifier.height(4.dp))
        }
    }
}

@Composable
private fun SettingLabel(text: String) {
    val p = LocalPalette.current
    Text(text.uppercase(), color = p.muted, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.6.sp,
        modifier = Modifier.padding(top = 18.dp, bottom = 8.dp))
}

@Composable
private fun SettingSwitch(title: String, help: String, value: Boolean, onChange: (Boolean) -> Unit) {
    val p = LocalPalette.current
    Row(Modifier.padding(top = 16.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, color = p.text, fontSize = 14.sp)
            Text(help, color = p.muted, fontSize = 11.sp)
        }
        Switch(
            checked = value, onCheckedChange = onChange,
            colors = SwitchDefaults.colors(
                checkedTrackColor = p.text, checkedThumbColor = p.bg, checkedBorderColor = p.text,
                uncheckedTrackColor = p.surfaceHigh, uncheckedThumbColor = p.muted, uncheckedBorderColor = p.line,
            ),
        )
    }
}

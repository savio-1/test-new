package app.filmcam.ui

import android.view.TextureView
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import app.filmcam.camera.CaptureMode
import app.filmcam.camera.PhotoResolution
import app.filmcam.film.FilmFrameRate
import kotlinx.coroutines.delay
import kotlin.math.abs
import kotlin.math.roundToInt

/** Screenshot tests show a still here instead of the live camera. */
val LocalViewfinderStill = androidx.compose.runtime.staticCompositionLocalOf<androidx.compose.ui.graphics.ImageBitmap?> { null }

/** Glass for controls that sit on the picture itself, whatever the theme. */
private val Glass = Color(0x66000000)

@Composable
fun CameraScreen(ui: UiState, actions: CameraActions) {
    FilmTheme(ui.theme) {
        val p = LocalPalette.current
        // Everything except the control being dragged fades out, so the picture can be judged.
        val chrome by animateFloatAsState(if (ui.adjusting) 0f else 1f, tween(160), label = "chrome")
        Box(Modifier.fillMaxSize().background(p.bg).dotGrid(p)) {
            if (!ui.hasCamera) {
                PermissionPrompt(ui, actions)
                return@Box
            }
            val iconRotation by animateFloatAsState(
                when (ui.quarterTurns and 3) { 1 -> -90f; 2 -> 180f; 3 -> 90f; else -> 0f },
                tween(260), label = "iconRotation",
            )

            Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
                TopBar(ui, actions, iconRotation, Modifier.alpha(chrome))
                Box(
                    Modifier.weight(1f).fillMaxWidth().padding(horizontal = 10.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Viewfinder(ui, actions, chrome, iconRotation)
                    AnimatedContent(
                        targetState = if (ui.recording) Dock.NONE else ui.dock,
                        transitionSpec = {
                            (fadeIn(tween(180)) + slideInVertically(tween(220)) { it / 4 }) togetherWith
                                (fadeOut(tween(120)) + slideOutVertically(tween(160)) { it / 4 })
                        },
                        modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 8.dp),
                        label = "tray",
                    ) { dock ->
                        when (dock) {
                            Dock.LOOKS -> LooksTray(ui, actions, chrome)
                            Dock.ADJUST -> AdjustTray(ui, actions, chrome)
                            Dock.FRAME -> FrameTray(ui, actions, chrome)
                            Dock.TEXT -> TextTray(ui, actions, chrome)
                            Dock.NONE -> Spacer(Modifier.height(0.dp))
                        }
                    }
                }
                DockBar(ui, Modifier.alpha(chrome))
                ModeSwitch(ui, actions, Modifier.alpha(chrome))
                ShutterRow(ui, actions, iconRotation, Modifier.alpha(chrome))
            }

            if (ui.settingsOpen) SettingsSheet(ui, actions)
            if (ui.editingText) TextEditOverlay(ui, actions)

            ui.message?.let { msg ->
                LaunchedEffect(msg) { delay(2600); ui.message = null }
                Text(
                    msg, color = p.text, fontSize = 13.sp,
                    modifier = Modifier
                        .align(Alignment.Center)
                        .padding(32.dp)
                        .background(p.surface, RoundedCornerShape(14.dp))
                        .border(1.dp, p.line, RoundedCornerShape(14.dp))
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                )
            }
        }
    }
}

/** The light theme sits on a fine dot grid, like paper. */
private fun Modifier.dotGrid(p: Palette) = drawBehind {
    val step = 14.dp.toPx()
    val r = 0.9.dp.toPx()
    var y = step / 2
    while (y < size.height) {
        var x = step / 2
        while (x < size.width) { drawCircle(p.dots, r, Offset(x, y)); x += step }
        y += step
    }
}

@Composable
private fun PermissionPrompt(ui: UiState, actions: CameraActions) {
    val p = LocalPalette.current
    Column(
        Modifier.fillMaxSize().padding(36.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(Ico.Film, null, tint = p.text, modifier = Modifier.size(36.dp))
        Spacer(Modifier.height(18.dp))
        Text("FilmCam", color = p.text, fontSize = 38.sp, fontFamily = SerifDisplay)
        Spacer(Modifier.height(10.dp))
        Text(
            "Photos and video through a live film emulsion. It needs the camera, and the microphone for sound.",
            color = p.muted, fontSize = 14.sp, lineHeight = 21.sp,
        )
        Spacer(Modifier.height(28.dp))
        if (ui.permissionAsked) Pill("Allow camera", filled = true) { actions.requestPermissions() }
    }
}

// ------------------------------------------------------------------ top bar

@Composable
private fun TopBar(ui: UiState, actions: CameraActions, iconRotation: Float, modifier: Modifier) {
    val p = LocalPalette.current
    Row(
        modifier.fillMaxWidth().height(56.dp).padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
            IconCircle(if (ui.flash) Ico.Flash else Ico.FlashOff, enabled = ui.hasFlash, rotation = iconRotation,
                tint = if (ui.flash) p.accent else p.text) { actions.toggleFlash() }
            Spacer(Modifier.width(6.dp))
            Text(
                if (ui.mode == CaptureMode.VIDEO) "${ui.videoRes.label} · ${ui.fps}"
                else if (ui.photoRes == PhotoResolution.MAX) "${ui.maxPhotoMp} MP" else "12 MP",
                color = p.text, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, fontFamily = FontFamily.Monospace,
                modifier = Modifier
                    .clip(RoundedCornerShape(10.dp))
                    .border(1.dp, p.line, RoundedCornerShape(10.dp))
                    .clickable(enabled = !ui.recording) { ui.settingsOpen = true }
                    .padding(horizontal = 9.dp, vertical = 5.dp),
            )
        }
        Column(
            Modifier
                .clip(RoundedCornerShape(12.dp))
                .clickable(enabled = !ui.recording) { ui.dock = if (ui.dock == Dock.LOOKS) Dock.NONE else Dock.LOOKS }
                .padding(horizontal = 10.dp, vertical = 2.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(ui.camera.name, color = p.text, fontSize = 21.sp, fontFamily = SerifDisplay, maxLines = 1)
            Text(
                (listOf(ui.look.stock.name, ui.look.shutter.label) +
                    if (ui.mode == CaptureMode.VIDEO && ui.look.frameRate != FilmFrameRate.NATIVE) listOf("${ui.look.frameRate.label}fps") else emptyList())
                    .joinToString("  ·  ").uppercase(),
                color = p.muted, fontSize = 9.sp, letterSpacing = 1.2.sp, maxLines = 1,
            )
        }
        Row(Modifier.weight(1f), horizontalArrangement = Arrangement.End) {
            IconCircle(Ico.Tune, rotation = iconRotation, enabled = !ui.recording) { ui.settingsOpen = true }
        }
    }
}

@Composable
fun IconCircle(
    icon: ImageVector,
    modifier: Modifier = Modifier,
    size: Dp = 40.dp,
    enabled: Boolean = true,
    selected: Boolean = false,
    rotation: Float = 0f,
    tint: Color? = null,
    onClick: () -> Unit,
) {
    val p = LocalPalette.current
    Box(
        modifier
            .size(size)
            .clip(CircleShape)
            .background(if (selected) p.text else Color.Transparent)
            .clickable(enabled = enabled, onClick = onClick)
            .alpha(if (enabled) 1f else 0.3f),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, null, tint = if (selected) p.bg else tint ?: p.text, modifier = Modifier.size(22.dp).rotate(rotation))
    }
}

@Composable
fun Pill(text: String, filled: Boolean = false, enabled: Boolean = true, onClick: () -> Unit) {
    val p = LocalPalette.current
    Text(
        text, color = if (filled) p.bg else p.text, fontSize = 13.sp, fontWeight = FontWeight.Medium,
        modifier = Modifier
            .alpha(if (enabled) 1f else 0.35f)
            .clip(RoundedCornerShape(20.dp))
            .background(if (filled) p.text else Color.Transparent)
            .border(1.dp, if (filled) p.text else p.line, RoundedCornerShape(20.dp))
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 10.dp),
    )
}

// ------------------------------------------------------------------ viewfinder

@Composable
private fun Viewfinder(ui: UiState, actions: CameraActions, chrome: Float, iconRotation: Float) {
    val aspect = if (ui.mode == CaptureMode.PHOTO) 3f / 4f else 9f / 16f
    var focus by remember { mutableStateOf<Offset?>(null) }
    var focusKey by remember { mutableLongStateOf(0L) }
    val flash = remember { Animatable(0f) }
    LaunchedEffect(ui.flashPulse) {
        if (ui.flashPulse > 0) {
            flash.snapTo(0.85f)
            flash.animateTo(0f, tween(320))
        }
    }

    Box(
        Modifier
            .aspectRatio(aspect)
            .clip(RoundedCornerShape(22.dp))
            .background(Color.Black),
    ) {
        val still = LocalViewfinderStill.current
        if (still != null) {
            Image(still, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        } else {
            AndroidView(
                factory = { ctx -> TextureView(ctx).also { actions.bindPreview(it) } },
                modifier = Modifier.fillMaxSize(),
            )
        }
        if (ui.dock == Dock.TEXT) {
            TextEditorLayer(ui, actions)
        } else {
            Box(
                Modifier
                    .fillMaxSize()
                    .pointerInput(Unit) {
                        detectTapGestures { pos ->
                            focus = pos
                            focusKey = System.nanoTime()
                            actions.tapToFocus(pos.x, pos.y, size.width.toFloat(), size.height.toFloat())
                        }
                    }
                    .pointerInput(Unit) {
                        detectTransformGestures { _, _, zoom, _ -> if (zoom != 1f) actions.zoom(zoom) }
                    },
            )
        }
        focus?.let { pos -> FocusRing(pos, focusKey) { focus = null } }
        if (flash.value > 0f) Box(Modifier.fillMaxSize().background(Color.White.copy(alpha = flash.value)))

        Box(Modifier.fillMaxSize().alpha(chrome)) {
            if (ui.recording) RecordingBadge(ui, Modifier.align(Alignment.TopCenter).padding(top = 12.dp))
            StatusPill(ui, Modifier.align(Alignment.TopEnd).padding(12.dp))
            if (ui.halfFramePending) {
                GlassText("½  Take the second half", Modifier.align(Alignment.TopCenter).padding(top = 12.dp))
            }
            if (ui.dock == Dock.NONE || ui.recording) {
                ZoomPills(ui, actions, iconRotation, Modifier.align(Alignment.BottomCenter).padding(bottom = 12.dp))
            }
        }
        if (ui.zooming) {
            GlassText(zoomLabel(ui.zoom, true), Modifier.align(Alignment.Center), big = true)
        }
    }
}

@Composable
private fun GlassText(text: String, modifier: Modifier, big: Boolean = false) {
    Text(
        text, color = Color.White, fontSize = if (big) 15.sp else 12.sp, fontWeight = FontWeight.SemiBold,
        modifier = modifier
            .background(Glass, RoundedCornerShape(14.dp))
            .padding(horizontal = 12.dp, vertical = 6.dp),
    )
}

@Composable
private fun StatusPill(ui: UiState, modifier: Modifier) {
    val status = when {
        ui.sampling -> "Sampling"
        ui.savingVideo -> "Saving"
        ui.developing > 0 -> "Developing"
        else -> null
    } ?: return
    Row(
        modifier.background(Glass, RoundedCornerShape(14.dp)).padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CircularProgressIndicator(Modifier.size(11.dp), color = Color.White, strokeWidth = 1.5.dp)
        Spacer(Modifier.width(7.dp))
        Text(status, color = Color.White, fontSize = 11.sp)
    }
}

@Composable
private fun FocusRing(pos: Offset, key: Long, onDone: () -> Unit) {
    val anim = remember(key) { Animatable(1.4f) }
    LaunchedEffect(key) {
        anim.animateTo(1f, tween(220))
        delay(900)
        onDone()
    }
    val sizePx = with(LocalDensity.current) { 70.dp.toPx() }
    Canvas(
        Modifier
            .offset { IntOffset((pos.x - sizePx / 2).roundToInt(), (pos.y - sizePx / 2).roundToInt()) }
            .size(70.dp),
    ) {
        val s = size.minDimension / anim.value * 0.8f
        drawRoundRect(
            Color.White, Offset((size.width - s) / 2, (size.height - s) / 2), Size(s, s),
            CornerRadius(s * 0.18f), style = Stroke(1.2.dp.toPx()),
        )
    }
}

@Composable
private fun RecordingBadge(ui: UiState, modifier: Modifier) {
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(ui.recordStartMs) {
        while (true) { now = System.currentTimeMillis(); delay(250) }
    }
    val secs = ((now - ui.recordStartMs) / 1000).coerceAtLeast(0)
    val blink = (now / 500) % 2 == 0L
    Row(
        modifier.background(Glass, RoundedCornerShape(14.dp)).padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(7.dp).clip(CircleShape).background(if (blink) Color(0xFFF0553D) else Color(0x55F0553D)))
        Spacer(Modifier.width(8.dp))
        Text("%02d:%02d".format(secs / 60, secs % 60), color = Color.White, fontSize = 12.sp, fontFamily = FontFamily.Monospace)
        if (ui.encoderInfo.isNotEmpty()) {
            Text("   ${ui.encoderInfo}", color = Color.White.copy(alpha = 0.6f), fontSize = 10.sp, fontFamily = FontFamily.Monospace)
        }
    }
}

@Composable
private fun ZoomPills(ui: UiState, actions: CameraActions, iconRotation: Float, modifier: Modifier) {
    val stops = ui.zoomStops
    if (stops.size < 2) return
    val active = stops.filter { it <= ui.zoom * 1.001f }.maxOrNull() ?: stops.first()
    Row(
        modifier.background(Glass, RoundedCornerShape(20.dp)).padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        for (z in stops) {
            val sel = z == active
            val shown = if (sel && abs(ui.zoom - z) > 0.05f) ui.zoom else z
            Box(
                Modifier
                    .size(34.dp)
                    .clip(CircleShape)
                    .background(if (sel) Color.White.copy(alpha = 0.18f) else Color.Transparent)
                    .clickable { actions.setZoom(z) }
                    .rotate(iconRotation),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    zoomLabel(shown, sel), color = if (sel) Color(0xFFFFD27A) else Color.White,
                    fontSize = if (sel) 11.sp else 10.sp, fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}

fun zoomLabel(z: Float, selected: Boolean): String {
    val text = if (z >= 10f || abs(z - z.roundToInt()) < 0.05f) "${z.roundToInt()}" else "%.1f".format(z).trimStart('0')
    return if (selected) "$text×" else text
}

// ------------------------------------------------------------------ bottom

@Composable
private fun DockBar(ui: UiState, modifier: Modifier) {
    val p = LocalPalette.current
    Row(
        modifier.fillMaxWidth().padding(top = 4.dp),
        horizontalArrangement = Arrangement.SpaceEvenly,
    ) {
        for (d in listOf(Dock.LOOKS, Dock.ADJUST, Dock.FRAME, Dock.TEXT)) {
            val sel = ui.dock == d
            val icon = when (d) { Dock.LOOKS -> Ico.Film; Dock.ADJUST -> Ico.Adjust; Dock.FRAME -> Ico.Frame; else -> Ico.Text }
            Column(
                Modifier
                    .clip(RoundedCornerShape(14.dp))
                    .clickable(enabled = !ui.recording || d == Dock.TEXT) { ui.dock = if (sel) Dock.NONE else d }
                    .padding(horizontal = 14.dp, vertical = 6.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Icon(icon, null, tint = if (sel) p.text else p.muted, modifier = Modifier.size(21.dp))
                Spacer(Modifier.height(3.dp))
                Text(d.label, color = if (sel) p.text else p.muted, fontSize = 10.sp, letterSpacing = 0.4.sp)
                Spacer(Modifier.height(3.dp))
                Box(Modifier.size(3.dp).clip(CircleShape).background(if (sel) p.accent else Color.Transparent))
            }
        }
    }
}

@Composable
private fun ModeSwitch(ui: UiState, actions: CameraActions, modifier: Modifier) {
    val p = LocalPalette.current
    Row(modifier.fillMaxWidth().padding(top = 2.dp), horizontalArrangement = Arrangement.Center) {
        for (m in CaptureMode.entries) {
            val sel = ui.mode == m
            Text(
                if (m == CaptureMode.PHOTO) "PHOTO" else "VIDEO",
                color = if (sel) p.text else p.faint,
                fontSize = 11.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 2.4.sp,
                modifier = Modifier
                    .clip(RoundedCornerShape(10.dp))
                    .clickable(enabled = !ui.recording) { actions.setMode(m) }
                    .padding(horizontal = 14.dp, vertical = 6.dp),
            )
        }
    }
}

@Composable
private fun ShutterRow(ui: UiState, actions: CameraActions, iconRotation: Float, modifier: Modifier) {
    val p = LocalPalette.current
    Row(
        modifier.fillMaxWidth().padding(horizontal = 30.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(46.dp)
                .rotate(iconRotation)
                .clip(RoundedCornerShape(13.dp))
                .background(p.surfaceHigh)
                .border(1.dp, p.line, RoundedCornerShape(13.dp))
                .clickable(enabled = ui.lastUri != null) { actions.openLast() },
        ) {
            ui.thumbnail?.let { Image(it.asImageBitmap(), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop) }
        }
        Spacer(Modifier.weight(1f))
        ShutterButton(ui) { actions.shutter() }
        Spacer(Modifier.weight(1f))
        Box(
            Modifier.size(46.dp).clip(CircleShape).background(p.surfaceHigh).border(1.dp, p.line, CircleShape)
                .clickable(enabled = !ui.recording) { actions.switchFacing() },
            contentAlignment = Alignment.Center,
        ) { Icon(Ico.Flip, null, tint = p.text, modifier = Modifier.size(21.dp).rotate(iconRotation)) }
    }
}

@Composable
private fun ShutterButton(ui: UiState, onClick: () -> Unit) {
    val p = LocalPalette.current
    val video = ui.mode == CaptureMode.VIDEO
    val inner by animateFloatAsState(if (ui.recording) 0.38f else 0.8f, label = "shutterInner")
    val corner by animateFloatAsState(if (ui.recording) 0.22f else 0.5f, label = "shutterCorner")
    Box(
        Modifier
            .size(74.dp)
            .clip(CircleShape)
            .clickable(
                interactionSource = remember { MutableInteractionSource() }, indication = null,
                enabled = !ui.savingVideo && !ui.sampling, onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.fillMaxSize()) {
            drawCircle(p.text, radius = size.minDimension / 2 - 1.5.dp.toPx(), style = Stroke(2.dp.toPx()))
            val s = size.minDimension * inner
            drawRoundRect(
                color = if (video) p.danger else if (ui.halfFramePending) p.accent else p.text,
                topLeft = Offset((size.width - s) / 2, (size.height - s) / 2),
                size = Size(s, s),
                cornerRadius = CornerRadius(s * corner),
            )
        }
    }
}

/** A rounded card for trays, which fades to nothing in focus mode while its ruler stays. */
@Composable
fun TrayCard(chrome: Float, content: @Composable BoxScope.() -> Unit) {
    val p = LocalPalette.current
    Box(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp)
            .clip(RoundedCornerShape(22.dp))
            .background(p.surface.copy(alpha = 0.95f * chrome))
            .padding(vertical = 12.dp),
        content = content,
    )
}

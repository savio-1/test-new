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
            if (!ui.hasCamera && ui.edit == null && ui.screen == Screen.CAMERA) {
                PermissionPrompt(ui, actions)
                return@Box
            }
            when (ui.screen) {
                Screen.GALLERY -> { GalleryScreen(ui, actions); return@Box }
                Screen.VIEWER -> { ViewerScreen(ui, actions); return@Box }
                Screen.CAMERA -> Unit
            }
            val iconRotation by animateFloatAsState(
                when (ui.frameTurns and 3) { 1 -> -90f; 2 -> 180f; 3 -> 90f; else -> 0f },
                tween(260), label = "iconRotation",
            )

            Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
                TopBar(ui, actions, iconRotation, Modifier.alpha(chrome))
                QuickBar(ui, Modifier.alpha(chrome))
                Box(
                    Modifier.weight(1f).fillMaxWidth().padding(horizontal = 10.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Viewfinder(ui, actions, chrome, iconRotation)
                    ui.quick?.let { q ->
                        QuickPanel(q, ui, actions, Modifier.align(Alignment.TopCenter).padding(top = 6.dp).alpha(chrome))
                    }
                    AnimatedContent(
                        targetState = if ((ui.recording && ui.dock != Dock.TEXT) || ui.logActive) Dock.NONE else ui.dock,
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
                if (ui.edit != null) EditLabel(ui, Modifier.alpha(chrome)) else ModeSwitch(ui, actions, Modifier.alpha(chrome))
                ShutterRow(ui, actions, iconRotation, Modifier.alpha(chrome))
            }

            if (ui.progress >= 0f) ProgressVeil(ui)
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
    val edit = ui.edit
    Row(
        modifier.fillMaxWidth().height(56.dp).padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
            if (edit != null) {
                IconCircle(Ico.Close) { actions.cancelEdit() }
            } else {
                IconCircle(if (ui.flash) Ico.Flash else Ico.FlashOff, enabled = ui.hasFlash && !ui.logActive, rotation = iconRotation,
                    tint = if (ui.flash) p.accent else p.text) { actions.toggleFlash() }
            }
        }
        Column(
            Modifier
                .clip(RoundedCornerShape(12.dp))
                .clickable(enabled = !ui.recording && !ui.logActive) { ui.dock = if (ui.dock == Dock.LOOKS) Dock.NONE else Dock.LOOKS }
                .padding(horizontal = 10.dp, vertical = 2.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(if (ui.logActive) "Log" else ui.camera.name, color = p.text, fontSize = 21.sp, fontFamily = SerifDisplay, maxLines = 1)
            val sub = when {
                ui.logActive -> listOf("S-Log3", "Rec.709", if (ui.logInIsp) "in camera" else "approx.")
                edit != null -> listOf("Developing", ui.look.stock.name)
                else -> listOf(ui.look.stock.name, ui.look.shutter.label) +
                    if (ui.mode == CaptureMode.VIDEO && ui.look.frameRate != FilmFrameRate.NATIVE) listOf("${ui.look.frameRate.label}fps") else emptyList()
            }
            Text(sub.joinToString("  ·  ").uppercase(), color = p.muted, fontSize = 9.sp, letterSpacing = 1.2.sp, maxLines = 1)
        }
        Row(Modifier.weight(1f), horizontalArrangement = Arrangement.End) {
            if (edit == null) IconCircle(Ico.Gallery, rotation = iconRotation, enabled = !ui.recording) { actions.openGallery() }
            IconCircle(Ico.Tune, rotation = iconRotation, enabled = !ui.recording) { ui.settingsOpen = true }
        }
    }
}

/** Chips for the shot's shape and options; each opens a small panel over the picture. */
@Composable
private fun QuickBar(ui: UiState, modifier: Modifier) {
    val sideways = ui.frameTurns % 2 == 1
    val edit = ui.edit
    Row(
        modifier.fillMaxWidth().padding(bottom = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (edit != null) {
            QuickChip(ui, Quick.RATIO, Ico.Ratio, ui.editRatio?.label(false) ?: "Original")
            QuickChip(ui, null, null, if (edit.video) clipLabel(edit.durationMs) else "${edit.width}×${edit.height}")
            return@Row
        }
        val video = ui.mode == CaptureMode.VIDEO
        QuickChip(ui, Quick.RATIO, Ico.Ratio, (if (video) ui.videoRatio else ui.photoRatio).label(sideways))
        if (video) {
            QuickChip(ui, Quick.VIDEO, null, "${ui.videoRes.label} · ${ui.fps}")
            QuickChip(ui, Quick.LOG, Ico.Log, if (ui.log) "Log" else "Std", active = ui.log)
            QuickChip(ui, Quick.TIMER, Ico.Timer, timerLabel(ui.timerSeconds), active = ui.timerSeconds > 0)
        } else {
            QuickChip(ui, Quick.SIZE, null, ui.photoSize?.label ?: "—")
            QuickChip(ui, Quick.TIMER, Ico.Timer, timerLabel(ui.timerSeconds), active = ui.timerSeconds > 0)
            QuickChip(ui, Quick.BURST, Ico.Burst, burstLabel(ui.burstCount, ui.burstInterval), active = ui.burstCount != 1)
        }
    }
}

fun timerLabel(s: Int) = if (s == 0) "Off" else "${s}s"
fun burstLabel(count: Int, interval: Float) = when (count) {
    1 -> "Off"
    0 -> "∞ · ${intervalLabel(interval)}"
    else -> "$count · ${intervalLabel(interval)}"
}
fun intervalLabel(v: Float) = if (v < 1f) "${v}s" else "${v.roundToInt()}s"
fun clipLabel(ms: Long): String { val s = (ms + 500) / 1000; return "%d:%02d".format(s / 60, s % 60) }

@Composable
private fun QuickChip(ui: UiState, quick: Quick?, icon: ImageVector?, text: String, active: Boolean = false) {
    val p = LocalPalette.current
    val open = quick != null && ui.quick == quick
    val shape = RoundedCornerShape(10.dp)
    Row(
        Modifier
            .clip(shape)
            .background(if (open) p.text else Color.Transparent)
            .border(1.dp, if (open) p.text else p.line, shape)
            .clickable(enabled = quick != null && !ui.recording) { ui.quick = if (open) null else quick }
            .padding(horizontal = 9.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val tint = if (open) p.bg else if (active) p.accent else p.text
        if (icon != null) {
            Icon(icon, null, tint = tint, modifier = Modifier.size(14.dp))
            Spacer(Modifier.width(5.dp))
        }
        Text(text, color = tint, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, fontFamily = FontFamily.Monospace, maxLines = 1)
    }
}

/** While a clip is being developed or trimmed: progress over everything, nothing to tap. */
@Composable
private fun ProgressVeil(ui: UiState) {
    val p = LocalPalette.current
    Box(
        Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.35f))
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {},
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier.width(220.dp).background(p.surface, RoundedCornerShape(18.dp)).border(1.dp, p.line, RoundedCornerShape(18.dp))
                .padding(18.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("${ui.progressLabel}  ${(ui.progress * 100).roundToInt()}%", color = p.text, fontSize = 14.sp)
            Spacer(Modifier.height(12.dp))
            Box(Modifier.fillMaxWidth().height(3.dp).clip(RoundedCornerShape(2.dp)).background(p.surfaceHigh)) {
                Box(Modifier.fillMaxWidth(ui.progress.coerceIn(0f, 1f)).height(3.dp).background(p.accent))
            }
        }
    }
}

@Composable
private fun EditLabel(ui: UiState, modifier: Modifier) {
    val p = LocalPalette.current
    val e = ui.edit ?: return
    Row(modifier.fillMaxWidth().padding(top = 2.dp), horizontalArrangement = Arrangement.Center) {
        Text(
            (if (e.video) "IMPORTED CLIP" else "IMPORTED PHOTO") + "  ·  SHUTTER SAVES A COPY",
            color = p.muted, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.6.sp,
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp),
        )
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
    val aspect = ui.frameAspect
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
        if (ui.dock == Dock.TEXT && !ui.logActive) {
            TextEditorLayer(ui, actions)
        } else if (ui.edit != null) {
            Box(Modifier.fillMaxSize().pointerInput(Unit) { detectTapGestures { ui.quick = null } })
        } else {
            Box(
                Modifier
                    .fillMaxSize()
                    .pointerInput(Unit) {
                        detectTapGestures { pos ->
                            if (ui.quick != null) { ui.quick = null; return@detectTapGestures }
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
            if (ui.burstTotal >= 0) {
                GlassText(
                    if (ui.burstTotal == 0) "Burst  ${ui.burstTaken}" else "Burst  ${ui.burstTaken} / ${ui.burstTotal}",
                    Modifier.align(Alignment.TopCenter).padding(top = 12.dp),
                )
            }
            if (ui.edit == null && (ui.dock == Dock.NONE || ui.recording)) {
                ZoomPills(ui, actions, iconRotation, Modifier.align(Alignment.BottomCenter).padding(bottom = 12.dp))
            }
        }
        if (ui.zooming) {
            GlassText(zoomLabel(ui.zoom, true), Modifier.align(Alignment.Center), big = true)
        }
        if (ui.countdown > 0) {
            Box(
                Modifier.align(Alignment.Center).size(132.dp).background(Glass, CircleShape).rotate(iconRotation),
                contentAlignment = Alignment.Center,
            ) {
                Text("${ui.countdown}", color = Color.White, fontSize = 76.sp, fontFamily = SerifDisplay)
            }
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
        ui.logActive -> if (ui.logInIsp) "Log" else "Log · approx."
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
                    .alpha(if (ui.logActive) 0.35f else 1f)
                    .clickable(enabled = (!ui.recording || d == Dock.TEXT) && !ui.logActive) { ui.dock = if (sel) Dock.NONE else d }
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
                .clickable(enabled = !ui.recording) { actions.openLast() },
            contentAlignment = Alignment.Center,
        ) {
            val thumb = ui.thumbnail
            if (thumb != null) Image(thumb.asImageBitmap(), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            else Icon(Ico.Gallery, null, tint = p.muted, modifier = Modifier.size(18.dp))
        }
        Spacer(Modifier.weight(1f))
        ShutterButton(ui) { actions.shutter() }
        Spacer(Modifier.weight(1f))
        Box(
            Modifier.size(46.dp).clip(CircleShape).background(p.surfaceHigh).border(1.dp, p.line, CircleShape)
                .clickable(enabled = !ui.recording) { if (ui.edit != null) actions.importMedia() else actions.switchFacing() },
            contentAlignment = Alignment.Center,
        ) {
            Icon(if (ui.edit != null) Ico.Import else Ico.Flip, null, tint = p.text, modifier = Modifier.size(21.dp).rotate(iconRotation))
        }
    }
}

@Composable
private fun ShutterButton(ui: UiState, onClick: () -> Unit) {
    val p = LocalPalette.current
    val video = ui.mode == CaptureMode.VIDEO && ui.edit == null
    val stop = ui.recording || ui.seriesRunning
    val inner by animateFloatAsState(if (stop) 0.38f else 0.8f, label = "shutterInner")
    val corner by animateFloatAsState(if (stop) 0.22f else 0.5f, label = "shutterCorner")
    Box(
        Modifier
            .size(74.dp)
            .clip(CircleShape)
            .clickable(
                interactionSource = remember { MutableInteractionSource() }, indication = null,
                enabled = !ui.savingVideo && !ui.sampling && ui.progress < 0f, onClick = onClick,
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
        if (ui.edit != null) Icon(Ico.Check, null, tint = p.bg, modifier = Modifier.size(28.dp))
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

package app.filmcam.ui

import android.view.TextureView
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.scaleIn
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.runtime.rememberUpdatedState
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.ui.text.style.TextAlign
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
            // Pages cross-fade with a slight settle, so moving between them feels continuous.
            AnimatedContent(
                ui.screen,
                transitionSpec = {
                    (fadeIn(tween(220, delayMillis = 40)) + scaleIn(tween(260), initialScale = 0.985f)) togetherWith fadeOut(tween(140))
                },
                label = "screen",
            ) { screen ->
                when (screen) {
                    Screen.GALLERY -> GalleryScreen(ui, actions)
                    Screen.VIEWER -> ViewerScreen(ui, actions)
                    Screen.SUBTITLES -> SubtitleScreen(ui, actions)
                    Screen.CAMERA -> CameraPage(ui, actions, chrome)
                }
            }
            // Messages show over whichever page is open.
            Toast(ui, Modifier.align(Alignment.Center))
        }
    }
}

@Composable
private fun CameraPage(ui: UiState, actions: CameraActions, chrome: Float) {
    val p = LocalPalette.current
    Box(Modifier.fillMaxSize()) {
        val iconRotation by animateFloatAsState(
            when (ui.frameTurns and 3) { 1 -> -90f; 2 -> 180f; 3 -> 90f; else -> 0f },
            tween(260), label = "iconRotation",
        )

        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
            TopBar(ui, actions, iconRotation, Modifier.alpha(chrome))
            QuickBar(ui, actions, Modifier.alpha(chrome))
            Box(
                Modifier.weight(1f).fillMaxWidth().padding(horizontal = 10.dp)
                    // A tap anywhere outside a tray or panel closes it.
                    .pointerInput(Unit) { detectTapGestures { ui.dock = Dock.NONE; ui.quick = null } },
                contentAlignment = Alignment.Center,
            ) {
                Viewfinder(ui, actions, chrome, iconRotation)
                AnimatedContent(
                    ui.quick,
                    transitionSpec = {
                        (fadeIn(tween(160)) + scaleIn(tween(200), initialScale = 0.96f, transformOrigin = TransformOrigin(0.5f, 0f))) togetherWith
                            fadeOut(tween(110))
                    },
                    modifier = Modifier.align(Alignment.TopCenter).padding(top = 6.dp).alpha(chrome),
                    label = "quick",
                ) { q -> if (q != null) QuickPanel(q, ui, actions, Modifier) else Spacer(Modifier.height(0.dp)) }
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
        AnimatedVisibility(ui.settingsOpen, enter = fadeIn(tween(180)), exit = fadeOut(tween(160))) { SettingsSheet(ui, actions) }
        AnimatedVisibility(ui.editingText, enter = fadeIn(tween(160)), exit = fadeOut(tween(140))) { TextEditOverlay(ui, actions) }
    }
}

/** A short message, faded and lifted in, then out. */
@Composable
private fun Toast(ui: UiState, modifier: Modifier) {
    val p = LocalPalette.current
    var shown by remember { mutableStateOf("") }
    ui.message?.let { msg ->
        shown = msg
        LaunchedEffect(msg) { delay(2600); ui.message = null }
    }
    AnimatedVisibility(
        ui.message != null, modifier,
        enter = fadeIn(tween(180)) + slideInVertically(tween(240)) { it / 3 },
        exit = fadeOut(tween(200)) + slideOutVertically(tween(220)) { -it / 4 },
    ) {
        Text(
            shown, color = p.text, fontSize = 13.sp,
            modifier = Modifier
                .padding(32.dp)
                .background(p.surface, Corners.small)
                .border(1.dp, p.line, Corners.small)
                .padding(horizontal = 16.dp, vertical = 12.dp),
        )
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
        Text("FilmCam", color = p.text, fontSize = 38.sp, fontFamily = UiType.sans)
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
                .clip(Corners.medium)
                .clickable(enabled = !ui.recording && !ui.logActive) {
                    ui.dock = if (ui.dock == Dock.LOOKS) Dock.NONE else Dock.LOOKS
                }
                .padding(horizontal = 10.dp, vertical = 2.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            AnimatedContent(if (ui.logActive) "Log" else ui.camera.name, transitionSpec = {
                (fadeIn(tween(200)) + slideInVertically(tween(240)) { it / 3 }) togetherWith (fadeOut(tween(120)) + slideOutVertically(tween(160)) { -it / 3 })
            }, label = "title") { name ->
                Text(name, color = p.text, fontSize = 18.sp, fontWeight = FontWeight.Medium, maxLines = 1)
            }
            val sub = when {
                ui.logActive -> ui.logSummary
                ui.isOriginal && edit == null -> listOf("No look", if (ui.mode == CaptureMode.VIDEO) "Video" else "Photo")
                edit != null -> listOf("Developing", ui.look.stock.name)
                else -> listOf(ui.look.stock.name, ui.look.shutter.label) +
                    if (ui.mode == CaptureMode.VIDEO && ui.look.frameRate != FilmFrameRate.NATIVE) listOf("${ui.look.frameRate.label}fps") else emptyList()
            }
            Text(sub.joinToString("  ·  ").uppercase(), color = p.muted, fontSize = 9.sp, letterSpacing = 1.2.sp, maxLines = 1, fontFamily = UiType.mono)
        }
        Row(Modifier.weight(1f), horizontalArrangement = Arrangement.End) {
            if (edit == null) IconCircle(Ico.Gallery, rotation = iconRotation, enabled = !ui.recording) { actions.openGallery() }
            IconCircle(Ico.Tune, rotation = iconRotation, enabled = !ui.recording) { ui.settingsOpen = true }
        }
    }
}

/** Chips for the shot's shape and options; each opens a small panel over the picture. */
@Composable
private fun QuickBar(ui: UiState, actions: CameraActions, modifier: Modifier) {
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
            if (ui.rawSupported) ToggleChip("RAW", ui.raw, enabled = ui.photoSize?.maxRes != true) { actions.setRaw(!ui.raw) }
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
    val shape = Corners.small
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
        Text(text, color = tint, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, fontFamily = UiType.mono, maxLines = 1)
    }
}

/** A chip that switches something on and off (RAW). */
@Composable
private fun ToggleChip(text: String, on: Boolean, enabled: Boolean = true, onClick: () -> Unit) {
    val p = LocalPalette.current
    val shape = Corners.small
    Text(
        text, color = if (on && enabled) p.bg else p.text, fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
        fontFamily = UiType.mono,
        modifier = Modifier
            .alpha(if (enabled) 1f else 0.35f)
            .clip(shape)
            .background(if (on && enabled) p.accent else Color.Transparent)
            .border(1.dp, if (on && enabled) p.accent else p.line, shape)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 9.dp, vertical = 5.dp),
    )
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
            Modifier.width(220.dp).background(p.surface, Corners.small).border(1.dp, p.line, Corners.small)
                .padding(18.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("${ui.progressLabel}  ${(ui.progress * 100).roundToInt()}%", color = p.text, fontSize = 14.sp)
            Spacer(Modifier.height(12.dp))
            Box(Modifier.fillMaxWidth().height(3.dp).clip(Corners.small).background(p.surfaceHigh)) {
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
            .clip(Corners.small)
            .background(if (filled) p.text else Color.Transparent)
            .border(1.dp, if (filled) p.text else p.line, Corners.small)
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
    var exposureActive by remember { mutableStateOf(false) }
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
            .clip(Corners.large)
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
            Box(Modifier.fillMaxSize().pointerInput(Unit) { detectTapGestures { ui.quick = null; ui.dock = Dock.NONE } })
        } else {
            val look by rememberUpdatedState(ui.look)
            Box(
                Modifier
                    .fillMaxSize()
                    .pointerInput(Unit) {
                        // One gesture handler, like a phone's own camera: tap to focus and meter
                        // there; then drag up or down to brighten or darken; pinch to zoom.
                        awaitEachGesture {
                            val down = awaitFirstDown()
                            var moved = false
                            var pinch = false
                            var exposing = false
                            val startEv = look.exposureEv
                            do {
                                val ev = awaitPointerEvent()
                                if (ev.changes.size > 1) {
                                    pinch = true
                                    val z = ev.calculateZoom()
                                    if (z != 1f) actions.zoom(z)
                                    ev.changes.forEach { it.consume() }
                                } else if (!pinch) {
                                    val c = ev.changes[0]
                                    val d = c.position - down.position
                                    if (!moved && d.getDistance() > viewConfiguration.touchSlop) moved = true
                                    if (moved && focus != null && (exposing || abs(d.y) > abs(d.x))) {
                                        exposing = true
                                        exposureActive = true
                                        focusKey = System.nanoTime()
                                        // Half the frame's height spans the whole range.
                                        val span = (ui.evMax - ui.evMin)
                                        val v = (startEv - d.y / (size.height * 0.5f) * span / 2f).coerceIn(ui.evMin, ui.evMax)
                                        val stepped = (v * 10).roundToInt() / 10f
                                        if (stepped != look.exposureEv) actions.updateLook(look.copy(exposureEv = stepped))
                                        c.consume()
                                    }
                                }
                            } while (ev.changes.any { it.pressed })
                            exposureActive = false
                            if (!moved && !pinch) {
                                // With a tray or panel open, a tap on the picture closes it rather than focusing.
                                if (ui.quick != null || ui.dock != Dock.NONE) {
                                    ui.quick = null; ui.dock = Dock.NONE
                                } else {
                                    focus = down.position
                                    focusKey = System.nanoTime()
                                    actions.tapToFocus(down.position.x, down.position.y, size.width.toFloat(), size.height.toFloat())
                                    // A new spot meters afresh.
                                    if (look.exposureEv != 0f) actions.updateLook(look.copy(exposureEv = 0f))
                                }
                            }
                        }
                    },
            )
        }
        focus?.let { pos ->
            FocusRing(pos, focusKey, ui.look.exposureEv, ui.evMin, ui.evMax, exposureActive, iconRotation) { focus = null }
        }
        if (flash.value > 0f) Box(Modifier.fillMaxSize().background(Color.White.copy(alpha = flash.value)))

        Box(Modifier.fillMaxSize().alpha(chrome)) {
            if (ui.recording) RecordingBadge(ui, Modifier.align(Alignment.TopCenter).padding(top = 12.dp))
            if (ui.mode == CaptureMode.VIDEO && ui.edit == null) {
                CaptionToggle(ui, actions, Modifier.align(Alignment.TopStart).padding(12.dp))
            }
            // Live subtitles show here only: they are kept with the clip to edit and burn in later.
            ui.liveCaption?.let { line ->
                Text(
                    line, color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center,
                    modifier = Modifier.align(Alignment.BottomCenter).padding(start = 24.dp, end = 24.dp, bottom = 70.dp)
                        .background(Color(0x99000000), Corners.small).padding(horizontal = 10.dp, vertical = 5.dp),
                )
            }
            if (ui.captionsFor != null && !ui.recording && !ui.savingVideo && ui.edit == null) {
                Text(
                    "Edit live subtitles  ›", color = Color.Black, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 70.dp).clip(Corners.small)
                        .background(Color.White).clickable { actions.editLiveSubtitles() }
                        .padding(horizontal = 16.dp, vertical = 9.dp),
                )
            }
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
                Text("${ui.countdown}", color = Color.White, fontSize = 76.sp, fontFamily = UiType.sans)
            }
        }
    }
}

@Composable
private fun GlassText(text: String, modifier: Modifier, big: Boolean = false) {
    Text(
        text, color = Color.White, fontSize = if (big) 15.sp else 12.sp, fontWeight = FontWeight.SemiBold,
        modifier = modifier
            .background(Glass, Corners.medium)
            .padding(horizontal = 12.dp, vertical = 6.dp),
    )
}

@Composable
private fun StatusPill(ui: UiState, modifier: Modifier) {
    val status = when {
        ui.sampling -> "Sampling"
        ui.savingVideo -> "Saving"
        ui.developing > 0 -> "Developing"
        ui.logActive -> when (ui.logPath) {
            LogPath.HLG10 -> "Log · 10-bit"
            LogPath.ISP -> "Log"
            LogPath.GPU -> "Log · approx."
        }
        else -> null
    } ?: return
    Row(
        modifier.background(Glass, Corners.medium).padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CircularProgressIndicator(Modifier.size(11.dp), color = Color.White, strokeWidth = 1.5.dp)
        Spacer(Modifier.width(7.dp))
        Text(status, color = Color.White, fontSize = 11.sp)
    }
}

/**
 * Where the camera focuses and meters, with the exposure beside it: a sun on a short line that
 * moves as the picture is brightened or darkened (drag up or down anywhere on the picture).
 * It settles in, waits while in use and fades away a few seconds after the last touch.
 */
@Composable
private fun FocusRing(
    pos: Offset, key: Long, ev: Float, evMin: Float, evMax: Float, active: Boolean, rotation: Float, onDone: () -> Unit,
) {
    val settle = remember(pos) { Animatable(1.35f) }
    val fade = remember(pos) { Animatable(1f) }
    LaunchedEffect(pos) { settle.animateTo(1f, spring(dampingRatio = 0.6f, stiffness = Spring.StiffnessMediumLow)) }
    LaunchedEffect(key, active) {
        if (active) { fade.snapTo(1f); return@LaunchedEffect }
        fade.snapTo(1f)
        delay(2600)
        fade.animateTo(0f, tween(400))
        onDone()
    }
    val box = 74.dp
    val density = LocalDensity.current
    val boxPx = with(density) { box.toPx() }
    val gold = Color(0xFFFFD27A)
    Box(
        Modifier
            .offset { IntOffset((pos.x - boxPx / 2).roundToInt(), (pos.y - boxPx / 2).roundToInt()) }
            .alpha(fade.value),
    ) {
        Canvas(Modifier.size(box)) {
            val s = size.minDimension * 0.78f / settle.value
            drawRoundRect(
                gold, Offset((size.width - s) / 2, (size.height - s) / 2), Size(s, s),
                CornerRadius(s * 0.08f), style = Stroke(1.2.dp.toPx()),
            )
        }
        // The exposure line, to the right of the box: the sun sits at the current value.
        val f = ((ev - evMin) / (evMax - evMin)).coerceIn(0f, 1f)
        Canvas(Modifier.offset(x = box + 4.dp).size(22.dp, box)) {
            val x = size.width / 2
            val sunY = size.height * (1f - f)
            val r = 5.dp.toPx()
            if (sunY - r * 1.8f > 0f) drawLine(gold.copy(alpha = 0.7f), Offset(x, 0f), Offset(x, sunY - r * 1.8f), 1.dp.toPx())
            if (sunY + r * 1.8f < size.height) drawLine(gold.copy(alpha = 0.7f), Offset(x, sunY + r * 1.8f), Offset(x, size.height), 1.dp.toPx())
            drawCircle(gold, r * 0.62f, Offset(x, sunY))
            for (k in 0 until 8) {
                val a = k * Math.PI / 4
                val c = Offset(x, sunY)
                val d = Offset(kotlin.math.cos(a).toFloat(), kotlin.math.sin(a).toFloat())
                drawLine(gold, c + d * (r * 0.95f), c + d * (r * 1.4f), 1.dp.toPx())
            }
        }
        if (active || ev != 0f) {
            Text(
                "%+.1f".format(ev), color = gold, fontSize = 11.sp, fontFamily = UiType.mono,
                modifier = Modifier.offset(x = box + 28.dp, y = box / 2 - 8.dp).rotate(rotation),
            )
        }
    }
}

/** Live subtitles: CC on/off (also while recording) and the language spoken. */
@Composable
private fun CaptionToggle(ui: UiState, actions: CameraActions, modifier: Modifier) {
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        val on = ui.liveCaptions
        Text(
            "CC", color = if (on) Color.Black else Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold,
            modifier = Modifier.clip(Corners.small).background(if (on) Color.White else Glass)
                .clickable { actions.setLiveCaptions(!on) }.padding(horizontal = 10.dp, vertical = 6.dp),
        )
        if (on) Text(
            if (ui.captionLanguage == "te") "తెలుగు" else "English", color = Color.White, fontSize = 12.sp,
            modifier = Modifier.clip(Corners.small).background(Glass)
                .clickable { actions.setCaptionLanguage(if (ui.captionLanguage == "te") "en" else "te") }
                .padding(horizontal = 10.dp, vertical = 6.dp),
        )
        // What the recognizer is doing, so a silent failure can't pass for "nobody spoke".
        if (on && ui.recording && ui.captionState.isNotEmpty()) Text(
            ui.captionState, color = Color.White.copy(alpha = 0.8f), fontSize = 11.sp, maxLines = 2,
            modifier = Modifier.widthIn(max = 180.dp).clip(Corners.small).background(Glass)
                .padding(horizontal = 8.dp, vertical = 6.dp),
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
        modifier.background(Glass, Corners.medium).padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(7.dp).clip(CircleShape).background(if (blink) Color(0xFFF0553D) else Color(0x55F0553D)))
        Spacer(Modifier.width(8.dp))
        Text("%02d:%02d".format(secs / 60, secs % 60), color = Color.White, fontSize = 12.sp, fontFamily = UiType.mono)
        if (ui.encoderInfo.isNotEmpty()) {
            Text("   ${ui.encoderInfo}", color = Color.White.copy(alpha = 0.6f), fontSize = 10.sp, fontFamily = UiType.mono)
        }
    }
}

@Composable
private fun ZoomPills(ui: UiState, actions: CameraActions, iconRotation: Float, modifier: Modifier) {
    val stops = ui.zoomStops
    if (stops.size < 2) return
    val active = stops.filter { it <= ui.zoom * 1.001f }.maxOrNull() ?: stops.first()
    Row(
        modifier.background(Glass, Corners.small).padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        for (z in stops) {
            val sel = z == active
            val shown = if (sel && abs(ui.zoom - z) > 0.05f) ui.zoom else z
            val ground by animateColorAsState(if (sel) Color.White.copy(alpha = 0.18f) else Color.White.copy(alpha = 0f), tween(180), label = "zoom")
            Box(
                Modifier
                    .size(34.dp)
                    .clip(CircleShape)
                    .background(ground)
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
            val icon = when (d) {
                Dock.LOOKS -> Ico.Film; Dock.ADJUST -> Ico.Adjust; Dock.FRAME -> Ico.Frame; else -> Ico.Text
            }
            // The chosen dock sits in a hairline box on a slightly lifted ground, as in an editor's rail.
            val ink by animateColorAsState(if (sel) p.text else p.muted, tween(180), label = "dockInk")
            val frame by animateColorAsState(if (sel) p.text.copy(alpha = 0.55f) else p.line.copy(alpha = 0f), tween(200), label = "dockFrame")
            val ground by animateColorAsState(if (sel) p.surfaceHigh else p.surfaceHigh.copy(alpha = 0f), tween(200), label = "dockGround")
            Column(
                Modifier
                    .width(72.dp)
                    .clip(Corners.small)
                    .background(ground)
                    .border(1.dp, frame, Corners.small)
                    .alpha(if (ui.logActive) 0.35f else 1f)
                    .clickable(enabled = (!ui.recording || d == Dock.TEXT) && !ui.logActive) { ui.dock = if (sel) Dock.NONE else d }
                    .padding(vertical = 7.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Icon(icon, null, tint = ink, modifier = Modifier.size(21.dp))
                Spacer(Modifier.height(4.dp))
                Text(d.label, color = ink, fontSize = 11.sp)
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
            val ink by animateColorAsState(if (sel) p.text else p.faint, tween(200), label = "mode")
            Text(
                if (m == CaptureMode.PHOTO) "PHOTO" else "VIDEO",
                color = ink, fontFamily = UiType.mono,
                fontSize = 11.sp, letterSpacing = 2.4.sp,
                modifier = Modifier
                    .clip(Corners.small)
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
                .clip(Corners.medium)
                .background(p.surfaceHigh)
                .border(1.dp, p.line, Corners.medium)
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
            Modifier.size(46.dp).clip(Corners.small).background(p.surfaceHigh).border(1.dp, p.line, Corners.small)
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
                interactionSource = remember { MutableInteractionSource() }, indication = GentlePress,
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
            .clip(Corners.large)
            .background(p.surface.copy(alpha = 0.96f * chrome))
            .border(1.dp, p.line.copy(alpha = chrome), Corners.large)
            // The card keeps its own taps, so only taps outside it close it.
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {}
            .padding(vertical = 12.dp),
        content = content,
    )
}

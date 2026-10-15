package app.filmcam.ui

import android.view.SurfaceView
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import app.filmcam.camera.CaptureMode
import app.filmcam.film.CameraCategory
import app.filmcam.film.FilmCamera
import app.filmcam.film.FilmCameras
import app.filmcam.film.FilmFrameRate
import app.filmcam.film.MultiShot
import kotlinx.coroutines.delay
import kotlin.math.roundToInt

val Ink = Color(0xFF0E0C0B)
val Panel = Color(0xE61A1715)
val Cream = Color(0xFFF2E6D0)
val Muted = Color(0xFF9C9284)
val Amber = Color(0xFFF2A33A)
val RecRed = Color(0xFFE5402B)

@Composable
fun CameraScreen(ui: UiState, actions: CameraActions) {
    Box(Modifier.fillMaxSize().background(Ink)) {
        if (!ui.hasCamera) {
            PermissionPrompt(ui, actions)
            return@Box
        }
        val iconRotation by animateFloatAsState(
            when (ui.quarterTurns and 3) { 1 -> -90f; 2 -> 180f; 3 -> 90f; else -> 0f },
            tween(260), label = "iconRotation",
        )

        Column(Modifier.fillMaxSize()) {
            TopBar(ui, actions, iconRotation)
            // Fits the width on phones; on short, wide windows it fits the height instead.
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
                Viewfinder(ui, actions)
            }
        }

        Column(
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .background(Brush.verticalGradient(listOf(Color.Transparent, Ink.copy(alpha = 0.92f), Ink), startY = 0f, endY = 220f))
                .navigationBarsPadding()
                .padding(top = 18.dp, bottom = 10.dp),
        ) {
            AnimatedVisibility(
                ui.sheet != Sheet.NONE && !ui.recording,
                enter = fadeIn() + slideInVertically { it / 3 },
                exit = fadeOut() + slideOutVertically { it / 3 },
            ) {
                when (ui.sheet) {
                    Sheet.DEVELOP -> DevelopPanel(ui, actions)
                    Sheet.BORDER -> BorderPanel(ui, actions)
                    Sheet.CAMERA -> CameraSettingsPanel(ui, actions)
                    Sheet.NONE -> Unit
                }
            }
            if (ui.sheet == Sheet.NONE || ui.sheet == Sheet.DEVELOP) {
                CategoryTabs(ui)
                Spacer(Modifier.height(6.dp))
                CameraStrip(ui, actions)
                Spacer(Modifier.height(8.dp))
            }
            LensRow(ui, actions, iconRotation)
            Spacer(Modifier.height(6.dp))
            ModeSwitch(ui, actions)
            Spacer(Modifier.height(8.dp))
            ShutterRow(ui, actions, iconRotation)
        }

        ui.message?.let { msg ->
            LaunchedEffect(msg) { delay(2600); ui.message = null }
            Text(
                msg, color = Cream, fontSize = 13.sp,
                modifier = Modifier
                    .align(Alignment.Center)
                    .padding(24.dp)
                    .background(Panel, RoundedCornerShape(10.dp))
                    .padding(horizontal = 14.dp, vertical = 10.dp),
            )
        }
    }
}

@Composable
private fun PermissionPrompt(ui: UiState, actions: CameraActions) {
    Column(
        Modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("FilmCam", color = Cream, fontSize = 30.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
        Spacer(Modifier.height(10.dp))
        Text(
            "Shoots photos and video through a live film emulsion: grain, halation, light leaks and all. " +
                "It needs the camera, and the microphone for sound on video.",
            color = Muted, fontSize = 14.sp, lineHeight = 20.sp,
        )
        Spacer(Modifier.height(24.dp))
        if (ui.permissionAsked) {
            Text(
                "Allow camera access",
                color = Ink, fontWeight = FontWeight.SemiBold,
                modifier = Modifier
                    .clip(RoundedCornerShape(24.dp))
                    .background(Amber)
                    .clickable { actions.requestPermissions() }
                    .padding(horizontal = 22.dp, vertical = 12.dp),
            )
        }
    }
}

@Composable
private fun TopBar(ui: UiState, actions: CameraActions, iconRotation: Float) {
    fun toggle(p: Sheet) { ui.sheet = if (ui.sheet == p) Sheet.NONE else p }
    Row(
        Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RoundButton(onClick = { actions.toggleFlash() }, enabled = ui.hasFlash) {
            FlashIcon(ui.flash, if (ui.flash) Amber else Cream, Modifier.rotate(iconRotation))
        }
        Spacer(Modifier.width(8.dp))
        // Format chip: resolution and frame rate; opens the camera settings.
        Text(
            if (ui.mode == CaptureMode.VIDEO) "${ui.videoRes.label} · ${ui.fps}" else
                if (ui.photoRes.name == "MAX") "${ui.maxPhotoMp} MP" else "12 MP",
            color = if (ui.sheet == Sheet.CAMERA) Ink else Cream,
            fontSize = 12.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace,
            modifier = Modifier
                .clip(RoundedCornerShape(14.dp))
                .background(if (ui.sheet == Sheet.CAMERA) Amber else Color.White.copy(alpha = 0.08f))
                .clickable(enabled = !ui.recording) { toggle(Sheet.CAMERA) }
                .padding(horizontal = 10.dp, vertical = 8.dp),
        )
        Spacer(Modifier.weight(1f))
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(ui.camera.name.uppercase(), color = Cream, fontSize = 13.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.sp, maxLines = 1)
            Text(
                "${ui.look.stock.name} · ${ui.look.shutter.label}" +
                    if (ui.mode == CaptureMode.VIDEO && ui.look.frameRate != FilmFrameRate.NATIVE) " · ${ui.look.frameRate.label}f" else "",
                color = Muted, fontSize = 10.sp, fontFamily = FontFamily.Monospace, maxLines = 1,
            )
        }
        Spacer(Modifier.weight(1f))
        RoundButton(onClick = { toggle(Sheet.BORDER) }, active = ui.sheet == Sheet.BORDER) {
            FrameIcon(if (ui.sheet == Sheet.BORDER) Ink else Cream, Modifier.rotate(iconRotation))
        }
        Spacer(Modifier.width(8.dp))
        RoundButton(onClick = { toggle(Sheet.DEVELOP) }, active = ui.sheet == Sheet.DEVELOP) {
            SlidersIcon(if (ui.sheet == Sheet.DEVELOP) Ink else Cream, Modifier.rotate(iconRotation))
        }
    }
}

@Composable
fun RoundButton(
    onClick: () -> Unit,
    enabled: Boolean = true,
    active: Boolean = false,
    content: @Composable () -> Unit,
) {
    Box(
        Modifier
            .size(42.dp)
            .clip(CircleShape)
            .background(if (active) Amber else Color.White.copy(alpha = 0.08f))
            .clickable(enabled = enabled, onClick = onClick)
            .alpha(if (enabled) 1f else 0.35f),
        contentAlignment = Alignment.Center,
    ) { content() }
}

@Composable
private fun Viewfinder(ui: UiState, actions: CameraActions) {
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

    Box(Modifier.aspectRatio(aspect)) {
        AndroidView(
            factory = { ctx -> SurfaceView(ctx).also { actions.bindPreview(it) } },
            modifier = Modifier.fillMaxSize(),
        )
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
        focus?.let { pos -> FocusRing(pos, focusKey) { focus = null } }
        if (flash.value > 0f) {
            Box(Modifier.fillMaxSize().background(Color.White.copy(alpha = flash.value)))
        }
        if (ui.recording) RecordingBadge(ui, Modifier.align(Alignment.TopCenter).padding(top = 12.dp))
        if (ui.zooming) {
            Text(
                zoomLabel(ui.zoom, true), color = Ink, fontSize = 14.sp, fontWeight = FontWeight.Bold,
                modifier = Modifier.align(Alignment.Center).background(Cream.copy(alpha = 0.9f), CircleShape).padding(horizontal = 14.dp, vertical = 8.dp),
            )
        }
        val status = when {
            ui.sampling -> "Sampling 4 frames"
            ui.savingVideo -> "Saving"
            ui.developing > 0 -> "Developing"
            else -> null
        }
        if (status != null) {
            Row(
                Modifier
                    .align(Alignment.TopEnd)
                    .padding(12.dp)
                    .background(Panel, RoundedCornerShape(14.dp))
                    .padding(horizontal = 10.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CircularProgressIndicator(Modifier.size(12.dp), color = Amber, strokeWidth = 2.dp)
                Spacer(Modifier.width(6.dp))
                Text(status, color = Cream, fontSize = 11.sp)
            }
        }
        if (ui.halfFramePending) {
            Text(
                "½  First half taken. Shoot the second.",
                color = Ink, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = 12.dp)
                    .background(Amber, RoundedCornerShape(14.dp))
                    .padding(horizontal = 12.dp, vertical = 6.dp),
            )
        }
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
    val sizePx = with(LocalDensity.current) { 64.dp.toPx() }
    Canvas(
        Modifier
            .offset { IntOffset((pos.x - sizePx / 2).roundToInt(), (pos.y - sizePx / 2).roundToInt()) }
            .size(64.dp),
    ) {
        drawCircle(Amber, radius = size.minDimension / 2 / anim.value * 0.9f, style = Stroke(2.dp.toPx()))
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
        modifier
            .background(Panel, RoundedCornerShape(14.dp))
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(8.dp).clip(CircleShape).background(if (blink) RecRed else RecRed.copy(alpha = 0.3f)))
        Spacer(Modifier.width(8.dp))
        Text(
            "%02d:%02d  %s".format(secs / 60, secs % 60, ui.encoderInfo),
            color = Cream, fontSize = 12.sp, fontFamily = FontFamily.Monospace,
        )
    }
}

@Composable
private fun CategoryTabs(ui: UiState) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 14.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        modifier = Modifier.alpha(if (ui.recording) 0.4f else 1f),
    ) {
        items(CameraCategory.entries) { cat ->
            val sel = ui.category == cat
            Text(
                cat.label.uppercase(),
                color = if (sel) Amber else Muted, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.5.sp,
                modifier = Modifier
                    .clip(RoundedCornerShape(10.dp))
                    .clickable(enabled = !ui.recording) { ui.category = cat }
                    .padding(horizontal = 10.dp, vertical = 4.dp),
            )
        }
    }
}

@Composable
private fun CameraStrip(ui: UiState, actions: CameraActions) {
    val cams = FilmCameras.ALL.filter { it.category == ui.category }
    val state = rememberLazyListState(cams.indexOf(ui.camera).coerceAtLeast(0))
    LaunchedEffect(ui.category) { state.scrollToItem(cams.indexOf(ui.camera).coerceAtLeast(0)) }
    LazyRow(
        state = state,
        contentPadding = PaddingValues(horizontal = 14.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.alpha(if (ui.recording) 0.4f else 1f),
    ) {
        items(cams, key = { it.id }) { cam ->
            CameraChip(cam, cam.id == ui.camera.id, enabled = !ui.recording) { actions.selectCamera(cam) }
        }
    }
}

@Composable
private fun CameraChip(cam: FilmCamera, selected: Boolean, enabled: Boolean, onClick: () -> Unit) {
    Column(
        Modifier
            .width(100.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(if (selected) Cream else Color.White.copy(alpha = 0.06f))
            .border(BorderStroke(1.dp, if (selected) Cream else Color.White.copy(alpha = 0.08f)), RoundedCornerShape(12.dp))
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 8.dp),
    ) {
        // A film-canister swatch: the stock colour with a dark lid.
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(width = 4.dp, height = 14.dp).background(Color(0xFF2B2522), RoundedCornerShape(1.dp)))
            Box(Modifier.size(width = 18.dp, height = 12.dp).background(Color(cam.look.stock.swatch), RoundedCornerShape(2.dp)))
            Box(Modifier.size(width = 4.dp, height = 14.dp).background(Color(0xFF2B2522), RoundedCornerShape(1.dp)))
            Spacer(Modifier.weight(1f))
            if (cam.look.multiShot != MultiShot.SINGLE) {
                Text(if (cam.look.multiShot == MultiShot.HALF_FRAME) "×2" else "×4", color = if (selected) Ink else Amber, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            }
        }
        Spacer(Modifier.height(6.dp))
        Text(cam.name, color = if (selected) Ink else Cream, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
        Text(cam.subtitle, color = if (selected) Ink.copy(alpha = 0.6f) else Muted, fontSize = 9.sp, maxLines = 1)
    }
}

@Composable
private fun LensRow(ui: UiState, actions: CameraActions, iconRotation: Float) {
    val stops = ui.zoomStops
    if (stops.size < 2) return
    // The stop that is "on": the nearest one at or below the current zoom.
    val active = stops.filter { it <= ui.zoom * 1.001f }.maxOrNull() ?: stops.first()
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
        Row(
            Modifier
                .clip(RoundedCornerShape(22.dp))
                .background(Color.White.copy(alpha = 0.07f))
                .padding(4.dp),
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            for (z in stops) {
                val sel = z == active
                // The active button shows the exact zoom, like the system camera does.
                val shown = if (sel && kotlin.math.abs(ui.zoom - z) > 0.05f) ui.zoom else z
                Column(
                    Modifier
                        .size(42.dp)
                        .clip(CircleShape)
                        .background(if (sel) Cream else Color.Transparent)
                        .clickable { actions.setZoom(z) }
                        .rotate(iconRotation),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Text(zoomLabel(shown, sel), color = if (sel) Ink else Cream, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    Text("${(ui.mainEqMm * shown).roundToInt()}mm", color = if (sel) Ink.copy(alpha = 0.6f) else Muted, fontSize = 8.sp)
                }
            }
        }
    }
}

private fun zoomLabel(z: Float, selected: Boolean): String {
    val text = if (z >= 10f || kotlin.math.abs(z - z.roundToInt()) < 0.05f) "${z.roundToInt()}" else "%.1f".format(z).trimStart('0')
    return if (selected) "$text×" else text
}

@Composable
private fun ModeSwitch(ui: UiState, actions: CameraActions) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
        for (m in CaptureMode.entries) {
            val sel = ui.mode == m
            Text(
                if (m == CaptureMode.PHOTO) "PHOTO" else "VIDEO",
                color = if (sel) Amber else Muted,
                fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.sp,
                modifier = Modifier
                    .clip(RoundedCornerShape(12.dp))
                    .clickable(enabled = !ui.recording) { actions.setMode(m) }
                    .padding(horizontal = 14.dp, vertical = 6.dp),
            )
        }
    }
}

@Composable
private fun ShutterRow(ui: UiState, actions: CameraActions, iconRotation: Float) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 28.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Last shot
        Box(
            Modifier
                .size(50.dp)
                .rotate(iconRotation)
                .clip(RoundedCornerShape(10.dp))
                .background(Color.White.copy(alpha = 0.08f))
                .border(1.dp, Cream.copy(alpha = 0.3f), RoundedCornerShape(10.dp))
                .clickable(enabled = ui.lastUri != null) { actions.openLast() },
        ) {
            ui.thumbnail?.let {
                Image(it.asImageBitmap(), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            }
            if (ui.lastIsVideo && ui.thumbnail != null) {
                Canvas(Modifier.align(Alignment.Center).size(16.dp)) {
                    val p = androidx.compose.ui.graphics.Path().apply {
                        moveTo(size.width * 0.2f, 0f); lineTo(size.width, size.height / 2); lineTo(size.width * 0.2f, size.height); close()
                    }
                    drawPath(p, Color.White)
                }
            }
        }
        Spacer(Modifier.weight(1f))
        ShutterButton(ui) { actions.shutter() }
        Spacer(Modifier.weight(1f))
        Box(
            Modifier
                .size(50.dp)
                .clip(CircleShape)
                .background(Color.White.copy(alpha = 0.08f))
                .clickable(enabled = !ui.recording) { actions.switchFacing() },
            contentAlignment = Alignment.Center,
        ) { FlipIcon(Cream, Modifier.rotate(iconRotation)) }
    }
}

@Composable
private fun ShutterButton(ui: UiState, onClick: () -> Unit) {
    val video = ui.mode == CaptureMode.VIDEO
    val inner by animateFloatAsState(if (ui.recording) 0.42f else if (video) 0.78f else 0.84f, label = "shutterInner")
    val corner by animateFloatAsState(if (ui.recording) 0.18f else 0.5f, label = "shutterCorner")
    Box(
        Modifier
            .size(78.dp)
            .clip(CircleShape)
            .clickable(enabled = !ui.savingVideo && !ui.sampling, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.fillMaxSize()) {
            drawCircle(Cream, radius = size.minDimension / 2 - 2.dp.toPx(), style = Stroke(4.dp.toPx()))
            val s = size.minDimension * inner * 0.86f
            drawRoundRect(
                color = if (video) RecRed else if (ui.halfFramePending) Amber else Cream,
                topLeft = Offset((size.width - s) / 2, (size.height - s) / 2),
                size = androidx.compose.ui.geometry.Size(s, s),
                cornerRadius = androidx.compose.ui.geometry.CornerRadius(s * corner),
            )
        }
    }
}

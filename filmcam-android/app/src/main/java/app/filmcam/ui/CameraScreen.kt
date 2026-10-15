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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
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
import app.filmcam.film.FilmCamera
import app.filmcam.film.FilmCameras
import app.filmcam.film.FilmFrameRate
import app.filmcam.film.FilmLook
import app.filmcam.film.FrameStyle
import app.filmcam.film.ShutterSpeed
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
                ui.showAdjust && !ui.recording,
                enter = fadeIn() + slideInVertically { it / 3 },
                exit = fadeOut() + slideOutVertically { it / 3 },
            ) {
                AdjustPanel(ui, actions)
            }
            CameraStrip(ui, actions)
            Spacer(Modifier.height(10.dp))
            ModeSwitch(ui, actions)
            Spacer(Modifier.height(10.dp))
            ShutterRow(ui, actions, iconRotation)
        }

        ui.message?.let { msg ->
            LaunchedEffect(msg) { delay(2400); ui.message = null }
            Text(
                msg, color = Cream, fontSize = 13.sp,
                modifier = Modifier
                    .align(Alignment.Center)
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
        Spacer(Modifier.weight(1f))
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(ui.camera.name.uppercase(), color = Cream, fontSize = 13.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.sp)
            Text(
                "${ui.look.stock.name} · ${ui.look.shutter.label}" +
                    if (ui.mode == CaptureMode.VIDEO && ui.look.frameRate != FilmFrameRate.NATIVE) " · ${ui.look.frameRate.label} fps" else "",
                color = Muted, fontSize = 11.sp, fontFamily = FontFamily.Monospace,
            )
        }
        Spacer(Modifier.weight(1f))
        RoundButton(onClick = { actions.updateLook(ui.look.copy(dateStamp = !ui.look.dateStamp)) }) {
            DateIcon(ui.look.dateStamp, if (ui.look.dateStamp) Amber else Cream, Modifier.rotate(iconRotation))
        }
        Spacer(Modifier.width(8.dp))
        RoundButton(onClick = { ui.showAdjust = !ui.showAdjust }, active = ui.showAdjust) {
            SlidersIcon(if (ui.showAdjust) Ink else Cream, Modifier.rotate(iconRotation))
        }
    }
}

@Composable
private fun RoundButton(
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

    Box(
        Modifier
            .aspectRatio(aspect)
            .clip(RoundedCornerShape(if (ui.mode == CaptureMode.PHOTO) 6.dp else 0.dp)),
    ) {
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
        focus?.let { pos ->
            FocusRing(pos, focusKey) { focus = null }
        }
        if (flash.value > 0f) {
            Box(Modifier.fillMaxSize().background(Color.White.copy(alpha = flash.value)))
        }
        if (ui.recording) RecordingBadge(ui, Modifier.align(Alignment.TopCenter).padding(top = 12.dp))
        if (ui.developing > 0 || ui.savingVideo) {
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
                Text(if (ui.savingVideo) "Saving" else "Developing", color = Cream, fontSize = 11.sp)
            }
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
        Text("%02d:%02d".format(secs / 60, secs % 60), color = Cream, fontSize = 13.sp, fontFamily = FontFamily.Monospace)
    }
}

@Composable
private fun CameraStrip(ui: UiState, actions: CameraActions) {
    val state = rememberLazyListState(FilmCameras.ALL.indexOf(ui.camera).coerceAtLeast(0))
    LazyRow(
        state = state,
        contentPadding = PaddingValues(horizontal = 14.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.alpha(if (ui.recording) 0.4f else 1f),
    ) {
        itemsIndexed(FilmCameras.ALL, key = { _, c -> c.id }) { _, cam ->
            CameraChip(cam, cam.id == ui.camera.id, enabled = !ui.recording) { actions.selectCamera(cam) }
        }
    }
}

@Composable
private fun CameraChip(cam: FilmCamera, selected: Boolean, enabled: Boolean, onClick: () -> Unit) {
    Column(
        Modifier
            .width(92.dp)
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
        }
        Spacer(Modifier.height(6.dp))
        Text(cam.name, color = if (selected) Ink else Cream, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
        Text(cam.look.stock.name, color = if (selected) Ink.copy(alpha = 0.6f) else Muted, fontSize = 10.sp, maxLines = 1)
    }
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
                .clickable(enabled = !ui.recording) { actions.switchLens() },
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
            .clickable(enabled = !ui.savingVideo, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.fillMaxSize()) {
            drawCircle(Cream, radius = size.minDimension / 2 - 2.dp.toPx(), style = Stroke(4.dp.toPx()))
            val s = size.minDimension * inner * 0.86f
            drawRoundRect(
                color = if (video) RecRed else Cream,
                topLeft = Offset((size.width - s) / 2, (size.height - s) / 2),
                size = androidx.compose.ui.geometry.Size(s, s),
                cornerRadius = androidx.compose.ui.geometry.CornerRadius(s * corner),
            )
        }
    }
}

// ------------------------------------------------------------------ adjustments

@Composable
private fun AdjustPanel(ui: UiState, actions: CameraActions) {
    val look = ui.look
    fun set(l: FilmLook) = actions.updateLook(l)
    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp)
            .padding(bottom = 12.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(Panel)
            .heightIn(max = 330.dp)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("DEVELOP", color = Amber, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.sp)
            Spacer(Modifier.weight(1f))
            Text(
                "Reset", color = Cream, fontSize = 12.sp,
                modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable { actions.resetLook() }.padding(6.dp),
            )
        }

        ChoiceRow("Shutter", ShutterSpeed.entries, look.shutter, { it.label }) { set(look.copy(shutter = it)) }
        ValueSlider("Exposure", look.exposureEv, ui.evMin, ui.evMax, "%+.1f EV") { set(look.copy(exposureEv = it)) }
        ValueSlider("Halation", look.halation) { set(look.copy(halation = it)) }
        ValueSlider("Bloom", look.bloom) { set(look.copy(bloom = it)) }
        ValueSlider("Grain", look.grain) { set(look.copy(grain = it)) }
        ValueSlider("Grain size", look.grainSize, 0.6f, 3f, "%.1f") { set(look.copy(grainSize = it)) }
        ValueSlider("Light leaks", look.lightLeak) { set(look.copy(lightLeak = it)) }
        ValueSlider("Vignette", look.vignette) { set(look.copy(vignette = it)) }
        ValueSlider("Dust & scratches", look.dust) { set(look.copy(dust = it)) }
        ValueSlider("Gate weave", look.gateWeave) { set(look.copy(gateWeave = it)) }
        ValueSlider("Flicker", look.flicker) { set(look.copy(flicker = it)) }
        ValueSlider("Chromatic aberration", look.aberration) { set(look.copy(aberration = it)) }
        ValueSlider("Softness", look.softness, -1f, 1f, "%+.2f") { set(look.copy(softness = it)) }
        ValueSlider("Fade", look.fade) { set(look.copy(fade = it)) }
        ValueSlider("Warmth", look.warmth, -1f, 1f, "%+.2f") { set(look.copy(warmth = it)) }
        ChoiceRow("Frame rate (video)", FilmFrameRate.entries, look.frameRate, { if (it == FilmFrameRate.NATIVE) "Native" else "${it.label} fps" }) {
            set(look.copy(frameRate = it))
        }
        ChoiceRow("Frame", FrameStyle.entries, look.frame, { it.label }) { set(look.copy(frame = it)) }
        ChoiceRow("Date stamp", listOf(false, true), look.dateStamp, { if (it) "On" else "Off" }) { set(look.copy(dateStamp = it)) }
    }
}

@Composable
private fun ValueSlider(
    label: String,
    value: Float,
    min: Float = 0f,
    max: Float = 1f,
    format: String? = null,
    onChange: (Float) -> Unit,
) {
    Column(Modifier.padding(top = 6.dp)) {
        Row {
            Text(label, color = Cream, fontSize = 12.sp)
            Spacer(Modifier.weight(1f))
            Text(
                if (format != null) format.format(value) else "${(value * 100).roundToInt()}",
                color = Muted, fontSize = 11.sp, fontFamily = FontFamily.Monospace,
            )
        }
        Slider(
            value = value.coerceIn(min, max),
            onValueChange = onChange,
            valueRange = min..max,
            modifier = Modifier.height(28.dp),
            colors = SliderDefaults.colors(
                thumbColor = Cream,
                activeTrackColor = Amber,
                inactiveTrackColor = Color.White.copy(alpha = 0.14f),
            ),
        )
    }
}

@Composable
private fun <T> ChoiceRow(label: String, options: List<T>, selected: T, name: (T) -> String, onPick: (T) -> Unit) {
    Column(Modifier.padding(top = 10.dp)) {
        Text(label, color = Cream, fontSize = 12.sp)
        Spacer(Modifier.height(6.dp))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            itemsIndexed(options) { _, opt ->
                val sel = opt == selected
                Text(
                    name(opt),
                    color = if (sel) Ink else Cream,
                    fontSize = 11.sp, fontFamily = FontFamily.Monospace,
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(if (sel) Amber else Color.White.copy(alpha = 0.08f))
                        .clickable { onPick(opt) }
                        .padding(horizontal = 10.dp, vertical = 6.dp),
                )
            }
        }
    }
}

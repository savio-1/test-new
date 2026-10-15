package app.filmcam.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.filmcam.camera.CaptureMode
import app.filmcam.camera.PhotoResolution
import app.filmcam.camera.VideoResolution
import app.filmcam.film.BlurMode
import app.filmcam.film.FilmFrameRate
import app.filmcam.film.FilmLook
import app.filmcam.film.FrameStyle
import app.filmcam.film.ShutterSpeed
import app.filmcam.film.StampStyle
import kotlin.math.roundToInt

@Composable
private fun PanelBox(title: String, trailing: (@Composable () -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp)
            .padding(bottom = 12.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(Panel)
            .heightIn(max = 360.dp)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(title, color = Amber, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.sp)
            Spacer(Modifier.weight(1f))
            trailing?.invoke()
        }
        content()
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(text.uppercase(), color = Muted, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.5.sp,
        modifier = Modifier.padding(top = 14.dp))
}

// ------------------------------------------------------------------ develop

@Composable
fun DevelopPanel(ui: UiState, actions: CameraActions) {
    val look = ui.look
    fun set(l: FilmLook) = actions.updateLook(l)
    PanelBox("DEVELOP · ${look.stock.name.uppercase()}", trailing = {
        Text("Reset", color = Cream, fontSize = 12.sp,
            modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable { actions.resetLook() }.padding(6.dp))
    }) {
        ChoiceRow("Shutter" + if (ui.realShutter) " (sensor)" else " (simulated)", ShutterSpeed.entries, look.shutter, { it.label }) {
            actions.setShutter(it)
        }
        ValueSlider("Exposure", look.exposureEv, ui.evMin, ui.evMax, "%+.1f EV") { set(look.copy(exposureEv = it)) }

        SectionLabel("Light")
        ValueSlider("Halation", look.halation) { set(look.copy(halation = it)) }
        ValueSlider("Halation size", look.halationSize) { set(look.copy(halationSize = it)) }
        ValueSlider("Bloom", look.bloom) { set(look.copy(bloom = it)) }
        ValueSlider("Anamorphic streaks", look.streak) { set(look.copy(streak = it)) }
        ValueSlider("Light leaks", look.lightLeak) { set(look.copy(lightLeak = it)) }
        ValueSlider("Prism flare", look.prism) { set(look.copy(prism = it)) }
        ValueSlider("Flash", look.flash) { set(look.copy(flash = it)) }

        SectionLabel("Blur & motion")
        ChoiceRow("Blur", BlurMode.entries, look.blurMode, { it.label }) { set(look.copy(blurMode = it)) }
        if (look.blurMode != BlurMode.NONE) {
            ValueSlider("Blur amount", look.blur) { set(look.copy(blur = it)) }
            ValueSlider("Sharp centre", look.blurFocus) { set(look.copy(blurFocus = it)) }
            if (look.blurMode == BlurMode.MOTION) {
                ValueSlider("Direction", look.blurAngle, 0f, 180f, "%.0f°") { set(look.copy(blurAngle = it)) }
            }
        }
        ValueSlider("Diffusion (mist filter)", look.diffusion) { set(look.copy(diffusion = it)) }
        ChoiceRow("Stop motion / frame rate (video)", FilmFrameRate.entries, look.frameRate,
            { if (it == FilmFrameRate.NATIVE) "Native" else "${it.label} fps" }) { set(look.copy(frameRate = it)) }

        SectionLabel("Emulsion")
        ValueSlider("Grain", look.grain) { set(look.copy(grain = it)) }
        ValueSlider("Grain size", look.grainSize, 0.6f, 3f, "%.1f") { set(look.copy(grainSize = it)) }
        ValueSlider("Fade", look.fade) { set(look.copy(fade = it)) }
        ValueSlider("Warmth", look.warmth, -1f, 1f, "%+.2f") { set(look.copy(warmth = it)) }

        SectionLabel("Lens")
        ValueSlider("Vignette", look.vignette) { set(look.copy(vignette = it)) }
        ValueSlider("Chromatic aberration", look.aberration) { set(look.copy(aberration = it)) }
        ValueSlider("Softness", look.softness, -1f, 1f, "%+.2f") { set(look.copy(softness = it)) }
        ValueSlider("Toy-lens corners", look.cornerBlur) { set(look.copy(cornerBlur = it)) }
        ValueSlider("Fisheye", look.distortion) { set(look.copy(distortion = it)) }
        ChoiceRow("Fisheye circle", listOf(false, true), look.circleMask, { if (it) "On" else "Off" }) { set(look.copy(circleMask = it)) }
        ValueSlider("3D split", look.anaglyph) { set(look.copy(anaglyph = it)) }

        SectionLabel("Projector")
        ValueSlider("Gate weave", look.gateWeave) { set(look.copy(gateWeave = it)) }
        ValueSlider("Frame slips", look.frameSlip) { set(look.copy(frameSlip = it)) }
        ValueSlider("Flicker", look.flicker) { set(look.copy(flicker = it)) }
        ValueSlider("Colour flicker", look.colorFlicker) { set(look.copy(colorFlicker = it)) }
        ValueSlider("Dust & scratches", look.dust) { set(look.copy(dust = it)) }
        ChoiceRow("Roll burn on record", listOf(false, true), look.rollBurn, { if (it) "On" else "Off" }) { set(look.copy(rollBurn = it)) }

        SectionLabel("Tape")
        ValueSlider("VHS", look.vhs) { set(look.copy(vhs = it)) }
        ValueSlider("Interlace", look.interlace) { set(look.copy(interlace = it)) }
        ValueSlider("Low resolution", look.lowRes) { set(look.copy(lowRes = it)) }
    }
}

// ------------------------------------------------------------------ borders

@Composable
fun BorderPanel(ui: UiState, actions: CameraActions) {
    PanelBox("BORDER & STAMP") {
        Spacer(Modifier.height(8.dp))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            items(FrameStyle.entries) { style ->
                val sel = ui.look.frame == style
                Column(
                    Modifier.width(64.dp).clickable { actions.setFrame(style) },
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Canvas(
                        Modifier
                            .size(width = 54.dp, height = 72.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .border(2.dp, if (sel) Amber else Color.Transparent, RoundedCornerShape(6.dp)),
                    ) { drawBorderThumb(style) }
                    Spacer(Modifier.height(4.dp))
                    Text(style.label, color = if (sel) Amber else Cream, fontSize = 9.sp, maxLines = 2, lineHeight = 11.sp)
                }
            }
        }
        ChoiceRow("Stamp", StampStyle.entries, ui.look.stamp, { it.label }) { actions.setStamp(it) }
        Text(
            "Borders are burnt into photos and video alike, and stay upright however you hold the phone.",
            color = Muted, fontSize = 11.sp, lineHeight = 15.sp, modifier = Modifier.padding(top = 10.dp),
        )
    }
}

/** A small picture of each border, so the list reads at a glance. */
private fun DrawScope.drawBorderThumb(style: FrameStyle) {
    val w = size.width
    val h = size.height
    val s = minOf(w, h)
    val pic = Brush.linearGradient(listOf(Color(0xFFE59A4C), Color(0xFF6E8C8A), Color(0xFF2F3D46)), Offset(0f, 0f), Offset(w, h))
    val cream = Color(0xFFF1ECE2)
    fun picture(l: Float, t: Float, r: Float, b: Float, radius: Float = 0f) =
        drawRoundRect(pic, Offset(l, t), Size(r - l, b - t), CornerRadius(radius))
    when (style) {
        FrameStyle.NONE -> picture(0f, 0f, w, h)
        FrameStyle.GATE -> { drawRect(Color(0xFF0A0908)); picture(s * .05f, s * .05f, w - s * .05f, h - s * .05f, s * .12f) }
        FrameStyle.INSTANT -> { drawRect(cream); picture(s * .07f, s * .07f, w - s * .07f, h - s * .3f) }
        FrameStyle.INSTANT_SQUARE -> { drawRect(cream); picture(s * .07f, s * .07f, w - s * .07f, s * .07f + (w - s * .14f)) }
        FrameStyle.INSTANT_MINI -> { drawRect(cream); picture(s * .1f, s * .07f, w - s * .1f, h - s * .26f) }
        FrameStyle.FILMSTRIP -> {
            drawRect(Color(0xFF0A0908)); picture(s * .2f, s * .03f, w - s * .2f, h - s * .03f, 3f)
            var y = 3f
            while (y < h) { for (x in listOf(s * .05f, w - s * .13f)) drawRoundRect(cream, Offset(x, y), Size(s * .08f, s * .06f), CornerRadius(1.5f)); y += s * .14f }
        }
        FrameStyle.FILED -> { drawRect(Color(0xFF050505)); picture(s * .06f, s * .06f, w - s * .06f, h - s * .06f) }
        FrameStyle.WHITE -> { drawRect(cream); picture(s * .05f, s * .05f, w - s * .05f, h - s * .05f) }
        FrameStyle.MAT -> {
            drawRect(cream); drawRect(Color(0xFF333333), Offset(s * .13f, s * .13f), Size(w - s * .26f, h - s * .26f))
            picture(s * .15f, s * .15f, w - s * .15f, h - s * .15f)
        }
        FrameStyle.BLACK -> { drawRect(Color(0xFF050505)); picture(s * .05f, s * .05f, w - s * .05f, h - s * .05f) }
        FrameStyle.STRIP_120 -> {
            drawRect(Color(0xFF0A0908))
            var y = -s * .45f
            while (y < h) { picture(s * .08f, y, w - s * .08f, y + w - s * .16f, 2f); y += w - s * .1f }
        }
        FrameStyle.SUPER8_STRIP -> {
            drawRect(Color(0xFF120D09))
            var y = -s * .2f
            val cell = (w - s * .3f) * 0.75f
            while (y < h) {
                picture(s * .24f, y, w - s * .05f, y + cell, 5f)
                drawRoundRect(cream, Offset(s * .05f, y + cell * .35f), Size(s * .1f, s * .12f), CornerRadius(2f))
                y += cell + s * .08f
            }
        }
        FrameStyle.SLIDE_MOUNT -> { drawRect(Color(0xFFE6E2D9)); picture(s * .16f, h * .2f, w - s * .16f, h - h * .2f, 4f) }
        FrameStyle.LETTERBOX -> { drawRect(Color.Black); picture(0f, h / 2 - w / 4.8f, w, h / 2 + w / 4.8f) }
        FrameStyle.ACADEMY -> { drawRect(Color.Black); picture(0f, h / 2 - w * 2f / 3f, w, h / 2 + w * 2f / 3f) }
        FrameStyle.DECKLE -> {
            drawRect(Color(0xFF1A1715))
            drawRoundRect(cream, Offset(3f, 3f), Size(w - 6f, h - 6f), CornerRadius(4f))
            picture(s * .12f, s * .12f, w - s * .12f, h - s * .12f)
        }
        FrameStyle.ROUNDED -> { drawRect(Color.Black); picture(s * .04f, s * .04f, w - s * .04f, h - s * .04f, s * .14f) }
    }
}

// ------------------------------------------------------------------ camera settings

@Composable
fun CameraSettingsPanel(ui: UiState, actions: CameraActions) {
    PanelBox("CAMERA") {
        if (ui.mode == CaptureMode.VIDEO) {
            ChoiceRow("Video resolution", VideoResolution.entries, ui.videoRes, { it.label },
                enabled = { it in ui.availableVideoRes }) { actions.setVideoResolution(it) }
            ChoiceRow("Capture frame rate", listOf(24, 25, 30, 60), ui.fps, { "$it fps" },
                enabled = { it in ui.availableFps }) { actions.setFps(it) }
            if (ui.encoderInfo.isNotEmpty()) {
                Text("Records ${ui.encoderInfo}", color = Muted, fontSize = 11.sp, fontFamily = FontFamily.Monospace,
                    modifier = Modifier.padding(top = 8.dp))
            }
            if (ui.stabilizationSupported) {
                ToggleRow("Stabilisation", "Electronic stabilisation; crops in a little.", ui.stabilization) { actions.setStabilization(it) }
            }
        } else {
            ChoiceRow("Photo size", PhotoResolution.entries, ui.photoRes,
                { if (it == PhotoResolution.MAX) "Max (${ui.maxPhotoMp} MP)" else it.label }) { actions.setPhotoResolution(it) }
        }
        if (ui.manualSupported) {
            ToggleRow(
                "Real shutter speed",
                "The sensor exposes for the chosen speed and the ISO follows. Slow speeds blur motion for real.",
                ui.realShutter,
            ) { actions.setRealShutter(it) }
        }
        Text(
            "Unavailable options are greyed out: this lens or the phone's encoder can't do them.",
            color = Muted, fontSize = 11.sp, lineHeight = 15.sp, modifier = Modifier.padding(top = 10.dp),
        )
    }
}

@Composable
private fun ToggleRow(label: String, help: String, value: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(label, color = Cream, fontSize = 12.sp)
            Text(help, color = Muted, fontSize = 10.sp, lineHeight = 13.sp)
        }
        Switch(
            checked = value, onCheckedChange = onChange,
            colors = SwitchDefaults.colors(checkedTrackColor = Amber, checkedThumbColor = Ink, uncheckedTrackColor = Color.White.copy(alpha = 0.12f)),
        )
    }
}

// ------------------------------------------------------------------ controls

@Composable
fun ValueSlider(
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
fun <T> ChoiceRow(
    label: String,
    options: List<T>,
    selected: T,
    name: (T) -> String,
    enabled: (T) -> Boolean = { true },
    onPick: (T) -> Unit,
) {
    Column(Modifier.padding(top = 10.dp)) {
        Text(label, color = Cream, fontSize = 12.sp)
        Spacer(Modifier.height(6.dp))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            items(options) { opt ->
                val sel = opt == selected
                val on = enabled(opt)
                Text(
                    name(opt),
                    color = if (sel) Ink else Cream,
                    fontSize = 11.sp, fontFamily = FontFamily.Monospace,
                    modifier = Modifier
                        .alpha(if (on) 1f else 0.3f)
                        .clip(RoundedCornerShape(8.dp))
                        .background(if (sel) Amber else Color.White.copy(alpha = 0.08f))
                        .clickable(enabled = on) { onPick(opt) }
                        .padding(horizontal = 10.dp, vertical = 6.dp),
                )
            }
        }
    }
}

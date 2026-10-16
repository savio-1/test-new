package app.filmcam.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.filmcam.camera.AspectRatio
import app.filmcam.camera.VideoResolution

/** The small panel under the chips: one choice at a time, over the top of the picture. */
@Composable
fun QuickPanel(q: Quick, ui: UiState, actions: CameraActions, modifier: Modifier = Modifier) {
    val p = LocalPalette.current
    val shape = RoundedCornerShape(20.dp)
    Column(
        modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp)
            .clip(shape)
            .background(p.surface.copy(alpha = 0.97f))
            .border(1.dp, p.line, shape)
            // Swallow taps so they don't reach the viewfinder underneath.
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {}
            .padding(horizontal = 14.dp, vertical = 12.dp),
    ) {
        when (q) {
            Quick.RATIO -> {
                val sideways = ui.frameTurns % 2 == 1
                if (ui.edit != null) {
                    PanelLabel("Shape")
                    val options: List<AspectRatio?> = listOf(null) + AspectRatio.entries
                    Segmented(options, ui.editRatio, { it?.label(false) ?: "Original" }, Modifier.fillMaxWidth()) { actions.setRatio(it) }
                } else {
                    PanelLabel("Frame shape")
                    val video = ui.mode == app.filmcam.camera.CaptureMode.VIDEO
                    Segmented(AspectRatio.entries, if (video) ui.videoRatio else ui.photoRatio, { it.label(sideways) },
                        Modifier.fillMaxWidth()) { actions.setRatio(it) }
                    PanelHelp("The frame turns with the phone: hold it sideways for ${AspectRatio.R9_16.label(true)}.")
                }
            }
            Quick.SIZE -> {
                PanelLabel("Photo size")
                val sizes = ui.photoSizes
                if (sizes.isNotEmpty()) {
                    Segmented(sizes, ui.photoSize ?: sizes.last(), { it.label }, Modifier.fillMaxWidth()) { actions.setPhotoSize(it) }
                }
                val sel = ui.photoSize
                PanelHelp(
                    when {
                        sel == null -> ""
                        sel.maxRes -> "Full sensor mode: slower to shoot. Film looks develop at up to 50 MP; Original saves every pixel."
                        sel.mp > 60 -> "Film looks develop at up to 50 MP; Original saves every pixel."
                        else -> "${sel.width} × ${sel.height} from the sensor."
                    },
                )
            }
            Quick.VIDEO -> {
                PanelLabel("Resolution")
                Segmented(VideoResolution.entries, ui.videoRes, { it.label }, Modifier.fillMaxWidth(),
                    enabled = { it in ui.availableVideoRes }) { actions.setVideoResolution(it) }
                PanelLabel("Frame rate", top = 12)
                Segmented(listOf(24, 25, 30, 60), ui.fps, { "$it" }, Modifier.fillMaxWidth(),
                    enabled = { it in ui.availableFps }) { actions.setFps(it) }
                if (ui.encoderInfo.isNotEmpty()) PanelHelp(ui.encoderInfo)
            }
            Quick.TIMER -> {
                PanelLabel("Self-timer")
                Segmented(TimerChoices, ui.timerSeconds, { timerLabel(it) }, Modifier.fillMaxWidth()) { actions.setTimer(it) }
            }
            Quick.BURST -> {
                PanelLabel("Burst · shots")
                Segmented(BurstCounts, ui.burstCount, { if (it == 1) "Off" else if (it == 0) "∞" else "$it" }, Modifier.fillMaxWidth()) {
                    actions.setBurst(it, ui.burstInterval)
                }
                PanelLabel("Every", top = 12)
                Segmented(BurstIntervals, ui.burstInterval, { intervalLabel(it) }, Modifier.fillMaxWidth(),
                    enabled = { ui.burstCount != 1 }) { actions.setBurst(ui.burstCount, it) }
                PanelHelp("Press the shutter to start; press again to stop. Works with the self-timer.")
            }
            Quick.LOG -> {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Shoot log", color = p.text, fontSize = 14.sp)
                        Text("Flat, wide-range footage for grading. No film look.", color = p.muted, fontSize = 11.sp)
                    }
                    PanelSwitch(ui.log) { actions.setLog(it) }
                }
                if (ui.log) {
                    if (ui.hlgAvailable) {
                        PanelLabel("Curve", top = 12)
                        Segmented(LogCurveChoice.entries, ui.logCurve, { it.label }, Modifier.fillMaxWidth()) { actions.setLogCurve(it) }
                    }
                    Spacer(Modifier.height(10.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("View assist", color = p.text, fontSize = 14.sp)
                            Text("Show it graded on screen; the file stays log", color = p.muted, fontSize = 11.sp)
                        }
                        PanelSwitch(ui.logViewAssist) { actions.setLogViewAssist(it) }
                    }
                    PanelHelp(
                        when (ui.logPath) {
                            LogPath.HLG10 -> "10-bit HLG straight from the sensor into the encoder (HEVC Main10, 16:9). " +
                                "Most range and no banding. In your editor: Rec.2100 HLG, Rec.2020 colour."
                            LogPath.ISP -> "8-bit S-Log3, applied to the sensor signal by the camera itself. " +
                                "In your editor: S-Log3 gamma, Rec.709 colour."
                            LogPath.GPU -> "This camera won't apply a custom curve, so S-Log3 is made from its normal picture: " +
                                "flat and gradeable, with less range in the highlights."
                        } + if (ui.hlgFailed) " (The camera refused a 10-bit session at this size.)" else "",
                    )
                    Spacer(Modifier.height(8.dp))
                    Pill("Save LUT to Downloads") { actions.saveLut() }
                }
            }
        }
    }
}

@Composable
private fun PanelLabel(text: String, top: Int = 0) {
    val p = LocalPalette.current
    Text(text.uppercase(), color = p.muted, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.6.sp,
        modifier = Modifier.padding(top = top.dp, bottom = 8.dp))
}

@Composable
private fun PanelHelp(text: String) {
    if (text.isEmpty()) return
    val p = LocalPalette.current
    Text(text, color = p.muted, fontSize = 11.sp, lineHeight = 15.sp, modifier = Modifier.padding(top = 8.dp))
}

@Composable
fun PanelSwitch(value: Boolean, onChange: (Boolean) -> Unit) {
    val p = LocalPalette.current
    Switch(
        checked = value, onCheckedChange = onChange,
        colors = SwitchDefaults.colors(
            checkedTrackColor = p.text, checkedThumbColor = p.bg, checkedBorderColor = p.text,
            uncheckedTrackColor = p.surfaceHigh, uncheckedThumbColor = p.muted, uncheckedBorderColor = p.line,
        ),
    )
}

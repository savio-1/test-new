package app.filmcam.ui

import android.widget.VideoView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import app.filmcam.film.FontLibrary
import app.filmcam.film.TextRenderer
import app.filmcam.sub.Cue
import app.filmcam.sub.SubtitleLanguage
import app.filmcam.sub.SubtitleTrack
import kotlinx.coroutines.delay
import kotlin.math.roundToInt

private val Accent = Color(0xFFFFB347)
private val Panel = Color(0xFF161616)
private val Muted = Color.White.copy(alpha = 0.55f)

private fun subStamp(ms: Long): String {
    val t = ms.coerceAtLeast(0) / 100
    return "%d:%02d.%d".format(t / 600, t / 10 % 60, t % 10)
}

/**
 * After a clip is shot: its speech as subtitles, in English, Telugu or both. Make them with
 * Gemini, fix any line by typing, set when each shows (In/Out at the playhead), style them,
 * then burn them into a copy of the clip or save an .srt.
 */
@Composable
fun SubtitleScreen(ui: UiState, actions: CameraActions) {
    val s = ui.subtitles ?: return
    val fonts = ui.fonts
    var view by remember(s.item.uri) { mutableStateOf<VideoView?>(null) }
    var playing by remember(s.item.uri) { mutableStateOf(true) }
    var showKey by remember { mutableStateOf(ui.geminiKey.isBlank()) }
    val track = s.track

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding()) {
            Row(Modifier.fillMaxWidth().height(52.dp).padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                SubIcon(Ico.Back) { actions.closeSubtitles() }
                Text("Subtitles", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 6.dp))
                Spacer(Modifier.weight(1f))
                SubIcon(Ico.Key) { showKey = !showKey }
            }

            // ---- the clip, with the subtitles drawn exactly as they will be burnt in
            Box(Modifier.fillMaxWidth().height(if (track == null) 300.dp else 250.dp), contentAlignment = Alignment.Center) {
                Box(Modifier.aspectRatio(s.aspect)) {
                    AndroidView(
                        factory = { ctx ->
                            VideoView(ctx).apply {
                                setVideoURI(s.item.uri)
                                setOnPreparedListener { mp -> mp.isLooping = true; start() }
                                view = this
                            }
                        },
                        onRelease = { it.stopPlayback() },
                        modifier = Modifier.fillMaxSize(),
                    )
                    if (track != null && fonts != null) {
                        val layers = track.layersAt(s.positionMs, s.aspect, fonts)
                        Canvas(Modifier.fillMaxSize()) {
                            drawIntoCanvas { c -> TextRenderer.draw(c.nativeCanvas, layers, fonts, size.width, size.height) }
                        }
                    }
                    Box(Modifier.fillMaxSize().pointerInput(s.item.uri) {
                        detectTapGestures {
                            val v = view ?: return@detectTapGestures
                            if (v.isPlaying) { v.pause(); playing = false } else { v.start(); playing = true }
                        }
                    })
                    if (!playing) {
                        Box(Modifier.align(Alignment.Center).size(54.dp).background(Color(0x66000000), CircleShape), contentAlignment = Alignment.Center) {
                            Icon(Ico.Play, null, tint = Color.White, modifier = Modifier.size(26.dp))
                        }
                    }
                }
            }
            LaunchedEffect(s.item.uri) {
                while (true) {
                    view?.let { s.positionMs = it.currentPosition.toLong() }
                    delay(60)
                }
            }
            DisposableEffect(s.item.uri) { onDispose { view?.stopPlayback() } }

            if (showKey) SubKeyPanel(ui, actions) { showKey = false }

            when {
                s.status != null -> SubWorking(s.status!!)
                track == null -> SubStart(ui, actions, s)
                else -> SubEditor(ui, actions, s, track, fonts) { ms -> view?.seekTo(ms.toInt()) }
            }
        }
        if (ui.progress >= 0f) {
            Text(
                "${ui.progressLabel}  ${(ui.progress * 100).roundToInt()}%", color = Color.White, fontSize = 14.sp,
                modifier = Modifier.align(Alignment.Center).background(Color(0xCC000000), RoundedCornerShape(14.dp))
                    .padding(horizontal = 18.dp, vertical = 12.dp),
            )
        }
    }
}

@Composable
private fun SubIcon(icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) {
    Box(Modifier.size(40.dp).clip(CircleShape).clickable(onClick = onClick), contentAlignment = Alignment.Center) {
        Icon(icon, null, tint = Color.White, modifier = Modifier.size(21.dp))
    }
}

@Composable
private fun SubChip(text: String, on: Boolean, font: FontFamily? = null, onClick: () -> Unit) {
    Text(
        text, color = if (on) Color.Black else Color.White, fontSize = 13.sp, fontFamily = font, maxLines = 1,
        modifier = Modifier.clip(RoundedCornerShape(16.dp)).background(if (on) Color.White else Panel)
            .border(1.dp, if (on) Color.White else Color.White.copy(alpha = 0.15f), RoundedCornerShape(16.dp))
            .clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = 7.dp),
    )
}

@Composable
private fun SubPrimary(text: String, modifier: Modifier = Modifier, enabled: Boolean = true, onClick: () -> Unit) {
    Text(
        text, color = Color.Black, fontSize = 14.sp, fontWeight = FontWeight.SemiBold,
        modifier = modifier.clip(RoundedCornerShape(20.dp)).background(if (enabled) Accent else Accent.copy(alpha = 0.4f))
            .clickable(enabled = enabled, onClick = onClick).padding(horizontal = 18.dp, vertical = 11.dp),
    )
}

@Composable
private fun SubSecondary(text: String, onClick: () -> Unit) {
    Text(
        text, color = Color.White, fontSize = 13.sp,
        modifier = Modifier.clip(RoundedCornerShape(20.dp)).border(1.dp, Color.White.copy(alpha = 0.25f), RoundedCornerShape(20.dp))
            .clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 10.dp),
    )
}

/** The person's Gemini API key (free from Google AI Studio) and the model to use. */
@Composable
private fun SubKeyPanel(ui: UiState, actions: CameraActions, onDone: () -> Unit) {
    var key by remember { mutableStateOf(ui.geminiKey) }
    var model by remember { mutableStateOf(ui.geminiModel) }
    Column(Modifier.fillMaxWidth().padding(12.dp).clip(RoundedCornerShape(16.dp)).background(Panel).padding(14.dp)) {
        Text("Gemini API key", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        Text("Free from aistudio.google.com/apikey. The clip's sound is sent to Google to be transcribed; nothing else leaves the phone.",
            color = Muted, fontSize = 11.sp, modifier = Modifier.padding(top = 3.dp, bottom = 8.dp))
        SubField(key, "Paste your key") { key = it }
        Spacer(Modifier.height(8.dp))
        Text("Model", color = Muted, fontSize = 11.sp)
        SubField(model, "gemini-3.8-flash") { model = it }
        Spacer(Modifier.height(10.dp))
        SubPrimary("Save", Modifier.align(Alignment.End)) { actions.setGemini(key, model); onDone() }
    }
}

@Composable
private fun SubField(value: String, hint: String, font: FontFamily? = null, size: Int = 14, onChange: (String) -> Unit) {
    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Color(0xFF232323)).padding(horizontal = 10.dp, vertical = 9.dp)) {
        if (value.isEmpty()) Text(hint, color = Color.White.copy(alpha = 0.3f), fontSize = size.sp, fontFamily = font)
        BasicTextField(
            value = value, onValueChange = onChange, cursorBrush = SolidColor(Accent),
            textStyle = TextStyle(color = Color.White, fontSize = size.sp, fontFamily = font),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun SubWorking(status: String) {
    Column(Modifier.fillMaxWidth().padding(top = 40.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        CircularProgressIndicator(color = Accent, strokeWidth = 2.5.dp, modifier = Modifier.size(34.dp))
        Spacer(Modifier.height(14.dp))
        Text("$status…", color = Color.White, fontSize = 14.sp)
        Text("A minute of speech takes about 10–30 seconds", color = Muted, fontSize = 11.sp, modifier = Modifier.padding(top = 4.dp))
    }
}

@Composable
private fun SubStart(ui: UiState, actions: CameraActions, s: SubtitleSession) {
    Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text("Subtitles from what's said", color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
        Text("Speech in Telugu or English is written out in both languages. Check every line and fix anything before you save.",
            color = Muted, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp, bottom = 18.dp))
        SubPrimary("Generate subtitles", enabled = ui.geminiKey.isNotBlank()) { actions.generateSubtitles() }
        s.error?.let { Text(it, color = Color(0xFFFF7A66), fontSize = 12.sp, modifier = Modifier.padding(top = 12.dp)) }
        Spacer(Modifier.height(14.dp))
        Text("Or write them yourself", color = Accent, fontSize = 13.sp,
            modifier = Modifier.clip(RoundedCornerShape(12.dp)).clickable {
                actions.updateSubtitles(SubtitleTrack(listOf(Cue(0, minOf(3000L, s.durationMs.coerceAtLeast(1000L))))))
            }.padding(8.dp))
    }
}

@Composable
private fun androidx.compose.foundation.layout.ColumnScope.SubEditor(ui: UiState, actions: CameraActions, s: SubtitleSession, track: SubtitleTrack, fonts: FontLibrary?, seek: (Long) -> Unit) {
    val style = track.style
    fun set(t: SubtitleTrack) = actions.updateSubtitles(t)
    fun setCue(i: Int, c: Cue) = set(track.copy(cues = track.cues.toMutableList().also { it[i] = c }))
    val latinFamily = fonts?.let { FontFamily(it.typeface(style.latinFont)) }
    val teluguFamily = fonts?.let { FontFamily(it.typeface(style.teluguFont)) }

    // ---- language and style
    Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        SubtitleLanguage.entries.forEach { l -> SubChip(l.label, style.language == l) { set(track.copy(style = style.copy(language = l))) } }
        Spacer(Modifier.weight(1f))
        SubChip(if (style.box) "Box" else "Shadow", style.box) { set(track.copy(style = style.copy(box = !style.box))) }
    }
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically,
    ) {
        SubChip("A−", false) { set(track.copy(style = style.copy(size = (style.size - 0.005f).coerceAtLeast(0.025f)))) }
        SubChip("A+", false) { set(track.copy(style = style.copy(size = (style.size + 0.005f).coerceAtMost(0.09f)))) }
        SubChip("Top", style.y < 0.5f) { set(track.copy(style = style.copy(y = 0.12f))) }
        SubChip("Bottom", style.y >= 0.5f) { set(track.copy(style = style.copy(y = 0.86f))) }
        if (fonts != null) {
            val latin = listOf("asset:InterBold.ttf", "asset:Inter.ttf", "sys:sans-bold", "asset:BebasNeue.ttf", "asset:InstrumentSerif.ttf", "asset:CourierPrime.ttf")
            val telugu = FontLibrary.WEIGHTED.map { "asset:${it.first}" } +
                listOf("asset:NotoSansTelugu.ttf", "asset:Ramabhadra.ttf", "asset:Mandali.ttf", "asset:Gurajada.ttf", "asset:TenaliRamakrishna.ttf")
            if (style.language != SubtitleLanguage.ENGLISH) telugu.forEach { k ->
                SubChip(fonts.label(k), style.teluguFont == k, FontFamily(fonts.typeface(k))) { set(track.copy(style = style.copy(teluguFont = k))) }
            }
            if (style.language != SubtitleLanguage.TELUGU) latin.forEach { k ->
                SubChip(fonts.label(k), style.latinFont == k, FontFamily(fonts.typeface(k))) { set(track.copy(style = style.copy(latinFont = k))) }
            }
        }
    }

    // ---- the lines
    val list = rememberLazyListState()
    val current = track.cues.indexOfFirst { s.positionMs >= it.startMs && s.positionMs < it.endMs }
    Column(Modifier.fillMaxWidth().weight(1f)) {
        LazyColumn(Modifier.fillMaxSize(), state = list, contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)) {
            itemsIndexed(track.cues) { i, c ->
                SubCueRow(c, i == current, style.language, latinFamily, teluguFamily, seek,
                    onChange = { setCue(i, it) },
                    setIn = { setCue(i, c.copy(startMs = s.positionMs.coerceAtMost(c.endMs - 300))) },
                    setOut = { setCue(i, c.copy(endMs = s.positionMs.coerceAtLeast(c.startMs + 300))) },
                    delete = { set(track.copy(cues = track.cues.filterIndexed { j, _ -> j != i })) })
            }
            item {
                Text("+ Add a line at ${subStamp(s.positionMs)}", color = Accent, fontSize = 13.sp,
                    modifier = Modifier.clip(RoundedCornerShape(12.dp)).clickable {
                        val start = s.positionMs
                        val next = track.cues.firstOrNull { it.startMs > start }?.startMs ?: s.durationMs
                        val cue = Cue(start, minOf(start + 2500, next.coerceAtLeast(start + 500)))
                        set(track.copy(cues = (track.cues + cue).sortedBy { it.startMs }))
                    }.padding(10.dp))
            }
        }
    }
    s.error?.let { Text(it, color = Color(0xFFFF7A66), fontSize = 12.sp, modifier = Modifier.padding(horizontal = 16.dp)) }

    // ---- save
    Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        SubSecondary("Redo") { actions.generateSubtitles() }
        SubSecondary("Save .srt") { actions.saveSrt() }
        Spacer(Modifier.weight(1f))
        SubPrimary("Burn into video", enabled = ui.progress < 0f && track.cues.isNotEmpty()) { actions.burnSubtitles() }
    }
}

@Composable
private fun SubCueRow(
    c: Cue, active: Boolean, language: SubtitleLanguage, latin: FontFamily?, telugu: FontFamily?,
    seek: (Long) -> Unit, onChange: (Cue) -> Unit, setIn: () -> Unit, setOut: () -> Unit, delete: () -> Unit,
) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(if (active) Color(0xFF262019) else Panel)
            .border(1.dp, if (active) Accent.copy(alpha = 0.7f) else Color.Transparent, RoundedCornerShape(14.dp))
            .padding(horizontal = 12.dp, vertical = 9.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("${subStamp(c.startMs)} → ${subStamp(c.endMs)}", color = if (active) Accent else Muted, fontSize = 12.sp,
                fontFamily = FontFamily.Monospace, modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable { seek(c.startMs) }.padding(4.dp))
            Spacer(Modifier.weight(1f))
            Text("In", color = Muted, fontSize = 12.sp, modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable(onClick = setIn).padding(6.dp))
            Text("Out", color = Muted, fontSize = 12.sp, modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable(onClick = setOut).padding(6.dp))
            Box(Modifier.size(30.dp).clip(CircleShape).clickable(onClick = delete), contentAlignment = Alignment.Center) {
                Icon(Ico.Trash, null, tint = Muted, modifier = Modifier.size(16.dp))
            }
        }
        if (language != SubtitleLanguage.ENGLISH) {
            Spacer(Modifier.height(4.dp))
            SubField(c.telugu, "తెలుగు", telugu, 16) { onChange(c.copy(telugu = it)) }
        }
        if (language != SubtitleLanguage.TELUGU) {
            Spacer(Modifier.height(4.dp))
            SubField(c.english, "English", latin, 15) { onChange(c.copy(english = it)) }
        }
    }
}

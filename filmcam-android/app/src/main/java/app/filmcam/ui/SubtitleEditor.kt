package app.filmcam.ui

import android.widget.VideoView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
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
import app.filmcam.film.TextLayer
import app.filmcam.film.TextRenderer
import app.filmcam.sub.CaptionTemplate
import app.filmcam.sub.Cue
import app.filmcam.sub.Kinetic
import app.filmcam.sub.Phrase
import app.filmcam.sub.SubtitleBackground
import app.filmcam.sub.SubtitleLanguage
import app.filmcam.sub.SubtitleStyle
import app.filmcam.sub.SubtitleTrack
import app.filmcam.sub.WordAnim
import app.filmcam.sub.WordDepth
import app.filmcam.sub.WordEdit
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.roundToInt
import app.filmcam.film.TextAlign as SubAlign

private val Accent = Color(0xFFF4F4F2)
private val Panel = Color(0xFF111112)
private val Muted = Color.White.copy(alpha = 0.55f)

/** Text colours, and box / outline colours, offered for subtitles. */
private val TextColors = listOf(
    0xFFFFFFFF, 0xFFFFE14D, 0xFFFFB347, 0xFFFF5A4D, 0xFFFF6FB5, 0xFFA970FF, 0xFF4D7CFF, 0xFF4DD9FF, 0xFF5BE37D, 0xFF000000,
).map { it.toInt() }
private val BackColors = listOf(
    0xFF000000, 0xFF1E1E1E, 0xFFFFFFFF, 0xFFFFE14D, 0xFFFF5A4D, 0xFF4D7CFF, 0xFF1F8A4C, 0xFF7A2BD9,
).map { it.toInt() }
private val Opacities = listOf(0.3f, 0.5f, 0.7f, 0.9f, 1f)

private fun subStamp(ms: Long): String {
    val t = ms.coerceAtLeast(0) / 100
    return "%d:%02d.%d".format(t / 600, t / 10 % 60, t % 10)
}

enum class SubTab(val label: String) { LINES("Lines"), STYLE("Style"), PLACE("Position"), WORDS("Words") }

/** Classic lines are placed as a block; kinetic captions word by word. */
private fun tabsFor(track: SubtitleTrack?) =
    if (track?.style?.kinetic == true) listOf(SubTab.LINES, SubTab.STYLE, SubTab.WORDS) else listOf(SubTab.LINES, SubTab.STYLE, SubTab.PLACE)

/**
 * After a clip is shot: its speech as subtitles, in English, Telugu or both. Make them with
 * Gemini (or keep the ones heard live), fix any line by typing, set exactly when each shows,
 * style and place them, check them full screen, then burn them into a copy of the clip or
 * save an .srt.
 */
@Composable
fun SubtitleScreen(ui: UiState, actions: CameraActions) {
    val s = ui.subtitles ?: return
    val fonts = ui.fonts
    var showKey by remember { mutableStateOf(ui.geminiKey.isBlank() && s.track == null) }
    var full by remember(s.item.uri) { mutableStateOf(false) }
    val tabPicked = s.tab
    val selected = s.selectedWord
    // The player, shared by the inline preview and the full-screen one.
    val player = remember(s.item.uri) { SubPlayer() }
    val track = s.track
    // Switching template swaps Position for Words (and back).
    val tab = when {
        tabPicked in tabsFor(track) -> tabPicked
        tabPicked == SubTab.PLACE || tabPicked == SubTab.WORDS -> tabsFor(track).last()
        else -> SubTab.LINES
    }
    val wordMode = tab == SubTab.WORDS

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        if (full) {
            SubFullScreen(ui, actions, s, fonts, player) { full = false }
        } else Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding()) {
            Row(Modifier.fillMaxWidth().height(52.dp).padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                SubIcon(Ico.Back) { actions.closeSubtitles() }
                Text("Subtitles", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 6.dp))
                Spacer(Modifier.weight(1f))
                SubIcon(Ico.Fullscreen) { full = true }
                SubIcon(Ico.Key) { showKey = !showKey }
            }

            // ---- the clip, with the subtitles drawn exactly as they will be burnt in
            Box(Modifier.fillMaxWidth().height(if (track == null) 300.dp else 240.dp), contentAlignment = Alignment.Center) {
                SubVideo(
                    s, fonts, player, Modifier.aspectRatio(s.aspect), movable = tab == SubTab.PLACE,
                    words = if (wordMode) WordPick(selected) { s.selectedWord = it } else null,
                ) { t -> actions.updateSubtitles(t) }
            }

            if (showKey) SubKeyPanel(ui, actions) { showKey = false }

            when {
                s.status != null -> SubWorking(s, actions)
                track == null -> SubStart(ui, actions, s)
                else -> SubEditor(ui, actions, s, track, fonts, tab, { s.tab = it }, { full = true }, player, selected, { s.selectedWord = it })
            }
        }
        if (ui.progress >= 0f) {
            Text(
                "${ui.progressLabel}  ${(ui.progress * 100).roundToInt()}%", color = Color.White, fontSize = 14.sp,
                modifier = Modifier.align(Alignment.Center).background(Color(0xCC000000), Corners.medium)
                    .padding(horizontal = 18.dp, vertical = 12.dp),
            )
        }
    }
}

/** The clip's player: whichever VideoView is on screen, and where it is. */
private class SubPlayer {
    var view: VideoView? = null
    var playing by mutableStateOf(true)
    fun seek(ms: Long) { view?.seekTo(ms.toInt()) }
    fun pause() { view?.pause(); playing = false }
    fun toggle() {
        val v = view ?: return
        if (v.isPlaying) { v.pause(); playing = false } else { v.start(); playing = true }
    }
}

/** Picking words on the video (kinetic captions): the one picked, and how to pick another. */
private class WordPick(val selected: String?, val select: (String?) -> Unit)

/**
 * The clip playing with its subtitles over it. Tap to pause; with [movable], drag the
 * subtitles to place them (they snap to the centre line). With [words], tap a word to pick it
 * and drag it anywhere.
 */
@Composable
private fun SubVideo(
    s: SubtitleSession, fonts: FontLibrary?, player: SubPlayer, modifier: Modifier, movable: Boolean,
    words: WordPick? = null, commit: (SubtitleTrack) -> Unit,
) {
    val track = s.track
    val pick by rememberUpdatedState(words)
    val kinetic = track?.style?.kinetic == true
    Box(modifier) {
        AndroidView(
            factory = { ctx ->
                VideoView(ctx).apply {
                    setVideoURI(s.item.uri)
                    setOnPreparedListener { mp ->
                        mp.isLooping = true
                        // Opening full screen (or coming back) carries on where it was.
                        if (s.positionMs > 0) seekTo(s.positionMs.toInt())
                        if (player.playing) start()
                    }
                    player.view = this
                }
            },
            onRelease = { v -> if (player.view === v) player.view = null; v.stopPlayback() },
            modifier = Modifier.fillMaxSize(),
        )
        // What is on screen now. Kinetic: the words of the moment, as they will be burnt in
        // (those set behind the subject faded, as the preview has no cut-out). Classic: the
        // line due now; while placing with nothing due, the first line stands in.
        val layers: List<TextLayer> = when {
            track == null || fonts == null -> emptyList()
            kinetic -> track.layersAt(s.positionMs, s.aspect, fonts).map { if (it.behind) it.copy(opacity = it.opacity * 0.45f) else it }
            else -> (track.at(s.positionMs) ?: if (movable) track.cues.firstOrNull() else null)?.let { track.layersFor(it, s.aspect, fonts) }.orEmpty()
        }
        val sel = words?.selected
        Canvas(Modifier.fillMaxSize()) {
            if (movable) {
                // Thirds and centre guides while placing.
                val g = Color.White.copy(alpha = 0.18f)
                for (f in listOf(1f / 3, 0.5f, 2f / 3)) {
                    drawLine(g, Offset(size.width * f, 0f), Offset(size.width * f, size.height), 1f)
                    drawLine(g, Offset(0f, size.height * f), Offset(size.width, size.height * f), 1f)
                }
                drawRect(Accent.copy(alpha = 0.6f), style = Stroke(2f))
            }
            if (fonts != null && layers.isNotEmpty()) {
                drawIntoCanvas { c -> TextRenderer.draw(c.nativeCanvas, layers, fonts, size.width, size.height) }
                // The picked word, framed.
                layers.firstOrNull { sel != null && Kinetic.wordIdOf(it.id) == sel }?.let { l ->
                    val (bw, bh) = TextRenderer.blockSize(l, fonts, size.width, size.height)
                    val pad = 4.dp.toPx()
                    drawRoundRect(
                        Accent, Offset(l.x * size.width - bw / 2 - pad, l.y * size.height - bh / 2 - pad), Size(bw + 2 * pad, bh + 2 * pad),
                        CornerRadius(3.dp.toPx()), style = Stroke(1.5.dp.toPx()),
                    )
                }
            }
        }
        // The word under a touch, if any (the smallest one, when words overlap).
        fun wordAt(p: Offset, w: Float, h: Float, slop: Float): String? {
            if (fonts == null) return null
            val t = s.track ?: return null
            return t.layersAt(s.positionMs, s.aspect, fonts).mapNotNull { l ->
                val (bw, bh) = TextRenderer.blockSize(l, fonts, w, h)
                val inside = abs(p.x - l.x * w) <= bw / 2 + slop && abs(p.y - l.y * h) <= bh / 2 + slop
                if (inside) l to bw * bh else null
            }.minByOrNull { it.second }?.first?.let { Kinetic.wordIdOf(it.id) }
        }
        Box(
            Modifier.fillMaxSize()
                .pointerInput(s.item.uri) {
                    detectTapGestures { p ->
                        val wp = pick
                        if (wp == null) { player.toggle(); return@detectTapGestures }
                        val hit = wordAt(p, size.width.toFloat(), size.height.toFloat(), 6.dp.toPx())
                        when {
                            hit != null -> { player.pause(); wp.select(hit) }
                            wp.selected != null -> wp.select(null)
                            else -> player.toggle()
                        }
                    }
                }
                .pointerInput(movable, words != null, s.item.uri) {
                    if (words != null) {
                        // Drag a word: it is picked, the clip holds still, and the word goes where it is put.
                        var id: String? = null
                        var at = Offset.Zero
                        detectDragGestures(
                            onDragStart = { p ->
                                id = wordAt(p, size.width.toFloat(), size.height.toFloat(), 10.dp.toPx())
                                val t = s.track
                                val placed = id?.let { t?.let { tr -> Kinetic.placedWord(tr, it, s.aspect, fonts) } }
                                if (placed == null) { id = null; return@detectDragGestures }
                                player.pause()
                                pick?.select(id)
                                at = Offset(placed.x, placed.y)
                            },
                            onDragEnd = { if (id != null) s.track?.let(commit); id = null },
                            onDragCancel = { if (id != null) s.track?.let(commit); id = null },
                        ) { change, drag ->
                            val w = id ?: return@detectDragGestures
                            val t = s.track ?: return@detectDragGestures
                            change.consume()
                            at = Offset((at.x + drag.x / size.width).coerceIn(0.02f, 0.98f), (at.y + drag.y / size.height).coerceIn(0.03f, 0.97f))
                            // The centre line snaps, as with the classic block.
                            val x = if (abs(at.x - 0.5f) < 0.02f) 0.5f else at.x
                            val word = Kinetic.phraseOf(t, w)?.words?.firstOrNull { it.id == w } ?: return@detectDragGestures
                            val e = t.edits[w]?.takeIf { it.text == word.text } ?: WordEdit(text = word.text)
                            s.track = t.withEdit(w, e.copy(x = x, y = at.y))
                        }
                        return@pointerInput
                    }
                    if (!movable) return@pointerInput
                    detectDragGestures(
                        onDragEnd = { s.track?.let(commit) },
                        onDragCancel = { s.track?.let(commit) },
                    ) { change, drag ->
                        change.consume()
                        val t = s.track ?: return@detectDragGestures
                        var x = (t.style.x + drag.x / size.width).coerceIn(0f, 1f)
                        val y = (t.style.y + drag.y / size.height).coerceIn(0.03f, 0.97f)
                        if (t.style.align == SubAlign.CENTER && abs(x - 0.5f) < 0.025f) x = 0.5f
                        s.track = t.copy(style = t.style.copy(x = x, y = y))
                    }
                },
        )
        if (!player.playing && sel == null) {
            Box(Modifier.align(Alignment.Center).size(54.dp).background(Color(0x66000000), CircleShape), contentAlignment = Alignment.Center) {
                Icon(Ico.Play, null, tint = Color.White, modifier = Modifier.size(26.dp))
            }
        }
    }
    // Follows the clip every frame, so the words move smoothly.
    LaunchedEffect(player) {
        while (true) {
            withFrameNanos { }
            player.view?.let { if (it.isPlaying || !player.playing) s.positionMs = it.currentPosition.toLong() }
        }
    }
}

/** The clip full screen with its subtitles, to check them before burning in. */
@Composable
private fun SubFullScreen(ui: UiState, actions: CameraActions, s: SubtitleSession, fonts: FontLibrary?, player: SubPlayer, close: () -> Unit) {
    // Back leaves full screen, not the editor.
    androidx.activity.compose.BackHandler(onBack = close)
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        BoxWithConstraints(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            val fit = if (maxWidth / maxHeight > s.aspect) Modifier.fillMaxHeight().aspectRatio(s.aspect) else Modifier.fillMaxWidth().aspectRatio(s.aspect)
            SubVideo(s, fonts, player, fit, movable = false) { t -> actions.updateSubtitles(t) }
        }
        Row(Modifier.align(Alignment.TopStart).statusBarsPadding().padding(8.dp)) {
            Box(Modifier.size(42.dp).clip(CircleShape).background(Color(0x66000000)).clickable(onClick = close), contentAlignment = Alignment.Center) {
                Icon(Ico.Close, null, tint = Color.White, modifier = Modifier.size(22.dp))
            }
        }
        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding()
                .background(Color(0x99000000)).padding(horizontal = 14.dp, vertical = 8.dp),
        ) {
            val dur = s.durationMs.coerceAtLeast(1L)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(36.dp).clip(CircleShape).clickable { player.toggle() }, contentAlignment = Alignment.Center) {
                    Icon(if (player.playing) Ico.Pause else Ico.Play, null, tint = Color.White, modifier = Modifier.size(20.dp))
                }
                Text(subStamp(s.positionMs), color = Color.White, fontSize = 12.sp, fontFamily = UiType.mono)
                Slider(
                    value = (s.positionMs.toFloat() / dur).coerceIn(0f, 1f),
                    onValueChange = { f -> val ms = (f * dur).toLong(); s.positionMs = ms; player.seek(ms) },
                    colors = SliderDefaults.colors(thumbColor = Accent, activeTrackColor = Accent),
                    modifier = Modifier.weight(1f).padding(horizontal = 8.dp),
                )
                Text(subStamp(dur), color = Muted, fontSize = 12.sp, fontFamily = UiType.mono)
            }
            Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                SubSecondary("Back to editing", onClick = close)
                Spacer(Modifier.weight(1f))
                SubPrimary("Burn into video", enabled = ui.progress < 0f && s.track?.cues?.isNotEmpty() == true) { actions.burnSubtitles() }
            }
        }
    }
}

@Composable
private fun SubIcon(icon: androidx.compose.ui.graphics.vector.ImageVector, flip: Boolean = false, onClick: () -> Unit) {
    Box(Modifier.size(40.dp).clip(CircleShape).clickable(onClick = onClick), contentAlignment = Alignment.Center) {
        Icon(icon, null, tint = Color.White, modifier = Modifier.size(21.dp).graphicsLayer { if (flip) scaleX = -1f })
    }
}

@Composable
private fun SubChip(text: String, on: Boolean, font: FontFamily? = null, onClick: () -> Unit) {
    Text(
        text, color = if (on) Color.Black else Color.White, fontSize = 13.sp, fontFamily = font, maxLines = 1,
        modifier = Modifier.clip(Corners.medium).background(if (on) Color.White else Panel)
            .border(1.dp, if (on) Color.White else Color.White.copy(alpha = 0.15f), Corners.medium)
            .clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = 7.dp),
    )
}

@Composable
private fun SubPrimary(text: String, modifier: Modifier = Modifier, enabled: Boolean = true, onClick: () -> Unit) {
    Text(
        text, color = Color.Black, fontSize = 14.sp, fontWeight = FontWeight.SemiBold,
        modifier = modifier.clip(Corners.small).background(if (enabled) Accent else Accent.copy(alpha = 0.4f))
            .clickable(enabled = enabled, onClick = onClick).padding(horizontal = 18.dp, vertical = 11.dp),
    )
}

@Composable
private fun SubSecondary(text: String, onClick: () -> Unit) {
    Text(
        text, color = Color.White, fontSize = 13.sp,
        modifier = Modifier.clip(Corners.small).border(1.dp, Color.White.copy(alpha = 0.25f), Corners.small)
            .clickable(onClick = onClick).padding(horizontal = 14.dp, vertical = 10.dp),
    )
}

/** The person's Gemini API key (free from Google AI Studio) and the model to use. */
@Composable
private fun SubKeyPanel(ui: UiState, actions: CameraActions, onDone: () -> Unit) {
    var key by remember { mutableStateOf(ui.geminiKey) }
    var model by remember { mutableStateOf(ui.geminiModel) }
    Column(Modifier.fillMaxWidth().padding(12.dp).clip(Corners.medium).background(Panel).padding(14.dp)) {
        Text("Gemini API key", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        Text("Free from aistudio.google.com/apikey. The clip's sound is sent to Google to be transcribed; nothing else leaves the phone.",
            color = Muted, fontSize = 11.sp, modifier = Modifier.padding(top = 3.dp, bottom = 8.dp))
        SubField(key, "Paste your key") { key = it }
        Spacer(Modifier.height(8.dp))
        Text("Model", color = Muted, fontSize = 11.sp)
        Row(Modifier.padding(vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SubChip("Best (3.8 Flash)", model == app.filmcam.sub.GeminiTranscriber.DEFAULT_MODEL) { model = app.filmcam.sub.GeminiTranscriber.DEFAULT_MODEL }
            SubChip("Fast (3.5 Flash-Lite)", model == app.filmcam.sub.GeminiTranscriber.FAST_MODEL) { model = app.filmcam.sub.GeminiTranscriber.FAST_MODEL }
        }
        SubField(model, "gemini-3.8-flash") { model = it }
        Spacer(Modifier.height(10.dp))
        SubPrimary("Save", Modifier.align(Alignment.End)) { actions.setGemini(key, model); onDone() }
    }
}

@Composable
private fun SubField(value: String, hint: String, font: FontFamily? = null, size: Int = 14, onChange: (String) -> Unit) {
    Box(Modifier.fillMaxWidth().clip(Corners.small).background(Color(0xFF232323)).padding(horizontal = 10.dp, vertical = 9.dp)) {
        if (value.isEmpty()) Text(hint, color = Color.White.copy(alpha = 0.3f), fontSize = size.sp, fontFamily = font)
        BasicTextField(
            value = value, onValueChange = onChange, cursorBrush = SolidColor(Accent),
            textStyle = TextStyle(color = Color.White, fontSize = size.sp, fontFamily = font),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun SubWorking(s: SubtitleSession, actions: CameraActions) {
    var now by remember { mutableStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) { while (true) { now = System.currentTimeMillis(); delay(500) } }
    val secs = ((now - s.startedAt) / 1000).coerceAtLeast(0)
    Column(Modifier.fillMaxWidth().padding(top = 32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        CircularProgressIndicator(color = Accent, strokeWidth = 2.5.dp, modifier = Modifier.size(34.dp))
        Spacer(Modifier.height(14.dp))
        Text("${s.status}…  ${secs}s", color = Color.White, fontSize = 14.sp)
        Text(
            if (s.linesSoFar > 0) "${s.linesSoFar} lines so far" else "A minute of speech usually takes 10–40 seconds",
            color = Muted, fontSize = 11.sp, modifier = Modifier.padding(top = 4.dp),
        )
        Spacer(Modifier.height(14.dp))
        SubSecondary("Cancel") { actions.cancelSubtitles() }
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
            modifier = Modifier.clip(Corners.medium).clickable {
                actions.updateSubtitles(SubtitleTrack(listOf(Cue(0, minOf(3000L, s.durationMs.coerceAtLeast(1000L))))))
            }.padding(8.dp))
    }
}

@Composable
private fun ColumnScope.SubEditor(
    ui: UiState, actions: CameraActions, s: SubtitleSession, track: SubtitleTrack, fonts: FontLibrary?,
    tab: SubTab, setTab: (SubTab) -> Unit, preview: () -> Unit, player: SubPlayer,
    selected: String?, select: (String?) -> Unit,
) {
    fun set(t: SubtitleTrack) = actions.updateSubtitles(t)
    val seek: (Long) -> Unit = { ms -> player.seek(ms) }

    Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        tabsFor(track).forEach { t ->
            Text(
                t.label, color = if (tab == t) Color.Black else Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f).clip(Corners.medium).background(if (tab == t) Accent else Panel)
                    .clickable { setTab(t) }.padding(vertical = 8.dp),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
        }
    }

    Box(Modifier.fillMaxWidth().weight(1f)) {
        when (tab) {
            SubTab.LINES -> SubLines(s, track, fonts, seek, ::set)
            SubTab.STYLE -> SubStylePanel(track, fonts, ::set)
            SubTab.PLACE -> SubPlacePanel(track, ::set)
            SubTab.WORDS -> SubWordsPanel(s, track, fonts, player, selected, select, ::set)
        }
    }
    s.error?.let { Text(it, color = Color(0xFFFF7A66), fontSize = 12.sp, modifier = Modifier.padding(horizontal = 16.dp)) }

    Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        SubSecondary("Redo") { actions.generateSubtitles() }
        SubSecondary(".srt") { actions.saveSrt() }
        SubSecondary("Preview", onClick = preview)
        Spacer(Modifier.weight(1f))
        SubPrimary("Burn in", enabled = ui.progress < 0f && track.cues.isNotEmpty()) { actions.burnSubtitles() }
    }
}

/** Every line, in order of time: its words, and exactly when it starts and ends. */
@Composable
private fun SubLines(s: SubtitleSession, track: SubtitleTrack, fonts: FontLibrary?, seek: (Long) -> Unit, set: (SubtitleTrack) -> Unit) {
    val style = track.style
    val latinFamily = fonts?.let { FontFamily(it.typeface(style.latinFont)) }
    val teluguFamily = fonts?.let { FontFamily(it.typeface(style.teluguFont)) }
    val list = rememberLazyListState()
    val current = track.cues.indexOfFirst { s.positionMs >= it.startMs && s.positionMs < it.endMs }
    val dur = if (s.durationMs > 0) s.durationMs else Long.MAX_VALUE
    fun setCue(i: Int, c: Cue) = set(track.copy(cues = track.cues.toMutableList().also { it[i] = c }.sortedBy { it.startMs }))
    LazyColumn(Modifier.fillMaxSize(), state = list, contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)) {
        itemsIndexed(track.cues, key = { i, c -> "$i-${c.startMs}" }) { i, c ->
            SubCueRow(
                c, i == current, style.language, latinFamily, teluguFamily, s.positionMs, seek,
                onChange = { setCue(i, it) },
                setStart = { ms -> setCue(i, c.copy(startMs = ms.coerceIn(0L, c.endMs - 200))) },
                setEnd = { ms -> setCue(i, c.copy(endMs = ms.coerceIn(c.startMs + 200, dur))) },
                delete = { set(track.copy(cues = track.cues.filterIndexed { j, _ -> j != i })) },
            )
        }
        item {
            Text("+ Add a line at ${subStamp(s.positionMs)}", color = Accent, fontSize = 13.sp,
                modifier = Modifier.clip(Corners.medium).clickable {
                    val start = s.positionMs
                    val next = track.cues.firstOrNull { it.startMs > start }?.startMs ?: s.durationMs
                    val cue = Cue(start, minOf(start + 2500, next.coerceAtLeast(start + 500)))
                    set(track.copy(cues = (track.cues + cue).sortedBy { it.startMs }))
                }.padding(10.dp))
        }
    }
}

@Composable
private fun SubCueRow(
    c: Cue, active: Boolean, language: SubtitleLanguage, latin: FontFamily?, telugu: FontFamily?, now: Long,
    seek: (Long) -> Unit, onChange: (Cue) -> Unit, setStart: (Long) -> Unit, setEnd: (Long) -> Unit, delete: () -> Unit,
) {
    Column(
        Modifier.fillMaxWidth().clip(Corners.medium).background(if (active) Color(0xFF1E1E20) else Panel)
            .border(1.dp, if (active) Accent.copy(alpha = 0.7f) else Color.Transparent, Corners.medium)
            .padding(horizontal = 10.dp, vertical = 8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            SubTime("Start", c.startMs, Modifier.weight(1f), seek = { seek(c.startMs) }, nudge = { d -> setStart(c.startMs + d) }, toNow = { setStart(now) })
            Spacer(Modifier.width(6.dp))
            SubTime("End", c.endMs, Modifier.weight(1f), seek = { seek((c.endMs - 300).coerceAtLeast(c.startMs)) }, nudge = { d -> setEnd(c.endMs + d) }, toNow = { setEnd(now) })
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

/** One end of a line: its time (tap to jump there), − / + a tenth of a second (hold to run), Now. */
@Composable
private fun SubTime(label: String, ms: Long, modifier: Modifier, seek: () -> Unit, nudge: (Long) -> Unit, toNow: () -> Unit) {
    Column(modifier) {
        Text(label, color = Muted, fontSize = 10.sp, modifier = Modifier.padding(start = 4.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            SubRepeat("−") { nudge(-100) }
            Text(subStamp(ms), color = Color.White, fontSize = 13.sp, fontFamily = UiType.mono,
                modifier = Modifier.clip(Corners.small).clickable(onClick = seek).padding(horizontal = 3.dp, vertical = 4.dp))
            SubRepeat("+") { nudge(100) }
            Text("Now", color = Accent, fontSize = 11.sp,
                modifier = Modifier.clip(Corners.small).clickable(onClick = toNow).padding(horizontal = 5.dp, vertical = 5.dp))
        }
    }
}

/** A small button that repeats while held. */
@Composable
private fun SubRepeat(text: String, onStep: () -> Unit) {
    val step by rememberUpdatedState(onStep)
    val scope = rememberCoroutineScope()
    Box(
        Modifier.size(28.dp).clip(CircleShape).background(Color(0xFF2A2A2A)).pointerInput(Unit) {
            detectTapGestures(onPress = {
                val job = scope.launch {
                    step()
                    delay(420)
                    while (true) { step(); delay(90) }
                }
                tryAwaitRelease()
                job.cancel()
            })
        },
        contentAlignment = Alignment.Center,
    ) { Text(text, color = Color.White, fontSize = 15.sp) }
}

/** Language, fonts, size, colour and what sits behind the letters. */
@Composable
private fun SubStylePanel(track: SubtitleTrack, fonts: FontLibrary?, set: (SubtitleTrack) -> Unit) {
    val style = track.style
    fun st(f: (SubtitleStyle) -> SubtitleStyle) = set(track.copy(style = f(style)))
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 4.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)) {
        SubLabel("Template")
        SubTemplates(style.template, fonts) { tpl -> st { it.copy(template = tpl) } }
        SubLabel("Language")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SubtitleLanguage.entries.forEach { l -> SubChip(l.label, style.language == l) { st { it.copy(language = l) } } }
        }
        if (style.kinetic) {
            SubKineticStyle(track, fonts, set)
            return@Column
        }
        if (fonts != null) {
            if (style.language != SubtitleLanguage.TELUGU) {
                SubLabel("English font")
                SubFontMenu(fonts, style.latinFont, telugu = false) { k -> st { it.copy(latinFont = k) } }
            }
            if (style.language != SubtitleLanguage.ENGLISH) {
                SubLabel("Telugu font")
                SubFontMenu(fonts, style.teluguFont, telugu = true) { k -> st { it.copy(teluguFont = k) } }
            }
        }
        SubLabel("Size")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            SubChip("A−", false) { st { it.copy(size = (it.size - 0.004f).coerceAtLeast(0.022f)) } }
            Text("${(style.size * 1000).roundToInt()}", color = Color.White, fontSize = 13.sp, fontFamily = UiType.mono)
            SubChip("A+", false) { st { it.copy(size = (it.size + 0.004f).coerceAtMost(0.12f)) } }
        }
        SubLabel("Text colour")
        SubSwatches(TextColors, style.color) { c -> st { it.copy(color = c) } }
        SubLabel("Background")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SubtitleBackground.entries.forEach { b -> SubChip(b.label, style.background == b) { st { it.copy(background = b) } } }
        }
        if (style.background == SubtitleBackground.BOX || style.background == SubtitleBackground.OUTLINE) {
            SubLabel(if (style.background == SubtitleBackground.BOX) "Box colour" else "Outline colour")
            SubSwatches(BackColors, style.backColor) { c -> st { it.copy(backColor = c) } }
        }
        if (style.background == SubtitleBackground.BOX) {
            SubLabel("Box opacity")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Opacities.forEach { o -> SubChip("${(o * 100).roundToInt()}%", abs(style.backOpacity - o) < 0.05f) { st { it.copy(backOpacity = o) } } }
            }
        }
        Spacer(Modifier.height(8.dp))
    }
}

@Composable
private fun SubLabel(text: String) = Text(text, color = Muted, fontSize = 11.sp)

@Composable
private fun SubSwatches(colors: List<Int>, selected: Int, pick: (Int) -> Unit) {
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        colors.forEach { c ->
            val on = (c or (0xFF shl 24)) == (selected or (0xFF shl 24))
            Box(
                Modifier.size(30.dp).clip(CircleShape).background(Color(c))
                    .border(if (on) 3.dp else 1.dp, if (on) Accent else Color.White.copy(alpha = 0.3f), CircleShape)
                    .clickable { pick(c) },
            )
        }
    }
}

/** A drop-down of every font that has the script's letters, each shown in its own face. */
@Composable
private fun SubFontMenu(fonts: FontLibrary, selected: String, telugu: Boolean, pick: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val options = fonts.fonts.filter { if (telugu) it.telugu else it.latin }
    val sample = if (telugu) "తెలుగు ఉపశీర్షికలు" else "Subtitles Aa"
    Box {
        Row(
            Modifier.fillMaxWidth().clip(Corners.medium).background(Panel)
                .border(1.dp, Color.White.copy(alpha = 0.15f), Corners.medium)
                .clickable { open = true }.padding(horizontal = 12.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(fonts.label(selected), color = Color.White, fontSize = 15.sp, fontFamily = FontFamily(fonts.typeface(selected)), maxLines = 1)
            Spacer(Modifier.weight(1f))
            Text("${options.size} fonts  ▾", color = Muted, fontSize = 12.sp)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }, modifier = Modifier.background(Color(0xFF1C1C1C))) {
            options.forEach { f ->
                DropdownMenuItem(
                    text = {
                        Column {
                            Text(f.label, color = if (f.key == selected) Accent else Color.White, fontSize = 16.sp, fontFamily = FontFamily(f.typeface), maxLines = 1)
                            Text(sample, color = Muted, fontSize = 12.sp, fontFamily = FontFamily(f.typeface), maxLines = 1)
                        }
                    },
                    onClick = { pick(f.key); open = false },
                )
            }
        }
    }
}

/**
 * Where the subtitles sit: nine quick spots (top, middle, bottom by left, centre, right), or
 * drag them on the video. They stay inside the frame either way.
 */
@Composable
private fun SubPlacePanel(track: SubtitleTrack, set: (SubtitleTrack) -> Unit) {
    val style = track.style
    val cols = listOf(Triple(0.05f, SubAlign.LEFT, "Left"), Triple(0.5f, SubAlign.CENTER, "Centre"), Triple(0.95f, SubAlign.RIGHT, "Right"))
    val rows = listOf(0.1f to "Top", 0.5f to "Middle", 0.86f to "Bottom")
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally) {
        Text("Drag the subtitles on the video to put them anywhere, or pick a spot.", color = Muted, fontSize = 12.sp,
            modifier = Modifier.padding(bottom = 10.dp))
        Column(
            Modifier.width(220.dp).aspectRatio(1.25f).clip(Corners.medium).background(Panel)
                .border(1.dp, Color.White.copy(alpha = 0.15f), Corners.medium).padding(6.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            rows.forEach { (y, yName) ->
                Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    cols.forEach { (x, align, xName) ->
                        val on = style.align == align && abs(style.x - x) < 0.03f && abs(style.y - y) < 0.04f
                        Box(
                            Modifier.weight(1f).fillMaxHeight().clip(Corners.small)
                                .background(if (on) Accent else Color(0xFF242424))
                                .clickable { set(track.copy(style = style.copy(x = x, y = y, align = align))) },
                            contentAlignment = when (align) {
                                SubAlign.LEFT -> Alignment.CenterStart
                                SubAlign.CENTER -> Alignment.Center
                                SubAlign.RIGHT -> Alignment.CenterEnd
                            },
                        ) {
                            Box(Modifier.padding(horizontal = 6.dp).width(26.dp).height(5.dp).clip(Corners.small)
                                .background(if (on) Color.Black else Color.White.copy(alpha = 0.6f)))
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(10.dp))
        Text("Line up", color = Muted, fontSize = 11.sp)
        Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SubAlignChip(Ico.AlignLeft, style.align == SubAlign.LEFT) { set(track.copy(style = style.copy(align = SubAlign.LEFT))) }
            SubAlignChip(Ico.AlignCenter, style.align == SubAlign.CENTER) { set(track.copy(style = style.copy(align = SubAlign.CENTER))) }
            SubAlignChip(Ico.AlignRight, style.align == SubAlign.RIGHT) { set(track.copy(style = style.copy(align = SubAlign.RIGHT))) }
        }
        Spacer(Modifier.height(10.dp))
    }
}

@Composable
private fun SubAlignChip(icon: androidx.compose.ui.graphics.vector.ImageVector, on: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.size(40.dp).clip(Corners.medium).background(if (on) Color.White else Panel)
            .border(1.dp, Color.White.copy(alpha = 0.15f), Corners.medium).clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Icon(icon, null, tint = if (on) Color.Black else Color.White, modifier = Modifier.size(20.dp)) }
}

/** The four ways to set subtitles, each named in the face it uses. */
@Composable
private fun SubTemplates(selected: CaptionTemplate, fonts: FontLibrary?, pick: (CaptionTemplate) -> Unit) {
    val sans = fonts?.let { FontFamily(it.typeface(FontLibrary.CAPTION_SANS)) }
    val serif = fonts?.let { FontFamily(it.typeface(FontLibrary.CAPTION_SERIF)) }
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        CaptionTemplate.entries.forEach { t ->
            val on = t == selected
            Column(
                Modifier.width(132.dp).height(92.dp).clip(Corners.medium).background(if (on) Accent else Panel)
                    .border(1.dp, if (on) Accent else Color.White.copy(alpha = 0.15f), Corners.medium)
                    .clickable { pick(t) }.padding(10.dp),
            ) {
                val ink = if (on) Color.Black else Color.White
                // A little picture of each: how the words sit.
                Box(Modifier.fillMaxWidth().weight(1f)) {
                    when (t) {
                        CaptionTemplate.CLASSIC -> Text("a line at a time", color = ink, fontSize = 10.sp, maxLines = 1,
                            modifier = Modifier.align(Alignment.BottomCenter).background(if (on) Color(0x22000000) else Color(0x33FFFFFF), Corners.small).padding(horizontal = 4.dp))
                        CaptionTemplate.SCATTER -> {
                            Text("the one", color = ink, fontSize = 8.sp, fontFamily = sans, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 2.dp))
                            Text("question", color = ink, fontSize = 20.sp, fontFamily = sans, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 6.dp))
                        }
                        CaptionTemplate.STACK -> Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("never said", color = ink, fontSize = 14.sp, fontFamily = sans, fontWeight = FontWeight.Bold, lineHeight = 14.sp)
                            Text("out loud", color = ink, fontSize = 16.sp, fontFamily = serif, lineHeight = 15.sp)
                        }
                        CaptionTemplate.FOCUS -> Text("viral ideas", color = ink, fontSize = 15.sp, fontFamily = sans, fontWeight = FontWeight.Bold, modifier = Modifier.align(Alignment.Center))
                    }
                }
                Text(t.label, color = ink, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            }
        }
    }
    Text(selected.blurb, color = Muted, fontSize = 11.sp)
}

private val CaptionScales = listOf(0.7f, 0.85f, 1f, 1.15f, 1.3f)

/** Kinetic captions: faces, size, colour, how words come in, and words behind the subject. */
@Composable
private fun SubKineticStyle(track: SubtitleTrack, fonts: FontLibrary?, set: (SubtitleTrack) -> Unit) {
    val style = track.style
    fun st(f: (SubtitleStyle) -> SubtitleStyle) = set(track.copy(style = f(style)))
    if (style.language == SubtitleLanguage.BOTH) Text("Kinetic captions show one language: English here.", color = Muted, fontSize = 11.sp)
    Row(Modifier.fillMaxWidth().clip(Corners.medium).background(Panel).padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text("Text behind subject", color = Color.White, fontSize = 14.sp)
            Text("Some big words pass behind you, the rest stay in front. Faded here; tucked behind you when burnt in.",
                color = Muted, fontSize = 11.sp)
        }
        Spacer(Modifier.width(10.dp))
        Toggle(style.behindSubject) { st { it.copy(behindSubject = !it.behindSubject) } }
    }
    SubLabel("Words come in")
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        WordAnim.entries.forEach { a -> SubChip(a.label, style.wordAnim == a) { st { it.copy(wordAnim = a) } } }
    }
    SubLabel("Size")
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        CaptionScales.forEach { k -> SubChip("${(k * 100).roundToInt()}%", abs(style.captionScale - k) < 0.02f) { st { it.copy(captionScale = k) } } }
    }
    SubLabel("Colour")
    SubSwatches(TextColors, style.color) { c -> st { it.copy(color = c) } }
    if (fonts != null) {
        if (style.language == SubtitleLanguage.TELUGU) {
            SubLabel("Telugu font")
            SubFontMenu(fonts, style.teluguFont, telugu = true) { k -> st { it.copy(teluguFont = k) } }
        } else {
            SubLabel("Main font")
            SubFontMenu(fonts, style.captionFont, telugu = false) { k -> st { it.copy(captionFont = k) } }
            SubLabel("Accent font (the odd big word)")
            SubFontMenu(fonts, style.accentFont, telugu = false) { k -> st { it.copy(accentFont = k) } }
            if (style.template == CaptionTemplate.STACK) {
                SubLabel("Italic font")
                SubFontMenu(fonts, style.captionItalic, telugu = false) { k -> st { it.copy(captionItalic = k) } }
            }
        }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        SubSecondary("Shuffle layout") { st { it.copy(seed = it.seed + 1) } }
        if (style.seed != 0) SubSecondary("Original layout") { st { it.copy(seed = 0) } }
    }
    if (track.edits.isNotEmpty()) {
        SubSecondary("Undo ${track.edits.size} word change${if (track.edits.size == 1) "" else "s"}") { set(track.copy(edits = emptyMap())) }
    }
    Spacer(Modifier.height(8.dp))
}

/**
 * One word at a time: tap a word on the video (or below) to pick it, drag it anywhere, and
 * change its font, size, colour, entrance and whether it sits in front of or behind you.
 */
@Composable
private fun SubWordsPanel(
    s: SubtitleSession, track: SubtitleTrack, fonts: FontLibrary?, player: SubPlayer,
    selected: String?, select: (String?) -> Unit, set: (SubtitleTrack) -> Unit,
) {
    val phrases = Kinetic.plan(track).phrases
    // The phrase picked, else the one on screen.
    val phrase = selected?.let { Kinetic.phraseOf(track, it) } ?: Kinetic.phraseAt(track, s.positionMs) ?: phrases.firstOrNull()
    fun show(p: Phrase, id: String? = null) {
        // Hold the clip where the whole phrase is in.
        player.pause()
        val at = (p.words.last().startMs + Kinetic.IN_MS + 40).coerceAtMost(p.endMs - 1)
        s.positionMs = at
        player.seek(at)
        select(id)
    }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 4.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (phrase == null) {
            Text("No words yet: write some lines first.", color = Muted, fontSize = 12.sp)
            return@Column
        }
        // The phrase's words, with steps to the one before and after.
        Row(verticalAlignment = Alignment.CenterVertically) {
            SubIcon(Ico.Back) { phrases.getOrNull(phrase.index - 1)?.let { show(it) } }
            Row(Modifier.weight(1f).horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                phrase.words.forEach { w ->
                    val edited = track.edits[w.id]?.takeIf { it.text == w.text } != null
                    SubChip(if (edited) "${w.text} •" else w.text, w.id == selected) { show(phrase, if (w.id == selected) null else w.id) }
                }
            }
            SubIcon(Ico.Back, flip = true) { phrases.getOrNull(phrase.index + 1)?.let { show(it) } }
        }
        val word = phrase.words.firstOrNull { it.id == selected }
        if (word == null) {
            Text("Tap a word on the video, or above, to change it. Drag a word to move it.", color = Muted, fontSize = 12.sp)
            return@Column
        }
        val edit = track.edits[word.id]?.takeIf { it.text == word.text } ?: WordEdit(text = word.text)
        val placed = Kinetic.placedWord(track, word.id, s.aspect, fonts)
        fun ed(f: (WordEdit) -> WordEdit) = set(track.withEdit(word.id, f(edit)))
        val style = track.style

        SubLabel("Font")
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            val faces = listOf(style.captionFont to "Sans", style.captionItalic to "Italic", style.accentFont to "Serif")
            faces.forEach { (key, name) ->
                SubChip(name, placed?.font == key, fonts?.let { FontFamily(it.typeface(key)) }) { ed { it.copy(font = key) } }
            }
        }
        if (fonts != null) SubFontMenu(fonts, placed?.font ?: style.captionFont, telugu = style.language == SubtitleLanguage.TELUGU) { k -> ed { it.copy(font = k) } }
        SubLabel("Size")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            val now = placed?.size ?: 0.08f
            // Shown against the template's own size for the word.
            val base = if (edit.size == null) now else Kinetic.placedWord(track.withEdit(word.id, edit.copy(size = null)), word.id, s.aspect, fonts)?.size ?: now
            SubRepeat("−") { val n = (now * 0.92f).coerceAtLeast(0.025f); ed { it.copy(size = n) } }
            Text("${(now / base * 100).roundToInt()}%", color = Color.White, fontSize = 13.sp, fontFamily = UiType.mono)
            SubRepeat("+") { val n = (now * 1.08f).coerceAtMost(0.32f); ed { it.copy(size = n) } }
        }
        SubLabel("Colour")
        SubSwatches(TextColors, placed?.color ?: style.color) { c -> ed { it.copy(color = c) } }
        SubLabel("Comes in")
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            WordAnim.entries.forEach { a -> SubChip(a.label, (edit.anim ?: style.wordAnim) == a) { ed { it.copy(anim = a) } } }
        }
        SubLabel("Depth")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            WordDepth.entries.forEach { d -> SubChip(d.label, edit.depth == d) { ed { it.copy(depth = d) } } }
        }
        if (placed?.behind == true) Text("Behind you: faded in this preview, tucked behind you when burnt in.", color = Muted, fontSize = 11.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (!edit.isEmpty) SubSecondary("Reset word") { set(track.withEdit(word.id, WordEdit(text = word.text))) }
            SubSecondary("Done") { select(null) }
        }
        Spacer(Modifier.height(8.dp))
    }
}

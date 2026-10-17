package app.filmcam.ui

import android.graphics.ImageDecoder
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.util.LruCache
import android.util.Size
import android.widget.VideoView
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
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
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import app.filmcam.util.MediaItem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlin.math.max
import kotlin.math.roundToInt

private object Thumbs {
    val cache = LruCache<Uri, ImageBitmap>(160)
}

@Composable
private fun rememberThumb(uri: Uri, px: Int = 320): ImageBitmap? {
    val ctx = LocalContext.current
    val state by produceState(Thumbs.cache.get(uri), uri) {
        if (value != null) return@produceState
        value = withContext(Dispatchers.IO) {
            runCatching { ctx.contentResolver.loadThumbnail(uri, Size(px, px), null).asImageBitmap() }.getOrNull()
        }?.also { Thumbs.cache.put(uri, it) }
    }
    return state
}

// ------------------------------------------------------------------ gallery

/** Everything the app has shot, newest first, and the way in for imports. */
@Composable
fun GalleryScreen(ui: UiState, actions: CameraActions) {
    val p = LocalPalette.current
    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
        Row(Modifier.fillMaxWidth().height(56.dp).padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            IconCircle(Ico.Back) { actions.closeGallery() }
            Spacer(Modifier.width(6.dp))
            Text("Gallery", color = p.text, fontSize = 20.sp, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
            Row(
                Modifier.clip(Corners.small).background(p.text).clickable { actions.importMedia() }
                    .padding(horizontal = 14.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Ico.Import, null, tint = p.bg, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text("Import", color = p.bg, fontSize = 13.sp, fontWeight = FontWeight.Medium)
            }
        }
        if (ui.gallery.isEmpty()) {
            Column(Modifier.fillMaxSize().padding(36.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(Ico.Gallery, null, tint = p.muted, modifier = Modifier.size(30.dp))
                Spacer(Modifier.height(14.dp))
                Text("Nothing here yet", color = p.text, fontSize = 18.sp, fontWeight = FontWeight.Medium)
                Spacer(Modifier.height(8.dp))
                Text(
                    "Photos and clips you shoot appear here. Import brings in any photo or video from your phone to develop with a look.",
                    color = p.muted, fontSize = 13.sp, lineHeight = 19.sp,
                )
            }
            return@Column
        }
        LazyVerticalGrid(
            GridCells.Fixed(3),
            contentPadding = PaddingValues(4.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            items(ui.gallery, key = { it.uri.toString() }) { item ->
                val thumb = rememberThumb(item.uri)
                Box(
                    Modifier.animateItem().aspectRatio(1f).clip(Corners.small).background(p.surfaceHigh)
                        .clickable { actions.openItem(item) },
                ) {
                    // Thumbnails fade in as they load rather than popping.
                    androidx.compose.animation.AnimatedVisibility(thumb != null, enter = fadeIn(tween(220))) {
                        thumb?.let { Image(it, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop) }
                    }
                    if (item.video) {
                        Row(
                            Modifier.align(Alignment.BottomEnd).padding(5.dp).background(Color(0x88000000), Corners.small)
                                .padding(horizontal = 6.dp, vertical = 2.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Ico.Play, null, tint = Color.White, modifier = Modifier.size(10.dp))
                            Spacer(Modifier.width(3.dp))
                            Text(clipLabel(item.durationMs), color = Color.White, fontSize = 10.sp, fontFamily = UiType.mono)
                        }
                    }
                }
            }
        }
    }
}

// ------------------------------------------------------------------ viewer

/**
 * One photo or clip, full screen: play, trim, share, develop again or delete. Swipe left and
 * right for the next and previous take; the look each was made with sits at the top.
 */
@Composable
fun ViewerScreen(ui: UiState, actions: CameraActions) {
    val current = ui.viewing ?: return
    // Everything in the gallery, or just this take until the gallery has loaded.
    val items = remember(ui.gallery, current.uri) {
        if (ui.gallery.any { it.uri == current.uri }) ui.gallery else listOf(current)
    }
    val index = items.indexOfFirst { it.uri == current.uri }.coerceAtLeast(0)
    val pager = rememberPagerState(index) { items.size }
    var trimming by remember(current.uri) { mutableStateOf(false) }
    var confirmDelete by remember(current.uri) { mutableStateOf(false) }
    var zoomed by remember { mutableStateOf(false) }
    // The list can arrive after the viewer opens: keep showing the same take.
    LaunchedEffect(items) { if (pager.currentPage != index) pager.scrollToPage(index) }
    LaunchedEffect(pager) {
        snapshotFlow { pager.settledPage }.collect { page -> items.getOrNull(page)?.let { if (it.uri != ui.viewing?.uri) ui.viewing = it } }
    }
    val item = items.getOrNull(pager.settledPage) ?: current
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
            Row(Modifier.fillMaxWidth().height(56.dp).padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                DarkIcon(Ico.Back) { actions.closeViewer() }
                Spacer(Modifier.weight(1f))
                if (items.size > 1) {
                    Text("${pager.currentPage + 1} / ${items.size}", color = Color.White.copy(alpha = 0.55f), fontSize = 11.sp,
                        fontFamily = UiType.mono, letterSpacing = 1.sp)
                }
                Spacer(Modifier.weight(1f))
                DarkIcon(Ico.Gallery) { actions.openGallery() }
            }
            ShotLook(item, actions)
            HorizontalPager(
                pager, Modifier.weight(1f).fillMaxWidth(),
                userScrollEnabled = !trimming && !zoomed, beyondViewportPageCount = 1,
                key = { items[it].uri.toString() },
            ) { page ->
                val it = items[page]
                // Only the take in view plays; its neighbours show their still frame.
                Box(Modifier.fillMaxSize().graphicsLayer {
                    val off = ((pager.currentPage - page) + pager.currentPageOffsetFraction).let { o -> kotlin.math.abs(o) }.coerceIn(0f, 1f)
                    alpha = 1f - 0.5f * off
                    scaleX = 1f - 0.06f * off; scaleY = scaleX
                }, contentAlignment = Alignment.Center) {
                    when {
                        it.video && page == pager.settledPage -> VideoPlayer(it, trimming, actions) { trimming = false }
                        it.video -> rememberThumb(it.uri, 720)?.let { t -> Image(t, null, Modifier.fillMaxSize(), contentScale = ContentScale.Fit) }
                        else -> PhotoView(it, onZoom = { z -> if (page == pager.settledPage) zoomed = z })
                    }
                }
            }
            if (!trimming) {
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    ViewerAction(Ico.Share, "Share") { actions.shareItem(item) }
                    ViewerAction(Ico.Wand, "Develop") { actions.editItem(item) }
                    if (item.video) ViewerAction(Ico.Scissors, "Trim") { trimming = true }
                    if (item.video) ViewerAction(Ico.Subtitles, "Subtitles") { actions.openSubtitles(item) }
                    ViewerAction(Ico.Trash, if (confirmDelete) "Sure?" else "Delete", danger = confirmDelete) {
                        if (confirmDelete) actions.deleteItem(item) else confirmDelete = true
                    }
                }
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

/** The look a take was made with; tapping it puts that look on the camera. */
@Composable
private fun ShotLook(item: MediaItem, actions: CameraActions) {
    val look = remember(item.uri) { actions.lookOf(item) }
    AnimatedContent(look, transitionSpec = { fadeIn(tween(200)) togetherWith fadeOut(tween(140)) }, label = "shotLook",
        modifier = Modifier.fillMaxWidth().height(40.dp), contentAlignment = Alignment.Center) { l ->
        if (l == null) return@AnimatedContent
        val (id, name) = l
        Row(
            Modifier.clip(Corners.small).border(1.dp, Color.White.copy(alpha = 0.16f), Corners.small)
                .clickable(enabled = id.isNotEmpty()) { actions.useLookOf(item) }
                .padding(horizontal = 10.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("SHOT WITH", color = Color.White.copy(alpha = 0.5f), fontSize = 9.sp, fontFamily = UiType.mono, letterSpacing = 1.4.sp)
            Spacer(Modifier.width(8.dp))
            Text(name, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Medium, maxLines = 1)
            if (id.isNotEmpty()) {
                Spacer(Modifier.width(10.dp))
                Text("USE  ›", color = Color.White.copy(alpha = 0.7f), fontSize = 9.sp, fontFamily = UiType.mono, letterSpacing = 1.4.sp)
            }
        }
    }
}

@Composable
private fun DarkIcon(icon: ImageVector, onClick: () -> Unit) {
    Box(Modifier.size(40.dp).clip(CircleShape).clickable(onClick = onClick), contentAlignment = Alignment.Center) {
        Icon(icon, null, tint = Color.White, modifier = Modifier.size(22.dp))
    }
}

@Composable
private fun ViewerAction(icon: ImageVector, label: String, danger: Boolean = false, onClick: () -> Unit) {
    val tint = if (danger) Color(0xFFF0553D) else Color.White
    Column(
        Modifier.width(64.dp).clip(Corners.medium).clickable(onClick = onClick).padding(vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(icon, null, tint = tint, modifier = Modifier.size(22.dp))
        Spacer(Modifier.height(5.dp))
        Text(label, color = tint.copy(alpha = 0.8f), fontSize = 11.sp)
    }
}

@Composable
private fun PhotoView(item: MediaItem, onZoom: (Boolean) -> Unit = {}) {
    val ctx = LocalContext.current
    val image by produceState<ImageBitmap?>(Thumbs.cache.get(item.uri), item.uri) {
        value = withContext(Dispatchers.IO) {
            runCatching {
                ImageDecoder.decodeBitmap(ImageDecoder.createSource(ctx.contentResolver, item.uri)) { d, info, _ ->
                    val long = max(info.size.width, info.size.height)
                    if (long > 2560) {
                        val k = 2560f / long
                        d.setTargetSize((info.size.width * k).toInt(), (info.size.height * k).toInt())
                    }
                }.asImageBitmap()
            }.getOrNull()
        } ?: value
    }
    var scale by remember(item.uri) { mutableFloatStateOf(1f) }
    var offset by remember(item.uri) { mutableStateOf(Offset.Zero) }
    val img = image ?: return
    Image(
        img, null,
        Modifier
            .fillMaxSize()
            .pointerInput(item.uri) {
                detectTapGestures(onDoubleTap = { if (scale > 1f) { scale = 1f; offset = Offset.Zero; onZoom(false) } else { scale = 2.5f; onZoom(true) } })
            }
            .pointerInput(item.uri) {
                // Pinch to zoom; once zoomed, one finger pans. A one-finger swipe on an
                // unzoomed photo is left for the pager (next / previous take).
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false)
                    do {
                        val ev = awaitPointerEvent()
                        if (ev.changes.size > 1 || scale > 1f) {
                            scale = (scale * ev.calculateZoom()).coerceIn(1f, 6f)
                            offset = if (scale == 1f) Offset.Zero else offset + ev.calculatePan()
                            ev.changes.forEach { c -> if (c.positionChanged()) c.consume() }
                        }
                    } while (ev.changes.any { it.pressed })
                    onZoom(scale > 1f)
                }
            }
            .graphicsLayer { scaleX = scale; scaleY = scale; translationX = offset.x; translationY = offset.y },
        contentScale = ContentScale.Fit,
    )
}

/** Plays a clip with the system player, with a scrubber and, when [trimming], a trim bar. */
@Composable
private fun VideoPlayer(item: MediaItem, trimming: Boolean, actions: CameraActions, onTrimDone: () -> Unit) {
    var view by remember(item.uri) { mutableStateOf<VideoView?>(null) }
    var duration by remember(item.uri) { mutableLongStateOf(item.durationMs) }
    var position by remember(item.uri) { mutableLongStateOf(0L) }
    var playing by remember(item.uri) { mutableStateOf(true) }
    var start by remember(item.uri) { mutableLongStateOf(0L) }
    var end by remember(item.uri) { mutableLongStateOf(item.durationMs) }

    Column(Modifier.fillMaxSize()) {
        Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
            AndroidView(
                factory = { ctx ->
                    VideoView(ctx).apply {
                        setVideoURI(item.uri)
                        setOnPreparedListener { mp ->
                            mp.isLooping = true
                            duration = mp.duration.toLong()
                            if (end <= 0L) end = duration
                            start()
                        }
                        view = this
                    }
                },
                onRelease = { it.stopPlayback() },
            )
            Box(
                Modifier.fillMaxSize().pointerInput(item.uri) {
                    detectTapGestures {
                        val v = view ?: return@detectTapGestures
                        if (v.isPlaying) { v.pause(); playing = false } else { v.start(); playing = true }
                    }
                },
            )
            if (!playing) {
                Box(Modifier.size(64.dp).background(Color(0x66000000), CircleShape), contentAlignment = Alignment.Center) {
                    Icon(Ico.Play, null, tint = Color.White, modifier = Modifier.size(30.dp))
                }
            }
        }
        LaunchedEffect(item.uri, trimming) {
            while (true) {
                val v = view
                if (v != null) {
                    position = v.currentPosition.toLong()
                    // While trimming, play only the part that will be kept.
                    if (trimming && end > start && (position > end || position < start - 300)) v.seekTo(start.toInt())
                }
                delay(100)
            }
        }
        DisposableEffect(item.uri) { onDispose { view?.stopPlayback() } }

        if (trimming && duration > 0) {
            TrimBar(item, duration, start, end, position, onChange = { s, e ->
                if (s != start) view?.seekTo(s.toInt())
                start = s; end = e
            })
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Cancel", color = Color.White, fontSize = 14.sp,
                    modifier = Modifier.clip(Corners.small).clickable { start = 0; end = duration; onTrimDone() }
                        .padding(horizontal = 14.dp, vertical = 9.dp))
                Spacer(Modifier.weight(1f))
                Text("${clipLabel(end - start)} kept", color = Color.White.copy(alpha = 0.6f), fontSize = 12.sp, fontFamily = UiType.mono)
                Spacer(Modifier.weight(1f))
                Text("Save clip", color = Color.Black, fontSize = 14.sp, fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.clip(Corners.small).background(Color.White)
                        .clickable { actions.trimItem(item, start, end); onTrimDone() }
                        .padding(horizontal = 16.dp, vertical = 9.dp))
            }
        } else if (duration > 0) {
            Scrubber(duration, position) { view?.seekTo(it.toInt()); position = it }
        }
    }
}

/** A thin seek bar with the time on either side. */
@Composable
private fun Scrubber(duration: Long, position: Long, onSeek: (Long) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(clipLabel(position), color = Color.White, fontSize = 11.sp, fontFamily = UiType.mono)
        BoxWithConstraints(Modifier.weight(1f).height(32.dp).padding(horizontal = 10.dp)) {
            val w = constraints.maxWidth.toFloat()
            val f = (position.toFloat() / duration).coerceIn(0f, 1f)
            Box(
                Modifier.fillMaxSize()
                    .pointerInput(duration) { detectTapGestures { onSeek((it.x / w * duration).toLong().coerceIn(0, duration)) } }
                    .pointerInput(duration) {
                        detectHorizontalDragGestures { change, _ -> onSeek((change.position.x / w * duration).toLong().coerceIn(0, duration)) }
                    },
            ) {
                Canvas(Modifier.fillMaxSize()) {
                    val y = size.height / 2
                    drawLine(Color.White.copy(alpha = 0.3f), Offset(0f, y), Offset(size.width, y), strokeWidth = 2.dp.toPx())
                    drawLine(Color.White, Offset(0f, y), Offset(size.width * f, y), strokeWidth = 2.dp.toPx())
                    drawCircle(Color.White, 6.dp.toPx(), Offset(size.width * f, y))
                }
            }
        }
        Text(clipLabel(duration), color = Color.White.copy(alpha = 0.6f), fontSize = 11.sp, fontFamily = UiType.mono)
    }
}

/** Frames of the clip with two handles: the part between them is kept. */
@Composable
private fun TrimBar(item: MediaItem, duration: Long, start: Long, end: Long, position: Long, onChange: (Long, Long) -> Unit) {
    val ctx = LocalContext.current
    val frames by produceState<List<ImageBitmap>>(emptyList(), item.uri) {
        value = withContext(Dispatchers.IO) {
            val r = MediaMetadataRetriever()
            try {
                r.setDataSource(ctx, item.uri)
                (0 until 8).mapNotNull { i ->
                    val t = duration * 1000L * (2 * i + 1) / 16
                    r.getScaledFrameAtTime(t, MediaMetadataRetriever.OPTION_CLOSEST_SYNC, 160, 160)?.asImageBitmap()
                }
            } catch (e: Exception) {
                emptyList()
            } finally {
                runCatching { r.release() }
            }
        }
    }
    val handleW = 14.dp
    val density = LocalDensity.current
    // The drag handlers outlive recompositions; read the latest values through these.
    val curStart by rememberUpdatedState(start)
    val curEnd by rememberUpdatedState(end)
    val change by rememberUpdatedState(onChange)
    BoxWithConstraints(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 8.dp).height(56.dp)) {
        val wPx = constraints.maxWidth.toFloat()
        val minGap = (500L).coerceAtMost(duration / 2)
        fun xOf(t: Long) = t.toFloat() / duration * wPx
        fun tOf(x: Float) = (x / wPx * duration).toLong().coerceIn(0L, duration)
        Row(Modifier.fillMaxSize().clip(Corners.small).background(Color(0xFF222222))) {
            frames.forEach { Image(it, null, Modifier.weight(1f).fillMaxSize(), contentScale = ContentScale.Crop) }
        }
        Canvas(Modifier.fillMaxSize()) {
            val a = xOf(start)
            val b = xOf(end)
            drawRect(Color(0xAA000000), Offset(0f, 0f), androidx.compose.ui.geometry.Size(a, size.height))
            drawRect(Color(0xAA000000), Offset(b, 0f), androidx.compose.ui.geometry.Size(size.width - b, size.height))
            drawRect(Color(0xFFFFD27A), Offset(a, 0f), androidx.compose.ui.geometry.Size(b - a, size.height),
                style = androidx.compose.ui.graphics.drawscope.Stroke(2.dp.toPx()))
            val px = xOf(position)
            drawLine(Color.White, Offset(px, 0f), Offset(px, size.height), strokeWidth = 1.5.dp.toPx())
        }
        // Handles
        val hw = with(density) { handleW.toPx() }
        for (isStart in listOf(true, false)) {
            val x = if (isStart) xOf(start) - hw else xOf(end)
            Box(
                Modifier
                    .offset { IntOffset(x.roundToInt(), 0) }
                    .size(handleW, 56.dp)
                    .clip(Corners.small)
                    .background(Color(0xFFFFD27A))
                    .border(1.dp, Color(0x33000000), Corners.small)
                    .pointerInput(isStart, duration) {
                        detectHorizontalDragGestures { ev, drag ->
                            ev.consume()
                            if (isStart) {
                                val ns = tOf(xOf(curStart) + drag).coerceAtMost(curEnd - minGap)
                                change(ns, curEnd)
                            } else {
                                val ne = tOf(xOf(curEnd) + drag).coerceAtLeast(curStart + minGap)
                                change(curStart, ne)
                            }
                        }
                    },
                contentAlignment = Alignment.Center,
            ) { Box(Modifier.size(2.dp, 18.dp).background(Color(0x99000000))) }
        }
    }
}

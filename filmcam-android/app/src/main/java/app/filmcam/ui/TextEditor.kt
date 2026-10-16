package app.filmcam.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateRotation
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.style.TextAlign as ComposeAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.filmcam.film.FontLibrary
import app.filmcam.film.TextAlign
import app.filmcam.film.TextLayer
import app.filmcam.film.TextRenderer
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

private val Swatches = listOf(
    0xFFFFFFFF, 0xFFF2E6D0, 0xFF111111, 0xFFFF8A3D, 0xFFE5402B, 0xFFFFD45A, 0xFF4FB3A9, 0xFF5B8DEF, 0xFFF2A7C3,
).map { it.toInt() }

/**
 * Maps between the viewfinder (pixels, y down) and a layer's frame coordinates (0..1, y down,
 * upright for however the phone is held: the same space the renderer draws text in).
 */
private class FrameMap(val w: Float, val h: Float, val k: Int) {
    val fw = if (k % 2 == 1) h else w
    val fh = if (k % 2 == 1) w else h

    private fun rot(k: Int, x: Float, y: Float): Pair<Float, Float> = when (k and 3) {
        1 -> y to 1 - x
        2 -> 1 - x to 1 - y
        3 -> 1 - y to x
        else -> x to y
    }

    fun toLayer(v: Offset): Offset { val (fx, fy) = rot(k, v.x / w, 1 - v.y / h); return Offset(fx, 1 - fy) }
    fun toView(l: Offset): Offset { val (sx, sy) = rot(4 - k, l.x, 1 - l.y); return Offset(sx * w, (1 - sy) * h) }

    /** The four corners of a layer's text block, in view pixels. */
    fun corners(layer: TextLayer, fonts: FontLibrary, pad: Float): List<Offset> {
        val (bw, bh) = TextRenderer.blockSize(layer, fonts, fw, fh)
        val a = Math.toRadians(layer.rotation.toDouble())
        val c = cos(a).toFloat()
        val s = sin(a).toFloat()
        val cx = layer.x * fw
        val cy = layer.y * fh
        return listOf(-1f to -1f, 1f to -1f, 1f to 1f, -1f to 1f).map { (sx, sy) ->
            val dx = sx * (bw / 2 + pad)
            val dy = sy * (bh / 2 + pad)
            toView(Offset((cx + dx * c - dy * s) / fw, (cy + dx * s + dy * c) / fh))
        }
    }

    fun hit(layer: TextLayer, fonts: FontLibrary, v: Offset, pad: Float): Boolean {
        val (bw, bh) = TextRenderer.blockSize(layer, fonts, fw, fh)
        val l = toLayer(v)
        val dx = l.x * fw - layer.x * fw
        val dy = l.y * fh - layer.y * fh
        val a = Math.toRadians(-layer.rotation.toDouble())
        val lx = dx * cos(a) - dy * sin(a)
        val ly = dx * sin(a) + dy * cos(a)
        return abs(lx) <= bw / 2 + pad && abs(ly) <= bh / 2 + pad
    }
}

private fun replace(ui: UiState, actions: CameraActions, layer: TextLayer) =
    actions.setTextLayers(ui.textLayers.map { if (it.id == layer.id) layer else it })

private fun deleteLayer(ui: UiState, actions: CameraActions, id: Long) {
    actions.setTextLayers(ui.textLayers.filter { it.id != id })
    if (ui.selectedText == id) ui.selectedText = null
}

/** Where the delete badge of the selected layer sits: its top-right corner, in view pixels. */
private fun deleteBadge(map: FrameMap, layer: TextLayer, fonts: FontLibrary, pad: Float): Offset? {
    if (layer.text.isBlank()) return null
    // The corner that is top-right on screen, whatever the rotation.
    return map.corners(layer, fonts, pad).maxByOrNull { it.x - it.y }
}

/** Touch handling and selection box on the viewfinder while the Text tray is open. */
@Composable
fun TextEditorLayer(ui: UiState, actions: CameraActions) {
    val fonts = ui.fonts ?: return
    val turns = ui.frameTurns
    val latestUi by rememberUpdatedState(ui)
    Box(
        Modifier
            .fillMaxSize()
            .pointerInput(turns) {
                detectTapGestures(
                    onTap = { pos ->
                        val map = FrameMap(size.width.toFloat(), size.height.toFloat(), turns)
                        val sel = latestUi.selectedLayer
                        val badge = sel?.let { deleteBadge(map, it, fonts, 8.dp.toPx()) }
                        if (sel != null && badge != null && (badge - pos).getDistance() < 20.dp.toPx()) {
                            deleteLayer(latestUi, actions, sel.id)
                            return@detectTapGestures
                        }
                        val hit = latestUi.textLayers.lastOrNull { map.hit(it, fonts, pos, 12.dp.toPx()) }
                        // Depth tool: a tap on the picture picks what the text goes behind.
                        if (hit == null && latestUi.textTool == TextTool.DEPTH && sel?.behind == true) {
                            val l = map.toLayer(pos)
                            actions.pickSubject(l.x, l.y)
                            latestUi.subjectTap = l.x to l.y
                            return@detectTapGestures
                        }
                        // A tap on empty picture: first it deselects, then it closes the tray.
                        if (hit == null && latestUi.selectedText == null) latestUi.dock = Dock.NONE
                        latestUi.selectedText = hit?.id
                    },
                    onDoubleTap = { pos ->
                        val map = FrameMap(size.width.toFloat(), size.height.toFloat(), turns)
                        val hit = latestUi.textLayers.lastOrNull { map.hit(it, fonts, pos, 12.dp.toPx()) }
                        if (hit != null) { latestUi.selectedText = hit.id; latestUi.editingText = true }
                    },
                )
            }
            .pointerInput(turns) {
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false)
                    val map = FrameMap(size.width.toFloat(), size.height.toFloat(), turns)
                    val pad = 12.dp.toPx()
                    val hit = latestUi.textLayers.lastOrNull { map.hit(it, fonts, down.position, pad) }
                    if (hit != null) latestUi.selectedText = hit.id
                    val start = latestUi.selectedLayer ?: return@awaitEachGesture
                    // Raw values follow the fingers; shown values snap to centre lines and right angles.
                    var rawX = start.x
                    var rawY = start.y
                    var rawRot = start.rotation
                    var size = start.size
                    var moved = false
                    do {
                        val event = awaitPointerEvent()
                        val pan = event.calculatePan()
                        val zoom = event.calculateZoom()
                        val rotation = event.calculateRotation()
                        if (!moved && (pan.getDistance() > viewConfiguration.touchSlop || abs(zoom - 1f) > 0.01f || abs(rotation) > 1f)) {
                            moved = true
                            latestUi.adjusting = true
                        }
                        if (moved) {
                            val centreView = map.toView(Offset(rawX, rawY))
                            val next = map.toLayer(centreView + pan)
                            rawX = next.x.coerceIn(0f, 1f)
                            rawY = next.y.coerceIn(0f, 1f)
                            rawRot += rotation
                            size = (size * zoom).coerceIn(0.015f, 0.4f)
                            val snapX = abs(rawX - 0.5f) < 0.018f
                            val snapY = abs(rawY - 0.5f) < 0.018f
                            val nearest = (rawRot / 90f).roundToInt() * 90f
                            val rot = if (abs(rawRot - nearest) < 4f) nearest else rawRot
                            latestUi.guideX = snapX
                            latestUi.guideY = snapY
                            val cur = latestUi.selectedLayer ?: start
                            replace(latestUi, actions, cur.copy(
                                x = if (snapX) 0.5f else rawX, y = if (snapY) 0.5f else rawY,
                                rotation = ((rot + 540f) % 360f) - 180f, size = size,
                            ))
                            event.changes.forEach { if (it.positionChanged()) it.consume() }
                        }
                    } while (event.changes.any { it.pressed })
                    if (moved) {
                        latestUi.adjusting = false
                        latestUi.guideX = false
                        latestUi.guideY = false
                    }
                }
            },
    ) {
        LaunchedEffect(ui.subjectTap) {
            if (ui.subjectTap != null) { kotlinx.coroutines.delay(700); ui.subjectTap = null }
        }
        Canvas(Modifier.fillMaxSize()) {
            val map = FrameMap(size.width, size.height, turns)
            ui.subjectTap?.let { (x, y) ->
                val c = map.toView(Offset(x, y))
                drawCircle(Color.White, 26.dp.toPx(), c, style = Stroke(2.dp.toPx()))
                drawCircle(Color(0xFFFFD27A), 4.dp.toPx(), c)
            }
            if (ui.guideX) {
                drawLine(Color(0xFFFFD27A), map.toView(Offset(0.5f, 0f)), map.toView(Offset(0.5f, 1f)), strokeWidth = 1.dp.toPx())
            }
            if (ui.guideY) {
                drawLine(Color(0xFFFFD27A), map.toView(Offset(0f, 0.5f)), map.toView(Offset(1f, 0.5f)), strokeWidth = 1.dp.toPx())
            }
            val sel = ui.selectedLayer ?: return@Canvas
            if (sel.text.isBlank()) return@Canvas
            val c = map.corners(sel, fonts, 8.dp.toPx())
            val path = Path().apply { moveTo(c[0].x, c[0].y); c.drop(1).forEach { lineTo(it.x, it.y) }; close() }
            drawPath(path, Color.Black.copy(alpha = 0.35f), style = Stroke(2.5.dp.toPx()))
            drawPath(path, Color.White, style = Stroke(1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 7f))))
            c.forEach { drawCircle(Color.White, 3.dp.toPx(), it) }
            // Delete badge: a small x on the top-right corner.
            deleteBadge(map, sel, fonts, 8.dp.toPx())?.let { b ->
                val r = 10.dp.toPx()
                val a = 3.5.dp.toPx()
                drawCircle(Color(0xFFE5402B), r, b)
                drawCircle(Color.White, r, b, style = Stroke(1.dp.toPx()))
                drawLine(Color.White, b + Offset(-a, -a), b + Offset(a, a), strokeWidth = 1.6.dp.toPx())
                drawLine(Color.White, b + Offset(-a, a), b + Offset(a, -a), strokeWidth = 1.6.dp.toPx())
            }
        }
        if (ui.textLayers.isEmpty()) {
            Text(
                "Add text with  +  below", color = Color.White, fontSize = 12.sp,
                modifier = Modifier.align(Alignment.Center).background(Color(0x66000000), RoundedCornerShape(14.dp))
                    .padding(horizontal = 12.dp, vertical = 6.dp),
            )
        }
    }
}

/** The Text tray: layers, then the tools for the selected one. */
@Composable
fun TextTray(ui: UiState, actions: CameraActions, chrome: Float) {
    val p = LocalPalette.current
    val fonts = ui.fonts ?: return
    @Suppress("UNUSED_VARIABLE") val fontsVersion = ui.fontsVersion
    val layer = ui.selectedLayer
    TrayCard(chrome) {
        Column {
            // Layers
            LazyRow(
                Modifier.alpha(chrome),
                contentPadding = PaddingValues(horizontal = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                items(ui.textLayers, key = { it.id }) { l ->
                    val sel = l.id == ui.selectedText
                    Text(
                        l.text.lines().first().ifBlank { "Text" }.take(14), maxLines = 1,
                        color = if (sel) p.bg else p.text, fontSize = 13.sp,
                        fontFamily = FontFamily(fonts.typeface(l.font)),
                        modifier = Modifier
                            .clip(RoundedCornerShape(12.dp))
                            .background(if (sel) p.text else p.surfaceHigh)
                            .clickable { ui.selectedText = if (sel) null else l.id }
                            .padding(horizontal = 12.dp, vertical = 7.dp),
                    )
                }
                item {
                    Box(
                        Modifier.size(34.dp).clip(CircleShape).border(1.dp, p.line, CircleShape).clickable {
                            // New text always starts in the middle of the frame, without a shadow.
                            val new = TextLayer(text = "", x = 0.5f, y = 0.5f)
                            actions.setTextLayers(ui.textLayers + new)
                            ui.selectedText = new.id
                            ui.editingText = true
                        },
                        contentAlignment = Alignment.Center,
                    ) { Icon(Ico.Plus, null, tint = p.text, modifier = Modifier.size(18.dp)) }
                }
            }
            if (layer == null) {
                Text(
                    if (ui.textLayers.isEmpty()) "Text is burnt into photos and video as you shoot."
                    else "Tap a text to style it. Drag to move, pinch to resize, twist to rotate.",
                    color = p.muted, fontSize = 11.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp).alpha(chrome),
                )
                return@Column
            }
            Spacer(Modifier.height(10.dp))
            // Tools for the selected layer
            LazyRow(
                Modifier.alpha(chrome),
                contentPadding = PaddingValues(horizontal = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                item { ToolButton(Ico.Text, "Edit", false) { ui.editingText = true } }
                item { ToolButton(Ico.Trash, "Delete", false, danger = true) { deleteLayer(ui, actions, layer.id) } }
                item { ToolButton(Ico.Fonts, "Font", ui.textTool == TextTool.FONT) { ui.textTool = TextTool.FONT } }
                item { ToolButton(Ico.TextSize, "Size", ui.textTool == TextTool.SIZE) { ui.textTool = TextTool.SIZE } }
                item { ToolButton(Ico.Rotate, "Rotate", ui.textTool == TextTool.ROTATE) { ui.textTool = TextTool.ROTATE } }
                item { ToolButton(Ico.Fade, "Colour", ui.textTool == TextTool.COLOR) { ui.textTool = TextTool.COLOR } }
                item { ToolButton(Ico.Focus, "Place", ui.textTool == TextTool.PLACE) { ui.textTool = TextTool.PLACE } }
                item { ToolButton(Ico.Depth, "Depth", ui.textTool == TextTool.DEPTH || layer.behind) { ui.textTool = TextTool.DEPTH } }
                item { ToolButton(Ico.Opacity, "Opacity", ui.textTool == TextTool.OPACITY) { ui.textTool = TextTool.OPACITY } }
                item { ToolButton(Ico.Spacing, "Spacing", ui.textTool == TextTool.SPACING) { ui.textTool = TextTool.SPACING } }
                item {
                    val icon = when (layer.align) { TextAlign.LEFT -> Ico.AlignLeft; TextAlign.CENTER -> Ico.AlignCenter; TextAlign.RIGHT -> Ico.AlignRight }
                    ToolButton(icon, "Align", false) {
                        replace(ui, actions, layer.copy(align = TextAlign.entries[(layer.align.ordinal + 1) % 3]))
                    }
                }
                item { ToolButton(Ico.Shadow, "Shadow", layer.shadow) { replace(ui, actions, layer.copy(shadow = !layer.shadow)) } }
            }
            Spacer(Modifier.height(10.dp))
            when (ui.textTool) {
                TextTool.FONT -> FontRow(ui, actions, fonts, layer, chrome)
                TextTool.SIZE -> TextRuler(ui, "Size", layer.size, 0.015f, 0.3f, 0.07f, { "${(it * 100).roundToInt()}" }) {
                    replace(ui, actions, layer.copy(size = it))
                }
                TextTool.ROTATE -> TextRuler(ui, "Rotation", layer.rotation, -180f, 180f, 0f, { "${it.roundToInt()}°" }) {
                    val snapped = if (abs(it - (it / 90f).roundToInt() * 90f) < 2f) (it / 90f).roundToInt() * 90f else it
                    replace(ui, actions, layer.copy(rotation = snapped))
                }
                TextTool.OPACITY -> TextRuler(ui, "Opacity", layer.opacity, 0.1f, 1f, 1f, { "${(it * 100).roundToInt()}%" }) {
                    replace(ui, actions, layer.copy(opacity = it))
                }
                TextTool.SPACING -> TextRuler(ui, "Letter spacing", layer.tracking, -0.1f, 0.6f, 0f, { "%.2f".format(it) }) {
                    replace(ui, actions, layer.copy(tracking = it))
                }
                TextTool.COLOR -> LazyRow(contentPadding = PaddingValues(horizontal = 14.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(Swatches) { c ->
                        val sel = c == layer.color
                        Box(
                            Modifier.size(32.dp).clip(CircleShape)
                                .border(if (sel) 2.dp else 1.dp, if (sel) p.text else p.line, CircleShape)
                                .padding(if (sel) 4.dp else 0.dp).clip(CircleShape).background(Color(c))
                                .clickable { replace(ui, actions, layer.copy(color = c)) },
                        )
                    }
                }
                TextTool.PLACE -> PlaceGrid(ui, actions, layer)
                TextTool.DEPTH -> DepthPanel(ui, actions, layer)
            }
        }
    }
}

@Composable
private fun TextRuler(ui: UiState, label: String, value: Float, min: Float, max: Float, default: Float, format: (Float) -> String, onChange: (Float) -> Unit) {
    val p = LocalPalette.current
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
        Text(label, color = p.muted, fontSize = 10.sp, letterSpacing = 1.sp)
        Spacer(Modifier.height(4.dp))
        Ruler(value, min, max, default, format, onChange, onActive = { ui.adjusting = it })
    }
}

@Composable
private fun FontRow(ui: UiState, actions: CameraActions, fonts: FontLibrary, layer: TextLayer, chrome: Float) {
    val p = LocalPalette.current
    LazyRow(Modifier.alpha(chrome), contentPadding = PaddingValues(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        items(fonts.fonts, key = { it.key }) { f ->
            val sel = f.key == layer.font
            FontTile(f.label, sel, onClick = { replace(ui, actions, layer.copy(font = f.key)) }) {
                // Every face gets the same box, whatever its own line height.
                Text(
                    "Aa", color = if (sel) p.bg else p.text, fontSize = 21.sp, fontFamily = FontFamily(f.typeface), maxLines = 1,
                    style = TextStyle(lineHeight = 24.sp, platformStyle = PlatformTextStyle(includeFontPadding = false)),
                )
            }
        }
        item {
            FontTile("Import", selected = false, outlined = true, onClick = { actions.importFont() }) {
                Icon(Ico.Import, null, tint = p.text, modifier = Modifier.size(20.dp))
            }
        }
    }
}

/** One font in the picker: a fixed-size tile so the row lines up. */
@Composable
private fun FontTile(label: String, selected: Boolean, outlined: Boolean = false, onClick: () -> Unit, sample: @Composable () -> Unit) {
    val p = LocalPalette.current
    val shape = RoundedCornerShape(14.dp)
    Column(
        Modifier
            .size(width = 74.dp, height = 62.dp)
            .clip(shape)
            .background(if (selected) p.text else if (outlined) Color.Transparent else p.surfaceHigh)
            .border(1.dp, if (outlined) p.line else Color.Transparent, shape)
            .clickable(onClick = onClick)
            .padding(horizontal = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(Modifier.height(30.dp).fillMaxWidth().clipToBounds(), contentAlignment = Alignment.Center) { sample() }
        Spacer(Modifier.height(3.dp))
        Text(
            label, color = if (selected) p.bg.copy(alpha = 0.75f) else p.muted, fontSize = 9.sp, maxLines = 1,
            overflow = TextOverflow.Ellipsis, style = TextStyle(platformStyle = PlatformTextStyle(includeFontPadding = false)),
        )
    }
}

/**
 * In front of everything, or behind the subject: the subject (every person, or what was
 * tapped) is cut out of each frame and passes in front of the text, even while it moves.
 */
@Composable
private fun DepthPanel(ui: UiState, actions: CameraActions, layer: TextLayer) {
    val p = LocalPalette.current
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Pill("In front", filled = !layer.behind) { replace(ui, actions, layer.copy(behind = false)) }
            Pill("Behind subject", filled = layer.behind) { replace(ui, actions, layer.copy(behind = true)) }
        }
        Spacer(Modifier.height(8.dp))
        if (layer.behind) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "Behind: ${ui.subjectLabel}  ·  tap the subject in the picture to pick it",
                    color = p.muted, fontSize = 11.sp, modifier = Modifier.padding(horizontal = 16.dp).weight(1f, fill = false),
                )
                if (ui.subjectLabel != "People") Text(
                    "All people", color = p.accent, fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.clip(RoundedCornerShape(12.dp)).clickable { actions.resetSubject() }
                        .padding(horizontal = 10.dp, vertical = 6.dp),
                )
            }
        } else {
            Text("Text sits on top of the picture.", color = p.muted, fontSize = 11.sp)
        }
    }
}

/** Nine anchor points: the text jumps there and aligns to that side. */
@Composable
private fun PlaceGrid(ui: UiState, actions: CameraActions, layer: TextLayer) {
    val p = LocalPalette.current
    val xs = listOf(0.2f, 0.5f, 0.8f)
    val ys = listOf(0.12f, 0.5f, 0.88f)
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
        Column(
            Modifier.clip(RoundedCornerShape(14.dp)).background(p.surfaceHigh).padding(6.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            for (y in ys) Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                xs.forEachIndexed { i, x ->
                    val sel = abs(layer.x - x) < 0.01f && abs(layer.y - y) < 0.01f
                    Box(
                        Modifier.size(width = 30.dp, height = 22.dp).clip(RoundedCornerShape(6.dp))
                            .clickable { replace(ui, actions, layer.copy(x = x, y = y, align = TextAlign.entries[i])) },
                        contentAlignment = Alignment.Center,
                    ) { Box(Modifier.size(if (sel) 8.dp else 5.dp).clip(CircleShape).background(if (sel) p.accent else p.faint)) }
                }
            }
        }
        Spacer(Modifier.width(18.dp))
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Pill("Centre") { replace(ui, actions, layer.copy(x = 0.5f, y = 0.5f, align = TextAlign.CENTER)) }
            Pill("Level") { replace(ui, actions, layer.copy(rotation = 0f)) }
        }
    }
}

/** Full-screen typing, in the chosen font, over a dimmed viewfinder. */
@Composable
fun TextEditOverlay(ui: UiState, actions: CameraActions) {
    val fonts = ui.fonts ?: return
    val layer = ui.selectedLayer ?: run { ui.editingText = false; return }
    var value by remember(layer.id) { mutableStateOf(TextFieldValue(layer.text, TextRange(layer.text.length))) }
    val focus = remember { FocusRequester() }
    LaunchedEffect(layer.id) { focus.requestFocus() }
    fun finish() {
        val text = value.text.trimEnd()
        if (text.isBlank()) {
            actions.setTextLayers(ui.textLayers.filter { it.id != layer.id })
            ui.selectedText = null
        } else {
            replace(ui, actions, layer.copy(text = text))
        }
        ui.editingText = false
    }
    Box(
        Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.72f))
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { finish() },
    ) {
        Row(
            Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Text", color = Color.White.copy(alpha = 0.6f), fontSize = 13.sp, modifier = Modifier.weight(1f))
            Text(
                "Done", color = Color.Black, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clip(RoundedCornerShape(16.dp)).background(Color.White).clickable { finish() }
                    .padding(horizontal = 16.dp, vertical = 8.dp),
            )
        }
        BasicTextField(
            value = value,
            onValueChange = { value = it },
            textStyle = TextStyle(
                color = Color(layer.color), fontSize = 34.sp, fontFamily = FontFamily(fonts.typeface(layer.font)),
                textAlign = when (layer.align) { TextAlign.LEFT -> ComposeAlign.Start; TextAlign.CENTER -> ComposeAlign.Center; TextAlign.RIGHT -> ComposeAlign.End },
            ),
            cursorBrush = SolidColor(Color.White),
            modifier = Modifier
                .align(Alignment.Center)
                .imePadding()
                .fillMaxWidth()
                .padding(horizontal = 28.dp)
                .focusRequester(focus),
        )
    }
}

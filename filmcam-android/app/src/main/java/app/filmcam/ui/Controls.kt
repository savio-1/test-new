package app.filmcam.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.IndicationNodeFactory
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.ContentDrawScope
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.node.DelegatableNode
import androidx.compose.ui.node.DrawModifierNode
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

/**
 * The press feedback for everything tappable: the control sinks a little (to 96%) and dims
 * a touch while held, and springs back on release. Drawn as an indication, so it costs no
 * recomposition and no layout, only a redraw of the pressed control.
 */
object GentlePress : IndicationNodeFactory {
    override fun create(interactionSource: InteractionSource): DelegatableNode = Node(interactionSource)
    override fun equals(other: Any?) = other === this
    override fun hashCode() = 7

    private class Node(private val source: InteractionSource) : androidx.compose.ui.Modifier.Node(), DrawModifierNode {
        private val press = Animatable(0f)

        override fun onAttach() {
            coroutineScope.launch {
                source.interactions.collect { i ->
                    val target = if (i is PressInteraction.Press) 1f else 0f
                    launch {
                        if (target == 1f) press.animateTo(1f, tween(90))
                        else press.animateTo(0f, spring(dampingRatio = 0.55f, stiffness = Spring.StiffnessMediumLow))
                    }
                }
            }
        }

        // Reading the animation's value here makes the draw follow it, frame by frame.
        override fun ContentDrawScope.draw() {
            val f = press.value
            if (f <= 0.001f) { drawContent(); return }
            scale(1f - 0.04f * f) { this@draw.drawContent() }
            drawRect(Color.Black.copy(alpha = 0.08f * f))
        }
    }
}

/**
 * A slim slider: a hairline track, the filled part in the text colour and a small round
 * thumb. Tap to jump, drag to change; [onActive] says when a drag starts and ends.
 */
@Composable
fun LineSlider(
    value: Float,
    modifier: Modifier = Modifier,
    min: Float = 0f,
    max: Float = 1f,
    onActive: (Boolean) -> Unit = {},
    onChange: (Float) -> Unit,
) {
    val p = LocalPalette.current
    val change by rememberUpdatedState(onChange)
    val active by rememberUpdatedState(onActive)
    BoxWithConstraints(modifier.height(28.dp)) {
        val w = constraints.maxWidth.toFloat().coerceAtLeast(1f)
        fun at(x: Float) = min + (x / w).coerceIn(0f, 1f) * (max - min)
        Canvas(
            Modifier
                .fillMaxSize()
                .pointerInput(min, max) { detectTapGestures { change(at(it.x)) } }
                .pointerInput(min, max) {
                    detectHorizontalDragGestures(
                        onDragStart = { active(true); change(at(it.x)) },
                        onDragEnd = { active(false) },
                        onDragCancel = { active(false) },
                    ) { ev, _ -> ev.consume(); change(at(ev.position.x)) }
                },
        ) {
            val y = size.height / 2
            val f = ((value - min) / (max - min)).coerceIn(0f, 1f)
            val x = size.width * f
            drawLine(p.line, Offset(0f, y), Offset(size.width, y), strokeWidth = 2.dp.toPx())
            drawLine(p.text, Offset(0f, y), Offset(x, y), strokeWidth = 2.dp.toPx())
            drawCircle(p.text, 6.dp.toPx(), Offset(x.coerceIn(6.dp.toPx(), size.width - 6.dp.toPx()), y))
        }
    }
}

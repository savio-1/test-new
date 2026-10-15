package app.filmcam.film

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin
import kotlin.random.Random

/**
 * Per-frame randomness that is cheaper and easier to control on the CPU than in the shader:
 * gate weave, projector flicker, the light-leak blobs, the edge burn and scratches.
 */
class FrameFx {
    var seed = 0
    var time = 0f
    var gain = 1f
    var weaveX = 0f
    var weaveY = 0f
    /** Frame-space centres (x,y) of three leak blobs. */
    val leakPos = FloatArray(6)
    val leakRadius = FloatArray(3)
    /** RGB of each blob, intensity already applied. */
    val leakColor = FloatArray(9)
    /** 0 left, 1 right, 2 bottom, 3 top. */
    var burnEdge = 0
    var burnStrength = 0f
    var burnPhase = 0f
    /** Frame-space x of two vertical scratches, negative when absent. */
    val scratchX = floatArrayOf(-1f, -1f)
    var scratchAlpha = 0f
}

class FxAnimator(seed: Long = System.nanoTime()) {
    private val rnd = Random(seed)

    private class Blob(
        val edge: Int, val along: Float, val radius: Float, val color: FloatArray,
        val speed: Float, val phase: Float, val pulse: Float,
    )

    private val palette = arrayOf(
        floatArrayOf(1.0f, 0.36f, 0.08f),
        floatArrayOf(1.0f, 0.56f, 0.16f),
        floatArrayOf(0.95f, 0.14f, 0.08f),
        floatArrayOf(1.0f, 0.78f, 0.38f),
        floatArrayOf(0.92f, 0.22f, 0.42f),
    )

    private var blobs = planLeaks()
    private var burnEdge = rnd.nextInt(4)
    private var burnPhase = rnd.nextFloat() * 10f
    private val weavePhase = FloatArray(4) { rnd.nextFloat() * 6.28f }
    private val scratchLife = IntArray(2)
    private val scratchPos = floatArrayOf(-1f, -1f)

    /** New leak layout: called per photo so every shot gets its own leak. */
    fun reshuffle() {
        blobs = planLeaks()
        burnEdge = rnd.nextInt(4)
        burnPhase = rnd.nextFloat() * 10f
    }

    private fun planLeaks(): List<Blob> {
        // Leaks come in from one or two edges, the way light sneaks past a camera back door.
        val edgeA = rnd.nextInt(4)
        val edgeB = if (rnd.nextFloat() < 0.5f) edgeA else rnd.nextInt(4)
        return List(3) { i ->
            Blob(
                edge = if (i == 2) edgeB else edgeA,
                along = 0.2f + rnd.nextFloat() * 0.6f,
                radius = 0.28f + rnd.nextFloat() * 0.32f,
                color = palette[rnd.nextInt(palette.size)],
                speed = 0.08f + rnd.nextFloat() * 0.18f,
                phase = rnd.nextFloat() * 6.28f,
                pulse = 0.15f + rnd.nextFloat() * 0.3f,
            )
        }
    }

    /** Fills [out] for one new film frame at [time] seconds. */
    fun next(look: FilmLook, time: Float, out: FrameFx) {
        out.seed = rnd.nextInt(1, Int.MAX_VALUE)
        out.time = time

        // Projector flicker: a little fast noise riding on a slow pump.
        val f = look.flicker
        out.gain = 1f + f * (0.09f * (rnd.nextFloat() - 0.5f) * 2f + 0.035f * sin(time * 9.1f + weavePhase[0]))

        // Gate weave: the film sits a little differently in the gate every frame.
        val w = look.gateWeave
        val slowX = 0.6f * sin(time * 1.3f + weavePhase[1]) + 0.4f * sin(time * 3.7f + weavePhase[2])
        val slowY = 0.7f * sin(time * 0.9f + weavePhase[3]) + 0.3f * sin(time * 5.3f)
        out.weaveX = w * MAX_WEAVE * (0.55f * slowX + 0.45f * (rnd.nextFloat() - 0.5f) * 2f) * 0.6f
        out.weaveY = w * MAX_WEAVE * (0.55f * slowY + 0.45f * (rnd.nextFloat() - 0.5f) * 2f)

        // Light leaks: blobs drift along their edge and swell in and out over several seconds.
        val envelope = 0.55f + 0.45f * sin(time * 0.35f + blobs[0].phase)
        for (i in 0 until 3) {
            val b = blobs[i]
            val along = (b.along + 0.22f * sin(time * b.speed * 2f * PI.toFloat() * 0.3f + b.phase)).coerceIn(-0.1f, 1.1f)
            val inset = -0.08f + 0.1f * sin(time * b.speed + b.phase * 1.7f)
            val (x, y) = when (b.edge) {
                0 -> inset to along
                1 -> 1f - inset to along
                2 -> along to inset
                else -> along to 1f - inset
            }
            out.leakPos[i * 2] = x
            out.leakPos[i * 2 + 1] = y
            out.leakRadius[i] = b.radius * (1f + 0.15f * sin(time * 0.7f + b.phase))
            val k = envelope * (1f - b.pulse + b.pulse * sin(time * 1.9f * b.speed * 6f + b.phase))
            for (c in 0 until 3) out.leakColor[i * 3 + c] = b.color[c] * k
        }
        out.burnEdge = burnEdge
        out.burnPhase = burnPhase + time * 0.6f
        out.burnStrength = 0.5f + 0.5f * abs(sin(time * 0.27f + burnPhase))

        // Scratches live for a handful of frames and wander slightly.
        val d = look.dust
        for (i in 0 until 2) {
            if (scratchLife[i] > 0) {
                scratchLife[i]--
                scratchPos[i] = (scratchPos[i] + (rnd.nextFloat() - 0.5f) * 0.004f).coerceIn(0.02f, 0.98f)
            } else if (rnd.nextFloat() < d * 0.06f) {
                scratchLife[i] = 4 + rnd.nextInt(36)
                scratchPos[i] = 0.05f + rnd.nextFloat() * 0.9f
            } else {
                scratchPos[i] = -1f
            }
            out.scratchX[i] = scratchPos[i]
        }
        out.scratchAlpha = d
    }

    companion object {
        /** Largest gate-weave offset, in frame units. The develop pass over-scans by this much. */
        const val MAX_WEAVE = 0.006f
    }
}

package app.filmcam.gl

import android.graphics.Bitmap
import android.graphics.SurfaceTexture
import android.opengl.EGLSurface
import android.opengl.GLES30
import android.opengl.Matrix
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.util.Size
import android.view.Surface
import android.view.SurfaceHolder
import androidx.camera.core.Preview
import androidx.camera.core.SurfaceRequest
import androidx.core.graphics.createBitmap
import app.filmcam.film.FilmFrameRate
import app.filmcam.film.FilmLook
import app.filmcam.film.FrameFx
import app.filmcam.film.FxAnimator
import app.filmcam.record.VideoRecorder
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executor
import java.util.concurrent.TimeUnit
import kotlin.math.abs
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * The render thread. Receives camera frames, runs them through the film pipeline and draws
 * the result to the screen and, while recording, to the video encoder. Also develops stills.
 *
 * Everything GL happens on [handler]'s thread; public methods just post work to it.
 */
class FilmEngine {
    private val thread = HandlerThread("FilmEngine").apply { start() }
    private val handler = Handler(thread.looper)
    private val executor = Executor { handler.post(it) }

    private lateinit var egl: EglCore
    private lateinit var pbuffer: EGLSurface
    private lateinit var renderer: FilmRenderer
    private var maxTextureSize = 4096

    /** Latest look from the UI; read once per frame. */
    @Volatile var look = FilmLook()
    /** How the phone is held, in clockwise quarter turns from portrait. */
    @Volatile var deviceQuarterTurns = 0
    /** Output aspect, width / height of the portrait picture (3:4 photos, 9:16 video). */
    @Volatile var outputAspect = 3f / 4f
    /** Rotation of the display from the device's natural orientation (0 on phones). */
    @Volatile var displayRotationDegrees = 0
    /** Frame-rate holds (18 fps etc.) only make sense for video; photo live view stays smooth. */
    @Volatile var videoMode = false
    /** Working-frame size once the camera is running, portrait (w, h). */
    @Volatile var outputSize: Size? = null
        private set

    private var display: EGLSurface? = null
    private var displaySurface: Surface? = null
    private var displayW = 0
    private var displayH = 0

    private var input: CameraInput? = null
    private var pipeline: Pipeline? = null
    private val stMatrix = FloatArray(16)
    private val texMatrix = FloatArray(16)
    private val tmpA = FloatArray(16)
    private val tmpB = FloatArray(16)

    private val fx = FrameFx()
    private val animator = FxAnimator()
    private val startNs = System.nanoTime()
    private var lastFilmFrameNs = 0L
    private var lastDevelopNs = 0L

    private class Recording(val surface: EGLSurface, val recorder: VideoRecorder, val frameTurns: Int)
    private var recording: Recording? = null

    init {
        handler.post {
            egl = EglCore()
            pbuffer = egl.createPbufferSurface(1, 1)
            egl.makeCurrent(pbuffer)
            renderer = FilmRenderer()
            maxTextureSize = GlUtil.maxTextureSize()
        }
    }

    // ------------------------------------------------------------------ camera input

    private class CameraInput(val tex: Int, val st: SurfaceTexture, val surface: Surface, val bufW: Int, val bufH: Int) {
        @Volatile var info: SurfaceRequest.TransformationInfo? = null
        var released = false
        fun release() {
            if (released) return
            released = true
            st.setOnFrameAvailableListener(null)
            surface.release()
            st.release()
            GlUtil.deleteTextures(tex)
        }
    }

    /** Hand this to CameraX's Preview use case. */
    val surfaceProvider = Preview.SurfaceProvider { request ->
        handler.post {
            val res = request.resolution
            val tex = GlUtil.createOesTexture()
            val st = SurfaceTexture(tex).apply { setDefaultBufferSize(res.width, res.height) }
            val surface = Surface(st)
            val inp = CameraInput(tex, st, surface, res.width, res.height)
            request.setTransformationInfoListener(executor) { inp.info = it }
            st.setOnFrameAvailableListener({ onFrame(inp) }, handler)
            input = inp
            request.provideSurface(surface, executor) {
                inp.release()
                if (input === inp) input = null
            }
        }
    }

    // ------------------------------------------------------------------ display surface

    val surfaceCallback = object : SurfaceHolder.Callback {
        override fun surfaceCreated(holder: SurfaceHolder) = Unit

        override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
            val surface = holder.surface
            handler.post {
                if (displaySurface !== surface) {
                    releaseDisplay()
                    display = egl.createWindowSurface(surface)
                    displaySurface = surface
                }
                displayW = width
                displayH = height
            }
        }

        override fun surfaceDestroyed(holder: SurfaceHolder) {
            val latch = CountDownLatch(1)
            handler.post { releaseDisplay(); latch.countDown() }
            latch.await(2, TimeUnit.SECONDS)
        }
    }

    private fun releaseDisplay() {
        display?.let {
            egl.makeCurrent(pbuffer)
            egl.releaseSurface(it)
        }
        display = null
        displaySurface = null
    }

    // ------------------------------------------------------------------ per frame

    private fun onFrame(inp: CameraInput) {
        if (inp !== input || inp.released) return
        try {
            inp.st.updateTexImage()
        } catch (e: Exception) {
            return
        }
        inp.st.getTransformMatrix(stMatrix)
        val now = System.nanoTime()
        val disp = display
        val rec = recording
        if (disp == null && rec == null) return

        egl.makeCurrent(disp ?: pbuffer)
        val look = look
        val p = ensurePipeline(inp) ?: return

        if (filmFrameDue(if (videoMode) look.frameRate else FilmFrameRate.NATIVE, now)) {
            animator.next(look, (now - startNs) / 1e9f, fx)
            val dt = if (lastDevelopNs == 0L) 1f / 30f else ((now - lastDevelopNs) / 1e9f).coerceIn(0.005f, 0.2f)
            lastDevelopNs = now
            buildTexMatrix(inp, look)
            renderer.developCamera(p, inp.tex, texMatrix, look.shutter.persistence(dt))
            renderer.glow(p, look)
        }

        val turns = rec?.frameTurns ?: deviceQuarterTurns
        if (disp != null && displayW > 0) {
            GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)
            renderer.drawFinal(p, look, fx, displayW, displayH, 0, turns)
            egl.swap(disp)
        }
        if (rec != null) {
            egl.makeCurrent(rec.surface)
            GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)
            renderer.drawFinal(p, look, fx, rec.recorder.width, rec.recorder.height, 1, turns)
            egl.setPresentationTime(rec.surface, now)
            egl.swap(rec.surface)
            egl.makeCurrent(disp ?: pbuffer)
        }
    }

    private fun filmFrameDue(rate: FilmFrameRate, now: Long): Boolean {
        if (rate.fps <= 0) { lastFilmFrameNs = now; return true }
        val interval = 1_000_000_000L / rate.fps
        val since = now - lastFilmFrameNs
        if (since < interval - 3_000_000L) return false
        lastFilmFrameNs = if (since > interval * 2) now else lastFilmFrameNs + interval
        return true
    }

    /**
     * Extra rotation (degrees) the SurfaceTexture transform does not already apply. With a
     * camera transform the buffer is already upright for the device's natural orientation;
     * otherwise CameraX tells us the rotation. Either way a rotated display (a landscape-first
     * tablet) needs undoing on top, as CameraX's own PreviewView does.
     */
    private fun extraRotation(info: SurfaceRequest.TransformationInfo?): Int {
        val base = if (info == null || info.hasCameraTransform()) 0 else info.rotationDegrees
        return (base - displayRotationDegrees + 720) % 360
    }

    /** Upright (as displayed) size of the camera buffer. */
    private fun uprightSize(inp: CameraInput): Pair<Int, Int> {
        val rotatedBySt = abs(stMatrix[0]) < abs(stMatrix[4])
        val extraOdd = (extraRotation(inp.info) / 90) % 2 == 1
        return if (rotatedBySt xor extraOdd) inp.bufH to inp.bufW else inp.bufW to inp.bufH
    }

    private fun ensurePipeline(inp: CameraInput): Pipeline? {
        val (uw, uh) = uprightSize(inp)
        val aspect = outputAspect
        var cw: Float
        var ch: Float
        if (uw.toFloat() / uh > aspect) { ch = uh.toFloat(); cw = ch * aspect } else { cw = uw.toFloat(); ch = cw / aspect }
        // Keep the working frame at most 1080 wide; that is plenty for screen and 1080p video.
        val scale = min(1f, 1080f / cw)
        val w = ((cw * scale).roundToInt() / 2) * 2
        val h = ((ch * scale).roundToInt() / 2) * 2
        if (w < 16 || h < 16) return null
        val p = pipeline
        if (p != null && p.width == w && p.height == h) return p
        p?.release()
        return try {
            Pipeline(w, h, forCamera = true, glowFormat = renderer.glowFormat).also {
                it.clear()
                pipeline = it
                outputSize = Size(w, h)
                lastDevelopNs = 0L
            }
        } catch (e: Exception) {
            Log.e(TAG, "pipeline", e)
            pipeline = null
            null
        }
    }

    /** Output uv -> camera texture: crop to aspect, weave, undo rotation, then the ST matrix. */
    private fun buildTexMatrix(inp: CameraInput, look: FilmLook) {
        val p = pipeline ?: return
        val (uw, uh) = uprightSize(inp)
        val cropFracW = p.width.toFloat() / p.height * uh / uw
        val sx: Float
        val sy: Float
        if (cropFracW <= 1f) { sx = cropFracW; sy = 1f } else { sx = 1f; sy = 1f / cropFracW }
        val overscan = 1f - 2.2f * FxAnimator.MAX_WEAVE * look.gateWeave
        val info = inp.info
        val mirror = info != null && !info.hasCameraTransform() && info.isMirroring

        // C = T(0.5 + weave) * S(sx, sy) * T(-0.5)
        val c = tmpA
        Matrix.setIdentityM(c, 0)
        Matrix.translateM(c, 0, 0.5f + fx.weaveX, 0.5f + fx.weaveY, 0f)
        Matrix.scaleM(c, 0, sx * overscan * (if (mirror) -1f else 1f), sy * overscan, 1f)
        Matrix.translateM(c, 0, -0.5f, -0.5f, 0f)

        // R = T(0.5) * Rz(extra) * T(-0.5)
        val r = tmpB
        Matrix.setIdentityM(r, 0)
        val extra = extraRotation(info)
        if (extra != 0) {
            Matrix.translateM(r, 0, 0.5f, 0.5f, 0f)
            Matrix.rotateM(r, 0, extra.toFloat(), 0f, 0f, 1f)
            Matrix.translateM(r, 0, -0.5f, -0.5f, 0f)
        }
        val rc = FloatArray(16)
        Matrix.multiplyMM(rc, 0, r, 0, c, 0)
        Matrix.multiplyMM(texMatrix, 0, stMatrix, 0, rc, 0)
    }

    // ------------------------------------------------------------------ recording

    fun startRecording(recorder: VideoRecorder) {
        handler.post {
            try {
                val surface = egl.createWindowSurface(recorder.inputSurface)
                recorder.start()
                recording = Recording(surface, recorder, deviceQuarterTurns)
            } catch (e: Exception) {
                Log.e(TAG, "startRecording", e)
                recorder.stop()
            }
        }
    }

    fun stopRecording() {
        handler.post {
            val rec = recording ?: return@post
            recording = null
            egl.makeCurrent(display ?: pbuffer)
            egl.releaseSurface(rec.surface)
            rec.recorder.stop()
        }
    }

    // ------------------------------------------------------------------ stills

    /** Freezes the live motion trail at the shutter press; returns nothing, runs async. */
    fun snapshotTrail() {
        handler.post {
            val p = pipeline ?: return@post
            if (look.shutter.persistence(1f / 30f) <= 0f) return@post
            renderer.snapshotTrail(p)
        }
    }

    /**
     * Runs an upright still through the same pipeline at full resolution.
     * [frameTurns] is how the phone was held at capture (to line up the motion trail).
     * The input bitmap is recycled; [done] gets the developed picture or null.
     */
    fun developStill(still: Bitmap, look: FilmLook, frameTurns: Int, done: (Bitmap?) -> Unit) {
        handler.post {
            var result: Bitmap? = null
            var src = 0
            var p: Pipeline? = null
            var outTex = 0
            var outFbo = 0
            try {
                egl.makeCurrent(pbuffer)
                renderer.refreshStamp()
                val w = still.width
                val h = still.height
                src = renderer.uploadBitmap(still)
                still.recycle()

                p = Pipeline(w, h, forCamera = false, glowFormat = renderer.glowFormat)
                // Bitmap row 0 is the top; GL's v = 0 is the bottom.
                val flip = FloatArray(16)
                Matrix.setIdentityM(flip, 0)
                Matrix.translateM(flip, 0, 0f, 1f, 0f)
                Matrix.scaleM(flip, 0, 1f, -1f, 1f)

                val preview = pipeline
                val trailOn = preview != null && preview.trailTex != 0 && look.shutter.persistence(1f / 30f) > 0f
                val trailMatrix = quarterTurnMatrix((4 - frameTurns) % 4)
                renderer.developStill(p, src, flip, if (trailOn) preview!!.trailTex else 0, trailMatrix, if (trailOn) 1f else 0f)
                GlUtil.deleteTextures(src); src = 0
                renderer.glow(p, look)

                val stillFx = FrameFx()
                FxAnimator().apply {
                    val t = (System.nanoTime() % 100_000L) / 10f
                    repeat(24) { next(look, t, stillFx) }   // let scratches settle into a state
                }

                outTex = GlUtil.createTexture(w, h, GLES30.GL_RGBA8)
                outFbo = GlUtil.createFramebuffer(outTex)
                GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, outFbo)
                renderer.drawFinal(p, look, stillFx, w, h, 0, 0)

                val buf = ByteBuffer.allocateDirect(w * h * 4).order(ByteOrder.nativeOrder())
                GLES30.glPixelStorei(GLES30.GL_PACK_ALIGNMENT, 1)
                GLES30.glReadPixels(0, 0, w, h, GLES30.GL_RGBA, GLES30.GL_UNSIGNED_BYTE, buf)
                GlUtil.checkError("readPixels")
                flipRows(buf, w * 4, h)
                buf.rewind()
                result = createBitmap(w, h).apply { copyPixelsFromBuffer(buf) }
            } catch (e: Throwable) {
                Log.e(TAG, "developStill", e)
                if (!still.isRecycled) still.recycle()
            } finally {
                GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)
                if (src != 0) GlUtil.deleteTextures(src)
                p?.release()
                if (outFbo != 0) GlUtil.deleteFramebuffers(outFbo)
                if (outTex != 0) GlUtil.deleteTextures(outTex)
                egl.makeCurrent(display ?: pbuffer)
            }
            done(result)
        }
    }

    /** Longest side a still may have, limited by the GPU. */
    fun maxStillSide(): Int = min(maxTextureSize, 4096)

    private fun flipRows(buf: ByteBuffer, stride: Int, rows: Int) {
        val a = ByteArray(stride)
        val b = ByteArray(stride)
        for (i in 0 until rows / 2) {
            val top = i * stride
            val bottom = (rows - 1 - i) * stride
            buf.position(top); buf.get(a)
            buf.position(bottom); buf.get(b)
            buf.position(top); buf.put(b)
            buf.position(bottom); buf.put(a)
        }
    }

    /** 4x4 matrix for rot(k): turn a unit-square point k quarter turns clockwise. */
    private fun quarterTurnMatrix(k: Int): FloatArray {
        val m = FloatArray(16)
        Matrix.setIdentityM(m, 0)
        // Column-major: x' = m0*x + m4*y + m12, y' = m1*x + m5*y + m13.
        when (k and 3) {
            1 -> { m[0] = 0f; m[4] = 1f; m[12] = 0f; m[1] = -1f; m[5] = 0f; m[13] = 1f }   // (y, 1-x)
            2 -> { m[0] = -1f; m[12] = 1f; m[5] = -1f; m[13] = 1f }                          // (1-x, 1-y)
            3 -> { m[0] = 0f; m[4] = -1f; m[12] = 1f; m[1] = 1f; m[5] = 0f; m[13] = 0f }   // (1-y, x)
        }
        return m
    }

    fun release() {
        handler.post {
            recording?.let { egl.releaseSurface(it.surface); it.recorder.stop() }
            recording = null
            input?.release()
            input = null
            pipeline?.release()
            pipeline = null
            releaseDisplay()
            renderer.release()
            egl.releaseSurface(pbuffer)
            egl.release()
            thread.quitSafely()
        }
    }

    companion object {
        private const val TAG = "FilmEngine"
    }
}

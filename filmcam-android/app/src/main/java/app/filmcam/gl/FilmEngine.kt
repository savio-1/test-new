package app.filmcam.gl

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Rect
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
import android.view.TextureView
import androidx.core.graphics.createBitmap
import app.filmcam.film.FilmFrameRate
import app.filmcam.film.FilmLook
import app.filmcam.film.FrameFx
import app.filmcam.film.FrameStyle
import app.filmcam.film.FxAnimator
import app.filmcam.film.StampStyle
import app.filmcam.film.FontLibrary
import app.filmcam.film.TextLayer
import app.filmcam.film.TextRenderer
import app.filmcam.record.VideoRecorder
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.math.abs
import kotlin.math.max
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

    private lateinit var egl: EglCore
    private lateinit var pbuffer: EGLSurface
    private lateinit var renderer: FilmRenderer

    /** Largest texture the GPU takes; limits video resolution and still size. */
    @Volatile var maxTextureSize = 4096
        private set

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
    /** Longest side of the working frame: the video resolution, or enough for the screen. */
    @Volatile var maxWorkSide = 1920
    /** Off when the sensor itself does the slow shutter (real shutter speed). */
    @Volatile var simulateShutter = true
    /** Text overlays burnt into preview, video and stills. */
    @Volatile var textLayers: List<TextLayer> = emptyList()
    @Volatile var fonts: FontLibrary? = null
    private var textKey: Any? = null
    private var textBitmap: Bitmap? = null

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
    private var lastOverlayNs = 0L

    private class Recording(
        val surface: EGLSurface, val recorder: VideoRecorder, val frameTurns: Int, val startNs: Long, val burn: Boolean,
    ) {
        var stopAtNs = 0L
        var stopRequestNs = 0L
    }
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

    /** A Surface for the camera to stream [width]x[height] frames into (sensor orientation). */
    fun openCameraInput(width: Int, height: Int, onReady: (Surface) -> Unit) {
        handler.post {
            input?.release()
            val tex = GlUtil.createOesTexture()
            val st = SurfaceTexture(tex).apply { setDefaultBufferSize(width, height) }
            val surface = Surface(st)
            val inp = CameraInput(tex, st, surface, width, height)
            st.setOnFrameAvailableListener({ onFrame(inp) }, handler)
            input = inp
            onReady(surface)
        }
    }

    fun closeCameraInput() {
        handler.post {
            input?.release()
            input = null
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

    private fun attachDisplay(surface: Surface, width: Int, height: Int) {
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

    /** For a TextureView viewfinder (it can be clipped and faded, unlike a SurfaceView). */
    val textureListener = object : TextureView.SurfaceTextureListener {
        private var surface: Surface? = null

        override fun onSurfaceTextureAvailable(st: SurfaceTexture, width: Int, height: Int) {
            val s = Surface(st)
            surface = s
            attachDisplay(s, width, height)
        }

        override fun onSurfaceTextureSizeChanged(st: SurfaceTexture, width: Int, height: Int) {
            surface?.let { attachDisplay(it, width, height) }
        }

        override fun onSurfaceTextureDestroyed(st: SurfaceTexture): Boolean {
            val latch = CountDownLatch(1)
            handler.post { releaseDisplay(); latch.countDown() }
            latch.await(2, TimeUnit.SECONDS)
            surface?.release()
            surface = null
            return true
        }

        override fun onSurfaceTextureUpdated(st: SurfaceTexture) = Unit
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
        val turns = rec?.frameTurns ?: deviceQuarterTurns

        if (filmFrameDue(if (videoMode) look.frameRate else FilmFrameRate.NATIVE, now)) {
            animator.next(look, (now - startNs) / 1e9f, fx)
            val dt = if (lastDevelopNs == 0L) 1f / 30f else ((now - lastDevelopNs) / 1e9f).coerceIn(0.005f, 0.2f)
            lastDevelopNs = now
            val persistence = if (simulateShutter) look.shutter.persistence(dt) else 0f
            if (persistence > 0f || look.interlace > 0f) p.keepPrevious()
            buildTexMatrix(inp, look)
            renderer.developCamera(p, inp.tex, texMatrix, persistence)
            renderer.glow(liveSource(p), look, turns)
        }
        fx.rollBurn = rollBurn(rec, now)
        if (now - lastOverlayNs > 250_000_000L) {
            lastOverlayNs = now
            renderer.updateOverlays(look.stamp, rec != null)
        }

        val src = liveSource(p)
        if (turns % 2 == 0) updateText(p.width, p.height, 2048) else updateText(p.height, p.width, 2048)
        if (disp != null && displayW > 0) {
            GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)
            renderer.drawFinal(src, look, fx, displayW, displayH, 0, turns)
            egl.swap(disp)
        }
        if (rec != null) {
            egl.makeCurrent(rec.surface)
            GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)
            renderer.drawFinal(src, look, fx, rec.recorder.width, rec.recorder.height, 1, turns)
            egl.setPresentationTime(rec.surface, now)
            egl.swap(rec.surface)
            egl.makeCurrent(disp ?: pbuffer)
            if (rec.stopAtNs in 1..now) finishRecording()
        }
    }

    /** Re-renders the text overlay when the layers or the frame shape change. */
    private fun updateText(frameW: Int, frameH: Int, maxSide: Int) {
        val layers = textLayers
        val key = Triple(layers, frameW, frameH)
        if (key == textKey) return
        textKey = key
        val f = fonts
        if (layers.isEmpty() || f == null) { renderer.setText(null); return }
        val scale = min(1f, maxSide.toFloat() / max(frameW, frameH))
        val w = max(1, (frameW * scale).roundToInt())
        val h = max(1, (frameH * scale).roundToInt())
        var bmp = textBitmap
        if (bmp == null || bmp.width != w || bmp.height != h) {
            bmp?.recycle()
            bmp = createBitmap(w, h).also { textBitmap = it }
        }
        bmp.eraseColor(Color.TRANSPARENT)
        TextRenderer.draw(Canvas(bmp), layers, f, w.toFloat(), h.toFloat())
        renderer.setText(bmp)
    }

    private fun liveSource(p: Pipeline) = FinalSource(p.current, p.previous, p.width, p.height, renderer.identity, p.glow)

    /** Leader burn: flares out over the first 0.8 s of a take and back in over the last 0.7 s. */
    private fun rollBurn(rec: Recording?, now: Long): Float {
        if (rec == null || !rec.burn) return 0f
        val inBurn = 1f - (now - rec.startNs) / 800_000_000f
        val outBurn = if (rec.stopRequestNs > 0) (now - rec.stopRequestNs) / 650_000_000f else 0f
        return max(inBurn, outBurn).coerceIn(0f, 1f)
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
     * Camera2 sets the SurfaceTexture transform so the buffer is upright for the device's
     * natural orientation (and mirrored for the selfie camera). Only a rotated display (a
     * landscape-first tablet held in portrait) needs more.
     */
    private fun extraRotation(): Int = (720 - displayRotationDegrees) % 360

    /** Upright (as displayed) size of the camera buffer. */
    private fun uprightSize(inp: CameraInput): Pair<Int, Int> {
        val rotatedBySt = abs(stMatrix[0]) < abs(stMatrix[4])
        val extraOdd = (extraRotation() / 90) % 2 == 1
        return if (rotatedBySt xor extraOdd) inp.bufH to inp.bufW else inp.bufW to inp.bufH
    }

    private fun ensurePipeline(inp: CameraInput): Pipeline? {
        val (uw, uh) = uprightSize(inp)
        val aspect = outputAspect
        val cw: Float
        val ch: Float
        if (uw.toFloat() / uh > aspect) { ch = uh.toFloat(); cw = ch * aspect } else { cw = uw.toFloat(); ch = cw / aspect }
        val limit = min(maxWorkSide, maxTextureSize).toFloat()
        val scale = min(1f, limit / max(cw, ch))
        val w = ((cw * scale).roundToInt() / 2) * 2
        val h = ((ch * scale).roundToInt() / 2) * 2
        if (w < 16 || h < 16) return null
        val p = pipeline
        if (p != null && p.width == w && p.height == h && p.raw != 0 == !videoMode) return p
        p?.release()
        pipeline = null
        return try {
            Pipeline(w, h, withRaw = !videoMode, glowFormat = renderer.glowFormat).also {
                it.clear()
                pipeline = it
                outputSize = Size(w, h)
                lastDevelopNs = 0L
            }
        } catch (e: Throwable) {
            Log.e(TAG, "pipeline", e)
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

        // C = T(0.5 + weave) * S(sx, sy) * T(-0.5)
        val c = tmpA
        Matrix.setIdentityM(c, 0)
        Matrix.translateM(c, 0, 0.5f + fx.weaveX, 0.5f + fx.weaveY, 0f)
        Matrix.scaleM(c, 0, sx * overscan, sy * overscan, 1f)
        Matrix.translateM(c, 0, -0.5f, -0.5f, 0f)

        // R = T(0.5) * Rz(extra) * T(-0.5)
        val r = tmpB
        Matrix.setIdentityM(r, 0)
        val extra = extraRotation()
        if (extra != 0) {
            Matrix.translateM(r, 0, 0.5f, 0.5f, 0f)
            Matrix.rotateM(r, 0, extra.toFloat(), 0f, 0f, 1f)
            Matrix.translateM(r, 0, -0.5f, -0.5f, 0f)
        }
        val rc = FloatArray(16)
        Matrix.multiplyMM(rc, 0, r, 0, c, 0)
        Matrix.multiplyMM(texMatrix, 0, stMatrix, 0, rc, 0)
    }

    /**
     * Where a point of the preview (0..1, y down) lands in the camera buffer (0..1, y down),
     * for tap-to-focus. Ignores borders, which only shrink the picture slightly.
     */
    fun previewToBuffer(x: Float, y: Float): Pair<Float, Float> {
        val m = texMatrix.copyOf()
        val v = floatArrayOf(x, 1f - y, 0f, 1f)
        val out = FloatArray(4)
        Matrix.multiplyMV(out, 0, m, 0, v, 0)
        return out[0].coerceIn(0f, 1f) to out[1].coerceIn(0f, 1f)
    }

    // ------------------------------------------------------------------ recording

    fun startRecording(recorder: VideoRecorder) {
        handler.post {
            try {
                val surface = egl.createWindowSurface(recorder.inputSurface)
                recorder.start()
                recording = Recording(surface, recorder, deviceQuarterTurns, System.nanoTime(), look.rollBurn)
                lastOverlayNs = 0L
            } catch (e: Exception) {
                Log.e(TAG, "startRecording", e)
                recorder.stop()
            }
        }
    }

    /** Stops recording; with roll burn on, the take burns out for a moment first. */
    fun stopRecording(immediately: Boolean = false) {
        handler.post {
            val rec = recording ?: return@post
            if (rec.burn && !immediately && display != null) {
                if (rec.stopRequestNs == 0L) {
                    rec.stopRequestNs = System.nanoTime()
                    rec.stopAtNs = rec.stopRequestNs + 700_000_000L
                    // In case frames stop arriving, finish anyway.
                    handler.postDelayed({ if (recording === rec) finishRecording() }, 1200)
                }
            } else {
                finishRecording()
            }
        }
    }

    private fun finishRecording() {
        val rec = recording ?: return
        recording = null
        egl.makeCurrent(display ?: pbuffer)
        egl.releaseSurface(rec.surface)
        rec.recorder.stop()
        lastOverlayNs = 0L
    }

    // ------------------------------------------------------------------ stills

    /** Freezes the live motion trail at the shutter press. */
    fun snapshotTrail() {
        handler.post {
            val p = pipeline ?: return@post
            if (!simulateShutter || look.shutter.persistence(1f / 30f) <= 0f) return@post
            renderer.snapshotTrail(p)
        }
    }

    /** Longest side a still may have, limited by the GPU. */
    fun maxStillSide(): Int = min(maxTextureSize, 8192)

    /**
     * Develops a still from the sensor at full resolution. [still] is in sensor orientation;
     * it is turned [rotationCw] degrees and mirrored on the GPU, so no rotated copy is ever
     * held in memory. The final pass runs in tiles, so a 50 MP frame needs one full-size
     * texture, not three. [frameTurns] is how the phone was held (to line up the motion
     * trail). The input bitmap is recycled; [done] gets the developed picture or null.
     */
    fun developStill(
        still: Bitmap, rotationCw: Int, mirror: Boolean, look: FilmLook, frameTurns: Int,
        done: (Bitmap?) -> Unit,
    ) {
        handler.post {
            var result: Bitmap? = null
            val textures = ArrayList<Int>()
            val fbos = ArrayList<Int>()
            var glow: Glow? = null
            try {
                egl.makeCurrent(pbuffer)
                renderer.updateOverlays(look.stamp, false)
                val odd = (rotationCw / 90) % 2 == 1
                val w = if (odd) still.height else still.width
                val h = if (odd) still.width else still.height
                val src = renderer.uploadMipmapped(still).also { textures += it }
                still.recycle()
                val imageMatrix = stillMatrix(rotationCw, mirror)

                // Slow shutter: add the trail from the live view (needs a second full-size frame).
                val preview = pipeline
                val trailOn = simulateShutter && preview != null && preview.trailTex != 0 &&
                    look.shutter.persistence(1f / 30f) > 0f && w.toLong() * h <= 16_000_000L
                val source = if (trailOn) {
                    val work = GlUtil.createTexture(w, h, GLES30.GL_RGBA8, mipmapped = true).also { textures += it }
                    val fbo = GlUtil.createFramebuffer(work).also { fbos += it }
                    renderer.developStillWithTrail(fbo, w, h, src, imageMatrix, preview!!.trailTex, quarterTurnMatrix((4 - frameTurns) % 4))
                    GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, work)
                    GLES30.glGenerateMipmap(GLES30.GL_TEXTURE_2D)
                    glow = Glow(w, h, renderer.glowFormat)
                    FinalSource(work, work, w, h, renderer.identity, glow!!)
                } else {
                    glow = Glow(w, h, renderer.glowFormat)
                    FinalSource(src, src, w, h, imageMatrix, glow!!)
                }
                renderer.glow(source, look, 0)
                updateText(w, h, 4096)
                result = renderTiled(source, look, stillFx(look), w, h, targetRot = 0, frameRot = 0)
                textKey = null   // the live view re-renders its own size next frame
            } catch (e: Throwable) {
                Log.e(TAG, "developStill", e)
                if (!still.isRecycled) still.recycle()
            } finally {
                GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)
                glow?.release()
                GlUtil.deleteFramebuffers(*fbos.toIntArray())
                GlUtil.deleteTextures(*textures.toIntArray())
                egl.makeCurrent(display ?: pbuffer)
            }
            done(result)
        }
    }

    private fun stillFx(look: FilmLook): FrameFx {
        val out = FrameFx()
        FxAnimator().apply {
            val t = (System.nanoTime() % 100_000L) / 10f
            repeat(24) { next(look, t, out) }   // let scratches settle into a state
        }
        out.slip = 0f
        return out
    }

    /**
     * Four quick exposures from the live view, 0.25 s apart, on one frame: the four-lens
     * sampler camera. Each quarter is turned upright for how the phone is held.
     */
    fun captureSampler(look: FilmLook, done: (Bitmap?) -> Unit) {
        val turns = deviceQuarterTurns
        val shots = ArrayList<Bitmap>()
        val quarterLook = look.copy(frame = FrameStyle.NONE, stamp = StampStyle.NONE)
        fun shoot(i: Int) {
            handler.postDelayed({
                val p = pipeline
                if (p == null) { shots.forEach { it.recycle() }; done(null); return@postDelayed }
                try {
                    egl.makeCurrent(display ?: pbuffer)
                    val odd = turns % 2 == 1
                    val w = if (odd) p.height else p.width
                    val h = if (odd) p.width else p.height
                    shots += renderTiled(liveSource(p), quarterLook, fx, w, h, targetRot = (4 - turns) % 4, frameRot = turns, withText = false)
                } catch (e: Throwable) {
                    Log.e(TAG, "sampler", e)
                }
                if (i < 3) shoot(i + 1) else done(composeGrid(shots, look))
            }, if (i == 0) 0L else 250L)
        }
        shoot(0)
    }

    private fun composeGrid(shots: List<Bitmap>, look: FilmLook): Bitmap? {
        if (shots.size < 4) { shots.forEach { it.recycle() }; return null }
        val w = shots[0].width
        val h = shots[0].height
        val gutter = (min(w, h) * 0.03f).roundToInt()
        val out = createBitmap(w * 2 + gutter * 3, h * 2 + gutter * 3)
        val c = Canvas(out)
        c.drawColor(if (look.frame == FrameStyle.WHITE || look.frame == FrameStyle.MAT) Color.rgb(245, 244, 240) else Color.rgb(8, 8, 8))
        shots.forEachIndexed { i, b ->
            val x = gutter + (i % 2) * (w + gutter)
            val y = gutter + (i / 2) * (h + gutter)
            c.drawBitmap(b, x.toFloat(), y.toFloat(), null)
            b.recycle()
        }
        // Text goes across the whole grid, not into each quarter.
        fonts?.let { TextRenderer.draw(c, textLayers, it, out.width.toFloat(), out.height.toFloat()) }
        return out
    }

    /** Runs the final pass in tiles into a bitmap of [w]x[h] (top row first). */
    private fun renderTiled(
        src: FinalSource, look: FilmLook, frameFx: FrameFx, w: Int, h: Int, targetRot: Int, frameRot: Int,
        withText: Boolean = true,
    ): Bitmap {
        val tile = min(2048, maxTextureSize)
        val tex = GlUtil.createTexture(tile, tile, GLES30.GL_RGBA8)
        val fbo = GlUtil.createFramebuffer(tex)
        val out = createBitmap(w, h)
        val tileBmp = createBitmap(tile, tile)
        val buf = ByteBuffer.allocateDirect(tile * tile * 4).order(ByteOrder.nativeOrder())
        val canvas = Canvas(out)
        try {
            GLES30.glPixelStorei(GLES30.GL_PACK_ALIGNMENT, 1)
            GLES30.glPixelStorei(GLES30.GL_PACK_ROW_LENGTH, tile)
            var y0 = 0
            while (y0 < h) {
                val th = min(tile, h - y0)
                var x0 = 0
                while (x0 < w) {
                    val tw = min(tile, w - x0)
                    GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, fbo)
                    renderer.drawFinal(src, look, frameFx, tw, th, targetRot, frameRot, w, h, x0, y0, withText)
                    buf.clear()
                    GLES30.glReadPixels(0, 0, tw, th, GLES30.GL_RGBA, GLES30.GL_UNSIGNED_BYTE, buf)
                    flipRows(buf, tile * 4, th)
                    buf.rewind()
                    tileBmp.copyPixelsFromBuffer(buf)
                    // GL rows count up from the bottom; the bitmap's from the top.
                    canvas.drawBitmap(tileBmp, Rect(0, 0, tw, th), Rect(x0, h - y0 - th, x0 + tw, h - y0), null)
                    x0 += tile
                }
                y0 += tile
            }
            GlUtil.checkError("renderTiled")
        } finally {
            GLES30.glPixelStorei(GLES30.GL_PACK_ROW_LENGTH, 0)
            GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)
            GlUtil.deleteFramebuffers(fbo)
            GlUtil.deleteTextures(tex)
            tileBmp.recycle()
        }
        return out
    }

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

    /**
     * Screen uv (y up, upright picture) -> texture uv of a still kept in sensor orientation
     * (row 0 at the top), undoing the mirror and a clockwise rotation of [rotationCw].
     */
    private fun stillMatrix(rotationCw: Int, mirror: Boolean): FloatArray {
        fun map(x: Float, y: Float): Pair<Float, Float> {
            var ox = x
            val oy = 1f - y                               // image coordinates, y down
            if (mirror) ox = 1f - ox
            return when ((rotationCw / 90) and 3) {
                1 -> oy to 1f - ox
                2 -> 1f - ox to 1f - oy
                3 -> 1f - oy to ox
                else -> ox to oy
            }
        }
        val (tx, ty) = map(0f, 0f)
        val (ax, ay) = map(1f, 0f)
        val (bx, by) = map(0f, 1f)
        val m = FloatArray(16)
        Matrix.setIdentityM(m, 0)
        m[0] = ax - tx; m[1] = ay - ty
        m[4] = bx - tx; m[5] = by - ty
        m[12] = tx; m[13] = ty
        return m
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

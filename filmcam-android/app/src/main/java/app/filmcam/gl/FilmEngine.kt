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
import app.filmcam.seg.SubjectMasker
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
 * How a still is framed: [aspect] (width / height of the saved picture, null to keep the
 * sensor's) and digital [zoom] the camera left to us.
 */
data class StillCrop(val aspect: Float? = null, val zoom: Float = 1f)

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
    /** Live subtitles: drawn with the text, over everything. */
    @Volatile var captionLayers: List<TextLayer> = emptyList()
    @Volatile var fonts: FontLibrary? = null
    /** Log video: what the screen and the encoder get (see Shaders uLogMode), and the gain. */
    @Volatile var logDisplay = 0
    @Volatile var logEncode = 0
    @Volatile var logGain = 1f
    /** Editing an imported picture: the frame stays upright whichever way the phone is held. */
    @Volatile var upright = false
    /** Loads a film stock's LUT strip (assets/luts/<id>.png), or null. */
    @Volatile var lutSource: ((String) -> Bitmap?)? = null
    private var textKey: Any? = null
    private var textBitmap: Bitmap? = null
    private var textBackBitmap: Bitmap? = null

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
    /** Zero point of effect time: engine start, or the first frame of an export. */
    private var timeBaseNs = System.nanoTime()
    private var lastFilmFrameNs = 0L
    private var lastDevelopNs = 0L
    private var lastOverlayNs = 0L

    private class Recording(
        val surface: EGLSurface, val recorder: VideoRecorder, val frameTurns: Int, val startNs: Long, val burn: Boolean,
        /** Quarter turns from the encoder buffer to screen space (1: landscape buffer, portrait picture). */
        val targetRot: Int = 1,
        /** Exporting an imported video: frames carry their own timestamps, one in, one out. */
        val onFrame: (() -> Unit)? = null,
    ) {
        val offline get() = onFrame != null
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
            renderer.lutSource = { id -> lutSource?.invoke(id) }
            maxTextureSize = GlUtil.maxTextureSize()
        }
    }

    // ------------------------------------------------------------------ camera input

    /**
     * A stream of frames: the camera, or a video decoder. [rotation] is how far a decoded video
     * must turn clockwise to stand upright (the camera's own transform already does this).
     */
    private class CameraInput(
        val tex: Int, val st: SurfaceTexture, val surface: Surface, val bufW: Int, val bufH: Int, val rotation: Int = 0,
    ) {
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

    /**
     * A Surface for the camera (or a video decoder) to stream [width]x[height] frames into, in
     * their own orientation; [rotation] turns decoded video upright.
     */
    fun openCameraInput(width: Int, height: Int, rotation: Int = 0, onReady: (Surface) -> Unit) {
        handler.post {
            input?.release()
            val tex = GlUtil.createOesTexture()
            val st = SurfaceTexture(tex).apply { setDefaultBufferSize(width, height) }
            val surface = Surface(st)
            val inp = CameraInput(tex, st, surface, width, height, ((rotation % 360) + 360) % 360)
            st.setOnFrameAvailableListener({ onFrame(inp) }, handler)
            input = inp
            onReady(surface)
        }
    }

    /** Closes the input; with [only], just if that surface is still the current one. */
    fun closeCameraInput(only: Surface? = null) {
        handler.post {
            val inp = input ?: return@post
            if (only != null && inp.surface !== only) return@post
            inp.release()
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
        val rec = recording
        // An export runs on the video's own clock; everything else on the wall clock.
        val now = if (rec?.offline == true) inp.st.timestamp else System.nanoTime()
        val disp = display
        if (disp == null && rec == null) return

        egl.makeCurrent(disp ?: pbuffer)
        val (uw, uh) = uprightSize(inp)
        val p = ensurePipeline(uw, uh) ?: run { rec?.onFrame?.invoke(); return }
        renderFrame(p, now, rec) { look, persistence ->
            buildTexMatrix(inp, look)
            renderer.developCamera(p, inp.tex, texMatrix, persistence)
        }
        rec?.onFrame?.invoke()
    }

    /** The turns of the frame: how the phone is held, or upright while editing an import. */
    private fun frameTurns(rec: Recording?) = rec?.frameTurns ?: if (upright) 0 else deviceQuarterTurns

    /**
     * Everything after the camera: develop (when a film frame is due), glow, and the final pass
     * to the screen and, while recording, to the encoder.
     */
    private inline fun renderFrame(p: Pipeline, now: Long, rec: Recording?, develop: (FilmLook, Float) -> Unit) {
        val disp = display
        val look = look
        val turns = frameTurns(rec)
        if (filmFrameDue(if (videoMode) look.frameRate else FilmFrameRate.NATIVE, now)) {
            animator.next(look, (now - timeBaseNs) / 1e9f, fx)
            val dt = if (lastDevelopNs == 0L) 1f / 30f else ((now - lastDevelopNs) / 1e9f).coerceIn(0.005f, 0.2f)
            lastDevelopNs = now
            val persistence = if (simulateShutter) look.shutter.persistence(dt) else 0f
            if (persistence > 0f || look.interlace > 0f) p.keepPrevious()
            develop(look, persistence)
            // The subject is segmented while the GPU works on the glows. An export has time to
            // cut out every frame, so words set behind the subject never lag the person.
            startSubject(liveSource(p), turns, forStill = rec?.offline == true)
            renderer.glow(liveSource(p), look, turns)
        }
        fx.rollBurn = rollBurn(rec, now)
        val wall = System.nanoTime()
        if (wall - lastOverlayNs > 250_000_000L) {
            lastOverlayNs = wall
            renderer.updateOverlays(look.stamp, rec != null)
        }
        renderer.logGain = logGain
        renderer.digitalExposure = upright

        val src = liveSource(p)
        // Exports (subtitles on a 4K clip) get text as sharp as the frame; live view stays at 2K,
        // or 1280 while text is animating (it is redrawn up to 30 times a second then).
        val animated = textLayers.any { it.anim != app.filmcam.film.TextAnim.NONE }
        val textSide = if (rec?.offline == true) min(4096, max(p.width, p.height)) else if (animated) 1280 else 2048
        val t = (now - timeBaseNs) / 1e9f
        if (turns % 2 == 0) updateText(p.width, p.height, textSide, t) else updateText(p.height, p.width, textSide, t)
        finishSubject(waitMs = if (rec?.offline == true) 1_000L else 12L)
        if (disp != null && displayW > 0) {
            GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)
            renderer.drawFinal(src, look, fx, displayW, displayH, 0, turns, logMode = logDisplay)
            egl.swap(disp)
        }
        if (rec != null) {
            egl.makeCurrent(rec.surface)
            GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)
            renderer.drawFinal(src, look, fx, rec.recorder.width, rec.recorder.height, rec.targetRot, turns, logMode = logEncode)
            egl.setPresentationTime(rec.surface, now)
            egl.swap(rec.surface)
            egl.makeCurrent(disp ?: pbuffer)
            if (rec.stopAtNs in 1..now) finishRecording()
        }
    }

    // ------------------------------------------------------------------ still source (imports)

    private class StillSource(val tex: Int, val w: Int, val h: Int)
    private var stillSource: StillSource? = null
    private val stillMatrixBuf = FloatArray(16)

    private val stillTick = object : Runnable {
        override fun run() {
            renderStillFrame()
            if (stillSource != null) handler.postDelayed(this, 40)
        }
    }

    /**
     * Shows an upright picture in the viewfinder instead of the camera, running through the
     * film pipeline ~25 times a second so grain and leaks stay alive. Null stops it. The
     * bitmap is recycled.
     */
    fun showStill(bmp: Bitmap?) {
        handler.post {
            handler.removeCallbacks(stillTick)
            egl.makeCurrent(display ?: pbuffer)
            stillSource?.let { GlUtil.deleteTextures(it.tex) }
            stillSource = null
            if (bmp == null) return@post
            val tex = renderer.uploadMipmapped(bmp)
            stillSource = StillSource(tex, bmp.width, bmp.height)
            bmp.recycle()
            lastDevelopNs = 0L
            handler.post(stillTick)
        }
    }

    private fun renderStillFrame() {
        val src = stillSource ?: return
        val disp = display ?: return
        if (input != null) return
        egl.makeCurrent(disp)
        val p = ensurePipeline(src.w, src.h) ?: return
        renderFrame(p, System.nanoTime(), null) { _, _ ->
            val (sx, sy) = cropFractions(src.w, src.h, p)
            stillMatrix(0, false, sx, sy, stillMatrixBuf)
            renderer.developTexture(p, src.tex, stillMatrixBuf)
        }
    }

    /** How much of an upright [uw]x[uh] picture the working frame shows (centre crop). */
    private fun cropFractions(uw: Int, uh: Int, p: Pipeline): Pair<Float, Float> {
        val cropFracW = p.width.toFloat() / p.height * uh / uw
        return if (cropFracW <= 1f) cropFracW to 1f else 1f to 1f / cropFracW
    }

    /**
     * Re-renders the text overlays when the layers or the frame shape change, and, for
     * animated text, when its pose is due to change ([t] seconds in; negative for stills).
     */
    private fun updateText(frameW: Int, frameH: Int, maxSide: Int, t: Float = -1f) {
        val layers = textLayers + captionLayers
        val fps = layers.maxOfOrNull { it.anim.fps } ?: 0
        val frame = if (fps > 0 && t >= 0f) (t * fps).toLong() else -1L
        val key = listOf(layers, frameW, frameH, maxSide, frame)
        if (key == textKey) return
        textKey = key
        val f = fonts
        if (layers.isEmpty() || f == null) { renderer.setText(null, null); return }
        val scale = min(1f, maxSide.toFloat() / max(frameW, frameH))
        val w = max(1, (frameW * scale).roundToInt())
        val h = max(1, (frameH * scale).roundToInt())
        fun draw(part: List<TextLayer>, old: Bitmap?): Bitmap? {
            if (part.isEmpty()) return old
            val bmp = if (old != null && old.width == w && old.height == h) old else { old?.recycle(); createBitmap(w, h) }
            bmp.eraseColor(Color.TRANSPARENT)
            // Drawn plain: the shader blends it with the picture.
            TextRenderer.draw(Canvas(bmp), part, f, w.toFloat(), h.toFloat(), t, blend = false)
            return bmp
        }
        val front = layers.filter { !it.behind }
        val back = layers.filter { it.behind }
        textBitmap = draw(front, textBitmap)
        textBackBitmap = draw(back, textBackBitmap)
        // One mode per texture: the one most of its layers use (subtitles share theirs).
        fun mode(part: List<TextLayer>) = part.groupingBy { it.blend }.eachCount().maxByOrNull { it.value }?.key?.shaderId ?: 0
        renderer.setText(if (front.isEmpty()) null else textBitmap, if (back.isEmpty()) null else textBackBitmap, mode(front), mode(back))
    }

    // ------------------------------------------------------------------ subject matte

    /** Cuts the subject out of each frame for text set behind it; null when unavailable. */
    @Volatile var subjects: SubjectMasker? = null
    private var segBuf: ByteBuffer? = null
    private var subjectSeq = -1L

    private fun subjectWanted() = subjects != null && textLayers.any { it.behind }

    /** Hands what [src] shows (upright for [turns]) to the segmenter, if it is free. */
    private fun startSubject(src: FinalSource, turns: Int, forStill: Boolean = false) {
        val m = subjects ?: return
        if (!subjectWanted()) return
        val (fw, fh) = if (turns % 2 == 0) src.width to src.height else src.height to src.width
        val k = SubjectMasker.INPUT_SIDE.toFloat() / max(fw, fh)
        val w = max(16, (fw * k).roundToInt())
        val h = max(16, (fh * k).roundToInt())
        val buf = segBuf ?: ByteBuffer.allocateDirect(SubjectMasker.INPUT_SIDE * SubjectMasker.INPUT_SIDE * 4).also { segBuf = it }
        if (forStill) m.awaitIdle(10_000L)
        if (!m.idle) return
        renderer.readSegInput(src, turns, w, h, buf)
        m.submit(buf, w, h)
        subjectSubmitted = true
    }

    /** A frame went to the segmenter this frame (so it is worth waiting a moment for). */
    private var subjectSubmitted = false

    /**
     * Gives the renderer the newest matte, after waiting up to [waitMs] for this frame's:
     * long enough that a moving subject and its cut-out stay together, short enough that the
     * frame rate holds when the model is slow (the matte then lands a frame later).
     */
    private fun finishSubject(waitMs: Long) {
        val m = subjects
        if (m == null || !subjectWanted()) {
            if (subjectSeq != -1L) { renderer.setSubjectMask(null, 0, 0); subjectSeq = -1L }
            return
        }
        // Only wait for this frame's own cut-out. While the segmenter is still on an older
        // frame, waiting would only stall the viewfinder and the recording.
        if (subjectSubmitted) m.await(waitMs)
        subjectSubmitted = false
        val matte = m.latest ?: return
        if (matte.seq != subjectSeq) {
            subjectSeq = matte.seq
            if (matte.empty) renderer.setSubjectMask(null, 0, 0) else renderer.setSubjectMask(matte.pixels, matte.w, matte.h)
        }
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
        val extraOdd = ((extraRotation() + inp.rotation) / 90) % 2 == 1
        return if (rotatedBySt xor extraOdd) inp.bufH to inp.bufW else inp.bufW to inp.bufH
    }

    /** The working-frame size (and so the video size) for an upright [uw]x[uh] source. */
    fun frameSizeFor(uw: Int, uh: Int): Size {
        val (w, h) = frameSize(uw, uh)
        return Size(w, h)
    }

    private fun frameSize(uw: Int, uh: Int): Pair<Int, Int> {
        val aspect = outputAspect
        val cw: Float
        val ch: Float
        if (uw.toFloat() / uh > aspect) { ch = uh.toFloat(); cw = ch * aspect } else { cw = uw.toFloat(); ch = cw / aspect }
        val limit = min(maxWorkSide, maxTextureSize).toFloat()
        val scale = min(1f, limit / max(cw, ch))
        // Video sizes stay on 16-pixel steps: some encoders want that for odd shapes like 4:5.
        val step = if (videoMode) 16 else 2
        return ((cw * scale).roundToInt() / step) * step to ((ch * scale).roundToInt() / step) * step
    }

    private fun ensurePipeline(uw: Int, uh: Int): Pipeline? {
        val (w, h) = frameSize(uw, uh)
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
        val (sx, sy) = cropFractions(uw, uh, p)
        val overscan = overscan(look)

        // C = T(0.5 + weave) * S(sx, sy) * T(-0.5)
        val c = tmpA
        Matrix.setIdentityM(c, 0)
        Matrix.translateM(c, 0, 0.5f + fx.weaveX, 0.5f + fx.weaveY, 0f)
        Matrix.scaleM(c, 0, sx * overscan, sy * overscan, 1f)
        Matrix.translateM(c, 0, -0.5f, -0.5f, 0f)

        // R = T(0.5) * Rz(extra) * T(-0.5)
        val r = tmpB
        Matrix.setIdentityM(r, 0)
        val extra = (extraRotation() + inp.rotation) % 360
        if (extra != 0) {
            Matrix.translateM(r, 0, 0.5f, 0.5f, 0f)
            Matrix.rotateM(r, 0, extra.toFloat(), 0f, 0f, 1f)
            Matrix.translateM(r, 0, -0.5f, -0.5f, 0f)
        }
        val rc = FloatArray(16)
        Matrix.multiplyMM(rc, 0, r, 0, c, 0)
        Matrix.multiplyMM(texMatrix, 0, stMatrix, 0, rc, 0)
    }

    /** Gate weave moves the picture; this much is cropped so the edges never show. */
    private fun overscan(look: FilmLook) = 1f - 2.2f * FxAnimator.MAX_WEAVE * look.gateWeave

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

    /**
     * Starts exporting an imported video: frames decoded into the input surface are rendered,
     * one by one, into [recorder] with their own timestamps. [onFrame] runs on the render
     * thread after each one, so the decoder can send the next. [targetRot] is 0 for a
     * landscape picture, 1 for a portrait one in a landscape buffer.
     */
    fun startExport(recorder: VideoRecorder, targetRot: Int, onFrame: () -> Unit) {
        handler.post {
            try {
                val surface = egl.createWindowSurface(recorder.inputSurface)
                recorder.start()
                recording = Recording(surface, recorder, 0, 0L, burn = false, targetRot = targetRot, onFrame = onFrame)
                timeBaseNs = 0L
                lastFilmFrameNs = 0L
                lastDevelopNs = 0L
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
        if (rec.offline) {
            timeBaseNs = System.nanoTime()
            lastFilmFrameNs = 0L
            lastDevelopNs = 0L
        }
    }

    /** Ends an export once the last frame is in. */
    fun finishExport() {
        handler.post { if (recording?.offline == true) finishRecording() }
    }

    // ------------------------------------------------------------------ stills

    /**
     * This frame's leaks, flicker and scratches, for a still taken now: the saved picture gets
     * the same ones the viewfinder showed at the press, not a new roll of the dice.
     */
    fun liveFx(): FrameFx = FrameFx().also { it.copyFrom(fx); it.slip = 0f; it.rollBurn = 0f }

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
        crop: StillCrop = StillCrop(), frameFx: FrameFx? = null,
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
                renderer.digitalExposure = upright
                val odd = (rotationCw / 90) % 2 == 1
                val uw = if (odd) still.height else still.width
                val uh = if (odd) still.width else still.height
                // Same framing as the viewfinder: its aspect, its zoom, its weave margin.
                var sx = 1f
                var sy = 1f
                crop.aspect?.let { a -> if (uw.toFloat() / uh > a) sx = a * uh / uw else sy = uw / (a * uh) }
                val z = overscan(look) / max(1f, crop.zoom)
                sx *= z
                sy *= z
                val w = max(2, ((uw * sx).roundToInt() / 2) * 2)
                val h = max(2, ((uh * sy).roundToInt() / 2) * 2)
                val src = renderer.uploadMipmapped(still).also { textures += it }
                still.recycle()
                val imageMatrix = stillMatrix(rotationCw, mirror, sx, sy, FloatArray(16))

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
                startSubject(source, 0, forStill = true)
                finishSubject(waitMs = 10_000L)
                result = renderTiled(source, look, frameFx ?: stillFx(look), w, h, targetRot = 0, frameRot = 0)
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
                    renderer.drawFinal(src, look, frameFx, tw, th, targetRot, frameRot, w, h, x0, y0, withText, still = true)
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
     * (row 0 at the top), undoing the mirror and a clockwise rotation of [rotationCw], showing
     * the central [cropX] x [cropY] of the upright picture.
     */
    private fun stillMatrix(rotationCw: Int, mirror: Boolean, cropX: Float, cropY: Float, m: FloatArray): FloatArray {
        fun map(x0: Float, y0: Float): Pair<Float, Float> {
            val x = 0.5f + (x0 - 0.5f) * cropX            // centre crop of the upright picture
            val y = 0.5f + (y0 - 0.5f) * cropY
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

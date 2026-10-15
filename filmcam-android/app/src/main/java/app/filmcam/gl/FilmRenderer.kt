package app.filmcam.gl

import android.graphics.Bitmap
import android.opengl.GLES11Ext
import android.opengl.GLES30
import android.opengl.GLUtils
import app.filmcam.film.DateStamp
import app.filmcam.film.FilmLook
import app.filmcam.film.FrameFx
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.log2
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * The textures one size of output needs: the developed frame (twice, so slow shutters can
 * blend with the previous one), the raw camera frame, and the small glow buffers.
 */
class Pipeline(val width: Int, val height: Int, private val forCamera: Boolean, glowFormat: Int) {
    private val accum = IntArray(if (forCamera) 2 else 1) { GlUtil.createTexture(width, height, GLES30.GL_RGBA8, mipmapped = true) }
    val raw = if (forCamera) GlUtil.createTexture(width, height, GLES30.GL_RGBA8) else 0
    private val fbo = IntArray(accum.size) { i ->
        if (forCamera) GlUtil.createFramebuffer(accum[i], raw) else GlUtil.createFramebuffer(accum[i])
    }
    private var cur = 0

    val smallW: Int
    val smallH: Int
    init {
        val scale = minOf(480f / max(width, height), 0.5f)
        smallW = max(8, (width * scale).roundToInt())
        smallH = max(8, (height * scale).roundToInt())
    }
    val glowTight = GlUtil.createTexture(smallW, smallH, glowFormat)
    val glowWide = GlUtil.createTexture(smallW, smallH, glowFormat)
    val glowTmp = GlUtil.createTexture(smallW, smallH, glowFormat)
    val glowTightFbo = GlUtil.createFramebuffer(glowTight)
    val glowWideFbo = GlUtil.createFramebuffer(glowWide)
    val glowTmpFbo = GlUtil.createFramebuffer(glowTmp)

    /** Motion trail snapshot taken when the shutter is pressed (camera pipelines only). */
    var trailTex = 0
        private set
    private var trailFbo = 0

    val current get() = accum[cur]
    val previous get() = accum[(cur + accum.size - 1) % accum.size]
    val currentFbo get() = fbo[cur]

    fun advance() { cur = (cur + 1) % accum.size }

    fun trailFramebuffer(): Int {
        if (trailFbo == 0) {
            trailTex = GlUtil.createTexture(width, height, GLES30.GL_RGBA8)
            trailFbo = GlUtil.createFramebuffer(trailTex)
        }
        return trailFbo
    }

    fun clear() {
        for (f in fbo) {
            GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, f)
            GLES30.glClearColor(0f, 0f, 0f, 1f)
            GLES30.glClear(GLES30.GL_COLOR_BUFFER_BIT)
        }
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)
    }

    fun release() {
        GlUtil.deleteFramebuffers(*fbo, glowTightFbo, glowWideFbo, glowTmpFbo)
        GlUtil.deleteTextures(*accum, glowTight, glowWide, glowTmp)
        if (raw != 0) GlUtil.deleteTextures(raw)
        if (trailFbo != 0) { GlUtil.deleteFramebuffers(trailFbo); GlUtil.deleteTextures(trailTex) }
    }
}

/** Owns the shader programs and draws the passes. GL thread only. */
class FilmRenderer {
    private val developOes = Program(Shaders.VERTEX, Shaders.DEVELOP_OES)
    private val develop2d = Program(Shaders.VERTEX, Shaders.DEVELOP_2D)
    private val trail = Program(Shaders.VERTEX, Shaders.TRAIL)
    private val bright = Program(Shaders.VERTEX, Shaders.BRIGHT)
    private val blur = Program(Shaders.VERTEX, Shaders.BLUR)
    private val final = Program(Shaders.VERTEX, Shaders.FINAL)

    val glowFormat: Int =
        if (GlUtil.hasExtension("GL_EXT_color_buffer_half_float") || GlUtil.hasExtension("GL_EXT_color_buffer_float"))
            GLES30.GL_RGBA16F else GLES30.GL_RGBA8

    private val vao: Int
    private val vbo: Int
    private var stampTex = 0
    private var stampText = ""
    private val identity = FloatArray(16).also { android.opengl.Matrix.setIdentityM(it, 0) }

    init {
        val quad = floatArrayOf(
            -1f, -1f, 0f, 0f,
            1f, -1f, 1f, 0f,
            -1f, 1f, 0f, 1f,
            1f, 1f, 1f, 1f,
        )
        val buf = ByteBuffer.allocateDirect(quad.size * 4).order(ByteOrder.nativeOrder()).asFloatBuffer()
        buf.put(quad).position(0)
        val ids = IntArray(1)
        GLES30.glGenVertexArrays(1, ids, 0); vao = ids[0]
        GLES30.glGenBuffers(1, ids, 0); vbo = ids[0]
        GLES30.glBindVertexArray(vao)
        GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER, vbo)
        GLES30.glBufferData(GLES30.GL_ARRAY_BUFFER, quad.size * 4, buf, GLES30.GL_STATIC_DRAW)
        GLES30.glEnableVertexAttribArray(0)
        GLES30.glVertexAttribPointer(0, 2, GLES30.GL_FLOAT, false, 16, 0)
        GLES30.glEnableVertexAttribArray(1)
        GLES30.glVertexAttribPointer(1, 2, GLES30.GL_FLOAT, false, 16, 8)
        GLES30.glBindVertexArray(0)
        GLES30.glDisable(GLES30.GL_DEPTH_TEST)
        GLES30.glDisable(GLES30.GL_BLEND)
        refreshStamp()
    }

    private fun draw() {
        GLES30.glBindVertexArray(vao)
        GLES30.glDrawArrays(GLES30.GL_TRIANGLE_STRIP, 0, 4)
        GLES30.glBindVertexArray(0)
    }

    private fun bindTex(unit: Int, tex: Int, target: Int = GLES30.GL_TEXTURE_2D) {
        GLES30.glActiveTexture(GLES30.GL_TEXTURE0 + unit)
        GLES30.glBindTexture(target, tex)
    }

    /** Re-renders the date stamp when the day changes. */
    fun refreshStamp() {
        val text = DateStamp.text()
        if (text == stampText && stampTex != 0) return
        stampText = text
        if (stampTex != 0) GlUtil.deleteTextures(stampTex)
        val bmp = DateStamp.render(text)
        val t = IntArray(1)
        GLES30.glGenTextures(1, t, 0)
        stampTex = t[0]
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, stampTex)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_LINEAR)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_LINEAR)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_S, GLES30.GL_CLAMP_TO_EDGE)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_T, GLES30.GL_CLAMP_TO_EDGE)
        GLUtils.texImage2D(GLES30.GL_TEXTURE_2D, 0, bmp, 0)
        bmp.recycle()
    }

    /** Pass 1 for live frames. [texMatrix] maps output uv to camera texture coordinates. */
    fun developCamera(p: Pipeline, oesTex: Int, texMatrix: FloatArray, persistence: Float) {
        p.advance()
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, p.currentFbo)
        GLES30.glViewport(0, 0, p.width, p.height)
        developOes.use()
        bindTex(0, oesTex, GLES11Ext.GL_TEXTURE_EXTERNAL_OES)
        bindTex(1, p.previous)
        bindTex(2, p.previous)
        developOes.set1i("uSource", 0)
        developOes.set1i("uPrev", 1)
        developOes.set1i("uTrail", 2)
        developOes.setMat4("uTexMatrix", texMatrix)
        developOes.setMat4("uTrailMatrix", identity)
        developOes.set1f("uPersistence", persistence)
        developOes.set1f("uTrailAmount", 0f)
        draw()
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)
        bindTex(0, p.current)
        GLES30.glGenerateMipmap(GLES30.GL_TEXTURE_2D)
    }

    /** Pass 1 for a still photo held in a 2D texture. */
    fun developStill(p: Pipeline, tex: Int, texMatrix: FloatArray, trailTex: Int, trailMatrix: FloatArray, trailAmount: Float) {
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, p.currentFbo)
        GLES30.glViewport(0, 0, p.width, p.height)
        develop2d.use()
        bindTex(0, tex)
        bindTex(1, tex)
        bindTex(2, if (trailTex != 0 && trailAmount > 0f) trailTex else tex)
        develop2d.set1i("uSource", 0)
        develop2d.set1i("uPrev", 1)
        develop2d.set1i("uTrail", 2)
        develop2d.setMat4("uTexMatrix", texMatrix)
        develop2d.setMat4("uTrailMatrix", trailMatrix)
        develop2d.set1f("uPersistence", 0f)
        develop2d.set1f("uTrailAmount", if (trailTex != 0) trailAmount else 0f)
        draw()
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)
        bindTex(0, p.current)
        GLES30.glGenerateMipmap(GLES30.GL_TEXTURE_2D)
    }

    /** Stores (accumulated - raw) so a still can carry the live motion trail. */
    fun snapshotTrail(p: Pipeline) {
        if (p.raw == 0) return
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, p.trailFramebuffer())
        GLES30.glViewport(0, 0, p.width, p.height)
        trail.use()
        bindTex(0, p.current)
        bindTex(1, p.raw)
        trail.set1i("uAccum", 0)
        trail.set1i("uRaw", 1)
        trail.setMat4("uTexMatrix", identity)
        draw()
    }

    /** Passes 2 and 3: highlights, then a tight and a wide blur of them. */
    fun glow(p: Pipeline, look: FilmLook) {
        val threshold = halationThreshold(look)
        GLES30.glViewport(0, 0, p.smallW, p.smallH)
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, p.glowTightFbo)
        bright.use()
        bindTex(0, p.current)
        bright.set1i("uSrc", 0)
        bright.setMat4("uTexMatrix", identity)
        bright.set1f("uLod", max(0f, log2(p.height.toFloat() / p.smallH)))
        bright.set1f("uThreshold", threshold)
        draw()

        blur.use()
        blur.set1i("uSrc", 0)
        blur.setMat4("uTexMatrix", identity)
        val sx = 1f / p.smallW
        val sy = 1f / p.smallH
        fun pass(src: Int, dstFbo: Int, stepX: Float, stepY: Float) {
            GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, dstFbo)
            bindTex(0, src)
            blur.set2f("uStep", stepX, stepY)
            draw()
        }
        // Tight: halation hugs the highlight.
        pass(p.glowTight, p.glowTmpFbo, sx * 1.6f, 0f)
        pass(p.glowTmp, p.glowTightFbo, 0f, sy * 1.6f)
        // Wide: bloom spreads further.
        pass(p.glowTight, p.glowTmpFbo, sx * 2.4f, 0f)
        pass(p.glowTmp, p.glowWideFbo, 0f, sy * 2.4f)
        pass(p.glowWide, p.glowTmpFbo, sx * 4.5f, 0f)
        pass(p.glowTmp, p.glowWideFbo, 0f, sy * 4.5f)
    }

    /**
     * Pass 4 into whatever framebuffer is bound. [targetRot] turns the target into screen
     * space (1 for the landscape encoder buffer), [frameRot] turns screen space upright.
     */
    fun drawFinal(
        p: Pipeline, look: FilmLook, fx: FrameFx,
        targetW: Int, targetH: Int, targetRot: Int, frameRot: Int,
    ) {
        GLES30.glViewport(0, 0, targetW, targetH)
        val s = look.stock
        with(final) {
            use()
            bindTex(0, p.current); set1i("uImage", 0)
            bindTex(1, p.glowTight); set1i("uGlowTight", 1)
            bindTex(2, p.glowWide); set1i("uGlowWide", 2)
            bindTex(3, stampTex); set1i("uStamp", 3)
            setMat4("uTexMatrix", identity)

            set2f("uTargetSize", targetW.toFloat(), targetH.toFloat())
            set1i("uTargetRot", targetRot)
            set1i("uFrameRot", frameRot)
            set2f("uImageTexel", 1f / p.width, 1f / p.height)

            set1f("uTemp", s.temperature + look.warmth * 0.6f)
            set1f("uTint", s.tint)
            set1f("uSat", s.saturation)
            set1f("uContrast", s.contrast)
            set1f("uFade", (s.fade + look.fade * 0.18f).coerceAtMost(0.35f))
            set1f("uRolloff", s.highlightRolloff)
            set3f("uShadowTint", s.shadowTint.r, s.shadowTint.g, s.shadowTint.b)
            set3f("uHighTint", s.highlightTint.r, s.highlightTint.g, s.highlightTint.b)
            setMat3RowMajor("uMixer", s.mixer)
            set1f("uMono", if (s.monochrome) 1f else 0f)
            set3f("uHalColor", s.halationColor.r, s.halationColor.g, s.halationColor.b)
            set1f("uColorGrain", s.colorGrain)

            set1f("uHalation", look.halation)
            set1f("uHalThreshold", halationThreshold(look))
            set1f("uBloom", look.bloom)
            set1f("uGrain", look.grain)
            set1f("uGrainSize", look.grainSize.coerceIn(0.5f, 4f))
            set1f("uLeak", look.lightLeak)
            set1f("uVignette", look.vignette)
            set1f("uDust", look.dust)
            set1f("uAberration", look.aberration)
            set1f("uSoftness", look.softness)
            set1f("uGain", fx.gain)
            set1i("uBorder", look.frame.shaderId)
            set1f("uStampOn", if (look.dateStamp) 1f else 0f)
            set1f("uStampAspect", DateStamp.WIDTH.toFloat() / DateStamp.HEIGHT)

            set1ui("uSeed", fx.seed)
            set1f("uTime", fx.time)
            set2fv("uLeakPos", fx.leakPos)
            set1fv("uLeakRadius", fx.leakRadius)
            set3fv("uLeakColor", fx.leakColor)
            set1i("uBurnEdge", fx.burnEdge)
            set1f("uBurnStrength", fx.burnStrength)
            set1f("uBurnPhase", fx.burnPhase)
            set2f("uScratchX", fx.scratchX[0], fx.scratchX[1])
            set1f("uScratchAlpha", fx.scratchAlpha)
        }
        draw()
    }

    /** Uploads a bitmap as a 2D texture. */
    fun uploadBitmap(bitmap: Bitmap): Int {
        val t = IntArray(1)
        GLES30.glGenTextures(1, t, 0)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, t[0])
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_LINEAR)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_LINEAR)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_S, GLES30.GL_CLAMP_TO_EDGE)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_T, GLES30.GL_CLAMP_TO_EDGE)
        GLUtils.texImage2D(GLES30.GL_TEXTURE_2D, 0, bitmap, 0)
        return t[0]
    }

    /** Linear-light level where highlights start to glow; more halation lowers it. */
    fun halationThreshold(look: FilmLook) = 0.62f - 0.2f * look.halation

    fun release() {
        listOf(developOes, develop2d, trail, bright, blur, final).forEach { it.release() }
        GLES30.glDeleteBuffers(1, intArrayOf(vbo), 0)
        GLES30.glDeleteVertexArrays(1, intArrayOf(vao), 0)
        if (stampTex != 0) GlUtil.deleteTextures(stampTex)
    }
}

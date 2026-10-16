package app.filmcam.gl

import android.graphics.Bitmap
import android.opengl.GLES11Ext
import android.opengl.GLES30
import android.opengl.GLUtils
import app.filmcam.film.CamcorderOsd
import app.filmcam.film.DateStamp
import app.filmcam.film.EdgePrint
import app.filmcam.film.FilmLook
import app.filmcam.film.FrameFx
import app.filmcam.film.StampStyle
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.log2
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** The small buffers of highlights: tight glow (halation), wide glow (bloom) and streaks. */
class Glow(imageW: Int, imageH: Int, format: Int) {
    val w: Int
    val h: Int
    init {
        val scale = minOf(480f / max(imageW, imageH), 0.5f)
        w = max(8, (imageW * scale).roundToInt())
        h = max(8, (imageH * scale).roundToInt())
    }
    val tight = GlUtil.createTexture(w, h, format)
    val wide = GlUtil.createTexture(w, h, format)
    val tmp = GlUtil.createTexture(w, h, format)
    val streak = GlUtil.createTexture(w, h, format)
    val diffuse = GlUtil.createTexture(w, h, format)
    val tightFbo = GlUtil.createFramebuffer(tight)
    val wideFbo = GlUtil.createFramebuffer(wide)
    val tmpFbo = GlUtil.createFramebuffer(tmp)
    val streakFbo = GlUtil.createFramebuffer(streak)
    val diffuseFbo = GlUtil.createFramebuffer(diffuse)

    fun release() {
        GlUtil.deleteFramebuffers(tightFbo, wideFbo, tmpFbo, streakFbo, diffuseFbo)
        GlUtil.deleteTextures(tight, wide, tmp, streak, diffuse)
    }
}

/**
 * The working frame for live video: the developed image, a second one only when something
 * needs the previous frame (slow shutter, interlace), the raw camera frame only in photo mode
 * (for the motion trail of stills), and the glow buffers. At 8K every full-size texture is
 * ~130 MB, so nothing is allocated until it is needed.
 */
class Pipeline(val width: Int, val height: Int, private val withRaw: Boolean, glowFormat: Int) {
    private val accum = intArrayOf(GlUtil.createTexture(width, height, GLES30.GL_RGBA8, mipmapped = true), 0)
    val raw = if (withRaw) GlUtil.createTexture(width, height, GLES30.GL_RGBA8) else 0
    private val fbo = intArrayOf(fboFor(accum[0]), 0)
    private var count = 1
    private var cur = 0
    val glow = Glow(width, height, glowFormat)

    /** Motion trail snapshot taken when the shutter is pressed. */
    var trailTex = 0
        private set
    private var trailFbo = 0

    private fun fboFor(tex: Int) = if (withRaw) GlUtil.createFramebuffer(tex, raw) else GlUtil.createFramebuffer(tex)

    val current get() = accum[cur]
    val previous get() = accum[(cur + count - 1) % count]
    val currentFbo get() = fbo[cur]

    /** Makes sure a previous frame is kept from now on. */
    fun keepPrevious() {
        if (count == 2) return
        accum[1] = GlUtil.createTexture(width, height, GLES30.GL_RGBA8, mipmapped = true)
        fbo[1] = fboFor(accum[1])
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, fbo[1])
        GLES30.glClearColor(0f, 0f, 0f, 1f)
        GLES30.glClear(GLES30.GL_COLOR_BUFFER_BIT)
        count = 2
    }

    fun advance() { cur = (cur + 1) % count }

    fun trailFramebuffer(): Int {
        if (trailFbo == 0) {
            trailTex = GlUtil.createTexture(width, height, GLES30.GL_RGBA8)
            trailFbo = GlUtil.createFramebuffer(trailTex)
        }
        return trailFbo
    }

    fun clear() {
        for (i in 0 until count) {
            GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, fbo[i])
            GLES30.glClearColor(0f, 0f, 0f, 1f)
            GLES30.glClear(GLES30.GL_COLOR_BUFFER_BIT)
        }
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)
    }

    fun release() {
        for (i in 0 until count) { GlUtil.deleteFramebuffers(fbo[i]); GlUtil.deleteTextures(accum[i]) }
        if (raw != 0) GlUtil.deleteTextures(raw)
        if (trailFbo != 0) { GlUtil.deleteFramebuffers(trailFbo); GlUtil.deleteTextures(trailTex) }
        glow.release()
    }
}

/** What the final pass reads: an image (with its mip chain), the frame before it, and glows. */
class FinalSource(
    val image: Int,
    val previous: Int,
    /** Size of the image as it appears in screen space (after [imageMatrix]). */
    val width: Int,
    val height: Int,
    /** Screen uv -> image texture uv. Identity for the live frame. */
    val imageMatrix: FloatArray,
    val glow: Glow,
)

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
    private var osdTex = 0
    private var osdKey = ""
    private val edgeTex: Int
    private var textTex = 0
    private var textW = 0
    private var textH = 0
    private var hasText = false
    val identity = FloatArray(16).also { android.opengl.Matrix.setIdentityM(it, 0) }
    /** 2^stops of underexposure that log footage gives back. */
    var logGain = 1f

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
        edgeTex = textureFrom(EdgePrint.render(), repeat = true)
        updateOverlays(StampStyle.DATE, recording = false)
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

    private fun textureFrom(bmp: Bitmap, repeat: Boolean = false, into: Int = 0): Int {
        val tex = if (into != 0) into else IntArray(1).also { GLES30.glGenTextures(1, it, 0) }[0]
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, tex)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_LINEAR)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_LINEAR)
        val wrap = if (repeat) GLES30.GL_REPEAT else GLES30.GL_CLAMP_TO_EDGE
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_S, wrap)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_T, GLES30.GL_CLAMP_TO_EDGE)
        GLUtils.texImage2D(GLES30.GL_TEXTURE_2D, 0, bmp, 0)
        bmp.recycle()
        return tex
    }

    /** Text overlays as a premultiplied bitmap in frame orientation; null clears them. */
    fun setText(bmp: Bitmap?) {
        if (bmp == null) { hasText = false; return }
        if (textTex == 0) textTex = IntArray(1).also { GLES30.glGenTextures(1, it, 0) }[0]
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, textTex)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_LINEAR)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_LINEAR)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_S, GLES30.GL_CLAMP_TO_EDGE)
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_T, GLES30.GL_CLAMP_TO_EDGE)
        if (bmp.width == textW && bmp.height == textH) GLUtils.texSubImage2D(GLES30.GL_TEXTURE_2D, 0, 0, 0, bmp)
        else GLUtils.texImage2D(GLES30.GL_TEXTURE_2D, 0, bmp, 0)
        textW = bmp.width
        textH = bmp.height
        hasText = true
    }

    /** Keeps the date stamp and the camcorder display current (date, clock, REC light). */
    fun updateOverlays(style: StampStyle, recording: Boolean) {
        when (style) {
            StampStyle.DATE, StampStyle.DATE_98 -> {
                val text = if (style == StampStyle.DATE) DateStamp.text() else DateStamp.text98()
                if (text != stampText || stampTex == 0) {
                    stampText = text
                    stampTex = textureFrom(DateStamp.render(text), into = stampTex)
                }
            }
            StampStyle.CAMCORDER -> {
                val time = CamcorderOsd.timeText()
                val key = "$recording $time"
                if (key != osdKey || osdTex == 0) {
                    osdKey = key
                    osdTex = textureFrom(CamcorderOsd.render(recording, time), into = osdTex)
                }
            }
            StampStyle.NONE -> Unit
        }
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
        // With a single buffer "previous" is the frame being written; never read it.
        developOes.set1f("uPersistence", if (p.previous != p.current) persistence else 0f)
        developOes.set1f("uTrailAmount", 0f)
        draw()
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)
        bindTex(0, p.current)
        GLES30.glGenerateMipmap(GLES30.GL_TEXTURE_2D)
    }

    /** Pass 1 for a 2D image (an imported photo shown live): no trail, no previous frame. */
    fun developTexture(p: Pipeline, tex: Int, texMatrix: FloatArray) {
        p.advance()
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, p.currentFbo)
        GLES30.glViewport(0, 0, p.width, p.height)
        develop2d.use()
        bindTex(0, tex)
        bindTex(1, tex)
        bindTex(2, tex)
        develop2d.set1i("uSource", 0)
        develop2d.set1i("uPrev", 1)
        develop2d.set1i("uTrail", 2)
        develop2d.setMat4("uTexMatrix", texMatrix)
        develop2d.setMat4("uTrailMatrix", identity)
        develop2d.set1f("uPersistence", 0f)
        develop2d.set1f("uTrailAmount", 0f)
        draw()
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)
        bindTex(0, p.current)
        GLES30.glGenerateMipmap(GLES30.GL_TEXTURE_2D)
    }

    /** Pass 1 for a still that needs the live motion trail added (slow shutters only). */
    fun developStillWithTrail(
        targetFbo: Int, w: Int, h: Int, tex: Int, texMatrix: FloatArray,
        trailTex: Int, trailMatrix: FloatArray,
    ) {
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, targetFbo)
        GLES30.glViewport(0, 0, w, h)
        develop2d.use()
        bindTex(0, tex)
        bindTex(1, tex)
        bindTex(2, trailTex)
        develop2d.set1i("uSource", 0)
        develop2d.set1i("uPrev", 1)
        develop2d.set1i("uTrail", 2)
        develop2d.setMat4("uTexMatrix", texMatrix)
        develop2d.setMat4("uTrailMatrix", trailMatrix)
        develop2d.set1f("uPersistence", 0f)
        develop2d.set1f("uTrailAmount", 1f)
        draw()
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)
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

    /**
     * Passes 2 and 3: highlights, then a tight and a wide blur of them, and streaks that run
     * horizontally in the upright frame ([frameTurns] says which way that is on screen).
     */
    fun glow(src: FinalSource, look: FilmLook, frameTurns: Int) {
        val g = src.glow
        GLES30.glViewport(0, 0, g.w, g.h)
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, g.tightFbo)
        bright.use()
        bindTex(0, src.image)
        bright.set1i("uSrc", 0)
        bright.setMat4("uTexMatrix", src.imageMatrix)
        bright.set1f("uLod", max(0f, log2(max(src.width, src.height).toFloat() / max(g.w, g.h))))
        bright.set1f("uThreshold", halationThreshold(look))
        draw()

        blur.use()
        blur.set1i("uSrc", 0)
        blur.setMat4("uTexMatrix", identity)
        val sx = 1f / g.w
        val sy = 1f / g.h
        fun pass(from: Int, toFbo: Int, stepX: Float, stepY: Float) {
            GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, toFbo)
            bindTex(0, from)
            blur.set2f("uStep", stepX, stepY)
            draw()
        }
        val size = 0.6f + look.halationSize * 1.6f
        // Tight: halation hugs the highlight.
        pass(g.tight, g.tmpFbo, sx * 1.6f * size, 0f)
        pass(g.tmp, g.tightFbo, 0f, sy * 1.6f * size)
        // Wide: bloom spreads further.
        pass(g.tight, g.tmpFbo, sx * 2.4f, 0f)
        pass(g.tmp, g.wideFbo, 0f, sy * 2.4f)
        pass(g.wide, g.tmpFbo, sx * 4.5f, 0f)
        pass(g.tmp, g.wideFbo, 0f, sy * 4.5f)
        if (look.streak > 0f) {
            // Anamorphic streak: only the hottest points, smeared one way in ever longer steps.
            bright.use()
            GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, g.streakFbo)
            bindTex(0, src.image)
            bright.set1f("uThreshold", STREAK_THRESHOLD)
            draw()
            blur.use()
            val horizontal = frameTurns % 2 == 0
            var from = g.streak
            for ((i, step) in floatArrayOf(2f, 6f, 16f, 40f).withIndex()) {
                val to = if (i % 2 == 0) g.tmpFbo else g.streakFbo
                pass(from, to, if (horizontal) sx * step else 0f, if (horizontal) 0f else sy * step)
                from = if (i % 2 == 0) g.tmp else g.streak
            }
        }
        if (look.diffusion > 0f) {
            // Diffusion: the whole picture (threshold below black), blurred wide.
            bright.use()
            GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, g.diffuseFbo)
            bindTex(0, src.image)
            bright.set1f("uThreshold", -0.31f)
            draw()
            blur.use()
            pass(g.diffuse, g.tmpFbo, sx * 3f, 0f)
            pass(g.tmp, g.diffuseFbo, 0f, sy * 3f)
            pass(g.diffuse, g.tmpFbo, sx * 7f, 0f)
            pass(g.tmp, g.diffuseFbo, 0f, sy * 7f)
        }
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)
    }

    /**
     * Pass 4 into whatever framebuffer is bound. [targetRot] turns the target into screen
     * space (1 for the landscape encoder buffer), [frameRot] turns screen space upright.
     * For tiles, [fullW]x[fullH] is the whole output and ([tileX], [tileY]) where this tile
     * (the bound framebuffer, [targetW]x[targetH]) sits in it, from the bottom left.
     */
    fun drawFinal(
        src: FinalSource, look: FilmLook, fx: FrameFx,
        targetW: Int, targetH: Int, targetRot: Int, frameRot: Int,
        fullW: Int = targetW, fullH: Int = targetH, tileX: Int = 0, tileY: Int = 0,
        withText: Boolean = true,
        logMode: Int = 0,
    ) {
        GLES30.glViewport(0, 0, targetW, targetH)
        val s = look.stock
        with(final) {
            use()
            bindTex(0, src.image); set1i("uImage", 0)
            bindTex(1, src.previous); set1i("uPrevImage", 1)
            bindTex(2, src.glow.tight); set1i("uGlowTight", 2)
            bindTex(3, src.glow.wide); set1i("uGlowWide", 3)
            bindTex(4, src.glow.streak); set1i("uStreakTex", 4)
            bindTex(5, stampTex); set1i("uStamp", 5)
            bindTex(6, if (osdTex != 0) osdTex else stampTex); set1i("uOsd", 6)
            bindTex(7, edgeTex); set1i("uEdge", 7)
            bindTex(8, src.glow.diffuse); set1i("uDiffuseTex", 8)
            bindTex(9, if (textTex != 0) textTex else edgeTex); set1i("uTextTex", 9)
            set1f("uTextOn", if (withText && hasText && textTex != 0) 1f else 0f)
            setMat4("uTexMatrix", identity)
            setMat4("uImageMatrix", src.imageMatrix)

            set2f("uTargetSize", fullW.toFloat(), fullH.toFloat())
            set2f("uTileOffset", tileX.toFloat(), tileY.toFloat())
            set1i("uTargetRot", targetRot)
            set1i("uFrameRot", frameRot)
            val (iw, ih) = if (targetRot % 2 == 0) fullW to fullH else fullH to fullW
            set2f("uImageTexel", 1f / src.width, 1f / src.height)
            set1f("uBaseLod", max(0f, log2(min(src.width, src.height).toFloat() / min(iw, ih))))
            set1f("uRefScale", max(1f, min(iw, ih) / 1080f))

            set1f("uTemp", s.temperature + look.warmth * 0.6f)
            set1f("uTint", s.tint)
            set1f("uSat", s.saturation)
            set1f("uSatShadow", s.satShadows)
            set1f("uSatHigh", s.satHighlights)
            set1f("uContrast", s.contrast)
            set1f("uFade", (s.fade + look.fade * 0.18f).coerceAtMost(0.35f))
            set1f("uRolloff", s.highlightRolloff)
            set1f("uBleach", s.bleach)
            set3f("uGamma", s.gamma.r, s.gamma.g, s.gamma.b)
            set3f("uHueShift", s.hueShift.r, s.hueShift.g, s.hueShift.b)
            set3f("uShadowTint", s.shadowTint.r, s.shadowTint.g, s.shadowTint.b)
            set3f("uHighTint", s.highlightTint.r, s.highlightTint.g, s.highlightTint.b)
            setMat3RowMajor("uMixer", s.mixer)
            set1f("uMono", if (s.monochrome) 1f else 0f)
            set3f("uHalColor", s.halationColor.r, s.halationColor.g, s.halationColor.b)
            set1f("uColorGrain", s.colorGrain)

            set1f("uHalation", look.halation)
            set1f("uHalThreshold", halationThreshold(look))
            set1f("uBloom", look.bloom)
            set1f("uStreak", look.streak)
            set1f("uGrain", look.grain)
            set1f("uGrainSize", look.grainSize.coerceIn(0.5f, 4f))
            set1f("uLeak", look.lightLeak)
            set1f("uPrism", look.prism)
            set1f("uVignette", look.vignette)
            set1f("uDust", look.dust)
            set1f("uAberration", look.aberration)
            set1f("uSoftness", look.softness)
            set1f("uCornerBlur", look.cornerBlur)
            set1f("uDistortion", look.distortion)
            set1f("uCircle", if (look.circleMask) 1f else 0f)
            set1f("uAnaglyph", look.anaglyph)
            set1f("uFlash", look.flash)
            set1f("uVhs", look.vhs)
            set1f("uInterlace", if (src.previous != src.image) look.interlace else 0f)
            set1f("uLowRes", look.lowRes)
            set1f("uDiffusion", look.diffusion)
            set1i("uBlurMode", look.blurMode.shaderId)
            set1f("uBlur", look.blur)
            val a = Math.toRadians(look.blurAngle.toDouble())
            set2f("uBlurDir", kotlin.math.cos(a).toFloat(), kotlin.math.sin(a).toFloat())
            set1f("uBlurFocus", look.blurFocus)
            set3f("uGain", fx.gain[0], fx.gain[1], fx.gain[2])
            set1i("uBorder", look.frame.shaderId)
            set1i("uStampStyle", look.stamp.shaderId)
            set1f("uStampAspect", DateStamp.WIDTH.toFloat() / DateStamp.HEIGHT)

            set1ui("uSeed", fx.seed)
            set1f("uTime", fx.time)
            set1f("uSlip", fx.slip)
            set2fv("uLeakPos", fx.leakPos)
            set1fv("uLeakRadius", fx.leakRadius)
            set3fv("uLeakColor", fx.leakColor)
            set1i("uBurnEdge", fx.burnEdge)
            set1f("uBurnStrength", fx.burnStrength)
            set1f("uBurnPhase", fx.burnPhase)
            set2f("uScratchX", fx.scratchX[0], fx.scratchX[1])
            set1f("uScratchAlpha", fx.scratchAlpha)
            GLES30.glUniform4f(loc("uPrismBand"), fx.prismBand[0], fx.prismBand[1], fx.prismBand[2], fx.prismBand[3])
            set2f("uPrismGhost", fx.prismGhost[0], fx.prismGhost[1])
            set1f("uTracking", fx.tracking)
            set1f("uRollBurn", fx.rollBurn)
            val st = look.style
            set1f("uStyleOn", if (st.isIdentity) 0f else 1f)
            val ps = st.style
            GLES30.glUniform4f(loc("uStyleA"), ps.warm, ps.tint, ps.sat, ps.contrast)
            GLES30.glUniform4f(loc("uStyleB"), ps.tone, ps.bright, ps.fade, ps.mono)
            set3f("uStyleShadow", ps.shadowTint.r, ps.shadowTint.g, ps.shadowTint.b)
            set3f("uStyleHigh", ps.highTint.r, ps.highTint.g, ps.highTint.b)
            GLES30.glUniform4f(loc("uStyleUser"), st.tone, st.color, st.palette, ps.skin)
            set1i("uLogMode", logMode)
            set1f("uLogGain", logGain)
        }
        draw()
    }

    /** Uploads a bitmap into an immutable, mip-mapped texture (the still's full image). */
    fun uploadMipmapped(bitmap: Bitmap): Int {
        val tex = GlUtil.createTexture(bitmap.width, bitmap.height, GLES30.GL_RGBA8, mipmapped = true)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, tex)
        GLUtils.texSubImage2D(GLES30.GL_TEXTURE_2D, 0, 0, 0, bitmap)
        GLES30.glGenerateMipmap(GLES30.GL_TEXTURE_2D)
        return tex
    }

    companion object {
        /** Only near-white light makes an anamorphic streak. */
        const val STREAK_THRESHOLD = 0.8f
    }

    /** Linear-light level where highlights start to glow; more halation lowers it. */
    fun halationThreshold(look: FilmLook) = 0.62f - 0.2f * look.halation

    fun release() {
        listOf(developOes, develop2d, trail, bright, blur, final).forEach { it.release() }
        GLES30.glDeleteBuffers(1, intArrayOf(vbo), 0)
        GLES30.glDeleteVertexArrays(1, intArrayOf(vao), 0)
        GlUtil.deleteTextures(*listOf(stampTex, osdTex, edgeTex, textTex).filter { it != 0 }.toIntArray())
    }
}

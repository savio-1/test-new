import Foundation
import OpenGLES
import CoreGraphics
import ImageIO

/// Highlights at ~480 px: tight glow (halation), wide glow (bloom), streaks, diffusion.
final class Glow {
    let w: Int, h: Int
    let tight, wide, tmp, streak, diffuse, mask, clarity: GLuint
    let tightFbo, wideFbo, tmpFbo, streakFbo, diffuseFbo, maskFbo, clarityFbo: GLuint

    init(_ imageW: Int, _ imageH: Int, format: Int32) {
        let scale = min(480 / Float(max(imageW, imageH)), 0.5)
        w = max(8, Int((Float(imageW) * scale).rounded()))
        h = max(8, Int((Float(imageH) * scale).rounded()))
        tight = GLU.texture(w, h, format: format); wide = GLU.texture(w, h, format: format)
        tmp = GLU.texture(w, h, format: format); streak = GLU.texture(w, h, format: format)
        diffuse = GLU.texture(w, h, format: format)
        mask = GLU.texture(w, h, format: format); clarity = GLU.texture(w, h, format: format)
        tightFbo = GLU.framebuffer(tight); wideFbo = GLU.framebuffer(wide); tmpFbo = GLU.framebuffer(tmp)
        streakFbo = GLU.framebuffer(streak); diffuseFbo = GLU.framebuffer(diffuse)
        maskFbo = GLU.framebuffer(mask); clarityFbo = GLU.framebuffer(clarity)
    }

    func release() {
        GLU.delete(framebuffers: [tightFbo, wideFbo, tmpFbo, streakFbo, diffuseFbo, maskFbo, clarityFbo])
        GLU.delete(textures: [tight, wide, tmp, streak, diffuse, mask, clarity])
    }
}

/// The live working frame: the developed image (and the one before, for slow shutters).
final class Pipeline {
    let width: Int, height: Int
    private var accum: [GLuint]
    private var fbo: [GLuint]
    private var cur = 0
    let glow: Glow

    init(_ w: Int, _ h: Int, glowFormat: Int32) {
        width = w; height = h
        let t = GLU.texture(w, h, mipmapped: true)
        accum = [t]
        fbo = [GLU.framebuffer(t)]
        glow = Glow(w, h, format: glowFormat)
        for f in fbo { glBindFramebuffer(E(GL_FRAMEBUFFER), f); glClearColor(0, 0, 0, 1); glClear(E(GL_COLOR_BUFFER_BIT)) }
    }

    var current: GLuint { accum[cur] }
    var previous: GLuint { accum[(cur + accum.count - 1) % accum.count] }
    var currentFbo: GLuint { fbo[cur] }

    func keepPrevious() {
        if accum.count == 2 { return }
        let t = GLU.texture(width, height, mipmapped: true)
        accum.append(t)
        fbo.append(GLU.framebuffer(t))
        glBindFramebuffer(E(GL_FRAMEBUFFER), fbo[1]); glClearColor(0, 0, 0, 1); glClear(E(GL_COLOR_BUFFER_BIT))
    }

    func advance() { cur = (cur + 1) % accum.count }

    func release() {
        GLU.delete(framebuffers: fbo)
        GLU.delete(textures: accum)
        glow.release()
    }
}

struct FinalSource {
    var image: GLuint
    var previous: GLuint
    var width: Int
    var height: Int
    var imageMatrix: [Float]
    var glow: Glow
}

/// Runs the passes (see FilmRenderer.kt; the GLSL is shared with Android).
final class Renderer {
    private let developProg: Program
    private let bright: Program
    private let blur: Program
    private let gauss: Program
    private let finalProg: Program
    let glowFormat: Int32
    private var vao: GLuint = 0
    private var vbo: GLuint = 0
    private var stampTex: GLuint = 0
    private var stampText = ""
    private var osdTex: GLuint = 0
    private var osdKey = ""
    private var edgeTex: GLuint = 0
    private var luts: [String: GLuint] = [:]
    private var emptyLut: GLuint = 0
    /// Exposure applied on the GPU (only for pictures the camera didn't expose).
    var digitalExposure = false
    let spec = Spec.shared

    static func shader(_ name: String) -> String {
        guard let url = Bundle.main.url(forResource: name, withExtension: nil, subdirectory: "shaders"),
              let s = try? String(contentsOf: url, encoding: .utf8) else { fatalError("shader \(name) missing") }
        return s
    }

    init() throws {
        let vertex = Self.shader("vertex.vert")
        developProg = try Program(vertex: vertex, fragment: Self.shader("develop_image.frag"))
        bright = try Program(vertex: vertex, fragment: Self.shader("bright.frag"))
        blur = try Program(vertex: vertex, fragment: Self.shader("blur.frag"))
        gauss = try Program(vertex: vertex, fragment: Self.shader("gauss.frag"))
        finalProg = try Program(vertex: vertex, fragment: Self.shader("final.frag"))
        glowFormat = GLU.hasExtension("GL_EXT_color_buffer_half_float") || GLU.hasExtension("GL_EXT_color_buffer_float")
            ? GL_RGBA16F : GL_RGBA8

        let quad: [Float] = [-1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, 1, 1, 1, 1]
        glGenVertexArrays(1, &vao)
        glGenBuffers(1, &vbo)
        glBindVertexArray(vao)
        glBindBuffer(E(GL_ARRAY_BUFFER), vbo)
        quad.withUnsafeBytes { glBufferData(E(GL_ARRAY_BUFFER), quad.count * 4, $0.baseAddress, E(GL_STATIC_DRAW)) }
        glEnableVertexAttribArray(0)
        glVertexAttribPointer(0, 2, E(GL_FLOAT), GLboolean(GL_FALSE), 16, nil)
        glEnableVertexAttribArray(1)
        glVertexAttribPointer(1, 2, E(GL_FLOAT), GLboolean(GL_FALSE), 16, UnsafeRawPointer(bitPattern: 8))
        glBindVertexArray(0)
        glDisable(E(GL_DEPTH_TEST))
        glDisable(E(GL_BLEND))
        edgeTex = GLU.texture(from: Overlays.edge(), repeatS: true).tex
        updateOverlays(stamp: "DATE", recording: false)
    }

    private func draw() {
        glBindVertexArray(vao)
        glDrawArrays(E(GL_TRIANGLE_STRIP), 0, 4)
        glBindVertexArray(0)
    }

    private func bind(_ unit: Int32, _ tex: GLuint, _ target: Int32 = GL_TEXTURE_2D) {
        glActiveTexture(E(GL_TEXTURE0 + unit))
        glBindTexture(E(target), tex)
    }

    /// Keeps the date stamp and the camcorder display current.
    func updateOverlays(stamp: String, recording: Bool) {
        if stamp == "DATE" || stamp == "DATE_98" {
            let text = Overlays.dateText(year98: stamp == "DATE_98")
            if text != stampText || stampTex == 0 {
                stampText = text
                GLU.delete(textures: [stampTex])
                stampTex = GLU.texture(from: Overlays.stamp(text)).tex
            }
        } else if stamp == "CAMCORDER" {
            let time = Overlays.osdTime()
            let key = "\(recording) \(time)"
            if key != osdKey || osdTex == 0 {
                osdKey = key
                GLU.delete(textures: [osdTex])
                osdTex = GLU.texture(from: Overlays.osd(recording: recording, time: time)).tex
            }
        }
    }

    /// The stock's LUT as a 3D texture (33^3 strip: x = b*33 + r, y = g), 0 if it has none.
    private func lut(for id: String) -> GLuint {
        if let t = luts[id] { return t }
        var tex: GLuint = 0
        if let url = Bundle.main.url(forResource: id, withExtension: "png", subdirectory: "luts"),
           let src = CGImageSourceCreateWithURL(url as CFURL, nil),
           let img = CGImageSourceCreateImageAtIndex(src, 0, nil) {
            let n = img.height
            if img.width == n * n {
                let px = GLU.rgba(img).data
                var buf = [UInt8](repeating: 255, count: n * n * n * 4)
                for b in 0..<n { for g in 0..<n { for r in 0..<n {
                    let s = (g * n * n + b * n + r) * 4, d = ((b * n + g) * n + r) * 4
                    buf[d] = px[s]; buf[d + 1] = px[s + 1]; buf[d + 2] = px[s + 2]
                } } }
                glGenTextures(1, &tex)
                glBindTexture(E(GL_TEXTURE_3D), tex)
                glTexParameteri(E(GL_TEXTURE_3D), E(GL_TEXTURE_MIN_FILTER), GL_LINEAR)
                glTexParameteri(E(GL_TEXTURE_3D), E(GL_TEXTURE_MAG_FILTER), GL_LINEAR)
                for w in [GL_TEXTURE_WRAP_S, GL_TEXTURE_WRAP_T, GL_TEXTURE_WRAP_R] {
                    glTexParameteri(E(GL_TEXTURE_3D), E(w), GL_CLAMP_TO_EDGE)
                }
                buf.withUnsafeBytes {
                    glTexImage3D(E(GL_TEXTURE_3D), 0, GL_RGBA8, GLsizei(n), GLsizei(n), GLsizei(n), 0, E(GL_RGBA), E(GL_UNSIGNED_BYTE), $0.baseAddress)
                }
            }
        }
        luts[id] = tex
        return tex
    }

    /// Pass 1: a source texture (camera frame or still) into the working frame.
    func develop(_ p: Pipeline, source: GLuint, texMatrix: [Float], persistence: Float) {
        p.advance()
        glBindFramebuffer(E(GL_FRAMEBUFFER), p.currentFbo)
        glViewport(0, 0, GLsizei(p.width), GLsizei(p.height))
        developProg.use()
        bind(0, source); bind(1, p.previous); bind(2, p.previous)
        developProg.i("uSource", 0); developProg.i("uPrev", 1); developProg.i("uTrail", 2)
        developProg.mat4("uTexMatrix", texMatrix)
        developProg.mat4("uTrailMatrix", Mat.identity)
        developProg.f("uPersistence", p.previous != p.current ? persistence : 0)
        developProg.f("uTrailAmount", 0)
        draw()
        glBindFramebuffer(E(GL_FRAMEBUFFER), 0)
        bind(0, p.current)
        glGenerateMipmap(E(GL_TEXTURE_2D))
    }

    func halationThreshold(_ look: Look) -> Float { 0.62 - 0.2 * look.halation }

    /// Passes 2 and 3: highlights, then the tight, wide, streak and diffusion glows.
    func glow(_ src: FinalSource, _ look: Look, frameTurns: Int) {
        let g = src.glow
        glViewport(0, 0, GLsizei(g.w), GLsizei(g.h))
        if look.studio { studioGlow(src, look); return }
        glBindFramebuffer(E(GL_FRAMEBUFFER), g.tightFbo)
        bright.use()
        bind(0, src.image)
        bright.i("uSrc", 0)
        bright.i("uMode", 0)
        bind(10, lutTexture(look.stock), GL_TEXTURE_3D); bright.i("uLut", 10)
        bright.mat4("uTexMatrix", src.imageMatrix)
        bright.f("uLod", max(0, log2(Float(max(src.width, src.height)) / Float(max(g.w, g.h)))))
        bright.f("uThreshold", halationThreshold(look))
        draw()

        blur.use()
        blur.i("uSrc", 0)
        blur.mat4("uTexMatrix", Mat.identity)
        let sx = 1 / Float(g.w), sy = 1 / Float(g.h)
        func pass(_ from: GLuint, _ to: GLuint, _ x: Float, _ y: Float) {
            glBindFramebuffer(E(GL_FRAMEBUFFER), to)
            bind(0, from)
            blur.f2("uStep", x, y)
            draw()
        }
        let size = 0.6 + look.halationSize * 1.6
        pass(g.tight, g.tmpFbo, sx * 1.6 * size, 0); pass(g.tmp, g.tightFbo, 0, sy * 1.6 * size)
        pass(g.tight, g.tmpFbo, sx * 2.4, 0); pass(g.tmp, g.wideFbo, 0, sy * 2.4)
        pass(g.wide, g.tmpFbo, sx * 4.5, 0); pass(g.tmp, g.wideFbo, 0, sy * 4.5)
        if look.streak > 0 {
            bright.use()
            glBindFramebuffer(E(GL_FRAMEBUFFER), g.streakFbo)
            bind(0, src.image)
            bright.f("uThreshold", 0.8)
            draw()
            blur.use()
            let horizontal = frameTurns % 2 == 0
            var from = g.streak
            for (i, step) in [Float(2), 6, 16, 40].enumerated() {
                let to = i % 2 == 0 ? g.tmpFbo : g.streakFbo
                pass(from, to, horizontal ? sx * step : 0, horizontal ? 0 : sy * step)
                from = i % 2 == 0 ? g.tmp : g.streak
            }
        }
        if look.diffusion > 0 {
            bright.use()
            glBindFramebuffer(E(GL_FRAMEBUFFER), g.diffuseFbo)
            bind(0, src.image)
            bright.f("uThreshold", -0.31)
            draw()
            blur.use()
            pass(g.diffuse, g.tmpFbo, sx * 3, 0); pass(g.tmp, g.diffuseFbo, 0, sy * 3)
            pass(g.diffuse, g.tmpFbo, sx * 7, 0); pass(g.tmp, g.diffuseFbo, 0, sy * 7)
        }
        glBindFramebuffer(E(GL_FRAMEBUFFER), 0)
    }

    /// The stock's LUT, or a 1-texel stand-in so the 3D sampler always has a texture.
    private func lutTexture(_ id: String) -> GLuint {
        let l = lut(for: id)
        if l != 0 { return l }
        if emptyLut == 0 {
            glGenTextures(1, &emptyLut)
            glBindTexture(E(GL_TEXTURE_3D), emptyLut)
            let px: [UInt8] = [0, 0, 0, 255]
            px.withUnsafeBytes { glTexImage3D(E(GL_TEXTURE_3D), 0, GL_RGBA8, 1, 1, 1, 0, E(GL_RGBA), E(GL_UNSIGNED_BYTE), $0.baseAddress) }
        }
        return emptyLut
    }

    /// A studio look's soft blur as a share of the long side (the editor's blur 0..40 is per mille).
    private func studioSoftSigma(_ look: Look) -> Float { look.blurMode == "GAUSSIAN" ? look.blur * 0.04 : 0 }

    /// The studio looks' glows, as the editor makes them (see FilmRenderer.studioGlow).
    private func studioGlow(_ src: FinalSource, _ look: Look) {
        let g = src.glow
        let long = Float(max(g.w, g.h))
        let lut = lutTexture(look.stock)
        let halColor = spec.stock(look.stock).halationColor
        func mask(_ mode: Int32, _ threshold: Float = 0, _ col: RGB = RGB(r: 0, g: 0, b: 0)) {
            glBindFramebuffer(E(GL_FRAMEBUFFER), g.maskFbo)
            bright.use()
            bind(0, src.image); bright.i("uSrc", 0)
            bind(10, lut, GL_TEXTURE_3D); bright.i("uLut", 10)
            bright.f("uLutOn", lut != emptyLut ? 1 : 0)
            bright.f("uIntensity", min(max(look.intensity, 0), 1))
            bright.mat4("uTexMatrix", src.imageMatrix)
            bright.f("uLod", max(0, log2(Float(max(src.width, src.height)) / Float(max(g.w, g.h)))))
            bright.i("uMode", mode)
            bright.f("uThreshold", threshold)
            bright.f3("uCol", col)
            draw()
        }
        func gaussian(_ from: GLuint, _ to: GLuint, _ sigma: Float, blackEdge: Bool = true) {
            let sg = max(0.3, sigma)
            gauss.use()
            gauss.i("uBlackEdge", blackEdge ? 1 : 0)
            gauss.i("uSrc", 0)
            gauss.mat4("uTexMatrix", Mat.identity)
            gauss.f("uSigma", sg)
            gauss.i("uTaps", Int32(min(64, Int((sg * 3).rounded(.up)))))
            glBindFramebuffer(E(GL_FRAMEBUFFER), g.tmpFbo)
            bind(0, from); gauss.f2("uStep", 1 / Float(g.w), 0); draw()
            glBindFramebuffer(E(GL_FRAMEBUFFER), to)
            bind(0, g.tmp); gauss.f2("uStep", 0, 1 / Float(g.h)); draw()
        }
        if look.bloom > 0 {
            let k = min(look.bloom, 1)
            mask(1, 0.62 - 0.22 * k)
            gaussian(g.mask, g.wideFbo, long * (0.012 + 0.025 * k))
        }
        if look.halation > 0 {
            let k = min(look.halation, 1)
            mask(2, 0.72 - 0.2 * k, halColor)
            gaussian(g.mask, g.tightFbo, long * (0.003 + 0.007 * k))
            gaussian(g.mask, g.streakFbo, long * (0.012 + 0.02 * k))
        }
        let soft = studioSoftSigma(look) * long
        if look.clarity != 0 || look.tiltShift > 0 || soft >= 1 {
            mask(3)
            if look.clarity != 0 { gaussian(g.mask, g.clarityFbo, long * 0.018, blackEdge: false) }
            if look.tiltShift > 0 { gaussian(g.mask, g.diffuseFbo, long * 0.018 * look.tiltShift) }
            else if soft >= 1 { gaussian(g.mask, g.diffuseFbo, soft) }
        }
        glBindFramebuffer(E(GL_FRAMEBUFFER), 0)
    }

    /// Pass 4 into the bound framebuffer. [targetRot]: target -> screen quarter turns;
    /// [frameRot]: screen -> upright frame. Tiles: full size plus this tile's offset.
    func drawFinal(_ src: FinalSource, _ look: Look, _ fx: FrameFx, targetW: Int, targetH: Int, targetRot: Int, frameRot: Int,
                   fullW: Int? = nil, fullH: Int? = nil, tileX: Int = 0, tileY: Int = 0, still: Bool = false) {
        let fw = fullW ?? targetW, fh = fullH ?? targetH
        glViewport(0, 0, GLsizei(targetW), GLsizei(targetH))
        let s = spec.stock(look.stock)
        let p = finalProg
        p.use()
        bind(0, src.image); p.i("uImage", 0)
        bind(1, src.previous); p.i("uPrevImage", 1)
        bind(2, src.glow.tight); p.i("uGlowTight", 2)
        bind(3, src.glow.wide); p.i("uGlowWide", 3)
        bind(4, src.glow.streak); p.i("uStreakTex", 4)
        bind(5, stampTex != 0 ? stampTex : edgeTex); p.i("uStamp", 5)
        bind(6, osdTex != 0 ? osdTex : edgeTex); p.i("uOsd", 6)
        bind(7, edgeTex); p.i("uEdge", 7)
        bind(8, src.glow.diffuse); p.i("uDiffuseTex", 8)
        bind(9, edgeTex); p.i("uTextTex", 9)
        bind(13, src.glow.clarity); p.i("uClarTex", 13)
        p.f("uTextOn", 0)
        p.mat4("uTexMatrix", Mat.identity)
        p.mat4("uImageMatrix", src.imageMatrix)

        p.f2("uTargetSize", Float(fw), Float(fh))
        p.f2("uTileOffset", Float(tileX), Float(tileY))
        p.i("uTargetRot", Int32(targetRot))
        p.i("uFrameRot", Int32(frameRot))
        let (iw, ih) = targetRot % 2 == 0 ? (fw, fh) : (fh, fw)
        p.f2("uImageTexel", 1 / Float(src.width), 1 / Float(src.height))
        p.f("uBaseLod", max(0, log2(Float(min(src.width, src.height)) / Float(min(iw, ih)))))
        p.f("uRefScale", max(1, Float(min(iw, ih)) / 1080))

        p.f("uTemp", s.temperature); p.f("uTint", s.tint); p.f("uSat", s.saturation)
        p.f("uSatShadow", s.satShadows); p.f("uSatHigh", s.satHighlights); p.f("uContrast", s.contrast)
        p.f("uFade", min(s.fade + look.fade * 0.18, 0.35)); p.f("uRolloff", s.highlightRolloff); p.f("uBleach", s.bleach)
        p.f3("uGamma", s.gamma); p.f3("uHueShift", s.hueShift); p.f3("uShadowTint", s.shadowTint); p.f3("uHighTint", s.highlightTint)
        p.mat3RowMajor("uMixer", s.mixer)
        p.f("uMono", s.monochrome ? 1 : 0); p.f3("uHalColor", s.halationColor); p.f("uColorGrain", s.colorGrain)

        p.f("uHalation", look.halation); p.f("uHalThreshold", halationThreshold(look)); p.f("uBloom", look.bloom)
        p.f("uStreak", look.streak); p.f("uGrain", look.grain); p.f("uGrainSize", min(max(look.grainSize, 0.5), 4))
        p.f("uLeak", look.lightLeak); p.f("uPrism", look.prism); p.f("uVignette", look.vignette); p.f("uDust", look.dust)
        p.f("uAberration", look.aberration); p.f("uSoftness", min(max(look.softness - (look.studio ? 0 : 0.8 * look.sharpness), -1), 1))
        p.f("uCornerBlur", look.cornerBlur); p.f("uDistortion", look.distortion); p.f("uCircle", look.circleMask ? 1 : 0)
        p.f("uAnaglyph", look.anaglyph); p.f("uFlash", look.flash); p.f("uVhs", look.vhs)
        p.f("uInterlace", src.previous != src.image ? look.interlace : 0); p.f("uLowRes", look.lowRes)
        p.f("uDiffusion", look.diffusion)
        p.i("uBlurMode", Int32(spec.blurId(look.blurMode))); p.f("uBlur", look.blur)
        let a = look.blurAngle * .pi / 180
        p.f2("uBlurDir", cosf(a), sinf(a)); p.f("uBlurFocus", look.blurFocus)
        p.f3("uGain", fx.gain[0], fx.gain[1], fx.gain[2])
        p.i("uBorder", Int32(spec.frameId(look.frame))); p.i("uStampStyle", Int32(spec.stampId(look.stamp)))
        p.f("uStampAspect", Float(Overlays.stampSize.width / Overlays.stampSize.height))

        p.ui("uSeed", fx.seed); p.f("uTime", fx.time); p.f("uSlip", fx.slip)
        p.f2v("uLeakPos", fx.leakPos); p.f1v("uLeakRadius", fx.leakRadius); p.f3v("uLeakColor", fx.leakColor)
        p.i("uBurnEdge", fx.burnEdge); p.f("uBurnStrength", fx.burnStrength); p.f("uBurnPhase", fx.burnPhase)
        p.f2("uScratchX", fx.scratchX[0], fx.scratchX[1]); p.f("uScratchAlpha", fx.scratchAlpha)
        p.f4("uPrismBand", fx.prismBand[0], fx.prismBand[1], fx.prismBand[2], fx.prismBand[3])
        p.f2("uPrismGhost", fx.prismGhost[0], fx.prismGhost[1])
        p.f("uTracking", fx.tracking); p.f("uRollBurn", fx.rollBurn)

        // Photographic style (Original camera).
        let st = look.style
        let ps = spec.style(st.style)
        p.f("uStyleOn", st.isIdentity ? 0 : 1)
        p.f4("uStyleA", ps.warm, ps.tint, ps.sat, ps.contrast)
        p.f4("uStyleB", ps.tone, ps.bright, ps.fade, ps.mono)
        p.f3("uStyleShadow", ps.shadowTint); p.f3("uStyleHigh", ps.highTint)
        p.f4("uStyleUser", st.tone, st.color, st.palette, ps.skin)

        // Film stock LUT, strength and the basic adjustments.
        let l = lutTexture(s.id)
        bind(10, l, GL_TEXTURE_3D); p.i("uLut", 10)
        p.f("uLutOn", l != emptyLut ? 1 : 0)
        p.f("uIntensity", min(max(look.intensity, 0), 1))
        p.f("uExposureGain", digitalExposure ? powf(2, look.exposureEv) : 1)
        p.f4("uAdjA", look.warmth, look.tint, look.contrast, look.saturation)
        // A studio look sharpens and adds clarity the editor's way, in its own place in the order.
        p.f4("uAdjB", look.highlights, look.shadows, look.vibrance, look.studio ? 0 : look.clarity)
        p.f("uStudio", look.studio ? 1 : 0)
        p.f("uSharpen", look.studio ? look.sharpness : 0)
        p.f("uClarity", look.studio ? look.clarity : 0)
        let hk = min(max(look.halation, 0), 1)
        p.f2("uStudioGain", powf(2, 1 + (hk * 2).rounded()), powf(2, 1 + (hk * 3).rounded()))
        p.f("uStudioSoft", look.tiltShift <= 0 && studioSoftSigma(look) * Float(max(src.glow.w, src.glow.h)) >= 1 ? 1 : 0)
        p.i("uSmearCap", still ? 40 : 16)
        p.f("uNoise", look.noise)
        p.f("uHalftone", look.studio ? look.halftone : 0)
        p.f("uThreshold", look.studio ? look.threshold : 0)
        let ink = look.halftoneInk.argbFloats, paper = look.halftonePaper.argbFloats
        p.f3("uInk", ink.0, ink.1, ink.2); p.f3("uPaper", paper.0, paper.1, paper.2)
        p.f("uGhost", look.studio ? look.ghost : 0)
        p.f("uTilt", look.studio ? look.tiltShift : 0)
        p.f("uTiltY", look.tiltY); p.f("uTiltSize", look.tiltSize)
        p.i("uLogMode", 0); p.f("uLogGain", 1)
        draw()
    }

    /// Runs the final pass in tiles into an image of [w]x[h].
    func renderTiled(_ src: FinalSource, _ look: Look, _ fx: FrameFx, w: Int, h: Int) -> CGImage? {
        let tile = min(2048, GLU.maxTextureSize)
        let tex = GLU.texture(tile, tile)
        let fbo = GLU.framebuffer(tex)
        defer { GLU.delete(framebuffers: [fbo]); GLU.delete(textures: [tex]); glBindFramebuffer(E(GL_FRAMEBUFFER), 0) }
        var out = [UInt8](repeating: 0, count: w * h * 4)
        var tileBuf = [UInt8](repeating: 0, count: tile * tile * 4)
        glPixelStorei(E(GL_PACK_ALIGNMENT), 1)
        var y0 = 0
        while y0 < h {
            let th = min(tile, h - y0)
            var x0 = 0
            while x0 < w {
                let tw = min(tile, w - x0)
                glBindFramebuffer(E(GL_FRAMEBUFFER), fbo)
                drawFinal(src, look, fx, targetW: tw, targetH: th, targetRot: 0, frameRot: 0, fullW: w, fullH: h, tileX: x0, tileY: y0, still: true)
                tileBuf.withUnsafeMutableBytes { glReadPixels(0, 0, GLsizei(tw), GLsizei(th), E(GL_RGBA), E(GL_UNSIGNED_BYTE), $0.baseAddress) }
                // GL rows count from the bottom; the image's from the top.
                for row in 0..<th {
                    let srcOff = row * tw * 4
                    let dstRow = h - 1 - (y0 + row)
                    let dstOff = (dstRow * w + x0) * 4
                    out.withUnsafeMutableBytes { o in
                        tileBuf.withUnsafeBytes { t in
                            (o.baseAddress! + dstOff).copyMemory(from: t.baseAddress! + srcOff, byteCount: tw * 4)
                        }
                    }
                }
                x0 += tile
            }
            y0 += tile
        }
        let provider = CGDataProvider(data: Data(out) as CFData)!
        return CGImage(width: w, height: h, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: w * 4,
                       space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue),
                       provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent)
    }
}

import Foundation
import OpenGLES

/// Draws the text layers into the frames (see TextLayerSource; FilmEngine.updateText and the
/// subject matte on Android). Text in front and text set behind the subject go into two
/// textures, redrawn only when the layers, the frame or an animation's pose change; text
/// behind the subject gets the subject's matte, cut out by Vision off the render queue (the
/// newest finished one is used, so the viewfinder never waits), or in step for stills and
/// offline renders.
final class TextOverlay: TextLayerSource {
    private let lock = NSLock()
    private var layers: [TextLayer] = []
    private var source: ((Float) -> [TextLayer])?

    /// Cuts the subject out of the frames, for text set behind it.
    let subjects = SubjectMasker()

    /// Offline rendering (a clip developed with subtitles): when set, each frame takes its
    /// layers from here, at the frame's time in seconds, instead of [update]; the subject is
    /// then cut out of every frame in step, since the render isn't real time.
    var layersAt: ((Float) -> [TextLayer])? {
        get { lock.lock(); defer { lock.unlock() }; return source }
        set { lock.lock(); source = newValue; lock.unlock() }
    }

    /// The layers to draw from now on (main thread).
    func update(_ layers: [TextLayer]) {
        lock.lock(); self.layers = layers; lock.unlock()
    }

    // MARK: - Render queue

    private struct Key: Equatable {
        var layers: [TextLayer]
        var w: Int
        var h: Int
        var side: Int
        var frame: Int64
    }

    private struct Part {
        var tex: GLuint = 0
        var w = 0
        var h = 0
        var blend: Int32 = 0
    }

    private var key: Key?
    private var front = Part()
    private var back = Part()
    private var pixels: [UInt8] = []
    private var matte: GLuint = 0
    private var matteSize = (0, 0)
    private var matteSeq: Int64 = -1
    private var matteOn = false
    /// A still's own textures, deleted on the next call (the engine is done with them by then).
    private var stillTextures: [GLuint] = []

    func frame(_ req: TextRequest) -> TextFrame {
        GLU.delete(textures: stillTextures)
        stillTextures = []
        lock.lock()
        let offlineSource = source
        let live = layers
        lock.unlock()
        let offline = offlineSource != nil
        let all = offlineSource.map { $0(req.time) } ?? live
        let fw = max(1, req.width), fh = max(1, req.height)
        let behind = all.contains { $0.behind && !$0.text.isEmpty }

        if req.still { return still(req, all, fw, fh, behind) }

        // Exports get text as sharp as the frame; live view stays at 2K, or 1280 while text is
        // animating (it is redrawn up to 30 times a second then).
        let animated = all.contains { $0.anim != .NONE }
        let side = offline ? min(4096, max(fw, fh)) : animated ? 1280 : 2048
        let fps = all.map { $0.anim.fps }.max() ?? 0
        let frameNo: Int64 = fps > 0 && req.time >= 0 ? Int64(req.time * Float(fps)) : -1
        let k = Key(layers: all, w: fw, h: fh, side: side, frame: frameNo)
        if k != key {
            key = k
            let (tw, th) = Self.textureSize(fw, fh, side)
            let t = req.time
            draw(all.filter { !$0.behind }, into: &front, tw, th, t)
            draw(all.filter { $0.behind }, into: &back, tw, th, t)
        }

        var subject: GLuint = 0
        if behind {
            if offline {
                let (sw, sh) = Self.textureSize(fw, fh, 1024)
                if let m = subjects.process(req.readPicture(sw, sh), sw, sh, accurate: false) { upload(m) }
            } else {
                // Hand this frame to the cut-out if it is free, and use the newest matte.
                if subjects.idle {
                    let (sw, sh) = Self.textureSize(fw, fh, 512)
                    subjects.submit(req.readPicture(sw, sh), sw, sh)
                }
                if let m = subjects.latest, m.seq != matteSeq { upload(m) }
            }
            subject = matteOn ? matte : 0
        } else if matte != 0 || matteSeq != -1 {
            GLU.delete(textures: [matte])
            matte = 0
            matteSize = (0, 0)
            matteSeq = -1
            matteOn = false
            subjects.clear()
        }
        return TextFrame(front: front.tex, back: back.tex, frontBlend: front.blend, backBlend: back.blend, subject: subject)
    }

    /// A still: its layers at rest, as sharp as the picture allows, and its own matte.
    private func still(_ req: TextRequest, _ all: [TextLayer], _ fw: Int, _ fh: Int, _ behind: Bool) -> TextFrame {
        let (tw, th) = Self.textureSize(fw, fh, min(4096, max(fw, fh)))
        var f = Part(), b = Part()
        draw(all.filter { !$0.behind }, into: &f, tw, th, -1)
        draw(all.filter { $0.behind }, into: &b, tw, th, -1)
        stillTextures = [f.tex, b.tex]
        var subject: GLuint = 0
        if behind && b.tex != 0 {
            let (sw, sh) = Self.textureSize(fw, fh, 1024)
            if let m = subjects.process(req.readPicture(sw, sh), sw, sh, accurate: true), !m.empty {
                subject = Self.matteTexture(m)
                stillTextures.append(subject)
            }
        }
        return TextFrame(front: f.tex, back: b.tex, frontBlend: f.blend, backBlend: b.blend, subject: subject)
    }

    /// Redraws [part] with [layers] (or frees it when there are none).
    private func draw(_ layers: [TextLayer], into part: inout Part, _ w: Int, _ h: Int, _ t: Float) {
        if layers.isEmpty {
            GLU.delete(textures: [part.tex])
            part = Part()
            return
        }
        // Drawn plain: the shader blends it with the picture, one mode per texture (the one
        // most of its layers use; subtitles share theirs).
        TextRasterizer.render(layers, into: &pixels, width: w, height: h, time: t)
        if part.tex == 0 || part.w != w || part.h != h {
            GLU.delete(textures: [part.tex])
            part.tex = GLU.texture(w, h)
            part.w = w
            part.h = h
        }
        glBindTexture(E(GL_TEXTURE_2D), part.tex)
        pixels.withUnsafeBytes {
            glTexSubImage2D(E(GL_TEXTURE_2D), 0, 0, 0, GLsizei(w), GLsizei(h), E(GL_RGBA), E(GL_UNSIGNED_BYTE), $0.baseAddress)
        }
        part.blend = Self.mode(layers)
    }

    /// The newest matte into the live matte texture.
    private func upload(_ m: SubjectMasker.Matte) {
        matteSeq = m.seq
        matteOn = !m.empty
        guard !m.empty else { return }
        if matte == 0 || matteSize != (m.w, m.h) {
            GLU.delete(textures: [matte])
            matte = Self.matteTexture(m)
            matteSize = (m.w, m.h)
        } else {
            Self.fill(matte, m)
        }
    }

    private static func matteTexture(_ m: SubjectMasker.Matte) -> GLuint {
        let t = GLU.texture(m.w, m.h, format: GL_R8)
        fill(t, m)
        return t
    }

    private static func fill(_ tex: GLuint, _ m: SubjectMasker.Matte) {
        glBindTexture(E(GL_TEXTURE_2D), tex)
        glPixelStorei(E(GL_UNPACK_ALIGNMENT), 1)
        m.pixels.withUnsafeBytes {
            glTexSubImage2D(E(GL_TEXTURE_2D), 0, 0, 0, GLsizei(m.w), GLsizei(m.h), E(GL_RED), E(GL_UNSIGNED_BYTE), $0.baseAddress)
        }
        glPixelStorei(E(GL_UNPACK_ALIGNMENT), 4)
    }

    /// The blend most of [layers] use (the first of them on a tie).
    static func mode(_ layers: [TextLayer]) -> Int32 {
        var counts: [(TextBlend, Int)] = []
        for l in layers {
            if let i = counts.firstIndex(where: { $0.0 == l.blend }) { counts[i].1 += 1 } else { counts.append((l.blend, 1)) }
        }
        var best: (TextBlend, Int)?
        for c in counts where best == nil || c.1 > best!.1 { best = c }
        return best?.0.shaderId ?? 0
    }

    /// A [w]x[h] frame scaled down to fit [side] (never up).
    static func textureSize(_ w: Int, _ h: Int, _ side: Int) -> (Int, Int) {
        let k = min(1, Double(side) / Double(max(w, h)))
        return (max(1, Int((Double(w) * k).rounded())), max(1, Int((Double(h) * k).rounded())))
    }
}

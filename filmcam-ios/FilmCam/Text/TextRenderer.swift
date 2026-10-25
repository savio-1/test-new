import CoreGraphics
import CoreText
import Foundation

/// A layer's text laid out as a block (StaticLayout on Android): lines placed in block space,
/// origin top-left, y down. [width] is the block's (wrap) width, not the widest line.
struct TextBlock {
    struct Line {
        let line: CTLine
        /// Left edge of the line's ink-free box and its baseline, in block space.
        let x: CGFloat
        let baseline: CGFloat
        /// Width without trailing spaces.
        let width: CGFloat
    }

    var lines: [Line]
    var width: CGFloat
    var height: CGFloat
}

/// Lays out and draws text layers with CoreText (TextRenderer in TextLayer.kt). Shared by the
/// engine's text textures, the subtitle preview and the on-screen editor. Drawing goes into a
/// y-down context (origin at the top-left of the frame); it is thread-safe.
enum TextRenderer {
    /// Text size in pixels for a frame whose short side is [shortSide].
    static func textSize(_ layer: TextLayer, shortSide: CGFloat) -> CGFloat { max(1, CGFloat(layer.size) * shortSide) }

    /// The text as CoreText wants it: the layer's font, its tracking (ems, as Android's
    /// letterSpacing), and colours left to the context so one layout serves every pass.
    static func attributed(_ text: String, font: String, size: CGFloat, tracking: Float) -> CFAttributedString {
        var attrs: [NSAttributedString.Key: Any] = [
            NSAttributedString.Key(kCTFontAttributeName as String): TextFonts.font(font, size: size),
            NSAttributedString.Key(kCTForegroundColorFromContextAttributeName as String): true,
        ]
        if tracking != 0 { attrs[NSAttributedString.Key(kCTKernAttributeName as String)] = CGFloat(tracking) * size }
        return NSAttributedString(string: text, attributes: attrs) as CFAttributedString
    }

    /// Width of a line of [text] with nothing wrapped, trailing spaces left out.
    static func lineWidth(_ line: CTLine) -> CGFloat {
        let w = CGFloat(CTLineGetTypographicBounds(line, nil, nil, nil)) - CGFloat(CTLineGetTrailingWhitespaceWidth(line))
        return max(0, w)
    }

    /// Lays out [layer] (or [text] in its style) for a frame [frameW] wide, at [ts] pixels: as
    /// wide as its longest line, or wrapped at layer.wrap of the frame width, lines broken
    /// evenly (as Android's balanced breaking). [fixedWidth] forces the block's width (the
    /// typewriter lays the letters so far out in the whole text's block).
    static func layout(_ layer: TextLayer, text: String? = nil, ts: CGFloat, frameW: CGFloat, fixedWidth: CGFloat = 0) -> TextBlock {
        let raw = text ?? layer.text
        let str = raw.isEmpty ? " " : raw
        let paragraphs = TextLayoutMath.paragraphs(str)
        let font = TextFonts.font(layer.font, size: ts)
        let fontAscent = CTFontGetAscent(font), fontDescent = CTFontGetDescent(font)
        var typesetters: [CTTypesetter] = []
        var desired: CGFloat = 0
        for para in paragraphs {
            let a = attributed(para.isEmpty ? " " : para, font: layer.font, size: ts, tracking: layer.tracking)
            let typesetter = CTTypesetterCreateWithAttributedString(a)
            typesetters.append(typesetter)
            let whole = CTTypesetterCreateLine(typesetter, CFRange(location: 0, length: 0))
            desired = max(desired, CGFloat(CTLineGetTypographicBounds(whole, nil, nil, nil)))
        }
        let width = TextLayoutMath.blockWidth(desired: Double(desired), wrap: Double(layer.wrap), frameW: Double(frameW), fixed: Double(fixedWidth))
        let mult = CGFloat(min(max(layer.lineSpacing, 0.5), 3))

        // Lines of every paragraph, broken at the block width.
        var lines: [(CTLine, CGFloat, CGFloat)] = []   // line, ascent, descent
        for (i, para) in paragraphs.enumerated() {
            let typesetter = typesetters[i]
            let length = (para.isEmpty ? " " : para).utf16.count
            let ranges = TextLayoutMath.balancedBreaks(length: length, width: width) { start, w in
                CTTypesetterSuggestLineBreak(typesetter, start, w)
            }
            for r in ranges {
                let line = CTTypesetterCreateLine(typesetter, CFRange(location: r.lowerBound, length: r.count))
                var asc: CGFloat = 0, desc: CGFloat = 0
                CTLineGetTypographicBounds(line, &asc, &desc, nil)
                lines.append((line, max(asc, fontAscent), max(desc, fontDescent)))
            }
        }
        // Each line is as tall as its letters, times the spacing (none added under the last).
        var y: CGFloat = 0
        var out: [TextBlock.Line] = []
        for (i, (line, asc, desc)) in lines.enumerated() {
            let lw = lineWidth(line)
            let x: CGFloat
            switch layer.align {
            case .LEFT: x = 0
            case .CENTER: x = (CGFloat(width) - lw) / 2
            case .RIGHT: x = CGFloat(width) - lw
            }
            out.append(TextBlock.Line(line: line, x: x, baseline: y + asc, width: lw))
            let h = asc + desc
            y += i == lines.count - 1 ? h : (h * mult).rounded()
        }
        return TextBlock(lines: out, width: CGFloat(width), height: max(1, y))
    }

    /// Padding of the subtitle box around the text, in pixels.
    static func boxPad(_ ts: CGFloat) -> (CGFloat, CGFloat) { (ts * 0.35, ts * 0.16) }

    /// Size in pixels of a layer's text block in a [w]x[h] frame (box included).
    static func blockSize(_ layer: TextLayer, w: CGFloat, h: CGFloat) -> CGSize {
        let ts = textSize(layer, shortSide: min(w, h))
        let l = layout(layer, ts: ts, frameW: w)
        if !layer.box { return CGSize(width: l.width, height: l.height) }
        let (px, py) = boxPad(ts)
        return CGSize(width: l.width + 2 * px, height: l.height + 2 * py)
    }

    // MARK: - Drawing

    /// Draws [layers] into [ctx] covering a [w]x[h] frame (the context y-down, origin top-left),
    /// each posed for [t] seconds into its animation (negative: at rest, as in stills).
    static func draw(_ ctx: CGContext, _ layers: [TextLayer], w: CGFloat, h: CGFloat, t: Float = -1) {
        for layer in layers {
            if layer.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { continue }
            if layer.reveal <= 0 || layer.opacity <= 0 { continue }
            let length = layer.text.count
            let pose = layer.anim.pose(t, seed: layer.id, length: length)
            let ts = textSize(layer, shortSide: min(w, h))
            let full = layout(layer, ts: ts, frameW: w)
            // Typewriter: the letters so far, laid out in the same block as the whole text.
            let l = pose.chars < length
                ? layout(layer, text: String(layer.text.prefix(max(0, pose.chars))), ts: ts, frameW: w, fixedWidth: full.width)
                : full
            ctx.saveGState()
            ctx.translateBy(x: CGFloat(layer.x) * w + CGFloat(pose.dx) * ts, y: CGFloat(layer.y) * h + CGFloat(pose.dy) * ts)
            ctx.rotate(by: CGFloat(layer.rotation + pose.rotation) * .pi / 180)
            if pose.scale != 1 { ctx.scaleBy(x: CGFloat(pose.scale), y: CGFloat(pose.scale)) }
            ctx.translateBy(x: -full.width / 2, y: -full.height / 2)
            let pad = ts * 2
            let bounds = CGRect(x: -pad, y: -pad, width: full.width + 2 * pad, height: full.height + 2 * pad)
            // Letter by letter, or flickering: the block is drawn into a layer of its own, so
            // shadows and outlines fade with their letters.
            let revealing = layer.reveal < 1
            let alpha = CGFloat(min(max(pose.alpha, 0), 1))
            let grouped = revealing || alpha < 1
            if grouped {
                ctx.setAlpha(alpha)
                ctx.beginTransparencyLayer(in: bounds, auxiliaryInfo: nil)
            }
            drawLayer(ctx, layer, l, ts: ts, bounds: bounds)
            if revealing {
                let soft = max(full.width * 0.35, ts * 0.6)
                // The edge travels from fully left of the text to fully past it.
                let edge = -soft + CGFloat(layer.reveal) * (full.width + soft)
                let colors = [CGColor(red: 0, green: 0, blue: 0, alpha: 1), CGColor(red: 0, green: 0, blue: 0, alpha: 0)] as CFArray
                if let g = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1]) {
                    ctx.saveGState()
                    ctx.clip(to: bounds)
                    ctx.setBlendMode(.destinationIn)
                    ctx.drawLinearGradient(g, start: CGPoint(x: edge, y: 0), end: CGPoint(x: edge + soft, y: 0),
                                           options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
                    ctx.restoreGState()
                }
            }
            if grouped { ctx.endTransparencyLayer() }
            ctx.restoreGState()
        }
    }

    /// One layer in block space: its effect, its box, its outline and its letters.
    private static func drawLayer(_ ctx: CGContext, _ layer: TextLayer, _ l: TextBlock, ts: CGFloat, bounds: CGRect) {
        let op = CGFloat(min(max(layer.opacity, 0), 1))
        let fill = color(layer.color, alpha: op)
        underFx(ctx, layer, l, ts: ts, fill: layer.color, bounds: bounds)
        if layer.box, !l.lines.isEmpty {
            let (px, py) = boxPad(ts)
            // The box hugs the lines actually used, not the full wrap width.
            let left = l.lines.map { $0.x }.min()!
            let right = l.lines.map { $0.x + $0.width }.max()!
            let rect = CGRect(x: left - px, y: -py, width: right - left + 2 * px, height: l.height + 2 * py)
            let r = min(ts * 0.22, rect.width / 2, rect.height / 2)
            ctx.addPath(CGPath(roundedRect: rect, cornerWidth: r, cornerHeight: r, transform: nil))
            ctx.setFillColor(color(layer.boxColor, alpha: CGFloat(layer.boxColor.argbA) * op))
            ctx.fillPath()
        }
        // The shadow falls from the letters and their outline together.
        let a = CGFloat(min(max(layer.fxAmount, 0), 1))
        var shadow: (blur: CGFloat, dy: CGFloat, color: CGColor)?
        if layer.fx == .SHADOW {
            let c = layer.fxColor != 0 ? layer.fxColor : Int32(bitPattern: 0xFF00_0000)
            shadow = (ts * (0.05 + 0.25 * a), ts * (0.02 + 0.05 * a), color(c, alpha: (0.35 + 0.55 * a) * op))
        } else if layer.shadow {
            shadow = (ts * 0.09, ts * 0.035, CGColor(red: 0, green: 0, blue: 0, alpha: 150 / 255 * op))
        }
        if let s = shadow {
            ctx.saveGState()
            ctx.setShadow(offset: baseOffset(ctx, CGSize(width: 0, height: s.dy)), blur: blurAmount(ctx, s.blur), color: s.color)
            ctx.beginTransparencyLayer(in: bounds, auxiliaryInfo: nil)
        }
        // Soft focus on the letters themselves (kinetic captions, and a touch with Soft blur).
        var soft: CGFloat = 0
        if layer.blur > 0.002 { soft = CGFloat(layer.blur) * ts } else if layer.fx == .BLUR { soft = ts * 0.03 * a + 0.5 }
        func pass(_ mode: CGTextDrawingMode, _ c: CGColor, _ width: CGFloat) {
            if soft > 0 { blurredText(ctx, l, mode: mode, color: c, lineWidth: width, radius: soft, bounds: bounds) }
            else { drawText(ctx, l, mode: mode, color: c, lineWidth: width) }
        }
        if layer.outline != 0 {
            // The stroke first, then the letters over it: a clean edge on both sides.
            pass(.stroke, color(layer.outline, alpha: CGFloat(layer.outline.argbA) * op), ts * 0.14)
        }
        pass(.fill, fill, 0)
        if shadow != nil {
            ctx.endTransparencyLayer()
            ctx.restoreGState()
        }
    }

    /// The layer's effect, drawn under its letters with the same block [l].
    private static func underFx(_ ctx: CGContext, _ layer: TextLayer, _ l: TextBlock, ts: CGFloat, fill: Int32, bounds: CGRect) {
        let a = CGFloat(min(max(layer.fxAmount, 0), 1))
        let op = CGFloat(min(max(layer.opacity, 0), 1))
        let black = Int32(bitPattern: 0xFF00_0000)
        let fx = layer.fxColor != 0 ? layer.fxColor : black
        func tint(_ c: Int32, _ alpha: CGFloat) -> CGColor { color(c, alpha: min(max(CGFloat(c.argbA) * alpha * op, 0), 1)) }
        switch layer.fx {
        case .NONE, .SHADOW: break
        case .DROP:
            // A hard copy of the letters, down and to the right.
            let d = ts * (0.035 + 0.07 * a)
            ctx.saveGState()
            ctx.translateBy(x: d, y: d)
            drawText(ctx, l, mode: .fill, color: tint(fx, 0.55 + 0.45 * a))
            ctx.restoreGState()
        case .GLOW, .BLUR:
            let glow = layer.fx == .GLOW
            let c = glow && layer.fxColor != 0 ? layer.fxColor : (fill | black)
            let col = tint(c, glow ? 0.55 + 0.45 * a : 0.5 + 0.4 * a)
            let r = ts * (glow ? 0.08 + 0.32 * a : 0.05 + 0.2 * a)
            blurredText(ctx, l, mode: .fill, color: col, radius: r, bounds: bounds)
            if glow && a > 0.5 { blurredText(ctx, l, mode: .fill, color: col, radius: r, bounds: bounds) }
        case .OUTLINE:
            drawText(ctx, l, mode: .stroke, color: tint(fx, 1), lineWidth: ts * (0.04 + 0.14 * a))
        case .HAZE:
            // A dark cloud behind the words: fat, very soft letters.
            let col = tint(fx, 0.3 + 0.45 * a)
            blurredText(ctx, l, mode: .fillStroke, color: col, lineWidth: ts * 0.45, radius: ts * (0.45 + 0.55 * a), bounds: bounds)
        }
    }

    /// Draws the block's lines in [color]: filled, stroked (round joins) or both.
    static func drawText(_ ctx: CGContext, _ l: TextBlock, mode: CGTextDrawingMode, color: CGColor, lineWidth: CGFloat = 0) {
        ctx.saveGState()
        ctx.setTextDrawingMode(mode)
        ctx.setFillColor(color)
        ctx.setStrokeColor(color)
        ctx.setLineWidth(lineWidth)
        ctx.setLineJoin(.round)
        // The context is y-down; the text matrix turns the glyphs back upright.
        ctx.textMatrix = CGAffineTransform(scaleX: 1, y: -1)
        for ln in l.lines {
            ctx.textPosition = CGPoint(x: ln.x, y: ln.baseline)
            CTLineDraw(ln.line, ctx)
        }
        ctx.restoreGState()
    }

    /// The block's lines in [color] as [drawText] draws them, blurred by [radius] (Android's
    /// BlurMaskFilter radius) and nothing else: the letters are drawn far off to the side in
    /// opaque black and only their shadow, in [color], falls back in place.
    static func blurredText(_ ctx: CGContext, _ l: TextBlock, mode: CGTextDrawingMode, color: CGColor, lineWidth: CGFloat = 0,
                            radius: CGFloat, bounds: CGRect) {
        let far = (bounds.width + bounds.height) * 4 + 10_000
        ctx.saveGState()
        ctx.setShadow(offset: baseOffset(ctx, CGSize(width: far, height: 0)), blur: blurAmount(ctx, radius), color: color)
        ctx.translateBy(x: -far, y: 0)
        drawText(ctx, l, mode: mode, color: CGColor(red: 0, green: 0, blue: 0, alpha: 1), lineWidth: lineWidth)
        ctx.restoreGState()
    }

    /// CG takes shadow offsets in the device's own space (y up); [v] is in the current one.
    private static func baseOffset(_ ctx: CGContext, _ v: CGSize) -> CGSize {
        let m = ctx.ctm
        return CGSize(width: v.width * m.a + v.height * m.c, height: v.width * m.b + v.height * m.d)
    }

    /// Android's blur radius (sigma = 0.577 r + 0.5) as CG's blur amount (about two sigma),
    /// in device pixels.
    private static func blurAmount(_ ctx: CGContext, _ r: CGFloat) -> CGFloat {
        let m = ctx.ctm
        let scale = sqrt(abs(m.a * m.d - m.b * m.c))
        return max(0, 2 * (0.57735 * r + 0.5) * scale)
    }

    /// An ARGB colour with its alpha replaced by [alpha].
    static func color(_ argb: Int32, alpha: CGFloat) -> CGColor {
        CGColor(srgbRed: CGFloat(argb.argbR), green: CGFloat(argb.argbG), blue: CGFloat(argb.argbB), alpha: min(max(alpha, 0), 1))
    }
}

/// The text layers as pixels, from any thread: what the engine uploads, and what the subtitle
/// editor shows over the clip.
enum TextRasterizer {
    /// Premultiplied RGBA of [layers] over a transparent [width]x[height] frame, upright (row 0
    /// at the top), posed for [time] seconds (negative: at rest).
    static func image(layers: [TextLayer], width: Int, height: Int, time: Float) -> CGImage? {
        guard width > 0, height > 0, let ctx = context(nil, width, height) else { return nil }
        TextRenderer.draw(ctx, layers, w: CGFloat(width), h: CGFloat(height), t: time)
        return ctx.makeImage()
    }

    /// Draws into [pixels] (premultiplied RGBA, [width]x[height], row 0 at the top), clearing it first.
    static func render(_ layers: [TextLayer], into pixels: inout [UInt8], width: Int, height: Int, time: Float) {
        let n = width * height * 4
        if pixels.count != n { pixels = [UInt8](repeating: 0, count: n) } else { pixels.withUnsafeMutableBytes { _ = memset($0.baseAddress!, 0, n) } }
        pixels.withUnsafeMutableBytes { buf in
            guard let ctx = context(buf.baseAddress, width, height) else { return }
            TextRenderer.draw(ctx, layers, w: CGFloat(width), h: CGFloat(height), t: time)
            ctx.flush()
        }
    }

    /// A premultiplied RGBA context, flipped so y runs down from the top-left like the frame.
    private static func context(_ data: UnsafeMutableRawPointer?, _ w: Int, _ h: Int) -> CGContext? {
        guard let ctx = CGContext(data: data, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                                  space: CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        ctx.translateBy(x: 0, y: CGFloat(h))
        ctx.scaleBy(x: 1, y: -1)
        ctx.setShouldAntialias(true)
        ctx.setShouldSmoothFonts(false)
        ctx.interpolationQuality = .high
        return ctx
    }
}

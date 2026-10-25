import CoreGraphics
import SwiftUI

/// One family of line icons, from the same path strings as Android (Icons.kt): 24-unit grid,
/// 1.6 stroke, round caps and joins.
struct Glyph {
    let stroke: CGPath
    let fill: CGPath
}

private struct CGSink: PathSink {
    let path = CGMutablePath()
    mutating func move(_ x: Double, _ y: Double) { path.move(to: CGPoint(x: x, y: y)) }
    mutating func line(_ x: Double, _ y: Double) { path.addLine(to: CGPoint(x: x, y: y)) }
    mutating func cubic(_ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double, _ x: Double, _ y: Double) {
        path.addCurve(to: CGPoint(x: x, y: y), control1: CGPoint(x: x1, y: y1), control2: CGPoint(x: x2, y: y2))
    }
    mutating func close() { path.closeSubpath() }
}

enum Ico {
    private static func icon(_ strokes: String..., fills: [String] = []) -> Glyph {
        var s = CGSink(), f = CGSink()
        for d in strokes { SvgPath.parse(d, into: &s) }
        for d in fills { SvgPath.parse(d, into: &f) }
        return Glyph(stroke: s.path, fill: f.path)
    }

    private static func c(_ cx: Double, _ cy: Double, _ r: Double) -> String {
        "M\(cx - r) \(cy)a\(r) \(r) 0 1 0 \(2 * r) 0a\(r) \(r) 0 1 0 \(-2 * r) 0"
    }

    private static func dots(_ p: (Double, Double)..., r: Double = 0.9) -> [String] { p.map { c($0.0, $0.1, r) } }

    // ---- camera
    static let flash = icon("M13 2.5L4.5 13.5H11L10 21.5l8.5-11H12z")
    static let flashOff = icon("M13 2.5l-3.2 4.1 M7.3 9.9L4.5 13.5H11L10 21.5l4.1-5.3 M16.3 12.5l2.2-2H12.6", "M3 3l18 18")
    static let flip = icon("M4 10a8 8 0 0 1 13.7-4.3L20 8", "M20 3.5V8h-4.5", "M20 14a8 8 0 0 1-13.7 4.3L4 16", "M4 20.5V16h4.5")
    static let tune = icon("M4 7h10", "M18 7h2", "M4 17h2", "M10 17h10", c(16, 7, 2), c(8, 17, 2))
    static let close = icon("M6 6l12 12", "M18 6L6 18")
    static let check = icon("M5 12.5l4.5 4.5L19 7")
    static let plus = icon("M12 5v14", "M5 12h14")
    static let trash = icon("M4 7h16", "M9 7V4.5h6V7", "M6 7l1 13h10l1-13", "M10 11v5", "M14 11v5")
    static let reset = icon("M4 12a8 8 0 1 0 2.3-5.6", "M4 4.5V9h4.5")
    static let sun = icon(c(12, 12, 4), "M12 2.5v2", "M12 19.5v2", "M4.9 4.9l1.4 1.4", "M17.7 17.7l1.4 1.4", "M2.5 12h2", "M19.5 12h2", "M4.9 19.1l1.4-1.4", "M17.7 6.3l1.4-1.4")
    static let moon = icon("M19.5 14.5A8 8 0 1 1 9.5 4.5a6.5 6.5 0 0 0 10 10z")
    static let auto = icon(c(12, 12, 8), fills: ["M12 4a8 8 0 0 0 0 16z"])
    static let chevron = icon("M6 9l6 6 6-6")
    static let heart = icon("M12 19.5s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.3c0 5.6-7.5 10.2-7.5 10.2z")
    static let heartFilled = icon("M12 19.5s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.3c0 5.6-7.5 10.2-7.5 10.2z", fills: ["M12 19.5s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.3c0 5.6-7.5 10.2-7.5 10.2z"])
    static let lineHeight = icon("M10 6h10", "M10 12h10", "M10 18h10", "M5 5v14", "M3.3 7L5 5l1.7 2", "M3.3 17L5 19l1.7-2")
    static let motion = icon("M4 16c2-6 4-6 6 0s4 6 6 0", "M18.5 5.5l1 2 2 1-2 1-1 2-1-2-2-1 2-1z")

    // ---- docks
    static let film = icon("M4.5 4h15v16h-15z", "M8.5 4v16", "M15.5 4v16", "M4.5 8h4", "M4.5 12h4", "M4.5 16h4", "M15.5 8h4", "M15.5 12h4", "M15.5 16h4")
    static let adjust = icon("M6 4v4", "M6 12v8", "M12 4v10", "M12 18v2", "M18 4v2", "M18 10v10", c(6, 10, 2), c(12, 16, 2), c(18, 8, 2))
    static let frame = icon("M5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4z", "M8 8h8v6.5H8z")
    static let text = icon("M5 7V5h14v2", "M12 5v14", "M9.5 19h5")

    // ---- adjustments
    static let exposure = icon(c(12, 12, 8.5), "M8 10h4", "M10 8v4", "M12.5 15h4")
    static let shutter = icon(c(12, 12, 8.5), "M12 3.5L14.5 9", "M20.4 11L14.6 12.6", "M16.3 19.4L12.4 15", "M6 18l4.6-3.3", "M4.4 8.5l5.8 1.9")
    static let halation = icon(c(12, 12, 3.2), c(12, 12, 7.5), fills: [c(12, 12, 1.6)])
    static let size = icon(c(12, 12, 2.5), c(12, 12, 6), c(12, 12, 9.2))
    static let bloom = icon("M12 3v4", "M12 17v4", "M3 12h4", "M17 12h4", "M6.3 6.3l2.4 2.4", "M15.3 15.3l2.4 2.4", "M6.3 17.7l2.4-2.4", "M15.3 8.7l2.4-2.4")
    static let streak = icon("M2.5 12h19", c(12, 12, 2.6))
    static let leak = icon("M4 20C7.5 12.5 12 8 20 4.5", "M4 13.5c2.2-3 5-5.6 8.5-7.5", "M10 20.5c2.5-4.5 6-8 10.5-10")
    static let prism = icon("M12 4.5l7.5 14h-15z", "M2.5 12.5h5.5", "M15.5 11.5l6-2.5", "M15.8 13.5l6 2")
    static let diffusion = icon("M7 18.5h10a4 4 0 0 0 .6-8A6 6 0 0 0 6.2 10a4.3 4.3 0 0 0 .8 8.5z")
    static let flashLook = icon("M12 3.5v3", "M12 17.5v3", "M3.5 12h3", "M17.5 12h3", c(12, 12, 4.5), fills: [c(12, 12, 2)])
    static let grain = icon(fills: dots((7, 6.5), (12, 5.5), (17, 7), (5.5, 11.5), (10.5, 10.5), (15.5, 12), (19, 11), (8, 16), (13, 15.5), (17.5, 17.5), (6, 19.5), (11.5, 19.5)))
    static let grainSize = icon(fills: dots((7, 7), (16.5, 7.5), (11.5, 12.5), (6.5, 17.5), (17, 17), r: 1.9))
    static let fade = icon(c(12, 12, 8.5), fills: ["M12 3.5a8.5 8.5 0 0 1 0 17z"])
    static let warmth = icon("M10 14.5V5.5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z", "M12 9v8.5")
    static let vignette = icon("M4 4h16v16H4z", c(12, 12, 5.5))
    static let aberration = icon(c(10, 12, 5.5), c(14, 12, 5.5))
    static let softness = icon("M12 3.5c3 4 6.5 7.5 6.5 10.5a6.5 6.5 0 0 1-13 0c0-3 3.5-6.5 6.5-10.5z")
    static let corners = icon("M4 9V4h5", "M15 4h5v5", "M20 15v5h-5", "M9 20H4v-5", c(12, 12, 3))
    static let fisheye = icon(c(12, 12, 8.5), "M12 3.5c-3.3 3.3-3.3 13.7 0 17", "M12 3.5c3.3 3.3 3.3 13.7 0 17", "M3.5 12h17")
    static let stereo = icon("M3 10h18", "M5 10v3.5a3 3 0 0 0 6 0V10", "M13 10v3.5a3 3 0 0 0 6 0V10")
    static let blur = icon("M4 8h11", "M18 8h2", "M4 12h16", "M4 16h8", "M15 16h5")
    static let focus = icon("M4 9V4h5", "M15 4h5v5", "M20 15v5h-5", "M9 20H4v-5", fills: [c(12, 12, 1.8)])
    static let direction = icon("M4 12h16", "M16 8l4 4-4 4")
    static let weave = icon("M3 12c3-4.5 6 4.5 9 0s6 4.5 9 0")
    static let slip = icon("M12 3.5v17", "M8.5 7l3.5-3.5L15.5 7", "M8.5 17l3.5 3.5 3.5-3.5")
    static let flicker = icon("M9 18h6", "M10 21h4", "M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.6 1 2.5h6c0-.9.2-1.7 1-2.5A6 6 0 0 0 12 3z")
    static let colorFlicker = icon(c(9, 9.5, 4.5), c(15, 9.5, 4.5), c(12, 15, 4.5))
    static let dust = icon("M14 3.5l-2 17", fills: dots((6, 7), (18, 6), (7.5, 14), (17, 13), (5.5, 19), (18.5, 19.5), r: 1.1))
    static let frameRate = icon("M3.5 6h17v12h-17z", "M7.75 6v12", "M12 6v12", "M16.25 6v12")
    static let burn = icon("M12 3c1 3.5 5.5 5.5 5.5 10.5a5.5 5.5 0 0 1-11 0c0-2.7 1.6-4.4 2.7-5.5.5 2.2 1.5 3.3 2.8 3.3 0-3.3-1.1-5.3 0-8.3z")
    static let tape = icon("M3 6h18v12H3z", c(8, 12, 2), c(16, 12, 2), "M10 12h4", "M6.5 18l1.5-2.5h8l1.5 2.5")
    static let interlace = icon("M4 6h16", "M4 9.5h16", "M4 13h16", "M4 16.5h16", "M4 20h10")
    static let lowRes = icon("M4 4h8v8H4z", "M12 12h8v8h-8z", "M12 4h8v8", "M4 12v8h8")
    static let stamp = icon("M4 6h16v14H4z", "M8 3.5v4", "M16 3.5v4", "M4 10.5h16")

    // ---- text
    static let alignLeft = icon("M4 6h16", "M4 10h10", "M4 14h16", "M4 18h10")
    static let alignCenter = icon("M4 6h16", "M7 10h10", "M4 14h16", "M7 18h10")
    static let alignRight = icon("M4 6h16", "M10 10h10", "M4 14h16", "M10 18h10")
    static let rotate = icon("M20 12a8 8 0 1 1-2.3-5.6", "M20 4.5V9h-4.5")
    static let opacity = icon(c(12, 12, 8.5), fills: ["M12 3.5a8.5 8.5 0 0 1 0 17z"])
    static let shadow = icon("M5 5h10v10H5z", "M9 19h10V9")
    /** A figure in front of a text line: text behind the subject. */
    static let depth = icon("M3 9h18", "M3 13h5", "M16 13h5", "M12 7.5a2 2 0 1 0 0.01 0", "M8.5 20c0-3 1.5-5.5 3.5-5.5s3.5 2.5 3.5 5.5")
    static let spacing = icon("M4 5v14", "M20 5v14", "M8 12h8", "M10.5 9.5L8 12l2.5 2.5", "M13.5 9.5L16 12l-2.5 2.5")
    static let textSize = icon("M4 19l5-14 5 14", "M5.8 14h6.4", "M17.5 9.5l2-2 2 2", "M19.5 7.5v9", "M17.5 14.5l2 2 2-2")
    static let fonts = icon("M3.5 18.5l4.5-13 4.5 13", "M5 14.5h6", "M20 18.5v-5.8a2.7 2.7 0 1 0-2.7 2.7H20")
    static let importIcon = icon("M12 4v11", "M7.5 10.5L12 15l4.5-4.5", "M5 20h14")

    // ---- capture options and media
    static let timer = icon(c(12, 13.5, 7.5), "M12 9.5v4l2.5 2", "M9.5 2.5h5", "M18.5 6.5l1.5-1.5")
    static let burst = icon("M7 7.5h10a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 17 18.5H7A1.5 1.5 0 0 1 5.5 17V9A1.5 1.5 0 0 1 7 7.5z", "M8 5h8", "M10 2.8h4")
    static let ratio = icon("M5.5 4.5h13a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z", "M8 8h3", "M8 8v3", "M16 16h-3", "M16 16v-3")
    static let log = icon("M4 19.5h16", "M4 19.5V4.5", "M4 17C8 9 12 7 20 6")
    static let gallery = icon("M4.5 4.5h6v6h-6z", "M13.5 4.5h6v6h-6z", "M4.5 13.5h6v6h-6z", "M13.5 13.5h6v6h-6z")
    static let share = icon("M12 15V4", "M8 7.5L12 3.5l4 4", "M6.5 11.5H5v8h14v-8h-1.5")
    static let scissors = icon(c(6.5, 6.5, 2.5), c(6.5, 17.5, 2.5), "M8.6 8L19.5 18", "M8.6 16L19.5 6")
    static let subtitles = icon("M3.5 5.5h17v13h-17z", "M7 14.5h4.5", "M13.5 14.5h3.5", "M7 11h7.5", "M16.5 11h0.5")
    static let key = icon("M14.5 9.5a3.5 3.5 0 1 0 0.01 0", "M12 12l-8 8", "M7 17l2 2", "M5.5 18.5l1.5 1.5")
    static let wand = icon("M4 20L15 9", "M13.5 7.5l3 3", "M18 3.5v3", "M16.5 5h3", "M20 9.5v2", "M19 10.5h2", "M9.5 3.5v2", "M8.5 4.5h2")
    static let back = icon("M15 5l-7 7 7 7")
    static let styles = icon("M6 3.5h12A2.5 2.5 0 0 1 20.5 6v12a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 18V6A2.5 2.5 0 0 1 6 3.5z", fills: [8.0, 12, 16].flatMap { y in [8.0, 12, 16].map { x in c(x, y, 1.1) } })
    static let none = icon(c(12, 12, 8), "M6.4 17.6L17.6 6.4")
    static let tint = icon("M12 3.5c3 4 5.5 7 5.5 10a5.5 5.5 0 0 1-11 0c0-3 2.5-6 5.5-10z", "M9 14.5a3 3 0 0 0 3 3")
    static let contrast = icon(c(12, 12, 8), fills: ["M12 4a8 8 0 0 1 0 16z"])
    static let highlights = icon(c(12, 12, 3.5), "M12 3v2", "M12 19v2", "M3 12h2", "M19 12h2", "M5.6 5.6l1.4 1.4", "M17 17l1.4 1.4", "M5.6 18.4L7 17", "M17 7l1.4-1.4")
    static let shadows = icon(c(12, 12, 8), "M12 4v16", "M12 8h5.5", "M12 12h8", "M12 16h5.5")
    static let saturation = icon(c(9, 10, 5), c(15, 10, 5), c(12, 15, 5))
    static let vibrance = icon("M12 3.5l2.4 5.6 6.1.6-4.6 4 1.4 6-5.3-3.2-5.3 3.2 1.4-6-4.6-4 6.1-.6z")
    static let clarity = icon("M4 18l5-7 3.5 4.5L15 12l5 6z", c(16.5, 7, 1.8))
    static let sharpness = icon("M12 3.5l8 15H4z", "M12 9.5v4.5")
    static let play = icon(fills: ["M8 5.5v13l10.5-6.5z"])
    static let pause = icon(fills: ["M7 5h3.5v14H7z", "M13.5 5H17v14h-3.5z"])
    static let mic = icon("M12 3.5a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0v-5a3 3 0 0 0-3-3z", "M5.5 11.5a6.5 6.5 0 0 0 13 0", "M12 18v2.5")
    static let more = icon("M5.5 12h0.01", "M12 12h0.01", "M18.5 12h0.01")
    static let fullscreen = icon("M4 9V4h5", "M15 4h5v5", "M20 15v5h-5", "M9 20H4v-5")
}

struct IconView: View {
    let glyph: Glyph
    var size: CGFloat = 22
    var color: Color

    init(_ glyph: Glyph, size: CGFloat = 22, color: Color) {
        self.glyph = glyph
        self.size = size
        self.color = color
    }

    var body: some View {
        Canvas { ctx, sz in
            ctx.scaleBy(x: sz.width / 24, y: sz.height / 24)
            ctx.stroke(Path(glyph.stroke), with: .color(color), style: StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round))
            ctx.fill(Path(glyph.fill), with: .color(color))
        }
        .frame(width: size, height: size)
        .allowsHitTesting(false)
    }
}

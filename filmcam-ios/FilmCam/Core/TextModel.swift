import Foundation

// Text layers (a port of TextLayer.kt's model): plain data, no drawing, so the subtitle engine
// and its tests build anywhere. Drawing is in TextRenderer.swift.

enum TextAlign: String, Codable, CaseIterable { case LEFT, CENTER, RIGHT }

/// How text mixes with the picture under it; [shaderId] is the mode's number in final.frag.
enum TextBlend: String, Codable, CaseIterable {
    case NORMAL, SCREEN, ADD, OVERLAY, SOFT_LIGHT, MULTIPLY, DIFFERENCE, COLOR_DODGE

    var label: String {
        switch self {
        case .NORMAL: return "Normal"
        case .SCREEN: return "Screen"
        case .ADD: return "Add"
        case .OVERLAY: return "Overlay"
        case .SOFT_LIGHT: return "Soft light"
        case .MULTIPLY: return "Multiply"
        case .DIFFERENCE: return "Difference"
        case .COLOR_DODGE: return "Colour dodge"
        }
    }

    var shaderId: Int32 { Int32(Self.allCases.firstIndex(of: self)!) }
}

/// A finish on the letters that helps them read over a busy picture.
enum TextFx: String, Codable, CaseIterable {
    case NONE, SHADOW, DROP, GLOW, BLUR, OUTLINE, HAZE

    var label: String {
        switch self {
        case .NONE: return "None"
        case .SHADOW: return "Soft shadow"
        case .DROP: return "Drop shadow"
        case .GLOW: return "Glow"
        case .BLUR: return "Soft blur"
        case .OUTLINE: return "Outline"
        case .HAZE: return "Haze"
        }
    }
}

/// One moment of a text animation (see [TextAnim.pose]).
struct TextPose: Equatable {
    var dx: Float = 0
    var dy: Float = 0
    var rotation: Float = 0
    var scale: Float = 1
    var alpha: Float = 1
    var chars: Int = Int.max

    static let rest = TextPose()
}

/// Text animations. The stop-motion ones hold each pose for a few frames; [fps] is how often
/// the pose changes, so the overlay is only redrawn that often.
enum TextAnim: String, Codable, CaseIterable {
    case NONE, WIGGLE, JIGGLE, STOP_MOTION, FLOAT, SWING, BOUNCE, PULSE, SPIN, FLICKER, TYPEWRITER

    var label: String {
        switch self {
        case .NONE: return "None"
        case .WIGGLE: return "Wiggle"
        case .JIGGLE: return "Jiggle"
        case .STOP_MOTION: return "Stop-motion"
        case .FLOAT: return "Float"
        case .SWING: return "Swing"
        case .BOUNCE: return "Bounce"
        case .PULSE: return "Pulse"
        case .SPIN: return "Spin"
        case .FLICKER: return "Flicker"
        case .TYPEWRITER: return "Typewriter"
        }
    }

    var fps: Int {
        switch self {
        case .NONE: return 0
        case .WIGGLE, .JIGGLE, .FLICKER, .TYPEWRITER: return 12
        case .STOP_MOTION: return 8
        default: return 30
        }
    }

    var hint: String {
        switch self {
        case .NONE: return "Still text."
        case .WIGGLE, .JIGGLE, .STOP_MOTION, .FLICKER: return "\(label): moves a few times a second, like stop-motion; photos show it at rest."
        case .TYPEWRITER: return "Typewriter: types itself out again and again; photos show the whole text."
        default: return "\(label): plays in video and the viewfinder; photos show it at rest."
        }
    }

    /// Where the text is at [t] seconds (negative: the rest pose, for stills). Same maths as
    /// Android, so a take looks the same on both.
    func pose(_ t: Float, seed: Int64, length: Int) -> TextPose {
        if self == .NONE || t < 0 { return .rest }
        let twoPi = Float.pi * 2
        func rnd(_ k: Int64, _ salt: Int) -> Float {
            var h = (UInt64(bitPattern: k) &* 0x9E37_79B9_7F4A_7C15) ^ (UInt64(bitPattern: seed) &* 0xBF58_476D_1CE4_E5B9) ^ UInt64(bitPattern: Int64(salt))
            h = (h ^ (h >> 31)) &* 0x94D0_49BB_1331_11EB
            h = h ^ (h >> 29)
            return Float(Double(h >> 11) / Double(UInt64(1) << 53)) * 2 - 1
        }
        let k = Int64(t * Float(fps))
        switch self {
        case .WIGGLE: return TextPose(dx: rnd(k, 1) * 0.04, dy: rnd(k, 2) * 0.04, rotation: rnd(k, 3) * 4)
        case .JIGGLE: return TextPose(dx: rnd(k, 1) * 0.05, dy: rnd(k, 2) * 0.05, rotation: rnd(k, 3) * 1.5, scale: 1 + rnd(k, 4) * 0.06)
        case .STOP_MOTION: return TextPose(dx: rnd(k, 1) * 0.025, dy: rnd(k, 2) * 0.025, rotation: rnd(k, 3) * 2, scale: 1 + rnd(k, 4) * 0.02)
        case .FLOAT: return TextPose(dx: 0, dy: 0.18 * sin(twoPi * t / 2.6), rotation: 1.5 * sin(twoPi * t / 3.9))
        case .SWING: return TextPose(rotation: 9 * sin(twoPi * t / 2.2))
        case .BOUNCE: return TextPose(dy: -0.35 * abs(sin(Float.pi * t / 0.9)))
        case .PULSE: return TextPose(scale: 1 + 0.07 * sin(twoPi * t / 1.4))
        case .SPIN: return TextPose(rotation: (t / 4).truncatingRemainder(dividingBy: 1) * 360)
        case .FLICKER: return TextPose(alpha: rnd(k, 5) > 0.82 ? 0.25 : 0.75 + 0.25 * rnd(k, 6))
        case .TYPEWRITER:
            let step: Float = 0.09
            let cycle = Float(length) * step + 1.6
            return TextPose(chars: min(Int(t.truncatingRemainder(dividingBy: cycle) / step), length))
        case .NONE: return .rest
        }
    }
}

/// A line (or lines) of text burnt into the picture. Position and size are relative to the
/// upright frame, so the layer looks the same at any resolution.
struct TextLayer: Codable, Equatable, Identifiable {
    var id: Int64 = Int64(Date().timeIntervalSince1970 * 1_000_000) &+ Int64.random(in: 0..<1000)
    var text: String = "Summer '26"
    var font: String = FontKeys.defaultKey
    /// Text size as a fraction of the frame's short side.
    var size: Float = 0.07
    /// Centre of the text block in the frame, 0..1, y down.
    var x: Float = 0.5
    var y: Float = 0.5
    /// Clockwise, in degrees.
    var rotation: Float = 0
    var align: TextAlign = .CENTER
    /// ARGB, as on Android.
    var color: Int32 = Int32(bitPattern: 0xFFFF_FFFF)
    var opacity: Float = 1
    var shadow: Bool = false
    /// Extra letter spacing in ems.
    var tracking: Float = 0
    /// Set behind the subject: the person passes in front of the text.
    var behind: Bool = false
    /// Longest line as a fraction of the frame width (0: wrap only at line breaks).
    var wrap: Float = 0
    var box: Bool = false
    var boxColor: Int32 = TextLayer.defaultBox
    /// Outline colour, 0 for none.
    var outline: Int32 = 0
    var lineSpacing: Float = 1
    var anim: TextAnim = .NONE
    /// How much of the text shows, left to right (kinetic captions). Not saved.
    var reveal: Float = 1
    /// Soft focus as a fraction of the text size (kinetic captions). Not saved.
    var blur: Float = 0
    var fx: TextFx = .NONE
    var fxAmount: Float = 0.5
    var fxColor: Int32 = 0
    var blend: TextBlend = .NORMAL

    static let defaultBox = Int32(bitPattern: 0x9900_0000)

    enum CodingKeys: String, CodingKey {
        case id, text, font, size, x, y, rotation, align, color, opacity, shadow, tracking, behind, wrap, box, boxColor,
             outline, lineSpacing, anim, fx, fxAmount, fxColor, blend
    }

    init() {}

    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(Int64.self, forKey: .id)) ?? id
        text = (try? c.decode(String.self, forKey: .text)) ?? ""
        font = (try? c.decode(String.self, forKey: .font)) ?? FontKeys.defaultKey
        size = (try? c.decode(Float.self, forKey: .size)) ?? 0.07
        x = (try? c.decode(Float.self, forKey: .x)) ?? 0.5
        y = (try? c.decode(Float.self, forKey: .y)) ?? 0.8
        rotation = (try? c.decode(Float.self, forKey: .rotation)) ?? 0
        align = (try? c.decode(TextAlign.self, forKey: .align)) ?? .CENTER
        color = (try? c.decode(Int32.self, forKey: .color)) ?? Int32(bitPattern: 0xFFFF_FFFF)
        opacity = (try? c.decode(Float.self, forKey: .opacity)) ?? 1
        shadow = (try? c.decode(Bool.self, forKey: .shadow)) ?? false
        tracking = (try? c.decode(Float.self, forKey: .tracking)) ?? 0
        behind = (try? c.decode(Bool.self, forKey: .behind)) ?? false
        wrap = (try? c.decode(Float.self, forKey: .wrap)) ?? 0
        box = (try? c.decode(Bool.self, forKey: .box)) ?? false
        boxColor = (try? c.decode(Int32.self, forKey: .boxColor)) ?? TextLayer.defaultBox
        outline = (try? c.decode(Int32.self, forKey: .outline)) ?? 0
        lineSpacing = (try? c.decode(Float.self, forKey: .lineSpacing)) ?? 1
        anim = (try? c.decode(TextAnim.self, forKey: .anim)) ?? .NONE
        fx = (try? c.decode(TextFx.self, forKey: .fx)) ?? .NONE
        fxAmount = (try? c.decode(Float.self, forKey: .fxAmount)) ?? 0.5
        fxColor = (try? c.decode(Int32.self, forKey: .fxColor)) ?? 0
        blend = (try? c.decode(TextBlend.self, forKey: .blend)) ?? .NORMAL
    }

    static func listToJson(_ layers: [TextLayer]) -> String {
        (try? String(data: JSONEncoder().encode(layers), encoding: .utf8)) ?? "[]"
    }

    static func listFromJson(_ s: String?) -> [TextLayer] {
        guard let s, let d = s.data(using: .utf8) else { return [] }
        return (try? JSONDecoder().decode([TextLayer].self, from: d)) ?? []
    }
}

/// Font keys, as on Android: "asset:<file>" for a bundled font, "asset:<file>#<weight>" for a
/// weight of a variable font, "asset:<file>@<variation settings>" for a named instance, and
/// "file:..." for imported ones.
enum FontKeys {
    static let defaultKey = "asset:InstrumentSerif.ttf"
    /// Kinetic captions: Inter Tight in three weights and its italic, and Instrument Serif Italic.
    static let interTight500 = "asset:InterTight.ttf#500"
    static let interTight700 = "asset:InterTight.ttf#700"
    static let interTight800 = "asset:InterTight.ttf#800"
    static let interTightItalic = "asset:InterTight-Italic.ttf#700"
    static let serifItalic = "asset:InstrumentSerif-Italic.ttf"
    static let subtitleTelugu = "asset:NotoSansTelugu.ttf#700"
}

/// ARGB colours stored as Int32 (Android's), and their parts.
extension Int32 {
    var argbA: Float { Float((UInt32(bitPattern: self) >> 24) & 0xFF) / 255 }
    var argbR: Float { Float((UInt32(bitPattern: self) >> 16) & 0xFF) / 255 }
    var argbG: Float { Float((UInt32(bitPattern: self) >> 8) & 0xFF) / 255 }
    var argbB: Float { Float(UInt32(bitPattern: self) & 0xFF) / 255 }

    static func argb(_ a: Float, _ r: Float, _ g: Float, _ b: Float) -> Int32 {
        func c(_ v: Float) -> UInt32 { UInt32(Swift.max(0, Swift.min(255, (v * 255).rounded()))) }
        return Int32(bitPattern: c(a) << 24 | c(r) << 16 | c(g) << 8 | c(b))
    }
}

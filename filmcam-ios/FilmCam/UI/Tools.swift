import Foundation

// The Adjust tray's tools (Tools.kt on Android): an icon in the tool row and a ruler each.
// Choices (shutter speed, blur type...) are rulers that snap, the option index as the value.

enum ToolGroup: String, CaseIterable, Hashable {
    case BASIC, LIGHT, MOTION, FILM, LENS, RETRO
    var label: String { String(rawValue.prefix(1)) + rawValue.dropFirst().lowercased() }
}

struct Tool: Identifiable {
    let id: String
    let label: String
    let glyph: Glyph
    let group: ToolGroup
    var min: Float = 0
    var max: Float = 1
    var options: [String]?
    var format: (Float) -> String = { "\(Int(($0 * 100).rounded()))" }
    var visible: (Look) -> Bool = { _ in true }
    let get: (Look) -> Float
    let set: (Look, Float) -> Look
}

enum Tools {
    private static let onOff = ["Off", "On"]
    private static func signed(_ v: Float) -> String {
        let n = Int((v * 100).rounded())
        return n > 0 ? "+\(n)" : "\(n)"
    }
    /// Studio looks draw their glows the editor's way, which has no halo size, mist or streaks.
    private static let notStudio: (Look) -> Bool = { !$0.studio }

    private static func f(_ id: String, _ label: String, _ g: Glyph, _ group: ToolGroup, min: Float = 0, max: Float = 1,
                          signed s: Bool = false, visible: @escaping (Look) -> Bool = { _ in true },
                          _ key: WritableKeyPath<Look, Float>) -> Tool {
        Tool(id: id, label: label, glyph: g, group: group, min: min, max: max,
             format: s ? signed : { "\(Int(($0 * 100).rounded()))" }, visible: visible,
             get: { $0[keyPath: key] }, set: { l, v in var n = l; n[keyPath: key] = v; return n })
    }

    static func all(evMin: Float, evMax: Float) -> [Tool] {
        let spec = Spec.shared
        let shutters = spec.shutterSpeeds
        let rates = spec.frameRates
        let blurs = spec.blurModes
        return [
            // Basic: the everyday corrections, on any look (or none)
            Tool(id: "exposure", label: "Exposure", glyph: Ico.exposure, group: .BASIC, min: evMin, max: evMax,
                 format: { String(format: "%+.1f", $0) }, get: { $0.exposureEv },
                 set: { l, v in var n = l; n.exposureEv = (v * 10).rounded() / 10; return n }),
            f("strength", "Strength", Ico.film, .BASIC, visible: { $0.stock != "neutral" }, \.intensity),
            f("warmth", "Temp", Ico.warmth, .BASIC, min: -1, signed: true, \.warmth),
            f("tint", "Tint", Ico.tint, .BASIC, min: -1, signed: true, \.tint),
            f("contrast", "Contrast", Ico.contrast, .BASIC, min: -1, signed: true, \.contrast),
            f("highlights", "Highlights", Ico.highlights, .BASIC, min: -1, signed: true, \.highlights),
            f("shadows", "Shadows", Ico.shadows, .BASIC, min: -1, signed: true, \.shadows),
            f("saturation", "Saturation", Ico.saturation, .BASIC, min: -1, signed: true, \.saturation),
            f("vibrance", "Vibrance", Ico.vibrance, .BASIC, min: -1, signed: true, \.vibrance),
            f("clarity", "Clarity", Ico.clarity, .BASIC, min: -1, signed: true, \.clarity),
            f("sharpness", "Sharpness", Ico.sharpness, .BASIC, \.sharpness),
            f("fade", "Fade", Ico.fade, .BASIC, \.fade),
            // Light
            Tool(id: "shutter", label: "Shutter", glyph: Ico.shutter, group: .LIGHT, min: 0, max: Float(shutters.count - 1),
                 options: shutters.map { $0.label },
                 get: { l in Float(shutters.firstIndex { $0.id == l.shutter } ?? 4) },
                 set: { l, v in var n = l; n.shutter = shutters[Swift.min(Swift.max(Int(v.rounded()), 0), shutters.count - 1)].id; return n }),
            f("halation", "Halation", Ico.halation, .LIGHT, \.halation),
            f("halsize", "Halo size", Ico.size, .LIGHT, visible: notStudio, \.halationSize),
            f("bloom", "Bloom", Ico.bloom, .LIGHT, \.bloom),
            f("diffusion", "Mist", Ico.diffusion, .LIGHT, visible: notStudio, \.diffusion),
            f("streak", "Streaks", Ico.streak, .LIGHT, visible: notStudio, \.streak),
            f("leak", "Leaks", Ico.leak, .LIGHT, \.lightLeak),
            f("prism", "Prism", Ico.prism, .LIGHT, \.prism),
            f("flash", "Flash", Ico.flashLook, .LIGHT, \.flash),
            // Film
            f("grain", "Grain", Ico.grain, .FILM, \.grain),
            Tool(id: "grainsize", label: "Grain size", glyph: Ico.grainSize, group: .FILM, min: 0.6, max: 3,
                 format: { String(format: "%.1f", $0) }, get: { $0.grainSize },
                 set: { l, v in var n = l; n.grainSize = v; return n }),
            f("vignette", "Vignette", Ico.vignette, .FILM, \.vignette),
            f("dust", "Dust", Ico.dust, .FILM, \.dust),
            Tool(id: "burn", label: "Roll burn", glyph: Ico.burn, group: .FILM, options: onOff,
                 get: { $0.rollBurn ? 1 : 0 }, set: { l, v in var n = l; n.rollBurn = v >= 0.5; return n }),
            // Lens
            f("softness", "Softness", Ico.softness, .LENS, min: -1, signed: true, \.softness),
            f("aberration", "Fringing", Ico.aberration, .LENS, \.aberration),
            f("corners", "Toy lens", Ico.corners, .LENS, \.cornerBlur),
            f("fisheye", "Fisheye", Ico.fisheye, .LENS, \.distortion),
            Tool(id: "circle", label: "Circle", glyph: Ico.focus, group: .LENS, options: onOff, visible: notStudio,
                 get: { $0.circleMask ? 1 : 0 }, set: { l, v in var n = l; n.circleMask = v >= 0.5; return n }),
            f("stereo", "3D", Ico.stereo, .LENS, \.anaglyph),
            // Motion
            Tool(id: "blurmode", label: "Blur", glyph: Ico.blur, group: .MOTION, min: 0, max: Float(blurs.count - 1),
                 options: blurs.map { $0.label },
                 get: { l in Float(blurs.firstIndex { $0.id == l.blurMode } ?? 0) },
                 set: { l, v in
                     var n = l
                     let mode = blurs[Swift.min(Swift.max(Int(v.rounded()), 0), blurs.count - 1)].id
                     // Turning a blur on starts gentle: a quarter strength with a wide sharp centre.
                     if l.blurMode == "NONE" && mode != "NONE" { n.blur = 0.25; n.blurFocus = 0.75 }
                     n.blurMode = mode
                     return n
                 }),
            f("blur", "Amount", Ico.halation, .MOTION, visible: { $0.blurMode != "NONE" }, \.blur),
            f("blurfocus", "Sharp centre", Ico.focus, .MOTION, visible: { $0.blurMode != "NONE" }, \.blurFocus),
            Tool(id: "blurangle", label: "Direction", glyph: Ico.direction, group: .MOTION, min: 0, max: 180,
                 format: { "\(Int($0.rounded()))°" }, visible: { $0.blurMode == "MOTION" },
                 get: { $0.blurAngle }, set: { l, v in var n = l; n.blurAngle = v; return n }),
            Tool(id: "fps", label: "Frame rate", glyph: Ico.frameRate, group: .MOTION, min: 0, max: Float(rates.count - 1),
                 options: rates.map { $0.id == "NATIVE" ? "Native" : $0.label },
                 get: { l in Float(rates.firstIndex { $0.id == l.frameRate } ?? 0) },
                 set: { l, v in var n = l; n.frameRate = rates[Swift.min(Swift.max(Int(v.rounded()), 0), rates.count - 1)].id; return n }),
            f("weave", "Weave", Ico.weave, .MOTION, \.gateWeave),
            f("slip", "Slips", Ico.slip, .MOTION, \.frameSlip),
            f("flicker", "Flicker", Ico.flicker, .MOTION, \.flicker),
            f("cflicker", "Colour pump", Ico.colorFlicker, .MOTION, \.colorFlicker),
            // Retro
            f("vhs", "Tape", Ico.tape, .RETRO, \.vhs),
            f("interlace", "Interlace", Ico.interlace, .RETRO, \.interlace),
            f("lowres", "Low res", Ico.lowRes, .RETRO, \.lowRes),
        ]
    }
}

import Foundation
import UIKit

// The film engine's description, shared with Android: filmcam-shared/spec/filmcam-spec.json
// (generated from the Kotlin sources). Field names match the JSON exactly.

struct RGB: Codable, Equatable {
    var r: Float
    var g: Float
    var b: Float
}

struct Stock: Codable, Equatable {
    var id: String
    var name: String
    var temperature: Float
    var tint: Float
    var saturation: Float
    var satShadows: Float
    var satHighlights: Float
    var contrast: Float
    var fade: Float
    var highlightRolloff: Float
    var gamma: RGB
    var hueShift: RGB
    var shadowTint: RGB
    var highlightTint: RGB
    var mixer: [Float]
    var monochrome: Bool
    var bleach: Float
    var halationColor: RGB
    var colorGrain: Float
    var swatch: String
}

struct StyleSetting: Codable, Equatable {
    var style: String = "STANDARD"
    var tone: Float = 0
    var color: Float = 0
    var palette: Float = 1

    var isIdentity: Bool { (style == "STANDARD" || palette == 0) && tone == 0 && color == 0 }
}

/// Every adjustable parameter of a look (see FilmLook.kt). Enums are their names.
struct Look: Codable, Equatable {
    var stock: String
    var halation: Float
    var halationSize: Float
    var bloom: Float
    var streak: Float
    var grain: Float
    var grainSize: Float
    var fade: Float
    var warmth: Float
    var lightLeak: Float
    var prism: Float
    var diffusion: Float
    var vignette: Float
    var aberration: Float
    var softness: Float
    var cornerBlur: Float
    var distortion: Float
    var circleMask: Bool
    var anaglyph: Float
    var flash: Float
    var blurMode: String
    var blur: Float
    var blurAngle: Float
    var blurFocus: Float
    var gateWeave: Float
    var frameSlip: Float
    var flicker: Float
    var colorFlicker: Float
    var dust: Float
    var vhs: Float
    var interlace: Float
    var lowRes: Float
    var rollBurn: Bool
    var shutter: String
    var frameRate: String
    var frame: String
    var stamp: String
    var multiShot: String
    var exposureEv: Float
    var style: StyleSetting
    var intensity: Float
    var tint: Float
    var contrast: Float
    var saturation: Float
    var vibrance: Float
    var highlights: Float
    var shadows: Float
    var clarity: Float
    var sharpness: Float
    // The photo editor's effects (studio looks; noise works on any look)
    var noise: Float
    var halftone: Float
    var threshold: Float
    var halftoneInk: String
    var halftonePaper: String
    var ghost: Float
    var tiltShift: Float
    var tiltY: Float
    var tiltSize: Float
    var studio: Bool
}

struct FilmCamera: Codable, Equatable, Identifiable {
    var id: String
    var name: String
    var subtitle: String
    var category: String
    var look: Look
}

struct Category: Codable, Equatable { var id: String; var label: String }

struct PhotoStyle: Codable, Equatable, Identifiable {
    var id: String
    var label: String
    var warm: Float
    var tint: Float
    var sat: Float
    var contrast: Float
    var tone: Float
    var bright: Float
    var fade: Float
    var mono: Float
    var shadowTint: RGB
    var highTint: RGB
    var skin: Float
    var swatch: String
}

struct ShaderEnum: Codable { var id: String; var label: String; var shaderId: Int }
struct Shutter: Codable { var id: String; var label: String; var seconds: Float }
struct FrameRate: Codable { var id: String; var label: String; var fps: Int }

struct Spec: Codable {
    var stocks: [Stock]
    var cameras: [FilmCamera]
    var categories: [Category]
    var styles: [PhotoStyle]
    var frames: [ShaderEnum]
    var stamps: [ShaderEnum]
    var blurModes: [ShaderEnum]
    var shutterSpeeds: [Shutter]
    var frameRates: [FrameRate]

    static let shared: Spec = {
        guard let url = Bundle.main.url(forResource: "filmcam-spec", withExtension: "json", subdirectory: "spec"),
              let data = try? Data(contentsOf: url) else { fatalError("filmcam-spec.json missing from the app bundle") }
        do { return try JSONDecoder().decode(Spec.self, from: data) } catch { fatalError("filmcam-spec.json: \(error)") }
    }()

    /// Stocks of imported looks (UserLooks), by id.
    static var extraStocks: [String: Stock] = [:]

    func stock(_ id: String) -> Stock { stocks.first { $0.id == id } ?? Self.extraStocks[id] ?? stocks[0] }
    func camera(_ id: String) -> FilmCamera? { cameras.first { $0.id == id } }
    func style(_ id: String) -> PhotoStyle { styles.first { $0.id == id } ?? styles[0] }
    func frameId(_ name: String) -> Int { frames.first { $0.id == name }?.shaderId ?? 0 }
    func stampId(_ name: String) -> Int { stamps.first { $0.id == name }?.shaderId ?? 0 }
    func blurId(_ name: String) -> Int { blurModes.first { $0.id == name }?.shaderId ?? 0 }
    func shutterSeconds(_ name: String) -> Float { shutterSpeeds.first { $0.id == name }?.seconds ?? 1 / 125 }
    func fps(_ name: String) -> Int { frameRates.first { $0.id == name }?.fps ?? 0 }

    /// The no-look camera: the phone's own picture.
    var original: FilmCamera { camera("original")! }
}

extension String {
    /// "#AARRGGBB" -> red, green and blue, 0..1.
    var argbFloats: (Float, Float, Float) {
        let hex = UInt64(dropFirst(), radix: 16) ?? 0xFF888888
        return (Float((hex >> 16) & 0xFF) / 255, Float((hex >> 8) & 0xFF) / 255, Float(hex & 0xFF) / 255)
    }

    /// "#AARRGGBB" -> UIColor.
    var argbColor: UIColor {
        let hex = UInt64(dropFirst(), radix: 16) ?? 0xFF888888
        return UIColor(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
                       blue: CGFloat(hex & 0xFF) / 255, alpha: CGFloat((hex >> 24) & 0xFF) / 255)
    }
}

extension Look {
    /// Persistence for a slow shutter (see ShutterSpeed.persistence in FilmLook.kt).
    func persistence(frameSeconds: Float) -> Float {
        let s = Spec.shared.shutterSeconds(shutter)
        if s < 1 / 50 { return 0 }
        return min(max(expf(-frameSeconds / (s * 0.5)), 0), 0.92)
    }
}

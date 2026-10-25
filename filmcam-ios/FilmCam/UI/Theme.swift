import CoreText
import SwiftUI
import UIKit

// The editor's palette and type (see Theme.kt on Android): monochrome, selection shown by
// inverting, hairline borders, Inter for reading and Space Mono for labels and values.

enum ThemeMode: String, CaseIterable, Identifiable {
    case SYSTEM, LIGHT, DARK
    var id: String { rawValue }
    var label: String { self == .SYSTEM ? "Auto" : self == .LIGHT ? "Light" : "Dark" }
}

struct Palette: Equatable {
    var dark: Bool
    var bg: Color
    var surface: Color
    var surfaceHigh: Color
    var line: Color
    var text: Color
    var muted: Color
    var faint: Color
    var accent: Color
    var danger: Color
    /** Background dots (the light theme sits on a fine dot grid). */
    var dots: Color

    static let light = Palette(
        dark: false, bg: Color(argb: 0xFFF6F6F5), surface: Color(argb: 0xFFFFFFFF), surfaceHigh: Color(argb: 0xFFF0F0EF),
        line: Color(argb: 0xFFE2E2E0), text: Color(argb: 0xFF0B0B0B), muted: Color(argb: 0xFF7A7A78), faint: Color(argb: 0xFFB4B4B1),
        accent: Color(argb: 0xFF0B0B0B), danger: Color(argb: 0xFFE0442E), dots: Color(argb: 0x16000000))

    static let darkPalette = Palette(
        dark: true, bg: Color(argb: 0xFF000000), surface: Color(argb: 0xFF0B0B0C), surfaceHigh: Color(argb: 0xFF161618),
        line: Color(argb: 0xFF242427), text: Color(argb: 0xFFF4F4F2), muted: Color(argb: 0xFF8E8E8A), faint: Color(argb: 0xFF4E4E4C),
        accent: Color(argb: 0xFFF4F4F2), danger: Color(argb: 0xFFF0553D), dots: Color(argb: 0x1AFFFFFF))
}

extension Color {
    init(argb: UInt32) {
        self.init(.sRGB, red: Double((argb >> 16) & 0xFF) / 255, green: Double((argb >> 8) & 0xFF) / 255,
                  blue: Double(argb & 0xFF) / 255, opacity: Double((argb >> 24) & 0xFF) / 255)
    }

    /// Glass for controls that sit on the picture itself, whatever the theme.
    static let glass = Color(argb: 0x66000000)
    static let gold = Color(argb: 0xFFFFD27A)
}

private struct PaletteKey: EnvironmentKey { static let defaultValue = Palette.darkPalette }

extension EnvironmentValues {
    var palette: Palette {
        get { self[PaletteKey.self] }
        set { self[PaletteKey.self] = newValue }
    }
}

/// Crisp, nearly square corners, as in an editor.
enum Corners {
    static let small: CGFloat = 3
    static let medium: CGFloat = 6
    static let large: CGFloat = 10
}

/// The two faces, loaded from the bundled files (shared with Android). Both Inter files call
/// themselves "Inter-Regular", so they are made into fonts directly rather than registered.
enum UiType {
    private static var cache: [String: CGFont] = [:]

    private static func cgFont(_ file: String) -> CGFont? {
        if let f = cache[file] { return f }
        guard let url = Bundle.main.url(forResource: file, withExtension: nil, subdirectory: "fonts"),
              let provider = CGDataProvider(url: url as CFURL), let f = CGFont(provider) else { return nil }
        cache[file] = f
        return f
    }

    static func uiFont(_ file: String, _ size: CGFloat) -> UIFont? {
        guard let cg = cgFont(file) else { return nil }
        return CTFontCreateWithGraphicsFont(cg, size, nil, nil) as UIFont
    }

    /// Inter: regular and medium share a file; semibold and bold use the bold one.
    static func sans(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        let bold = weight == .semibold || weight == .bold || weight == .heavy || weight == .black
        if let f = uiFont(bold ? "InterBold.ttf" : "Inter.ttf", size) { return Font(f as CTFont) }
        return .system(size: size, weight: weight)
    }

    static func mono(_ size: CGFloat) -> Font {
        if let f = uiFont("SpaceMono.ttf", size) { return Font(f as CTFont) }
        return .system(size: size, design: .monospaced)
    }
}

/// The press feedback for everything tappable: it sinks to 96% and dims a touch while held,
/// and springs back on release.
struct GentlePress: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .overlay(Color.black.opacity(configuration.isPressed ? 0.08 : 0).allowsHitTesting(false))
            .animation(configuration.isPressed ? .easeOut(duration: 0.09) : .spring(response: 0.35, dampingFraction: 0.55),
                       value: configuration.isPressed)
    }
}

/// The light theme sits on a fine dot grid, like paper.
struct DotGrid: View {
    let color: Color

    var body: some View {
        Canvas { ctx, size in
            let step: CGFloat = 14, r: CGFloat = 0.9
            var y = step / 2
            while y < size.height {
                var x = step / 2
                while x < size.width {
                    ctx.fill(Path(ellipseIn: CGRect(x: x - r, y: y - r, width: 2 * r, height: 2 * r)), with: .color(color))
                    x += step
                }
                y += step
            }
        }
        .allowsHitTesting(false)
    }
}

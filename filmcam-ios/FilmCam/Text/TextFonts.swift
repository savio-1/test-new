import CoreGraphics
import CoreText
import Foundation
import UIKit

/// Makes CoreText fonts from font keys (FontLibrary.typeface on Android). Files are opened as
/// graphics fonts, not registered: Inter.ttf and InterBold.ttf share a PostScript name, and a
/// registered name would pick either. A weight or named instance of a variable font is set on
/// its variation axes. Thread-safe; fonts are cached per key and size.
enum TextFonts {
    private static let lock = NSLock()
    /// Graphics fonts by file.
    private static var graphics: [String: CGFont] = [:]
    private static var sized: [String: CTFont] = [:]
    /// The bytes behind each graphics font, held for as long as the font is.
    private static var fileData: [String: Data] = [:]

    /// The font for [key] at [size] points (pixels, for the renderer). Unknown or missing
    /// fonts fall back to the default face, then to the system font.
    static func font(_ key: String, size: CGFloat) -> CTFont {
        let size = max(1, size)
        let ck = "\(key)|\((size * 100).rounded() / 100)"
        lock.lock()
        if let f = sized[ck] { lock.unlock(); return f }
        lock.unlock()
        let f = make(key, size) ?? (key != FontKeys.defaultKey ? make(FontKeys.defaultKey, size) : nil)
            ?? CTFontCreateUIFontForLanguage(.system, size, nil)!
        lock.lock()
        if sized.count > 400 { sized.removeAll() }
        sized[ck] = f
        lock.unlock()
        return f
    }

    private static func make(_ key: String, _ size: CGFloat) -> CTFont? {
        guard let spec = FontSpec.parse(key) else { return nil }
        if spec.kind == .system {
            switch spec.file {
            case "sans-bold": return CTFontCreateUIFontForLanguage(.emphasizedSystem, size, nil)
            case "serif":
                let base = UIFont.systemFont(ofSize: size)
                if let d = base.fontDescriptor.withDesign(.serif) { return UIFont(descriptor: d, size: size) as CTFont }
                return CTFontCreateWithName("TimesNewRomanPSMT" as CFString, size, nil)
            default: return CTFontCreateUIFontForLanguage(.system, size, nil)
            }
        }
        guard let cg = graphicsFont(key, spec) else { return nil }
        var attrs: [CFString: Any] = [:]
        if !spec.axes.isEmpty {
            var v: [NSNumber: NSNumber] = [:]
            for a in spec.axes { v[NSNumber(value: a.code)] = NSNumber(value: a.value) }
            attrs[kCTFontVariationAttribute] = v
        }
        let desc = CTFontDescriptorCreateWithAttributes(attrs as CFDictionary)
        return CTFontCreateWithGraphicsFont(cg, size, nil, desc)
    }

    /// The file's graphics font (one per file; a variation is set on the CTFont, through its
    /// descriptor). The file's bytes are kept alive with it: a CGFont made by
    /// copy(withVariations:) read freed memory when CoreText applied a variation to it.
    private static func graphicsFont(_ key: String, _ spec: FontSpec) -> CGFont? {
        guard let url = FontLibrary.shared.url(for: spec) else { return nil }
        let fileKey = url.path
        lock.lock()
        if let g = graphics[fileKey] { lock.unlock(); return g }
        lock.unlock()
        guard let data = try? Data(contentsOf: url), let provider = CGDataProvider(data: data as CFData),
              let font = CGFont(provider) else { return nil }
        lock.lock()
        graphics[fileKey] = font
        fileData[fileKey] = data
        lock.unlock()
        return font
    }
}

extension FontLibrary {
    /// Reads and adds font files (or zips of them) the document picker handed over.
    func importAll(urls: [URL]) -> [String] {
        let files: [(name: String, data: Data)] = urls.compactMap { url in
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            guard let d = try? Data(contentsOf: url) else { return nil }
            return (url.lastPathComponent, d)
        }
        return importAll(files)
    }
}

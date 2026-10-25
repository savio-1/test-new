import Foundation

// The fonts for text and subtitles (FontLibrary in TextLayer.kt on Android): plain Foundation,
// so the key parsing, family grouping and imports build and run anywhere. Making the actual
// fonts (CoreText) is in TextFonts.swift.

/// One face the user can pick (Inter Tight Bold, Instrument Italic...), in a [family].
struct FontEntry: Equatable, Hashable {
    let key: String
    let family: String
    let style: String
    var weight: Int = 400
    var italic = false
    var latin = true
    var telugu = false

    var label: String { style.trimmingCharacters(in: .whitespaces).isEmpty || style.lowercased() == "regular" ? family : "\(family) \(style)" }
}

/// A font family and its faces, lightest first, uprights before italics.
struct FontFamilyGroup: Equatable {
    let name: String
    let faces: [FontEntry]

    /// The face shown for the family: its regular, or the one nearest it.
    var main: FontEntry { faces.min { score($0) < score($1) }! }
    var latin: Bool { faces.contains { $0.latin } }
    var telugu: Bool { faces.contains { $0.telugu } }

    private func score(_ e: FontEntry) -> Int { abs(e.weight - 400) + (e.italic ? 1000 : 0) }
}

/// A font key taken apart: "asset:<file>", "asset:<file>#<weight>", "asset:<file>@<settings>",
/// the same with "file:" for imported fonts, and "sys:sans" / "sys:sans-bold" / "sys:serif".
struct FontSpec: Equatable {
    enum Kind: Equatable { case asset, file, system }

    /// One variation axis setting ('wght' 700).
    struct Axis: Equatable {
        let tag: String
        let value: Double

        /// The tag as the 4-byte number CoreText wants ('wght' = 0x77676874).
        var code: UInt32 { tag.utf8.prefix(4).reduce(UInt32(0)) { $0 << 8 | UInt32($1) } }
    }

    let kind: Kind
    /// The file name ("InterTight.ttf"), or the system face ("sans").
    let file: String
    let axes: [Axis]

    static func parse(_ key: String) -> FontSpec? {
        guard let colon = key.firstIndex(of: ":") else { return nil }
        let kindName = key[..<colon]
        let rest = String(key[key.index(after: colon)...])
        let kind: Kind
        switch kindName {
        case "asset": kind = .asset
        case "file": kind = .file
        case "sys": kind = .system
        default: return nil
        }
        if kind == .system { return FontSpec(kind: kind, file: rest, axes: []) }
        if let hash = rest.firstIndex(of: "#") {
            let w = Double(rest[rest.index(after: hash)...].trimmingCharacters(in: .whitespaces)) ?? 400
            return FontSpec(kind: kind, file: String(rest[..<hash]), axes: [Axis(tag: "wght", value: w)])
        }
        if let at = rest.firstIndex(of: "@") {
            return FontSpec(kind: kind, file: String(rest[..<at]), axes: axes(String(rest[rest.index(after: at)...])))
        }
        return FontSpec(kind: kind, file: rest, axes: [])
    }

    /// CSS-style settings ("'wght' 700, 'ital' 1") as axes; unreadable parts are skipped.
    static func axes(_ settings: String) -> [Axis] {
        settings.split(separator: ",").compactMap { part in
            let s = part.trimmingCharacters(in: .whitespaces)
            guard let q1 = s.firstIndex(where: { $0 == "'" || $0 == "\"" }) else { return nil }
            let afterQ1 = s.index(after: q1)
            guard let q2 = s[afterQ1...].firstIndex(where: { $0 == "'" || $0 == "\"" }) else { return nil }
            let tag = String(s[afterQ1..<q2])
            guard tag.utf8.count == 4, let v = Double(s[s.index(after: q2)...].trimmingCharacters(in: .whitespaces)) else { return nil }
            return Axis(tag: tag, value: v)
        }
    }

    /// "file#700" for a weight-only instance, "file@'wght' 700, 'ital' 1" otherwise.
    static func specOf(_ file: String, _ variation: String?) -> String {
        guard let v = variation else { return file }
        let prefix = "'wght' "
        if v.hasPrefix(prefix) {
            let digits = v.dropFirst(prefix.count)
            if !digits.isEmpty && digits.allSatisfy({ $0.isASCII && $0.isNumber }) { return "\(file)#\(digits)" }
        }
        return "\(file)@\(v)"
    }
}

/// Fonts for text and subtitles, grouped into families: the bundled set (SIL Open Font
/// Licence, shared with Android), anything the user imports (font files, or a .zip of a font
/// folder) and a few system faces. Each file's own name table gives its family and style; a
/// variable font offers every named instance it carries (Inter Tight: Thin to Black).
/// Thread-safe: the renderer asks for files from its own queue.
final class FontLibrary {
    static let shared: FontLibrary = {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory())
        return FontLibrary(bundled: Bundle.main.resourceURL?.appendingPathComponent("fonts"),
                           dir: support.appendingPathComponent("fonts"),
                           metaCache: support.appendingPathComponent("font-meta-v1.json"))
    }()

    /// Where the bundled fonts are, where imported ones are kept, and the remembered faces.
    let bundled: URL?
    let dir: URL
    private let metaCache: URL
    private let lock = NSLock()
    private var loaded: (fonts: [FontEntry], families: [FontFamilyGroup])?

    init(bundled: URL?, dir: URL, metaCache: URL) {
        self.bundled = bundled
        self.dir = dir
        self.metaCache = metaCache
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    /// Every face, imported ones first. Read on first use (and after an import).
    var fonts: [FontEntry] { state().fonts }
    var families: [FontFamilyGroup] { state().families }

    private func state() -> (fonts: [FontEntry], families: [FontFamilyGroup]) {
        lock.lock(); defer { lock.unlock() }
        if let l = loaded { return l }
        let f = load()
        let l = (f, Self.group(f))
        loaded = l
        return l
    }

    /// Families in the order their first face appears; faces lightest first, uprights first.
    static func group(_ all: [FontEntry]) -> [FontFamilyGroup] {
        var order: [String] = []
        var byName: [String: [(Int, FontEntry)]] = [:]
        for (i, e) in all.enumerated() {
            if byName[e.family] == nil { order.append(e.family); byName[e.family] = [] }
            byName[e.family]!.append((i, e))
        }
        return order.map { name in
            let faces = byName[name]!.sorted { a, b in
                if a.1.italic != b.1.italic { return !a.1.italic }
                if a.1.weight != b.1.weight { return a.1.weight < b.1.weight }
                return a.0 < b.0
            }.map { $0.1 }
            return FontFamilyGroup(name: name, faces: faces)
        }
    }

    // MARK: - Reading the files

    private struct CachedFace: Codable {
        var family: String
        var style: String
        var weight: Int
        var italic: Bool
        var variation: String?
    }

    /// Faces of a font file, read once and remembered in [cache] (the bundled set is 18 MB to scan).
    private func metaOf(_ name: String, _ cache: inout [String: [CachedFace]], _ bytes: () -> Data?) -> [FontMeta.Face] {
        if let c = cache[name] {
            return c.map { FontMeta.Face(family: $0.family, style: $0.style, weight: $0.weight, italic: $0.italic, variation: $0.variation) }
        }
        guard let data = bytes() else { return [] }
        let faces = FontMeta.read(data)
        cache[name] = faces.map { CachedFace(family: $0.family, style: $0.style, weight: $0.weight, italic: $0.italic, variation: $0.variation) }
        return faces
    }

    private func load() -> [FontEntry] {
        var out: [FontEntry] = []
        let cached = (try? Data(contentsOf: metaCache)).flatMap { try? JSONDecoder().decode([String: [CachedFace]].self, from: $0) } ?? [:]
        var cache = cached
        defer {
            if cache.count != cached.count, let data = try? JSONEncoder().encode(cache) { try? data.write(to: metaCache, options: .atomic) }
        }
        // Imported fonts first: they are the person's own.
        let fm = FileManager.default
        let names = ((try? fm.contentsOfDirectory(atPath: dir.path)) ?? [])
            .filter { Self.fontExt.contains(($0 as NSString).pathExtension.lowercased()) }
            .sorted()
        for name in names {
            let url = dir.appendingPathComponent(name)
            let size = ((try? fm.attributesOfItem(atPath: url.path))?[.size] as? NSNumber)?.intValue ?? 0
            var faces = metaOf("file:\(name):\(size)", &cache) { try? Data(contentsOf: url) }
            if faces.isEmpty {
                faces = [FontMeta.Face(family: String((name as NSString).deletingPathExtension.prefix(24)), style: "Regular", weight: 400, italic: false)]
            }
            for face in faces {
                out.append(FontEntry(key: "file:" + FontSpec.specOf(name, face.variation), family: face.family, style: face.style,
                                     weight: face.weight, italic: face.italic, latin: true, telugu: true))
            }
        }
        var files: [String] = []
        for f in Self.bundledFiles.map({ $0.0 }) + Self.weighted.map({ String($0.0.split(separator: "#")[0]) }) where !files.contains(f) {
            files.append(f)
        }
        for file in files {
            let url = bundled?.appendingPathComponent(file)
            let faces = metaOf("asset:\(file)", &cache) { url.flatMap { try? Data(contentsOf: $0) } }
            guard let family = Self.family[file] ?? faces.first?.family else { continue }
            let latin = !Self.teluguOnly.contains(file)
            let telugu = Self.telugu.contains(file)
            for face in faces.isEmpty ? [FontMeta.Face(family: family, style: "Regular", weight: 400, italic: false)] : faces {
                out.append(FontEntry(key: "asset:" + FontSpec.specOf(file, face.variation), family: family, style: face.style,
                                     weight: face.weight, italic: face.italic, latin: latin, telugu: telugu))
            }
        }
        out.append(FontEntry(key: "sys:sans", family: "System Sans", style: "Regular"))
        out.append(FontEntry(key: "sys:sans-bold", family: "System Sans", style: "Bold", weight: 700))
        out.append(FontEntry(key: "sys:serif", family: "System Serif", style: "Regular"))
        return out
    }

    /// The file behind a key (nil for system faces, or a file that has gone).
    func url(for spec: FontSpec) -> URL? {
        switch spec.kind {
        case .asset: return bundled?.appendingPathComponent(spec.file)
        case .file: return dir.appendingPathComponent(spec.file)
        case .system: return nil
        }
    }

    // MARK: - Lookups

    func entry(_ key: String) -> FontEntry? { fonts.first { $0.key == key } }

    func label(_ key: String) -> String { entry(key)?.label ?? "Sans" }

    /// The family [key] belongs to.
    func familyOf(_ key: String) -> FontFamilyGroup? {
        guard let e = entry(key) else { return nil }
        return families.first { $0.name == e.family }
    }

    /// The face in [family] closest to [like] (same weight and slant if it has them).
    func nearest(_ family: FontFamilyGroup, like: String?) -> FontEntry {
        guard let ref = like.flatMap({ entry($0) }) else { return family.main }
        return family.faces.min { a, b in
            (abs(a.weight - ref.weight) + (a.italic != ref.italic ? 1000 : 0)) < (abs(b.weight - ref.weight) + (b.italic != ref.italic ? 1000 : 0))
        }!
    }

    // MARK: - Imports

    /// Adds fonts the user picked: font files, or .zip files of a font folder (every .ttf/.otf
    /// inside is taken, whatever folders it is in). Returns the keys of the faces added.
    func importAll(_ files: [(name: String, data: Data)]) -> [String] {
        let before = Set(fonts.map { $0.key })
        for (name, bytes) in files {
            if bytes.count > 4 && bytes[bytes.startIndex] == UInt8(ascii: "P") && bytes[bytes.startIndex + 1] == UInt8(ascii: "K") {
                let entries = (try? ZipReader.entries(in: bytes) { Self.fontExt.contains(($0 as NSString).pathExtension.lowercased()) }) ?? []
                for e in entries { save(e.fileName, e.data) }
            } else {
                save(name.contains(".") ? name : name + ".ttf", bytes)
            }
        }
        lock.lock(); loaded = nil; lock.unlock()
        return fonts.map { $0.key }.filter { !before.contains($0) }
    }

    private func save(_ name: String, _ bytes: Data) {
        if FontMeta.read(bytes).isEmpty { return }   // not a font we can read
        let safe = String(name.map { c -> Character in
            c.isASCII && (c.isLetter || c.isNumber || c == "." || c == "_" || c == " " || c == "-") ? c : "_"
        })
        try? bytes.write(to: dir.appendingPathComponent(safe), options: .atomic)
    }

    // MARK: - The bundled set

    static let defaultKey = FontKeys.defaultKey
    static let fontExt: Set<String> = ["ttf", "otf", "ttc"]

    static let bundledFiles: [(String, String)] = [
        ("InstrumentSerif.ttf", "Instrument"),
        ("InstrumentSerif-Italic.ttf", "Instrument Italic"),
        ("Inter.ttf", "Inter"),
        ("InterBold.ttf", "Inter Bold"),
        ("DMSerifDisplay.ttf", "DM Serif"),
        ("PlayfairDisplay.ttf", "Playfair"),
        ("BebasNeue.ttf", "Bebas"),
        ("SpaceMono.ttf", "Space Mono"),
        ("CourierPrime.ttf", "Typewriter"),
        ("VT323.ttf", "VHS"),
        ("Caveat.ttf", "Handwritten"),
        ("Poppins-SemiBold.ttf", "Poppins"),
        ("Poppins-Bold.ttf", "Poppins Bold"),
        ("Anton-Regular.ttf", "Anton"),
        ("ArchivoBlack-Regular.ttf", "Archivo Black"),
        ("Bangers-Regular.ttf", "Bangers"),
        ("Righteous-Regular.ttf", "Righteous"),
        ("Lobster-Regular.ttf", "Lobster"),
        ("Pacifico-Regular.ttf", "Pacifico"),
        // Telugu
        ("NotoSansTelugu.ttf", "తెలుగు Sans"),
        ("Ramabhadra.ttf", "రామభద్ర"),
        ("Mandali.ttf", "మండలి"),
        ("Gurajada.ttf", "గురజాడ"),
        ("TenaliRamakrishna.ttf", "తెనాలి"),
        ("HindGuntur-SemiBold.ttf", "హింద్ గుంటూరు"),
        ("HindGuntur-Bold.ttf", "హింద్ గుంటూరు Bold"),
        ("NTR-Regular.ttf", "ఎన్టీఆర్"),
        ("Suravaram-Regular.ttf", "సురవరం"),
        ("Ponnala-Regular.ttf", "పొన్నాల"),
        ("Mallanna-Regular.ttf", "మల్లన్న"),
        ("Gidugu-Regular.ttf", "గిడుగు"),
        ("Dhurjati-Regular.ttf", "ధూర్జటి"),
        ("Timmana-Regular.ttf", "తిమ్మన"),
        ("SreeKrushnadevaraya-Regular.ttf", "శ్రీకృష్ణదేవరాయ"),
        ("Peddana-Regular.ttf", "పెద్దన"),
        ("LakkiReddy-Regular.ttf", "లక్కిరెడ్డి"),
    ]

    static let weighted: [(String, String)] = [
        ("InterTight.ttf#500", "Inter Tight"),
        ("InterTight.ttf#700", "Inter Tight Bold"),
        ("InterTight.ttf#800", "Inter Tight Heavy"),
        ("InterTight-Italic.ttf#700", "Inter Tight Italic"),
        ("NotoSansTelugu.ttf#700", "తెలుగు Bold"),
        ("Montserrat.ttf#600", "Montserrat"),
        ("Montserrat.ttf#800", "Montserrat Heavy"),
        ("Oswald.ttf#600", "Oswald"),
        ("Nunito.ttf#800", "Nunito"),
        ("Rubik.ttf#700", "Rubik"),
        ("Lora.ttf#600", "Lora"),
        ("AnekTelugu.ttf#600", "అనేక్"),
        ("AnekTelugu.ttf#800", "అనేక్ Heavy"),
        ("BalooTammudu2.ttf#700", "బాలూ తమ్ముడు"),
        ("NotoSerifTelugu.ttf#700", "తెలుగు Serif"),
    ]

    /// Names the picker shows for the bundled families (Telugu ones in Telugu).
    static let family: [String: String] = [
        "InstrumentSerif.ttf": "Instrument", "InstrumentSerif-Italic.ttf": "Instrument",
        "Inter.ttf": "Inter", "InterBold.ttf": "Inter", "InterTight.ttf": "Inter Tight", "InterTight-Italic.ttf": "Inter Tight",
        "DMSerifDisplay.ttf": "DM Serif", "PlayfairDisplay.ttf": "Playfair", "BebasNeue.ttf": "Bebas",
        "SpaceMono.ttf": "Space Mono", "CourierPrime.ttf": "Typewriter", "VT323.ttf": "VHS", "Caveat.ttf": "Handwritten",
        "Poppins-SemiBold.ttf": "Poppins", "Poppins-Bold.ttf": "Poppins",
        "NotoSansTelugu.ttf": "తెలుగు Sans", "NotoSerifTelugu.ttf": "తెలుగు Serif", "Ramabhadra.ttf": "రామభద్ర",
        "Mandali.ttf": "మండలి", "Gurajada.ttf": "గురజాడ", "TenaliRamakrishna.ttf": "తెనాలి",
        "HindGuntur-SemiBold.ttf": "హింద్ గుంటూరు", "HindGuntur-Bold.ttf": "హింద్ గుంటూరు", "NTR-Regular.ttf": "ఎన్టీఆర్",
        "Suravaram-Regular.ttf": "సురవరం", "Ponnala-Regular.ttf": "పొన్నాల", "Mallanna-Regular.ttf": "మల్లన్న",
        "Gidugu-Regular.ttf": "గిడుగు", "Dhurjati-Regular.ttf": "ధూర్జటి", "Timmana-Regular.ttf": "తిమ్మన",
        "SreeKrushnadevaraya-Regular.ttf": "శ్రీకృష్ణదేవరాయ", "Peddana-Regular.ttf": "పెద్దన", "LakkiReddy-Regular.ttf": "లక్కిరెడ్డి",
        "AnekTelugu.ttf": "అనేక్", "BalooTammudu2.ttf": "బాలూ తమ్ముడు",
    ]

    /// Fonts with Telugu letters, and those with none of their own Latin ones.
    static let telugu: Set<String> = [
        "NotoSansTelugu.ttf", "Ramabhadra.ttf", "Mandali.ttf", "Gurajada.ttf", "TenaliRamakrishna.ttf",
        "HindGuntur-SemiBold.ttf", "HindGuntur-Bold.ttf", "NTR-Regular.ttf", "Suravaram-Regular.ttf",
        "Ponnala-Regular.ttf", "Mallanna-Regular.ttf", "Gidugu-Regular.ttf", "Dhurjati-Regular.ttf",
        "Timmana-Regular.ttf", "SreeKrushnadevaraya-Regular.ttf", "Peddana-Regular.ttf", "LakkiReddy-Regular.ttf",
        "AnekTelugu.ttf", "BalooTammudu2.ttf", "NotoSerifTelugu.ttf",
    ]
    static let teluguOnly: Set<String> = ["Ponnala-Regular.ttf"]

    /// Subtitle defaults: a bold sans for Latin, a bold Telugu face.
    static let subtitleLatin = "asset:InterBold.ttf"
    static let subtitleTelugu = FontKeys.subtitleTelugu
}

import Foundation

/// What a font file says about itself: its family and style names, weight and slant, and for a
/// variable font each named instance it carries (Thin, Regular, Bold Italic...). Read straight
/// from the OpenType tables, so imported fonts group into families by their real names.
enum FontMeta {
    /// One face: a static font, or a named instance of a variable one (`variation` set, as
    /// CSS-style font-variation-settings, e.g. "'wght' 700, 'wdth' 100").
    struct Face: Equatable, Hashable {
        let family: String
        let style: String
        let weight: Int
        let italic: Bool
        var variation: String? = nil
    }

    /// The faces in `data` (a .ttf/.otf; a collection's first font), or empty if unreadable.
    static func read(_ data: Data) -> [Face] {
        (try? parse(Reader(bytes: [UInt8](data)))) ?? []
    }

    /// Big-endian reads that throw instead of trapping when the file is cut short.
    private struct Reader {
        let bytes: [UInt8]
        struct OutOfRange: Error {}

        func u8(_ at: Int) throws -> UInt8 {
            guard at >= 0 && at < bytes.count else { throw OutOfRange() }
            return bytes[at]
        }
        func u16(_ at: Int) throws -> Int {
            guard at >= 0 && at + 2 <= bytes.count else { throw OutOfRange() }
            return Int(bytes[at]) << 8 | Int(bytes[at + 1])
        }
        func i32(_ at: Int) throws -> Int32 {
            guard at >= 0 && at + 4 <= bytes.count else { throw OutOfRange() }
            let v = UInt32(bytes[at]) << 24 | UInt32(bytes[at + 1]) << 16 | UInt32(bytes[at + 2]) << 8 | UInt32(bytes[at + 3])
            return Int32(bitPattern: v)
        }
        func slice(_ at: Int, _ len: Int) throws -> ArraySlice<UInt8> {
            guard at >= 0 && len >= 0 && at + len <= bytes.count else { throw OutOfRange() }
            return bytes[at..<(at + len)]
        }
        func tag(_ at: Int) throws -> String {
            String(decoding: try slice(at, 4), as: Unicode.ASCII.self)
        }
    }

    private static func parse(_ b: Reader) throws -> [Face] {
        var base = 0
        if try b.i32(0) == 0x74746366 { base = Int(try b.i32(12)) }   // 'ttcf': the first font in the collection
        let numTables = try b.u16(base + 4)
        var tables: [String: Int] = [:]
        for i in 0..<numTables {
            let r = base + 12 + i * 16
            tables[try b.tag(r)] = Int(try b.i32(r + 8))
        }
        let names = try tables["name"].map { try self.names(b, $0) } ?? [:]
        guard let family = names[16] ?? names[1] else { return [] }
        let sub = names[17] ?? names[2] ?? "Regular"
        let os2 = tables["OS/2"]
        let weight = try os2.map { try b.u16($0 + 4) } ?? 400
        let italic = try os2.map { try b.u16($0 + 62) & 1 != 0 } ?? containsIgnoringCase(sub, "Italic")
        if let fvar = tables["fvar"] {
            let axesOff = try b.u16(fvar + 4)
            let axisCount = try b.u16(fvar + 8)
            let axisSize = try b.u16(fvar + 10)
            let instCount = try b.u16(fvar + 12)
            let instSize = try b.u16(fvar + 14)
            var tags: [String] = []
            for i in 0..<axisCount { tags.append(try b.tag(fvar + axesOff + i * axisSize)) }
            var faces: [Face] = []
            let instStart = fvar + axesOff + axisCount * axisSize
            for i in 0..<instCount {
                let r = instStart + i * instSize
                let nameId = try b.u16(r)
                var coords: [Float] = []
                for k in 0..<axisCount { coords.append(Float(try b.i32(r + 4 + k * 4)) / 65536) }
                guard let style = names[nameId] else { continue }
                let w = tags.firstIndex(of: "wght").map { Int(coords[$0]) } ?? weight
                let ital = (tags.firstIndex(of: "ital").map { coords[$0] >= 0.5 } ?? false) ||
                    (tags.firstIndex(of: "slnt").map { coords[$0] != 0 } ?? false) ||
                    (italic && containsIgnoringCase(style, "Italic"))
                let settings = tags.indices.map { "'\(tags[$0])' \(fmt(coords[$0]))" }.joined(separator: ", ")
                faces.append(Face(family: family, style: style, weight: w, italic: ital, variation: settings))
            }
            if !faces.isEmpty {
                // Distinct by style name, first one wins.
                var seen = Set<String>()
                return faces.filter { seen.insert($0.style).inserted }
            }
        }
        return [Face(family: family, style: sub, weight: weight, italic: italic)]
    }

    private static func fmt(_ v: Float) -> String {
        if v == Float(Int(v)) { return String(Int(v)) }
        return String(format: "%.2f", Double(v))
    }

    private static func containsIgnoringCase(_ s: String, _ what: String) -> Bool {
        s.range(of: what, options: .caseInsensitive) != nil
    }

    /// Name records by id: Windows Unicode (English first) preferred, then Mac Roman.
    private static func names(_ b: Reader, _ t: Int) throws -> [Int: String] {
        let count = try b.u16(t + 2)
        let strings = t + (try b.u16(t + 4))
        var out: [Int: (rank: Int, text: String)] = [:]
        for i in 0..<count {
            let r = t + 6 + i * 12
            let platform = try b.u16(r)
            let lang = try b.u16(r + 4)
            let id = try b.u16(r + 6)
            let len = try b.u16(r + 8)
            let off = try b.u16(r + 10)
            let raw = try b.slice(strings + off, len)
            let rank: Int
            let text: String
            switch platform {
            case 3, 0:
                rank = (lang == 0x409 || platform == 0) ? 0 : 1
                text = utf16be(raw)
            case 1:
                rank = 2
                text = String(raw.map { Character(Unicode.Scalar($0)) })   // ISO 8859-1, as the Kotlin reads it
            default:
                continue
            }
            let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty, out[id].map({ rank < $0.rank }) ?? true { out[id] = (rank, trimmed) }
        }
        return out.mapValues { $0.text }
    }

    /// UTF-16BE text; bad surrogates and a stray last byte become U+FFFD.
    private static func utf16be(_ raw: ArraySlice<UInt8>) -> String {
        var units: [UInt16] = []
        units.reserveCapacity(raw.count / 2 + 1)
        var i = raw.startIndex
        while i + 1 < raw.endIndex {
            units.append(UInt16(raw[i]) << 8 | UInt16(raw[i + 1]))
            i += 2
        }
        if i < raw.endIndex { units.append(0xFFFD) }
        return String(decoding: units, as: UTF16.self)
    }
}

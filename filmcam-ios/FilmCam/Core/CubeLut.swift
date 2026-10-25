import Foundation

/// A .cube that couldn't be read, with why.
struct CubeException: Error, LocalizedError, CustomStringConvertible {
    let message: String
    init(_ message: String) { self.message = message }
    var description: String { message }
    var errorDescription: String? { message }
}

/// An Adobe / Resolve .cube 3D LUT. `data` holds size^3 RGB triples with red changing fastest,
/// then green, then blue, as the file lists them.
struct CubeLut {
    let title: String
    let size: Int
    let data: [Float]
    let domainMin: [Float]
    let domainMax: [Float]

    /// The output for an input colour in 0..1 (trilinear, inputs mapped onto the domain).
    func sample(_ r: Float, _ g: Float, _ b: Float) -> (Float, Float, Float) {
        var out: (Float, Float, Float) = (0, 0, 0)
        data.withUnsafeBufferPointer { d in sample(d, r, g, b, &out) }
        return out
    }

    private func sample(_ data: UnsafeBufferPointer<Float>, _ r: Float, _ g: Float, _ b: Float, _ out: inout (Float, Float, Float)) {
        let n = size - 1
        func pos(_ v: Float, _ c: Int) -> Float {
            let span = domainMax[c] - domainMin[c]
            let t = span > 0 ? (v - domainMin[c]) / span : v
            return CubeLut.clamp01(t) * Float(n)
        }
        let pr = pos(r, 0), pg = pos(g, 1), pb = pos(b, 2)
        let r0 = min(CubeLut.toInt(pr), n - 1), g0 = min(CubeLut.toInt(pg), n - 1), b0 = min(CubeLut.toInt(pb), n - 1)
        let fr = pr - Float(r0), fg = pg - Float(g0), fb = pb - Float(b0)
        let size = self.size
        let i000 = ((b0 * size + g0) * size + r0) * 3
        let dr = 3, dg = size * 3, db = size * size * 3
        func channel(_ c: Int) -> Float {
            let i = i000 + c
            let c00 = data[i] * (1 - fr) + data[i + dr] * fr
            let c10 = data[i + dg] * (1 - fr) + data[i + dg + dr] * fr
            let c01 = data[i + db] * (1 - fr) + data[i + db + dr] * fr
            let c11 = data[i + db + dg] * (1 - fr) + data[i + db + dg + dr] * fr
            return CubeLut.clamp01((c00 * (1 - fg) + c10 * fg) * (1 - fb) + (c01 * (1 - fg) + c11 * fg) * fb)
        }
        out = (channel(0), channel(1), channel(2))
    }

    /// The share of lattice points that jump away from their neighbours (more than 0.15 from
    /// the mean of the six around them): near 0 for any real grade; a watermark or text burnt
    /// into a Hald image shows up as a patch of them.
    func roughness() -> Float {
        if size < 3 { return 0 }
        var bad = 0
        var total = 0
        let size = self.size
        data.withUnsafeBufferPointer { d in
            func at(_ r: Int, _ g: Int, _ b: Int, _ c: Int) -> Float { d[((b * size + g) * size + r) * 3 + c] }
            for b in 1..<(size - 1) {
                for g in 1..<(size - 1) {
                    for r in 1..<(size - 1) {
                        total += 1
                        for c in 0..<3 {
                            let mean = (at(r - 1, g, b, c) + at(r + 1, g, b, c) + at(r, g - 1, b, c) + at(r, g + 1, b, c) +
                                at(r, g, b - 1, c) + at(r, g, b + 1, c)) / 6
                            if abs(at(r, g, b, c) - mean) > 0.15 { bad += 1; break }
                        }
                    }
                }
            }
        }
        return total == 0 ? 0 : Float(bad) / Float(total)
    }

    /// The app's LUT strip: 33^3 as a 1089x33 ARGB image (0xAARRGGBB, row-major), pixel
    /// (x = b*33 + r, y = g) holding the output for input (r, g, b)/32.
    func toStrip() -> [UInt32] {
        let n = 33
        var px = [UInt32](repeating: 0, count: n * n * n)
        var o: (Float, Float, Float) = (0, 0, 0)
        data.withUnsafeBufferPointer { d in
            for b in 0..<n {
                for g in 0..<n {
                    for r in 0..<n {
                        sample(d, Float(r) / 32, Float(g) / 32, Float(b) / 32, &o)
                        let ir = UInt32(CubeLut.toInt(o.0 * 255 + 0.5))
                        let ig = UInt32(CubeLut.toInt(o.1 * 255 + 0.5))
                        let ib = UInt32(CubeLut.toInt(o.2 * 255 + 0.5))
                        px[g * (n * n) + b * n + r] = 0xFF00_0000 | ir << 16 | ig << 8 | ib
                    }
                }
            }
        }
        return px
    }

    /// A Hald CLUT: an identity image of every colour (`level`^3 pixels square, a `level`^2-point
    /// cube, red changing fastest, row by row) after it has been through a grade. Each pixel is
    /// the grade's output for its colour. `argb` holds the pixels (0xAARRGGBB, row-major).
    static func fromHald(width: Int, height: Int, argb: [UInt32]) throws -> CubeLut {
        guard let level = (2...16).first(where: { $0 * $0 * $0 == width }) else {
            throw CubeException("That image isn't a Hald CLUT: it should be square, 512×512 (or another level³ size), not \(width)×\(height)")
        }
        if height != width {
            throw CubeException("A Hald CLUT is square; this one is \(width)×\(height). Render it at its original size, without scaling or cropping")
        }
        let n = level * level
        guard argb.count >= n * n * n else { throw CubeException("The Hald image has fewer pixels than \(width)×\(height)") }
        var data = [Float](repeating: 0, count: n * n * n * 3)
        for i in 0..<(n * n * n) {
            let c = argb[i]
            data[i * 3] = Float((c >> 16) & 255) / 255
            data[i * 3 + 1] = Float((c >> 8) & 255) / 255
            data[i * 3 + 2] = Float(c & 255) / 255
        }
        return CubeLut(title: "", size: n, data: data, domainMin: [0, 0, 0], domainMax: [1, 1, 1])
    }

    /// The identity Hald CLUT of `level` (8: 512×512, a 64-point cube), as ARGB pixels.
    static func identityHald(level: Int) -> [UInt32] {
        let n = level * level
        func v(_ x: Int) -> UInt32 { UInt32(toInt(Float(x) * 255 / Float(n - 1) + 0.5)) }
        return (0..<(n * n * n)).map { i in
            let r = i % n, g = i / n % n, b = i / (n * n)
            return 0xFF00_0000 | v(r) << 16 | v(g) << 8 | v(b)
        }
    }

    /// Reads a .cube file's text: TITLE, LUT_3D_SIZE, DOMAIN_MIN / DOMAIN_MAX and the rows;
    /// other keywords (LUT_3D_INPUT_RANGE...) are skipped. Throws `CubeException` saying why.
    static func parse(_ text: String) throws -> CubeLut {
        var title = ""
        var size = 0
        var minV: [Float] = [0, 0, 0]
        var maxV: [Float] = [1, 1, 1]
        var values: [Float] = []
        var count = 0
        for raw in lines(text) {
            let line = kotlinTrim(raw.firstIndex(of: "#").map { raw[..<$0] } ?? raw[...])
            if line.isEmpty { continue }
            let parts = splitWhitespace(line)
            if line.first!.isLetter {
                switch parts[0].uppercased() {
                case "TITLE":
                    // As Kotlin's substringAfter("TITLE"): the whole line if the case differs.
                    let after = line.range(of: "TITLE").map { String(line[$0.upperBound...]) } ?? line
                    title = trimQuotes(kotlinTrim(after[...]))
                case "LUT_3D_SIZE":
                    guard parts.count > 1, let s = Int(parts[1]) else { throw CubeException("Bad LUT_3D_SIZE") }
                    size = s
                    if !(2...256).contains(size) { throw CubeException("LUT size \(size) isn't supported") }
                    values = [Float](repeating: 0, count: size * size * size * 3)
                case "LUT_1D_SIZE":
                    throw CubeException("This is a 1D LUT; only 3D LUTs can be used as a look")
                case "DOMAIN_MIN":
                    for c in 0..<3 { minV[c] = parts.count > c + 1 ? (parseFloat(parts[c + 1]) ?? 0) : 0 }
                case "DOMAIN_MAX":
                    for c in 0..<3 { maxV[c] = parts.count > c + 1 ? (parseFloat(parts[c + 1]) ?? 1) : 1 }
                default:
                    break   // LUT_3D_INPUT_RANGE and other keywords: not needed
                }
                continue
            }
            if size == 0 { throw CubeException("No LUT_3D_SIZE before the data") }
            if parts.count < 3 { continue }
            if count >= size * size * size { throw CubeException("More rows than LUT_3D_SIZE says") }
            for c in 0..<3 {
                guard let v = parseFloat(parts[c]) else { throw CubeException("Bad number: \(parts[c])") }
                values[count * 3 + c] = v
            }
            count += 1
        }
        if size == 0 { throw CubeException("Not a 3D .cube file") }
        if count != size * size * size { throw CubeException("Expected \(size * size * size) rows, found \(count)") }
        return CubeLut(title: title, size: size, data: values, domainMin: minV, domainMax: maxV)
    }

    // ------------------------------------------------------------------ Kotlin semantics

    /// coerceIn(0f, 1f): NaN passes through.
    @inline(__always)
    private static func clamp01(_ v: Float) -> Float { v < 0 ? 0 : (v > 1 ? 1 : v) }

    /// Float.toInt(): truncates, NaN gives 0, out-of-range saturates (Swift's Int() would trap).
    @inline(__always)
    private static func toInt(_ v: Float) -> Int {
        if v != v { return 0 }
        if v >= 2147483648 { return Int(Int32.max) }
        if v <= -2147483648 { return Int(Int32.min) }
        return Int(v)
    }

    /// lineSequence(): lines split at \r\n, \n or \r.
    private static func lines(_ text: String) -> [Substring] {
        var out: [Substring] = []
        var start = text.startIndex
        var i = text.startIndex
        // Swift treats "\r\n" as one Character, so checking each Character covers all three.
        while i < text.endIndex {
            let ch = text[i]
            if ch == "\n" || ch == "\r" || ch == "\r\n" {
                out.append(text[start..<i])
                start = text.index(after: i)
            }
            i = text.index(after: i)
        }
        out.append(text[start...])
        return out
    }

    /// trim(): drops leading and trailing whitespace.
    private static func kotlinTrim(_ s: Substring) -> String {
        String(s.drop(while: { $0.isWhitespace }).reversed().drop(while: { $0.isWhitespace }).reversed())
    }

    /// trim('"').
    private static func trimQuotes(_ s: String) -> String {
        String(s.drop(while: { $0 == "\"" }).reversed().drop(while: { $0 == "\"" }).reversed())
    }

    /// split(Regex("\\s+")) on a trimmed line (Java's \s: space, \t, \n, \u{0B}, \f, \r).
    private static func splitWhitespace(_ s: String) -> [String] {
        s.unicodeScalars.split(whereSeparator: { [" ", "\t", "\n", "\u{0B}", "\u{0C}", "\r"].contains($0) })
            .map { String(String.UnicodeScalarView($0)) }
    }

    /// toFloatOrNull(): Java float syntax, including a trailing f/F/d/D type suffix.
    private static func parseFloat(_ s: String) -> Float? {
        switch s {
        case "NaN", "+NaN", "-NaN": return .nan
        case "Infinity", "+Infinity": return .infinity
        case "-Infinity": return -.infinity
        default: break
        }
        var t = Substring(s)
        if let last = t.last, "fFdD".contains(last), t.count > 1 { t = t.dropLast() }
        // Java spells out only "NaN" and "Infinity" (above); Swift would also take "nan", "inf".
        if t.contains(where: { $0 == "n" || $0 == "N" }) { return nil }
        return Float(t)
    }
}

import Foundation

/// Reads the files out of a .zip held in memory: stored and deflated entries, with the
/// deflate decoder (RFC 1951) written here in plain Swift so it behaves the same on iOS and
/// Linux. Used to import a zipped font folder; directories, macOS resource forks (__MACOSX)
/// and hidden dot files are skipped, and each entry's CRC-32 is checked.
///
///     let fonts = try ZipReader.entries(in: data) { name in
///         ["ttf", "otf", "ttc"].contains((name as NSString).pathExtension.lowercased())
///     }
enum ZipReader {
    /// One file from the archive: its path inside the zip ("Family/Font-Bold.ttf") and contents.
    struct Entry: Equatable {
        let name: String
        let data: Data

        /// The last path component ("Font-Bold.ttf").
        var fileName: String { name.split(separator: "/").last.map(String.init) ?? name }
    }

    /// Why an archive couldn't be read.
    struct ZipError: Error, LocalizedError, CustomStringConvertible {
        let message: String
        init(_ message: String) { self.message = message }
        var description: String { message }
        var errorDescription: String? { message }
    }

    /// The archive's files in central-directory order. `include` sees each entry's path before it
    /// is decompressed, so unwanted files cost nothing; `skipHidden` drops __MACOSX/ and any
    /// path with a component starting with "." (.DS_Store, ._Font.ttf...).
    static func entries(in data: Data, skipHidden: Bool = true, include: (String) -> Bool = { _ in true }) throws -> [Entry] {
        let bytes = [UInt8](data)
        return try bytes.withUnsafeBufferPointer { try read(ByteReader(bytes: $0), skipHidden: skipHidden, include: include) }
    }

    /// The archive's entry paths (no decompression), after the same hidden-file filter.
    static func names(in data: Data, skipHidden: Bool = true) throws -> [String] {
        let bytes = [UInt8](data)
        return try bytes.withUnsafeBufferPointer { buf in
            try directory(ByteReader(bytes: buf)).filter { !$0.isDirectory && !(skipHidden && isHidden($0.name)) }.map { $0.name }
        }
    }

    // ------------------------------------------------------------------ archive structure

    private struct ByteReader {
        let bytes: UnsafeBufferPointer<UInt8>
        var count: Int { bytes.count }

        func u16(_ at: Int) throws -> Int {
            guard at >= 0 && at + 2 <= bytes.count else { throw ZipError("The zip file is cut short") }
            return Int(bytes[at]) | Int(bytes[at + 1]) << 8
        }
        func u32(_ at: Int) throws -> Int {
            guard at >= 0 && at + 4 <= bytes.count else { throw ZipError("The zip file is cut short") }
            return Int(bytes[at]) | Int(bytes[at + 1]) << 8 | Int(bytes[at + 2]) << 16 | Int(bytes[at + 3]) << 24
        }
        func u64(_ at: Int) throws -> Int {
            let lo = try u32(at), hi = try u32(at + 4)
            guard hi < 0x8000_0000 else { throw ZipError("The zip file is too large") }
            return lo | hi << 32
        }
        func slice(_ at: Int, _ len: Int) throws -> UnsafeBufferPointer<UInt8> {
            guard at >= 0 && len >= 0 && at + len <= bytes.count else { throw ZipError("The zip file is cut short") }
            return UnsafeBufferPointer(rebasing: bytes[at..<(at + len)])
        }
    }

    private struct CentralRecord {
        let name: String
        let flags: Int
        let method: Int
        let crc: UInt32
        let compressedSize: Int
        let size: Int
        let localOffset: Int
        var isDirectory: Bool { name.hasSuffix("/") }
    }

    private static func isHidden(_ name: String) -> Bool {
        let parts = name.split(separator: "/")
        return parts.contains { $0 == "__MACOSX" || $0.hasPrefix(".") }
    }

    /// Finds the end-of-central-directory record (and its zip64 form) and lists the entries.
    private static func directory(_ b: ByteReader) throws -> [CentralRecord] {
        guard b.count >= 22 else { throw ZipError("That isn't a zip file") }
        var eocd = -1
        var i = b.count - 22
        let lowest = max(0, b.count - 22 - 0xFFFF)
        while i >= lowest {
            if b.bytes[i] == 0x50 && b.bytes[i + 1] == 0x4B && b.bytes[i + 2] == 0x05 && b.bytes[i + 3] == 0x06 { eocd = i; break }
            i -= 1
        }
        guard eocd >= 0 else { throw ZipError("That isn't a zip file") }
        var total = try b.u16(eocd + 10)
        var cdSize = try b.u32(eocd + 12)
        var cdOffset = try b.u32(eocd + 16)
        if total == 0xFFFF || cdSize == 0xFFFF_FFFF || cdOffset == 0xFFFF_FFFF {
            // Zip64: the locator sits just before the end record.
            let loc = eocd - 20
            if loc >= 0, try b.u32(loc) == 0x0706_4B50 {
                let rec = try b.u64(loc + 8)
                guard try b.u32(rec) == 0x0606_4B50 else { throw ZipError("The zip64 directory is damaged") }
                total = try b.u64(rec + 32)
                cdSize = try b.u64(rec + 40)
                cdOffset = try b.u64(rec + 48)
            }
        }
        guard cdOffset + cdSize <= b.count else { throw ZipError("The zip file is cut short") }
        var out: [CentralRecord] = []
        out.reserveCapacity(min(total, 65536))
        var p = cdOffset
        for _ in 0..<total {
            guard try b.u32(p) == 0x0201_4B50 else { throw ZipError("The zip directory is damaged") }
            let flags = try b.u16(p + 8)
            let method = try b.u16(p + 10)
            let crc = UInt32(try b.u32(p + 16))
            var compressed = try b.u32(p + 20)
            var size = try b.u32(p + 24)
            let nameLen = try b.u16(p + 28)
            let extraLen = try b.u16(p + 30)
            let commentLen = try b.u16(p + 32)
            var local = try b.u32(p + 42)
            let nameBytes = try b.slice(p + 46, nameLen)
            // Zip64 extended information: only the fields that overflowed are present, in order.
            if size == 0xFFFF_FFFF || compressed == 0xFFFF_FFFF || local == 0xFFFF_FFFF {
                var e = p + 46 + nameLen
                let end = e + extraLen
                while e + 4 <= end {
                    let id = try b.u16(e), len = try b.u16(e + 2)
                    if id == 0x0001 {
                        var q = e + 4
                        if size == 0xFFFF_FFFF { size = try b.u64(q); q += 8 }
                        if compressed == 0xFFFF_FFFF { compressed = try b.u64(q); q += 8 }
                        if local == 0xFFFF_FFFF { local = try b.u64(q); q += 8 }
                        break
                    }
                    e += 4 + len
                }
            }
            out.append(CentralRecord(name: decodeName(nameBytes, utf8Flag: flags & 0x800 != 0), flags: flags, method: method,
                                     crc: crc, compressedSize: compressed, size: size, localOffset: local))
            p += 46 + nameLen + extraLen + commentLen
        }
        return out
    }

    private static func read(_ b: ByteReader, skipHidden: Bool, include: (String) -> Bool) throws -> [Entry] {
        var out: [Entry] = []
        for r in try directory(b) {
            if r.isDirectory || (skipHidden && isHidden(r.name)) || !include(r.name) { continue }
            if r.flags & 1 != 0 { throw ZipError("\(r.name) is encrypted; unzip it with its password first") }
            // The local header repeats the name and has its own extra field; the data follows it.
            guard try b.u32(r.localOffset) == 0x0403_4B50 else { throw ZipError("The zip entry \(r.name) is damaged") }
            let start = r.localOffset + 30 + (try b.u16(r.localOffset + 26)) + (try b.u16(r.localOffset + 28))
            let src = try b.slice(start, r.compressedSize)
            let bytes: [UInt8]
            switch r.method {
            case 0:
                guard r.compressedSize == r.size else { throw ZipError("The zip entry \(r.name) is damaged") }
                bytes = Array(src)
            case 8:
                bytes = try Inflater.inflate(src, expectedSize: r.size)
            default:
                throw ZipError("\(r.name) uses a compression method (\(r.method)) that can't be read here")
            }
            guard crc32(bytes) == r.crc else { throw ZipError("The zip entry \(r.name) is damaged (checksum mismatch)") }
            out.append(Entry(name: r.name, data: Data(bytes)))
        }
        return out
    }

    /// UTF-8 when flagged or valid (macOS writes UTF-8 without the flag), else code page 437.
    private static func decodeName(_ raw: UnsafeBufferPointer<UInt8>, utf8Flag: Bool) -> String {
        if utf8Flag || raw.allSatisfy({ $0 < 0x80 }) { return String(decoding: raw, as: UTF8.self) }
        if let s = String(bytes: raw, encoding: .utf8) { return s }
        let high = Array("ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■\u{00A0}")
        return String(raw.map { $0 < 0x80 ? Character(Unicode.Scalar($0)) : high[Int($0) - 0x80] })
    }

    // ------------------------------------------------------------------ CRC-32

    private static let crcTable: [UInt32] = (0..<256).map { n -> UInt32 in
        var c = UInt32(n)
        for _ in 0..<8 { c = c & 1 != 0 ? 0xEDB8_8320 ^ (c >> 1) : c >> 1 }
        return c
    }

    static func crc32(_ bytes: [UInt8]) -> UInt32 {
        var c: UInt32 = 0xFFFF_FFFF
        crcTable.withUnsafeBufferPointer { t in
            for v in bytes { c = t[Int((c ^ UInt32(v)) & 0xFF)] ^ (c >> 8) }
        }
        return c ^ 0xFFFF_FFFF
    }

    // ------------------------------------------------------------------ inflate (RFC 1951)

    /// A raw-deflate decoder. Huffman codes are decoded through a 10-bit lookup table, with
    /// the canonical bit-by-bit walk (as in zlib's puff.c) for the rare longer codes.
    private struct Inflater {
        private let src: UnsafeBufferPointer<UInt8>
        private var pos = 0          // next byte of src to load into the bit buffer
        private var bitBuf: UInt64 = 0
        private var bitCount = 0
        private var overrun = 0      // zero bytes fed in past the end of src
        private var out: [UInt8]
        private let limit: Int

        private static let fastBits = 10
        private static let lengthBase: [Int] = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31,
                                                35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]
        private static let lengthExtra: [Int] = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2,
                                                 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
        private static let distBase: [Int] = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193,
                                              257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577]
        private static let distExtra: [Int] = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
                                               7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]
        /// Order in which code-length code lengths are sent.
        private static let clOrder: [Int] = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]

        /// A canonical Huffman code: counts per length and symbols in code order (puff.c), plus
        /// a table indexed by the next fastBits input bits giving (symbol << 4 | length).
        private struct Huffman {
            var counts = [Int](repeating: 0, count: 16)
            var symbols: [Int]
            var fast = [Int32](repeating: -1, count: 1 << Inflater.fastBits)

            /// Builds the code from per-symbol lengths; false if it is over-subscribed, or
            /// incomplete when `allowIncomplete` is off.
            init?(lengths: ArraySlice<Int>, allowIncomplete: Bool) {
                symbols = [Int](repeating: 0, count: lengths.count)
                for l in lengths { counts[l] += 1 }
                var left = 1
                for len in 1...15 {
                    left <<= 1
                    left -= counts[len]
                    if left < 0 { return nil }
                }
                let used = lengths.count - counts[0]
                if left > 0 && !allowIncomplete && used > 1 { return nil }
                var offs = [Int](repeating: 0, count: 16)
                for len in 1..<15 { offs[len + 1] = offs[len] + counts[len] }
                for (s, l) in lengths.enumerated() where l != 0 {
                    symbols[offs[l]] = s
                    offs[l] += 1
                }
                // Fill the fast table: canonical codes in order, bit-reversed (deflate sends
                // Huffman codes most significant bit first).
                var code = 0
                var k = 0
                for len in 1...15 {
                    for _ in 0..<counts[len] {
                        if len <= Inflater.fastBits {
                            var rev = 0
                            var c = code
                            for _ in 0..<len { rev = rev << 1 | (c & 1); c >>= 1 }
                            let entry = Int32(symbols[k] << 4 | len)
                            var idx = rev
                            while idx < (1 << Inflater.fastBits) {
                                fast[idx] = entry
                                idx += 1 << len
                            }
                        }
                        code += 1
                        k += 1
                    }
                    code <<= 1
                }
            }
        }

        static func inflate(_ src: UnsafeBufferPointer<UInt8>, expectedSize: Int) throws -> [UInt8] {
            var s = Inflater(src: src, expectedSize: expectedSize)
            try s.run()
            guard s.out.count == expectedSize else { throw ZipError("A zip entry is damaged (wrong size)") }
            return s.out
        }

        private init(src: UnsafeBufferPointer<UInt8>, expectedSize: Int) {
            self.src = src
            limit = expectedSize
            out = []
            out.reserveCapacity(expectedSize)
        }

        @inline(__always)
        private mutating func refill() {
            while bitCount <= 56 {
                if pos < src.count {
                    bitBuf |= UInt64(src[pos]) << UInt64(bitCount)
                    pos += 1
                } else {
                    overrun += 1
                }
                bitCount += 8
            }
        }

        @inline(__always)
        private mutating func bits(_ n: Int) throws -> Int {
            if bitCount < n { refill() }
            let v = Int(bitBuf & ((1 << UInt64(n)) - 1))
            bitBuf >>= UInt64(n)
            bitCount -= n
            try checkOverrun()
            return v
        }

        /// Reading the zero padding past the end means the stream was cut short.
        @inline(__always)
        private func checkOverrun() throws {
            if overrun > 0 && bitCount < overrun * 8 { throw ZipError("A zip entry is cut short") }
        }

        private mutating func decode(_ h: Huffman) throws -> Int {
            if bitCount < 16 { refill() }
            let e = h.fast[Int(bitBuf & UInt64((1 << Inflater.fastBits) - 1))]
            if e >= 0 {
                let len = Int(e & 15)
                bitBuf >>= UInt64(len)
                bitCount -= len
                try checkOverrun()
                return Int(e >> 4)
            }
            // Longer than fastBits: walk the canonical code a bit at a time (puff.c).
            var code = 0, first = 0, index = 0
            for len in 1...15 {
                code |= Int(bitBuf & 1)
                bitBuf >>= 1
                bitCount -= 1
                let count = h.counts[len]
                if code - count < first {
                    try checkOverrun()
                    return h.symbols[index + (code - first)]
                }
                index += count
                first += count
                first <<= 1
                code <<= 1
            }
            throw ZipError("A zip entry is damaged (bad Huffman code)")
        }

        private mutating func run() throws {
            var last = false
            while !last {
                last = try bits(1) == 1
                switch try bits(2) {
                case 0: try stored()
                case 1: try codes(Inflater.fixedLit, Inflater.fixedDist)
                case 2:
                    let (lit, dist) = try dynamicTables()
                    try codes(lit, dist)
                default: throw ZipError("A zip entry is damaged (bad block type)")
                }
            }
        }

        private mutating func stored() throws {
            // Drop to a byte boundary, then hand back whole bytes still in the bit buffer.
            _ = try bits(bitCount & 7)
            let buffered = bitCount / 8 - overrun
            pos -= max(buffered, 0)
            bitBuf = 0
            bitCount = 0
            overrun = 0
            guard pos + 4 <= src.count else { throw ZipError("A zip entry is cut short") }
            let len = Int(src[pos]) | Int(src[pos + 1]) << 8
            let nlen = Int(src[pos + 2]) | Int(src[pos + 3]) << 8
            pos += 4
            guard len == ~nlen & 0xFFFF else { throw ZipError("A zip entry is damaged (stored block)") }
            guard pos + len <= src.count else { throw ZipError("A zip entry is cut short") }
            guard out.count + len <= limit else { throw ZipError("A zip entry is damaged (too long)") }
            out.append(contentsOf: UnsafeBufferPointer(rebasing: src[pos..<(pos + len)]))
            pos += len
        }

        private static let fixedLit: Huffman = {
            var l = [Int](repeating: 8, count: 288)
            for i in 144..<256 { l[i] = 9 }
            for i in 256..<280 { l[i] = 7 }
            return Huffman(lengths: l[...], allowIncomplete: false)!
        }()

        private static let fixedDist: Huffman = Huffman(lengths: [Int](repeating: 5, count: 30)[...], allowIncomplete: true)!

        private mutating func dynamicTables() throws -> (Huffman, Huffman) {
            let nlen = try bits(5) + 257
            let ndist = try bits(5) + 1
            let ncode = try bits(4) + 4
            guard nlen <= 286 && ndist <= 30 else { throw ZipError("A zip entry is damaged (bad table sizes)") }
            var lengths = [Int](repeating: 0, count: 320)
            for i in 0..<ncode { lengths[Inflater.clOrder[i]] = try bits(3) }
            guard let lencode = Huffman(lengths: lengths[0..<19], allowIncomplete: false) else {
                throw ZipError("A zip entry is damaged (bad code lengths)")
            }
            var index = 0
            while index < nlen + ndist {
                var symbol = try decode(lencode)
                if symbol < 16 {
                    lengths[index] = symbol
                    index += 1
                } else {
                    var len = 0
                    if symbol == 16 {
                        guard index > 0 else { throw ZipError("A zip entry is damaged (repeat with no length)") }
                        len = lengths[index - 1]
                        symbol = 3 + (try bits(2))
                    } else if symbol == 17 {
                        symbol = 3 + (try bits(3))
                    } else {
                        symbol = 11 + (try bits(7))
                    }
                    guard index + symbol <= nlen + ndist else { throw ZipError("A zip entry is damaged (too many lengths)") }
                    for _ in 0..<symbol { lengths[index] = len; index += 1 }
                }
            }
            guard lengths[256] != 0 else { throw ZipError("A zip entry is damaged (no end-of-block code)") }
            guard let lit = Huffman(lengths: lengths[0..<nlen], allowIncomplete: false),
                  let dist = Huffman(lengths: lengths[nlen..<(nlen + ndist)], allowIncomplete: true)
            else { throw ZipError("A zip entry is damaged (bad Huffman table)") }
            return (lit, dist)
        }

        private mutating func codes(_ lit: Huffman, _ dist: Huffman) throws {
            while true {
                var symbol = try decode(lit)
                if symbol < 256 {
                    guard out.count < limit else { throw ZipError("A zip entry is damaged (too long)") }
                    out.append(UInt8(symbol))
                } else if symbol == 256 {
                    return
                } else {
                    symbol -= 257
                    guard symbol < 29 else { throw ZipError("A zip entry is damaged (bad length code)") }
                    let len = Inflater.lengthBase[symbol] + (try bits(Inflater.lengthExtra[symbol]))
                    let ds = try decode(dist)
                    guard ds < 30 else { throw ZipError("A zip entry is damaged (bad distance code)") }
                    let d = Inflater.distBase[ds] + (try bits(Inflater.distExtra[ds]))
                    guard d <= out.count else { throw ZipError("A zip entry is damaged (distance too far back)") }
                    guard out.count + len <= limit else { throw ZipError("A zip entry is damaged (too long)") }
                    // Byte by byte: the copy may overlap what it is writing.
                    var from = out.count - d
                    for _ in 0..<len {
                        out.append(out[from])
                        from += 1
                    }
                }
            }
        }
    }
}

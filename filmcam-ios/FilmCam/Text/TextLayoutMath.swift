import Foundation

/// The pure arithmetic of text layout (no CoreText), so it is shared and checked anywhere:
/// splitting into paragraphs, the block's width, and even ("balanced") line breaking on top
/// of any line breaker.
enum TextLayoutMath {
    /// The text's paragraphs, split at \n, \r\n or \r (as Kotlin's lines()).
    static func paragraphs(_ text: String) -> [String] {
        text.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n")
            .components(separatedBy: "\n")
    }

    /// The block's width (StaticLayout's): its widest unbroken paragraph ([desired], plus
    /// two pixels of air), capped at [wrap] of the frame width when wrapping; [fixed] wins.
    static func blockWidth(desired: Double, wrap: Double, frameW: Double, fixed: Double = 0) -> Double {
        let d = Double(max(1, Int(desired.rounded(.up)))) + 2
        if fixed > 0 { return fixed }
        if wrap > 0 { return min(d, max(1, (wrap * frameW).rounded(.down))) }
        return d
    }

    /// Lines of a paragraph [length] UTF-16 units long, broken greedily at [width]:
    /// [suggest] says how many units from a start fit in a width (CoreText's typesetter).
    static func greedyBreaks(length: Int, width: Double, suggest: (Int, Double) -> Int) -> [Range<Int>] {
        var out: [Range<Int>] = []
        var start = 0
        while start < length {
            let n = min(max(1, suggest(start, width)), length - start)
            out.append(start..<(start + n))
            start += n
        }
        return out.isEmpty ? [0..<length] : out
    }

    /// Lines broken as evenly as they can be (Android's balanced strategy): the same number of
    /// lines as greedy breaking at [width], at the narrowest width that still needs no more.
    static func balancedBreaks(length: Int, width: Double, suggest: (Int, Double) -> Int) -> [Range<Int>] {
        let greedy = greedyBreaks(length: length, width: width, suggest: suggest)
        let n = greedy.count
        if n <= 1 { return greedy }
        var lo = width / Double(n) * 0.5
        var hi = width
        var best = greedy
        for _ in 0..<10 {
            let mid = (lo + hi) / 2
            let b = greedyBreaks(length: length, width: mid, suggest: suggest)
            if b.count <= n { hi = mid; best = b } else { lo = mid }
            if hi - lo < 1 { break }
        }
        return best
    }
}

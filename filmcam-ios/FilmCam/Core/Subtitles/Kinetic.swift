import Foundation

// A port of Kinetic.kt: kinetic caption templates, phrase splitting, layout and animation.
// The maths is Android's step for step (Float like Kotlin), so a track looks the same on both.

/// How subtitles are set. Classic is a line at a time; the others are kinetic: the words come in
/// one by one as they are said, each revealed letter by letter out of a soft blur, and grouped
/// into short phrases that are set like a poster (a big word, small words tucked against it).
enum CaptionTemplate: String, Codable, CaseIterable {
    case CLASSIC, SCATTER, STACK, FOCUS, SIDES, CASCADE, HIGHLIGHT, LOWER, HEADLINE, PUNCH

    var label: String {
        switch self {
        case .CLASSIC: return "Classic"
        case .SCATTER: return "Scatter"
        case .STACK: return "Stack"
        case .FOCUS: return "Focus"
        case .SIDES: return "Sides"
        case .CASCADE: return "Cascade"
        case .HIGHLIGHT: return "Highlight"
        case .LOWER: return "Lower third"
        case .HEADLINE: return "Headline"
        case .PUNCH: return "Punch"
        }
    }

    var blurb: String {
        switch self {
        case .CLASSIC: return "A line at a time"
        case .SCATTER: return "Phrases land around the frame: one big word, small ones tucked on it"
        case .STACK: return "Lines build up in the middle, sans, serif and italic mixed"
        case .FOCUS: return "One or two words at a time, centred"
        case .SIDES: return "Words stack down the left and right edges, leaving the middle to the subject"
        case .CASCADE: return "Each phrase steps down diagonally, word by word"
        case .HIGHLIGHT: return "The whole line shows; the word being said lights up"
        case .LOWER: return "Lines build up low on the left, the key word in the serif"
        case .HEADLINE: return "Big capitals across the top of the frame"
        case .PUNCH: return "One huge word at a time"
        }
    }
}

/// How a word comes in.
enum WordAnim: String, Codable, CaseIterable {
    case BLUR, FADE, RISE, POP, TYPE, NONE

    var label: String {
        switch self {
        case .BLUR: return "Blur in"
        case .FADE: return "Fade"
        case .RISE: return "Rise"
        case .POP: return "Pop"
        case .TYPE: return "Type"
        case .NONE: return "Cut"
        }
    }
}

/// Whether a word sits in front of the subject or behind it. AUTO follows the template's mix.
enum WordDepth: String, Codable, CaseIterable {
    case AUTO, FRONT, BEHIND

    var label: String {
        switch self {
        case .AUTO: return "Auto"
        case .FRONT: return "In front"
        case .BEHIND: return "Behind"
        }
    }
}

/// A change to one word of a kinetic caption: where it sits (its centre, 0..1 of the frame),
/// its size (fraction of the frame's short side), font, colour, entrance and depth. Unset
/// fields keep the template's choice. [text] is the word it was made for: if the line is
/// retyped and the word changes, the edit no longer applies. (JSON: see Subtitles.swift.)
struct WordEdit: Equatable {
    var text: String = ""
    var x: Float? = nil
    var y: Float? = nil
    var size: Float? = nil
    var font: String? = nil
    var color: Int32? = nil
    var anim: WordAnim? = nil
    var depth: WordDepth = .AUTO

    var isEmpty: Bool { x == nil && y == nil && size == nil && font == nil && color == nil && anim == nil && depth == .AUTO }
}

/// A word of a cue and when it is said. [id] is "cue:word" (both counted from 0).
struct Word: Equatable {
    let id: String
    let text: String
    let startMs: Int64
    let endMs: Int64
    let cue: Int
    let index: Int
}

/// Words shown together, from when the first is said until the next phrase takes over.
struct Phrase: Equatable {
    let words: [Word]
    let startMs: Int64
    let endMs: Int64
    let index: Int
}

/// Measures text for kinetic captions (and classic blocks). Android uses TextPaint; the app
/// supplies a Core Text one. Sizes are in pixels of whatever frame the caller works in.
protocol TextMeasurer {
    /// Advance width of [text] set in the font with key [font] (FontKeys form) at [size]
    /// pixels, with [tracking] ems of extra letter spacing on every character (as Android's
    /// letterSpacing: n characters widen by n x tracking x size).
    func width(_ text: String, font: String, size: Float, tracking: Float) -> Float

    /// Size in pixels of a layer's whole text block in a [frameWidth] x [frameHeight] frame,
    /// laid out as the renderer draws it (wrapped at layer.wrap, box padding included); used
    /// to stack and place classic subtitles. A default built on [width] is provided.
    func blockSize(_ layer: TextLayer, frameWidth: Float, frameHeight: Float) -> (width: Float, height: Float)
}

extension TextMeasurer {
    /// An estimate of the renderer's block: lines broken greedily at the wrap width, 1.21 em
    /// a line, the subtitle box's padding (0.35 em across, 0.16 em down) when there is one.
    func blockSize(_ layer: TextLayer, frameWidth w: Float, frameHeight h: Float) -> (width: Float, height: Float) {
        let px = max(1, layer.size * min(w, h))
        let text = layer.text.isEmpty ? " " : layer.text
        let paragraphs = text.components(separatedBy: "\n")
        let desired = max(Int((paragraphs.map { width($0, font: layer.font, size: px, tracking: layer.tracking) }.max() ?? 0).rounded(.up)), 1) + 2
        let lineW = layer.wrap > 0 ? min(desired, max(1, Int(layer.wrap * w))) : desired
        var lines = 0
        for para in paragraphs {
            var cur = ""
            lines += 1
            for word in para.split(separator: " ", omittingEmptySubsequences: false) {
                let next = cur.isEmpty ? String(word) : cur + " " + word
                if !cur.isEmpty && width(next, font: layer.font, size: px, tracking: layer.tracking) > Float(lineW) {
                    lines += 1
                    cur = String(word)
                } else {
                    cur = next
                }
            }
        }
        let height = Float(lines) * px * 1.21 * Kt.coerceIn(layer.lineSpacing, 0.5, 3)
        if !layer.box { return (Float(lineW), height) }
        return (Float(lineW) + 2 * px * 0.35, height + 2 * px * 0.16)
    }
}

/// A measurer without fonts, for tests and previews: a bold sans is about 0.56 em a letter,
/// the italic serif 0.45 (Android's own estimate when it has no fonts).
struct EstimateMeasurer: TextMeasurer {
    init() {}

    func width(_ text: String, font: String, size: Float, tracking: Float) -> Float {
        let em: Float = (font.contains("Serif") ? 0.45 : 0.56) + tracking
        return Float(Kt.length(text)) * em * size
    }
}

/// Kinetic captions: turns a track's cues into word layers for any moment.
///
/// Studied from short-form edits (podcast and talking-head reels): the words arrive as they are
/// spoken, each one revealed left to right out of a blur in about a quarter of a second; a
/// phrase holds two to four words and is replaced whole by the next; the one word that carries
/// the meaning is set three times the size of the small words around it, which sit tight on its
/// shoulder (overlapping its cap height); successive phrases jump between a few spots (the top
/// corners, beside the head, the chest) so the eye follows them; and some big words pass behind
/// the speaker's head while the rest stay in front. The face is Inter Tight Bold, with an italic
/// serif for the odd accent word.
enum Kinetic {
    /// Small words that never carry a phrase.
    private static let STOP: Set<String> = [
        "a", "an", "the", "of", "to", "in", "on", "at", "by", "for", "with", "from", "as", "and", "but", "or", "so",
        "if", "is", "are", "was", "were", "be", "been", "am", "it", "its", "it's", "that", "this", "these", "those",
        "i", "i'm", "i've", "i'd", "i'll", "you", "your", "you're", "we", "our", "they", "their", "he", "she", "his",
        "her", "me", "my", "us", "them", "do", "did", "does", "have", "has", "had", "not", "no", "just", "what",
        "when", "then", "than", "there", "here", "will", "would", "can", "could", "about", "up", "out", "all",
        "one", "who", "how", "why", "where", "which", "know", "like", "get", "got",
    ]

    /// Where a talking head's crown usually is in a vertical frame: words set behind go across it.
    static let HEAD_TOP: Float = 0.25

    /// The time a word takes to come in, and a phrase to go.
    static let IN_MS: Int64 = 260
    /// How long before a timed word is said it starts to come in.
    static let ANTICIPATE_MS: Int64 = 60
    static let OUT_MS: Int64 = 120

    /// Lower case, without the punctuation around it (Kotlin's trim of non letters/digits but ').
    private static func bare(_ w: String) -> String {
        let u = Array(w.lowercased().unicodeScalars)
        func keep(_ c: Unicode.Scalar) -> Bool { isLetterOrDigit(c) || c == "'" }
        var a = 0
        var b = u.count
        while a < b && !keep(u[a]) { a += 1 }
        while b > a && !keep(u[b - 1]) { b -= 1 }
        var out = String.UnicodeScalarView()
        out.append(contentsOf: u[a..<b])
        return String(out)
    }

    /// Java's Character.isLetterOrDigit (letters of every kind and decimal digits; not marks).
    private static func isLetterOrDigit(_ c: Unicode.Scalar) -> Bool {
        switch c.properties.generalCategory {
        case .uppercaseLetter, .lowercaseLetter, .titlecaseLetter, .modifierLetter, .otherLetter, .decimalNumber: return true
        default: return false
        }
    }

    static func isSmall(_ w: String) -> Bool { let b = bare(w); return STOP.contains(b) || Kt.length(b) <= 2 }

    private static func firstChar(_ s: String) -> Unicode.Scalar? { s.unicodeScalars.first }
    private static func lastChar(_ s: String) -> Unicode.Scalar? { s.unicodeScalars.last }
    private static func lastIn(_ s: String, _ set: String) -> Bool { lastChar(s).map { set.unicodeScalars.contains($0) } ?? false }

    // ------------------------------------------------------------------ words and phrases

    /// The words of each cue in the language shown, timed through the cue by their length.
    static func words(_ track: SubtitleTrack) -> [[Word]] {
        track.cues.enumerated().map { ci, c in
            let text: String
            switch track.style.language {
            case .TELUGU: text = Kt.isBlank(c.telugu) ? c.english : c.telugu
            default: text = Kt.isBlank(c.english) ? c.telugu : c.english
            }
            let parts = Kt.splitWords(text)
            if parts.isEmpty { return [] }
            // Aligned to the sound: each word starts coming in just before it is said, so it is
            // forming as it is heard.
            if c.timedText == text && c.wordStarts.count == parts.count {
                // Found in the sound, so they may fall a little outside the line's written times.
                let at = c.wordStarts.map { $0 - ANTICIPATE_MS }
                return parts.enumerated().map { wi, w in
                    let s = at[wi]
                    let e = max(wi + 1 < at.count ? at[wi + 1] : c.endMs, s)
                    return Word(id: "\(ci):\(wi)", text: w, startMs: s, endMs: e, cue: ci, index: wi)
                }
            }
            // Longer words take longer to say; a comma or full stop adds a breath after the word.
            let weights: [Float] = parts.map { w in
                1.5 + Float(max(Kt.length(bare(w)), 1)) + (lastIn(w, ",.;:!?") ? 2.5 : 0)
            }
            var total: Float = 0
            for v in weights { total += v }
            let span = Float(max(c.endMs - c.startMs, 1))
            var acc: Float = 0
            return parts.enumerated().map { wi, w in
                let s = c.startMs + Int64(span * acc / total)
                acc += weights[wi]
                let e = c.startMs + Int64(span * acc / total)
                return Word(id: "\(ci):\(wi)", text: w, startMs: s, endMs: e, cue: ci, index: wi)
            }
        }
    }

    private static func limits(_ t: CaptionTemplate) -> (words: Int, chars: Int) {
        switch t {
        case .SCATTER: return (3, 20)
        case .STACK: return (2, 15)
        case .FOCUS: return (2, 14)
        case .SIDES: return (3, 22)
        case .CASCADE: return (4, 24)
        case .HIGHLIGHT: return (6, 34)
        case .LOWER: return (4, 26)
        case .HEADLINE: return (3, 18)
        case .PUNCH: return (2, 14)
        case .CLASSIC: return (99, 999)
        }
    }

    /// Words grouped into phrases: a phrase ends at punctuation, at the template's word or
    /// character limit, at a pause, or with its cue. Each holds until the next one starts (or a
    /// moment after its last word, at a long silence).
    static func phrases(_ track: SubtitleTrack) -> [Phrase] {
        let lim = limits(track.style.template)
        var groups: [[Word]] = []
        let opens = "\"\u{201c}\u{2018}'(["
        let ends = ",.;:!?"
        for cue in words(track) {
            var cur: [Word] = []
            func flush() { if !cur.isEmpty { groups.append(cur); cur = [] } }
            for (i, w) in cue.enumerated() {
                let chars = cur.reduce(0) { $0 + Kt.length($1.text) + 1 } + Kt.length(w.text)
                let pause = !cur.isEmpty && w.startMs - cur[cur.count - 1].endMs > 350
                // A quotation starts its own phrase.
                let opensQuote = firstChar(w.text).map { opens.unicodeScalars.contains($0) } ?? false
                if opensQuote || cur.count >= lim.words || chars > lim.chars || pause { flush() }
                cur.append(w)
                // Punch: every word that carries meaning is its own beat (a small word rides with it).
                if track.style.template == .PUNCH && !isSmall(w.text) { flush(); continue }
                if lastIn(w.text, ends) || lastIn(trimEnd(w.text, "\u{201d}\u{2019}\"')"), ends) { flush(); continue }
                // A phrase closes on its key word ("on my | podcast"), keeping a last small word
                // that ends the sentence ("struggles with?").
                if !isSmall(w.text) && (cur.count >= 2 || Kt.length(bare(w.text)) >= 7 || lastIn(w.text, "\u{201d}\u{2019}\"")) {
                    if i + 1 < cue.count {
                        let next = cue[i + 1]
                        if isSmall(next.text) && lastIn(next.text, ends) && lim.words > 2 { continue }
                    }
                    flush()
                }
            }
            flush()
        }
        return groups.enumerated().map { i, g in
            let next = i + 1 < groups.count ? groups[i + 1][0].startMs : Int64.max
            let last = g[g.count - 1]
            let linger = last.endMs + 700
            let end = min(next, max(linger, last.startMs + IN_MS + 400))
            return Phrase(words: g, startMs: g[0].startMs, endMs: end, index: i)
        }
    }

    private static func trimEnd(_ s: String, _ chars: String) -> String {
        var u = Array(s.unicodeScalars)
        let set = Set(chars.unicodeScalars)
        while let l = u.last, set.contains(l) { u.removeLast() }
        var out = String.UnicodeScalarView()
        out.append(contentsOf: u)
        return String(out)
    }

    /// The phrases of a track, which of them go behind the subject, and the spot each takes.
    struct Plan {
        let phrases: [Phrase]
        let behind: [Bool]
        let slots: [Int]
    }

    /// Plans are cached per track (the editor and an export ask for every frame). The plan
    /// depends only on the cues and the style, so those are the key.
    private final class PlanCache: @unchecked Sendable {
        private let lock = NSLock()
        private var cues: [Cue]?
        private var style: SubtitleStyle?
        private var plan: Plan?

        func get(_ track: SubtitleTrack, _ make: () -> Plan) -> Plan {
            lock.lock()
            defer { lock.unlock() }
            if let p = plan, style == track.style, cues == track.cues { return p }
            let p = make()
            plan = p; cues = track.cues; style = track.style
            return p
        }
    }

    private static let cache = PlanCache()

    static func plan(_ track: SubtitleTrack) -> Plan {
        cache.get(track) {
            let ps = phrases(track)
            let st = track.style
            let behind: [Bool] = ps.map { p in
                st.behindSubject && behindPhrase(p, st.seed) && !isSmall(p.words[emphasis(p.words)].text)
            }
            // Spots: never the same twice running; phrases going behind take the high ones, where
            // the head covers only part of the word.
            var slots = [Int](repeating: 0, count: ps.count)
            for i in ps.indices {
                let pool = SLOTS.indices.filter { SLOTS[$0].crown == behind[i] }
                slots[i] = slotIndexFor(i, st.seed, pool, i > 0 ? slots[i - 1] : -1)
            }
            return Plan(phrases: ps, behind: behind, slots: slots)
        }
    }

    // ------------------------------------------------------------------ measuring

    /// Text widths as a fraction of the frame width, for a size given as a fraction of the short side.
    private struct Ruler {
        let measurer: TextMeasurer?
        let w: Float
        let h: Float = 1000
        let short: Float
        let tracking: Float

        init(_ measurer: TextMeasurer?, aspect: Float, tracking: Float = 0) {
            self.measurer = measurer
            self.tracking = tracking
            w = 1000 * max(aspect, 0.05)
            short = min(w, h)
        }

        func width(_ text: String, _ font: String, _ size: Float) -> Float {
            guard let m = measurer else {
                // No fonts (tests): a bold sans is about 0.56 em a letter, the italic serif 0.45.
                let em: Float = (font.contains("Serif") ? 0.45 : 0.56) + tracking
                return Float(Kt.length(text)) * em * size * short / w
            }
            return m.width(text, font: font, size: size * short, tracking: tracking) / w
        }

        /// Height of one line of text of [size], as a fraction of the frame height.
        func lineH(_ size: Float) -> Float { size * short / h * 1.18 }
        func sizeFor(_ text: String, _ font: String, _ widthFrac: Float) -> Float { widthFrac / max(width(text, font, 1), 1e-4) }
    }

    // ------------------------------------------------------------------ layout

    /// A word placed: where its centre goes and how it is set.
    struct Placed: Equatable {
        var word: Word
        var x: Float
        var y: Float
        var size: Float
        var font: String
        var color: Int32
        var behind: Bool
        var big: Bool
    }

    /// A phrase's spot: anchor x (left, centre or right edge by [align]) and the big word's centre y.
    private struct Slot {
        let x: Float
        let y: Float
        let align: TextAlign
        let width: Float
        var crown: Bool = false
    }

    // Portrait spots, from the reels: the top corners, beside the head, the chest, low down.
    // Words going behind the subject take the crown spots: wide (wider than a head, so both
    // ends always show) and across the top of the head, so the hair hides only part of them.
    private static let SLOTS: [Slot] = [
        Slot(x: 0.06, y: 0.15, align: .LEFT, width: 0.50),                          // top left
        Slot(x: 0.94, y: 0.15, align: .RIGHT, width: 0.50),                         // top right
        Slot(x: 0.50, y: 0.20, align: .CENTER, width: 0.62),                        // above the head
        Slot(x: 0.50, y: 0.56, align: .CENTER, width: 0.66),                        // chest
        Slot(x: 0.07, y: 0.42, align: .LEFT, width: 0.44),                          // left of the shoulder
        Slot(x: 0.93, y: 0.42, align: .RIGHT, width: 0.44),                         // right of the shoulder
        Slot(x: 0.50, y: 0.72, align: .CENTER, width: 0.60),                        // low
        Slot(x: 0.50, y: HEAD_TOP - 0.01, align: .CENTER, width: 0.82, crown: true), // across the crown
        Slot(x: 0.05, y: HEAD_TOP - 0.04, align: .LEFT, width: 0.62, crown: true),   // crown, from the left
        Slot(x: 0.95, y: HEAD_TOP - 0.04, align: .RIGHT, width: 0.62, crown: true),  // crown, from the right
    ]

    /// A stable pseudo-random number for [k] (and the style's shuffle seed), 0 until 1. The
    /// same 32-bit hash as Android, so a seed picks the same spots on both.
    private static func rnd(_ k: Int, _ salt: Int, _ seed: Int) -> Float {
        func u(_ v: Int) -> UInt32 { UInt32(truncatingIfNeeded: v) }
        var h = (u(k) &* 0x9E37_79B1) ^ (u(salt) &* 0x85EB_CA77) ^ (u(seed) &* 0xC2B2_AE3D)
        h = h ^ (h >> 15); h = h &* 0x2C1B_3C6D; h = h ^ (h >> 12); h = h &* 0x297A_2D39; h = h ^ (h >> 15)
        return Float(h >> 8) / 16_777_216
    }

    /// Whether the phrase is one of those that go (partly) behind the subject, about two in five.
    private static func behindPhrase(_ p: Phrase, _ seed: Int) -> Bool { rnd(p.index, 7, seed) < 0.42 }

    /// The phrase's most important word: the longest one that isn't a small word.
    static func emphasis(_ words: [Word]) -> Int {
        var best = 0
        var score: Float = -1
        for (i, w) in words.enumerated() {
            let s = Float(Kt.length(bare(w.text))) + (isSmall(w.text) ? 0 : 6) + Float(i) * 0.1
            if s > score { score = s; best = i }
        }
        return best
    }

    /// Lays out one phrase in the track's template (no animation: final places).
    static func place(_ track: SubtitleTrack, _ p: Phrase, aspect: Float, measurer: TextMeasurer?, stackOf: [Phrase] = []) -> [Placed] {
        let plan = plan(track)
        let st = track.style
        let ruler = Ruler(measurer, aspect: aspect, tracking: st.tracking)
        let telugu = st.language == .TELUGU
        let sans = telugu ? st.teluguFont : st.captionFont
        let serif = telugu ? st.teluguFont : st.accentFont
        let wide: Float = aspect > 1 ? 0.55 : 1
        let scale = st.captionScale
        let behindOn = st.behindSubject
        var out: [Placed] = []
        let m: Float = 0.04

        func txt(_ w: Word) -> String { shown(st.template, w.text) }
        func lineWidth(_ words: [Word], _ font: String, _ size: Float) -> Float {
            Float(words.reduce(0.0) { $0 + Double(ruler.width(txt($1), font, size)) }) + ruler.width(" ", font, size) * Float(words.count - 1)
        }

        /// Places [words] on one line with its left edge at [left] and centre at [y].
        func line(_ words: [Word], _ left: Float, _ y: Float, _ font: String, _ size: Float, _ behind: Bool, _ big: Bool) {
            var x = left
            let space = ruler.width(" ", font, size)
            for w in words {
                let ww = ruler.width(txt(w), font, size)
                out.append(Placed(word: w, x: x + ww / 2, y: y, size: size, font: font, color: st.color, behind: behind, big: big))
                x += ww + space
            }
        }

        /// [words] broken into lines no wider than [maxW].
        func wrap(_ words: [Word], _ font: String, _ size: Float, _ maxW: Float) -> [[Word]] {
            var lines: [[Word]] = []
            var cur: [Word] = []
            for w in words {
                if !cur.isEmpty && lineWidth(cur + [w], font, size) > maxW { lines.append(cur); cur = [] }
                cur.append(w)
            }
            if !cur.isEmpty { lines.append(cur) }
            return lines
        }

        switch st.template {
        case .SCATTER:
            let e = emphasis(p.words)
            let goBehind = p.index < plan.behind.count ? plan.behind[p.index] : false
            let slot = SLOTS[p.index < plan.slots.count ? plan.slots[p.index] : 3]
            let accent = rnd(p.index, 3, st.seed) < 0.22 && !telugu
            let bigFont = accent ? serif : sans
            let bigWord = p.words[e]
            var big = Kt.coerceIn(ruler.sizeFor(bigWord.text, bigFont, slot.width * wide) * scale, 0.085, slot.crown ? 0.26 : 0.2)
            // Never wider than the frame allows.
            let maxW = 1 - 2 * m
            if ruler.width(bigWord.text, bigFont, big) > maxW { big = ruler.sizeFor(bigWord.text, bigFont, maxW) }
            let small = Kt.coerceIn(big * 0.4, 0.05, 0.075) * (scale < 1 ? scale : 1)
            let bw = ruler.width(bigWord.text, bigFont, big)
            let bigLeft0: Float
            switch slot.align {
            case .LEFT: bigLeft0 = slot.x
            case .RIGHT: bigLeft0 = slot.x - bw
            case .CENTER: bigLeft0 = slot.x - bw / 2
            }
            let bigLeft = Kt.coerceIn(bigLeft0, m, max(m, 1 - m - bw))
            let by = slot.y
            let bh = ruler.lineH(big)
            line([bigWord], bigLeft, by, bigFont, big, goBehind, true)
            let before = Array(p.words[0..<e])
            let after = Array(p.words[(e + 1)...])
            if !before.isEmpty {
                let lw = lineWidth(before, sans, small)
                let left0: Float
                switch slot.align {
                case .LEFT: left0 = bigLeft + bw * 0.02
                case .RIGHT: left0 = bigLeft + bw - lw
                case .CENTER: left0 = bigLeft + (bw - lw) / 2
                }
                // Tucked onto the big word's shoulder, overlapping its cap height a little.
                line(before, Kt.coerceIn(left0, m, max(m, 1 - m - lw)), by - bh * 0.47, sans, small, false, false)
            }
            if !after.isEmpty {
                let lw = lineWidth(after, sans, small)
                let left0 = slot.align == .RIGHT ? bigLeft + bw * 0.04 : bigLeft + bw - lw
                line(after, Kt.coerceIn(left0, m, max(m, 1 - m - lw)), by + bh * 0.40, sans, small, false, false)
            }

        case .STACK:
            // A block of up to three phrases, one a line, building up in the middle.
            let lines = stackOf.isEmpty ? [p] : stackOf
            let fontsCycle = [sans, serif, st.captionItalic]
            let stackBehind = behindOn && lines.count > 1 && behindPhrase(lines[0], st.seed)
            let placedLines: [(Phrase, String, Float)] = lines.enumerated().map { li, ph in
                let bigLine = ph.words.contains { !isSmall($0.text) && Kt.length(bare($0.text)) >= 5 } || ph.words.count == 1
                let font = bigLine && !telugu ? fontsCycle[(li + Int(rnd(ph.index, 5, st.seed) * 3)) % 3] : sans
                // The line going behind is set wide, so the head never hides all of it.
                let target: Float = stackBehind && li == 0 && bigLine ? 0.84 : (bigLine ? 0.64 : 0.34)
                let joined = ph.words.map(\.text).joined(separator: " ")
                var size = Kt.coerceIn(ruler.sizeFor(joined, font, target * wide) * scale,
                                    bigLine ? 0.075 : 0.042, stackBehind && li == 0 ? 0.24 : (bigLine ? 0.16 : 0.065))
                let lw0 = lineWidth(ph.words, font, size)
                if lw0 > 1 - 2 * m { size *= (1 - 2 * m) / lw0 }
                return (ph, font, size)
            }
            // Stack the lines tight: centre to centre a little over half the two sizes, so
            // caps of one line nearly touch the descenders of the one above.
            var gaps: [Float] = []
            if placedLines.count > 1 {
                for k in 0..<(placedLines.count - 1) {
                    gaps.append(0.53 * (placedLines[k].2 + placedLines[k + 1].2) * ruler.short / ruler.h)
                }
            }
            var total: Float = 0
            for g in gaps { total += g }
            // A block that sends a line behind the subject sits at head height, where the head
            // covers only part of that line; the biggest line is the one that goes behind.
            let biggest = 0
            let blockBehind = stackBehind && placedLines[0].2 > 0.07
            // Normally the block is centred on the chest; one with a line going behind is moved so
            // that line sits across the top of the head (the hair hides only the letters' feet).
            var offsetToBiggest: Float = 0
            for g in gaps.prefix(biggest) { offsetToBiggest += g }
            var cy = blockBehind ? HEAD_TOP - offsetToBiggest : 0.58 - total / 2
            for (li, pl) in placedLines.enumerated() {
                let (ph, font, size) = pl
                if li > 0 { cy += gaps[li - 1] }
                let lw = lineWidth(ph.words, font, size)
                // Lines step left and right of the centre, as hand-set type does.
                let shift = [Float(-0.05), 0.06, -0.02][li % 3] * (rnd(ph.index, 9, st.seed) < 0.5 ? 1 : -1)
                let left = Kt.coerceIn(0.5 - lw / 2 + shift, m, max(m, 1 - m - lw))
                if ph.index == p.index { line(ph.words, left, cy, font, size, blockBehind && li == biggest, size > 0.07) }
            }

        case .FOCUS:
            let behind = behindOn && behindPhrase(p, st.seed)
            var size: Float = 0.075 * scale
            let lw0 = lineWidth(p.words, sans, size)
            if lw0 > 0.84 { size *= 0.84 / lw0 }
            let lw = lineWidth(p.words, sans, size)
            // Behind-phrases rise to head height, where the head only covers part of them.
            line(p.words, 0.5 - lw / 2, behind ? 0.3 : 0.52, sans, size, behind, true)

        case .SIDES:
            // Down one edge of the frame, alternating sides, so the middle stays clear.
            let left = (p.index + st.seed) % 2 == 0
            // Narrow enough to stay clear of a centred head and shoulders.
            let colW: Float = aspect > 1 ? 0.2 : 0.25
            let e = emphasis(p.words)
            let accent = rnd(p.index, 3, st.seed) < 0.25 && !telugu
            let bigFont = accent ? serif : sans
            var big = Kt.coerceIn(ruler.sizeFor(txt(p.words[e]), bigFont, colW) * scale, 0.05, 0.12)
            if ruler.width(txt(p.words[e]), bigFont, big) > colW * 1.15 { big = ruler.sizeFor(txt(p.words[e]), bigFont, colW * 1.15) }
            let small = Kt.coerceIn(big * 0.5, 0.035, 0.06) * (scale < 1 ? scale : 1)
            // The key word on a line of its own, the others grouped on small lines.
            var lines: [(words: [Word], font: String, size: Float, big: Bool)] = []
            var run: [Word] = []
            func flushRun() {
                if !run.isEmpty {
                    for l in wrap(run, sans, small, colW) { lines.append((l, sans, small, false)) }
                    run = []
                }
            }
            for (i, w) in p.words.enumerated() {
                if i == e { flushRun(); lines.append(([w], bigFont, big, true)) } else { run.append(w) }
            }
            flushRun()
            let heights = lines.map { ruler.lineH($0.size) * 0.95 }
            var hsum: Float = 0
            for v in heights { hsum += v }
            var y = 0.40 + (rnd(p.index, 4, st.seed) - 0.5) * 0.16 - hsum / 2
            for (k, ln) in lines.enumerated() {
                y += heights[k] / 2
                let lw = lineWidth(ln.words, ln.font, ln.size)
                let x = left ? m + 0.01 : 1 - m - 0.01 - lw
                line(ln.words, x, y, ln.font, ln.size, false, ln.big)
                y += heights[k] / 2
            }

        case .CASCADE:
            // A staircase: each word a step lower and further along, the key word bigger.
            let e = emphasis(p.words)
            let base: Float = 0.072 * scale
            let sizes: [Float] = p.words.indices.map { $0 == e ? base * 1.4 : base }
            let widths: [Float] = p.words.enumerated().map { i, w in ruler.width(txt(w), sans, sizes[i]) }
            let n = p.words.count
            let maxW = widths.max() ?? 0
            let dx: Float = n > 1 ? max(min(0.13, (1 - 2 * m - maxW) / Float(n - 1)), 0) : 0
            let dys = sizes.map { ruler.lineH($0) * 0.92 }
            var dsum: Float = 0
            for v in dys { dsum += v }
            let forward = (p.index + st.seed) % 2 == 0
            var y = 0.5 + (rnd(p.index, 4, st.seed) - 0.5) * 0.12 - dsum / 2
            for (i, w) in p.words.enumerated() {
                y += dys[i] / 2
                let x = forward ? (0.5 - (dx * Float(n - 1) + widths[n - 1]) / 2 + dx * Float(i))
                    : (0.5 + (dx * Float(n - 1) + widths[0]) / 2 - dx * Float(i) - widths[i])
                line([w], Kt.coerceIn(x, m, max(m, 1 - m - widths[i])), y, sans, sizes[i], false, i == e)
                y += dys[i] / 2
            }

        case .HIGHLIGHT, .LOWER:
            let lower = st.template == .LOWER
            let size: Float = (lower ? 0.058 : 0.062) * scale
            let maxW: Float = (lower ? 0.7 : 0.84) * wide
            let e = emphasis(p.words)
            let lines = wrap(p.words, sans, size, maxW)
            let lh = ruler.lineH(size) * 1.02
            var y = (lower ? 0.86 : 0.74) - lh * Float(lines.count) + lh / 2
            for ln in lines {
                if lower {
                    // Left-aligned; the key word in the accent face, a size up.
                    var x = m + 0.03
                    for w in ln {
                        let key = w.id == p.words[e].id && !telugu
                        let f = key ? serif : sans
                        let sz = key ? size * 1.25 : size
                        let ww = ruler.width(txt(w), f, sz)
                        out.append(Placed(word: w, x: x + ww / 2, y: y, size: sz, font: f, color: st.color, behind: false, big: key))
                        x += ww + ruler.width(" ", sans, size)
                    }
                } else {
                    line(ln, 0.5 - lineWidth(ln, sans, size) / 2, y, sans, size, false, false)
                }
                y += lh
            }

        case .HEADLINE:
            // Capitals filling the width; a phrase going behind sits across the crown.
            let behind = behindOn && behindPhrase(p, st.seed)
            let target: Float = 0.88
            var size = Kt.coerceIn(ruler.sizeFor(p.words.map { txt($0) }.joined(separator: " "), sans, target) * scale, 0.06, 0.2)
            let lines: [[Word]]
            if size >= 0.085 || p.words.count == 1 {
                lines = [p.words]
            } else {
                size = 0.085 * scale
                lines = wrap(p.words, sans, size, target)
            }
            let lh = ruler.lineH(size) * 0.9
            var y = (behind ? HEAD_TOP - 0.01 : 0.15) - lh * Float(lines.count - 1) / 2
            for ln in lines {
                var sz = size
                let lw0 = lineWidth(ln, sans, sz)
                if lw0 > 1 - 2 * m { sz *= (1 - 2 * m) / lw0 }
                line(ln, 0.5 - lineWidth(ln, sans, sz) / 2, y, sans, sz, behind, true)
                y += lh
            }

        case .PUNCH:
            let e = emphasis(p.words)
            let behind = behindOn && behindPhrase(p, st.seed) && !isSmall(p.words[e].text)
            let w = p.words[e]
            var big = Kt.coerceIn(ruler.sizeFor(txt(w), sans, 0.78 * wide) * scale, 0.1, 0.3)
            if ruler.width(txt(w), sans, big) > 1 - 2 * m { big = ruler.sizeFor(txt(w), sans, 1 - 2 * m) }
            let by: Float = behind ? HEAD_TOP + 0.02 : 0.5
            let bw = ruler.width(txt(w), sans, big)
            line([w], 0.5 - bw / 2, by, sans, big, behind, true)
            let rest = p.words.enumerated().filter { $0.offset != e }.map(\.element)
            if !rest.isEmpty {
                let small = Kt.coerceIn(big * 0.32, 0.04, 0.07)
                let lw = lineWidth(rest, sans, small)
                line(rest, 0.5 - lw / 2, by - ruler.lineH(big) * 0.55, sans, small, false, false)
            }

        case .CLASSIC:
            break
        }
        // The person's own changes win.
        return out.map { pl in
            guard let e = edit(track, pl.word) else { return pl }
            var q = pl
            q.x = e.x ?? pl.x
            q.y = e.y ?? pl.y
            q.size = e.size ?? pl.size
            q.font = e.font ?? pl.font
            q.color = e.color ?? pl.color
            switch e.depth {
            case .AUTO: break
            case .FRONT: q.behind = false
            case .BEHIND: q.behind = true
            }
            return q
        }
    }

    /// The edit for [w], if it was made for the word as it now reads.
    private static func edit(_ track: SubtitleTrack, _ w: Word) -> WordEdit? {
        guard let e = track.edits[w.id], e.text.isEmpty || e.text == w.text else { return nil }
        return e
    }

    /// Picks a spot from [pool], weighted to the chest (as the reels do), avoiding [prev].
    private static func slotIndexFor(_ i: Int, _ seed: Int, _ pool: [Int], _ prev: Int) -> Int {
        let others = pool.filter { $0 != prev }
        let choices = others.isEmpty ? pool : others
        let weights: [Float] = choices.map { $0 == 3 ? 2.2 : 1 }
        var wsum: Float = 0
        for v in weights { wsum += v }
        var r = rnd(i, 1, seed) * wsum
        for (k, c) in choices.enumerated() { r -= weights[k]; if r <= 0 { return c } }
        return choices[choices.count - 1]
    }

    // ------------------------------------------------------------------ animation

    private static func ease(_ x: Float) -> Float { let t = 1 - Kt.coerceIn(x, 0, 1); return 1 - t * t * t }
    private static func backOut(_ x: Float) -> Float { let c: Float = 1.7; let t = Kt.coerceIn(x, 0, 1) - 1; return 1 + (c + 1) * t * t * t + c * t * t }

    /// Word layers for the moment [timeMs].
    static func layersAt(_ track: SubtitleTrack, _ timeMs: Int64, aspect: Float, measurer: TextMeasurer?) -> [TextLayer] {
        let all = plan(track).phrases
        let st = track.style
        var visible: [(Phrase, [Phrase])] = []
        if st.template == .STACK {
            // Blocks of up to three lines; a block shows from its first phrase to its last one's end.
            let blocks = stackBlocks(all, track)
            guard let b = blocks.first(where: { timeMs >= $0[0].startMs && timeMs < $0[$0.count - 1].endMs }) else { return [] }
            visible = b.filter { $0.startMs <= timeMs }.map { ($0, b) }
        } else {
            guard let p = all.first(where: { timeMs >= $0.startMs && timeMs < $0.endMs }) else { return [] }
            visible = [(p, [])]
        }
        var out: [TextLayer] = []
        let r = Ruler(nil, aspect: aspect)
        for (p, block) in visible {
            let end = block.isEmpty ? p.endMs : block[block.count - 1].endMs
            let leaving = Kt.coerceIn(Float(end - timeMs) / Float(OUT_MS), 0, 1)
            if st.template == .HIGHLIGHT { highlight(track, p, timeMs, aspect, measurer, leaving, r, &out); continue }
            for pl in place(track, p, aspect: aspect, measurer: measurer, stackOf: block) {
                if timeMs < pl.word.startMs { continue }
                let anim = edit(track, pl.word)?.anim ?? st.wordAnim
                let u = Float(timeMs - pl.word.startMs) / Float(IN_MS)
                var reveal: Float = 1
                var blur: Float = 0
                var alpha: Float = 1
                var dy: Float = 0
                var scale: Float = 1
                switch anim {
                case .BLUR: reveal = ease(u * 1.15); blur = 0.14 * (1 - ease(u)); dy = 0.05 * (1 - ease(u))
                case .FADE: alpha = ease(u)
                case .RISE: alpha = ease(u); dy = 0.4 * (1 - ease(u))
                case .POP: alpha = ease(u * 2); scale = 0.55 + 0.45 * backOut(u)
                case .TYPE:
                    let n = Float(Kt.length(pl.word.text))
                    reveal = u >= 1 ? 1 : (Float(Int(u * n)) + 1) / (n + 1)
                case .NONE: break
                }
                // Going: the whole phrase fades and softens in its last moment.
                if leaving < 1 { alpha *= leaving; blur += 0.1 * (1 - leaving) }
                if alpha <= 0.01 { continue }
                var l = TextLayer()
                l.id = layerId(pl.word)
                l.text = shown(st.template, pl.word.text)
                l.font = pl.font
                l.size = pl.size * scale
                l.x = pl.x
                l.y = pl.y + dy * r.lineH(pl.size)
                l.color = pl.color
                l.opacity = alpha
                l.tracking = st.tracking
                l.fx = st.effect
                l.fxAmount = st.effectAmount
                l.fxColor = st.effectColor
                l.behind = pl.behind
                l.reveal = reveal
                l.blur = blur
                l.blend = st.blend
                out.append(l)
            }
        }
        return out
    }

    /// Highlight: the whole line is up from its first word; words not yet said are dim, the
    /// word being said is in the accent colour and pops a little, words said are full white.
    private static func highlight(_ track: SubtitleTrack, _ p: Phrase, _ timeMs: Int64, _ aspect: Float, _ measurer: TextMeasurer?,
                                  _ leaving: Float, _ r: Ruler, _ out: inout [TextLayer]) {
        let st = track.style
        let enter = ease(Float(timeMs - p.startMs) / Float(IN_MS))
        for pl in place(track, p, aspect: aspect, measurer: measurer) {
            let e = edit(track, pl.word)
            let said = timeMs >= pl.word.startMs
            let now = said && timeMs < pl.word.endMs
            let pop: Float = now ? ease(Float(timeMs - pl.word.startMs) / 120) : 0
            let alpha = (said ? 1 : 0.5) * enter * leaving
            if alpha <= 0.01 { continue }
            var l = TextLayer()
            l.id = layerId(pl.word)
            l.text = shown(st.template, pl.word.text)
            l.font = pl.font
            l.size = pl.size * (1 + 0.12 * pop)
            l.x = pl.x
            l.y = pl.y + 0.25 * (1 - enter) * r.lineH(pl.size)
            l.color = now && e?.color == nil ? st.accentColor : pl.color
            l.opacity = alpha
            l.tracking = st.tracking
            l.fx = st.effect
            l.fxAmount = st.effectAmount
            l.fxColor = st.effectColor
            l.behind = pl.behind
            l.blend = st.blend
            out.append(l)
        }
    }

    /// The word as the template shows it (Headline sets capitals).
    static func shown(_ template: CaptionTemplate, _ text: String) -> String { template == .HEADLINE ? text.uppercased() : text }

    /// Stack blocks: up to three consecutive phrases, broken by a long silence.
    static func stackBlocks(_ all: [Phrase], _ track: SubtitleTrack) -> [[Phrase]] {
        var out: [[Phrase]] = []
        var cur: [Phrase] = []
        for p in all {
            let gap = !cur.isEmpty && p.startMs - cur[cur.count - 1].words[cur[cur.count - 1].words.count - 1].endMs > 600
            if cur.count >= 3 || gap { out.append(cur); cur = [] }
            cur.append(p)
        }
        if !cur.isEmpty { out.append(cur) }
        return out
    }

    /// The phrase holding the word [id] ("cue:word"), if any.
    static func phraseOf(_ track: SubtitleTrack, _ id: String) -> Phrase? {
        plan(track).phrases.first { p in p.words.contains { $0.id == id } }
    }

    /// The phrase on screen at [timeMs] (or the last one begun before it).
    static func phraseAt(_ track: SubtitleTrack, _ timeMs: Int64) -> Phrase? {
        let ps = plan(track).phrases
        return ps.first { timeMs >= $0.startMs && timeMs < $0.endMs } ?? ps.last { $0.startMs <= timeMs }
    }

    /// Where the word [id] settles, with every template rule and edit applied (for the editor).
    static func placedWord(_ track: SubtitleTrack, _ id: String, aspect: Float, measurer: TextMeasurer?) -> Placed? {
        guard let p = phraseOf(track, id) else { return nil }
        let block = track.style.template == .STACK
            ? (stackBlocks(plan(track).phrases, track).first { $0.contains { $0.index == p.index } } ?? []) : []
        return place(track, p, aspect: aspect, measurer: measurer, stackOf: block).first { $0.word.id == id }
    }

    /// Layer ids carry the word: cue * 1000 + word + 1.
    static func layerId(_ w: Word) -> Int64 { Int64(w.cue) * 1000 + Int64(w.index) + 1 }
    static func wordIdOf(_ layerId: Int64) -> String { "\((layerId - 1) / 1000):\((layerId - 1) % 1000)" }
}

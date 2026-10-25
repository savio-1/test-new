import Foundation

// A port of Subtitles.kt: the subtitle model (cues, style, track), its JSON (the same keys as
// Android, so a track saved on one reads on the other), SubRip export, and classic line layout.

/// One subtitle: when it shows, and its line in each language.
struct Cue: Codable, Equatable {
    var startMs: Int64
    var endMs: Int64
    /// Language spoken in this cue ("te", "en", ...).
    var language: String = ""
    var english: String = ""
    var telugu: String = ""
    /// When each word of [timedText] starts (ms), found by aligning the words to the clip's
    /// sound. Kept only while the text shown is still that text; retyping falls back to an
    /// estimate until the words are aligned again.
    var wordStarts: [Int64] = []
    var timedText: String = ""

    init(_ startMs: Int64, _ endMs: Int64, _ language: String = "", _ english: String = "", _ telugu: String = "",
         wordStarts: [Int64] = [], timedText: String = "") {
        self.startMs = startMs
        self.endMs = endMs
        self.language = language
        self.english = english
        self.telugu = telugu
        self.wordStarts = wordStarts
        self.timedText = timedText
    }

    /// Named-argument form, as Kotlin's `Cue(0, 2000, english = "One")`.
    init(startMs: Int64, endMs: Int64, language: String = "", english: String = "", telugu: String = "") {
        self.init(startMs, endMs, language, english, telugu)
    }

    enum CodingKeys: String, CodingKey { case start, end, language, english, telugu, words, timedText }

    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: CodingKeys.self)
        startMs = c.optLong(.start)
        endMs = c.optLong(.end)
        language = c.optString(.language)
        english = c.optString(.english)
        telugu = c.optString(.telugu)
        wordStarts = (try? c.decode([JSONLong].self, forKey: .words))?.map(\.value) ?? []
        timedText = c.optString(.timedText)
    }

    func encode(to e: Encoder) throws {
        var c = e.container(keyedBy: CodingKeys.self)
        try c.encode(startMs, forKey: .start)
        try c.encode(endMs, forKey: .end)
        try c.encode(language, forKey: .language)
        try c.encode(english, forKey: .english)
        try c.encode(telugu, forKey: .telugu)
        if !wordStarts.isEmpty {
            try c.encode(wordStarts, forKey: .words)
            try c.encode(timedText, forKey: .timedText)
        }
    }
}

/// Which language the subtitles show.
enum SubtitleLanguage: String, Codable, CaseIterable {
    case ENGLISH, TELUGU, BOTH

    var label: String {
        switch self {
        case .ENGLISH: return "English"
        case .TELUGU: return "తెలుగు"
        case .BOTH: return "Both"
        }
    }
}

/// What sits behind the letters so they read over any picture.
enum SubtitleBackground: String, Codable, CaseIterable {
    case NONE, SHADOW, OUTLINE, BOX

    var label: String {
        switch self {
        case .NONE: return "None"
        case .SHADOW: return "Shadow"
        case .OUTLINE: return "Outline"
        case .BOX: return "Box"
        }
    }
}

/// How subtitles look in the video.
struct SubtitleStyle: Codable, Equatable {
    /// The bold sans classic subtitles default to (FontLibrary.SUBTITLE_LATIN on Android).
    static let defaultLatinFont = "asset:InterBold.ttf"

    var language: SubtitleLanguage = .ENGLISH
    var latinFont: String = SubtitleStyle.defaultLatinFont
    var teluguFont: String = FontKeys.subtitleTelugu
    /// Text size as a fraction of the frame's short side.
    var size: Float = 0.045
    /// Where the block sits, 0..1 (y from the top). [x] is the block's left edge, centre or
    /// right edge as [align] is LEFT, CENTER or RIGHT; [y] is its centre.
    var x: Float = 0.5
    var y: Float = 0.86
    var align: TextAlign = .CENTER
    var color: Int32 = Int32(bitPattern: 0xFFFF_FFFF)
    var background: SubtitleBackground = .BOX
    /// Colour of the box or outline (opaque), and the box's opacity.
    var backColor: Int32 = Int32(bitPattern: 0xFF00_0000)
    var backOpacity: Float = 0.6
    /// Classic lines, or one of the kinetic templates (see [Kinetic]).
    var template: CaptionTemplate = .SCATTER
    /// Kinetic captions: the main face, its italic, and the serif used for accent words.
    var captionFont: String = FontKeys.interTight700
    var captionItalic: String = FontKeys.interTightItalic
    var accentFont: String = FontKeys.serifItalic
    /// Kinetic captions: overall size (1 = the template's own) and how each word comes in.
    var captionScale: Float = 1
    var wordAnim: WordAnim = .BLUR
    /// Kinetic captions: some big words pass behind the subject (a mix, never all of them).
    var behindSubject: Bool = false
    /// Kinetic captions: changes the spots and accents the template picks ("Shuffle").
    var seed: Int = 0
    /// Extra space between letters, in ems (both kinds of subtitles).
    var tracking: Float = 0
    /// Kinetic captions: a finish on the letters (shadow, glow, haze...), how strong, and its colour (0: the effect's own).
    var effect: TextFx = .NONE
    var effectAmount: Float = 0.5
    var effectColor: Int32 = 0
    /// How the captions mix with the picture (kinetic captions).
    var blend: TextBlend = .NORMAL
    /// The colour of the word being said in Highlight, and of accent words.
    var accentColor: Int32 = Int32(bitPattern: 0xFFFF_E14D)
    /// Background noise taken out of the voice when burning in: 0 off, up to 1 (strong).
    var cleanVoice: Float = 0

    var kinetic: Bool { template != .CLASSIC }

    init() {}

    /// Memberwise-style init with every field optional, as Kotlin's named arguments.
    init(language: SubtitleLanguage = .ENGLISH, latinFont: String = SubtitleStyle.defaultLatinFont, teluguFont: String = FontKeys.subtitleTelugu,
         size: Float = 0.045, x: Float = 0.5, y: Float = 0.86, align: TextAlign = .CENTER,
         color: Int32 = Int32(bitPattern: 0xFFFF_FFFF), background: SubtitleBackground = .BOX,
         backColor: Int32 = Int32(bitPattern: 0xFF00_0000), backOpacity: Float = 0.6, template: CaptionTemplate = .SCATTER,
         captionFont: String = FontKeys.interTight700, captionItalic: String = FontKeys.interTightItalic,
         accentFont: String = FontKeys.serifItalic, captionScale: Float = 1, wordAnim: WordAnim = .BLUR,
         behindSubject: Bool = false, seed: Int = 0, tracking: Float = 0, effect: TextFx = .NONE, effectAmount: Float = 0.5,
         effectColor: Int32 = 0, blend: TextBlend = .NORMAL, accentColor: Int32 = Int32(bitPattern: 0xFFFF_E14D), cleanVoice: Float = 0) {
        self.language = language; self.latinFont = latinFont; self.teluguFont = teluguFont
        self.size = size; self.x = x; self.y = y; self.align = align; self.color = color; self.background = background
        self.backColor = backColor; self.backOpacity = backOpacity; self.template = template
        self.captionFont = captionFont; self.captionItalic = captionItalic; self.accentFont = accentFont
        self.captionScale = captionScale; self.wordAnim = wordAnim; self.behindSubject = behindSubject; self.seed = seed
        self.tracking = tracking; self.effect = effect; self.effectAmount = effectAmount; self.effectColor = effectColor
        self.blend = blend; self.accentColor = accentColor; self.cleanVoice = cleanVoice
    }

    enum CodingKeys: String, CodingKey {
        case language, latinFont, teluguFont, size, x, y, align, color, background, backColor, backOpacity, template,
             captionFont, captionItalic, accentFont, captionScale, wordAnim, behindSubject, seed, tracking, effect,
             effectAmount, effectColor, cleanVoice, blend, accentColor, box
    }

    init(from d: Decoder) throws {
        let o = try d.container(keyedBy: CodingKeys.self)
        language = o.optEnum(.language) ?? .ENGLISH
        latinFont = o.optString(.latinFont, SubtitleStyle.defaultLatinFont)
        teluguFont = o.optString(.teluguFont, FontKeys.subtitleTelugu)
        size = o.optFloat(.size, 0.045)
        x = o.optFloat(.x, 0.5)
        y = o.optFloat(.y, 0.86)
        align = o.optEnum(.align) ?? .CENTER
        color = o.optInt(.color, Int32(bitPattern: 0xFFFF_FFFF))
        // Tracks saved before backgrounds had a choice kept a box flag.
        background = o.optEnum(.background) ?? (((try? o.decode(Bool.self, forKey: .box)) ?? true) ? .BOX : .SHADOW)
        backColor = o.optInt(.backColor, Int32(bitPattern: 0xFF00_0000))
        backOpacity = o.optFloat(.backOpacity, 0.6)
        // Tracks saved before templates existed keep their classic lines.
        template = o.optEnum(.template) ?? .CLASSIC
        captionFont = o.optString(.captionFont, FontKeys.interTight700)
        captionItalic = o.optString(.captionItalic, FontKeys.interTightItalic)
        accentFont = o.optString(.accentFont, FontKeys.serifItalic)
        captionScale = o.optFloat(.captionScale, 1)
        wordAnim = o.optEnum(.wordAnim) ?? .BLUR
        behindSubject = (try? o.decode(Bool.self, forKey: .behindSubject)) ?? false
        seed = Int(o.optInt(.seed, 0))
        tracking = o.optFloat(.tracking, 0)
        effect = o.optEnum(.effect) ?? .NONE
        effectAmount = o.optFloat(.effectAmount, 0.5)
        effectColor = o.optInt(.effectColor, 0)
        cleanVoice = o.optFloat(.cleanVoice, 0)
        blend = o.optEnum(.blend) ?? .NORMAL
        accentColor = o.optInt(.accentColor, Int32(bitPattern: 0xFFFF_E14D))
    }

    func encode(to e: Encoder) throws {
        var o = e.container(keyedBy: CodingKeys.self)
        try o.encode(language, forKey: .language); try o.encode(latinFont, forKey: .latinFont)
        try o.encode(teluguFont, forKey: .teluguFont); try o.encode(size, forKey: .size)
        try o.encode(x, forKey: .x); try o.encode(y, forKey: .y); try o.encode(align, forKey: .align)
        try o.encode(color, forKey: .color); try o.encode(background, forKey: .background)
        try o.encode(backColor, forKey: .backColor); try o.encode(backOpacity, forKey: .backOpacity)
        try o.encode(template, forKey: .template); try o.encode(captionFont, forKey: .captionFont)
        try o.encode(captionItalic, forKey: .captionItalic); try o.encode(accentFont, forKey: .accentFont)
        try o.encode(captionScale, forKey: .captionScale); try o.encode(wordAnim, forKey: .wordAnim)
        try o.encode(behindSubject, forKey: .behindSubject); try o.encode(seed, forKey: .seed)
        try o.encode(tracking, forKey: .tracking); try o.encode(effect, forKey: .effect)
        try o.encode(effectAmount, forKey: .effectAmount); try o.encode(effectColor, forKey: .effectColor)
        try o.encode(cleanVoice, forKey: .cleanVoice); try o.encode(blend, forKey: .blend)
        try o.encode(accentColor, forKey: .accentColor)
    }

    /// Reads a style saved as JSON; anything missing or unreadable takes its default.
    static func fromJson(_ data: Data?) -> SubtitleStyle {
        guard let data, let s = try? JSONDecoder().decode(SubtitleStyle.self, from: data) else { return SubtitleStyle() }
        return s
    }
}

/// A clip's subtitles: the cues, their style, and changes to single words (kinetic captions, by word id).
struct SubtitleTrack: Codable, Equatable {
    var cues: [Cue]
    var style: SubtitleStyle = SubtitleStyle()
    var edits: [String: WordEdit] = [:]

    init(_ cues: [Cue], _ style: SubtitleStyle = SubtitleStyle(), edits: [String: WordEdit] = [:]) {
        self.cues = cues
        self.style = style
        self.edits = edits
    }

    func at(_ timeMs: Int64) -> Cue? { cues.first { timeMs >= $0.startMs && timeMs < $0.endMs } }

    /// Text layers for the moment [timeMs], in a frame of aspect [aspect] (width / height).
    /// Both languages stack: Telugu above, English below, the pair centred on [SubtitleStyle.y]
    /// and lined up on [SubtitleStyle.x] by [SubtitleStyle.align], kept inside the frame.
    /// [measurer] nil: sizes are estimated (as Android without fonts, in tests).
    func layersAt(_ timeMs: Int64, aspect: Float, measurer: TextMeasurer?) -> [TextLayer] {
        if style.kinetic { return Kinetic.layersAt(self, timeMs, aspect: aspect, measurer: measurer) }
        guard let c = at(timeMs) else { return [] }
        return layersFor(c, aspect: aspect, measurer: measurer)
    }

    /// Sets (or clears, when empty) the change to word [id].
    func withEdit(_ id: String, _ edit: WordEdit) -> SubtitleTrack {
        var t = self
        if edit.isEmpty { t.edits.removeValue(forKey: id) } else { t.edits[id] = edit }
        return t
    }

    func layersFor(_ cue: Cue, aspect: Float, measurer: TextMeasurer?) -> [TextLayer] {
        let s = style
        let all: [(String, String)]
        switch s.language {
        case .ENGLISH: all = [(cue.english, s.latinFont)]
        case .TELUGU: all = [(cue.telugu, s.teluguFont)]
        case .BOTH: all = [(cue.telugu, s.teluguFont), (cue.english, s.latinFont)]
        }
        let lines = all.filter { !Kt.isBlank($0.0) }
        if lines.isEmpty { return [] }
        let margin: Float = 0.03
        // Room for a line: from the anchor to the edge it grows towards.
        let room0: Float
        switch s.align {
        case .LEFT: room0 = 1 - margin - s.x
        case .RIGHT: room0 = s.x - margin
        case .CENTER: room0 = 2 * min(s.x, 1 - s.x) - 2 * margin
        }
        let room = Kt.coerceIn(room0, 0.35, 0.9)
        let alpha = UInt32(Int32(Kt.coerceIn(s.backOpacity, 0, 1) * 255))
        let base: [TextLayer] = lines.map { text, font in
            var l = TextLayer()
            l.id = 0
            l.text = Kt.trim(text)
            l.font = font
            l.size = s.size
            l.color = s.color
            l.align = s.align
            l.tracking = s.tracking
            l.shadow = s.background == .SHADOW
            l.wrap = room
            l.box = s.background == .BOX
            l.boxColor = Int32(bitPattern: (UInt32(bitPattern: s.backColor) & 0xFFFFFF) | (alpha << 24))
            l.outline = s.background == .OUTLINE ? Int32(bitPattern: UInt32(bitPattern: s.backColor) | 0xFF00_0000) : 0
            return l
        }
        // Sizes as fractions of the frame, so the block can be stacked and kept on screen.
        let w = 1000 * max(aspect, 0.01)
        let h: Float = 1000
        let sizes: [(Float, Float)] = base.map { l in
            if let m = measurer {
                let b = m.blockSize(l, frameWidth: w, frameHeight: h)
                return (b.width / w, b.height / h)
            }
            return (0.6, s.size * 1.4)
        }
        let gap: Float = 0.008
        let total = Float(sizes.reduce(0.0) { $0 + Double($1.1) }) + gap * Float(sizes.count - 1)
        let centre = Kt.coerceIn(s.y, min(0.5, total / 2 + margin), max(0.5, 1 - total / 2 - margin))
        var top = centre - total / 2
        return base.enumerated().map { i, l0 in
            let (bw, bh) = sizes[i]
            let cx0: Float
            switch s.align {
            case .LEFT: cx0 = s.x + bw / 2
            case .RIGHT: cx0 = s.x - bw / 2
            case .CENTER: cx0 = s.x
            }
            let cx = Kt.coerceIn(cx0, min(0.5, bw / 2 + margin / 2), max(0.5, 1 - bw / 2 - margin / 2))
            let y = top + bh / 2
            top += bh + gap
            var l = l0
            l.id = Int64(i) + 1
            l.x = cx
            l.y = y
            return l
        }
    }

    enum CodingKeys: String, CodingKey { case cues, style, edits }

    init(from d: Decoder) throws {
        let o = try d.container(keyedBy: CodingKeys.self)
        cues = (try? o.decode([Cue].self, forKey: .cues)) ?? []
        style = (try? o.decode(SubtitleStyle.self, forKey: .style)) ?? SubtitleStyle()
        edits = (try? o.decode([String: WordEdit].self, forKey: .edits)) ?? [:]
    }

    func encode(to e: Encoder) throws {
        var o = e.container(keyedBy: CodingKeys.self)
        try o.encode(cues, forKey: .cues)
        try o.encode(style, forKey: .style)
        try o.encode(edits, forKey: .edits)
    }

    /// The track as JSON (the same shape Android saves).
    func toJson() -> Data { (try? JSONEncoder().encode(self)) ?? Data("{}".utf8) }

    /// A track from saved JSON; nil when it isn't a JSON object.
    static func fromJson(_ data: Data) -> SubtitleTrack? { try? JSONDecoder().decode(SubtitleTrack.self, from: data) }

    /// SubRip (.srt) text in [language] (BOTH writes the two lines together).
    func toSrt(_ language: SubtitleLanguage? = nil) -> String {
        let lang = language ?? style.language
        var out = ""
        for (i, c) in cues.enumerated() {
            let raw: String
            switch lang {
            case .ENGLISH: raw = c.english
            case .TELUGU: raw = c.telugu
            case .BOTH: raw = [c.telugu, c.english].filter { !Kt.isBlank($0) }.joined(separator: "\n")
            }
            let text = Kt.trim(raw)
            out += "\(i + 1)\n"
            out += SubtitleTrack.srtTime(c.startMs) + " --> " + SubtitleTrack.srtTime(c.endMs) + "\n"
            out += (text.isEmpty ? " " : text) + "\n\n"
        }
        return out
    }

    static func srtTime(_ ms: Int64) -> String {
        let t = max(0, ms)
        func pad(_ v: Int64, _ n: Int) -> String { let s = String(v); return String(repeating: "0", count: max(0, n - s.count)) + s }
        return "\(pad(t / 3_600_000, 2)):\(pad(t / 60_000 % 60, 2)):\(pad(t / 1000 % 60, 2)),\(pad(t % 1000, 3))"
    }

    /// Tidies cues from a model: in order, inside the clip, no overlaps, each on screen long
    /// enough to read (at least 0.7 s), empty ones dropped.
    static func clean(_ raw: [Cue], durationMs: Int64) -> [Cue] {
        let end = durationMs > 0 ? durationMs : Int64.max
        let kept = raw.filter { !Kt.isBlank($0.english) || !Kt.isBlank($0.telugu) }.map { c -> Cue in
            var c = c
            c.startMs = Kt.coerceIn(c.startMs, 0, end)
            c.endMs = Kt.coerceIn(c.endMs, 0, end)
            return c
        }
        // A stable sort by start, as Kotlin's sortedBy.
        let sorted = kept.enumerated().sorted { a, b in
            a.element.startMs != b.element.startMs ? a.element.startMs < b.element.startMs : a.offset < b.offset
        }.map(\.element)
        var out: [Cue] = []
        for (i, c) in sorted.enumerated() {
            let next = i + 1 < sorted.count ? sorted[i + 1].startMs : end
            var e = max(c.endMs, c.startMs &+ 700)
            if e > next { e = max(next, c.startMs &+ 300) }
            if e > end { e = end }
            if e > c.startMs { var k = c; k.endMs = e; out.append(k) }
        }
        return out
    }

    /// Seconds (as a model writes them: 3.2, "3.2", "00:03.2", "0:00:03,200") to milliseconds.
    static func parseTime(_ v: Any?) -> Int64 {
        if let s = v as? String {
            var t = Kt.trim(s)
            if t.hasSuffix("s") { t.removeLast() }
            t = t.replacingOccurrences(of: ",", with: ".")
            var secs = 0.0
            for p in t.split(separator: ":", omittingEmptySubsequences: false) {
                secs = secs * 60 + (Double(p.trimmingCharacters(in: .whitespaces)) ?? 0)
            }
            return Kt.round(secs * 1000)
        }
        if let d = v as? Double { return Kt.round(d * 1000) }
        if let i = v as? Int { return Kt.round(Double(i) * 1000) }
        if let n = v as? NSNumber { return Kt.round(n.doubleValue * 1000) }
        return 0
    }
}

// ------------------------------------------------------------------ word edits as JSON

extension WordEdit: Codable {
    enum CodingKeys: String, CodingKey { case text, x, y, size, font, color, anim, depth }

    init(from d: Decoder) throws {
        let o = try d.container(keyedBy: CodingKeys.self)
        text = o.optString(.text)
        x = o.contains(.x) ? o.optFloat(.x, .nan) : nil
        y = o.contains(.y) ? o.optFloat(.y, .nan) : nil
        size = o.contains(.size) ? o.optFloat(.size, .nan) : nil
        font = o.contains(.font) ? o.optString(.font) : nil
        color = o.contains(.color) ? o.optInt(.color, 0) : nil
        anim = o.contains(.anim) ? o.optEnum(.anim) : nil
        depth = o.optEnum(.depth) ?? .AUTO
    }

    func encode(to e: Encoder) throws {
        var o = e.container(keyedBy: CodingKeys.self)
        try o.encode(text, forKey: .text)
        try o.encodeIfPresent(x, forKey: .x)
        try o.encodeIfPresent(y, forKey: .y)
        try o.encodeIfPresent(size, forKey: .size)
        try o.encodeIfPresent(font, forKey: .font)
        try o.encodeIfPresent(color, forKey: .color)
        try o.encodeIfPresent(anim, forKey: .anim)
        if depth != .AUTO { try o.encode(depth, forKey: .depth) }
    }
}

// ------------------------------------------------------------------ Kotlin semantics

/// Small helpers that behave as the Kotlin standard library does, so the ports count and
/// trim text exactly as Android (shared by the subtitle files).
enum Kt {
    /// Kotlin's coerceIn (for lo <= hi).
    @inline(__always) static func coerceIn<T: Comparable>(_ v: T, _ lo: T, _ hi: T) -> T { v < lo ? lo : (v > hi ? hi : v) }

    /// Java's Math.round: halves go up.
    static func round(_ x: Double) -> Int64 {
        if x.isNaN { return 0 }
        let f = x.rounded(.down)
        let r = x - f >= 0.5 ? f + 1 : f
        if r >= 9.2233720368547758e18 { return Int64.max }
        if r <= -9.2233720368547758e18 { return Int64.min }
        return Int64(r)
    }

    /// Kotlin's isBlank: empty or only whitespace.
    static func isBlank(_ s: String) -> Bool { s.unicodeScalars.allSatisfy { isWhitespace($0) } }

    /// Kotlin's Char.isWhitespace.
    static func isWhitespace(_ c: Unicode.Scalar) -> Bool {
        switch c.value {
        case 0x09...0x0D, 0x1C...0x1F: return true
        default: return c.properties.isWhitespace || c.properties.generalCategory == .spaceSeparator
        }
    }

    /// Kotlin's trim(): whitespace off both ends.
    static func trim(_ s: String) -> String {
        let u = Array(s.unicodeScalars)
        var a = 0
        var b = u.count
        while a < b && isWhitespace(u[a]) { a += 1 }
        while b > a && isWhitespace(u[b - 1]) { b -= 1 }
        var out = String.UnicodeScalarView()
        out.append(contentsOf: u[a..<b])
        return String(out)
    }

    /// Kotlin's `split(Regex("\\s+")).filter { it.isNotBlank() }`: the words between runs of
    /// (ASCII) whitespace, which is what Java's \s matches.
    static func splitWords(_ s: String) -> [String] {
        var out: [String] = []
        var cur = String.UnicodeScalarView()
        func flush() {
            if !cur.isEmpty { let w = String(cur); if !isBlank(w) { out.append(w) }; cur = String.UnicodeScalarView() }
        }
        for c in s.unicodeScalars {
            switch c.value {
            case 0x20, 0x09, 0x0A, 0x0B, 0x0C, 0x0D: flush()
            default: cur.append(c)
            }
        }
        flush()
        return out
    }

    /// A string's length as Kotlin counts it (UTF-16 units).
    @inline(__always) static func length(_ s: String) -> Int { s.utf16.count }
}

/// A JSON number read as Kotlin's optLong does (a fraction is cut off).
private struct JSONLong: Decodable {
    let value: Int64
    init(from d: Decoder) throws {
        let c = try d.singleValueContainer()
        if let v = try? c.decode(Int64.self) { value = v }
        else if let v = try? c.decode(Double.self), v.isFinite { value = Int64(max(-9.2e18, min(9.2e18, v))) }
        else { value = 0 }
    }
}

/// org.json's lenient reads: a missing or mistyped value takes the fallback.
fileprivate extension KeyedDecodingContainer {
    func optString(_ k: Key, _ fallback: String = "") -> String { (try? decode(String.self, forKey: k)) ?? fallback }

    func optLong(_ k: Key, _ fallback: Int64 = 0) -> Int64 { (try? decode(JSONLong.self, forKey: k))?.value ?? fallback }

    /// An ARGB colour or other int, as optInt (wraps like Java's intValue).
    func optInt(_ k: Key, _ fallback: Int32) -> Int32 {
        if let v = try? decode(Int32.self, forKey: k) { return v }
        if let v = try? decode(Int64.self, forKey: k) { return Int32(truncatingIfNeeded: v) }
        if let v = try? decode(Double.self, forKey: k), v.isFinite { return Int32(truncatingIfNeeded: Int64(max(-9.2e18, min(9.2e18, v)))) }
        return fallback
    }

    func optFloat(_ k: Key, _ fallback: Float) -> Float {
        if let v = try? decode(Double.self, forKey: k) { return Float(v) }
        return fallback
    }

    func optEnum<E: RawRepresentable>(_ k: Key) -> E? where E.RawValue == String {
        (try? decode(String.self, forKey: k)).flatMap { E(rawValue: $0) }
    }
}

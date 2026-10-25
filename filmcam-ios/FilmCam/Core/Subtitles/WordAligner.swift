import Foundation

// A port of WordAligner.kt: the on-device forced aligner (log-mel features, FFT, the small
// acoustic model, the romaniser and the Viterbi pass). Float maths in the same order as
// Kotlin, so the letter probabilities match Android's (and the training code's) closely.

/// Letter log-probabilities: [frames] rows (one every 20 ms) of [AlignModel.VOCAB] values.
struct LetterLogProbs {
    let frames: Int
    /// Row-major: frame t, letter v at t * VOCAB + v.
    var values: [Float]

    init(frames: Int, values: [Float]) {
        self.frames = frames
        self.values = values
    }

    subscript(t: Int, v: Int) -> Float { values[t * AlignModel.VOCAB + v] }
}

/// Finds when each word of the subtitles is said, so kinetic captions land on the voice.
///
/// A small acoustic model (about 330 thousand weights, distilled from Meta's MMS forced-alignment
/// model) turns the clip's sound into letter probabilities every 20 ms; each cue's words, written
/// in Latin letters (Telugu romanised), are then forced through those probabilities. A cue is
/// matched only near where the transcript says it is, with "anything else" allowed before and
/// after it, so a cue time that is a little off, or speech nobody wrote down, doesn't pull the
/// words away. Words come out to within a frame or two of when they start.
struct WordAligner {
    let model: AlignModel

    init(model: AlignModel) { self.model = model }

    /// The track with word start times on every cue whose text could be matched to the sound
    /// [pcm] (16 kHz mono, -1..1). Cues whose shown text isn't the language spoken (a
    /// translation) keep the even estimate. Takes a while on long clips: call off the main thread.
    func align(_ pcm: [Float], _ track: SubtitleTrack) -> SubtitleTrack {
        alignWith(model.logProbs(pcm), track)
    }

    /// As [align], from letter log-probabilities already worked out.
    func alignWith(_ lp: LetterLogProbs, _ track: SubtitleTrack) -> SubtitleTrack {
        let T = lp.frames
        var prevEnd = 0
        var out = track
        out.cues = track.cues.map { c in
            let text = WordAligner.shownText(c, track.style.language)
            let words = Kt.splitWords(text)
            var done = c
            done.wordStarts = []
            done.timedText = text
            // Marked as done either way (no times: the even estimate), so it isn't tried again.
            if words.isEmpty || !WordAligner.spoken(c, track.style.language) { return done }
            guard let starts = alignCue(lp, T, words, c.startMs, c.endMs, prevEnd) else { return done }
            prevEnd = starts.1
            done.wordStarts = starts.0
            return done
        }
        return out
    }

    /// Word starts for one cue, and the frame after its last letter; nil when the words don't
    /// fit the sound (too few frames, nothing to spell, or a poor match).
    private func alignCue(_ lp: LetterLogProbs, _ T: Int, _ words: [String], _ startMs: Int64, _ endMs: Int64, _ prevEnd: Int) -> ([Int64], Int)? {
        var toks: [Int32] = []
        var owner: [Int] = []
        for (wi, w) in words.enumerated() {
            for ch in Romanizer.roman(w).unicodeScalars {
                if let k = AlignModel.labelIndex[ch], k > 0 { toks.append(Int32(k)); owner.append(wi) }
            }
        }
        if toks.isEmpty { return nil }
        // From where the previous line's words ended, but never later than this line's own
        // written start: a previous line found too late mustn't push this one late too.
        let written = Int(Double(startMs) / WordAligner.FRAME_MS)
        let a = Kt.coerceIn(max(min(prevEnd, written), Int(Double(startMs - WordAligner.PAD_MS) / WordAligner.FRAME_MS)), 0, T)
        let b = min(T, Int(Double(endMs + WordAligner.PAD_MS) / WordAligner.FRAME_MS) + 1)
        if b - a < toks.count + 2 { return nil }
        let path = viterbi(lp, a, b, toks)
        var starts = [Int64](repeating: -1, count: words.count)
        var last = a
        var hit = 0
        let n2 = 2 * toks.count + 1
        for t in path.indices {
            let s = Int(path[t])
            if s >= 1 && s <= n2 && (s - 1) % 2 == 1 {
                let w = owner[(s - 1) / 2]
                if starts[w] < 0 { starts[w] = max(Int64(Double(a + t) * WordAligner.FRAME_MS + WordAligner.OFFSET_MS), 0) }
                last = a + t
                hit += 1
            }
        }
        if hit == 0 { return nil }
        // Words with nothing to spell (symbols, emoji) go evenly between their neighbours.
        let known = starts.indices.filter { starts[$0] >= 0 }
        for i in starts.indices where starts[i] < 0 {
            let p = known.last { $0 < i }
            let n = known.first { $0 > i }
            if let p, let n {
                starts[i] = starts[p] + (starts[n] - starts[p]) * Int64(i - p) / Int64(n - p)
            } else if let p {
                starts[i] = starts[p]
            } else if let n {
                starts[i] = starts[n]
            } else {
                starts[i] = startMs
            }
        }
        if starts.count > 1 { for i in 1..<starts.count where starts[i] < starts[i - 1] { starts[i] = starts[i - 1] } }
        return (starts, last + 1)
    }

    /// Best path of the letters [toks] through frames [a]..[b): CTC states (blank, letter,
    /// blank, letter ... blank) with an "anything else" state before and after. Returns the
    /// state of each frame (0: before, 2n+2: after).
    private func viterbi(_ lp: LetterLogProbs, _ a: Int, _ b: Int, _ toks: [Int32]) -> [Int32] {
        let T = b - a
        let n = toks.count
        let S = 2 * n + 3
        let V = AlignModel.VOCAB
        let neg: Float = -1e30
        var prevA = [Float](repeating: neg, count: S)
        var curA = [Float](repeating: 0, count: S)
        var back = [UInt8](repeating: 0, count: T * S)   // how far back the best state was (0, 1 or 2)
        var path = [Int32](repeating: 0, count: T)
        lp.values.withUnsafeBufferPointer { lpp in
        toks.withUnsafeBufferPointer { tk in
        back.withUnsafeMutableBufferPointer { bk in
            func garbage(_ t: Int) -> Float {
                let r = (a + t) * V
                var m = lpp[r]
                for v in 1..<V where lpp[r + v] > m { m = lpp[r + v] }
                return m - WordAligner.GARBAGE_PENALTY
            }
            @inline(__always) func em(_ t: Int, _ s: Int, _ g: Float) -> Float {
                if s == 0 || s == S - 1 { return g }
                let r = (a + t) * V
                return (s - 1) % 2 == 0 ? lpp[r] : lpp[r + Int(tk[(s - 1) / 2])]
            }
            let g0 = garbage(0)
            prevA[0] = em(0, 0, g0); prevA[1] = em(0, 1, g0); prevA[2] = em(0, 2, g0)
            for t in 1..<max(T, 1) {
                let g = garbage(t)
                let bt = t * S
                prevA.withUnsafeBufferPointer { prev in
                curA.withUnsafeMutableBufferPointer { cur in
                    for s in 0..<S {
                        var best = prev[s]
                        var step: UInt8 = 0
                        if s >= 1 && prev[s - 1] > best { best = prev[s - 1]; step = 1 }
                        // Straight from one letter to the next when they differ (no blank between).
                        if s >= 3 && s <= S - 2 && (s - 1) % 2 == 1 {
                            let k = (s - 1) / 2
                            if k >= 1 && tk[k] != tk[k - 1] && prev[s - 2] > best { best = prev[s - 2]; step = 2 }
                        }
                        if s == 2 && prev[0] > best { best = prev[0]; step = 2 }
                        if s == S - 1 && prev[S - 3] > best { best = prev[S - 3]; step = 2 }
                        cur[s] = best + em(t, s, g)
                        bk[bt + s] = step
                    }
                }
                }
                swap(&prevA, &curA)
            }
            var s = S - 1
            if prevA[S - 2] > prevA[s] { s = S - 2 }
            if prevA[S - 3] > prevA[s] { s = S - 3 }
            var t = T - 1
            while t >= 0 {
                path[t] = Int32(s)
                if t > 0 { s -= Int(bk[t * S + s]) }
                t -= 1
            }
        }
        }
        }
        return path
    }

    /// Whether some cue's shown words haven't been through the aligner yet.
    static func needsAligning(_ track: SubtitleTrack) -> Bool {
        track.cues.contains { c in
            let shown = shownText(c, track.style.language)
            return c.timedText != shown && !Kt.isBlank(shown)
        }
    }

    static let FRAME_MS = 20.0
    /// How far outside its written times a cue's words may be found.
    static let PAD_MS: Int64 = 800
    /// The model marks a letter a little after it starts; measured on hand-aligned speech.
    static let OFFSET_MS = -35.0
    static let GARBAGE_PENALTY: Float = 1.0

    /// The words shown for a cue in [language] (kinetic captions show English for Both).
    static func shownText(_ c: Cue, _ language: SubtitleLanguage) -> String {
        switch language {
        case .TELUGU: return Kt.isBlank(c.telugu) ? c.english : c.telugu
        default: return Kt.isBlank(c.english) ? c.telugu : c.english
        }
    }

    /// Whether the words shown are the words said (not a translation), as far as the cue says.
    static func spoken(_ c: Cue, _ language: SubtitleLanguage) -> Bool {
        let l = c.language.lowercased()
        if Kt.isBlank(l) { return true }
        switch language {
        case .TELUGU: return l.hasPrefix("te") || Kt.isBlank(c.telugu)
        default: return !l.hasPrefix("te") || Kt.isBlank(c.english)
        }
    }
}

/// Spelling words in the Latin letters the alignment model knows: Telugu by sound, numbers in words.
enum Romanizer {
    private static let vowels: [Unicode.Scalar: String] = [
        "అ": "a", "ఆ": "aa", "ఇ": "i", "ఈ": "ii", "ఉ": "u", "ఊ": "uu", "ఋ": "ra", "ౠ": "rra", "ఌ": "la",
        "ఎ": "e", "ఏ": "ee", "ఐ": "ai", "ఒ": "o", "ఓ": "oo", "ఔ": "au",
    ]
    private static let consonants: [Unicode.Scalar: String] = [
        "క": "k", "ఖ": "kh", "గ": "g", "ఘ": "gh", "ఙ": "ng", "చ": "c", "ఛ": "ch", "జ": "j", "ఝ": "jh", "ఞ": "ny",
        "ట": "tt", "ఠ": "tth", "డ": "dd", "ఢ": "ddh", "ణ": "nn", "త": "t", "థ": "th", "ద": "d", "ధ": "dh", "న": "n",
        "ప": "p", "ఫ": "ph", "బ": "b", "భ": "bh", "మ": "m", "య": "y", "ర": "r", "ఱ": "rr", "ల": "l", "ళ": "ll",
        "ఴ": "lll", "వ": "v", "శ": "sh", "ష": "ss", "స": "s", "హ": "h",
    ]
    private static let signs: [Unicode.Scalar: String] = [
        "\u{0C3E}": "aa", "\u{0C3F}": "i", "\u{0C40}": "ii", "\u{0C41}": "u", "\u{0C42}": "uu", "\u{0C43}": "ra",
        "\u{0C44}": "rra", "\u{0C46}": "e", "\u{0C47}": "ee", "\u{0C48}": "ai", "\u{0C4A}": "o", "\u{0C4B}": "oo",
        "\u{0C4C}": "au",
    ]
    private static let VIRAMA: Unicode.Scalar = "\u{0C4D}"
    private static let ones = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(separator: " ").map(String.init)
    private static let tens = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split(separator: " ").map(String.init)

    private static func number(_ n: Int64) -> String {
        if n < 20 { return ones[Int(n)] }
        if n < 100 { return tens[Int(n / 10)] + (n % 10 == 0 ? "" : ones[Int(n % 10)]) }
        if n < 1000 { return ones[Int(n / 100)] + "hundred" + (n % 100 == 0 ? "" : number(n % 100)) }
        if n < 1_000_000 { return number(n / 1000) + "thousand" + (n % 1000 == 0 ? "" : number(n % 1000)) }
        return digits(String(n))
    }

    private static func digits(_ d: String) -> String {
        d.unicodeScalars.map { ones[Int($0.value) - 48] }.joined()
    }

    static func roman(_ word: String) -> String {
        let s = Array(word.lowercased().unicodeScalars)
        var out = ""
        var i = 0
        while i < s.count {
            let c = s[i]
            if let con = consonants[c] {
                out += con
                let nx: Unicode.Scalar? = i + 1 < s.count ? s[i + 1] : nil
                if let nx, let sign = signs[nx] { out += sign; i += 2; continue }
                if nx == VIRAMA { i += 2; continue }
                out += "a"
                i += 1
                continue
            }
            if let v = vowels[c] {
                out += v
            } else if c == "\u{0C02}" {
                out += "m"
            } else if c == "\u{0C03}" {
                out += "h"
            } else if c.value >= 0x0C66 && c.value <= 0x0C6F {
                out.unicodeScalars.append(Unicode.Scalar(UInt8(48 + c.value - 0x0C66)))
            } else if (c >= "a" && c <= "z") || c == "'" || (c >= "0" && c <= "9") {
                out.unicodeScalars.append(c)
            }
            i += 1
        }
        // Each run of digits as words.
        var r = ""
        var run = ""
        func flushRun() {
            if run.isEmpty { return }
            r += run.count <= 6 ? number(Int64(run)!) : digits(run)
            run = ""
        }
        for c in out.unicodeScalars {
            if c >= "0" && c <= "9" { run.unicodeScalars.append(c) } else { flushRun(); r.unicodeScalars.append(c) }
        }
        flushRun()
        // trim('\'')
        var u = Array(r.unicodeScalars)
        while let f = u.first, f == "'" { u.removeFirst() }
        while let l = u.last, l == "'" { u.removeLast() }
        var res = String.UnicodeScalarView()
        res.append(contentsOf: u)
        return String(res)
    }
}

/// The small acoustic model: 40 log-mel bands every 10 ms in, the log-probability of each of
/// [LABELS] every 20 ms out. Two convolutions, eight depthwise-separable residual blocks with
/// layer norm, and a 1x1 output; weights stored as float16.
final class AlignModel: Sendable {
    struct BlockW: Sendable {
        let dw: [Float], db: [Float], pw: [Float], pb: [Float], g: [Float], b: [Float]
    }

    private let c1w: [Float], c1b: [Float]
    private let c2w: [Float], c2b: [Float]
    private let blocks: [BlockW]
    private let ow: [Float], ob: [Float]

    static let MEL = 40
    static let C = 160
    static let BLOCKS = 8
    static let VOCAB = 28
    /// The letters, index 0 the CTC blank.
    static let LABELS: [Unicode.Scalar] = ["-", "a", "i", "e", "n", "o", "u", "t", "s", "r", "m", "k", "l", "d", "g", "h", "y", "b", "p", "w", "c", "v", "j", "z", "f", "'", "q", "x"]
    static let labelIndex: [Unicode.Scalar: Int] = Dictionary(uniqueKeysWithValues: LABELS.enumerated().map { ($1, $0) })

    enum LoadError: Error { case wrongSize(Int), notFound }

    private init(c1w: [Float], c1b: [Float], c2w: [Float], c2b: [Float], blocks: [BlockW], ow: [Float], ob: [Float]) {
        self.c1w = c1w; self.c1b = c1b; self.c2w = c2w; self.c2b = c2b; self.blocks = blocks; self.ow = ow; self.ob = ob
    }

    /// Reads the weights (float16, little-endian, in the order the exporter writes them).
    static func load(_ data: Data) throws -> AlignModel {
        let C = AlignModel.C, MEL = AlignModel.MEL, VOCAB = AlignModel.VOCAB
        let need = 2 * (C * MEL * 5 + C + C * C * 3 + C + BLOCKS * (C * 9 + C + C * C + C + C + C) + VOCAB * C + VOCAB)
        if data.count < need { throw LoadError.wrongSize(data.count) }
        return data.withUnsafeBytes { (raw: UnsafeRawBufferPointer) -> AlignModel in
            var pos = 0
            func take(_ n: Int) -> [Float] {
                let out = [Float](unsafeUninitializedCapacity: n) { buf, count in
                    for k in 0..<n {
                        let lo = UInt16(raw[pos + 2 * k]), hi = UInt16(raw[pos + 2 * k + 1])
                        buf[k] = half(lo | hi << 8)
                    }
                    count = n
                }
                pos += 2 * n
                return out
            }
            let c1w = take(C * MEL * 5), c1b = take(C)
            let c2w = take(C * C * 3), c2b = take(C)
            var blocks: [BlockW] = []
            for _ in 0..<BLOCKS { blocks.append(BlockW(dw: take(C * 9), db: take(C), pw: take(C * C), pb: take(C), g: take(C), b: take(C))) }
            let ow = take(VOCAB * C), ob = take(VOCAB)
            return AlignModel(c1w: c1w, c1b: c1b, c2w: c2w, c2b: c2b, blocks: blocks, ow: ow, ob: ob)
        }
    }

    static func load(contentsOf url: URL) throws -> AlignModel { try load(Data(contentsOf: url)) }

    /// The model shipped in the app (align/model.bin).
    static func bundled(_ bundle: Bundle = .main) throws -> AlignModel {
        guard let url = bundle.url(forResource: "model", withExtension: "bin", subdirectory: "align")
            ?? bundle.url(forResource: "model", withExtension: "bin") else { throw LoadError.notFound }
        return try load(contentsOf: url)
    }

    private static func half(_ h: UInt16) -> Float {
        let bits = UInt32(h)
        let sign = bits & 0x8000
        let exp = (bits >> 10) & 0x1F
        let mant = bits & 0x3FF
        let f: UInt32
        switch exp {
        case 0:
            if mant == 0 { f = 0 } else {
                // subnormal
                var e: Int32 = -1
                var mm = mant
                while mm & 0x400 == 0 { mm <<= 1; e -= 1 }
                f = UInt32(bitPattern: (e + 127 - 14) << 23) | ((mm & 0x3FF) << 13)
            }
        case 0x1F: f = 0x7F80_0000 | (mant << 13)
        default: f = ((exp + 112) << 23) | (mant << 13)
        }
        return Float(bitPattern: (sign << 16) | f)
    }

    /// Letter log-probabilities for [pcm] (16 kHz mono, -1..1): one row per 20 ms frame.
    func logProbs(_ pcm: [Float]) -> LetterLogProbs {
        let mel = Features.logMel(pcm)
        let t10 = mel.frames
        if t10 == 0 { return LetterLogProbs(frames: 0, values: []) }
        let V = AlignModel.VOCAB
        let t20 = (t10 - 1) / 2 + 1
        var out = [Float](repeating: 0, count: t20 * V)
        // In pieces with a margin of context either side, so long clips need little memory.
        let piece = 3000
        let margin = 120
        var s20 = 0
        while s20 < t20 {
            let e20 = min(t20, s20 + piece)
            let a20 = max(0, s20 - margin)
            let b20 = min(t20, e20 + margin)
            let (part, m) = forward(mel, a20 * 2, min(t10, b20 * 2))
            for t in s20..<e20 {
                let k = t - a20
                for v in 0..<V { out[t * V + v] = part[v * m + k] }
            }
            s20 = e20
        }
        return LetterLogProbs(frames: t20, values: out)
    }

    /// The network on mel frames [from]..[to) (from even); output [VOCAB][frames] (and frames).
    private func forward(_ mel: Features.Mel, _ from: Int, _ to: Int) -> ([Float], Int) {
        let C = AlignModel.C, MEL = AlignModel.MEL, VOCAB = AlignModel.VOCAB
        let n = to - from
        let T10 = mel.frames
        // conv1: 40 -> C, k5, pad 2, relu
        var h1 = [Float](repeating: 0, count: C * n)
        mel.values.withUnsafeBufferPointer { x0 in
        c1w.withUnsafeBufferPointer { w1 in
        h1.withUnsafeMutableBufferPointer { h in
            for o in 0..<C {
                let row = h.baseAddress! + o * n
                row.update(repeating: c1b[o], count: n)
                for i in 0..<MEL {
                    let xi = x0.baseAddress! + i * T10 + from
                    let base = (o * MEL + i) * 5
                    for k in 0..<5 {
                        let w = w1[base + k]
                        let off = k - 2
                        let lo = max(0, -off)
                        let hi = min(n, n - off)
                        if lo < hi { for t in lo..<hi { row[t] += w * xi[t + off] } }
                    }
                }
                for t in 0..<n where row[t] < 0 { row[t] = 0 }
            }
        }
        }
        }
        // conv2: C -> C, k3, stride 2, pad 1, relu. The input is split into even and odd frames
        // first so the inner loop runs straight through memory (same sums, same order).
        let m = (n - 1) / 2 + 1
        let mOdd = n / 2
        var even = [Float](repeating: 0, count: C * m)
        var odd = [Float](repeating: 0, count: C * max(mOdd, 1))
        for i in 0..<C {
            for t in 0..<m { even[i * m + t] = h1[i * n + 2 * t] }
            for t in 0..<mOdd { odd[i * mOdd + t] = h1[i * n + 2 * t + 1] }
        }
        var x = [Float](repeating: 0, count: C * m)
        even.withUnsafeBufferPointer { ev in
        odd.withUnsafeBufferPointer { od in
        c2w.withUnsafeBufferPointer { w2 in
        x.withUnsafeMutableBufferPointer { xb in
            for o in 0..<C {
                let row = xb.baseAddress! + o * m
                row.update(repeating: c2b[o], count: m)
                for i in 0..<C {
                    let e = ev.baseAddress! + i * m
                    let d = od.baseAddress! + i * mOdd
                    let base = (o * C + i) * 3
                    let w0 = w2[base], w1 = w2[base + 1], w2v = w2[base + 2]
                    // t = 0: no frame before; frame 1 is odd[0] when it exists.
                    var acc = w1 * e[0]
                    if 1 < n { acc += w2v * d[0] }
                    row[0] += acc
                    // Middle frames have both neighbours.
                    let full = mOdd   // frames t with 2t + 1 < n
                    if full > 1 {
                        for t in 1..<full {
                            var a = w1 * e[t]
                            a += w0 * d[t - 1]
                            a += w2v * d[t]
                            row[t] += a
                        }
                    }
                    // The last frame may lack a next one.
                    if m > full && m > 1 {
                        let t = m - 1
                        var a = w1 * e[t]
                        a += w0 * d[t - 1]
                        row[t] += a
                    }
                }
                for t in 0..<m where row[t] < 0 { row[t] = 0 }
            }
        }
        }
        }
        }
        var hN = [Float](repeating: 0, count: C * m)
        var hD = [Float](repeating: 0, count: C * m)
        var nx = [Float](repeating: 0, count: C * m)
        var mean = [Float](repeating: 0, count: m)
        var vsum = [Float](repeating: 0, count: m)
        for bw in blocks {
            x.withUnsafeBufferPointer { xb in
            hN.withUnsafeMutableBufferPointer { hn in
            hD.withUnsafeMutableBufferPointer { hd in
            nx.withUnsafeMutableBufferPointer { nb in
            mean.withUnsafeMutableBufferPointer { mn in
            vsum.withUnsafeMutableBufferPointer { vs in
            bw.dw.withUnsafeBufferPointer { dw in
            bw.pw.withUnsafeBufferPointer { pw in
                let X = xb.baseAddress!, HN = hn.baseAddress!, HD = hd.baseAddress!, NX = nb.baseAddress!
                let MN = mn.baseAddress!, VS = vs.baseAddress!
                // layer norm over channels, per frame (summed channel by channel, as Kotlin does)
                MN.update(repeating: 0, count: m)
                for c in 0..<C { let r = X + c * m; for t in 0..<m { MN[t] += r[t] } }
                for t in 0..<m { MN[t] /= Float(C) }
                VS.update(repeating: 0, count: m)
                for c in 0..<C { let r = X + c * m; for t in 0..<m { let d = r[t] - MN[t]; VS[t] += d * d } }
                for t in 0..<m { VS[t] = 1 / (VS[t] / Float(C) + 1e-5).squareRoot() }
                for c in 0..<C {
                    let r = X + c * m, dst = HN + c * m
                    let g = bw.g[c], b = bw.b[c]
                    for t in 0..<m { dst[t] = (r[t] - MN[t]) * VS[t] * g + b }
                }
                // depthwise k9
                for c in 0..<C {
                    let src = HN + c * m, dst = HD + c * m
                    dst.update(repeating: bw.db[c], count: m)
                    for k in 0..<9 {
                        let w = dw[c * 9 + k]
                        let off = k - 4
                        let lo = max(0, -off)
                        let hi = min(m, m - off)
                        if lo < hi { for t in lo..<hi { dst[t] += w * src[t + off] } }
                    }
                }
                // pointwise, relu, residual (four output channels at a time, each summed in
                // channel order as Kotlin does; a zero weight adds nothing either way)
                var o = 0
                while o < C {
                    let r0 = NX + o * m, r1 = r0 + m, r2 = r1 + m, r3 = r2 + m
                    r0.update(repeating: bw.pb[o], count: m)
                    r1.update(repeating: bw.pb[o + 1], count: m)
                    r2.update(repeating: bw.pb[o + 2], count: m)
                    r3.update(repeating: bw.pb[o + 3], count: m)
                    for i in 0..<C {
                        let w0 = pw[o * C + i], w1 = pw[(o + 1) * C + i], w2 = pw[(o + 2) * C + i], w3 = pw[(o + 3) * C + i]
                        let src = HD + i * m
                        for t in 0..<m {
                            let s = src[t]
                            r0[t] += w0 * s; r1[t] += w1 * s; r2[t] += w2 * s; r3[t] += w3 * s
                        }
                    }
                    for j in 0..<4 {
                        let row = NX + (o + j) * m, res = X + (o + j) * m
                        for t in 0..<m { row[t] = (row[t] > 0 ? row[t] : 0) + res[t] }
                    }
                    o += 4
                }
            }
            }
            }
            }
            }
            }
            }
            }
            swap(&x, &nx)
        }
        // output 1x1 and log-softmax over letters
        var out = [Float](repeating: 0, count: VOCAB * m)
        x.withUnsafeBufferPointer { xb in
        ow.withUnsafeBufferPointer { wo in
        out.withUnsafeMutableBufferPointer { ob2 in
            let O = ob2.baseAddress!
            for o in 0..<VOCAB {
                let row = O + o * m
                row.update(repeating: ob[o], count: m)
                for i in 0..<C {
                    let w = wo[o * C + i]
                    let src = xb.baseAddress! + i * m
                    for t in 0..<m { row[t] += w * src[t] }
                }
            }
            for t in 0..<m {
                var mx = O[t]
                for v in 1..<VOCAB where O[v * m + t] > mx { mx = O[v * m + t] }
                var sum = 0.0
                for v in 0..<VOCAB { sum += exp(Double(O[v * m + t] - mx)) }
                let lse = mx + Float(log(sum))
                for v in 0..<VOCAB { O[v * m + t] -= lse }
            }
        }
        }
        }
        return (out, m)
    }
}

/// 40-band log-mel features every 10 ms, as the alignment model was trained on.
enum Features {
    static let SR = 16000
    static let NFFT = 512
    static let HOP = 160
    private static let MELS = 40

    /// [MELS] rows of [frames] values each (band-major: band m, frame t at m * frames + t).
    struct Mel {
        let frames: Int
        var values: [Float]
    }

    private static let window: [Float] = (0..<NFFT).map { Float(0.5 - 0.5 * cos(2 * Double.pi * Double($0) / Double(NFFT))) }

    /// The filter bank, and for each band the bins where it isn't zero.
    private static let fb: (weights: [[Float]], lo: [Int], hi: [Int]) = {
        func hz2m(_ f: Double) -> Double { 2595 * log10(1 + f / 700) }
        func m2hz(_ m: Double) -> Double { 700 * (pow(10.0, m / 2595) - 1) }
        let lo = hz2m(60), hi = hz2m(7600)
        let pts = (0..<(MELS + 2)).map { m2hz(lo + (hi - lo) * Double($0) / Double(MELS + 1)) }
        var weights: [[Float]] = []
        var los: [Int] = []
        var his: [Int] = []
        for i in 0..<MELS {
            let row: [Float] = (0...(NFFT / 2)).map { k in
                let f = Double(k) * Double(SR) / Double(NFFT)
                return Float(max(0.0, min((f - pts[i]) / (pts[i + 1] - pts[i]), (pts[i + 2] - f) / (pts[i + 2] - pts[i + 1]))))
            }
            weights.append(row)
            let nz = row.indices.filter { row[$0] != 0 }
            los.append(nz.first ?? 0)
            his.append((nz.last ?? -1) + 1)
        }
        return (weights, los, his)
    }()

    /// Frame m covers samples 160m .. 160m+512 (zeros past the end).
    static func logMel(_ pcm: [Float]) -> Mel {
        let T = pcm.count / HOP
        var out = [Float](repeating: 0, count: MELS * T)
        var re = [Double](repeating: 0, count: NFFT)
        var im = [Double](repeating: 0, count: NFFT)
        var power = [Double](repeating: 0, count: NFFT / 2 + 1)
        let bands = fb
        pcm.withUnsafeBufferPointer { x in
        window.withUnsafeBufferPointer { win in
        re.withUnsafeMutableBufferPointer { rp in
        im.withUnsafeMutableBufferPointer { ip in
        power.withUnsafeMutableBufferPointer { pw in
            for t in 0..<T {
                let s = t * HOP
                for i in 0..<NFFT {
                    let j = s + i
                    rp[i] = j < x.count ? Double(x[j] * win[i]) : 0
                    ip[i] = 0
                }
                Fft.transform(rp.baseAddress!, ip.baseAddress!, NFFT)
                for k in 0...(NFFT / 2) { pw[k] = rp[k] * rp[k] + ip[k] * ip[k] }
                for m in 0..<MELS {
                    let w = bands.weights[m]
                    var acc = 0.0
                    if bands.lo[m] < bands.hi[m] {
                        for k in bands.lo[m]..<bands.hi[m] where w[k] != 0 { acc += Double(w[k]) * pw[k] }
                    }
                    out[m * T + t] = Float(log(acc + 1e-6))
                }
            }
        }
        }
        }
        }
        }
        // Each band less its mean over the clip.
        for m in 0..<MELS {
            var mean = 0.0
            for t in 0..<T { mean += Double(out[m * T + t]) }
            mean /= Double(max(1, T))
            for t in 0..<T { out[m * T + t] = Float(Double(out[m * T + t]) - mean) }
        }
        return Mel(frames: T, values: out)
    }
}

/// In-place radix-2 complex FFT.
enum Fft {
    static func transform(_ re: inout [Double], _ im: inout [Double]) {
        let n = re.count
        re.withUnsafeMutableBufferPointer { r in
            im.withUnsafeMutableBufferPointer { i in transform(r.baseAddress!, i.baseAddress!, n) }
        }
    }

    static func transform(_ re: UnsafeMutablePointer<Double>, _ im: UnsafeMutablePointer<Double>, _ n: Int) {
        var j = 0
        for i in 1..<n {
            var bit = n >> 1
            while j & bit != 0 { j ^= bit; bit >>= 1 }
            j ^= bit
            if i < j {
                var t = re[i]; re[i] = re[j]; re[j] = t
                t = im[i]; im[i] = im[j]; im[j] = t
            }
        }
        var len = 2
        while len <= n {
            let ang = -2 * Double.pi / Double(len)
            let wr = cos(ang), wi = sin(ang)
            let half = len / 2
            var i = 0
            while i < n {
                var cr = 1.0, ci = 0.0
                for k in 0..<half {
                    let ar = re[i + k + half] * cr - im[i + k + half] * ci
                    let ai = re[i + k + half] * ci + im[i + k + half] * cr
                    re[i + k + half] = re[i + k] - ar; im[i + k + half] = im[i + k] - ai
                    re[i + k] += ar; im[i + k] += ai
                    let nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr
                }
                i += len
            }
            len <<= 1
        }
    }
}

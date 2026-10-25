import Foundation

/// Streaming rational-ratio polyphase resampler with a Kaiser-windowed sinc kernel (16 zero
/// crossings each side, beta 8.6, cutoff 0.92 x the lower Nyquist frequency).
///
/// Output sample k sits exactly at input time k * inRate / outRate (zero-phase kernel, no
/// fractional delay), so an up-and-back-down round trip lines up sample-exactly with the input.
/// Output k needs input up to index `needInput(k)`; it is produced as soon as that sample has
/// been pushed, independently of how the input is chunked. Samples before index 0 count as 0.
///
/// Per-phase coefficients are tabulated when the reduced interpolation factor is <= 1024 (all
/// common rates: 8/11.025/16/22.05/24/32/44.1/88.2/96 kHz); otherwise a 1024-phase table is
/// interpolated linearly. Each tabulated phase is normalised to unity DC gain.
///
/// Not thread-safe; `process` allocates nothing.
final class StreamResampler {
    let inRate: Int
    let outRate: Int
    /// Reduced ratio outRate/inRate = up/down.
    let up: Int
    let down: Int
    /// Half kernel width in input samples; output k reads inputs n0-half+1 .. n0+half.
    let half: Int
    private let taps: Int
    private let phases: Int
    private let exact: Bool
    private let table: UnsafeMutablePointer<Float>
    private let hist: UnsafeMutablePointer<Float>
    private let histSize: Int
    private let mask: Int
    private var inCount = 0
    private var outCount = 0

    private static let zeroCrossings = 16.0
    private static let beta = 8.6
    private static let cutoffFactor = 0.92
    private static let maxPhases = 1024

    init(inRate: Int, outRate: Int) {
        precondition(inRate > 0 && outRate > 0)
        self.inRate = inRate
        self.outRate = outRate
        let g = StreamResampler.gcd(inRate, outRate)
        up = outRate / g
        down = inRate / g
        half = StreamResampler.halfWidth(inRate, outRate)
        taps = 2 * half
        exact = up <= StreamResampler.maxPhases
        phases = exact ? up : StreamResampler.maxPhases
        let rows = exact ? phases : phases + 1
        let cutoff = StreamResampler.cutoffFactor * min(1.0, Double(outRate) / Double(inRate))
        table = .allocate(capacity: rows * taps)
        let i0b = StreamResampler.besselI0(StreamResampler.beta)
        var tmp = [Double](repeating: 0, count: taps)
        for p in 0..<rows {
            let frac = Double(p) / Double(phases)
            var sum = 0.0
            for i in 0..<taps {
                let tau = frac + Double(half) - 1 - Double(i)
                let x = tau / Double(half)
                let w = (x <= -1.0 || x >= 1.0) ? 0.0
                    : StreamResampler.besselI0(StreamResampler.beta * (1.0 - x * x).squareRoot()) / i0b
                let arg = Double.pi * cutoff * tau
                let s = tau == 0.0 ? 1.0 : sin(arg) / arg
                tmp[i] = cutoff * s * w
                sum += tmp[i]
            }
            for i in 0..<taps { table[p * taps + i] = Float(tmp[i] / sum) }
        }
        var size = 1
        while size < taps + 2 { size <<= 1 }
        histSize = size
        hist = .allocate(capacity: size)
        hist.initialize(repeating: 0, count: size)
        mask = size - 1
    }

    deinit {
        table.deallocate()
        hist.deallocate()
    }

    /// Index of the last input sample output `k` depends on.
    func needInput(_ k: Int) -> Int { StreamResampler.needInput(k, up, down, half) }

    /// Upper bound on outputs produced from `n` more inputs.
    func maxOutput(_ n: Int) -> Int { n * up / down + 2 }

    func reset() {
        hist.update(repeating: 0, count: histSize)
        inCount = 0
        outCount = 0
    }

    /// Pushes `n` samples and writes every output that became available to `out`; returns the count.
    func process(_ x: UnsafePointer<Float>, _ n: Int, _ out: UnsafeMutablePointer<Float>) -> Int {
        var produced = 0
        let hist = self.hist, table = self.table, mask = self.mask, taps = self.taps
        let up = self.up, down = self.down, half = self.half
        for s in 0..<n {
            hist[inCount & mask] = x[s]
            inCount += 1
            while true {
                let num = outCount * down
                let n0 = num / up
                if n0 + half >= inCount { break }
                let p = num - n0 * up
                let base = n0 - half + 1
                var acc: Float = 0
                if exact {
                    let row = table + p * taps
                    for i in 0..<taps { acc += row[i] * hist[(base + i) & mask] }
                } else {
                    let pos = Double(p) / Double(up) * Double(phases)
                    let q = Int(pos.rounded(.down))
                    let mu = Float(pos - Double(q))
                    let r0 = table + q * taps
                    let r1 = r0 + taps
                    for i in 0..<taps {
                        let c = r0[i] + mu * (r1[i] - r0[i])
                        acc += c * hist[(base + i) & mask]
                    }
                }
                out[produced] = acc
                produced += 1
                outCount += 1
            }
        }
        return produced
    }

    static func halfWidth(_ inRate: Int, _ outRate: Int) -> Int {
        Int((zeroCrossings / (cutoffFactor * min(1.0, Double(outRate) / Double(inRate)))).rounded(.up))
    }

    static func needInput(_ k: Int, _ up: Int, _ down: Int, _ half: Int) -> Int { (k * down) / up + half }

    static func gcd(_ a: Int, _ b: Int) -> Int {
        var x = a
        var y = b
        while y != 0 { let t = x % y; x = y; y = t }
        return x
    }

    private static func besselI0(_ x: Double) -> Double {
        var sum = 1.0
        var term = 1.0
        let q = x * x / 4
        var k = 1
        while term > 1e-12 * sum {
            term *= q / (Double(k) * Double(k))
            sum += term
            k += 1
        }
        return sum
    }
}

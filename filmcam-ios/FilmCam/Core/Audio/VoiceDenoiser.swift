import Foundation

/// Streaming voice denoiser for interleaved PCM (16-bit integers or floats), built on `RnNoise`.
///
/// Each channel runs its own RnNoise state at 48 kHz; other sample rates are resampled to
/// 48 kHz and back (`StreamResampler`, zero-phase, so the round trip is sample-aligned). The
/// denoised signal is blended with the dry input, delayed to line up exactly:
///
///     out = w * denoised + (1 - w) * dry
///     w   = wetPause + (wetSpeech - wetPause) * clamp(1.4 * vadSmoothed, 0, 1)
///     wetPause = 0.85 + 0.15 * min(1, 2s),  wetSpeech = 0.35 + 0.5s   (s = strength)
///
/// vadSmoothed is the per-frame RnNoise VAD probability averaged over +-5 frames (+-50 ms,
/// symmetric, so it looks 50 ms ahead), then linearly interpolated between frame centres so w
/// changes smoothly sample by sample. strength <= 0 is a bypass: pure dry, same latency.
///
/// Output has the same length as the input and lags it by exactly `latencyFrames` sample frames
/// (the first `latencyFrames` output frames are silence); `flush` returns the remaining tail.
/// Results do not depend on how the input is chunked. Int16 and Float calls can be mixed: both
/// run on the 16-bit scale inside (a float sample of 1.0 is 32768). Not thread-safe: use one
/// instance per stream from one thread at a time. After construction nothing is allocated
/// except the arrays returned by the array overloads.
final class VoiceDenoiser {
    /// Thrown for a sample rate or channel count the denoiser doesn't take.
    struct ConfigError: Error, CustomStringConvertible {
        let description: String
    }

    let sampleRate: Int
    let channels: Int
    let strength: Float

    /// Output delay in sample frames at `sampleRate`.
    let latencyFrames: Int

    private let chans: [Channel]
    private var phase = 0 // index of the channel the next interleaved input sample belongs to

    fileprivate static let frame = RnNoise.frameSize
    fileprivate static let block = 480
    fileprivate static let vadHalf = 5 // +-5 frames = +-50 ms
    fileprivate static let vadRing = 128
    fileprivate static let vadMask = vadRing - 1

    init(model: RnNoiseModel, sampleRate: Int, channels: Int, strength: Float = 0.6) throws {
        guard (8000...192000).contains(sampleRate) else { throw ConfigError(description: "unsupported sample rate \(sampleRate)") }
        guard (1...8).contains(channels) else { throw ConfigError(description: "unsupported channel count \(channels)") }
        self.sampleRate = sampleRate
        self.channels = channels
        self.strength = strength
        let bypass = strength <= 0
        let s = VoiceDenoiser.clamp01(strength)
        let wetPause: Float = 0.85 + 0.15 * min(1, s * 2)
        let wetSpeech: Float = 0.35 + 0.5 * s
        let native = sampleRate == RnNoise.sampleRate
        let latency = VoiceDenoiser.computeLatency(sampleRate: sampleRate)
        latencyFrames = latency
        var cs: [Channel] = []
        for _ in 0..<channels {
            cs.append(Channel(model: model, sampleRate: sampleRate, latencyFrames: latency, bypass: bypass,
                              native: native, wetPause: wetPause, wetSpeech: wetSpeech))
        }
        chans = cs
    }

    // ------------------------------------------------------------------ 16-bit PCM

    /// Processes `count` interleaved samples (any length, frames may straddle calls) into `out`
    /// (`count` samples). `out` may be the same buffer as `pcm` (in-place).
    func process(_ pcm: UnsafePointer<Int16>, count: Int, into out: UnsafeMutablePointer<Int16>) {
        run(pcm, count, out)
    }

    /// Array convenience: returns the `pcm.count` output samples.
    func process(_ pcm: [Int16]) -> [Int16] {
        var out = [Int16](repeating: 0, count: pcm.count)
        pcm.withUnsafeBufferPointer { src in
            out.withUnsafeMutableBufferPointer { dst in
                if let s = src.baseAddress, let d = dst.baseAddress { run(s, pcm.count, d) }
            }
        }
        return out
    }

    /// Drains the delayed tail: returns latencyFrames * channels samples (the output for
    /// latencyFrames frames of silence after the real input) and resets the denoiser.
    func flush() -> [Int16] {
        precondition(phase == 0, "flush() called mid-frame")
        let out = process([Int16](repeating: 0, count: latencyFrames * channels))
        reset()
        return out
    }

    // ------------------------------------------------------------------ float PCM (-1...1)

    /// Float variant for -1...1 samples (AVAudioEngine's format): same processing, output not
    /// rounded or clipped. `out` may be the same buffer as `samples` (in-place).
    func process(_ samples: UnsafePointer<Float>, count: Int, into out: UnsafeMutablePointer<Float>) {
        run(samples, count, out)
    }

    /// Array convenience for -1...1 float samples.
    func process(_ samples: [Float]) -> [Float] {
        var out = [Float](repeating: 0, count: samples.count)
        samples.withUnsafeBufferPointer { src in
            out.withUnsafeMutableBufferPointer { dst in
                if let s = src.baseAddress, let d = dst.baseAddress { run(s, samples.count, d) }
            }
        }
        return out
    }

    /// `flush()` for the float API: the tail as -1...1 floats, then resets.
    func flushFloat() -> [Float] {
        precondition(phase == 0, "flush() called mid-frame")
        let out = process([Float](repeating: 0, count: latencyFrames * channels))
        reset()
        return out
    }

    /// Back to the initial state (empty delay line, fresh RnNoise states).
    func reset() {
        for ch in chans { ch.reset() }
        phase = 0
    }

    private func run<T: DenoiserSample>(_ src: UnsafePointer<T>, _ length: Int, _ dst: UnsafeMutablePointer<T>) {
        precondition(length >= 0)
        for c in 0..<channels {
            // First sample of channel c in this chunk.
            let first = (c - phase + channels) % channels
            if first >= length { continue }
            let count = (length - first + channels - 1) / channels
            chans[c].process(src + first, channels, count, dst + first)
        }
        phase = (phase + length) % channels
    }

    // ------------------------------------------------------------------ latency

    /// Smallest delay L such that output frame j (emitted when input frame j+L arrives) has
    /// everything it needs: the denoised sample and the smoothed VAD around it. The dependency
    /// pattern repeats every second, so scanning one second gives the exact maximum.
    private static func computeLatency(sampleRate: Int) -> Int {
        let rn = RnNoise.sampleRate
        if sampleRate == rn { return maxLookahead(sampleRate: rn, period: rn, upP: nil, downP: nil) }
        let upHalf = StreamResampler.halfWidth(sampleRate, rn)
        let downHalf = StreamResampler.halfWidth(rn, sampleRate)
        let gU = StreamResampler.gcd(sampleRate, rn)
        let upP = (rn / gU, sampleRate / gU, upHalf)
        let downP = (sampleRate / gU, rn / gU, downHalf)
        return maxLookahead(sampleRate: sampleRate, period: sampleRate, upP: upP, downP: downP)
    }

    private static func maxLookahead(sampleRate: Int, period: Int, upP: (Int, Int, Int)?, downP: (Int, Int, Int)?) -> Int {
        var worst = 0
        for j in 0..<period {
            // 48 kHz denoised samples the down-resampler reads for output j.
            let lastD = downP.map { StreamResampler.needInput(j, $0.0, $0.1, $0.2) } ?? j
            // d[k] = RnNoise output k + 480, inside frame k/480 + 1.
            var needU = frame * (lastD / frame + 2) - 1
            // The weight needs smoothed VAD of frames f and f+1, i.e. raw VAD up to f+1+K.
            let f = j * 100 / sampleRate
            needU = max(needU, frame * (f + 2 + vadHalf) - 1)
            let needX = upP.map { StreamResampler.needInput(needU, $0.0, $0.1, $0.2) } ?? needU
            worst = max(worst, needX - j)
        }
        return worst
    }

    /// Kotlin's coerceIn(0f, 1f): NaN passes through.
    @inline(__always)
    fileprivate static func clamp01(_ v: Float) -> Float { v < 0 ? 0 : (v > 1 ? 1 : v) }

    // ------------------------------------------------------------------ per channel

    private final class Channel {
        private let rn: RnNoise
        private let upRs: StreamResampler?
        private let downRs: StreamResampler?
        private let sampleRate: Int
        private let latencyFrames: Int
        private let bypass: Bool
        private let wetPause: Float
        private let wetSpeech: Float

        private let ringSize: Int
        private let ringMask: Int
        private let dry: UnsafeMutablePointer<Float>
        private let den: UnsafeMutablePointer<Float>
        private var inCount = 0 // input samples received
        private var denCount = 0 // denoised samples (input rate) produced

        private let block: UnsafeMutablePointer<Float>
        private let upBuf: UnsafeMutablePointer<Float>
        private let downBuf: UnsafeMutablePointer<Float>
        private let frameBuf: UnsafeMutablePointer<Float>
        private let rnOut: UnsafeMutablePointer<Float>
        private var frameFill = 0
        private var frames = 0 // RnNoise frames processed
        private let vad: UnsafeMutablePointer<Float>
        private let vadSmooth: UnsafeMutablePointer<Float>

        init(model: RnNoiseModel, sampleRate: Int, latencyFrames: Int, bypass: Bool, native: Bool,
             wetPause: Float, wetSpeech: Float) {
            typealias V = VoiceDenoiser
            rn = RnNoise(model: model)
            upRs = native || bypass ? nil : StreamResampler(inRate: sampleRate, outRate: RnNoise.sampleRate)
            downRs = native || bypass ? nil : StreamResampler(inRate: RnNoise.sampleRate, outRate: sampleRate)
            self.sampleRate = sampleRate
            self.latencyFrames = latencyFrames
            self.bypass = bypass
            self.wetPause = wetPause
            self.wetSpeech = wetSpeech
            var size = 1
            while size < latencyFrames + V.block + 64 { size <<= 1 }
            ringSize = size
            ringMask = size - 1
            func buffer(_ n: Int) -> UnsafeMutablePointer<Float> {
                let p = UnsafeMutablePointer<Float>.allocate(capacity: max(n, 1))
                p.initialize(repeating: 0, count: max(n, 1))
                return p
            }
            dry = buffer(size)
            den = buffer(size)
            block = buffer(V.block)
            upBuf = buffer(upRs?.maxOutput(V.block) ?? 0)
            downBuf = buffer(downRs?.maxOutput(V.frame) ?? 0)
            frameBuf = buffer(V.frame)
            rnOut = buffer(V.frame)
            vad = buffer(V.vadRing)
            vadSmooth = buffer(V.vadRing)
        }

        deinit {
            for p in [dry, den, block, upBuf, downBuf, frameBuf, rnOut, vad, vadSmooth] { p.deallocate() }
        }

        func reset() {
            rn.reset(); upRs?.reset(); downRs?.reset()
            dry.update(repeating: 0, count: ringSize)
            den.update(repeating: 0, count: ringSize)
            vad.update(repeating: 0, count: VoiceDenoiser.vadRing)
            vadSmooth.update(repeating: 0, count: VoiceDenoiser.vadRing)
            inCount = 0; denCount = 0; frameFill = 0; frames = 0
        }

        func process<T: DenoiserSample>(_ src: UnsafePointer<T>, _ stride: Int, _ count: Int, _ dst: UnsafeMutablePointer<T>) {
            var done = 0
            while done < count {
                let nb = min(VoiceDenoiser.block, count - done)
                for i in 0..<nb {
                    let v = src[(done + i) * stride].scaled
                    block[i] = v
                    dry[(inCount + i) & ringMask] = v
                }
                if !bypass {
                    if let upRs {
                        let nu = upRs.process(block, nb, upBuf)
                        feed48(upBuf, nu)
                    } else {
                        feed48(block, nb)
                    }
                }
                for i in 0..<nb {
                    let o = inCount + i - latencyFrames
                    let y: Float = o < 0 ? 0 : output(o)
                    dst[(done + i) * stride] = T(scaled: y)
                }
                inCount += nb
                done += nb
            }
        }

        private func feed48(_ x: UnsafePointer<Float>, _ n: Int) {
            let frame = VoiceDenoiser.frame
            var i = 0
            while i < n {
                let take = min(frame - frameFill, n - i)
                (frameBuf + frameFill).update(from: x + i, count: take)
                frameFill += take
                i += take
                if frameFill == frame {
                    frameFill = 0
                    runFrame()
                }
            }
        }

        private func runFrame() {
            typealias V = VoiceDenoiser
            let g = frames
            let p = rn.process(frameBuf, rnOut)
            vad[g & V.vadMask] = p
            frames += 1
            // Smoothed VAD of frame g-K = mean of raw VAD g-2K .. g (frames < 0 count as 0).
            let c = g - V.vadHalf
            if c >= 0 {
                var sum: Float = 0
                for d in -V.vadHalf...V.vadHalf {
                    let idx = c + d
                    if idx >= 0 { sum += vad[idx & V.vadMask] }
                }
                vadSmooth[c & V.vadMask] = sum / Float(2 * V.vadHalf + 1)
            }
            // The first output frame is the overlap tail before time 0: drop it.
            if g == 0 { return }
            if let downRs {
                let nd = downRs.process(rnOut, V.frame, downBuf)
                pushDen(downBuf, nd)
            } else {
                pushDen(rnOut, V.frame)
            }
        }

        private func pushDen(_ x: UnsafePointer<Float>, _ n: Int) {
            for i in 0..<n { den[(denCount + i) & ringMask] = x[i] }
            denCount += n
        }

        @inline(__always)
        private func output(_ o: Int) -> Float {
            typealias V = VoiceDenoiser
            let d = dry[o & ringMask]
            if bypass { return d }
            precondition(denCount > o && inCount - o < ringSize, "VoiceDenoiser latency underestimated")
            let wet = den[o & ringMask]
            // Position of o on the 48 kHz frame grid: frame f plus fraction a.
            let t100 = o * 100
            let f = t100 / sampleRate
            let a = Float(t100 - f * sampleRate) / Float(sampleRate)
            precondition(frames >= f + 2 + V.vadHalf && frames - f < V.vadRing - 2 * V.vadHalf - 2,
                         "VoiceDenoiser VAD look-ahead underestimated")
            let v0 = vadSmooth[f & V.vadMask]
            let v1 = vadSmooth[(f + 1) & V.vadMask]
            let v = v0 + a * (v1 - v0)
            let k = V.clamp01(1.4 * v)
            let w = wetPause + (wetSpeech - wetPause) * k
            return w * wet + (1 - w) * d
        }
    }
}

/// A PCM sample type the denoiser reads and writes, converted to and from the 16-bit scale.
fileprivate protocol DenoiserSample {
    var scaled: Float { get }
    init(scaled: Float)
}

extension Int16: DenoiserSample {
    @inline(__always)
    fileprivate var scaled: Float { Float(self) }

    /// Kotlin's roundToInt() (nearest, ties toward +infinity) clamped to 16 bits.
    @inline(__always)
    fileprivate init(scaled v: Float) {
        if v != v { self = 0; return }
        let fl = v.rounded(.down)
        let r = v - fl >= 0.5 ? fl + 1 : fl
        self = r > 32767 ? 32767 : (r < -32768 ? -32768 : Int16(r))
    }
}

extension Float: DenoiserSample {
    @inline(__always)
    fileprivate var scaled: Float { self * 32768 }

    @inline(__always)
    fileprivate init(scaled v: Float) { self = v / 32768 }
}

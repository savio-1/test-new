/* Pure-Swift port of RNNoise v0.1.1 (denoise.c, pitch.c, celt_lpc.c, rnn.c), via the app's
 * Kotlin port. Copyright (c) 2017 Mozilla, 2018 Gregor Richards, 2007-2017 Jean-Marc Valin,
 * 2005-2017 Xiph.Org Foundation, 2007-2008 CSIRO, 2008-2011 Octasic Inc.
 * BSD-3-Clause, see rnnoise/COPYING. */
import Foundation

/// One RNNoise denoiser state: a faithful port of rnnoise_process_frame() for 48 kHz mono audio
/// in 480-sample (10 ms) frames, on the 16-bit sample scale (floats in -32768..32767).
///
/// The arithmetic mirrors the float C build operation for operation, including the places where
/// C promotes to double (sqrt/log10 and double constants), so the output matches the reference
/// implementation to float rounding. Like the C code, the output is delayed by one frame
/// (480 samples): the first output frame is the overlap tail of silence.
///
/// Not thread-safe (one instance per audio stream); `process` allocates nothing.
final class RnNoise {
    static let frameSize = 480
    static let sampleRate = 48000
    static let nbBands = 22
    static let nbFeatures = 42

    private static let frameSizeShift = 2
    private static let windowSize = 2 * frameSize
    private static let freqSize = frameSize + 1
    private static let pitchMinPeriod = 60
    private static let pitchMaxPeriod = 768
    private static let pitchFrameSize = 960
    private static let pitchBufSize = pitchMaxPeriod + pitchFrameSize
    private static let cepsMem = 8
    private static let nbDeltaCeps = 6
    private static let maxNeurons = 128
    private static let weightsScale: Float = 1.0 / 256

    // biquad coefficients: float constants used in double arithmetic, as in C.
    private static let aHp0 = Double(Float(-1.99599))
    private static let aHp1 = Double(Float(0.99600))
    private static let bHp0 = -2.0
    private static let bHp1 = 1.0

    private let model: RnNoiseModel
    private let tables = RnNoiseTables.shared
    // Local copies of the shared read-only tables (avoids lazy-global checks in hot loops).
    private let fft: KissFft
    private let halfWindow: UnsafePointer<Float>
    private let dctTable: UnsafePointer<Float>
    private let tansigTable: UnsafePointer<Float>
    private let eband5ms: UnsafePointer<Int>

    // Every float buffer below is carved out of one allocation.
    private let slab: UnsafeMutablePointer<Float>
    private let slabCount: Int

    // ---- DenoiseState ----
    private let analysisMem: UnsafeMutablePointer<Float>
    private let cepstralMem: UnsafeMutablePointer<Float>
    private var memid = 0
    private let synthesisMem: UnsafeMutablePointer<Float>
    private let pitchBuf: UnsafeMutablePointer<Float>
    private var lastGain: Float = 0
    private var lastPeriod = 0
    private let memHpX: UnsafeMutablePointer<Float>
    private let lastg: UnsafeMutablePointer<Float>
    private let vadGruState: UnsafeMutablePointer<Float>
    private let noiseGruState: UnsafeMutablePointer<Float>
    private let denoiseGruState: UnsafeMutablePointer<Float>
    /// How many floats at the start of the slab are persistent state (cleared by reset()).
    private let stateCount: Int

    // ---- per-frame scratch (C stack arrays) ----
    private let hp: UnsafeMutablePointer<Float>
    private let bigX: UnsafeMutablePointer<Float>
    private let bigP: UnsafeMutablePointer<Float>
    private let win: UnsafeMutablePointer<Float>
    private let fftIn: UnsafeMutablePointer<Float>
    private let fftOut: UnsafeMutablePointer<Float>
    private let ex: UnsafeMutablePointer<Float>
    private let ep: UnsafeMutablePointer<Float>
    private let exp: UnsafeMutablePointer<Float>
    private let features: UnsafeMutablePointer<Float>
    private let g: UnsafeMutablePointer<Float>
    private let gf: UnsafeMutablePointer<Float>
    private let rf: UnsafeMutablePointer<Float>
    private let normf: UnsafeMutablePointer<Float>
    private let bandSum: UnsafeMutablePointer<Float>
    private let tmpBands: UnsafeMutablePointer<Float>
    private let ly: UnsafeMutablePointer<Float>
    private let rBands: UnsafeMutablePointer<Float>
    private let newE: UnsafeMutablePointer<Float>
    private let norm: UnsafeMutablePointer<Float>
    private let vadOut: UnsafeMutablePointer<Float>
    // pitch analysis
    private let pitchLp: UnsafeMutablePointer<Float>
    private let ac: UnsafeMutablePointer<Float>
    private let lpc: UnsafeMutablePointer<Float>
    private let lpc2: UnsafeMutablePointer<Float>
    private let xLp4: UnsafeMutablePointer<Float>
    private let yLp4: UnsafeMutablePointer<Float>
    private let xcorr: UnsafeMutablePointer<Float>
    private var bestPitch0 = 0
    private var bestPitch1 = 0
    private let yyLookup: UnsafeMutablePointer<Float>
    private var pair0: Float = 0
    private var pair1: Float = 0
    // network
    private let denseOut: UnsafeMutablePointer<Float>
    private let noiseInput: UnsafeMutablePointer<Float>
    private let denoiseInput: UnsafeMutablePointer<Float>
    private let gz: UnsafeMutablePointer<Float>
    private let gr: UnsafeMutablePointer<Float>
    private let gh: UnsafeMutablePointer<Float>

    init(model: RnNoiseModel) {
        self.model = model
        fft = tables.fft
        halfWindow = UnsafePointer(tables.halfWindow)
        dctTable = UnsafePointer(tables.dctTable)
        tansigTable = UnsafePointer(tables.tansigTable)
        eband5ms = UnsafePointer(tables.eband5ms)

        typealias S = RnNoise
        let sizes: [Int] = [
            // state
            S.frameSize, S.cepsMem * S.nbBands, S.frameSize, S.pitchBufSize, 2, S.nbBands,
            model.vadGru.nbNeurons, model.noiseGru.nbNeurons, model.denoiseGru.nbNeurons,
            // scratch
            S.frameSize, 2 * S.freqSize, 2 * S.freqSize, S.windowSize, 2 * S.windowSize, 2 * S.windowSize,
            S.nbBands, S.nbBands, S.nbBands, S.nbFeatures, S.nbBands, S.freqSize, S.freqSize, S.freqSize,
            S.nbBands, S.nbBands, S.nbBands, S.nbBands, S.nbBands, S.nbBands, 1,
            S.pitchBufSize >> 1, 5, 4, 5, S.pitchFrameSize >> 2,
            (S.pitchFrameSize + S.pitchMaxPeriod - 3 * S.pitchMinPeriod) >> 2,
            (S.pitchMaxPeriod - 3 * S.pitchMinPeriod) >> 1, (S.pitchMaxPeriod >> 1) + 1,
            S.maxNeurons, S.maxNeurons * 3, S.maxNeurons * 3, S.maxNeurons, S.maxNeurons, S.maxNeurons,
        ]
        slabCount = sizes.reduce(0, +)
        slab = .allocate(capacity: slabCount)
        slab.initialize(repeating: 0, count: slabCount)
        var ptrs: [UnsafeMutablePointer<Float>] = []
        var off = 0
        for s in sizes { ptrs.append(slab + off); off += s }
        var k = 0
        func next() -> UnsafeMutablePointer<Float> { k += 1; return ptrs[k - 1] }
        analysisMem = next(); cepstralMem = next(); synthesisMem = next(); pitchBuf = next()
        memHpX = next(); lastg = next(); vadGruState = next(); noiseGruState = next(); denoiseGruState = next()
        stateCount = sizes[0..<9].reduce(0, +)
        hp = next(); bigX = next(); bigP = next(); win = next(); fftIn = next(); fftOut = next()
        ex = next(); ep = next(); exp = next(); features = next(); g = next(); gf = next(); rf = next(); normf = next()
        bandSum = next(); tmpBands = next(); ly = next(); rBands = next(); newE = next(); norm = next(); vadOut = next()
        pitchLp = next(); ac = next(); lpc = next(); lpc2 = next(); xLp4 = next(); yLp4 = next()
        xcorr = next(); yyLookup = next()
        denseOut = next(); noiseInput = next(); denoiseInput = next(); gz = next(); gr = next(); gh = next()
    }

    deinit {
        slab.deallocate()
    }

    /// Clears all state, as after construction.
    func reset() {
        slab.update(repeating: 0, count: stateCount)
        memid = 0; lastGain = 0; lastPeriod = 0
    }

    /// Denoises one 480-sample frame (16-bit scale) into `output` (may be the same buffer) and
    /// returns the voice-activity probability of the frame (0 for digital silence).
    @discardableResult
    func process(_ input: UnsafePointer<Float>, _ output: UnsafeMutablePointer<Float>) -> Float {
        biquad(input)
        let silence = computeFrameFeatures()
        var vadProb: Float = 0
        if !silence {
            computeRnn()
            vadProb = vadOut[0]
            pitchFilter()
            for i in 0..<RnNoise.nbBands {
                let a = 0.6 * lastg[i]
                g[i] = g[i] > a ? g[i] : a
                lastg[i] = g[i]
            }
            interpBandGain(gf, g)
            for i in 0..<RnNoise.freqSize {
                bigX[2 * i] *= gf[i]
                bigX[2 * i + 1] *= gf[i]
            }
        }
        frameSynthesis(output)
        return vadProb
    }

    /// Array convenience: denoises `frame` (480 samples, 16-bit scale) in place.
    @discardableResult
    func process(_ frame: inout [Float]) -> Float {
        precondition(frame.count >= RnNoise.frameSize)
        return frame.withUnsafeMutableBufferPointer { p in process(p.baseAddress!, p.baseAddress!) }
    }

    // ------------------------------------------------------------------ denoise.c

    private func biquad(_ x: UnsafePointer<Float>) {
        var m0 = memHpX[0]
        var m1 = memHpX[1]
        for i in 0..<RnNoise.frameSize {
            let xi = x[i]
            let yi = xi + m0
            m0 = Float(Double(m1) + (RnNoise.bHp0 * Double(xi) - RnNoise.aHp0 * Double(yi)))
            m1 = Float(RnNoise.bHp1 * Double(xi) - RnNoise.aHp1 * Double(yi))
            hp[i] = yi
        }
        memHpX[0] = m0
        memHpX[1] = m1
    }

    private func applyWindow(_ x: UnsafeMutablePointer<Float>) {
        let w = halfWindow
        for i in 0..<RnNoise.frameSize {
            x[i] *= w[i]
            x[RnNoise.windowSize - 1 - i] *= w[i]
        }
    }

    private func forwardTransform(_ out: UnsafeMutablePointer<Float>, _ input: UnsafePointer<Float>) {
        for i in 0..<RnNoise.windowSize {
            fftIn[2 * i] = input[i]
            fftIn[2 * i + 1] = 0
        }
        fft.forward(fftIn, fftOut)
        out.update(from: fftOut, count: 2 * RnNoise.freqSize)
    }

    private func inverseTransform(_ out: UnsafeMutablePointer<Float>, _ input: UnsafePointer<Float>) {
        let n = RnNoise.windowSize
        fftIn.update(from: input, count: 2 * RnNoise.freqSize)
        for i in RnNoise.freqSize..<n {
            fftIn[2 * i] = fftIn[2 * (n - i)]
            fftIn[2 * i + 1] = -fftIn[2 * (n - i) + 1]
        }
        fft.forward(fftIn, fftOut)
        let wn = Float(n)
        out[0] = wn * fftOut[0]
        for i in 1..<n { out[i] = wn * fftOut[2 * (n - i)] }
    }

    private func computeBandEnergy(_ bandE: UnsafeMutablePointer<Float>, _ x: UnsafePointer<Float>) {
        let sum = bandSum
        sum.update(repeating: 0, count: RnNoise.nbBands)
        for i in 0..<(RnNoise.nbBands - 1) {
            let bandSize = (eband5ms[i + 1] - eband5ms[i]) << RnNoise.frameSizeShift
            let base = eband5ms[i] << RnNoise.frameSizeShift
            let fb = Float(bandSize)
            for j in 0..<bandSize {
                let frac = Float(j) / fb
                let re = x[2 * (base + j)]
                let im = x[2 * (base + j) + 1]
                var tmp = re * re
                tmp += im * im
                sum[i] += (1 - frac) * tmp
                sum[i + 1] += frac * tmp
            }
        }
        sum[0] *= 2
        sum[RnNoise.nbBands - 1] *= 2
        bandE.update(from: sum, count: RnNoise.nbBands)
    }

    private func computeBandCorr(_ bandE: UnsafeMutablePointer<Float>, _ x: UnsafePointer<Float>, _ p: UnsafePointer<Float>) {
        let sum = bandSum
        sum.update(repeating: 0, count: RnNoise.nbBands)
        for i in 0..<(RnNoise.nbBands - 1) {
            let bandSize = (eband5ms[i + 1] - eband5ms[i]) << RnNoise.frameSizeShift
            let base = eband5ms[i] << RnNoise.frameSizeShift
            let fb = Float(bandSize)
            for j in 0..<bandSize {
                let frac = Float(j) / fb
                let k = 2 * (base + j)
                var tmp = x[k] * p[k]
                tmp += x[k + 1] * p[k + 1]
                sum[i] += (1 - frac) * tmp
                sum[i + 1] += frac * tmp
            }
        }
        sum[0] *= 2
        sum[RnNoise.nbBands - 1] *= 2
        bandE.update(from: sum, count: RnNoise.nbBands)
    }

    /// interp_band_gain(); bins >= 400 are never written and stay 0, as in the C code.
    private func interpBandGain(_ gOut: UnsafeMutablePointer<Float>, _ bandE: UnsafePointer<Float>) {
        for i in 0..<(RnNoise.nbBands - 1) {
            let bandSize = (eband5ms[i + 1] - eband5ms[i]) << RnNoise.frameSizeShift
            let base = eband5ms[i] << RnNoise.frameSizeShift
            let fb = Float(bandSize)
            for j in 0..<bandSize {
                let frac = Float(j) / fb
                gOut[base + j] = (1 - frac) * bandE[i] + frac * bandE[i + 1]
            }
        }
    }

    private func dct(_ out: UnsafeMutablePointer<Float>, _ input: UnsafePointer<Float>) {
        let nb = RnNoise.nbBands
        let scale = RnNoiseTables.sqrt2Over22
        for i in 0..<nb {
            var sum: Float = 0
            for j in 0..<nb { sum += input[j] * dctTable[j * nb + i] }
            out[i] = Float(Double(sum) * scale)
        }
    }

    private func frameAnalysis() {
        let fs = RnNoise.frameSize
        win.update(from: analysisMem, count: fs)
        (win + fs).update(from: hp, count: fs)
        analysisMem.update(from: hp, count: fs)
        applyWindow(win)
        forwardTransform(bigX, win)
        computeBandEnergy(ex, bigX)
    }

    private func computeFrameFeatures() -> Bool {
        typealias S = RnNoise
        frameAnalysis()
        // Shift the pitch buffer left by one frame (overlapping move) and append the new one.
        pitchBuf.update(from: pitchBuf + S.frameSize, count: S.pitchBufSize - S.frameSize)
        (pitchBuf + (S.pitchBufSize - S.frameSize)).update(from: hp, count: S.frameSize)
        pitchDownsample(pitchBuf, pitchLp, S.pitchBufSize)
        var pitchIndex = pitchSearch(pitchLp + (S.pitchMaxPeriod >> 1), pitchLp, S.pitchFrameSize,
                                     S.pitchMaxPeriod - 3 * S.pitchMinPeriod)
        pitchIndex = S.pitchMaxPeriod - pitchIndex
        let (period, gain) = removeDoubling(pitchLp, S.pitchMaxPeriod, S.pitchMinPeriod, S.pitchFrameSize,
                                            pitchIndex, lastPeriod, lastGain)
        pitchIndex = period
        lastPeriod = pitchIndex
        lastGain = gain
        win.update(from: pitchBuf + (S.pitchBufSize - S.windowSize - pitchIndex), count: S.windowSize)
        applyWindow(win)
        forwardTransform(bigP, win)
        computeBandEnergy(ep, bigP)
        computeBandCorr(exp, bigX, bigP)
        for i in 0..<S.nbBands {
            exp[i] = Float(Double(exp[i]) / (0.001 + Double(ex[i] * ep[i])).squareRoot())
        }
        dct(tmpBands, exp)
        let fp = S.nbBands + 2 * S.nbDeltaCeps
        for i in 0..<S.nbDeltaCeps { features[fp + i] = tmpBands[i] }
        features[fp] = Float(Double(features[fp]) - 1.3)
        features[fp + 1] = Float(Double(features[fp + 1]) - 0.9)
        features[S.nbBands + 3 * S.nbDeltaCeps] = Float(0.01 * Double(pitchIndex - 300))
        var logMax: Float = -2
        var follow: Float = -2
        var e: Float = 0
        for i in 0..<S.nbBands {
            let l0 = Float(log10(1e-2 + Double(ex[i])))
            // MAX16(logMax-7, MAX16(follow-1.5, Ly)) is evaluated in double in C.
            let a = Double(follow) - 1.5
            let inner = a > Double(l0) ? a : Double(l0)
            let c = logMax - 7
            let l = Float(Double(c) > inner ? Double(c) : inner)
            ly[i] = l
            logMax = logMax > l ? logMax : l
            follow = Float(Double(follow) - 1.5 > Double(l) ? Double(follow) - 1.5 : Double(l))
            e += ex[i]
        }
        if Double(e) < 0.04 {
            // No audio: avoid messing up the state.
            features.update(repeating: 0, count: S.nbFeatures)
            return true
        }
        dct(features, ly)
        features[0] -= 12
        features[1] -= 4
        let nb = S.nbBands
        let c0 = memid * nb
        let c1 = (memid < 1 ? S.cepsMem + memid - 1 : memid - 1) * nb
        let c2 = (memid < 2 ? S.cepsMem + memid - 2 : memid - 2) * nb
        (cepstralMem + c0).update(from: features, count: nb)
        memid += 1
        for i in 0..<S.nbDeltaCeps {
            features[i] = cepstralMem[c0 + i] + cepstralMem[c1 + i] + cepstralMem[c2 + i]
            features[nb + i] = cepstralMem[c0 + i] - cepstralMem[c2 + i]
            features[nb + S.nbDeltaCeps + i] = cepstralMem[c0 + i] - 2 * cepstralMem[c1 + i] + cepstralMem[c2 + i]
        }
        // Spectral variability features.
        if memid == S.cepsMem { memid = 0 }
        var specVariability: Float = 0
        for i in 0..<S.cepsMem {
            var mindist: Float = 1e15
            for j in 0..<S.cepsMem {
                var dist: Float = 0
                for k in 0..<nb {
                    let t = cepstralMem[i * nb + k] - cepstralMem[j * nb + k]
                    dist += t * t
                }
                if j != i { mindist = mindist < dist ? mindist : dist }
            }
            specVariability += mindist
        }
        features[nb + 3 * S.nbDeltaCeps + 1] = Float(Double(specVariability / Float(S.cepsMem)) - 2.1)
        return false
    }

    private func frameSynthesis(_ out: UnsafeMutablePointer<Float>) {
        let fs = RnNoise.frameSize
        inverseTransform(win, bigX)
        applyWindow(win)
        for i in 0..<fs { out[i] = win[i] + synthesisMem[i] }
        synthesisMem.update(from: win + fs, count: fs)
    }

    private func pitchFilter() {
        for i in 0..<RnNoise.nbBands {
            var r: Float
            if exp[i] > g[i] {
                r = 1
            } else {
                let e2 = exp[i] * exp[i]
                let g2 = g[i] * g[i]
                r = Float(Double(e2 * (1 - g2)) / (0.001 + Double(g2 * (1 - e2))))
            }
            let clamped = 0 > r ? 0 : r
            r = Float(Double(1 < clamped ? 1 : clamped).squareRoot())
            r = Float(Double(r) * (Double(ex[i]) / (1e-8 + Double(ep[i]))).squareRoot())
            rBands[i] = r
        }
        interpBandGain(rf, rBands)
        for i in 0..<RnNoise.freqSize {
            bigX[2 * i] += rf[i] * bigP[2 * i]
            bigX[2 * i + 1] += rf[i] * bigP[2 * i + 1]
        }
        computeBandEnergy(newE, bigX)
        for i in 0..<RnNoise.nbBands { norm[i] = Float((Double(ex[i]) / (1e-8 + Double(newE[i]))).squareRoot()) }
        interpBandGain(normf, norm)
        for i in 0..<RnNoise.freqSize {
            bigX[2 * i] *= normf[i]
            bigX[2 * i + 1] *= normf[i]
        }
    }

    // ------------------------------------------------------------------ pitch.c / celt_lpc.c

    private func pitchDownsample(_ x: UnsafePointer<Float>, _ xLp: UnsafeMutablePointer<Float>, _ len: Int) {
        let half = len >> 1
        for i in 1..<half { xLp[i] = 0.5 * (0.5 * (x[2 * i - 1] + x[2 * i + 1]) + x[2 * i]) }
        xLp[0] = 0.5 * (0.5 * x[1] + x[0])
        autocorr(xLp, ac, 4, half)
        // Noise floor -40 dB
        ac[0] *= 1.0001
        // Lag windowing
        for i in 1...4 {
            let w = 0.008 * Float(i)
            ac[i] -= ac[i] * w * w
        }
        lpcFromAc(lpc, ac, 4)
        var tmp: Float = 1
        for i in 0..<4 {
            tmp *= 0.9
            lpc[i] = lpc[i] * tmp
        }
        // Add a zero
        let c1: Float = 0.8
        lpc2[0] = lpc[0] + 0.8
        lpc2[1] = lpc[1] + c1 * lpc[0]
        lpc2[2] = lpc[2] + c1 * lpc[1]
        lpc2[3] = lpc[3] + c1 * lpc[2]
        lpc2[4] = c1 * lpc[3]
        fir5(xLp, lpc2, half)
    }

    private func fir5(_ x: UnsafeMutablePointer<Float>, _ num: UnsafePointer<Float>, _ n: Int) {
        let n0 = num[0], n1 = num[1], n2 = num[2], n3 = num[3], n4 = num[4]
        var m0: Float = 0, m1: Float = 0, m2: Float = 0, m3: Float = 0, m4: Float = 0
        for i in 0..<n {
            let xi = x[i]
            var sum = xi
            sum += n0 * m0
            sum += n1 * m1
            sum += n2 * m2
            sum += n3 * m3
            sum += n4 * m4
            m4 = m3; m3 = m2; m2 = m1; m1 = m0; m0 = xi
            x[i] = sum
        }
    }

    private func autocorr(_ x: UnsafePointer<Float>, _ acOut: UnsafeMutablePointer<Float>, _ lag: Int, _ n: Int) {
        let fastN = n - lag
        pitchXcorr(x, x, acOut, fastN, lag + 1)
        for k in 0...lag {
            var d: Float = 0
            for i in (k + fastN)..<n { d += x[i] * x[i - k] }
            acOut[k] += d
        }
    }

    private func lpcFromAc(_ out: UnsafeMutablePointer<Float>, _ acIn: UnsafePointer<Float>, _ p: Int) {
        var error = acIn[0]
        out.update(repeating: 0, count: p)
        if acIn[0] != 0 {
            for i in 0..<p {
                var rr: Float = 0
                for j in 0..<i { rr += out[j] * acIn[i - j] }
                rr += acIn[i + 1]
                let r = -rr / error
                out[i] = r
                for j in 0..<((i + 1) >> 1) {
                    let t1 = out[j]
                    let t2 = out[i - 1 - j]
                    out[j] = t1 + r * t2
                    out[i - 1 - j] = t2 + r * t1
                }
                error -= r * r * error
                if error < 0.001 * acIn[0] { break }
            }
        }
    }

    /// Plain inner products in sequential order (what xcorr_kernel computes for each lag).
    private func pitchXcorr(_ x: UnsafePointer<Float>, _ y: UnsafePointer<Float>, _ out: UnsafeMutablePointer<Float>,
                            _ len: Int, _ maxPitch: Int) {
        for i in 0..<maxPitch { out[i] = innerProd(x, y + i, len) }
    }

    @inline(__always)
    private func innerProd(_ x: UnsafePointer<Float>, _ y: UnsafePointer<Float>, _ n: Int) -> Float {
        var s: Float = 0
        for i in 0..<n { s += x[i] * y[i] }
        return s
    }

    /// find_best_pitch(); the two best lags go to bestPitch0 / bestPitch1.
    private func findBestPitch(_ xc: UnsafePointer<Float>, _ y: UnsafePointer<Float>, _ len: Int, _ maxPitch: Int) {
        var syy: Float = 1
        var bestNum0: Float = -1, bestNum1: Float = -1
        var bestDen0: Float = 0, bestDen1: Float = 0
        var best0 = 0, best1 = 1
        for j in 0..<len { syy += y[j] * y[j] }
        for i in 0..<maxPitch {
            if xc[i] > 0 {
                var xcorr16 = xc[i]
                xcorr16 *= 1e-12
                let num = xcorr16 * xcorr16
                if num * bestDen1 > bestNum1 * syy {
                    if num * bestDen0 > bestNum0 * syy {
                        bestNum1 = bestNum0; bestDen1 = bestDen0; best1 = best0
                        bestNum0 = num; bestDen0 = syy; best0 = i
                    } else {
                        bestNum1 = num; bestDen1 = syy; best1 = i
                    }
                }
            }
            syy += y[i + len] * y[i + len] - y[i] * y[i]
            syy = 1 > syy ? 1 : syy
        }
        bestPitch0 = best0
        bestPitch1 = best1
    }

    /// rnn_pitch_search(): returns the pitch lag.
    private func pitchSearch(_ xLp: UnsafePointer<Float>, _ y: UnsafePointer<Float>, _ len: Int, _ maxPitch: Int) -> Int {
        let lag = len + maxPitch
        bestPitch0 = 0; bestPitch1 = 0
        // Downsample by 2 again
        for j in 0..<(len >> 2) { xLp4[j] = xLp[2 * j] }
        for j in 0..<(lag >> 2) { yLp4[j] = y[2 * j] }
        // Coarse search with 4x decimation
        pitchXcorr(xLp4, yLp4, xcorr, len >> 2, maxPitch >> 2)
        findBestPitch(xcorr, yLp4, len >> 2, maxPitch >> 2)
        // Finer search with 2x decimation
        for i in 0..<(maxPitch >> 1) {
            xcorr[i] = 0
            if abs(i - 2 * bestPitch0) > 2 && abs(i - 2 * bestPitch1) > 2 { continue }
            let sum = innerProd(xLp, y + i, len >> 1)
            xcorr[i] = -1 > sum ? -1 : sum
        }
        findBestPitch(xcorr, y, len >> 1, maxPitch >> 1)
        // Refine by pseudo-interpolation
        let offset: Int
        if bestPitch0 > 0 && bestPitch0 < (maxPitch >> 1) - 1 {
            let a = xcorr[bestPitch0 - 1]
            let b = xcorr[bestPitch0]
            let c = xcorr[bestPitch0 + 1]
            offset = (c - a) > 0.7 * (b - a) ? 1 : ((a - c) > 0.7 * (b - c) ? -1 : 0)
        } else {
            offset = 0
        }
        return 2 * bestPitch0 - offset
    }

    @inline(__always)
    private func computePitchGain(_ xy: Float, _ xx: Float, _ yy: Float) -> Float {
        Float(Double(xy) / Double(1 + xx * yy).squareRoot())
    }

    /// dual_inner_prod(x, x+o1, x+o2) over n samples: results in pair0, pair1.
    private func dualInnerProd(_ x: UnsafePointer<Float>, _ o1: Int, _ o2: Int, _ n: Int) {
        var a: Float = 0
        var b: Float = 0
        for i in 0..<n {
            a += x[i] * x[o1 + i]
            b += x[i] * x[o2 + i]
        }
        pair0 = a
        pair1 = b
    }

    /// rnn_remove_doubling(): returns the updated period and the pitch gain.
    private func removeDoubling(_ xs: UnsafePointer<Float>, _ maxPeriod0: Int, _ minPeriod0: Int, _ n0: Int,
                                _ t0In: Int, _ prevPeriod0: Int, _ prevGain: Float) -> (Int, Float) {
        let maxPeriod = maxPeriod0 / 2
        let minPeriod = minPeriod0 / 2
        var t0 = t0In / 2
        let prevPeriod = prevPeriod0 / 2
        let n = n0 / 2
        let x = xs + maxPeriod // x += maxperiod
        if t0 >= maxPeriod { t0 = maxPeriod - 1 }
        var t = t0
        dualInnerProd(x, 0, -t0, n)
        let xx = pair0
        var xy = pair1
        yyLookup[0] = xx
        var yy = xx
        for i in 1...maxPeriod {
            yy = yy + x[-i] * x[-i] - x[n - i] * x[n - i]
            yyLookup[i] = 0 > yy ? 0 : yy
        }
        yy = yyLookup[t0]
        var bestXy = xy
        var bestYy = yy
        let g0 = computePitchGain(xy, xx, yy)
        var gg = g0
        // Look for any pitch at T/k
        for k in 2...15 {
            let t1 = (2 * t0 + k) / (2 * k)
            if t1 < minPeriod { break }
            // Look for another strong correlation at T1b
            let t1b: Int
            if k == 2 {
                t1b = t1 + t0 > maxPeriod ? t0 : t0 + t1
            } else {
                t1b = (2 * RnNoiseTables.secondCheck[k] * t0 + k) / (2 * k)
            }
            dualInnerProd(x, -t1, -t1b, n)
            xy = 0.5 * (pair0 + pair1)
            yy = 0.5 * (yyLookup[t1] + yyLookup[t1b])
            let g1 = computePitchGain(xy, xx, yy)
            let cont: Float
            if abs(t1 - prevPeriod) <= 1 {
                cont = prevGain
            } else if abs(t1 - prevPeriod) <= 2 && 5 * k * k < t0 {
                cont = 0.5 * prevGain
            } else {
                cont = 0
            }
            var a = 0.7 * g0 - cont
            var thresh = 0.3 > a ? 0.3 : a
            // Bias against very high pitch (very short period) to avoid false-positives
            // due to short-term correlation
            if t1 < 3 * minPeriod {
                a = 0.85 * g0 - cont
                thresh = 0.4 > a ? 0.4 : a
            } else if t1 < 2 * minPeriod {
                a = 0.9 * g0 - cont
                thresh = 0.5 > a ? 0.5 : a
            }
            if g1 > thresh {
                bestXy = xy
                bestYy = yy
                t = t1
                gg = g1
            }
        }
        bestXy = 0 > bestXy ? 0 : bestXy
        var pg: Float = bestYy <= bestXy ? 1 : bestXy / (bestYy + 1)
        let xc0 = innerProd(x, x - (t - 1), n)
        let xc1 = innerProd(x, x - t, n)
        let xc2 = innerProd(x, x - (t + 1), n)
        let offset: Int
        if (xc2 - xc0) > 0.7 * (xc1 - xc0) {
            offset = 1
        } else if (xc0 - xc2) > 0.7 * (xc1 - xc2) {
            offset = -1
        } else {
            offset = 0
        }
        if pg > gg { pg = gg }
        var tOut = 2 * t + offset
        if tOut < minPeriod0 { tOut = minPeriod0 }
        return (tOut, pg)
    }

    // ------------------------------------------------------------------ rnn.c

    private func computeDense(_ layer: RnNoiseModel.Dense, _ output: UnsafeMutablePointer<Float>, _ input: UnsafePointer<Float>) {
        let m = layer.nbInputs
        let n = layer.nbNeurons
        let w = layer.weights
        let bias = layer.bias
        let scale = RnNoise.weightsScale
        for i in 0..<n {
            var sum = bias[i]
            let row = w + i * m
            for j in 0..<m { sum += row[j] * input[j] }
            output[i] = scale * sum
        }
        switch layer.activation {
        case RnNoiseModel.activationSigmoid: for i in 0..<n { output[i] = sigmoidApprox(output[i]) }
        case RnNoiseModel.activationTanh: for i in 0..<n { output[i] = tansigApprox(output[i]) }
        default: for i in 0..<n { output[i] = output[i] < 0 ? 0 : output[i] }
        }
    }

    private func computeGru(_ gru: RnNoiseModel.Gru, _ state: UnsafeMutablePointer<Float>, _ input: UnsafePointer<Float>) {
        let m = gru.nbInputs
        let n = gru.nbNeurons
        let wi = gru.inputWeights
        let wr = gru.recurrentWeights
        let bias = gru.bias
        let scale = RnNoise.weightsScale
        for i in 0..<n {
            // Compute update gate.
            var sum = bias[i]
            let ri = wi + i * m
            for j in 0..<m { sum += ri[j] * input[j] }
            let rr = wr + i * n
            for j in 0..<n { sum += rr[j] * state[j] }
            gz[i] = sigmoidApprox(scale * sum)
        }
        for i in 0..<n {
            // Compute reset gate.
            var sum = bias[n + i]
            let ri = wi + (n + i) * m
            for j in 0..<m { sum += ri[j] * input[j] }
            let rr = wr + (n + i) * n
            for j in 0..<n { sum += rr[j] * state[j] }
            gr[i] = sigmoidApprox(scale * sum)
        }
        for i in 0..<n {
            // Compute output.
            var sum = bias[2 * n + i]
            let ri = wi + (2 * n + i) * m
            for j in 0..<m { sum += ri[j] * input[j] }
            let rr = wr + (2 * n + i) * n
            for j in 0..<n { sum += rr[j] * state[j] * gr[j] }
            switch gru.activation {
            case RnNoiseModel.activationSigmoid: sum = sigmoidApprox(scale * sum)
            case RnNoiseModel.activationTanh: sum = tansigApprox(scale * sum)
            default:
                let v = scale * sum
                sum = v < 0 ? 0 : v
            }
            gh[i] = gz[i] * state[i] + (1 - gz[i]) * sum
        }
        state.update(from: gh, count: n)
    }

    private func computeRnn() {
        let md = model
        computeDense(md.inputDense, denseOut, features)
        computeGru(md.vadGru, vadGruState, denseOut)
        computeDense(md.vadOutput, vadOut, vadGruState)
        let nd = md.inputDense.nbNeurons
        let nv = md.vadGru.nbNeurons
        let nn = md.noiseGru.nbNeurons
        noiseInput.update(from: denseOut, count: nd)
        (noiseInput + nd).update(from: vadGruState, count: nv)
        (noiseInput + nd + nv).update(from: features, count: RnNoise.nbFeatures)
        computeGru(md.noiseGru, noiseGruState, noiseInput)
        denoiseInput.update(from: vadGruState, count: nv)
        (denoiseInput + nv).update(from: noiseGruState, count: nn)
        (denoiseInput + nv + nn).update(from: features, count: RnNoise.nbFeatures)
        computeGru(md.denoiseGru, denoiseGruState, denoiseInput)
        computeDense(md.denoiseOutput, g, denoiseGruState)
    }

    @inline(__always)
    private func sigmoidApprox(_ x: Float) -> Float {
        Float(0.5 + 0.5 * Double(tansigApprox(Float(0.5 * Double(x)))))
    }

    @inline(__always)
    private func tansigApprox(_ x0: Float) -> Float {
        var x = x0
        // Tests are reversed to catch NaNs
        if !(x < 8) { return 1 }
        if !(x > -8) { return -1 }
        if x != x { return 0 }
        var sign: Float = 1
        if x < 0 {
            x = -x
            sign = -1
        }
        let i = Int(Double(0.5 + 25 * x).rounded(.down))
        x -= 0.04 * Float(i)
        var y = tansigTable[i]
        let dy = 1 - y * y
        y += x * dy * (1 - y * x)
        return sign * y
    }
}

/// The read-only tables every RnNoise state shares, built once.
final class RnNoiseTables: @unchecked Sendable {
    static let shared = RnNoiseTables()

    static let sqrt2Over22 = (2.0 / 22).squareRoot()
    static let secondCheck = [0, 0, 3, 2, 3, 2, 5, 2, 3, 2, 3, 2, 5, 2, 3, 2]
    private static let mPi = 3.14159265358979323846

    let fft = KissFft(nfft: 2 * RnNoise.frameSize)
    let halfWindow: UnsafeMutablePointer<Float>
    let dctTable: UnsafeMutablePointer<Float>
    let tansigTable: UnsafeMutablePointer<Float>
    let eband5ms: UnsafeMutablePointer<Int>

    private init() {
        let fs = RnNoise.frameSize
        halfWindow = .allocate(capacity: fs)
        for i in 0..<fs {
            let s = sin(0.5 * RnNoiseTables.mPi * (Double(i) + 0.5) / Double(fs))
            halfWindow[i] = Float(sin(0.5 * RnNoiseTables.mPi * s * s))
        }
        let nb = RnNoise.nbBands
        dctTable = .allocate(capacity: nb * nb)
        for i in 0..<nb {
            for j in 0..<nb {
                var v = Float(cos((Double(i) + 0.5) * Double(j) * RnNoiseTables.mPi / Double(nb)))
                if j == 0 { v = Float(Double(v) * 0.5.squareRoot()) }
                dctTable[i * nb + j] = v
            }
        }
        let t = RnNoiseTables.tansig
        tansigTable = .allocate(capacity: t.count)
        tansigTable.initialize(from: t, count: t.count)
        let e = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 20, 24, 28, 34, 40, 48, 60, 78, 100]
        eband5ms = .allocate(capacity: e.count)
        eband5ms.initialize(from: e, count: e.count)
    }

    static let tansig: [Float] = [
        0.000000, 0.039979, 0.079830, 0.119427, 0.158649,
        0.197375, 0.235496, 0.272905, 0.309507, 0.345214,
        0.379949, 0.413644, 0.446244, 0.477700, 0.507977,
        0.537050, 0.564900, 0.591519, 0.616909, 0.641077,
        0.664037, 0.685809, 0.706419, 0.725897, 0.744277,
        0.761594, 0.777888, 0.793199, 0.807569, 0.821040,
        0.833655, 0.845456, 0.856485, 0.866784, 0.876393,
        0.885352, 0.893698, 0.901468, 0.908698, 0.915420,
        0.921669, 0.927473, 0.932862, 0.937863, 0.942503,
        0.946806, 0.950795, 0.954492, 0.957917, 0.961090,
        0.964028, 0.966747, 0.969265, 0.971594, 0.973749,
        0.975743, 0.977587, 0.979293, 0.980869, 0.982327,
        0.983675, 0.984921, 0.986072, 0.987136, 0.988119,
        0.989027, 0.989867, 0.990642, 0.991359, 0.992020,
        0.992631, 0.993196, 0.993718, 0.994199, 0.994644,
        0.995055, 0.995434, 0.995784, 0.996108, 0.996407,
        0.996682, 0.996937, 0.997172, 0.997389, 0.997590,
        0.997775, 0.997946, 0.998104, 0.998249, 0.998384,
        0.998508, 0.998623, 0.998728, 0.998826, 0.998916,
        0.999000, 0.999076, 0.999147, 0.999213, 0.999273,
        0.999329, 0.999381, 0.999428, 0.999472, 0.999513,
        0.999550, 0.999585, 0.999617, 0.999646, 0.999673,
        0.999699, 0.999722, 0.999743, 0.999763, 0.999781,
        0.999798, 0.999813, 0.999828, 0.999841, 0.999853,
        0.999865, 0.999875, 0.999885, 0.999893, 0.999902,
        0.999909, 0.999916, 0.999923, 0.999929, 0.999934,
        0.999939, 0.999944, 0.999948, 0.999952, 0.999956,
        0.999959, 0.999962, 0.999965, 0.999968, 0.999970,
        0.999973, 0.999975, 0.999977, 0.999978, 0.999980,
        0.999982, 0.999983, 0.999984, 0.999986, 0.999987,
        0.999988, 0.999989, 0.999990, 0.999990, 0.999991,
        0.999992, 0.999992, 0.999993, 0.999994, 0.999994,
        0.999994, 0.999995, 0.999995, 0.999996, 0.999996,
        0.999996, 0.999997, 0.999997, 0.999997, 0.999997,
        0.999997, 0.999998, 0.999998, 0.999998, 0.999998,
        0.999998, 0.999998, 0.999999, 0.999999, 0.999999,
        0.999999, 0.999999, 0.999999, 0.999999, 0.999999,
        0.999999, 0.999999, 0.999999, 0.999999, 0.999999,
        1.000000, 1.000000, 1.000000, 1.000000, 1.000000,
        1.000000, 1.000000, 1.000000, 1.000000, 1.000000,
        1.000000,
    ]
}

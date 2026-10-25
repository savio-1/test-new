/* Port of the float build of kiss_fft.c as shipped in RNNoise v0.1.1 (Opus/CELT variant).
 * Copyright (c) 2003-2004 Mark Borgerding, 2005-2007 Xiph.Org Foundation, 2008 CSIRO,
 * modifications by Jean-Marc Valin. BSD-3-Clause, see rnnoise/COPYING. */
import Foundation

/// Mixed-radix (2, 3, 4, 5) complex forward FFT with precomputed twiddles and digit-reversal
/// table. It performs the same butterflies in the same order with the same float twiddles as
/// the C code (including the 1/nfft input scaling of rnn_fft_c), so results match it bit for
/// bit on IEEE-754 float hardware. 960 = 5 * 3 * 4 * 4 * 4.
///
/// Data is interleaved (re, im). Immutable after construction and therefore thread-safe; the
/// caller supplies the buffers.
final class KissFft: @unchecked Sendable {
    let nfft: Int
    private var factors = [Int](repeating: 0, count: 2 * KissFft.maxFactors)
    private var fstride = [Int](repeating: 0, count: KissFft.maxFactors + 1)
    private let twr: UnsafeMutablePointer<Float>
    private let twi: UnsafeMutablePointer<Float>
    private let bitrev: UnsafeMutablePointer<Int>
    private let scale: Float
    private var stages = 0

    private static let maxFactors = 8
    private static let pi = 3.14159265358979323846264338327

    init(nfft: Int) {
        self.nfft = nfft
        scale = 1 / Float(nfft)
        twr = .allocate(capacity: nfft)
        twi = .allocate(capacity: nfft)
        bitrev = .allocate(capacity: nfft)
        bitrev.initialize(repeating: 0, count: nfft)
        for i in 0..<nfft {
            let phase = (-2.0 * KissFft.pi / Double(nfft)) * Double(i)
            twr[i] = Float(cos(phase))
            twi[i] = Float(sin(phase))
        }
        precondition(kfFactor(nfft), "unsupported FFT size \(nfft)")
        computeBitrev(0, 0, 1, 1, 0)
        fstride[0] = 1
        var l = 0
        var m: Int
        repeat {
            let p = factors[2 * l]
            m = factors[2 * l + 1]
            fstride[l + 1] = fstride[l] * p
            l += 1
        } while m != 1
        stages = l
    }

    deinit {
        twr.deallocate()
        twi.deallocate()
        bitrev.deallocate()
    }

    /// rnn_fft(): fout = FFT(fin) / nfft. Both buffers hold 2*nfft floats; they must differ.
    func forward(_ fin: UnsafePointer<Float>, _ fout: UnsafeMutablePointer<Float>) {
        let s = scale
        for i in 0..<nfft {
            let d = 2 * bitrev[i]
            fout[d] = s * fin[2 * i]
            fout[d + 1] = s * fin[2 * i + 1]
        }
        impl(fout)
    }

    private func impl(_ f: UnsafeMutablePointer<Float>) {
        var m = factors[2 * stages - 1]
        var i = stages - 1
        while i >= 0 {
            let m2 = i != 0 ? factors[2 * i - 1] : 1
            switch factors[2 * i] {
            case 2: bfly2(f, m, fstride[i])
            case 4: bfly4(f, fstride[i], m, fstride[i], m2)
            case 3: bfly3(f, fstride[i], m, fstride[i], m2)
            case 5: bfly5(f, fstride[i], m, fstride[i], m2)
            default: break
            }
            m = m2
            i -= 1
        }
    }

    private func bfly2(_ f: UnsafeMutablePointer<Float>, _ m: Int, _ n: Int) {
        if m == 1 {
            var o = 0
            for _ in 0..<n {
                let tr = f[o + 2], ti = f[o + 3]
                f[o + 2] = f[o] - tr; f[o + 3] = f[o + 1] - ti
                f[o] += tr; f[o + 1] += ti
                o += 4
            }
        } else {
            let tw: Float = 0.7071067812
            var o = 0
            for _ in 0..<n {
                let o2 = o + 8
                var tr = f[o2], ti = f[o2 + 1]
                f[o2] = f[o] - tr; f[o2 + 1] = f[o + 1] - ti
                f[o] += tr; f[o + 1] += ti

                tr = (f[o2 + 2] + f[o2 + 3]) * tw
                ti = (f[o2 + 3] - f[o2 + 2]) * tw
                f[o2 + 2] = f[o + 2] - tr; f[o2 + 3] = f[o + 3] - ti
                f[o + 2] += tr; f[o + 3] += ti

                tr = f[o2 + 5]
                ti = -f[o2 + 4]
                f[o2 + 4] = f[o + 4] - tr; f[o2 + 5] = f[o + 5] - ti
                f[o + 4] += tr; f[o + 5] += ti

                tr = (f[o2 + 7] - f[o2 + 6]) * tw
                ti = -(f[o2 + 7] + f[o2 + 6]) * tw
                f[o2 + 6] = f[o + 6] - tr; f[o2 + 7] = f[o + 7] - ti
                f[o + 6] += tr; f[o + 7] += ti
                o += 16
            }
        }
    }

    private func bfly4(_ f: UnsafeMutablePointer<Float>, _ fs: Int, _ m: Int, _ n: Int, _ mm: Int) {
        if m == 1 {
            var o = 0
            for _ in 0..<n {
                let f0r = f[o], f0i = f[o + 1]
                let f1r = f[o + 2], f1i = f[o + 3]
                let f2r = f[o + 4], f2i = f[o + 5]
                let f3r = f[o + 6], f3i = f[o + 7]
                let s0r = f0r - f2r, s0i = f0i - f2i
                let a0r = f0r + f2r, a0i = f0i + f2i
                var s1r = f1r + f3r, s1i = f1i + f3i
                f[o + 4] = a0r - s1r; f[o + 5] = a0i - s1i
                f[o] = a0r + s1r; f[o + 1] = a0i + s1i
                s1r = f1r - f3r; s1i = f1i - f3i
                f[o + 2] = s0r + s1i; f[o + 3] = s0i - s1r
                f[o + 6] = s0r - s1i; f[o + 7] = s0i + s1r
                o += 8
            }
        } else {
            let twr = self.twr, twi = self.twi
            let m2 = 2 * m
            let m3 = 3 * m
            for i in 0..<n {
                var k = i * mm
                var t1 = 0, t2 = 0, t3 = 0
                for _ in 0..<m {
                    let a = 2 * k, b = 2 * (k + m), c = 2 * (k + m2), d = 2 * (k + m3)
                    let s0r = f[b] * twr[t1] - f[b + 1] * twi[t1]
                    let s0i = f[b] * twi[t1] + f[b + 1] * twr[t1]
                    let s1r = f[c] * twr[t2] - f[c + 1] * twi[t2]
                    let s1i = f[c] * twi[t2] + f[c + 1] * twr[t2]
                    let s2r = f[d] * twr[t3] - f[d + 1] * twi[t3]
                    let s2i = f[d] * twi[t3] + f[d + 1] * twr[t3]
                    let s5r = f[a] - s1r, s5i = f[a + 1] - s1i
                    let f0r = f[a] + s1r, f0i = f[a + 1] + s1i
                    let s3r = s0r + s2r, s3i = s0i + s2i
                    let s4r = s0r - s2r, s4i = s0i - s2i
                    f[c] = f0r - s3r; f[c + 1] = f0i - s3i
                    t1 += fs; t2 += 2 * fs; t3 += 3 * fs
                    f[a] = f0r + s3r; f[a + 1] = f0i + s3i
                    f[b] = s5r + s4i; f[b + 1] = s5i - s4r
                    f[d] = s5r - s4i; f[d + 1] = s5i + s4r
                    k += 1
                }
            }
        }
    }

    private func bfly3(_ f: UnsafeMutablePointer<Float>, _ fs: Int, _ m: Int, _ n: Int, _ mm: Int) {
        let twr = self.twr, twi = self.twi
        let m2 = 2 * m
        let epi3i = twi[fs * m]
        for i in 0..<n {
            var k = i * mm
            var t1 = 0, t2 = 0
            for _ in 0..<m {
                let a = 2 * k, b = 2 * (k + m), c = 2 * (k + m2)
                let s1r = f[b] * twr[t1] - f[b + 1] * twi[t1]
                let s1i = f[b] * twi[t1] + f[b + 1] * twr[t1]
                let s2r = f[c] * twr[t2] - f[c + 1] * twi[t2]
                let s2i = f[c] * twi[t2] + f[c + 1] * twr[t2]
                let s3r = s1r + s2r, s3i = s1i + s2i
                var s0r = s1r - s2r, s0i = s1i - s2i
                t1 += fs; t2 += 2 * fs
                let fmr = f[a] - s3r * 0.5
                let fmi = f[a + 1] - s3i * 0.5
                s0r *= epi3i; s0i *= epi3i
                f[a] += s3r; f[a + 1] += s3i
                f[c] = fmr + s0i; f[c + 1] = fmi - s0r
                f[b] = fmr - s0i; f[b + 1] = fmi + s0r
                k += 1
            }
        }
    }

    private func bfly5(_ f: UnsafeMutablePointer<Float>, _ fs: Int, _ m: Int, _ n: Int, _ mm: Int) {
        let twr = self.twr, twi = self.twi
        let yar = twr[fs * m], yai = twi[fs * m]
        let ybr = twr[fs * 2 * m], ybi = twi[fs * 2 * m]
        for i in 0..<n {
            let beg = i * mm
            for u in 0..<m {
                let i0 = 2 * (beg + u), i1 = 2 * (beg + u + m), i2 = 2 * (beg + u + 2 * m)
                let i3 = 2 * (beg + u + 3 * m), i4 = 2 * (beg + u + 4 * m)
                let s0r = f[i0], s0i = f[i0 + 1]
                let w1 = u * fs, w2 = 2 * u * fs, w3 = 3 * u * fs, w4 = 4 * u * fs
                let s1r = f[i1] * twr[w1] - f[i1 + 1] * twi[w1]
                let s1i = f[i1] * twi[w1] + f[i1 + 1] * twr[w1]
                let s2r = f[i2] * twr[w2] - f[i2 + 1] * twi[w2]
                let s2i = f[i2] * twi[w2] + f[i2 + 1] * twr[w2]
                let s3r = f[i3] * twr[w3] - f[i3 + 1] * twi[w3]
                let s3i = f[i3] * twi[w3] + f[i3 + 1] * twr[w3]
                let s4r = f[i4] * twr[w4] - f[i4 + 1] * twi[w4]
                let s4i = f[i4] * twi[w4] + f[i4 + 1] * twr[w4]

                let s7r = s1r + s4r, s7i = s1i + s4i
                let s10r = s1r - s4r, s10i = s1i - s4i
                let s8r = s2r + s3r, s8i = s2i + s3i
                let s9r = s2r - s3r, s9i = s2i - s3i

                f[i0] = s0r + (s7r + s8r)
                f[i0 + 1] = s0i + (s7i + s8i)

                let s5r = s0r + (s7r * yar + s8r * ybr)
                let s5i = s0i + (s7i * yar + s8i * ybr)
                let s6r = s10i * yai + s9i * ybi
                let s6i = -(s10r * yai + s9r * ybi)

                f[i1] = s5r - s6r; f[i1 + 1] = s5i - s6i
                f[i4] = s5r + s6r; f[i4 + 1] = s5i + s6i

                let s11r = s0r + (s7r * ybr + s8r * yar)
                let s11i = s0i + (s7i * ybr + s8i * yar)
                let s12r = s9i * yai - s10i * ybi
                let s12i = s10r * ybi - s9r * yai

                f[i2] = s11r + s12r; f[i2 + 1] = s11i + s12i
                f[i3] = s11r - s12r; f[i3 + 1] = s11i - s12i
            }
        }
    }

    private func computeBitrev(_ fout0: Int, _ f0: Int, _ fs: Int, _ inStride: Int, _ fac: Int) {
        let p = factors[fac]
        let m = factors[fac + 1]
        var f = f0
        var fout = fout0
        if m == 1 {
            for j in 0..<p {
                bitrev[f] = fout + j
                f += fs * inStride
            }
        } else {
            for _ in 0..<p {
                computeBitrev(fout, f, fs * p, inStride, fac + 2)
                f += fs * inStride
                fout += m
            }
        }
    }

    /// kf_factor(): powers of 4 first, then 2, then odd primes; order reversed afterwards.
    private func kfFactor(_ n0: Int) -> Bool {
        var n = n0
        var p = 4
        var st = 0
        repeat {
            while n % p != 0 {
                switch p {
                case 4: p = 2
                case 2: p = 3
                default: p += 2
                }
                if p > 32000 || p * p > n { p = n }
            }
            n /= p
            if p > 5 { return false }
            if st >= KissFft.maxFactors { return false }
            factors[2 * st] = p
            if p == 2 && st > 1 {
                factors[2 * st] = 4
                factors[2] = 2
            }
            st += 1
        } while n > 1
        n = n0
        for i in 0..<(st / 2) {
            let t = factors[2 * i]
            factors[2 * i] = factors[2 * (st - i - 1)]
            factors[2 * (st - i - 1)] = t
        }
        for i in 0..<st {
            n /= factors[2 * i]
            factors[2 * i + 1] = n
        }
        return true
    }
}

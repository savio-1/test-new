/* Port of the float build of kiss_fft.c as shipped in RNNoise v0.1.1 (Opus/CELT variant).
 * Copyright (c) 2003-2004 Mark Borgerding, 2005-2007 Xiph.Org Foundation, 2008 CSIRO,
 * modifications by Jean-Marc Valin. BSD-3-Clause, see assets/rnnoise/COPYING. */
package app.filmcam.audio

/**
 * Mixed-radix (2, 3, 4, 5) complex forward FFT with precomputed twiddles and digit-reversal
 * table. It performs the same butterflies in the same order with the same float twiddles as
 * the C code (including the 1/nfft input scaling of rnn_fft_c), so results match it bit for
 * bit on IEEE-754 float hardware. 960 = 5 * 3 * 4 * 4 * 4.
 *
 * Data is interleaved (re, im). Immutable after construction and therefore thread-safe; the
 * caller supplies the buffers.
 */
internal class KissFft(val nfft: Int) {
    private val factors = IntArray(2 * MAXFACTORS)
    private val twr = FloatArray(nfft)
    private val twi = FloatArray(nfft)
    private val bitrev = IntArray(nfft)
    private val fstride = IntArray(MAXFACTORS + 1)
    private val scale = 1f / nfft
    private val stages: Int

    init {
        for (i in 0 until nfft) {
            val phase = (-2.0 * PI / nfft) * i
            twr[i] = StrictMath.cos(phase).toFloat()
            twi[i] = StrictMath.sin(phase).toFloat()
        }
        require(kfFactor(nfft)) { "unsupported FFT size $nfft" }
        computeBitrev(0, 0, 1, 1, 0)
        fstride[0] = 1
        var l = 0
        var m: Int
        do {
            val p = factors[2 * l]
            m = factors[2 * l + 1]
            fstride[l + 1] = fstride[l] * p
            l++
        } while (m != 1)
        stages = l
    }

    /** rnn_fft(): fout = FFT(fin) / nfft. Both arrays hold 2*nfft floats; they must differ. */
    fun forward(fin: FloatArray, fout: FloatArray) {
        for (i in 0 until nfft) {
            val d = 2 * bitrev[i]
            fout[d] = scale * fin[2 * i]
            fout[d + 1] = scale * fin[2 * i + 1]
        }
        impl(fout)
    }

    private fun impl(f: FloatArray) {
        var m = factors[2 * stages - 1]
        for (i in stages - 1 downTo 0) {
            val m2 = if (i != 0) factors[2 * i - 1] else 1
            when (factors[2 * i]) {
                2 -> bfly2(f, m, fstride[i])
                4 -> bfly4(f, fstride[i], m, fstride[i], m2)
                3 -> bfly3(f, fstride[i], m, fstride[i], m2)
                5 -> bfly5(f, fstride[i], m, fstride[i], m2)
            }
            m = m2
        }
    }

    private fun bfly2(f: FloatArray, m: Int, n: Int) {
        if (m == 1) {
            var o = 0
            for (i in 0 until n) {
                val tr = f[o + 2]; val ti = f[o + 3]
                f[o + 2] = f[o] - tr; f[o + 3] = f[o + 1] - ti
                f[o] += tr; f[o + 1] += ti
                o += 4
            }
        } else {
            val tw = 0.7071067812f
            var o = 0
            for (i in 0 until n) {
                val o2 = o + 8
                var tr = f[o2]; var ti = f[o2 + 1]
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

    private fun bfly4(f: FloatArray, fs: Int, m: Int, n: Int, mm: Int) {
        if (m == 1) {
            var o = 0
            for (i in 0 until n) {
                val f0r = f[o]; val f0i = f[o + 1]
                val f1r = f[o + 2]; val f1i = f[o + 3]
                val f2r = f[o + 4]; val f2i = f[o + 5]
                val f3r = f[o + 6]; val f3i = f[o + 7]
                val s0r = f0r - f2r; val s0i = f0i - f2i
                val a0r = f0r + f2r; val a0i = f0i + f2i
                var s1r = f1r + f3r; var s1i = f1i + f3i
                f[o + 4] = a0r - s1r; f[o + 5] = a0i - s1i
                f[o] = a0r + s1r; f[o + 1] = a0i + s1i
                s1r = f1r - f3r; s1i = f1i - f3i
                f[o + 2] = s0r + s1i; f[o + 3] = s0i - s1r
                f[o + 6] = s0r - s1i; f[o + 7] = s0i + s1r
                o += 8
            }
        } else {
            val m2 = 2 * m
            val m3 = 3 * m
            for (i in 0 until n) {
                var k = i * mm
                var t1 = 0; var t2 = 0; var t3 = 0
                for (j in 0 until m) {
                    val a = 2 * k; val b = 2 * (k + m); val c = 2 * (k + m2); val d = 2 * (k + m3)
                    val s0r = f[b] * twr[t1] - f[b + 1] * twi[t1]
                    val s0i = f[b] * twi[t1] + f[b + 1] * twr[t1]
                    val s1r = f[c] * twr[t2] - f[c + 1] * twi[t2]
                    val s1i = f[c] * twi[t2] + f[c + 1] * twr[t2]
                    val s2r = f[d] * twr[t3] - f[d + 1] * twi[t3]
                    val s2i = f[d] * twi[t3] + f[d + 1] * twr[t3]
                    val s5r = f[a] - s1r; val s5i = f[a + 1] - s1i
                    val f0r = f[a] + s1r; val f0i = f[a + 1] + s1i
                    val s3r = s0r + s2r; val s3i = s0i + s2i
                    val s4r = s0r - s2r; val s4i = s0i - s2i
                    f[c] = f0r - s3r; f[c + 1] = f0i - s3i
                    t1 += fs; t2 += 2 * fs; t3 += 3 * fs
                    f[a] = f0r + s3r; f[a + 1] = f0i + s3i
                    f[b] = s5r + s4i; f[b + 1] = s5i - s4r
                    f[d] = s5r - s4i; f[d + 1] = s5i + s4r
                    k++
                }
            }
        }
    }

    private fun bfly3(f: FloatArray, fs: Int, m: Int, n: Int, mm: Int) {
        val m2 = 2 * m
        val epi3i = twi[fs * m]
        for (i in 0 until n) {
            var k = i * mm
            var t1 = 0; var t2 = 0
            for (u in 0 until m) {
                val a = 2 * k; val b = 2 * (k + m); val c = 2 * (k + m2)
                val s1r = f[b] * twr[t1] - f[b + 1] * twi[t1]
                val s1i = f[b] * twi[t1] + f[b + 1] * twr[t1]
                val s2r = f[c] * twr[t2] - f[c + 1] * twi[t2]
                val s2i = f[c] * twi[t2] + f[c + 1] * twr[t2]
                val s3r = s1r + s2r; val s3i = s1i + s2i
                var s0r = s1r - s2r; var s0i = s1i - s2i
                t1 += fs; t2 += 2 * fs
                val fmr = f[a] - s3r * 0.5f
                val fmi = f[a + 1] - s3i * 0.5f
                s0r *= epi3i; s0i *= epi3i
                f[a] += s3r; f[a + 1] += s3i
                f[c] = fmr + s0i; f[c + 1] = fmi - s0r
                f[b] = fmr - s0i; f[b + 1] = fmi + s0r
                k++
            }
        }
    }

    private fun bfly5(f: FloatArray, fs: Int, m: Int, n: Int, mm: Int) {
        val yar = twr[fs * m]; val yai = twi[fs * m]
        val ybr = twr[fs * 2 * m]; val ybi = twi[fs * 2 * m]
        for (i in 0 until n) {
            val beg = i * mm
            for (u in 0 until m) {
                val i0 = 2 * (beg + u); val i1 = 2 * (beg + u + m); val i2 = 2 * (beg + u + 2 * m)
                val i3 = 2 * (beg + u + 3 * m); val i4 = 2 * (beg + u + 4 * m)
                val s0r = f[i0]; val s0i = f[i0 + 1]
                val w1 = u * fs; val w2 = 2 * u * fs; val w3 = 3 * u * fs; val w4 = 4 * u * fs
                val s1r = f[i1] * twr[w1] - f[i1 + 1] * twi[w1]
                val s1i = f[i1] * twi[w1] + f[i1 + 1] * twr[w1]
                val s2r = f[i2] * twr[w2] - f[i2 + 1] * twi[w2]
                val s2i = f[i2] * twi[w2] + f[i2 + 1] * twr[w2]
                val s3r = f[i3] * twr[w3] - f[i3 + 1] * twi[w3]
                val s3i = f[i3] * twi[w3] + f[i3 + 1] * twr[w3]
                val s4r = f[i4] * twr[w4] - f[i4 + 1] * twi[w4]
                val s4i = f[i4] * twi[w4] + f[i4 + 1] * twr[w4]

                val s7r = s1r + s4r; val s7i = s1i + s4i
                val s10r = s1r - s4r; val s10i = s1i - s4i
                val s8r = s2r + s3r; val s8i = s2i + s3i
                val s9r = s2r - s3r; val s9i = s2i - s3i

                f[i0] = s0r + (s7r + s8r)
                f[i0 + 1] = s0i + (s7i + s8i)

                val s5r = s0r + (s7r * yar + s8r * ybr)
                val s5i = s0i + (s7i * yar + s8i * ybr)
                val s6r = s10i * yai + s9i * ybi
                val s6i = -(s10r * yai + s9r * ybi)

                f[i1] = s5r - s6r; f[i1 + 1] = s5i - s6i
                f[i4] = s5r + s6r; f[i4 + 1] = s5i + s6i

                val s11r = s0r + (s7r * ybr + s8r * yar)
                val s11i = s0i + (s7i * ybr + s8i * yar)
                val s12r = s9i * yai - s10i * ybi
                val s12i = s10r * ybi - s9r * yai

                f[i2] = s11r + s12r; f[i2 + 1] = s11i + s12i
                f[i3] = s11r - s12r; f[i3 + 1] = s11i - s12i
            }
        }
    }

    private fun computeBitrev(fout0: Int, f0: Int, fs: Int, inStride: Int, fac: Int) {
        val p = factors[fac]
        val m = factors[fac + 1]
        var f = f0
        var fout = fout0
        if (m == 1) {
            for (j in 0 until p) {
                bitrev[f] = fout + j
                f += fs * inStride
            }
        } else {
            for (j in 0 until p) {
                computeBitrev(fout, f, fs * p, inStride, fac + 2)
                f += fs * inStride
                fout += m
            }
        }
    }

    /** kf_factor(): powers of 4 first, then 2, then odd primes; order reversed afterwards. */
    private fun kfFactor(n0: Int): Boolean {
        var n = n0
        var p = 4
        var st = 0
        do {
            while (n % p != 0) {
                p = when (p) { 4 -> 2; 2 -> 3; else -> p + 2 }
                if (p > 32000 || p.toLong() * p > n) p = n
            }
            n /= p
            if (p > 5) return false
            if (st >= MAXFACTORS) return false
            factors[2 * st] = p
            if (p == 2 && st > 1) {
                factors[2 * st] = 4
                factors[2] = 2
            }
            st++
        } while (n > 1)
        n = n0
        for (i in 0 until st / 2) {
            val t = factors[2 * i]
            factors[2 * i] = factors[2 * (st - i - 1)]
            factors[2 * (st - i - 1)] = t
        }
        for (i in 0 until st) {
            n /= factors[2 * i]
            factors[2 * i + 1] = n
        }
        return true
    }

    private companion object {
        const val MAXFACTORS = 8
        const val PI = 3.14159265358979323846264338327
    }
}

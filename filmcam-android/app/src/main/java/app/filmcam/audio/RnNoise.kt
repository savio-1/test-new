/* Pure-Kotlin port of RNNoise v0.1.1 (denoise.c, pitch.c, celt_lpc.c, rnn.c).
 * Copyright (c) 2017 Mozilla, 2018 Gregor Richards, 2007-2017 Jean-Marc Valin,
 * 2005-2017 Xiph.Org Foundation, 2007-2008 CSIRO, 2008-2011 Octasic Inc.
 * BSD-3-Clause, see assets/rnnoise/COPYING. */
package app.filmcam.audio

import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.sqrt

/**
 * One RNNoise denoiser state: a faithful port of rnnoise_process_frame() for 48 kHz mono audio
 * in 480-sample (10 ms) frames, on the 16-bit sample scale (floats in -32768..32767).
 *
 * The arithmetic mirrors the float C build operation for operation, including the places where
 * C promotes to double (sqrt/log10 and double constants), so the output matches the reference
 * implementation to float rounding. Like the C code, the output is delayed by one frame
 * (480 samples): the first output frame is the overlap tail of silence.
 *
 * Not thread-safe (one instance per audio stream); [process] allocates nothing.
 */
class RnNoise(private val model: RnNoiseModel) {

    // ---- DenoiseState ----
    private val analysisMem = FloatArray(FRAME_SIZE)
    private val cepstralMem = FloatArray(CEPS_MEM * NB_BANDS)
    private var memid = 0
    private val synthesisMem = FloatArray(FRAME_SIZE)
    private val pitchBuf = FloatArray(PITCH_BUF_SIZE)
    private var lastGain = 0f
    private var lastPeriod = 0
    private val memHpX = FloatArray(2)
    private val lastg = FloatArray(NB_BANDS)
    private val vadGruState = FloatArray(model.vadGru.nbNeurons)
    private val noiseGruState = FloatArray(model.noiseGru.nbNeurons)
    private val denoiseGruState = FloatArray(model.denoiseGru.nbNeurons)

    // ---- per-frame scratch (C stack arrays) ----
    private val hp = FloatArray(FRAME_SIZE)
    private val bigX = FloatArray(2 * FREQ_SIZE)
    private val bigP = FloatArray(2 * FREQ_SIZE)
    private val win = FloatArray(WINDOW_SIZE)
    private val fftIn = FloatArray(2 * WINDOW_SIZE)
    private val fftOut = FloatArray(2 * WINDOW_SIZE)
    private val ex = FloatArray(NB_BANDS)
    private val ep = FloatArray(NB_BANDS)
    private val exp = FloatArray(NB_BANDS)
    private val features = FloatArray(NB_FEATURES)
    private val g = FloatArray(NB_BANDS)
    private val gf = FloatArray(FREQ_SIZE)
    private val rf = FloatArray(FREQ_SIZE)
    private val normf = FloatArray(FREQ_SIZE)
    private val bandSum = FloatArray(NB_BANDS)
    private val tmpBands = FloatArray(NB_BANDS)
    private val ly = FloatArray(NB_BANDS)
    private val rBands = FloatArray(NB_BANDS)
    private val newE = FloatArray(NB_BANDS)
    private val norm = FloatArray(NB_BANDS)
    private val vadOut = FloatArray(1)
    // pitch analysis
    private val pitchLp = FloatArray(PITCH_BUF_SIZE shr 1)
    private val ac = FloatArray(5)
    private val lpc = FloatArray(4)
    private val lpc2 = FloatArray(5)
    private val xLp4 = FloatArray(PITCH_FRAME_SIZE shr 2)
    private val yLp4 = FloatArray((PITCH_FRAME_SIZE + PITCH_MAX_PERIOD - 3 * PITCH_MIN_PERIOD) shr 2)
    private val xcorr = FloatArray((PITCH_MAX_PERIOD - 3 * PITCH_MIN_PERIOD) shr 1)
    private val bestPitch = IntArray(2)
    private val bestNum = FloatArray(2)
    private val bestDen = FloatArray(2)
    private val yyLookup = FloatArray((PITCH_MAX_PERIOD shr 1) + 1)
    private val pair = FloatArray(2)
    // network
    private val denseOut = FloatArray(MAX_NEURONS)
    private val noiseInput = FloatArray(MAX_NEURONS * 3)
    private val denoiseInput = FloatArray(MAX_NEURONS * 3)
    private val gz = FloatArray(MAX_NEURONS)
    private val gr = FloatArray(MAX_NEURONS)
    private val gh = FloatArray(MAX_NEURONS)

    /** Clears all state, as after construction. */
    fun reset() {
        analysisMem.fill(0f); cepstralMem.fill(0f); memid = 0; synthesisMem.fill(0f)
        pitchBuf.fill(0f); lastGain = 0f; lastPeriod = 0; memHpX.fill(0f); lastg.fill(0f)
        vadGruState.fill(0f); noiseGruState.fill(0f); denoiseGruState.fill(0f)
    }

    /**
     * Denoises one 480-sample frame (16-bit scale) into [out] (may be the same array) and
     * returns the voice-activity probability of the frame (0 for digital silence).
     */
    fun process(frame: FloatArray, out: FloatArray): Float = process(frame, 0, out, 0)

    fun process(input: FloatArray, inOff: Int, out: FloatArray, outOff: Int): Float {
        biquad(input, inOff)
        val silence = computeFrameFeatures()
        var vadProb = 0f
        if (!silence) {
            computeRnn()
            vadProb = vadOut[0]
            pitchFilter()
            for (i in 0 until NB_BANDS) {
                val a = 0.6f * lastg[i]
                g[i] = if (g[i] > a) g[i] else a
                lastg[i] = g[i]
            }
            interpBandGain(gf, g)
            for (i in 0 until FREQ_SIZE) {
                bigX[2 * i] *= gf[i]
                bigX[2 * i + 1] *= gf[i]
            }
        }
        frameSynthesis(out, outOff)
        return vadProb
    }

    // ------------------------------------------------------------------ denoise.c

    private fun biquad(x: FloatArray, off: Int) {
        var m0 = memHpX[0]
        var m1 = memHpX[1]
        for (i in 0 until FRAME_SIZE) {
            val xi = x[off + i]
            val yi = xi + m0
            m0 = (m1 + (B_HP0 * xi - A_HP0 * yi)).toFloat()
            m1 = (B_HP1 * xi - A_HP1 * yi).toFloat()
            hp[i] = yi
        }
        memHpX[0] = m0
        memHpX[1] = m1
    }

    private fun applyWindow(x: FloatArray) {
        for (i in 0 until FRAME_SIZE) {
            x[i] *= HALF_WINDOW[i]
            x[WINDOW_SIZE - 1 - i] *= HALF_WINDOW[i]
        }
    }

    private fun forwardTransform(out: FloatArray, input: FloatArray) {
        for (i in 0 until WINDOW_SIZE) {
            fftIn[2 * i] = input[i]
            fftIn[2 * i + 1] = 0f
        }
        FFT.forward(fftIn, fftOut)
        System.arraycopy(fftOut, 0, out, 0, 2 * FREQ_SIZE)
    }

    private fun inverseTransform(out: FloatArray, input: FloatArray) {
        System.arraycopy(input, 0, fftIn, 0, 2 * FREQ_SIZE)
        for (i in FREQ_SIZE until WINDOW_SIZE) {
            fftIn[2 * i] = fftIn[2 * (WINDOW_SIZE - i)]
            fftIn[2 * i + 1] = -fftIn[2 * (WINDOW_SIZE - i) + 1]
        }
        FFT.forward(fftIn, fftOut)
        out[0] = WINDOW_SIZE * fftOut[0]
        for (i in 1 until WINDOW_SIZE) out[i] = WINDOW_SIZE * fftOut[2 * (WINDOW_SIZE - i)]
    }

    private fun computeBandEnergy(bandE: FloatArray, x: FloatArray) {
        val sum = bandSum
        sum.fill(0f)
        for (i in 0 until NB_BANDS - 1) {
            val bandSize = (EBAND5MS[i + 1] - EBAND5MS[i]) shl FRAME_SIZE_SHIFT
            val base = EBAND5MS[i] shl FRAME_SIZE_SHIFT
            for (j in 0 until bandSize) {
                val frac = j.toFloat() / bandSize
                val re = x[2 * (base + j)]
                val im = x[2 * (base + j) + 1]
                var tmp = re * re
                tmp += im * im
                sum[i] += (1f - frac) * tmp
                sum[i + 1] += frac * tmp
            }
        }
        sum[0] *= 2f
        sum[NB_BANDS - 1] *= 2f
        System.arraycopy(sum, 0, bandE, 0, NB_BANDS)
    }

    private fun computeBandCorr(bandE: FloatArray, x: FloatArray, p: FloatArray) {
        val sum = bandSum
        sum.fill(0f)
        for (i in 0 until NB_BANDS - 1) {
            val bandSize = (EBAND5MS[i + 1] - EBAND5MS[i]) shl FRAME_SIZE_SHIFT
            val base = EBAND5MS[i] shl FRAME_SIZE_SHIFT
            for (j in 0 until bandSize) {
                val frac = j.toFloat() / bandSize
                val k = 2 * (base + j)
                var tmp = x[k] * p[k]
                tmp += x[k + 1] * p[k + 1]
                sum[i] += (1f - frac) * tmp
                sum[i + 1] += frac * tmp
            }
        }
        sum[0] *= 2f
        sum[NB_BANDS - 1] *= 2f
        System.arraycopy(sum, 0, bandE, 0, NB_BANDS)
    }

    /** interp_band_gain(); bins >= 400 are never written and stay 0, as in the C code. */
    private fun interpBandGain(gOut: FloatArray, bandE: FloatArray) {
        for (i in 0 until NB_BANDS - 1) {
            val bandSize = (EBAND5MS[i + 1] - EBAND5MS[i]) shl FRAME_SIZE_SHIFT
            val base = EBAND5MS[i] shl FRAME_SIZE_SHIFT
            for (j in 0 until bandSize) {
                val frac = j.toFloat() / bandSize
                gOut[base + j] = (1f - frac) * bandE[i] + frac * bandE[i + 1]
            }
        }
    }

    private fun dct(out: FloatArray, input: FloatArray) {
        for (i in 0 until NB_BANDS) {
            var sum = 0f
            for (j in 0 until NB_BANDS) sum += input[j] * DCT_TABLE[j * NB_BANDS + i]
            out[i] = (sum * SQRT_2_22).toFloat()
        }
    }

    private fun frameAnalysis() {
        System.arraycopy(analysisMem, 0, win, 0, FRAME_SIZE)
        System.arraycopy(hp, 0, win, FRAME_SIZE, FRAME_SIZE)
        System.arraycopy(hp, 0, analysisMem, 0, FRAME_SIZE)
        applyWindow(win)
        forwardTransform(bigX, win)
        computeBandEnergy(ex, bigX)
    }

    private fun computeFrameFeatures(): Boolean {
        frameAnalysis()
        System.arraycopy(pitchBuf, FRAME_SIZE, pitchBuf, 0, PITCH_BUF_SIZE - FRAME_SIZE)
        System.arraycopy(hp, 0, pitchBuf, PITCH_BUF_SIZE - FRAME_SIZE, FRAME_SIZE)
        pitchDownsample(pitchBuf, pitchLp, PITCH_BUF_SIZE)
        var pitchIndex = pitchSearch(pitchLp, PITCH_MAX_PERIOD shr 1, pitchLp, PITCH_FRAME_SIZE,
            PITCH_MAX_PERIOD - 3 * PITCH_MIN_PERIOD)
        pitchIndex = PITCH_MAX_PERIOD - pitchIndex
        val gain = removeDoubling(pitchLp, PITCH_MAX_PERIOD, PITCH_MIN_PERIOD, PITCH_FRAME_SIZE,
            pitchIndex, lastPeriod, lastGain)
        pitchIndex = removeDoublingT0
        lastPeriod = pitchIndex
        lastGain = gain
        System.arraycopy(pitchBuf, PITCH_BUF_SIZE - WINDOW_SIZE - pitchIndex, win, 0, WINDOW_SIZE)
        applyWindow(win)
        forwardTransform(bigP, win)
        computeBandEnergy(ep, bigP)
        computeBandCorr(exp, bigX, bigP)
        for (i in 0 until NB_BANDS) exp[i] = (exp[i] / sqrt(0.001 + ex[i] * ep[i])).toFloat()
        dct(tmpBands, exp)
        for (i in 0 until NB_DELTA_CEPS) features[NB_BANDS + 2 * NB_DELTA_CEPS + i] = tmpBands[i]
        features[NB_BANDS + 2 * NB_DELTA_CEPS] = (features[NB_BANDS + 2 * NB_DELTA_CEPS] - 1.3).toFloat()
        features[NB_BANDS + 2 * NB_DELTA_CEPS + 1] = (features[NB_BANDS + 2 * NB_DELTA_CEPS + 1] - 0.9).toFloat()
        features[NB_BANDS + 3 * NB_DELTA_CEPS] = (0.01 * (pitchIndex - 300)).toFloat()
        var logMax = -2f
        var follow = -2f
        var e = 0f
        for (i in 0 until NB_BANDS) {
            val l0 = StrictMath.log10(1e-2 + ex[i]).toFloat()
            // MAX16(logMax-7, MAX16(follow-1.5, Ly)) is evaluated in double in C.
            val a = follow - 1.5
            val inner = if (a > l0) a else l0.toDouble()
            val c = logMax - 7f
            val l = (if (c > inner) c.toDouble() else inner).toFloat()
            ly[i] = l
            logMax = if (logMax > l) logMax else l
            follow = (if (follow - 1.5 > l) follow - 1.5 else l.toDouble()).toFloat()
            e += ex[i]
        }
        if (e < 0.04) {
            // No audio: avoid messing up the state.
            features.fill(0f)
            return true
        }
        dct(features, ly)
        features[0] -= 12f
        features[1] -= 4f
        val c0 = memid * NB_BANDS
        val c1 = (if (memid < 1) CEPS_MEM + memid - 1 else memid - 1) * NB_BANDS
        val c2 = (if (memid < 2) CEPS_MEM + memid - 2 else memid - 2) * NB_BANDS
        System.arraycopy(features, 0, cepstralMem, c0, NB_BANDS)
        memid++
        for (i in 0 until NB_DELTA_CEPS) {
            features[i] = cepstralMem[c0 + i] + cepstralMem[c1 + i] + cepstralMem[c2 + i]
            features[NB_BANDS + i] = cepstralMem[c0 + i] - cepstralMem[c2 + i]
            features[NB_BANDS + NB_DELTA_CEPS + i] = cepstralMem[c0 + i] - 2f * cepstralMem[c1 + i] + cepstralMem[c2 + i]
        }
        // Spectral variability features.
        if (memid == CEPS_MEM) memid = 0
        var specVariability = 0f
        for (i in 0 until CEPS_MEM) {
            var mindist = 1e15f
            for (j in 0 until CEPS_MEM) {
                var dist = 0f
                for (k in 0 until NB_BANDS) {
                    val t = cepstralMem[i * NB_BANDS + k] - cepstralMem[j * NB_BANDS + k]
                    dist += t * t
                }
                if (j != i) mindist = if (mindist < dist) mindist else dist
            }
            specVariability += mindist
        }
        features[NB_BANDS + 3 * NB_DELTA_CEPS + 1] = (specVariability / CEPS_MEM - 2.1).toFloat()
        return false
    }

    private fun frameSynthesis(out: FloatArray, outOff: Int) {
        inverseTransform(win, bigX)
        applyWindow(win)
        for (i in 0 until FRAME_SIZE) out[outOff + i] = win[i] + synthesisMem[i]
        System.arraycopy(win, FRAME_SIZE, synthesisMem, 0, FRAME_SIZE)
    }

    private fun pitchFilter() {
        for (i in 0 until NB_BANDS) {
            var r: Float
            if (exp[i] > g[i]) {
                r = 1f
            } else {
                val e2 = exp[i] * exp[i]
                val g2 = g[i] * g[i]
                r = ((e2 * (1f - g2)) / (0.001 + g2 * (1f - e2))).toFloat()
            }
            val clamped = if (0f > r) 0f else r
            r = sqrt((if (1f < clamped) 1f else clamped).toDouble()).toFloat()
            r = (r * sqrt(ex[i] / (1e-8 + ep[i]))).toFloat()
            rBands[i] = r
        }
        interpBandGain(rf, rBands)
        for (i in 0 until FREQ_SIZE) {
            bigX[2 * i] += rf[i] * bigP[2 * i]
            bigX[2 * i + 1] += rf[i] * bigP[2 * i + 1]
        }
        computeBandEnergy(newE, bigX)
        for (i in 0 until NB_BANDS) norm[i] = sqrt(ex[i] / (1e-8 + newE[i])).toFloat()
        interpBandGain(normf, norm)
        for (i in 0 until FREQ_SIZE) {
            bigX[2 * i] *= normf[i]
            bigX[2 * i + 1] *= normf[i]
        }
    }

    // ------------------------------------------------------------------ pitch.c / celt_lpc.c

    private fun pitchDownsample(x: FloatArray, xLp: FloatArray, len: Int) {
        val half = len shr 1
        for (i in 1 until half) xLp[i] = 0.5f * (0.5f * (x[2 * i - 1] + x[2 * i + 1]) + x[2 * i])
        xLp[0] = 0.5f * (0.5f * x[1] + x[0])
        autocorr(xLp, ac, 4, half)
        // Noise floor -40 dB
        ac[0] *= 1.0001f
        // Lag windowing
        for (i in 1..4) ac[i] -= ac[i] * (0.008f * i) * (0.008f * i)
        lpcFromAc(lpc, ac, 4)
        var tmp = 1f
        for (i in 0 until 4) {
            tmp *= 0.9f
            lpc[i] = lpc[i] * tmp
        }
        // Add a zero
        val c1 = 0.8f
        lpc2[0] = lpc[0] + 0.8f
        lpc2[1] = lpc[1] + c1 * lpc[0]
        lpc2[2] = lpc[2] + c1 * lpc[1]
        lpc2[3] = lpc[3] + c1 * lpc[2]
        lpc2[4] = c1 * lpc[3]
        fir5(xLp, lpc2, half)
    }

    private fun fir5(x: FloatArray, num: FloatArray, n: Int) {
        val n0 = num[0]; val n1 = num[1]; val n2 = num[2]; val n3 = num[3]; val n4 = num[4]
        var m0 = 0f; var m1 = 0f; var m2 = 0f; var m3 = 0f; var m4 = 0f
        for (i in 0 until n) {
            val xi = x[i]
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

    private fun autocorr(x: FloatArray, acOut: FloatArray, lag: Int, n: Int) {
        val fastN = n - lag
        pitchXcorr(x, 0, x, 0, acOut, fastN, lag + 1)
        for (k in 0..lag) {
            var d = 0f
            for (i in k + fastN until n) d += x[i] * x[i - k]
            acOut[k] += d
        }
    }

    private fun lpcFromAc(out: FloatArray, acIn: FloatArray, p: Int) {
        var error = acIn[0]
        out.fill(0f, 0, p)
        if (acIn[0] != 0f) {
            for (i in 0 until p) {
                var rr = 0f
                for (j in 0 until i) rr += out[j] * acIn[i - j]
                rr += acIn[i + 1]
                val r = -rr / error
                out[i] = r
                for (j in 0 until ((i + 1) shr 1)) {
                    val t1 = out[j]
                    val t2 = out[i - 1 - j]
                    out[j] = t1 + r * t2
                    out[i - 1 - j] = t2 + r * t1
                }
                error -= r * r * error
                if (error < 0.001f * acIn[0]) break
            }
        }
    }

    /** Plain inner products in sequential order (what xcorr_kernel computes for each lag). */
    private fun pitchXcorr(x: FloatArray, xo: Int, y: FloatArray, yo: Int, out: FloatArray, len: Int, maxPitch: Int) {
        for (i in 0 until maxPitch) out[i] = innerProd(x, xo, y, yo + i, len)
    }

    private fun innerProd(x: FloatArray, xo: Int, y: FloatArray, yo: Int, n: Int): Float {
        var s = 0f
        for (i in 0 until n) s += x[xo + i] * y[yo + i]
        return s
    }

    private fun findBestPitch(xc: FloatArray, y: FloatArray, len: Int, maxPitch: Int, best: IntArray) {
        var syy = 1f
        bestNum[0] = -1f; bestNum[1] = -1f
        bestDen[0] = 0f; bestDen[1] = 0f
        best[0] = 0; best[1] = 1
        for (j in 0 until len) syy += y[j] * y[j]
        for (i in 0 until maxPitch) {
            if (xc[i] > 0) {
                var xcorr16 = xc[i]
                xcorr16 *= 1e-12f
                val num = xcorr16 * xcorr16
                if (num * bestDen[1] > bestNum[1] * syy) {
                    if (num * bestDen[0] > bestNum[0] * syy) {
                        bestNum[1] = bestNum[0]; bestDen[1] = bestDen[0]; best[1] = best[0]
                        bestNum[0] = num; bestDen[0] = syy; best[0] = i
                    } else {
                        bestNum[1] = num; bestDen[1] = syy; best[1] = i
                    }
                }
            }
            syy += y[i + len] * y[i + len] - y[i] * y[i]
            syy = if (1f > syy) 1f else syy
        }
    }

    /** rnn_pitch_search(): x_lp = xLp[xo...], y = y[0...]. Returns the pitch lag. */
    private fun pitchSearch(xLp: FloatArray, xo: Int, y: FloatArray, len: Int, maxPitch: Int): Int {
        val lag = len + maxPitch
        bestPitch[0] = 0; bestPitch[1] = 0
        // Downsample by 2 again
        for (j in 0 until (len shr 2)) xLp4[j] = xLp[xo + 2 * j]
        for (j in 0 until (lag shr 2)) yLp4[j] = y[2 * j]
        // Coarse search with 4x decimation
        pitchXcorr(xLp4, 0, yLp4, 0, xcorr, len shr 2, maxPitch shr 2)
        findBestPitch(xcorr, yLp4, len shr 2, maxPitch shr 2, bestPitch)
        // Finer search with 2x decimation
        for (i in 0 until (maxPitch shr 1)) {
            xcorr[i] = 0f
            if (abs(i - 2 * bestPitch[0]) > 2 && abs(i - 2 * bestPitch[1]) > 2) continue
            val sum = innerProd(xLp, xo, y, i, len shr 1)
            xcorr[i] = if (-1f > sum) -1f else sum
        }
        findBestPitch(xcorr, y, len shr 1, maxPitch shr 1, bestPitch)
        // Refine by pseudo-interpolation
        val offset: Int
        if (bestPitch[0] > 0 && bestPitch[0] < (maxPitch shr 1) - 1) {
            val a = xcorr[bestPitch[0] - 1]
            val b = xcorr[bestPitch[0]]
            val c = xcorr[bestPitch[0] + 1]
            offset = if ((c - a) > 0.7f * (b - a)) 1 else if ((a - c) > 0.7f * (b - c)) -1 else 0
        } else {
            offset = 0
        }
        return 2 * bestPitch[0] - offset
    }

    private fun computePitchGain(xy: Float, xx: Float, yy: Float): Float =
        (xy / sqrt((1f + xx * yy).toDouble())).toFloat()

    /** dual_inner_prod(x, x+o1, x+o2) over [x0, x0+n): results in pair[0], pair[1]. */
    private fun dualInnerProd(x: FloatArray, x0: Int, o1: Int, o2: Int, n: Int) {
        var a = 0f
        var b = 0f
        for (i in 0 until n) {
            a += x[x0 + i] * x[x0 + o1 + i]
            b += x[x0 + i] * x[x0 + o2 + i]
        }
        pair[0] = a
        pair[1] = b
    }

    private var removeDoublingT0 = 0

    /** rnn_remove_doubling(); the updated period is left in [removeDoublingT0]. */
    private fun removeDoubling(
        xs: FloatArray, maxPeriod0: Int, minPeriod0: Int, n0: Int, t0In: Int, prevPeriod0: Int, prevGain: Float,
    ): Float {
        val maxPeriod = maxPeriod0 / 2
        val minPeriod = minPeriod0 / 2
        var t0 = t0In / 2
        val prevPeriod = prevPeriod0 / 2
        val n = n0 / 2
        val x0 = maxPeriod // x += maxperiod
        if (t0 >= maxPeriod) t0 = maxPeriod - 1
        var t = t0
        dualInnerProd(xs, x0, 0, -t0, n)
        val xx = pair[0]
        var xy = pair[1]
        yyLookup[0] = xx
        var yy = xx
        for (i in 1..maxPeriod) {
            yy = yy + xs[x0 - i] * xs[x0 - i] - xs[x0 + n - i] * xs[x0 + n - i]
            yyLookup[i] = if (0f > yy) 0f else yy
        }
        yy = yyLookup[t0]
        var bestXy = xy
        var bestYy = yy
        val g0 = computePitchGain(xy, xx, yy)
        var gg = g0
        // Look for any pitch at T/k
        for (k in 2..15) {
            val t1 = (2 * t0 + k) / (2 * k)
            if (t1 < minPeriod) break
            // Look for another strong correlation at T1b
            val t1b = if (k == 2) {
                if (t1 + t0 > maxPeriod) t0 else t0 + t1
            } else {
                (2 * SECOND_CHECK[k] * t0 + k) / (2 * k)
            }
            dualInnerProd(xs, x0, -t1, -t1b, n)
            xy = 0.5f * (pair[0] + pair[1])
            yy = 0.5f * (yyLookup[t1] + yyLookup[t1b])
            val g1 = computePitchGain(xy, xx, yy)
            val cont = if (abs(t1 - prevPeriod) <= 1) prevGain
            else if (abs(t1 - prevPeriod) <= 2 && 5 * k * k < t0) 0.5f * prevGain
            else 0f
            var a = 0.7f * g0 - cont
            var thresh = if (0.3f > a) 0.3f else a
            // Bias against very high pitch (very short period) to avoid false-positives
            // due to short-term correlation
            if (t1 < 3 * minPeriod) {
                a = 0.85f * g0 - cont
                thresh = if (0.4f > a) 0.4f else a
            } else if (t1 < 2 * minPeriod) {
                a = 0.9f * g0 - cont
                thresh = if (0.5f > a) 0.5f else a
            }
            if (g1 > thresh) {
                bestXy = xy
                bestYy = yy
                t = t1
                gg = g1
            }
        }
        bestXy = if (0f > bestXy) 0f else bestXy
        var pg = if (bestYy <= bestXy) 1f else bestXy / (bestYy + 1f)
        val xc0 = innerProd(xs, x0, xs, x0 - (t - 1), n)
        val xc1 = innerProd(xs, x0, xs, x0 - t, n)
        val xc2 = innerProd(xs, x0, xs, x0 - (t + 1), n)
        val offset = if ((xc2 - xc0) > 0.7f * (xc1 - xc0)) 1
        else if ((xc0 - xc2) > 0.7f * (xc1 - xc2)) -1
        else 0
        if (pg > gg) pg = gg
        var tOut = 2 * t + offset
        if (tOut < minPeriod0) tOut = minPeriod0
        removeDoublingT0 = tOut
        return pg
    }

    // ------------------------------------------------------------------ rnn.c

    private fun computeDense(layer: RnNoiseModel.Dense, output: FloatArray, input: FloatArray) {
        val m = layer.nbInputs
        val n = layer.nbNeurons
        val w = layer.weights
        for (i in 0 until n) {
            var sum = layer.bias[i]
            val row = i * m
            for (j in 0 until m) sum += w[row + j] * input[j]
            output[i] = WEIGHTS_SCALE * sum
        }
        when (layer.activation) {
            RnNoiseModel.ACTIVATION_SIGMOID -> for (i in 0 until n) output[i] = sigmoidApprox(output[i])
            RnNoiseModel.ACTIVATION_TANH -> for (i in 0 until n) output[i] = tansigApprox(output[i])
            else -> for (i in 0 until n) output[i] = relu(output[i])
        }
    }

    private fun computeGru(gru: RnNoiseModel.Gru, state: FloatArray, input: FloatArray) {
        val m = gru.nbInputs
        val n = gru.nbNeurons
        val wi = gru.inputWeights
        val wr = gru.recurrentWeights
        val bias = gru.bias
        for (i in 0 until n) {
            // Compute update gate.
            var sum = bias[i]
            val ri = i * m
            for (j in 0 until m) sum += wi[ri + j] * input[j]
            val rr = i * n
            for (j in 0 until n) sum += wr[rr + j] * state[j]
            gz[i] = sigmoidApprox(WEIGHTS_SCALE * sum)
        }
        for (i in 0 until n) {
            // Compute reset gate.
            var sum = bias[n + i]
            val ri = (n + i) * m
            for (j in 0 until m) sum += wi[ri + j] * input[j]
            val rr = (n + i) * n
            for (j in 0 until n) sum += wr[rr + j] * state[j]
            gr[i] = sigmoidApprox(WEIGHTS_SCALE * sum)
        }
        for (i in 0 until n) {
            // Compute output.
            var sum = bias[2 * n + i]
            val ri = (2 * n + i) * m
            for (j in 0 until m) sum += wi[ri + j] * input[j]
            val rr = (2 * n + i) * n
            for (j in 0 until n) sum += wr[rr + j] * state[j] * gr[j]
            sum = when (gru.activation) {
                RnNoiseModel.ACTIVATION_SIGMOID -> sigmoidApprox(WEIGHTS_SCALE * sum)
                RnNoiseModel.ACTIVATION_TANH -> tansigApprox(WEIGHTS_SCALE * sum)
                else -> relu(WEIGHTS_SCALE * sum)
            }
            gh[i] = gz[i] * state[i] + (1f - gz[i]) * sum
        }
        System.arraycopy(gh, 0, state, 0, n)
    }

    private fun computeRnn() {
        val md = model
        computeDense(md.inputDense, denseOut, features)
        computeGru(md.vadGru, vadGruState, denseOut)
        computeDense(md.vadOutput, vadOut, vadGruState)
        val nd = md.inputDense.nbNeurons
        val nv = md.vadGru.nbNeurons
        val nn = md.noiseGru.nbNeurons
        System.arraycopy(denseOut, 0, noiseInput, 0, nd)
        System.arraycopy(vadGruState, 0, noiseInput, nd, nv)
        System.arraycopy(features, 0, noiseInput, nd + nv, NB_FEATURES)
        computeGru(md.noiseGru, noiseGruState, noiseInput)
        System.arraycopy(vadGruState, 0, denoiseInput, 0, nv)
        System.arraycopy(noiseGruState, 0, denoiseInput, nv, nn)
        System.arraycopy(features, 0, denoiseInput, nv + nn, NB_FEATURES)
        computeGru(md.denoiseGru, denoiseGruState, denoiseInput)
        computeDense(md.denoiseOutput, g, denoiseGruState)
    }

    companion object {
        const val FRAME_SIZE = 480
        const val SAMPLE_RATE = 48000
        internal const val NB_BANDS = 22
        internal const val NB_FEATURES = 42
        private const val FRAME_SIZE_SHIFT = 2
        private const val WINDOW_SIZE = 2 * FRAME_SIZE
        private const val FREQ_SIZE = FRAME_SIZE + 1
        private const val PITCH_MIN_PERIOD = 60
        private const val PITCH_MAX_PERIOD = 768
        private const val PITCH_FRAME_SIZE = 960
        private const val PITCH_BUF_SIZE = PITCH_MAX_PERIOD + PITCH_FRAME_SIZE
        private const val CEPS_MEM = 8
        private const val NB_DELTA_CEPS = 6
        private const val MAX_NEURONS = 128
        private const val WEIGHTS_SCALE = 1f / 256
        private const val M_PI = 3.14159265358979323846

        // biquad coefficients: float constants used in double arithmetic, as in C.
        private const val A_HP0 = (-1.99599f).toDouble()
        private const val A_HP1 = (0.99600f).toDouble()
        private const val B_HP0 = -2.0
        private const val B_HP1 = 1.0

        private val SQRT_2_22 = sqrt(2.0 / 22)
        private val EBAND5MS = intArrayOf(0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 20, 24, 28, 34, 40, 48, 60, 78, 100)
        private val SECOND_CHECK = intArrayOf(0, 0, 3, 2, 3, 2, 5, 2, 3, 2, 3, 2, 5, 2, 3, 2)

        private val FFT = KissFft(WINDOW_SIZE)
        private val HALF_WINDOW = FloatArray(FRAME_SIZE) { i ->
            val s = StrictMath.sin(0.5 * M_PI * (i + 0.5) / FRAME_SIZE)
            StrictMath.sin(0.5 * M_PI * s * s).toFloat()
        }
        private val DCT_TABLE = FloatArray(NB_BANDS * NB_BANDS).also { t ->
            for (i in 0 until NB_BANDS) for (j in 0 until NB_BANDS) {
                var v = StrictMath.cos((i + 0.5) * j * M_PI / NB_BANDS).toFloat()
                if (j == 0) v = (v * sqrt(0.5)).toFloat()
                t[i * NB_BANDS + j] = v
            }
        }

        private fun relu(x: Float) = if (x < 0f) 0f else x

        private fun sigmoidApprox(x: Float): Float = (0.5 + 0.5 * tansigApprox((0.5 * x).toFloat())).toFloat()

        private fun tansigApprox(x0: Float): Float {
            var x = x0
            // Tests are reversed to catch NaNs
            if (!(x < 8f)) return 1f
            if (!(x > -8f)) return -1f
            if (x != x) return 0f
            var sign = 1f
            if (x < 0f) {
                x = -x
                sign = -1f
            }
            val i = floor((0.5f + 25 * x).toDouble()).toInt()
            x -= 0.04f * i
            var y = TANSIG_TABLE[i]
            val dy = 1f - y * y
            y += x * dy * (1f - y * x)
            return sign * y
        }

        private val TANSIG_TABLE = floatArrayOf(
            0.000000f, 0.039979f, 0.079830f, 0.119427f, 0.158649f,
            0.197375f, 0.235496f, 0.272905f, 0.309507f, 0.345214f,
            0.379949f, 0.413644f, 0.446244f, 0.477700f, 0.507977f,
            0.537050f, 0.564900f, 0.591519f, 0.616909f, 0.641077f,
            0.664037f, 0.685809f, 0.706419f, 0.725897f, 0.744277f,
            0.761594f, 0.777888f, 0.793199f, 0.807569f, 0.821040f,
            0.833655f, 0.845456f, 0.856485f, 0.866784f, 0.876393f,
            0.885352f, 0.893698f, 0.901468f, 0.908698f, 0.915420f,
            0.921669f, 0.927473f, 0.932862f, 0.937863f, 0.942503f,
            0.946806f, 0.950795f, 0.954492f, 0.957917f, 0.961090f,
            0.964028f, 0.966747f, 0.969265f, 0.971594f, 0.973749f,
            0.975743f, 0.977587f, 0.979293f, 0.980869f, 0.982327f,
            0.983675f, 0.984921f, 0.986072f, 0.987136f, 0.988119f,
            0.989027f, 0.989867f, 0.990642f, 0.991359f, 0.992020f,
            0.992631f, 0.993196f, 0.993718f, 0.994199f, 0.994644f,
            0.995055f, 0.995434f, 0.995784f, 0.996108f, 0.996407f,
            0.996682f, 0.996937f, 0.997172f, 0.997389f, 0.997590f,
            0.997775f, 0.997946f, 0.998104f, 0.998249f, 0.998384f,
            0.998508f, 0.998623f, 0.998728f, 0.998826f, 0.998916f,
            0.999000f, 0.999076f, 0.999147f, 0.999213f, 0.999273f,
            0.999329f, 0.999381f, 0.999428f, 0.999472f, 0.999513f,
            0.999550f, 0.999585f, 0.999617f, 0.999646f, 0.999673f,
            0.999699f, 0.999722f, 0.999743f, 0.999763f, 0.999781f,
            0.999798f, 0.999813f, 0.999828f, 0.999841f, 0.999853f,
            0.999865f, 0.999875f, 0.999885f, 0.999893f, 0.999902f,
            0.999909f, 0.999916f, 0.999923f, 0.999929f, 0.999934f,
            0.999939f, 0.999944f, 0.999948f, 0.999952f, 0.999956f,
            0.999959f, 0.999962f, 0.999965f, 0.999968f, 0.999970f,
            0.999973f, 0.999975f, 0.999977f, 0.999978f, 0.999980f,
            0.999982f, 0.999983f, 0.999984f, 0.999986f, 0.999987f,
            0.999988f, 0.999989f, 0.999990f, 0.999990f, 0.999991f,
            0.999992f, 0.999992f, 0.999993f, 0.999994f, 0.999994f,
            0.999994f, 0.999995f, 0.999995f, 0.999996f, 0.999996f,
            0.999996f, 0.999997f, 0.999997f, 0.999997f, 0.999997f,
            0.999997f, 0.999998f, 0.999998f, 0.999998f, 0.999998f,
            0.999998f, 0.999998f, 0.999999f, 0.999999f, 0.999999f,
            0.999999f, 0.999999f, 0.999999f, 0.999999f, 0.999999f,
            0.999999f, 0.999999f, 0.999999f, 0.999999f, 0.999999f,
            1.000000f, 1.000000f, 1.000000f, 1.000000f, 1.000000f,
            1.000000f, 1.000000f, 1.000000f, 1.000000f, 1.000000f,
            1.000000f,
        )
    }
}

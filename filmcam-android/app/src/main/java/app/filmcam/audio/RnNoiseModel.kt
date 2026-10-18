/* Weights and layer layout port of RNNoise v0.1.1 (rnn.h / rnn_data.h).
 * Copyright (c) 2017 Jean-Marc Valin, 2017 Mozilla, 2018 Gregor Richards.
 * BSD-3-Clause, see assets/rnnoise/COPYING. */
package app.filmcam.audio

import android.content.Context
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * The RNNoise network weights, read from the `rnnoise/model.bin` asset written by
 * tools/rnnoise/convert_weights.py from the original src/rnn_data.c (int8 weights, scaled by
 * 1/256 at run time exactly like the C code).
 *
 * Immutable after loading: one instance can be shared by any number of [RnNoise] states on any
 * threads.
 */
class RnNoiseModel private constructor(
    internal val inputDense: Dense,
    internal val vadGru: Gru,
    internal val noiseGru: Gru,
    internal val denoiseGru: Gru,
    internal val denoiseOutput: Dense,
    internal val vadOutput: Dense,
) {
    /**
     * A dense layer. Weights are stored transposed relative to the C file (row i = neuron i,
     * contiguous over the inputs) so the per-neuron dot product walks memory linearly; the
     * summation order is the same as compute_dense() in rnn.c.
     */
    internal class Dense(val nbInputs: Int, val nbNeurons: Int, val activation: Int, val bias: FloatArray, val weights: FloatArray)

    /**
     * A GRU layer. [inputWeights] row (g*N + i) holds gate g (0 update, 1 reset, 2 output) of
     * neuron i over the M inputs; [recurrentWeights] the same over the N state values.
     */
    internal class Gru(
        val nbInputs: Int, val nbNeurons: Int, val activation: Int,
        val bias: FloatArray, val inputWeights: FloatArray, val recurrentWeights: FloatArray,
    )

    companion object {
        const val ACTIVATION_TANH = 0
        const val ACTIVATION_SIGMOID = 1
        const val ACTIVATION_RELU = 2
        const val ASSET_PATH = "rnnoise/model.bin"

        /** Loads the bundled model from the app assets. */
        fun fromAssets(context: Context): RnNoiseModel =
            context.assets.open(ASSET_PATH).use { load(it.readBytes()) }

        /** Parses a model.bin produced by tools/rnnoise/convert_weights.py. */
        fun load(bytes: ByteArray): RnNoiseModel {
            val b = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
            val magic = ByteArray(4).also { b.get(it) }
            require(String(magic, Charsets.US_ASCII) == "RNNM") { "not an RNNoise model" }
            require(b.int == 1) { "unsupported RNNoise model version" }
            val count = b.int
            require(count == 6) { "expected 6 layers, got $count" }
            val layers = ArrayList<Any>(count)
            repeat(count) {
                val kind = b.int
                val m = b.int
                val n = b.int
                val act = b.int
                require(m in 1..1024 && n in 1..128 && act in 0..2) { "bad layer header" }
                when (kind) {
                    0 -> {
                        val bias = readInt8(b, n)
                        val w = readInt8(b, m * n)
                        val wt = FloatArray(m * n)
                        for (i in 0 until n) for (j in 0 until m) wt[i * m + j] = w[j * n + i]
                        layers += Dense(m, n, act, bias, wt)
                    }
                    1 -> {
                        val stride = 3 * n
                        val bias = readInt8(b, stride)
                        val w = readInt8(b, m * stride)
                        val rw = readInt8(b, n * stride)
                        val wt = FloatArray(m * stride)
                        val rwt = FloatArray(n * stride)
                        for (r in 0 until stride) {
                            for (j in 0 until m) wt[r * m + j] = w[j * stride + r]
                            for (j in 0 until n) rwt[r * n + j] = rw[j * stride + r]
                        }
                        layers += Gru(m, n, act, bias, wt, rwt)
                    }
                    else -> throw IllegalArgumentException("bad layer kind $kind")
                }
            }
            require(!b.hasRemaining()) { "trailing bytes in model" }
            val model = RnNoiseModel(
                layers[0] as Dense, layers[1] as Gru, layers[2] as Gru,
                layers[3] as Gru, layers[4] as Dense, layers[5] as Dense,
            )
            model.validate()
            return model
        }

        private fun readInt8(b: ByteBuffer, n: Int): FloatArray = FloatArray(n) { b.get().toFloat() }
    }

    private fun validate() {
        // The wiring used by compute_rnn() in rnn.c.
        require(inputDense.nbInputs == RnNoise.NB_FEATURES)
        require(vadGru.nbInputs == inputDense.nbNeurons)
        require(vadOutput.nbInputs == vadGru.nbNeurons && vadOutput.nbNeurons == 1)
        require(noiseGru.nbInputs == inputDense.nbNeurons + vadGru.nbNeurons + RnNoise.NB_FEATURES)
        require(denoiseGru.nbInputs == vadGru.nbNeurons + noiseGru.nbNeurons + RnNoise.NB_FEATURES)
        require(denoiseOutput.nbInputs == denoiseGru.nbNeurons && denoiseOutput.nbNeurons == RnNoise.NB_BANDS)
    }
}

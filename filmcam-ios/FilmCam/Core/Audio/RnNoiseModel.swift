/* Weights and layer layout port of RNNoise v0.1.1 (rnn.h / rnn_data.h).
 * Copyright (c) 2017 Jean-Marc Valin, 2017 Mozilla, 2018 Gregor Richards.
 * BSD-3-Clause, see rnnoise/COPYING. */
import Foundation

/// The RNNoise network weights, read from the `rnnoise/model.bin` resource written by
/// tools/rnnoise/convert_weights.py from the original src/rnn_data.c (int8 weights, scaled by
/// 1/256 at run time exactly like the C code).
///
/// Immutable after loading: one instance can be shared by any number of `RnNoise` states on any
/// threads.
final class RnNoiseModel: @unchecked Sendable {
    /// A model file that couldn't be read, with why.
    struct LoadError: Error, CustomStringConvertible {
        let description: String
    }

    /// A dense layer. Weights are stored transposed relative to the C file (row i = neuron i,
    /// contiguous over the inputs) so the per-neuron dot product walks memory linearly; the
    /// summation order is the same as compute_dense() in rnn.c.
    final class Dense {
        let nbInputs: Int
        let nbNeurons: Int
        let activation: Int
        let bias: UnsafeMutablePointer<Float>
        let weights: UnsafeMutablePointer<Float>

        init(_ m: Int, _ n: Int, _ act: Int, bias: [Float], weights: [Float]) {
            nbInputs = m; nbNeurons = n; activation = act
            self.bias = RnNoiseModel.copy(bias)
            self.weights = RnNoiseModel.copy(weights)
        }

        deinit { bias.deallocate(); weights.deallocate() }
    }

    /// A GRU layer. `inputWeights` row (g*N + i) holds gate g (0 update, 1 reset, 2 output) of
    /// neuron i over the M inputs; `recurrentWeights` the same over the N state values.
    final class Gru {
        let nbInputs: Int
        let nbNeurons: Int
        let activation: Int
        let bias: UnsafeMutablePointer<Float>
        let inputWeights: UnsafeMutablePointer<Float>
        let recurrentWeights: UnsafeMutablePointer<Float>

        init(_ m: Int, _ n: Int, _ act: Int, bias: [Float], inputWeights: [Float], recurrentWeights: [Float]) {
            nbInputs = m; nbNeurons = n; activation = act
            self.bias = RnNoiseModel.copy(bias)
            self.inputWeights = RnNoiseModel.copy(inputWeights)
            self.recurrentWeights = RnNoiseModel.copy(recurrentWeights)
        }

        deinit { bias.deallocate(); inputWeights.deallocate(); recurrentWeights.deallocate() }
    }

    static let activationTanh = 0
    static let activationSigmoid = 1
    static let activationRelu = 2

    /// Where the weights live in the app bundle:
    /// `Bundle.main.url(forResource: RnNoiseModel.resourceName, withExtension: RnNoiseModel.resourceExtension,
    /// subdirectory: RnNoiseModel.resourceSubdirectory)`.
    static let resourceName = "model"
    static let resourceExtension = "bin"
    static let resourceSubdirectory = "rnnoise"

    let inputDense: Dense
    let vadGru: Gru
    let noiseGru: Gru
    let denoiseGru: Gru
    let denoiseOutput: Dense
    let vadOutput: Dense

    /// Loads a model.bin from a file URL (in the app, the bundled `rnnoise/model.bin`).
    convenience init(contentsOf url: URL) throws {
        try self.init(data: try Data(contentsOf: url))
    }

    /// Parses a model.bin produced by tools/rnnoise/convert_weights.py.
    init(data: Data) throws {
        let bytes = [UInt8](data)
        var pos = 0
        func fail(_ why: String) -> LoadError { LoadError(description: why) }
        func int32() throws -> Int {
            guard pos + 4 <= bytes.count else { throw fail("truncated RNNoise model") }
            let v = UInt32(bytes[pos]) | UInt32(bytes[pos + 1]) << 8 | UInt32(bytes[pos + 2]) << 16 | UInt32(bytes[pos + 3]) << 24
            pos += 4
            return Int(Int32(bitPattern: v))
        }
        func int8s(_ n: Int) throws -> [Float] {
            guard pos + n <= bytes.count else { throw fail("truncated RNNoise model") }
            var out = [Float](repeating: 0, count: n)
            for i in 0..<n { out[i] = Float(Int8(bitPattern: bytes[pos + i])) }
            pos += n
            return out
        }
        guard bytes.count >= 4, bytes[0] == 0x52, bytes[1] == 0x4E, bytes[2] == 0x4E, bytes[3] == 0x4D else {
            throw fail("not an RNNoise model")
        }
        pos = 4
        guard try int32() == 1 else { throw fail("unsupported RNNoise model version") }
        let count = try int32()
        guard count == 6 else { throw fail("expected 6 layers, got \(count)") }
        var layers: [AnyObject] = []
        for _ in 0..<count {
            let kind = try int32()
            let m = try int32()
            let n = try int32()
            let act = try int32()
            guard (1...1024).contains(m), (1...128).contains(n), (0...2).contains(act) else { throw fail("bad layer header") }
            switch kind {
            case 0:
                let bias = try int8s(n)
                let w = try int8s(m * n)
                var wt = [Float](repeating: 0, count: m * n)
                for i in 0..<n { for j in 0..<m { wt[i * m + j] = w[j * n + i] } }
                layers.append(Dense(m, n, act, bias: bias, weights: wt))
            case 1:
                let stride = 3 * n
                let bias = try int8s(stride)
                let w = try int8s(m * stride)
                let rw = try int8s(n * stride)
                var wt = [Float](repeating: 0, count: m * stride)
                var rwt = [Float](repeating: 0, count: n * stride)
                for r in 0..<stride {
                    for j in 0..<m { wt[r * m + j] = w[j * stride + r] }
                    for j in 0..<n { rwt[r * n + j] = rw[j * stride + r] }
                }
                layers.append(Gru(m, n, act, bias: bias, inputWeights: wt, recurrentWeights: rwt))
            default:
                throw fail("bad layer kind \(kind)")
            }
        }
        guard pos == bytes.count else { throw fail("trailing bytes in model") }
        guard let l0 = layers[0] as? Dense, let l1 = layers[1] as? Gru, let l2 = layers[2] as? Gru,
              let l3 = layers[3] as? Gru, let l4 = layers[4] as? Dense, let l5 = layers[5] as? Dense
        else { throw fail("unexpected layer order") }
        inputDense = l0; vadGru = l1; noiseGru = l2; denoiseGru = l3; denoiseOutput = l4; vadOutput = l5

        // The wiring used by compute_rnn() in rnn.c.
        let nf = RnNoise.nbFeatures
        guard inputDense.nbInputs == nf,
              vadGru.nbInputs == inputDense.nbNeurons,
              vadOutput.nbInputs == vadGru.nbNeurons && vadOutput.nbNeurons == 1,
              noiseGru.nbInputs == inputDense.nbNeurons + vadGru.nbNeurons + nf,
              denoiseGru.nbInputs == vadGru.nbNeurons + noiseGru.nbNeurons + nf,
              denoiseOutput.nbInputs == denoiseGru.nbNeurons && denoiseOutput.nbNeurons == RnNoise.nbBands
        else { throw fail("RNNoise model layers don't fit together") }
    }

    fileprivate static func copy(_ a: [Float]) -> UnsafeMutablePointer<Float> {
        let p = UnsafeMutablePointer<Float>.allocate(capacity: max(a.count, 1))
        a.withUnsafeBufferPointer { src in
            if let base = src.baseAddress { p.initialize(from: base, count: a.count) }
        }
        return p
    }
}

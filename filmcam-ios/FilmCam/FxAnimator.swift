import Foundation

/// Per-frame randomness (a port of FrameFx.kt): gate weave, slips, flicker, light leaks, prism
/// flare, tape tracking and scratches.
struct FrameFx {
    var seed: UInt32 = 0
    var time: Float = 0
    var gain: [Float] = [1, 1, 1]
    var weaveX: Float = 0
    var weaveY: Float = 0
    var slip: Float = 0
    var leakPos = [Float](repeating: 0, count: 6)
    var leakRadius = [Float](repeating: 0, count: 3)
    var leakColor = [Float](repeating: 0, count: 9)
    var burnEdge: Int32 = 0
    var burnStrength: Float = 0
    var burnPhase: Float = 0
    var scratchX: [Float] = [-1, -1]
    var scratchAlpha: Float = 0
    var prismBand: [Float] = [0, 0, 1, 0]
    var prismGhost: [Float] = [0, 0]
    var tracking: Float = 0
    var rollBurn: Float = 0
}

final class FxAnimator {
    static let maxWeave: Float = 0.006

    private struct Blob {
        var edge: Int, along: Float, radius: Float, color: [Float], speed: Float, phase: Float, pulse: Float
    }

    private var rng = SystemRandomNumberGenerator()
    private func rf() -> Float { Float.random(in: 0..<1, using: &rng) }
    private func ri(_ n: Int) -> Int { Int.random(in: 0..<n, using: &rng) }

    private let palette: [[Float]] = [
        [1.0, 0.36, 0.08], [1.0, 0.56, 0.16], [0.95, 0.14, 0.08], [1.0, 0.78, 0.38], [0.92, 0.22, 0.42],
    ]
    private var blobs: [Blob] = []
    private var burnEdge = 0
    private var burnPhase: Float = 0
    private var weavePhase: [Float] = []
    private var scratchLife = [0, 0]
    private var scratchPos: [Float] = [-1, -1]
    private var slipFrames = 0
    private var slipAmount: Float = 0
    private var prismAngle: Float = 0
    private var prismOffset: Float = 0
    private var colorPhase: [Float] = []

    init() {
        weavePhase = (0..<4).map { _ in rf() * 6.28 }
        colorPhase = (0..<3).map { _ in rf() * 6.28 }
        reshuffle()
    }

    /// A new leak and prism layout.
    func reshuffle() {
        let edgeA = ri(4)
        let edgeB = rf() < 0.5 ? edgeA : ri(4)
        blobs = (0..<3).map { i in
            Blob(edge: i == 2 ? edgeB : edgeA, along: 0.2 + rf() * 0.6, radius: 0.28 + rf() * 0.32,
                 color: palette[ri(palette.count)], speed: 0.08 + rf() * 0.18, phase: rf() * 6.28, pulse: 0.15 + rf() * 0.3)
        }
        burnEdge = ri(4)
        burnPhase = rf() * 10
        prismAngle = rf() * 6.28
        prismOffset = rf()
    }

    func next(_ look: Look, time: Float, _ out: inout FrameFx) {
        out.seed = UInt32.random(in: 1..<UInt32(Int32.max), using: &rng)
        out.time = time

        let f = look.flicker
        let g = 1 + f * (0.09 * (rf() - 0.5) * 2 + 0.035 * sinf(time * 9.1 + weavePhase[0]))
        for c in 0..<3 {
            let cf = look.colorFlicker * (0.05 * (rf() - 0.5) * 2 + 0.03 * sinf(time * (2.3 + Float(c)) + colorPhase[c]))
            out.gain[c] = g * (1 + cf)
        }

        let w = look.gateWeave
        let slowX = 0.6 * sinf(time * 1.3 + weavePhase[1]) + 0.4 * sinf(time * 3.7 + weavePhase[2])
        let slowY = 0.7 * sinf(time * 0.9 + weavePhase[3]) + 0.3 * sinf(time * 5.3)
        out.weaveX = w * Self.maxWeave * (0.55 * slowX + 0.45 * (rf() - 0.5) * 2) * 0.6
        out.weaveY = w * Self.maxWeave * (0.55 * slowY + 0.45 * (rf() - 0.5) * 2)

        if slipFrames > 0 {
            slipFrames -= 1
            slipAmount *= 0.55
        } else if rf() < look.frameSlip * 0.025 {
            slipFrames = 2 + ri(4)
            slipAmount = (0.08 + rf() * 0.35) * (Bool.random(using: &rng) ? 1 : -1)
        } else {
            slipAmount = 0
        }
        out.slip = slipAmount

        let envelope = 0.55 + 0.45 * sinf(time * 0.35 + blobs[0].phase)
        for i in 0..<3 {
            let b = blobs[i]
            let along = min(max(b.along + 0.22 * sinf(time * b.speed * 2 * .pi * 0.3 + b.phase), -0.1), 1.1)
            let inset = -0.08 + 0.1 * sinf(time * b.speed + b.phase * 1.7)
            let (x, y): (Float, Float)
            switch b.edge {
            case 0: (x, y) = (inset, along)
            case 1: (x, y) = (1 - inset, along)
            case 2: (x, y) = (along, inset)
            default: (x, y) = (along, 1 - inset)
            }
            out.leakPos[i * 2] = x
            out.leakPos[i * 2 + 1] = y
            out.leakRadius[i] = b.radius * (1 + 0.15 * sinf(time * 0.7 + b.phase))
            let k = envelope * (1 - b.pulse + b.pulse * sinf(time * 1.9 * b.speed * 6 + b.phase))
            for c in 0..<3 { out.leakColor[i * 3 + c] = b.color[c] * k }
        }
        out.burnEdge = Int32(burnEdge)
        out.burnPhase = burnPhase + time * 0.6
        out.burnStrength = 0.5 + 0.5 * abs(sinf(time * 0.27 + burnPhase))

        let a = prismAngle + 0.15 * sinf(time * 0.3)
        let off = 0.15 + 0.2 * prismOffset + 0.04 * sinf(time * 0.5)
        out.prismBand = [0.5 + cosf(a) * 0.5 * (1 - off), 0.5 + sinf(a) * 0.5 * (1 - off), cosf(a), sinf(a)]
        out.prismGhost = [cosf(a + 1.2) * 0.06, sinf(a + 1.2) * 0.06]

        out.tracking = fmodf(time * 0.06 + weavePhase[2], 1)

        let d = look.dust
        for i in 0..<2 {
            if scratchLife[i] > 0 {
                scratchLife[i] -= 1
                scratchPos[i] = min(max(scratchPos[i] + (rf() - 0.5) * 0.004, 0.02), 0.98)
            } else if rf() < d * 0.06 {
                scratchLife[i] = 4 + ri(36)
                scratchPos[i] = 0.05 + rf() * 0.9
            } else {
                scratchPos[i] = -1
            }
            out.scratchX[i] = scratchPos[i]
        }
        out.scratchAlpha = d
    }
}

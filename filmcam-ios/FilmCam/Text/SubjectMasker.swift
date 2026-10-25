import CoreGraphics
import CoreVideo
import Foundation
import Vision

/// Cuts the subject out of frames so text can sit behind it (SubjectMasker.kt on Android, with
/// Vision in place of MediaPipe). By default every person is the subject: Vision's person
/// segmentation, balanced for the viewfinder and accurate for stills. A tap picks one subject
/// instead (a person, a pet, a thing): Vision's foreground instances, the one under the
/// finger, followed from frame to frame by its overlap with the last cut-out.
///
/// The models run on a worker queue; the render queue hands over small upright frames and
/// takes the newest matte, never waiting for one. Stills and offline renders run in step
/// ([process]). [onStatus] says what is going on, so a failure is visible instead of silent.
final class SubjectMasker {
    /// One matte: [w]x[h] bytes, 0 background .. 255 subject, first row at the top.
    struct Matte {
        let pixels: [UInt8]
        let w: Int
        let h: Int
        let seq: Int64
        let empty: Bool
    }

    private enum Target {
        /// Every person in the frame (nothing picked yet).
        case allPeople
        /// One foreground instance, followed by where it last was (a mask in the instance
        /// map's own size).
        case one(region: [Bool], w: Int, h: Int)
    }

    private let queue = DispatchQueue(label: "filmcam.subject", qos: .userInitiated)
    private let lock = NSLock()
    private var busy = false
    private var newest: Matte?
    private var pendingPick: CGPoint?
    private var pendingReset = false
    // Worker state (on [queue]).
    private var target: Target = .allPeople
    private var seq: Int64 = 0
    private var lastStatus = ""
    /// One request for the live frames: it smooths the cut-out from one frame to the next.
    private lazy var livePeople: VNGeneratePersonSegmentationRequest = {
        let r = VNGeneratePersonSegmentationRequest()
        r.qualityLevel = .balanced
        r.outputPixelFormat = kCVPixelFormatType_OneComponent8
        return r
    }()

    /// What the subject is now ("People", "Subject"), or nil when a tap found nothing. Main thread.
    var onSubject: ((String?) -> Void)?
    /// What the cut-out is doing ("Cutting out people", "No person in view", an error). Main thread.
    var onStatus: ((String) -> Void)?

    var idle: Bool { lock.lock(); defer { lock.unlock() }; return !busy }

    /// Newest matte.
    var latest: Matte? { lock.lock(); defer { lock.unlock() }; return newest }

    /// Forgets the last matte (text no longer behind anything).
    func clear() { lock.lock(); newest = nil; lock.unlock() }

    /// Picks the subject under ([x], [y]): upright picture space, 0..1, y down.
    func pick(_ x: Float, _ y: Float) { lock.lock(); pendingPick = CGPoint(x: CGFloat(x), y: CGFloat(y)); lock.unlock() }

    /// Back to every person in the frame.
    func reset() { lock.lock(); pendingReset = true; lock.unlock() }

    /// Starts cutting out an RGBA frame ([w]x[h], first row at the top) on the worker, if it
    /// is free; the matte lands in [latest] when done.
    func submit(_ rgba: [UInt8], _ w: Int, _ h: Int) {
        lock.lock()
        if busy { lock.unlock(); return }
        busy = true
        lock.unlock()
        queue.async {
            self.run(rgba, w, h, accurate: false)
            self.lock.lock(); self.busy = false; self.lock.unlock()
        }
    }

    /// Cuts out a frame now (a still, or a frame of an offline render), after any live frame
    /// in flight. [accurate]: the slow, fine person model.
    @discardableResult
    func process(_ rgba: [UInt8], _ w: Int, _ h: Int, accurate: Bool) -> Matte? {
        queue.sync { run(rgba, w, h, accurate: accurate) }
        return latest
    }

    // MARK: - Worker

    private func run(_ rgba: [UInt8], _ w: Int, _ h: Int, accurate: Bool) {
        guard let image = Self.cgImage(rgba, w, h) else { return }
        lock.lock()
        let pick = pendingPick
        let reset = pendingReset
        pendingPick = nil
        pendingReset = false
        lock.unlock()
        if reset {
            target = .allPeople
            post(subject: "People")
        }
        do {
            let handler = VNImageRequestHandler(cgImage: image, orientation: .up, options: [:])
            if pick != nil || following {
                try runInstances(handler, pick: pick)
            }
            if case .allPeople = target {
                let req: VNGeneratePersonSegmentationRequest
                if accurate {
                    req = VNGeneratePersonSegmentationRequest()
                    req.qualityLevel = .accurate
                    req.outputPixelFormat = kCVPixelFormatType_OneComponent8
                } else {
                    req = livePeople
                }
                try handler.perform([req])
                guard let buf = req.results?.first?.pixelBuffer else { publish(nil, 0, 0); return }
                let (px, mw, mh) = Self.bytes(buf)
                publish(px, mw, mh)
            }
        } catch {
            lock.lock(); newest = nil; lock.unlock()
            status("Cut-out error: \(error.localizedDescription)")
        }
    }

    /// The picked subject: on a tap, the foreground instance under the finger; after that,
    /// the instance that overlaps where it was most.
    private func runInstances(_ handler: VNImageRequestHandler, pick: CGPoint?) throws {
        let req = VNGenerateForegroundInstanceMaskRequest()
        try handler.perform([req])
        guard let obs = req.results?.first else {
            if pick != nil { post(subject: nil) } else { publish(nil, 0, 0) }
            return
        }
        let (labels, w, h) = Self.bytes(obs.instanceMask)
        var chosen: UInt8 = 0
        if let p = pick {
            // The nearest foreground pixel within a small radius of the finger.
            let px = min(max(Int(p.x * CGFloat(w)), 0), w - 1)
            let py = min(max(Int(p.y * CGFloat(h)), 0), h - 1)
            let r = max(4, min(w, h) / 12)
            var bestD = Int.max
            for dy in -r...r {
                for dx in -r...r {
                    let x = px + dx, y = py + dy
                    guard x >= 0, x < w, y >= 0, y < h else { continue }
                    let v = labels[y * w + x]
                    let d = dx * dx + dy * dy
                    if v != 0 && d < bestD { bestD = d; chosen = v }
                }
            }
            if chosen == 0 {
                // Nothing there: keep following whatever was followed before.
                post(subject: nil)
                if case .allPeople = target { return }
            } else {
                post(subject: "Subject")
            }
        }
        if chosen == 0, case let .one(region, rw, rh) = target, rw == w, rh == h {
            var overlap = [Int](repeating: 0, count: 256)
            for i in 0..<(w * h) where region[i] && labels[i] != 0 { overlap[Int(labels[i])] += 1 }
            if let best = overlap.indices.max(by: { overlap[$0] < overlap[$1] }), overlap[best] > 0 { chosen = UInt8(best) }
        }
        guard chosen != 0 else {
            if case .one = target { publish(nil, 0, 0) }
            return
        }
        target = .one(region: labels.map { $0 == chosen }, w: w, h: h)
        // A soft edge where Vision gives one; the hard instance map otherwise.
        if let soft = try? obs.generateMask(forInstances: IndexSet(integer: Int(chosen))) {
            let (px, mw, mh) = Self.bytes(soft)
            publish(px, mw, mh)
        } else {
            publish(labels.map { $0 == chosen ? UInt8(255) : 0 }, w, h)
        }
    }

    /// A picked subject is being followed.
    private var following: Bool {
        if case .one = target { return true }
        return false
    }

    private func publish(_ px: [UInt8]?, _ w: Int, _ h: Int) {
        let any = px?.contains { $0 > 127 } ?? false
        seq += 1
        let m = Matte(pixels: px ?? [], w: w, h: h, seq: seq, empty: !any || px == nil)
        lock.lock(); newest = m; lock.unlock()
        let people = !following
        status(any ? (people ? "Cutting out people" : "Cutting out the subject") : (people ? "No person in view" : "Subject out of view"))
    }

    private func post(subject: String?) {
        DispatchQueue.main.async { self.onSubject?(subject) }
    }

    private func status(_ s: String) {
        if s == lastStatus { return }
        lastStatus = s
        DispatchQueue.main.async { self.onStatus?(s) }
    }

    // MARK: - Pixels

    private static func cgImage(_ rgba: [UInt8], _ w: Int, _ h: Int) -> CGImage? {
        guard w > 0, h > 0, rgba.count >= w * h * 4, let provider = CGDataProvider(data: Data(rgba) as CFData) else { return nil }
        return CGImage(width: w, height: h, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: w * 4,
                       space: CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB(),
                       bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue),
                       provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent)
    }

    /// A one-channel buffer as tight bytes, first row at the top (8-bit as is, float 0..1 scaled).
    private static func bytes(_ buf: CVPixelBuffer) -> ([UInt8], Int, Int) {
        CVPixelBufferLockBaseAddress(buf, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(buf, .readOnly) }
        let w = CVPixelBufferGetWidth(buf), h = CVPixelBufferGetHeight(buf)
        let row = CVPixelBufferGetBytesPerRow(buf)
        guard let base = CVPixelBufferGetBaseAddress(buf) else { return ([UInt8](repeating: 0, count: w * h), w, h) }
        var out = [UInt8](repeating: 0, count: w * h)
        let float = CVPixelBufferGetPixelFormatType(buf) == kCVPixelFormatType_OneComponent32Float
        for y in 0..<h {
            let src = base.advanced(by: y * row)
            if float {
                let f = src.assumingMemoryBound(to: Float32.self)
                for x in 0..<w { out[y * w + x] = UInt8(min(max(f[x] * 255 + 0.5, 0), 255)) }
            } else {
                let b = src.assumingMemoryBound(to: UInt8.self)
                for x in 0..<w { out[y * w + x] = b[x] }
            }
        }
        return (out, w, h)
    }
}

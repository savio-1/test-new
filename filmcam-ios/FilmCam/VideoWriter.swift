import AVFoundation
import CoreVideo
import VideoToolbox

/// Writes rendered frames (BGRA pixel buffers from its pool) and camera audio into a .mov.
final class VideoWriter {
    let url: URL
    let width: Int
    let height: Int
    private let writer: AVAssetWriter
    private let videoInput: AVAssetWriterInput
    private let audioInput: AVAssetWriterInput?
    private let adaptor: AVAssetWriterInputPixelBufferAdaptor
    private var started = false
    private(set) var finished = false

    /// [realtime]: frames come from the camera (late ones are dropped); otherwise a clip is
    /// being developed and every frame waits its turn.
    init(width: Int, height: Int, audio: Bool, transform: CGAffineTransform = .identity, realtime: Bool = true) throws {
        self.width = width
        self.height = height
        url = FileManager.default.temporaryDirectory.appendingPathComponent("Sfilm_\(Int(Date().timeIntervalSince1970)).mov")
        try? FileManager.default.removeItem(at: url)
        writer = try AVAssetWriter(outputURL: url, fileType: .mov)
        let bits = max(8_000_000, width * height * 8)
        videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.hevc,
            AVVideoWidthKey: width,
            AVVideoHeightKey: height,
            AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: bits],
        ])
        videoInput.expectsMediaDataInRealTime = realtime
        videoInput.transform = transform
        adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: videoInput, sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey as String: width,
            kCVPixelBufferHeightKey as String: height,
            kCVPixelBufferOpenGLESCompatibilityKey as String: true,
            kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
        ])
        writer.add(videoInput)
        if audio {
            let a = AVAssetWriterInput(mediaType: .audio, outputSettings: [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVNumberOfChannelsKey: 1,
                AVSampleRateKey: 44_100,
                AVEncoderBitRateKey: 128_000,
            ])
            a.expectsMediaDataInRealTime = realtime
            if writer.canAdd(a) { writer.add(a); audioInput = a } else { audioInput = nil }
        } else {
            audioInput = nil
        }
        guard writer.startWriting() else { throw writer.error ?? NSError(domain: "FilmCam", code: 1) }
    }

    /// A pixel buffer to render the next frame into.
    func nextBuffer() -> CVPixelBuffer? {
        guard let pool = adaptor.pixelBufferPool else { return nil }
        var pb: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pb)
        return pb
    }

    func append(_ buffer: CVPixelBuffer, at time: CMTime) {
        guard !finished else { return }
        if !started {
            writer.startSession(atSourceTime: time)
            started = true
        }
        if videoInput.isReadyForMoreMediaData { adaptor.append(buffer, withPresentationTime: time) }
    }

    /// Waits (up to a few seconds) until [input] takes more.
    private func waitReady(_ input: AVAssetWriterInput) -> Bool {
        var waited = 0
        while !input.isReadyForMoreMediaData {
            if writer.status != .writing || waited > 5000 { return false }
            usleep(1000)
            waited += 1
        }
        return true
    }

    /// Developing: appends the frame, waiting for the encoder.
    @discardableResult
    func appendWaiting(_ buffer: CVPixelBuffer, at time: CMTime) -> Bool {
        guard !finished else { return false }
        if !started {
            writer.startSession(atSourceTime: time)
            started = true
        }
        return waitReady(videoInput) && adaptor.append(buffer, withPresentationTime: time)
    }

    @discardableResult
    func appendAudioWaiting(_ sample: CMSampleBuffer) -> Bool {
        guard started, !finished, let a = audioInput else { return false }
        return waitReady(a) && a.append(sample)
    }

    func appendAudio(_ sample: CMSampleBuffer) {
        guard started, !finished, let a = audioInput, a.isReadyForMoreMediaData else { return }
        a.append(sample)
    }

    func finish(_ done: @escaping (URL?) -> Void) {
        guard !finished else { return }
        finished = true
        if !started {
            writer.cancelWriting()
            done(nil)
            return
        }
        videoInput.markAsFinished()
        audioInput?.markAsFinished()
        writer.finishWriting { [writer, url] in
            done(writer.status == .completed ? url : nil)
        }
    }
}

/// Log video: the camera's 10-bit frames straight into HEVC Main10, colour tags carried over
/// from the frames (HLG or Apple Log). Created at the first frame, when the size is known.
final class LogWriter {
    let url: URL
    private let audio: Bool
    private let transform: CGAffineTransform
    private var writer: AVAssetWriter?
    private var videoInput: AVAssetWriterInput?
    private var audioInput: AVAssetWriterInput?
    private var adaptor: AVAssetWriterInputPixelBufferAdaptor?
    private var started = false
    private var finished = false

    init(audio: Bool, transform: CGAffineTransform) {
        self.audio = audio
        self.transform = transform
        url = FileManager.default.temporaryDirectory.appendingPathComponent("Sfilm_log_\(Int(Date().timeIntervalSince1970)).mov")
        try? FileManager.default.removeItem(at: url)
    }

    private func open(_ pb: CVPixelBuffer) -> Bool {
        guard let w = try? AVAssetWriter(outputURL: url, fileType: .mov) else { return false }
        let width = CVPixelBufferGetWidth(pb), height = CVPixelBufferGetHeight(pb)
        var compression: [String: Any] = [AVVideoAverageBitRateKey: max(20_000_000, width * height * 12),
                                          AVVideoProfileLevelKey: kVTProfileLevel_HEVC_Main10_AutoLevel as String]
        compression[AVVideoExpectedSourceFrameRateKey] = 30
        let v = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.hevc,
            AVVideoWidthKey: width,
            AVVideoHeightKey: height,
            AVVideoCompressionPropertiesKey: compression,
        ])
        v.expectsMediaDataInRealTime = true
        v.transform = transform
        guard w.canAdd(v) else { return false }
        w.add(v)
        adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: v, sourcePixelBufferAttributes: nil)
        if audio {
            let a = AVAssetWriterInput(mediaType: .audio, outputSettings: [
                AVFormatIDKey: kAudioFormatMPEG4AAC, AVNumberOfChannelsKey: 1, AVSampleRateKey: 44_100, AVEncoderBitRateKey: 128_000,
            ])
            a.expectsMediaDataInRealTime = true
            if w.canAdd(a) { w.add(a); audioInput = a }
        }
        guard w.startWriting() else { return false }
        writer = w
        videoInput = v
        return true
    }

    func append(_ pb: CVPixelBuffer, at time: CMTime) {
        guard !finished else { return }
        if writer == nil && !open(pb) { finished = true; return }
        guard let w = writer, let v = videoInput, let ad = adaptor else { return }
        if !started {
            w.startSession(atSourceTime: time)
            started = true
        }
        if v.isReadyForMoreMediaData { ad.append(pb, withPresentationTime: time) }
    }

    func appendAudio(_ sample: CMSampleBuffer) {
        guard started, !finished, let a = audioInput, a.isReadyForMoreMediaData else { return }
        a.append(sample)
    }

    func finish(_ done: @escaping (URL?) -> Void) {
        guard !finished || writer != nil else { done(nil); return }
        finished = true
        guard let w = writer, started else { writer?.cancelWriting(); done(nil); return }
        videoInput?.markAsFinished()
        audioInput?.markAsFinished()
        w.finishWriting { [url] in done(w.status == .completed ? url : nil) }
    }
}

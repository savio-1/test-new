import AVFoundation
import CoreVideo

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

    init(width: Int, height: Int, audio: Bool) throws {
        self.width = width
        self.height = height
        url = FileManager.default.temporaryDirectory.appendingPathComponent("FilmCam_\(Int(Date().timeIntervalSince1970)).mov")
        try? FileManager.default.removeItem(at: url)
        writer = try AVAssetWriter(outputURL: url, fileType: .mov)
        let bits = max(8_000_000, width * height * 8)
        videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.hevc,
            AVVideoWidthKey: width,
            AVVideoHeightKey: height,
            AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: bits],
        ])
        videoInput.expectsMediaDataInRealTime = true
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
            a.expectsMediaDataInRealTime = true
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

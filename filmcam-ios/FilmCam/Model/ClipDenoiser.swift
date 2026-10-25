import AVFoundation
import CoreMedia

/// Takes background noise out of a stream of LPCM sample buffers (the microphone while
/// recording, or a clip's sound while developing). The voice comes out the denoiser's latency
/// late, so each buffer is stamped that much earlier: picture and sound stay together.
final class ClipDenoiser {
    private static let model: RnNoiseModel? = {
        guard let url = Bundle.main.url(forResource: "model", withExtension: "bin", subdirectory: "rnnoise") else { return nil }
        return try? RnNoiseModel(contentsOf: url)
    }()

    private var dn: VoiceDenoiser?
    private var format: CMAudioFormatDescription?
    private var rate = 0
    private var channels = 0
    private var isFloat = false
    private var nextPts = CMTime.invalid
    private var failed = false

    /// The buffer with the noise taken out, or [sample] itself when its format can't be handled.
    func process(_ sample: CMSampleBuffer) -> CMSampleBuffer {
        guard !failed, let fmt = CMSampleBufferGetFormatDescription(sample),
              let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(fmt)?.pointee,
              asbd.mFormatID == kAudioFormatLinearPCM else { return sample }
        let float = asbd.mFormatFlags & kAudioFormatFlagIsFloat != 0
        let interleaved = asbd.mFormatFlags & kAudioFormatFlagIsNonInterleaved == 0 || asbd.mChannelsPerFrame == 1
        let bits = Int(asbd.mBitsPerChannel)
        guard interleaved, (float && bits == 32) || (!float && bits == 16) else { return sample }
        if dn == nil || rate != Int(asbd.mSampleRate) || channels != Int(asbd.mChannelsPerFrame) || isFloat != float {
            guard let m = Self.model, let d = try? VoiceDenoiser(model: m, sampleRate: Int(asbd.mSampleRate), channels: Int(asbd.mChannelsPerFrame)) else {
                failed = true
                return sample
            }
            dn = d
            rate = Int(asbd.mSampleRate); channels = Int(asbd.mChannelsPerFrame); isFloat = float
        }
        format = fmt
        guard let d = dn, let block = CMSampleBufferGetDataBuffer(sample) else { return sample }
        let frames = CMSampleBufferGetNumSamples(sample)
        let count = frames * channels
        let pts = CMSampleBufferGetPresentationTimeStamp(sample)
        let shifted = CMTimeSubtract(pts, CMTime(value: CMTimeValue(d.latencyFrames), timescale: CMTimeScale(rate)))
        nextPts = CMTimeAdd(shifted, CMTime(value: CMTimeValue(frames), timescale: CMTimeScale(rate)))
        if float {
            var input = [Float](repeating: 0, count: count)
            guard input.withUnsafeMutableBytes({ CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: count * 4, destination: $0.baseAddress!) }) == noErr
            else { return sample }
            let out = d.process(input)
            return Self.make(out, fmt, frames, shifted) ?? sample
        } else {
            var input = [Int16](repeating: 0, count: count)
            guard input.withUnsafeMutableBytes({ CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: count * 2, destination: $0.baseAddress!) }) == noErr
            else { return sample }
            let out = d.process(input)
            return Self.make(out, fmt, frames, shifted) ?? sample
        }
    }

    /// The last of the voice, still in the delay line, as one more buffer.
    func finish() -> CMSampleBuffer? {
        guard let d = dn, let fmt = format, nextPts.isValid else { return nil }
        dn = nil
        if isFloat { return Self.make(d.flushFloat(), fmt, d.latencyFrames, nextPts) }
        return Self.make(d.flush(), fmt, d.latencyFrames, nextPts)
    }

    private static func make<T>(_ samples: [T], _ fmt: CMAudioFormatDescription, _ frames: Int, _ pts: CMTime) -> CMSampleBuffer? {
        let bytes = samples.count * MemoryLayout<T>.size
        guard bytes > 0 else { return nil }
        var block: CMBlockBuffer?
        guard CMBlockBufferCreateWithMemoryBlock(allocator: kCFAllocatorDefault, memoryBlock: nil, blockLength: bytes,
                                                 blockAllocator: kCFAllocatorDefault, customBlockSource: nil, offsetToData: 0,
                                                 dataLength: bytes, flags: 0, blockBufferOut: &block) == noErr, let block else { return nil }
        let status = samples.withUnsafeBytes { CMBlockBufferReplaceDataBytes(with: $0.baseAddress!, blockBuffer: block, offsetIntoDestination: 0, dataLength: bytes) }
        guard status == noErr else { return nil }
        var out: CMSampleBuffer?
        guard CMAudioSampleBufferCreateReadyWithPacketDescriptions(allocator: kCFAllocatorDefault, dataBuffer: block, formatDescription: fmt,
                                                                   sampleCount: frames, presentationTimeStamp: pts,
                                                                   packetDescriptions: nil, sampleBufferOut: &out) == noErr else { return nil }
        return out
    }
}

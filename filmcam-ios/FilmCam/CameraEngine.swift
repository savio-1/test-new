import AVFoundation
import AudioToolbox
import CoreImage
import ImageIO
import OpenGLES
import Photos
import UIKit
import UniformTypeIdentifiers

/// What the text layers get each frame: the frame's size (upright), the time in seconds
/// (negative for a still, which shows text at rest) and a way to read the picture for the
/// subject cut-out (RGBA, row 0 at the top, upright like the frame).
struct TextRequest {
    var width: Int
    var height: Int
    var time: Float
    var still: Bool
    var readPicture: (_ w: Int, _ h: Int) -> [UInt8]
}

/// Textures for the final pass (0: none). Text is premultiplied RGBA in upright frame space,
/// row 0 at the top; the matte is the subject in the same space.
struct TextFrame {
    var front: GLuint = 0
    var back: GLuint = 0
    var frontBlend: Int32 = 0
    var backBlend: Int32 = 0
    var subject: GLuint = 0
}

/// Draws the text layers. Called on the render queue with the GL context current.
protocol TextLayerSource: AnyObject {
    func frame(_ req: TextRequest) -> TextFrame
}

struct ZoomStop: Equatable, Hashable {
    var label: String
    var factor: CGFloat
}

/// What the session is asked for.
struct CameraConfig: Equatable {
    var front = false
    var video = false
    var videoRes: VideoResolution = .FHD
    var fps = 30
    var photoSize: PhotoSize?
    var stabilization = false
    /// Log video: flat 10-bit straight from the sensor into the file (no film look).
    var log: LogCurveChoice?
}

/// What the camera can do, reported after each configuration.
struct CameraCaps: Equatable {
    var photoSizes: [PhotoSize] = []
    var photoSize: PhotoSize?
    var videoRes: Set<VideoResolution> = [.FHD]
    var fps: Set<Int> = [30]
    var hasFlash = false
    var evMin: Float = -2
    var evMax: Float = 2
    var stabilization = false
    var raw = false
    /// Zoom buttons and the current zoom, as the camera app shows them (1 = main lens).
    var zoomStops: [Float] = [1]
    var zoom: Float = 1
    var encoderInfo = ""
    var hlg = false
    var appleLog = false
    /// Log is on and the camera took it (the file is 10-bit log; the screen shows the camera's preview).
    var logActive = false
}

/// Camera, live film rendering and capture. Frames from AVFoundation (BGRA, already turned
/// upright) are developed on the GPU with the same passes as Android and shown in the
/// viewfinder; photos are re-developed at full resolution; videos record the rendered frames.
final class CameraEngine: NSObject {
    let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "filmcam.session")
    private let renderQueue = DispatchQueue(label: "filmcam.render", qos: .userInteractive)

    private let videoOutput = AVCaptureVideoDataOutput()
    private let photoOutput = AVCapturePhotoOutput()
    private let audioOutput = AVCaptureAudioDataOutput()
    private var videoInput: AVCaptureDeviceInput?
    private var audioInput: AVCaptureDeviceInput?
    private(set) var device: AVCaptureDevice?
    private var wideFactor: CGFloat = 1
    private var config = CameraConfig()
    private var caps = CameraCaps()

    // Main-thread callbacks.
    var onCaps: ((CameraCaps) -> Void)?
    var onZoom: ((Float) -> Void)?
    /// A take was saved (nil item: it couldn't be, or can't be listed), with a small picture.
    var onSaved: ((MediaItem?, UIImage?) -> Void)?
    var onRecording: ((Bool) -> Void)?
    var onSavingVideo: ((Bool) -> Void)?
    var onDeveloping: ((Int) -> Void)?
    /// Half frame: the first half is waiting for the second.
    var onHalfFrame: ((Bool) -> Void)?
    var onSampling: ((Bool) -> Void)?
    var onError: ((String) -> Void)?

    /// How the phone is held, in clockwise quarter turns from portrait (set from the main thread).
    var quarterTurns = 0
    /// Text layers drawn into each frame (set from the main thread, used on the render queue).
    var textSource: TextLayerSource?

    // Render-queue state.
    private var context: EAGLContext!
    private var cache: CVOpenGLESTextureCache?
    private var renderer: Renderer?
    private var pipeline: Pipeline?
    private let target = LayerTarget()
    private var pendingLayer: CAEAGLLayer?
    private var look: Look = Spec.shared.original.look
    private var aspect: Float = 3.0 / 4.0
    private var videoMode = false
    private var workSide = 1920
    private var lastRotationFix = 0.0
    /// Log: camera frames go straight to the file; the screen shows the camera's own preview.
    private var logMode = false
    private var logWriter: LogWriter?
    private var recordTurns = 0
    private var recordLook: LookRecord?
    private var active = true
    // Import being developed: its picture or player, drawn by a timer instead of the camera.
    private var editStill: (tex: GLuint, w: Int, h: Int)?
    private var editPlayer: AVPlayer?
    private var editOutput: AVPlayerItemVideoOutput?
    private var editTimer: DispatchSourceTimer?
    private var editLoop: NSObjectProtocol?
    /// Audio from the microphone while recording (live captions listen to it).
    var onAudioSample: ((CMSampleBuffer) -> Void)?
    /// Background noise taken out of the sound as it is recorded (set from the main thread).
    var voiceDenoise = false
    private var liveDenoiser: ClipDenoiser?
    private let animator = FxAnimator()
    private var fx = FrameFx()
    private var timeBase: Double = -1
    private var lastFilmFrame: Double = -1
    private var writer: VideoWriter?
    private var recordStart: Double = 0
    private var stopRequested: Double = 0
    private var recordBurn = false
    private var videoTex: GLuint = 0
    private var videoFbo: GLuint = 0
    private var videoTexSize = (0, 0)

    // Session-queue state.
    private struct PendingPhoto {
        var look: Look
        var original: Bool
        var record: LookRecord?
        var turns: Int
        var aspect: Float
        var raw: Data?
        var processed: Data?
        var halfFrame = false
    }
    /// Half-frame cameras: the first half waits here for the second.
    private var halfFrameFirst: CGImage?
    private var pendingPhotos: [Int64: PendingPhoto] = [:]
    var shutterSound = true
    private var torchWanted = false

    override init() {
        super.init()
        renderQueue.sync {
            context = EAGLContext(api: .openGLES3)
            EAGLContext.setCurrent(context)
            CVOpenGLESTextureCacheCreate(kCFAllocatorDefault, nil, context, nil, &cache)
            do { renderer = try Renderer() } catch { print("FilmCam renderer: \(error)") }
            EAGLContext.setCurrent(nil)
        }
    }

    // MARK: - Session

    func start(_ config: CameraConfig) {
        sessionQueue.async {
            self.config = config
            self.configure(config)
            // Again once the new configuration is committed: switching cameras makes new
            // connections then, which would deliver sideways frames.
            self.applyConnections(front: config.front)
            self.choosePhotoSize(config.photoSize)
            if !self.session.isRunning { self.session.startRunning() }
            self.applyTorch()
            let c = self.caps
            DispatchQueue.main.async { self.onCaps?(c) }
        }
    }

    func stop() {
        renderQueue.sync {
            active = false
            if writer != nil { finishRecording() }
            if let lw = logWriter {
                logWriter = nil
                let record = recordLook
                DispatchQueue.main.async { self.onRecording?(false) }
                lw.finish { url in self.saveRecording(url, record) }
            }
            EAGLContext.setCurrent(context)
            glFinish()
        }
        sessionQueue.async { if self.session.isRunning { self.session.stopRunning() } }
    }

    /// Back from the background; [camera] false while an import is shown instead.
    func resume(camera: Bool = true) {
        renderQueue.async { self.active = true }
        if camera { sessionQueue.async { if !self.session.isRunning { self.session.startRunning() } } }
    }

    private static func backCamera() -> AVCaptureDevice? {
        for type: AVCaptureDevice.DeviceType in [.builtInTripleCamera, .builtInDualWideCamera, .builtInDualCamera, .builtInWideAngleCamera] {
            if let d = AVCaptureDevice.default(type, for: .video, position: .back) { return d }
        }
        return nil
    }

    /// The format for [res] at [fps] with plain 8-bit frames (the film pass makes its own colour).
    private static func videoFormat(_ dev: AVCaptureDevice, _ res: VideoResolution, _ fps: Int) -> AVCaptureDevice.Format? {
        let plain: Set<FourCharCode> = [kCVPixelFormatType_420YpCbCr8BiPlanarFullRange, kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange]
        let fits = dev.formats.filter { f in
            let d = CMVideoFormatDescriptionGetDimensions(f.formatDescription)
            return Int(d.width) == res.width && Int(d.height) == res.height
                && plain.contains(CMFormatDescriptionGetMediaSubType(f.formatDescription))
                && f.videoSupportedFrameRateRanges.contains { $0.maxFrameRate >= Double(fps) - 0.01 && $0.minFrameRate <= Double(fps) + 0.01 }
        }
        // Full range first, then the one that can stabilise.
        return fits.sorted { a, b in
            let fa = CMFormatDescriptionGetMediaSubType(a.formatDescription) == kCVPixelFormatType_420YpCbCr8BiPlanarFullRange
            let fb = CMFormatDescriptionGetMediaSubType(b.formatDescription) == kCVPixelFormatType_420YpCbCr8BiPlanarFullRange
            if fa != fb { return fa }
            return a.isVideoStabilizationModeSupported(.standard) && !b.isVideoStabilizationModeSupported(.standard)
        }.first
    }

    /// A 10-bit format for [res] at [fps] that can film in [space].
    private static func logFormat(_ dev: AVCaptureDevice, _ res: VideoResolution, _ fps: Int, _ space: AVCaptureColorSpace) -> AVCaptureDevice.Format? {
        dev.formats.first { f in
            let d = CMVideoFormatDescriptionGetDimensions(f.formatDescription)
            return Int(d.width) == res.width && Int(d.height) == res.height
                && CMFormatDescriptionGetMediaSubType(f.formatDescription) == kCVPixelFormatType_420YpCbCr10BiPlanarVideoRange
                && f.supportedColorSpaces.contains(space)
                && f.videoSupportedFrameRateRanges.contains { $0.maxFrameRate >= Double(fps) - 0.01 && $0.minFrameRate <= Double(fps) + 0.01 }
        }
    }

    private static func logSpace(_ c: LogCurveChoice) -> AVCaptureColorSpace { c == .APPLE_LOG ? .appleLog : .HLG_BT2020 }

    private static func supports(_ dev: AVCaptureDevice, _ res: VideoResolution, _ fps: Int) -> Bool {
        videoFormat(dev, res, fps) != nil
    }

    private func configure(_ cfg: CameraConfig) {
        let front = cfg.front, video = cfg.video
        session.beginConfiguration()
        defer { session.commitConfiguration() }

        let wanted = front ? AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front) : Self.backCamera()
        guard let dev = wanted else { report("No camera available"); return }
        if device != dev {
            if let i = videoInput { session.removeInput(i) }
            guard let input = try? AVCaptureDeviceInput(device: dev), session.canAddInput(input) else { report("Camera unavailable"); return }
            session.addInput(input)
            videoInput = input
            device = dev
        }

        if !video, session.canSetSessionPreset(.photo) { session.sessionPreset = .photo }

        if !session.outputs.contains(videoOutput), session.canAddOutput(videoOutput) {
            videoOutput.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
            videoOutput.alwaysDiscardsLateVideoFrames = true
            videoOutput.setSampleBufferDelegate(self, queue: renderQueue)
            session.addOutput(videoOutput)
        }
        // Stills come from the photo output; the viewfinder only needs screen-sized frames.
        // iOS throws if the automatic sizing is still on when this is set (it starts on).
        videoOutput.automaticallyConfiguresOutputBufferDimensions = false
        videoOutput.deliversPreviewSizedOutputBuffers = !video
        if !session.outputs.contains(photoOutput), session.canAddOutput(photoOutput) {
            session.addOutput(photoOutput)
            photoOutput.maxPhotoQualityPrioritization = .quality
        }

        // The microphone only while filming (it lights the orange dot).
        if video, audioInput == nil, AVCaptureDevice.authorizationStatus(for: .audio) == .authorized,
           let mic = AVCaptureDevice.default(for: .audio), let input = try? AVCaptureDeviceInput(device: mic), session.canAddInput(input) {
            session.addInput(input)
            audioInput = input
            if !session.outputs.contains(audioOutput), session.canAddOutput(audioOutput) {
                audioOutput.setSampleBufferDelegate(self, queue: renderQueue)
                session.addOutput(audioOutput)
            }
        } else if !video, let a = audioInput {
            session.removeInput(a)
            audioInput = nil
            session.removeOutput(audioOutput)
        }

        // Video: the chosen size and frame rate (or the nearest the camera has).
        var fps = cfg.fps
        var res = cfg.videoRes
        let resOK = VideoResolution.allCases.filter { r in [24, 25, 30, 60].contains { Self.supports(dev, r, $0) } }
        var logOn = false
        session.automaticallyConfiguresCaptureDeviceForWideColor = !(video && cfg.log != nil)
        if video {
            if !resOK.contains(res) { res = resOK.contains(.FHD) ? .FHD : resOK.last ?? .FHD }
            if !Self.supports(dev, res, fps) { fps = 30 }
            let logFmt = cfg.log.flatMap { Self.logFormat(dev, res, fps, Self.logSpace($0)) }
            if let fmt = logFmt ?? Self.videoFormat(dev, res, fps) ?? Self.videoFormat(dev, res, 30) {
                do {
                    try dev.lockForConfiguration()
                    dev.activeFormat = fmt
                    if logFmt != nil, let c = cfg.log {
                        dev.activeColorSpace = Self.logSpace(c)
                        logOn = true
                    } else if fmt.supportedColorSpaces.contains(.sRGB) {
                        dev.activeColorSpace = .sRGB
                    }
                    dev.activeVideoMinFrameDuration = CMTime(value: 1, timescale: CMTimeScale(fps))
                    dev.activeVideoMaxFrameDuration = CMTime(value: 1, timescale: CMTimeScale(fps))
                    dev.unlockForConfiguration()
                } catch {}
            } else if session.canSetSessionPreset(.hd1920x1080) {
                session.sessionPreset = .hd1920x1080
            }
        }

        // Log frames stay 10-bit for the file; everything else is drawn from BGRA.
        let tenBit = kCVPixelFormatType_420YpCbCr10BiPlanarVideoRange
        if logOn && !videoOutput.availableVideoPixelFormatTypes.contains(tenBit) {
            logOn = false
            do {
                try dev.lockForConfiguration()
                if dev.activeFormat.supportedColorSpaces.contains(.sRGB) { dev.activeColorSpace = .sRGB }
                dev.unlockForConfiguration()
            } catch {}
        }
        videoOutput.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: logOn ? tenBit : kCVPixelFormatType_32BGRA]
        applyConnections(front: front)
        if let conn = videoOutput.connection(with: .video), conn.isVideoStabilizationSupported {
            conn.preferredVideoStabilizationMode = video && cfg.stabilization ? .standard : .off
        }

        do {
            try dev.lockForConfiguration()
            if dev.isFocusModeSupported(.continuousAutoFocus) { dev.focusMode = .continuousAutoFocus }
            if dev.isExposureModeSupported(.continuousAutoExposure) { dev.exposureMode = .continuousAutoExposure }
            if dev.isSmoothAutoFocusSupported { dev.isSmoothAutoFocusEnabled = video }
            dev.unlockForConfiguration()
        } catch {}

        // Lens stops: the virtual device switches lenses itself as the zoom passes them.
        let switches = dev.virtualDeviceSwitchOverVideoZoomFactors.map { CGFloat(truncating: $0) }
        let hasUltraWide = dev.constituentDevices.contains { $0.deviceType == .builtInUltraWideCamera }
        wideFactor = hasUltraWide ? (switches.first ?? 1) : 1
        var stops: [ZoomStop] = []
        if hasUltraWide { stops.append(ZoomStop(label: "0.5", factor: 1)) }
        stops.append(ZoomStop(label: "1", factor: wideFactor))
        let tele = hasUltraWide ? switches.dropFirst().first : (dev.deviceType == .builtInDualCamera ? switches.first : nil)
        if let t = tele {
            let label = t / wideFactor
            stops.append(ZoomStop(label: label == label.rounded() ? "\(Int(label))" : String(format: "%.1f", label), factor: t))
        } else if !front {
            stops.append(ZoomStop(label: "2", factor: wideFactor * 2))
        }
        stops = stops.filter { $0.factor <= dev.maxAvailableVideoZoomFactor }
        setZoomLocked(dev, wideFactor)

        var c = CameraCaps()
        c.zoomStops = stops.map { Float($0.factor / wideFactor) }
        c.zoom = 1
        c.hasFlash = dev.hasFlash || dev.hasTorch
        c.evMin = max(dev.minExposureTargetBias, -3)
        c.evMax = min(dev.maxExposureTargetBias, 3)
        c.videoRes = Set(resOK)
        c.fps = Set([24, 25, 30, 60].filter { Self.supports(dev, res, $0) })
        c.stabilization = dev.activeFormat.isVideoStabilizationModeSupported(.standard)
        c.encoderInfo = video ? (logOn ? "HEVC 10-bit · " : "HEVC · ") + "\(res.label) · \(fps) fps" : ""
        c.hlg = Self.logFormat(dev, res, fps, .HLG_BT2020) != nil
        c.appleLog = Self.logFormat(dev, res, fps, .appleLog) != nil
        c.logActive = logOn
        caps = c

        let side = video ? max(res.width, res.height) : 1920
        let logMode = logOn
        renderQueue.async {
            self.videoMode = video
            self.logMode = logMode
            self.workSide = side
            self.lastFilmFrame = -1
        }
    }

    /// The chosen still size, or 12 MP: full detail without the noise of the remosaiced 48 MP
    /// mode. Runs after the configuration is committed, when the new format is active.
    private func choosePhotoSize(_ wanted: PhotoSize?) {
        guard let dev = device else { return }
        let all = dev.activeFormat.supportedMaxPhotoDimensions
        var sizes: [PhotoSize] = []
        for d in all where !sizes.contains(where: { $0.mp == PhotoSize(width: Int(d.width), height: Int(d.height)).mp }) {
            sizes.append(PhotoSize(width: Int(max(d.width, d.height)), height: Int(min(d.width, d.height))))
        }
        sizes.sort { $0.pixels < $1.pixels }
        let pick = wanted.flatMap { w in sizes.first { $0.mp == w.mp } }
            ?? sizes.filter { $0.pixels <= 12_600_000 }.last ?? sizes.first
        if let p = pick, let d = all.first(where: { Int(max($0.width, $0.height)) == p.width && Int(min($0.width, $0.height)) == p.height }) {
            photoOutput.maxPhotoDimensions = d
        }
        caps.photoSizes = sizes
        caps.photoSize = pick
        caps.raw = !photoOutput.availableRawPhotoPixelFormatTypes.isEmpty
    }

    /// Frames upright for a phone held in portrait, mirrored for the front camera.
    private func applyConnections(front: Bool) {
        for conn in [videoOutput.connection(with: .video), photoOutput.connection(with: .video)].compactMap({ $0 }) {
            if conn.isVideoMirroringSupported {
                conn.automaticallyAdjustsVideoMirroring = false
                if conn.isVideoMirrored != front { conn.isVideoMirrored = front }
            }
            if conn.isVideoRotationAngleSupported(90) && conn.videoRotationAngle != 90 { conn.videoRotationAngle = 90 }
        }
    }

    /// The torch stands in for the flash while filming.
    func setTorch(_ on: Bool) {
        sessionQueue.async {
            self.torchWanted = on
            self.applyTorch()
        }
    }

    private func applyTorch() {
        guard let dev = device, dev.hasTorch else { return }
        let on = torchWanted && config.video
        do {
            try dev.lockForConfiguration()
            if on, dev.isTorchModeSupported(.on) { try dev.setTorchModeOn(level: 1) } else if dev.isTorchModeSupported(.off) { dev.torchMode = .off }
            dev.unlockForConfiguration()
        } catch {}
    }

    /// Real shutter: the sensor exposes for [seconds] (ISO follows to keep the brightness);
    /// otherwise the camera exposes on its own.
    func setShutter(real: Bool, seconds: Float) {
        sessionQueue.async {
            guard let dev = self.device else { return }
            do {
                try dev.lockForConfiguration()
                defer { dev.unlockForConfiguration() }
                if real, dev.isExposureModeSupported(.custom) {
                    let f = dev.activeFormat
                    let want = CMTime(seconds: Double(seconds), preferredTimescale: 1_000_000)
                    let d = CMTimeClampToRange(want, range: CMTimeRange(start: f.minExposureDuration, end: f.maxExposureDuration))
                    let ratio = Float(CMTimeGetSeconds(dev.exposureDuration) / max(CMTimeGetSeconds(d), 1e-6))
                    let iso = min(max(dev.iso * ratio, f.minISO), f.maxISO)
                    dev.setExposureModeCustom(duration: d, iso: iso, completionHandler: nil)
                } else if dev.isExposureModeSupported(.continuousAutoExposure) {
                    dev.exposureMode = .continuousAutoExposure
                }
            } catch {}
        }
    }

    private func setZoomLocked(_ dev: AVCaptureDevice, _ factor: CGFloat) {
        do {
            try dev.lockForConfiguration()
            dev.videoZoomFactor = min(max(factor, dev.minAvailableVideoZoomFactor), dev.maxAvailableVideoZoomFactor)
            dev.unlockForConfiguration()
        } catch {}
    }

    /// Zoom as the camera app counts it (1 = main lens, 0.5 = ultra wide).
    func zoom(to display: Float, animated: Bool = true) {
        sessionQueue.async {
            guard let dev = self.device else { return }
            do {
                try dev.lockForConfiguration()
                let f = min(max(CGFloat(display) * self.wideFactor, dev.minAvailableVideoZoomFactor), self.maxZoom(dev))
                if animated { dev.ramp(toVideoZoomFactor: f, withRate: 6) } else { dev.videoZoomFactor = f }
                dev.unlockForConfiguration()
                let shown = Float(f / self.wideFactor)
                DispatchQueue.main.async { self.onZoom?(shown) }
            } catch {}
        }
    }

    /// Pinch: zoom by [scale] from where it is.
    func zoom(by scale: Float) {
        sessionQueue.async {
            guard let dev = self.device else { return }
            do {
                try dev.lockForConfiguration()
                let f = min(max(dev.videoZoomFactor * CGFloat(scale), dev.minAvailableVideoZoomFactor), self.maxZoom(dev))
                dev.videoZoomFactor = f
                dev.unlockForConfiguration()
                let shown = Float(f / self.wideFactor)
                DispatchQueue.main.async { self.onZoom?(shown) }
            } catch {}
        }
    }

    /// Up to 15x of the main lens (digital zoom past that only smears).
    private func maxZoom(_ dev: AVCaptureDevice) -> CGFloat { min(dev.maxAvailableVideoZoomFactor, wideFactor * 15) }

    func setExposure(_ ev: Float) {
        sessionQueue.async {
            guard let dev = self.device else { return }
            do {
                try dev.lockForConfiguration()
                dev.setExposureTargetBias(min(max(ev, dev.minExposureTargetBias), dev.maxExposureTargetBias))
                dev.unlockForConfiguration()
            } catch {}
        }
    }

    /// Tap to focus; [p] is in the viewfinder, 0..1 with y down (portrait).
    func focus(at p: CGPoint, front: Bool) {
        sessionQueue.async {
            guard let dev = self.device else { return }
            // Device points are in the sensor's landscape frame.
            let dp = CGPoint(x: p.y, y: front ? p.x : 1 - p.x)
            do {
                try dev.lockForConfiguration()
                if dev.isFocusPointOfInterestSupported { dev.focusPointOfInterest = dp; dev.focusMode = .autoFocus }
                if dev.isExposurePointOfInterestSupported { dev.exposurePointOfInterest = dp; dev.exposureMode = .continuousAutoExposure }
                dev.isSubjectAreaChangeMonitoringEnabled = true
                dev.unlockForConfiguration()
            } catch {}
        }
    }

    private func report(_ message: String) {
        DispatchQueue.main.async { self.onError?(message) }
    }

    // MARK: - Look and viewfinder

    func update(look: Look, aspect: Float) {
        renderQueue.async {
            if look.stock != self.look.stock || look.lightLeak != self.look.lightLeak { self.animator.reshuffle() }
            self.look = look
            self.aspect = aspect
        }
    }

    func attach(_ view: GLDisplayView) {
        let layer = view.eaglLayer
        view.onResize = { [weak self] _, _ in
            self?.renderQueue.async { self?.pendingLayer = layer }
        }
        renderQueue.async { self.pendingLayer = layer }
    }

    private func frameSize(_ uw: Int, _ uh: Int) -> (Int, Int) {
        var cw = Float(uw), ch = Float(uh)
        if cw / ch > aspect { cw = ch * aspect } else { ch = cw / aspect }
        let scale = min(1, Float(workSide) / max(cw, ch))
        let step = videoMode ? 16 : 2
        return (Int((cw * scale).rounded()) / step * step, Int((ch * scale).rounded()) / step * step)
    }

    private func overscan(_ look: Look) -> Float { 1 - 2.2 * FxAnimator.maxWeave * look.gateWeave }

    private func filmFrameDue(_ fps: Int, _ now: Double) -> Bool {
        if fps <= 0 { lastFilmFrame = now; return true }
        let interval = 1 / Double(fps)
        let since = now - lastFilmFrame
        if lastFilmFrame >= 0 && since < interval - 0.003 { return false }
        lastFilmFrame = (lastFilmFrame < 0 || since > interval * 2) ? now : lastFilmFrame + interval
        return true
    }

    private func rollBurn(_ now: Double) -> Float {
        guard writer != nil, recordBurn else { return 0 }
        let inBurn = 1 - Float(now - recordStart) / 0.8
        let outBurn = stopRequested > 0 ? Float(now - stopRequested) / 0.65 : 0
        return min(max(max(inBurn, outBurn), 0), 1)
    }

    // MARK: - Live frames (render queue)

    private func render(_ sample: CMSampleBuffer) {
        if logMode {
            if let lw = logWriter, let pb = CMSampleBufferGetImageBuffer(sample) {
                lw.append(pb, at: CMSampleBufferGetPresentationTimeStamp(sample))
            }
            return
        }
        guard active, editStill == nil, editOutput == nil, let renderer, let cache, let pb = CMSampleBufferGetImageBuffer(sample) else { return }
        let pts = CMSampleBufferGetPresentationTimeStamp(sample)
        let now = CMTimeGetSeconds(pts)
        if !filmFrameDue(Spec.shared.fps(look.frameRate), now) { return }

        EAGLContext.setCurrent(context)
        if let layer = pendingLayer {
            pendingLayer = nil
            target.attach(context, layer)
        }

        let bw = CVPixelBufferGetWidth(pb), bh = CVPixelBufferGetHeight(pb)
        // Frames always arrive upright (portrait); a sideways one means a connection lost its
        // rotation: set it again.
        if bw > bh && now - lastRotationFix > 0.5 {
            lastRotationFix = now
            sessionQueue.async { self.applyConnections(front: self.config.front) }
        }
        let (w, h) = frameSize(bw, bh)
        guard w >= 16, h >= 16 else { return }
        if pipeline == nil || pipeline!.width != w || pipeline!.height != h {
            pipeline?.release()
            pipeline = Pipeline(w, h, glowFormat: renderer.glowFormat)
        }
        let p = pipeline!

        var cvTex: CVOpenGLESTexture?
        CVOpenGLESTextureCacheCreateTextureFromImage(kCFAllocatorDefault, cache, pb, nil, E(GL_TEXTURE_2D), GL_RGBA,
                                                     GLsizei(bw), GLsizei(bh), GLenum(0x80E1) /* BGRA */, E(GL_UNSIGNED_BYTE), 0, &cvTex)
        guard let camTex = cvTex else { return }
        defer { CVOpenGLESTextureCacheFlush(cache, 0) }
        let name = CVOpenGLESTextureGetName(camTex)
        glBindTexture(CVOpenGLESTextureGetTarget(camTex), name)
        glTexParameteri(E(GL_TEXTURE_2D), E(GL_TEXTURE_MIN_FILTER), GL_LINEAR)
        glTexParameteri(E(GL_TEXTURE_2D), E(GL_TEXTURE_MAG_FILTER), GL_LINEAR)
        glTexParameteri(E(GL_TEXTURE_2D), E(GL_TEXTURE_WRAP_S), GL_CLAMP_TO_EDGE)
        glTexParameteri(E(GL_TEXTURE_2D), E(GL_TEXTURE_WRAP_T), GL_CLAMP_TO_EDGE)

        if timeBase < 0 { timeBase = now }
        let t = Float(now - timeBase)
        animator.next(look, time: t, &fx)
        fx.rollBurn = rollBurn(now)

        // Crop the buffer to the frame's shape, leaving room for the gate weave.
        var sx: Float = 1, sy: Float = 1
        let ba = Float(bw) / Float(bh)
        if ba > aspect { sx = aspect / ba } else { sy = ba / aspect }
        let ov = overscan(look)
        let texMatrix = Mat.image(sx: sx * ov, sy: sy * ov, dx: fx.weaveX, dy: -fx.weaveY)

        let persistence = look.persistence(frameSeconds: 1 / 30)
        if persistence > 0 || look.interlace > 0 { p.keepPrevious() }
        renderer.digitalExposure = false
        renderer.updateOverlays(stamp: look.stamp, recording: writer != nil)
        renderer.develop(p, source: name, texMatrix: texMatrix, persistence: persistence)
        let src = FinalSource(image: p.current, previous: p.previous, width: p.width, height: p.height,
                              imageMatrix: Mat.identity, glow: p.glow)
        let turns = writer != nil ? recordTurns : quarterTurns
        renderer.glow(src, look, frameTurns: turns)
        applyText(src, turns: turns, time: t, still: false)

        if target.fbo != 0 {
            glBindFramebuffer(E(GL_FRAMEBUFFER), target.fbo)
            renderer.drawFinal(src, look, fx, targetW: target.width, targetH: target.height, targetRot: 0, frameRot: turns)
            target.present(context)
        }
        if let wr = writer { record(src, wr, pts, now) }
        glBindFramebuffer(E(GL_FRAMEBUFFER), 0)
    }

    /// Asks the text source for this frame's text (and the subject's matte, when text is set
    /// behind it) and hands the textures to the final pass.
    private func applyText(_ src: FinalSource, turns: Int, time: Float, still: Bool) {
        guard let renderer else { return }
        guard let ts = textSource else {
            renderer.textFront = 0; renderer.textBack = 0; renderer.subject = 0
            return
        }
        let (fw, fh) = turns % 2 == 0 ? (src.width, src.height) : (src.height, src.width)
        let req = TextRequest(width: fw, height: fh, time: time, still: still) { w, h in
            renderer.readSegInput(src, frameRot: turns, w: w, h: h)
        }
        let f = ts.frame(req)
        renderer.textFront = f.front
        renderer.textBack = f.back
        renderer.textBlend = f.frontBlend
        renderer.textBackBlend = f.backBlend
        renderer.subject = f.subject
    }

    private func record(_ src: FinalSource, _ wr: VideoWriter, _ pts: CMTime, _ now: Double) {
        guard let renderer, let cache, let pb = wr.nextBuffer() else { return }
        let w = wr.width, h = wr.height
        if videoTexSize != (w, h) {
            GLU.delete(framebuffers: [videoFbo]); GLU.delete(textures: [videoTex])
            videoTex = GLU.texture(w, h)
            videoFbo = GLU.framebuffer(videoTex)
            videoTexSize = (w, h)
        }
        glBindFramebuffer(E(GL_FRAMEBUFFER), videoFbo)
        renderer.drawFinal(src, look, fx, targetW: w, targetH: h, targetRot: 0, frameRot: recordTurns)

        var cvTex: CVOpenGLESTexture?
        CVOpenGLESTextureCacheCreateTextureFromImage(kCFAllocatorDefault, cache, pb, nil, E(GL_TEXTURE_2D), GL_RGBA,
                                                     GLsizei(w), GLsizei(h), GLenum(0x80E1), E(GL_UNSIGNED_BYTE), 0, &cvTex)
        guard let outTex = cvTex else { return }
        let fbo = GLU.framebuffer(CVOpenGLESTextureGetName(outTex))
        // GL rows run bottom-up, the video's top-down: flip while copying.
        glBindFramebuffer(E(GL_READ_FRAMEBUFFER), videoFbo)
        glBindFramebuffer(E(GL_DRAW_FRAMEBUFFER), fbo)
        glBlitFramebuffer(0, 0, GLint(w), GLint(h), 0, GLint(h), GLint(w), 0, E(GL_COLOR_BUFFER_BIT), E(GL_NEAREST))
        glFinish()
        GLU.delete(framebuffers: [fbo])
        wr.append(pb, at: pts)

        if stopRequested > 0 && now - stopRequested >= 0.65 { finishRecording() }
    }

    // MARK: - Video

    func startRecording(sound: Bool, record: LookRecord?) {
        if sound { AudioServicesPlaySystemSound(1117) }
        let turns = quarterTurns
        renderQueue.async {
            if self.logMode {
                guard self.logWriter == nil else { return }
                let angle: CGFloat = [0, .pi / 2, .pi, -.pi / 2][turns & 3]
                self.logWriter = LogWriter(audio: AVCaptureDevice.authorizationStatus(for: .audio) == .authorized,
                                           transform: CGAffineTransform(rotationAngle: angle))
                self.recordLook = record
                self.liveDenoiser = self.voiceDenoise ? ClipDenoiser() : nil
                DispatchQueue.main.async { self.onRecording?(true) }
                return
            }
            guard self.writer == nil, let p = self.pipeline else { return }
            do {
                let audio = AVCaptureDevice.authorizationStatus(for: .audio) == .authorized
                // Frames stay as the screen shows them; the clip is turned upright on playback.
                let angle: CGFloat = [0, .pi / 2, .pi, -.pi / 2][turns & 3]
                self.writer = try VideoWriter(width: p.width, height: p.height, audio: audio,
                                              transform: CGAffineTransform(rotationAngle: angle))
                self.recordTurns = turns
                self.recordLook = record
                self.liveDenoiser = self.voiceDenoise ? ClipDenoiser() : nil
                self.recordStart = self.lastFilmFrame >= 0 ? self.lastFilmFrame : CACurrentMediaTime()
                self.stopRequested = 0
                self.recordBurn = self.look.rollBurn
                DispatchQueue.main.async { self.onRecording?(true) }
            } catch {
                self.report("Could not start recording")
            }
        }
    }

    func stopRecording(sound: Bool) {
        renderQueue.async {
            if let lw = self.logWriter {
                self.logWriter = nil
                let record = self.recordLook
                DispatchQueue.main.async { self.onRecording?(false); self.onSavingVideo?(true) }
                lw.finish { url in self.saveRecording(url, record) }
                return
            }
            guard self.writer != nil else { return }
            if self.recordBurn && self.active {
                if self.stopRequested == 0 { self.stopRequested = self.lastFilmFrame }
            } else {
                self.finishRecording()
            }
        }
        if sound { DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { AudioServicesPlaySystemSound(1118) } }
    }

    private func finishRecording() {
        guard let wr = writer else { return }
        writer = nil
        stopRequested = 0
        let record = recordLook
        DispatchQueue.main.async { self.onRecording?(false); self.onSavingVideo?(true) }
        wr.finish { url in self.saveRecording(url, record) }
    }

    private func saveRecording(_ url: URL?, _ record: LookRecord?) {
        guard let url else {
            DispatchQueue.main.async { self.onSavingVideo?(false) }
            report("Recording failed")
            return
        }
        let thumb = Self.videoThumbnail(url)
        MediaLibrary.saveVideo(url, look: record) { item in
            try? FileManager.default.removeItem(at: url)
            self.onSavingVideo?(false)
            self.onSaved?(item, thumb)
        }
    }

    private static func videoThumbnail(_ url: URL) -> UIImage? {
        let gen = AVAssetImageGenerator(asset: AVURLAsset(url: url))
        gen.appliesPreferredTrackTransform = true
        gen.maximumSize = CGSize(width: 240, height: 240)
        guard let cg = try? gen.copyCGImage(at: .zero, actualTime: nil) else { return nil }
        return UIImage(cgImage: cg)
    }

    // MARK: - Photos

    /// [original]: the untouched phone picture (no look, no style): saved exactly as shot.
    /// [raw]: a DNG is kept with it (as the asset's alternate picture).
    func capturePhoto(look lookIn: Look, aspect frameAspect: Float, original: Bool, flash: Bool, raw: Bool, record: LookRecord?) {
        let halfFrame = lookIn.multiShot == "HALF_FRAME"
        var look = lookIn
        if halfFrame { look.frame = "NONE" }
        let turns = quarterTurns
        sessionQueue.async {
            guard self.session.isRunning, self.photoOutput.connection(with: .video) != nil else { return }
            let rawType = raw ? self.photoOutput.availableRawPhotoPixelFormatTypes.first { !AVCapturePhotoOutput.isAppleProRAWPixelFormat($0) } : nil
            let settings: AVCapturePhotoSettings
            if let rawType {
                settings = AVCapturePhotoSettings(rawPixelFormatType: rawType, processedFormat: [AVVideoCodecKey: AVVideoCodecType.jpeg])
                settings.photoQualityPrioritization = .balanced
            } else {
                settings = AVCapturePhotoSettings()
                settings.photoQualityPrioritization = .quality
            }
            settings.maxPhotoDimensions = self.photoOutput.maxPhotoDimensions
            settings.flashMode = flash && self.photoOutput.supportedFlashModes.contains(.on) ? .on : .off
            self.pendingPhotos[settings.uniqueID] = PendingPhoto(look: look, original: original, record: record, turns: turns,
                                                                 aspect: frameAspect, raw: nil, processed: nil, halfFrame: halfFrame)
            DispatchQueue.main.async { self.onDeveloping?(1) }
            self.photoOutput.capturePhoto(with: settings, delegate: self)
        }
    }

    private func developStill(_ data: Data, _ look: Look, turns: Int, aspect: Float, digital: Bool = false) -> Data? {
        guard let out = developStillImage(data, look, turns: turns, aspect: aspect, digital: digital) else { return nil }
        return Self.jpeg(out, meta: data)
    }

    /// A JPEG of [img], keeping the shot's EXIF (exposure, lens, time) from [meta] but not its
    /// orientation: ours is upright.
    static func jpeg(_ img: CGImage, meta: Data?) -> Data? {
        let result = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(result, UTType.jpeg.identifier as CFString, 1, nil) else { return nil }
        var props: [CFString: Any] = [kCGImageDestinationLossyCompressionQuality: 0.95,
                                      kCGImagePropertyOrientation: 1]
        if let meta, let source = CGImageSourceCreateWithData(meta as CFData, nil),
           let m = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any] {
            for key in [kCGImagePropertyExifDictionary, kCGImagePropertyTIFFDictionary, kCGImagePropertyGPSDictionary] {
                if var d = m[key] as? [CFString: Any] {
                    d.removeValue(forKey: kCGImagePropertyTIFFOrientation)
                    props[key] = d
                }
            }
        }
        CGImageDestinationAddImage(dest, img, props as CFDictionary)
        guard CGImageDestinationFinalize(dest) else { return nil }
        return result as Data
    }

    private func developStillImage(_ data: Data, _ look: Look, turns: Int, aspect: Float, digital: Bool) -> CGImage? {
        guard let renderer, let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        EAGLContext.setCurrent(context)
        let maxSide = min(GLU.maxTextureSize, 8192)
        let opts: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxSide,
            kCGImageSourceShouldCacheImmediately: true,
        ]
        guard let img = CGImageSourceCreateThumbnailAtIndex(source, 0, opts as CFDictionary) else { return nil }
        let uw = img.width, uh = img.height
        var sx: Float = 1, sy: Float = 1
        if Float(uw) / Float(uh) > aspect { sx = aspect * Float(uh) / Float(uw) } else { sy = Float(uw) / (aspect * Float(uh)) }
        let z = overscan(look)
        sx *= z; sy *= z
        let w = max(2, Int((Float(uw) * sx).rounded()) / 2 * 2)
        let h = max(2, Int((Float(uh) * sy).rounded()) / 2 * 2)
        let odd = turns % 2 == 1

        let tex = GLU.texture(from: img, mipmapped: true)
        let glow = Glow(w, h, format: renderer.glowFormat)
        defer {
            glow.release()
            GLU.delete(textures: [tex.tex])
            glBindFramebuffer(E(GL_FRAMEBUFFER), 0)
        }
        let src = FinalSource(image: tex.tex, previous: tex.tex, width: w, height: h,
                              imageMatrix: Mat.image(sx: sx, sy: sy), glow: glow)
        renderer.digitalExposure = digital
        renderer.updateOverlays(stamp: look.stamp, recording: false)
        renderer.glow(src, look, frameTurns: turns)
        // Text at the still's own size, at rest.
        applyText(src, turns: turns, time: -1, still: true)
        defer { if textSource != nil { renderer.textFront = 0; renderer.textBack = 0; renderer.subject = 0 } }
        return renderer.renderTiled(src, look, stillFx(look), w: odd ? h : w, h: odd ? w : h, turns: turns)
    }

    /// Forgets a waiting half frame (the look changed).
    func dropHalfFrame() {
        renderQueue.async {
            guard self.halfFrameFirst != nil else { return }
            self.halfFrameFirst = nil
            DispatchQueue.main.async { self.onHalfFrame?(false) }
        }
    }

    /// Two half frames side by side on dark film, each cut to 3:4 (HalfFrame.kt).
    private static func halfFramePair(_ a: CGImage, _ b: CGImage) -> CGImage? {
        let h = min(min(a.height, b.height), Int((Float(min(a.width, b.width)) * 4 / 3).rounded()))
        let w = Int((Float(h) * 3 / 4).rounded())
        let gap = Int((Float(h) * 0.025).rounded())
        let ow = w * 2 + gap * 3, oh = h + gap * 2
        guard let ctx = CGContext(data: nil, width: ow, height: oh, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return nil }
        ctx.setFillColor(CGColor(red: 10 / 255, green: 9 / 255, blue: 8 / 255, alpha: 1))
        ctx.fill(CGRect(x: 0, y: 0, width: ow, height: oh))
        ctx.interpolationQuality = .high
        for (i, img) in [a, b].enumerated() {
            let srcW = min(img.width, Int((Float(img.height) * 3 / 4).rounded()))
            let srcH = min(img.height, Int((Float(srcW) * 4 / 3).rounded()))
            guard let crop = img.cropping(to: CGRect(x: (img.width - srcW) / 2, y: (img.height - srcH) / 2, width: srcW, height: srcH)) else { continue }
            ctx.draw(crop, in: CGRect(x: gap + i * (w + gap), y: gap, width: w, height: h))
        }
        return ctx.makeImage()
    }

    /// Four quick exposures from the live view, 0.25 s apart, on one frame: the four-lens
    /// sampler camera. Each quarter is turned upright for how the phone is held.
    func captureSampler(look: Look, record: LookRecord?) {
        let turns = quarterTurns
        var quarter = look
        quarter.frame = "NONE"
        quarter.stamp = "NONE"
        DispatchQueue.main.async { self.onSampling?(true) }
        var shots: [CGImage] = []
        func shoot(_ i: Int) {
            renderQueue.asyncAfter(deadline: .now() + (i == 0 ? 0 : 0.25)) {
                guard let renderer = self.renderer, let p = self.pipeline else { finish(); return }
                EAGLContext.setCurrent(self.context)
                let odd = turns % 2 == 1
                let src = FinalSource(image: p.current, previous: p.previous, width: p.width, height: p.height, imageMatrix: Mat.identity, glow: p.glow)
                renderer.glow(src, quarter, frameTurns: turns)
                let saved = (renderer.textFront, renderer.textBack, renderer.subject)
                renderer.textFront = 0; renderer.textBack = 0; renderer.subject = 0
                if let img = renderer.renderTiled(src, quarter, self.fx, w: odd ? p.height : p.width, h: odd ? p.width : p.height, turns: turns) {
                    shots.append(img)
                }
                (renderer.textFront, renderer.textBack, renderer.subject) = saved
                if i < 3 { shoot(i + 1) } else { finish() }
            }
        }
        func finish() {
            DispatchQueue.main.async { self.onSampling?(false) }
            guard shots.count == 4, let grid = Self.grid(shots, light: look.frame == "WHITE" || look.frame == "MAT"),
                  let data = Self.jpeg(grid, meta: nil) else {
                report("Couldn't take the frames")
                return
            }
            DispatchQueue.main.async { self.onDeveloping?(1) }
            savePhoto(data, raw: nil, record: record)
        }
        shoot(0)
    }

    private static func grid(_ shots: [CGImage], light: Bool) -> CGImage? {
        let w = shots[0].width, h = shots[0].height
        let gutter = Int((Float(min(w, h)) * 0.03).rounded())
        let ow = w * 2 + gutter * 3, oh = h * 2 + gutter * 3
        guard let ctx = CGContext(data: nil, width: ow, height: oh, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return nil }
        ctx.setFillColor(light ? CGColor(red: 245 / 255, green: 244 / 255, blue: 240 / 255, alpha: 1)
                         : CGColor(red: 8 / 255, green: 8 / 255, blue: 8 / 255, alpha: 1))
        ctx.fill(CGRect(x: 0, y: 0, width: ow, height: oh))
        for (i, s) in shots.enumerated() {
            let x = gutter + (i % 2) * (w + gutter)
            // CoreGraphics counts rows from the bottom: the first row of shots goes on top.
            let y = oh - (gutter + (i / 2) * (h + gutter)) - h
            ctx.draw(s, in: CGRect(x: x, y: y, width: w, height: h))
        }
        return ctx.makeImage()
    }

    private func stillFx(_ look: Look) -> FrameFx {
        var out = FrameFx()
        let a = FxAnimator()
        let t = Float(Int(Date().timeIntervalSince1970 * 1000) % 100_000) / 10
        for _ in 0..<24 { a.next(look, time: t, &out) }
        out.slip = 0
        return out
    }

    private static func thumbnail(_ data: Data) -> UIImage? {
        guard let s = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let opts: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true,
                                     kCGImageSourceCreateThumbnailWithTransform: true,
                                     kCGImageSourceThumbnailMaxPixelSize: 240]
        guard let cg = CGImageSourceCreateThumbnailAtIndex(s, 0, opts as CFDictionary) else { return nil }
        return UIImage(cgImage: cg)
    }

    static func save(_ build: @escaping (PHAssetCreationRequest) -> Void, done: @escaping (Bool) -> Void) {
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            guard status == .authorized || status == .limited else { done(false); return }
            PHPhotoLibrary.shared().performChanges({ build(PHAssetCreationRequest.forAsset()) }) { ok, _ in done(ok) }
        }
    }

    private func savePhoto(_ data: Data, raw: Data?, record: LookRecord?) {
        let thumb = Self.thumbnail(data)
        MediaLibrary.savePhoto(data, raw: raw, look: record) { item in
            self.onDeveloping?(-1)
            self.onSaved?(item, thumb)
        }
    }
}

extension CameraEngine: AVCaptureVideoDataOutputSampleBufferDelegate, AVCaptureAudioDataOutputSampleBufferDelegate {
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        if output === audioOutput {
            if let lw = logWriter {
                lw.appendAudio(liveDenoiser?.process(sampleBuffer) ?? sampleBuffer)
                onAudioSample?(sampleBuffer)
                return
            }
            guard let wr = writer else { return }
            wr.appendAudio(liveDenoiser?.process(sampleBuffer) ?? sampleBuffer)
            onAudioSample?(sampleBuffer)
        } else {
            render(sampleBuffer)
        }
    }
}

extension CameraEngine: AVCapturePhotoCaptureDelegate {
    func photoOutput(_ output: AVCapturePhotoOutput, willCapturePhotoFor resolvedSettings: AVCaptureResolvedPhotoSettings) {
        // iOS plays its shutter sound itself; this silences it where the law allows.
        if !shutterSound { AudioServicesDisposeSystemSoundID(1108) }
    }

    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        let id = photo.resolvedSettings.uniqueID
        guard error == nil, let data = photo.fileDataRepresentation() else { return }
        sessionQueue.sync {
            if photo.isRawPhoto { pendingPhotos[id]?.raw = data } else { pendingPhotos[id]?.processed = data }
        }
    }

    func photoOutput(_ output: AVCapturePhotoOutput, didFinishCaptureFor resolvedSettings: AVCaptureResolvedPhotoSettings, error: Error?) {
        let pending = sessionQueue.sync { pendingPhotos.removeValue(forKey: resolvedSettings.uniqueID) }
        guard let job = pending, let data = job.processed else {
            DispatchQueue.main.async { self.onDeveloping?(-1) }
            report("Capture failed")
            return
        }
        // A picture that keeps the phone's own look is saved as shot, unless it was taken sideways
        // with a frame shape to cut (then it is developed like the rest).
        if job.original && job.turns == 0 && abs(job.aspect - 0.75) < 0.01 {
            savePhoto(data, raw: job.raw, record: job.record)
            return
        }
        if job.halfFrame {
            renderQueue.async {
                guard let img = self.developStillImage(data, job.look, turns: job.turns, aspect: job.aspect, digital: false) else {
                    DispatchQueue.main.async { self.onDeveloping?(-1) }
                    self.report("Could not develop the photo")
                    return
                }
                guard let first = self.halfFrameFirst else {
                    self.halfFrameFirst = img
                    DispatchQueue.main.async { self.onDeveloping?(-1); self.onHalfFrame?(true) }
                    return
                }
                self.halfFrameFirst = nil
                DispatchQueue.main.async { self.onHalfFrame?(false) }
                if let pair = Self.halfFramePair(first, img), let out = Self.jpeg(pair, meta: data) {
                    self.savePhoto(out, raw: nil, record: job.record)
                } else {
                    DispatchQueue.main.async { self.onDeveloping?(-1) }
                }
            }
            return
        }
        renderQueue.async {
            let out = self.developStill(data, job.look, turns: job.turns, aspect: job.aspect)
            if let out { self.savePhoto(out, raw: job.raw, record: job.record) } else {
                DispatchQueue.main.async { self.onDeveloping?(-1) }
                self.report("Could not develop the photo")
            }
        }
    }
}


/// A clip to develop into a new take.
struct ClipJob {
    var url: URL
    var look: Look
    /// Frame shape (upright width / height); nil keeps the clip's own.
    var aspect: Float?
    /// Text for each frame (TextRequest.time is the clip time in seconds).
    var text: TextLayerSource?
    var denoise = false
    var record: LookRecord?
}

// MARK: - Imports: developing pictures and clips from the library

extension CameraEngine {
    /// Shows [url] in the viewfinder instead of the camera, with the look on it.
    func startEdit(url: URL, video: Bool) {
        sessionQueue.async { if self.session.isRunning { self.session.stopRunning() } }
        renderQueue.async {
            self.stopEditLocked()
            EAGLContext.setCurrent(self.context)
            if video {
                let asset = AVURLAsset(url: url)
                let item = AVPlayerItem(asset: asset)
                item.videoComposition = AVMutableVideoComposition(propertiesOf: asset)
                let out = AVPlayerItemVideoOutput(pixelBufferAttributes: [
                    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
                    kCVPixelBufferOpenGLESCompatibilityKey as String: true,
                    kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
                ])
                item.add(out)
                let player = AVPlayer(playerItem: item)
                player.isMuted = true
                self.editLoop = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { _ in
                    player.seek(to: .zero)
                    player.play()
                }
                self.editPlayer = player
                self.editOutput = out
                DispatchQueue.main.async { player.play() }
            } else if let src = CGImageSourceCreateWithURL(url as CFURL, nil) {
                let opts: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true,
                                             kCGImageSourceCreateThumbnailWithTransform: true,
                                             kCGImageSourceThumbnailMaxPixelSize: 2048]
                if let img = CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary) {
                    self.editStill = GLU.texture(from: img, mipmapped: true)
                }
            }
            let timer = DispatchSource.makeTimerSource(queue: self.renderQueue)
            timer.schedule(deadline: .now(), repeating: 1.0 / 30)
            timer.setEventHandler { [weak self] in self?.renderEdit() }
            timer.resume()
            self.editTimer = timer
        }
    }

    /// Back to the camera (the caller restarts it).
    func stopEdit() {
        renderQueue.async { self.stopEditLocked() }
    }

    private func stopEditLocked() {
        editTimer?.cancel()
        editTimer = nil
        if let l = editLoop { NotificationCenter.default.removeObserver(l) }
        editLoop = nil
        editPlayer?.pause()
        editPlayer = nil
        editOutput = nil
        if let s = editStill {
            EAGLContext.setCurrent(context)
            GLU.delete(textures: [s.tex])
        }
        editStill = nil
        lastFilmFrame = -1
    }

    /// One viewfinder frame of the import.
    private func renderEdit() {
        guard active, let renderer, let cache else { return }
        EAGLContext.setCurrent(context)
        if let layer = pendingLayer {
            pendingLayer = nil
            target.attach(context, layer)
        }
        let now = CACurrentMediaTime()
        if timeBase < 0 { timeBase = now }
        var srcTex: GLuint = 0
        var bw = 0, bh = 0
        var cvTex: CVOpenGLESTexture?
        if let s = editStill {
            srcTex = s.tex; bw = s.w; bh = s.h
        } else if let out = editOutput {
            let t = out.itemTime(forHostTime: now)
            guard out.hasNewPixelBuffer(forItemTime: t), let pb = out.copyPixelBuffer(forItemTime: t, itemTimeForDisplay: nil) else { return }
            bw = CVPixelBufferGetWidth(pb); bh = CVPixelBufferGetHeight(pb)
            CVOpenGLESTextureCacheCreateTextureFromImage(kCFAllocatorDefault, cache, pb, nil, E(GL_TEXTURE_2D), GL_RGBA,
                                                         GLsizei(bw), GLsizei(bh), GLenum(0x80E1), E(GL_UNSIGNED_BYTE), 0, &cvTex)
            guard let c = cvTex else { return }
            srcTex = CVOpenGLESTextureGetName(c)
            glBindTexture(E(GL_TEXTURE_2D), srcTex)
            glTexParameteri(E(GL_TEXTURE_2D), E(GL_TEXTURE_MIN_FILTER), GL_LINEAR)
            glTexParameteri(E(GL_TEXTURE_2D), E(GL_TEXTURE_WRAP_S), GL_CLAMP_TO_EDGE)
            glTexParameteri(E(GL_TEXTURE_2D), E(GL_TEXTURE_WRAP_T), GL_CLAMP_TO_EDGE)
        } else {
            return
        }
        defer { CVOpenGLESTextureCacheFlush(cache, 0) }
        if !filmFrameDue(Spec.shared.fps(look.frameRate), now) { return }
        let (w, h) = frameSize(bw, bh)
        guard w >= 16, h >= 16 else { return }
        if pipeline == nil || pipeline!.width != w || pipeline!.height != h {
            pipeline?.release()
            pipeline = Pipeline(w, h, glowFormat: renderer.glowFormat)
        }
        let p = pipeline!
        let t = Float(now - timeBase)
        animator.next(look, time: t, &fx)
        fx.rollBurn = 0
        var sx: Float = 1, sy: Float = 1
        let ba = Float(bw) / Float(bh)
        if ba > aspect { sx = aspect / ba } else { sy = ba / aspect }
        let ov = overscan(look)
        let persistence = look.persistence(frameSeconds: 1 / 30)
        if persistence > 0 || look.interlace > 0 { p.keepPrevious() }
        renderer.digitalExposure = true
        renderer.updateOverlays(stamp: look.stamp, recording: false)
        renderer.develop(p, source: srcTex, texMatrix: Mat.image(sx: sx * ov, sy: sy * ov, dx: fx.weaveX, dy: -fx.weaveY), persistence: persistence)
        let src = FinalSource(image: p.current, previous: p.previous, width: p.width, height: p.height, imageMatrix: Mat.identity, glow: p.glow)
        renderer.glow(src, look, frameTurns: 0)
        applyText(src, turns: 0, time: t, still: false)
        if target.fbo != 0 {
            glBindFramebuffer(E(GL_FRAMEBUFFER), target.fbo)
            renderer.drawFinal(src, look, fx, targetW: target.width, targetH: target.height, targetRot: 0, frameRot: 0)
            target.present(context)
        }
        glBindFramebuffer(E(GL_FRAMEBUFFER), 0)
    }

    /// Develops an imported picture with [look] at full size and saves it as a new take.
    func developPhoto(url: URL, look: Look, aspect: Float, record: LookRecord?, done: @escaping (MediaItem?) -> Void) {
        DispatchQueue.main.async { self.onDeveloping?(1) }
        renderQueue.async {
            guard let data = try? Data(contentsOf: url), let out = self.developStill(data, look, turns: 0, aspect: aspect, digital: true) else {
                DispatchQueue.main.async { self.onDeveloping?(-1); done(nil) }
                return
            }
            let thumb = Self.thumbnail(out)
            MediaLibrary.savePhoto(out, look: record) { item in
                self.onDeveloping?(-1)
                if item != nil || thumb != nil { self.onSaved?(item, thumb) }
                done(item)
            }
        }
    }

    /// Develops a clip frame by frame (look, text, the clip's sound) into a new take.
    /// [progress] and [done] run on the main thread.
    func developClip(_ job: ClipJob, progress: @escaping (Float) -> Void, done: @escaping (MediaItem?) -> Void) {
        renderQueue.async {
            let url = self.runClip(job) { f in DispatchQueue.main.async { progress(f) } }
            guard let url else { DispatchQueue.main.async { done(nil) }; return }
            let thumb = Self.videoThumbnail(url)
            MediaLibrary.saveVideo(url, look: job.record) { item in
                if item != nil || thumb != nil { self.onSaved?(item, thumb) }
                done(item)
            }
        }
    }

    /// The developing itself, on the render queue; the finished file, or nil.
    private func runClip(_ job: ClipJob, progress: (Float) -> Void) -> URL? {
        guard let renderer, let cache else { return nil }
        EAGLContext.setCurrent(context)
        let asset = AVURLAsset(url: job.url)
        guard let track = asset.tracks(withMediaType: .video).first, let reader = try? AVAssetReader(asset: asset) else { return nil }
        let comp = AVMutableVideoComposition(propertiesOf: asset)
        let vout = AVAssetReaderVideoCompositionOutput(videoTracks: [track], videoSettings: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferOpenGLESCompatibilityKey as String: true,
            kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
        ])
        vout.videoComposition = comp
        vout.alwaysCopiesSampleData = false
        guard reader.canAdd(vout) else { return nil }
        reader.add(vout)
        var aout: AVAssetReaderTrackOutput?
        if let at = asset.tracks(withMediaType: .audio).first {
            let o = AVAssetReaderTrackOutput(track: at, outputSettings: [
                AVFormatIDKey: kAudioFormatLinearPCM, AVLinearPCMBitDepthKey: 16, AVLinearPCMIsFloatKey: false,
                AVLinearPCMIsBigEndianKey: false, AVLinearPCMIsNonInterleaved: false,
                AVSampleRateKey: 44_100, AVNumberOfChannelsKey: 1,
            ])
            if reader.canAdd(o) { reader.add(o); aout = o }
        }
        guard reader.startReading() else { return nil }

        // The output: the frame shape cut from the upright clip, up to 4K.
        let rw = Int(comp.renderSize.width), rh = Int(comp.renderSize.height)
        guard rw > 0, rh > 0 else { return nil }
        let a = job.aspect ?? Float(rw) / Float(rh)
        var cw = Float(rw), ch = Float(rh)
        if cw / ch > a { cw = ch * a } else { ch = cw / a }
        let scale = min(1, 3840 / max(cw, ch))
        let w = max(16, Int((cw * scale).rounded()) / 16 * 16), h = max(16, Int((ch * scale).rounded()) / 16 * 16)
        guard let wr = try? VideoWriter(width: w, height: h, audio: aout != nil, realtime: false) else { reader.cancelReading(); return nil }

        let look = job.look
        let pipe = Pipeline(w, h, glowFormat: renderer.glowFormat)
        let outTex = GLU.texture(w, h)
        let outFbo = GLU.framebuffer(outTex)
        let anim = FxAnimator()
        var frameFx = FrameFx()
        let savedText = textSource
        textSource = job.text
        defer {
            textSource = savedText
            pipe.release()
            GLU.delete(framebuffers: [outFbo]); GLU.delete(textures: [outTex])
            glBindFramebuffer(E(GL_FRAMEBUFFER), 0)
        }
        let duration = max(CMTimeGetSeconds(asset.duration), 0.01)
        let fps = Spec.shared.fps(look.frameRate)
        var lastFilm = -1.0
        var pendingAudio: CMSampleBuffer?
        var denoiser: ClipDenoiser? = job.denoise ? ClipDenoiser() : nil
        var frames = 0

        func pumpAudio(until t: Double) {
            guard let aout else { return }
            while true {
                if pendingAudio == nil { pendingAudio = aout.copyNextSampleBuffer() }
                guard let s = pendingAudio else { return }
                if CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(s)) > t { return }
                let outS = denoiser?.process(s) ?? s
                wr.appendAudioWaiting(outS)
                pendingAudio = nil
            }
        }

        while let sample = vout.copyNextSampleBuffer() {
            guard let pb = CMSampleBufferGetImageBuffer(sample) else { continue }
            let pts = CMSampleBufferGetPresentationTimeStamp(sample)
            let now = CMTimeGetSeconds(pts)
            // Stop-motion frame rates hold each picture: the frames between are left out.
            if fps > 0 {
                let interval = 1 / Double(fps)
                if lastFilm >= 0 && now - lastFilm < interval - 0.003 { continue }
                lastFilm = lastFilm < 0 ? now : lastFilm + interval
            }
            let bw = CVPixelBufferGetWidth(pb), bh = CVPixelBufferGetHeight(pb)
            var cvTex: CVOpenGLESTexture?
            CVOpenGLESTextureCacheCreateTextureFromImage(kCFAllocatorDefault, cache, pb, nil, E(GL_TEXTURE_2D), GL_RGBA,
                                                         GLsizei(bw), GLsizei(bh), GLenum(0x80E1), E(GL_UNSIGNED_BYTE), 0, &cvTex)
            guard let camTex = cvTex else { continue }
            let name = CVOpenGLESTextureGetName(camTex)
            glBindTexture(E(GL_TEXTURE_2D), name)
            glTexParameteri(E(GL_TEXTURE_2D), E(GL_TEXTURE_MIN_FILTER), GL_LINEAR)
            glTexParameteri(E(GL_TEXTURE_2D), E(GL_TEXTURE_WRAP_S), GL_CLAMP_TO_EDGE)
            glTexParameteri(E(GL_TEXTURE_2D), E(GL_TEXTURE_WRAP_T), GL_CLAMP_TO_EDGE)

            let t = Float(now)
            anim.next(look, time: t, &frameFx)
            frameFx.rollBurn = 0
            var sx: Float = 1, sy: Float = 1
            let ba = Float(bw) / Float(bh)
            if ba > a { sx = a / ba } else { sy = ba / a }
            let ov = overscan(look)
            let persistence = look.persistence(frameSeconds: 1 / 30)
            if persistence > 0 || look.interlace > 0 { pipe.keepPrevious() }
            renderer.digitalExposure = true
            renderer.updateOverlays(stamp: look.stamp, recording: false)
            renderer.develop(pipe, source: name, texMatrix: Mat.image(sx: sx * ov, sy: sy * ov, dx: frameFx.weaveX, dy: -frameFx.weaveY),
                             persistence: persistence)
            let src = FinalSource(image: pipe.current, previous: pipe.previous, width: pipe.width, height: pipe.height,
                                  imageMatrix: Mat.identity, glow: pipe.glow)
            renderer.glow(src, look, frameTurns: 0)
            applyText(src, turns: 0, time: t, still: false)
            glBindFramebuffer(E(GL_FRAMEBUFFER), outFbo)
            renderer.drawFinal(src, look, frameFx, targetW: w, targetH: h, targetRot: 0, frameRot: 0)

            guard let outPb = wr.nextBuffer() else { CVOpenGLESTextureCacheFlush(cache, 0); continue }
            var outCv: CVOpenGLESTexture?
            CVOpenGLESTextureCacheCreateTextureFromImage(kCFAllocatorDefault, cache, outPb, nil, E(GL_TEXTURE_2D), GL_RGBA,
                                                         GLsizei(w), GLsizei(h), GLenum(0x80E1), E(GL_UNSIGNED_BYTE), 0, &outCv)
            if let outCv {
                let fbo = GLU.framebuffer(CVOpenGLESTextureGetName(outCv))
                glBindFramebuffer(E(GL_READ_FRAMEBUFFER), outFbo)
                glBindFramebuffer(E(GL_DRAW_FRAMEBUFFER), fbo)
                glBlitFramebuffer(0, 0, GLint(w), GLint(h), 0, GLint(h), GLint(w), 0, E(GL_COLOR_BUFFER_BIT), E(GL_NEAREST))
                glFinish()
                GLU.delete(framebuffers: [fbo])
                wr.appendWaiting(outPb, at: pts)
            }
            CVOpenGLESTextureCacheFlush(cache, 0)
            pumpAudio(until: now + 0.5)
            frames += 1
            if frames % 8 == 0 { progress(Float(min(now / duration, 1))) }
        }
        pumpAudio(until: .infinity)
        if let d = denoiser, let tail = d.finish() { wr.appendAudioWaiting(tail) }
        denoiser = nil
        let ok = reader.status == .completed
        let sem = DispatchSemaphore(value: 0)
        var result: URL?
        wr.finish { u in result = u; sem.signal() }
        sem.wait()
        progress(1)
        if !ok, let r = result { try? FileManager.default.removeItem(at: r); return nil }
        return result
    }
}

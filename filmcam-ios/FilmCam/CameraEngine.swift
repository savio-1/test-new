import AVFoundation
import AudioToolbox
import CoreImage
import ImageIO
import OpenGLES
import Photos
import UIKit
import UniformTypeIdentifiers

struct ZoomStop: Equatable, Hashable {
    var label: String
    var factor: CGFloat
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

    // Main-thread callbacks.
    var onZoomStops: (([ZoomStop], CGFloat) -> Void)?
    var onSaved: ((UIImage?) -> Void)?
    var onRecording: ((Bool) -> Void)?
    var onError: ((String) -> Void)?

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
    private var active = true
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
    private var pendingPhotos: [Int64: (look: Look, original: Bool)] = [:]
    var shutterSound = true

    static let maxWorkSide = 1920

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

    func start(front: Bool, video: Bool) {
        sessionQueue.async {
            self.configure(front: front, video: video)
            self.choosePhotoSize()
            if !self.session.isRunning { self.session.startRunning() }
        }
    }

    func stop() {
        renderQueue.sync {
            active = false
            if writer != nil { finishRecording() }
            EAGLContext.setCurrent(context)
            glFinish()
        }
        sessionQueue.async { if self.session.isRunning { self.session.stopRunning() } }
    }

    func resume() {
        renderQueue.async { self.active = true }
        sessionQueue.async { if !self.session.isRunning { self.session.startRunning() } }
    }

    private static func backCamera() -> AVCaptureDevice? {
        for type: AVCaptureDevice.DeviceType in [.builtInTripleCamera, .builtInDualWideCamera, .builtInDualCamera, .builtInWideAngleCamera] {
            if let d = AVCaptureDevice.default(type, for: .video, position: .back) { return d }
        }
        return nil
    }

    private func configure(front: Bool, video: Bool) {
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

        let preset: AVCaptureSession.Preset = video ? (session.canSetSessionPreset(.hd1920x1080) ? .hd1920x1080 : .high) : .photo
        if session.canSetSessionPreset(preset) { session.sessionPreset = preset }

        if !session.outputs.contains(videoOutput), session.canAddOutput(videoOutput) {
            videoOutput.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
            videoOutput.alwaysDiscardsLateVideoFrames = true
            videoOutput.setSampleBufferDelegate(self, queue: renderQueue)
            session.addOutput(videoOutput)
        }
        // Stills come from the photo output; the viewfinder only needs screen-sized frames.
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

        for conn in [videoOutput.connection(with: .video), photoOutput.connection(with: .video)].compactMap({ $0 }) {
            if conn.isVideoRotationAngleSupported(90) { conn.videoRotationAngle = 90 }
            if conn.isVideoMirroringSupported {
                conn.automaticallyAdjustsVideoMirroring = false
                conn.isVideoMirrored = front
            }
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
        let w = wideFactor
        DispatchQueue.main.async { self.onZoomStops?(stops, w) }

        renderQueue.async {
            self.videoMode = video
            self.lastFilmFrame = -1
        }
    }

    /// 12 MP stills: full detail without the noise of the remosaiced 48 MP mode. Runs after
    /// the configuration is committed, when the new format is active.
    private func choosePhotoSize() {
        guard let dev = device else { return }
        let dims = dev.activeFormat.supportedMaxPhotoDimensions
            .filter { Int($0.width) * Int($0.height) <= 12_600_000 }
            .max { Int($0.width) * Int($0.height) < Int($1.width) * Int($1.height) }
        if let d = dims { photoOutput.maxPhotoDimensions = d }
    }

    private func setZoomLocked(_ dev: AVCaptureDevice, _ factor: CGFloat) {
        do {
            try dev.lockForConfiguration()
            dev.videoZoomFactor = min(max(factor, dev.minAvailableVideoZoomFactor), dev.maxAvailableVideoZoomFactor)
            dev.unlockForConfiguration()
        } catch {}
    }

    func zoom(to factor: CGFloat, animated: Bool = true) {
        sessionQueue.async {
            guard let dev = self.device else { return }
            do {
                try dev.lockForConfiguration()
                let f = min(max(factor, dev.minAvailableVideoZoomFactor), dev.maxAvailableVideoZoomFactor)
                if animated { dev.ramp(toVideoZoomFactor: f, withRate: 6) } else { dev.videoZoomFactor = f }
                dev.unlockForConfiguration()
            } catch {}
        }
    }

    var displayZoomDivisor: CGFloat { wideFactor }

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
        let scale = min(1, Float(Self.maxWorkSide) / max(cw, ch))
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
        guard active, let renderer, let cache, let pb = CMSampleBufferGetImageBuffer(sample) else { return }
        let pts = CMSampleBufferGetPresentationTimeStamp(sample)
        let now = CMTimeGetSeconds(pts)
        if !filmFrameDue(Spec.shared.fps(look.frameRate), now) { return }

        EAGLContext.setCurrent(context)
        if let layer = pendingLayer {
            pendingLayer = nil
            target.attach(context, layer)
        }

        let bw = CVPixelBufferGetWidth(pb), bh = CVPixelBufferGetHeight(pb)
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
        renderer.glow(src, look, frameTurns: 0)

        if target.fbo != 0 {
            glBindFramebuffer(E(GL_FRAMEBUFFER), target.fbo)
            renderer.drawFinal(src, look, fx, targetW: target.width, targetH: target.height, targetRot: 0, frameRot: 0)
            target.present(context)
        }
        if let wr = writer { record(src, wr, pts, now) }
        glBindFramebuffer(E(GL_FRAMEBUFFER), 0)
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
        renderer.drawFinal(src, look, fx, targetW: w, targetH: h, targetRot: 0, frameRot: 0)

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

    func startRecording(sound: Bool) {
        if sound { AudioServicesPlaySystemSound(1117) }
        renderQueue.async {
            guard self.writer == nil, let p = self.pipeline else { return }
            do {
                let audio = AVCaptureDevice.authorizationStatus(for: .audio) == .authorized
                self.writer = try VideoWriter(width: p.width, height: p.height, audio: audio)
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
        DispatchQueue.main.async { self.onRecording?(false) }
        wr.finish { url in
            guard let url else { self.report("Recording failed"); return }
            let thumb = Self.videoThumbnail(url)
            Self.save { req in req.addResource(with: .video, fileURL: url, options: nil) } done: { ok in
                try? FileManager.default.removeItem(at: url)
                DispatchQueue.main.async { self.onSaved?(ok ? thumb : nil) }
            }
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
    func capturePhoto(look: Look, original: Bool) {
        sessionQueue.async {
            guard self.session.isRunning, self.photoOutput.connection(with: .video) != nil else { return }
            let settings = AVCapturePhotoSettings()
            settings.photoQualityPrioritization = .quality
            settings.maxPhotoDimensions = self.photoOutput.maxPhotoDimensions
            settings.flashMode = .off
            self.pendingPhotos[settings.uniqueID] = (look, original)
            self.photoOutput.capturePhoto(with: settings, delegate: self)
        }
    }

    private func developStill(_ data: Data, _ look: Look) -> Data? {
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

        let tex = GLU.texture(from: img, mipmapped: true)
        let glow = Glow(w, h, format: renderer.glowFormat)
        defer {
            glow.release()
            GLU.delete(textures: [tex.tex])
            glBindFramebuffer(E(GL_FRAMEBUFFER), 0)
        }
        let src = FinalSource(image: tex.tex, previous: tex.tex, width: w, height: h,
                              imageMatrix: Mat.image(sx: sx, sy: sy), glow: glow)
        renderer.digitalExposure = false
        renderer.updateOverlays(stamp: look.stamp, recording: false)
        renderer.glow(src, look, frameTurns: 0)
        guard let out = renderer.renderTiled(src, look, stillFx(look), w: w, h: h) else { return nil }

        let result = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(result, UTType.jpeg.identifier as CFString, 1, nil) else { return nil }
        var props: [CFString: Any] = [kCGImageDestinationLossyCompressionQuality: 0.95,
                                      kCGImagePropertyOrientation: 1]
        // Keep the shot's EXIF (exposure, lens, time) but not its orientation: ours is upright.
        if let meta = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any] {
            for key in [kCGImagePropertyExifDictionary, kCGImagePropertyTIFFDictionary, kCGImagePropertyGPSDictionary] {
                if var d = meta[key] as? [CFString: Any] {
                    d.removeValue(forKey: kCGImagePropertyTIFFOrientation)
                    props[key] = d
                }
            }
        }
        CGImageDestinationAddImage(dest, out, props as CFDictionary)
        guard CGImageDestinationFinalize(dest) else { return nil }
        return result as Data
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

    private func savePhoto(_ data: Data) {
        let thumb = Self.thumbnail(data)
        Self.save { req in req.addResource(with: .photo, data: data, options: nil) } done: { ok in
            DispatchQueue.main.async { self.onSaved?(ok ? thumb : nil) }
        }
    }
}

extension CameraEngine: AVCaptureVideoDataOutputSampleBufferDelegate, AVCaptureAudioDataOutputSampleBufferDelegate {
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        if output === audioOutput {
            writer?.appendAudio(sampleBuffer)
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
        let pending = sessionQueue.sync { pendingPhotos.removeValue(forKey: id) }
        guard error == nil, let data = photo.fileDataRepresentation(), let job = pending else {
            report("Capture failed")
            return
        }
        if job.original {
            savePhoto(data)
            return
        }
        renderQueue.async {
            let out = self.developStill(data, job.look)
            if let out { self.savePhoto(out) } else { self.report("Could not develop the photo") }
        }
    }
}

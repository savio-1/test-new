import AVFoundation
import SwiftUI
import UIKit

enum Tray: Equatable { case none, looks, styles, adjust }

enum ToolGroup: String, CaseIterable { case basic = "Basic", light = "Light", film = "Film", lens = "Lens" }

/// One slider (see Tools.kt on Android).
struct Tool: Identifiable {
    let id: String
    let label: String
    let symbol: String
    let group: ToolGroup
    var min: Float = 0
    var max: Float = 1
    var signed = false
    let key: WritableKeyPath<Look, Float>

    func format(_ v: Float) -> String {
        if id == "exposure" { return String(format: "%+.1f", v) }
        if id == "grainsize" { return String(format: "%.1f", v) }
        let n = Int((v * 100).rounded())
        return signed ? (n > 0 ? "+\(n)" : "\(n)") : "\(n)"
    }

    static let all: [Tool] = [
        Tool(id: "exposure", label: "Exposure", symbol: "plusminus.circle", group: .basic, min: -2, max: 2, signed: true, key: \.exposureEv),
        Tool(id: "strength", label: "Strength", symbol: "film", group: .basic, key: \.intensity),
        Tool(id: "warmth", label: "Temp", symbol: "thermometer.medium", group: .basic, min: -1, signed: true, key: \.warmth),
        Tool(id: "tint", label: "Tint", symbol: "drop", group: .basic, min: -1, signed: true, key: \.tint),
        Tool(id: "contrast", label: "Contrast", symbol: "circle.lefthalf.filled", group: .basic, min: -1, signed: true, key: \.contrast),
        Tool(id: "highlights", label: "Highlights", symbol: "sun.max", group: .basic, min: -1, signed: true, key: \.highlights),
        Tool(id: "shadows", label: "Shadows", symbol: "moon", group: .basic, min: -1, signed: true, key: \.shadows),
        Tool(id: "saturation", label: "Saturation", symbol: "paintpalette", group: .basic, min: -1, signed: true, key: \.saturation),
        Tool(id: "vibrance", label: "Vibrance", symbol: "sparkles", group: .basic, min: -1, signed: true, key: \.vibrance),
        Tool(id: "clarity", label: "Clarity", symbol: "triangle", group: .basic, min: -1, signed: true, key: \.clarity),
        Tool(id: "sharpness", label: "Sharpness", symbol: "diamond", group: .basic, key: \.sharpness),
        Tool(id: "fade", label: "Fade", symbol: "aqi.low", group: .basic, key: \.fade),
        Tool(id: "halation", label: "Halation", symbol: "rays", group: .light, key: \.halation),
        Tool(id: "halsize", label: "Halo size", symbol: "circle.dashed", group: .light, key: \.halationSize),
        Tool(id: "bloom", label: "Bloom", symbol: "sun.haze", group: .light, key: \.bloom),
        Tool(id: "diffusion", label: "Mist", symbol: "cloud.fog", group: .light, key: \.diffusion),
        Tool(id: "streak", label: "Streaks", symbol: "line.3.horizontal", group: .light, key: \.streak),
        Tool(id: "leak", label: "Leaks", symbol: "flame", group: .light, key: \.lightLeak),
        Tool(id: "prism", label: "Prism", symbol: "rainbow", group: .light, key: \.prism),
        Tool(id: "flash", label: "Flash", symbol: "bolt", group: .light, key: \.flash),
        Tool(id: "grain", label: "Grain", symbol: "circle.grid.3x3", group: .film, key: \.grain),
        Tool(id: "grainsize", label: "Grain size", symbol: "circle.grid.2x2", group: .film, min: 0.6, max: 3, key: \.grainSize),
        Tool(id: "vignette", label: "Vignette", symbol: "camera.aperture", group: .film, key: \.vignette),
        Tool(id: "dust", label: "Dust", symbol: "allergens", group: .film, key: \.dust),
        Tool(id: "flicker", label: "Flicker", symbol: "lightbulb", group: .film, key: \.flicker),
        Tool(id: "weave", label: "Gate weave", symbol: "arrow.up.and.down.and.arrow.left.and.right", group: .film, key: \.gateWeave),
        Tool(id: "softness", label: "Softness", symbol: "drop.halffull", group: .lens, min: -1, signed: true, key: \.softness),
        Tool(id: "aberration", label: "Fringing", symbol: "circle.hexagongrid", group: .lens, key: \.aberration),
        Tool(id: "corners", label: "Toy lens", symbol: "viewfinder", group: .lens, key: \.cornerBlur),
        Tool(id: "fisheye", label: "Fisheye", symbol: "globe", group: .lens, key: \.distortion),
        Tool(id: "stereo", label: "3D", symbol: "eyeglasses", group: .lens, key: \.anaglyph),
    ]
}

@MainActor
final class AppModel: ObservableObject {
    let spec = Spec.shared
    let engine = CameraEngine()

    @Published private(set) var camera: FilmCamera
    @Published private(set) var look: Look
    @Published var tray: Tray = .none
    @Published var category: String = "ALL"
    @Published var toolGroup: ToolGroup = .basic
    @Published var toolId: String = "exposure"
    @Published private(set) var videoMode = false
    @Published private(set) var front = false
    @Published private(set) var recording = false
    @Published private(set) var recordingSince = Date()
    @Published private(set) var zoomStops: [ZoomStop] = []
    @Published private(set) var zoom: CGFloat = 1
    @Published private(set) var thumbnail: UIImage?
    @Published var message: String?
    @Published var showSettings = false
    @Published var flashShutter = false
    @Published var shutterSound: Bool {
        didSet {
            UserDefaults.standard.set(shutterSound, forKey: "shutterSound")
            engine.shutterSound = shutterSound
        }
    }

    /// Basic adjustments the user set: they stay as the look changes.
    private var basics: [WritableKeyPath<Look, Float>: Float] = [:]
    private var started = false

    var aspect: CGFloat { videoMode ? 9.0 / 16.0 : 3.0 / 4.0 }

    init() {
        let saved = UserDefaults.standard.string(forKey: "camera").flatMap { Spec.shared.camera($0) }
        let cam = saved ?? Spec.shared.original
        camera = cam
        look = cam.look
        shutterSound = UserDefaults.standard.object(forKey: "shutterSound") as? Bool ?? true
        engine.shutterSound = shutterSound
        engine.onZoomStops = { [weak self] stops, wide in
            self?.zoomStops = stops
            self?.zoom = wide
        }
        engine.onSaved = { [weak self] image in
            if let image { self?.thumbnail = image } else { self?.message = "Couldn't save to Photos" }
        }
        engine.onRecording = { [weak self] on in
            self?.recording = on
            if on { self?.recordingSince = Date() }
        }
        engine.onError = { [weak self] m in self?.message = m }
        pushLook()
    }

    // MARK: - Lifecycle

    func appear() {
        guard !started else { return }
        started = true
        AVCaptureDevice.requestAccess(for: .video) { ok in
            Task { @MainActor in
                if ok { self.engine.start(front: self.front, video: self.videoMode) } else { self.message = "Allow camera access in Settings to use FilmCam" }
            }
        }
    }

    func scenePhase(_ phase: ScenePhase) {
        guard started else { return }
        switch phase {
        case .active: engine.resume()
        case .background: engine.stop()
        default: break
        }
    }

    // MARK: - Looks

    var categories: [Category] { [Category(id: "ALL", label: "All")] + spec.categories.filter { c in spec.cameras.contains { $0.category == c.id } } }

    var visibleCameras: [FilmCamera] { category == "ALL" ? spec.cameras : spec.cameras.filter { $0.category == category } }

    func select(_ cam: FilmCamera) {
        camera = cam
        var l = cam.look
        l.style = look.style
        for (k, v) in basics { l[keyPath: k] = v }
        look = l
        UserDefaults.standard.set(cam.id, forKey: "camera")
        pushLook()
    }

    func value(_ tool: Tool) -> Float { look[keyPath: tool.key] }

    func set(_ tool: Tool, _ v: Float) {
        look[keyPath: tool.key] = v
        if tool.group == .basic { basics[tool.key] = v }
        pushLook()
    }

    func reset(_ tool: Tool) {
        basics.removeValue(forKey: tool.key)
        set(tool, camera.look[keyPath: tool.key])
        basics.removeValue(forKey: tool.key)
    }

    var adjusted: Bool { basics.contains { $0.value != camera.look[keyPath: $0.key] } }

    func resetAll() {
        basics = [:]
        var l = camera.look
        l.style = look.style
        look = l
        pushLook()
    }

    // MARK: - Styles

    func setStyle(_ id: String) {
        look.style.style = id
        if id == "STANDARD" { look.style.tone = 0; look.style.color = 0 }
        pushLook()
    }

    func setStylePad(tone: Float, color: Float) {
        look.style.tone = tone
        look.style.color = color
        pushLook()
    }

    func setPalette(_ v: Float) {
        look.style.palette = v
        pushLook()
    }

    private func pushLook() {
        engine.update(look: look, aspect: Float(aspect))
        engine.setExposure(look.exposureEv)
    }

    // MARK: - Camera

    func setVideoMode(_ on: Bool) {
        guard on != videoMode, !recording else { return }
        videoMode = on
        pushLook()
        let start = { self.engine.start(front: self.front, video: on) }
        if on && AVCaptureDevice.authorizationStatus(for: .audio) == .notDetermined {
            AVCaptureDevice.requestAccess(for: .audio) { _ in Task { @MainActor in start() } }
        } else {
            start()
        }
    }

    func flip() {
        guard !recording else { return }
        front.toggle()
        engine.start(front: front, video: videoMode)
    }

    func setZoom(_ stop: ZoomStop) {
        zoom = stop.factor
        engine.zoom(to: stop.factor)
    }

    func focus(_ p: CGPoint) { engine.focus(at: p, front: front) }

    /// The phone's own picture, untouched: saved exactly as the camera made it.
    private var isUntouched: Bool {
        guard camera.id == "original", look.style.isIdentity else { return false }
        var l = look
        l.exposureEv = camera.look.exposureEv
        l.style = camera.look.style
        return l == camera.look
    }

    func shutter() {
        if videoMode {
            if recording { engine.stopRecording(sound: shutterSound) } else { engine.startRecording(sound: shutterSound) }
            return
        }
        flashShutter = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) { self.flashShutter = false }
        engine.capturePhoto(look: look, original: isUntouched)
    }

    func openPhotos() {
        if let url = URL(string: "photos-redirect://") { UIApplication.shared.open(url) }
    }
}

/// Bundled tile pictures (shared with Android): looks/<camera>.jpg, styles/<style>.jpg.
enum Tiles {
    private static var cache: [String: UIImage] = [:]

    static func image(_ folder: String, _ name: String) -> UIImage? {
        let key = "\(folder)/\(name)"
        if let i = cache[key] { return i }
        guard let path = Bundle.main.path(forResource: name, ofType: "jpg", inDirectory: folder),
              let img = UIImage(contentsOfFile: path) else { return nil }
        cache[key] = img
        return img
    }
}

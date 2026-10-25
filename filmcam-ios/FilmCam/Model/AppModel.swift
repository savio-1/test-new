import AVFoundation
import Combine
import ImageIO
import SwiftUI
import UIKit

/// Everything the screen shows, and what it can ask for (UiState.kt and MainActivity.kt on
/// Android). Main thread only.
@MainActor
final class AppModel: ObservableObject {
    let spec = Spec.shared
    let engine = CameraEngine()
    let textOverlay = TextOverlay()
    private let prefs = UserDefaults.standard

    // look
    @Published private(set) var camera: FilmCamera
    @Published private(set) var look: Look
    @Published var category: String = "FUJI"
    @Published var lookShelf: LookShelf = .CATEGORY
    @Published private(set) var favourites: Set<String>
    /// Adjust values the person set (tool id to value); they carry over when the look changes.
    @Published private(set) var lookOverrides: [String: Float]
    /// Looks made from imported .cube files (Custom).
    @Published var userLooks: [FilmCamera] = []

    // chrome
    @Published var theme: ThemeMode
    @Published private(set) var mode: CaptureMode
    @Published var dock: Dock = .NONE
    @Published var quick: Quick?
    @Published var toolGroup: ToolGroup = .BASIC
    @Published var toolId = "exposure"
    /// True while a ruler or a text layer is dragged: everything else steps aside.
    @Published var adjusting = false
    @Published var settingsOpen = false
    @Published var screen: Screen = .CAMERA
    @Published var message: String?

    // capture
    @Published private(set) var hasCamera = false
    @Published private(set) var permissionAsked = false
    @Published private(set) var front = false
    @Published private(set) var recording = false
    @Published private(set) var recordStart = Date()
    @Published private(set) var savingVideo = false
    @Published private(set) var developing = 0
    @Published private(set) var thumbnail: UIImage?
    @Published private(set) var lastItem: MediaItem?
    @Published private(set) var flashPulse = 0
    /// Half frame: the first half is taken, the shutter takes the second.
    @Published private(set) var halfFramePending = false
    /// The four-lens sampler is taking its frames.
    @Published private(set) var sampling = false

    // timer and interval shooting
    @Published private(set) var timerSeconds: Int
    @Published private(set) var burstCount: Int
    @Published private(set) var burstInterval: Float
    /// Seconds left on the self-timer, 0 when it isn't running.
    @Published private(set) var countdown = 0
    /// Shots taken / due in a running burst; total 0 means "until stopped", -1 none running.
    @Published private(set) var burstTaken = 0
    @Published private(set) var burstTotal = -1
    var seriesRunning: Bool { countdown > 0 || burstTotal >= 0 }

    // camera hardware
    @Published private(set) var caps = CameraCaps()
    @Published private(set) var zoom: Float = 1
    @Published private(set) var zooming = false
    @Published private(set) var flash = false
    @Published private(set) var videoRes: VideoResolution
    @Published private(set) var fps: Int
    @Published private(set) var photoSize: PhotoSize?
    @Published private(set) var photoRatio: AspectRatio
    @Published private(set) var videoRatio: AspectRatio
    @Published private(set) var raw: Bool
    @Published private(set) var shutterSound: Bool
    @Published private(set) var realShutter: Bool
    @Published private(set) var stabilization: Bool
    @Published private(set) var voiceDenoise: Bool
    @Published private(set) var log: Bool
    @Published private(set) var logCurve: LogCurveChoice
    @Published private(set) var quarterTurns = 0

    // gallery, viewer and imports
    @Published private(set) var gallery: [MediaItem] = []
    @Published var viewing: MediaItem?
    @Published private(set) var edit: EditSession?
    /// Edit mode: nil keeps the imported picture's own shape.
    @Published private(set) var editRatio: AspectRatio?
    /// 0..1 while exporting or trimming, -1 otherwise.
    @Published var progress: Float = -1
    @Published var progressLabel = ""

    // text overlays
    @Published var textLayers: [TextLayer] = []
    @Published var selectedText: Int64?
    @Published var editingText = false
    /// A text layer is being moved on the viewfinder: every control steps out of the way.
    @Published var movingText = false

    private var started = false
    private var countdownTimer: Timer?
    private var burstTimer: Timer?
    private var zoomingTimer: Timer?
    private var orientationObserver: NSObjectProtocol?

    var isOriginal: Bool { camera.id == spec.original.id }
    var evMin: Float { caps.evMin }
    var evMax: Float { caps.evMax }
    var frameTurns: Int { edit != nil ? 0 : quarterTurns }
    var sideways: Bool { frameTurns % 2 == 1 }
    var hasFlash: Bool { caps.hasFlash }
    var rawSupported: Bool { caps.raw }
    /// Filming log right now: the file is flat 10-bit, without a look.
    var logActive: Bool { log && mode == .VIDEO && edit == nil && caps.logActive }
    /// The curve that will be used (Apple Log only on the phones that have it).
    var logCurveInUse: LogCurveChoice { logCurve == .APPLE_LOG && caps.appleLog ? .APPLE_LOG : .HLG }

    /// The frame shape in use, upright: the mode's ratio, or the imported picture's.
    var frameAspect: Float {
        if let e = edit { return editRatio?.value ?? e.aspect }
        return mode == .VIDEO ? videoRatio.value : photoRatio.value
    }

    var allLooks: [FilmCamera] { spec.cameras.filter { $0.category != "ORIGINAL" } + userLooks }
    var lookCategories: [Category] { spec.categories.filter { c in c.id != "ORIGINAL" } }

    var tools: [Tool] { Tools.all(evMin: evMin, evMax: evMax) }

    init() {
        let d = UserDefaults.standard
        let users = UserLooks.load()
        let savedId = d.string(forKey: "camera")
        let saved = savedId.flatMap { id in Spec.shared.camera(id) ?? users.first { $0.id == id } } ?? Spec.shared.original
        camera = saved
        userLooks = users
        favourites = Set(d.stringArray(forKey: "favourites") ?? [])
        lookOverrides = (d.dictionary(forKey: "lookOverrides") as? [String: Double])?.mapValues { Float($0) } ?? [:]
        theme = ThemeMode(rawValue: d.string(forKey: "theme") ?? "") ?? .DARK
        mode = CaptureMode(rawValue: d.string(forKey: "mode") ?? "") ?? .PHOTO
        videoRes = VideoResolution(rawValue: d.string(forKey: "videoRes") ?? "") ?? .FHD
        fps = d.object(forKey: "fps") as? Int ?? 30
        photoRatio = AspectRatio(rawValue: d.string(forKey: "photoRatio") ?? "") ?? .R3_4
        videoRatio = AspectRatio(rawValue: d.string(forKey: "videoRatio") ?? "") ?? .R9_16
        raw = d.bool(forKey: "raw")
        shutterSound = d.object(forKey: "shutterSound") as? Bool ?? true
        realShutter = d.bool(forKey: "realShutter")
        stabilization = d.object(forKey: "stabilization") as? Bool ?? true
        voiceDenoise = d.bool(forKey: "voiceDenoise")
        log = d.bool(forKey: "log")
        logCurve = LogCurveChoice(rawValue: d.string(forKey: "logCurve") ?? "") ?? .HLG
        timerSeconds = d.integer(forKey: "timer")
        burstCount = d.object(forKey: "burstCount") as? Int ?? 1
        burstInterval = d.object(forKey: "burstInterval") as? Float ?? 1
        if let mp = d.object(forKey: "photoMp") as? Int { photoSize = PhotoSize(width: mp * 1_000_000, height: 1) }
        if let cat = d.string(forKey: "category") { category = cat }
        if let shelf = LookShelf(rawValue: d.string(forKey: "lookShelf") ?? "") { lookShelf = shelf }
        textLayers = TextLayer.listFromJson(d.string(forKey: "textLayers"))
        look = saved.look
        look = withOverrides(saved.look)
        look.exposureEv = 0

        engine.shutterSound = shutterSound
        engine.voiceDenoise = voiceDenoise
        engine.onCaps = { [weak self] c in self?.capsChanged(c) }
        engine.onZoom = { [weak self] z in self?.zoom = z }
        engine.onSaved = { [weak self] item, thumb in self?.saved(item, thumb) }
        engine.onRecording = { [weak self] on in
            self?.recording = on
            if on { self?.recordStart = Date() }
        }
        engine.onSavingVideo = { [weak self] on in self?.savingVideo = on }
        engine.onHalfFrame = { [weak self] on in self?.halfFramePending = on }
        engine.onSampling = { [weak self] on in self?.sampling = on }
        engine.onDeveloping = { [weak self] d in if let s = self { s.developing = max(0, s.developing + d) } }
        engine.onError = { [weak self] m in self?.message = m }
        textOverlay.update(textLayers)
        engine.textSource = textOverlay
        pushLook()
    }

    // MARK: - Lifecycle

    func appear() {
        guard !started else { return }
        started = true
        UIDevice.current.beginGeneratingDeviceOrientationNotifications()
        orientationObserver = NotificationCenter.default.addObserver(forName: UIDevice.orientationDidChangeNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.orientationChanged() }
        }
        requestPermissions()
        watchLiveCaptions()
        smokeTestIfAsked()
        if MediaLibrary.canRead { refreshThumbnail() }
    }

    func requestPermissions() {
        AVCaptureDevice.requestAccess(for: .video) { ok in
            Task { @MainActor in
                self.permissionAsked = true
                self.hasCamera = ok
                if ok { self.openCamera() } else { self.message = "Allow the camera in Settings to use S film" }
            }
        }
    }

    func scenePhase(_ phase: ScenePhase) {
        guard started, hasCamera || edit != nil else { return }
        switch phase {
        case .active: engine.resume(camera: edit == nil)
        case .background:
            cancelSeries()
            engine.stop()
        default: break
        }
    }

    /// The camera rests while another page is open (and lets the clips there play out loud).
    func screenChanged(from old: Screen, to new: Screen) {
        guard hasCamera else { return }
        if old == .CAMERA && new != .CAMERA {
            cancelSeries()
            engine.stop()
            try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
            try? AVAudioSession.sharedInstance().setActive(true)
        } else if new == .CAMERA && old != .CAMERA {
            engine.resume(camera: edit == nil)
        }
    }

    private func orientationChanged() {
        // Clockwise quarter turns from portrait; face up/down keep the last one.
        let t: Int
        switch UIDevice.current.orientation {
        case .portrait: t = 0
        case .landscapeRight: t = 1
        case .portraitUpsideDown: t = 2
        case .landscapeLeft: t = 3
        default: return
        }
        guard t != quarterTurns else { return }
        quarterTurns = t
        engine.quarterTurns = t
    }

    private func openCamera() {
        var cfg = CameraConfig()
        cfg.front = front
        cfg.video = mode == .VIDEO
        cfg.videoRes = videoRes
        cfg.fps = fps
        cfg.photoSize = photoSize
        cfg.stabilization = stabilization
        if cfg.video && log { cfg.log = logCurve }
        if cfg.video && AVCaptureDevice.authorizationStatus(for: .audio) == .notDetermined {
            AVCaptureDevice.requestAccess(for: .audio) { _ in Task { @MainActor in self.engine.start(cfg) } }
        } else {
            engine.start(cfg)
        }
        engine.setTorch(flash)
    }

    private func capsChanged(_ c: CameraCaps) {
        caps = c
        zoom = c.zoom
        if let p = c.photoSize { photoSize = p }
        if !c.videoRes.contains(videoRes), let best = [VideoResolution.FHD, .UHD, .HD].first(where: { c.videoRes.contains($0) }) {
            videoRes = best
        }
        if !c.fps.contains(fps) && !c.fps.isEmpty { fps = c.fps.contains(30) ? 30 : c.fps.sorted().first! }
        if look.exposureEv < c.evMin || look.exposureEv > c.evMax { look.exposureEv = 0 }
        applyShutter()
    }

    // MARK: - Looks

    /// [look] with the person's own Adjust values on top (grain, halation... stay as they set them).
    private func withOverrides(_ base: Look) -> Look {
        let all = tools
        var l = base
        for (id, v) in lookOverrides where id != "exposure" {
            if let t = all.first(where: { $0.id == id }) { l = t.set(l, v) }
        }
        return l
    }

    func selectCamera(_ cam: FilmCamera) {
        if cam.look.multiShot != "HALF_FRAME" { engine.dropHalfFrame() }
        camera = cam
        var l = withOverrides(cam.look)
        l.exposureEv = look.exposureEv
        l.frame = look.frame
        l.stamp = look.stamp
        look = l
        prefs.set(cam.id, forKey: "camera")
        pushLook()
    }

    func removeLook() { selectCamera(spec.original) }

    func updateLook(_ l: Look) {
        let old = look
        look = l
        pushLook()
        if l.exposureEv != old.exposureEv { engine.setExposure(l.exposureEv) }
        if l.shutter != old.shutter { applyShutter() }
    }

    /// An Adjust tool moved: the value is kept for every look until it is set back or reset.
    func adjustTool(_ id: String, _ value: Float) {
        guard let tool = tools.first(where: { $0.id == id }) else { return }
        let own = tool.get(camera.look)
        if id == "exposure" || abs(value - own) < 1e-4 { lookOverrides.removeValue(forKey: id) } else { lookOverrides[id] = value }
        saveOverrides()
        updateLook(tool.set(look, value))
    }

    private func saveOverrides() {
        prefs.set(lookOverrides.mapValues { Double($0) }, forKey: "lookOverrides")
    }

    func resetLook() {
        lookOverrides = [:]
        saveOverrides()
        var l = camera.look
        l.exposureEv = 0
        l.frame = look.frame
        l.stamp = look.stamp
        updateLook(l)
    }

    func setIntensity(_ v: Float) {
        var l = look
        l.intensity = (v * 100).rounded() / 100
        updateLook(l)
    }

    func setFrame(_ id: String) { var l = look; l.frame = id; updateLook(l) }
    func setStamp(_ id: String) { var l = look; l.stamp = id; updateLook(l) }

    func toggleFavourite(_ id: String) {
        if favourites.contains(id) { favourites.remove(id) } else { favourites.insert(id) }
        prefs.set(Array(favourites), forKey: "favourites")
    }

    func setShelf(_ shelf: LookShelf, category c: String?) {
        lookShelf = shelf
        if let c { category = c }
        prefs.set(shelf.rawValue, forKey: "lookShelf")
        prefs.set(category, forKey: "category")
    }

    private func pushLook() {
        engine.update(look: look, aspect: frameAspect)
    }

    private func applyShutter() {
        engine.setShutter(real: realShutter && mode == .PHOTO && edit == nil, seconds: spec.shutterSeconds(look.shutter))
    }

    /// The record kept with each take: the look's id and name ("" for none).
    private var lookRecord: LookRecord { isOriginal ? LookRecord(id: "", name: "No look") : LookRecord(id: camera.id, name: camera.name) }

    // MARK: - Camera

    func setTheme(_ t: ThemeMode) {
        theme = t
        prefs.set(t.rawValue, forKey: "theme")
    }

    func setMode(_ m: CaptureMode) {
        guard m != mode, !recording else { return }
        cancelSeries()
        mode = m
        quick = nil
        prefs.set(m.rawValue, forKey: "mode")
        pushLook()
        applyShutter()
        openCamera()
    }

    func switchFacing() {
        guard !recording else { return }
        front.toggle()
        openCamera()
    }

    func setZoom(_ z: Float) { engine.zoom(to: z) }

    func pinch(_ scale: Float) {
        engine.zoom(by: scale)
        zooming = true
        zoomingTimer?.invalidate()
        zoomingTimer = Timer.scheduledTimer(withTimeInterval: 0.8, repeats: false) { [weak self] _ in
            Task { @MainActor in self?.zooming = false }
        }
    }

    /// Tap to focus and meter there ([x], [y] 0..1 in the viewfinder, y down).
    func tapToFocus(_ x: CGFloat, _ y: CGFloat) {
        engine.focus(at: CGPoint(x: x, y: y), front: front)
        if look.exposureEv != 0 { var l = look; l.exposureEv = 0; updateLook(l) }
    }

    func toggleFlash() {
        flash.toggle()
        engine.setTorch(flash)
    }

    func setRatio(_ r: AspectRatio?) {
        guard !recording else { return }
        if edit != nil {
            editRatio = r
            pushLook()
            return
        }
        guard let r else { return }
        if mode == .VIDEO { videoRatio = r; prefs.set(r.rawValue, forKey: "videoRatio") } else { photoRatio = r; prefs.set(r.rawValue, forKey: "photoRatio") }
        pushLook()
    }

    func setVideoResolution(_ r: VideoResolution) {
        guard !recording else { return }
        videoRes = r
        prefs.set(r.rawValue, forKey: "videoRes")
        openCamera()
    }

    func setFps(_ f: Int) {
        guard !recording else { return }
        fps = f
        prefs.set(f, forKey: "fps")
        openCamera()
    }

    func setPhotoSize(_ s: PhotoSize) {
        photoSize = s
        prefs.set(s.mp, forKey: "photoMp")
        openCamera()
    }

    func setRaw(_ on: Bool) { raw = on; prefs.set(on, forKey: "raw") }

    func setShutterSound(_ on: Bool) {
        shutterSound = on
        engine.shutterSound = on
        prefs.set(on, forKey: "shutterSound")
    }

    func setRealShutter(_ on: Bool) {
        realShutter = on
        prefs.set(on, forKey: "realShutter")
        applyShutter()
    }

    func setStabilization(_ on: Bool) {
        stabilization = on
        prefs.set(on, forKey: "stabilization")
        openCamera()
    }

    func setLog(_ on: Bool) {
        guard !recording else { return }
        log = on
        prefs.set(on, forKey: "log")
        if on { dock = .NONE }
        openCamera()
    }

    func setLogCurve(_ c: LogCurveChoice) {
        guard !recording else { return }
        logCurve = c
        prefs.set(c.rawValue, forKey: "logCurve")
        openCamera()
    }

    func setVoiceDenoise(_ on: Bool) {
        voiceDenoise = on
        engine.voiceDenoise = on
        prefs.set(on, forKey: "voiceDenoise")
    }

    func setTimer(_ s: Int) {
        timerSeconds = s
        prefs.set(s, forKey: "timer")
    }

    func setBurst(_ count: Int, _ interval: Float) {
        burstCount = count
        burstInterval = interval
        prefs.set(count, forKey: "burstCount")
        prefs.set(interval, forKey: "burstInterval")
    }

    // MARK: - Shutter, timer and bursts

    func shutter() {
        if edit != nil { saveEdit(); return }
        if seriesRunning { cancelSeries(); return }
        switch mode {
        case .PHOTO:
            if timerSeconds > 0 || burstCount != 1 { startSeries() } else { takePhoto() }
        case .VIDEO:
            if recording { stopRecording() } else if timerSeconds > 0 { startSeries() } else { startRecording() }
        }
    }

    private func takePhoto() {
        if look.multiShot == "SAMPLER" {
            guard !sampling else { return }
            engine.captureSampler(look: look, record: lookRecord)
            return
        }
        // Don't pile up full-size frames.
        if developing >= 2 { return }
        flashPulse += 1
        engine.capturePhoto(look: look, aspect: frameAspect, original: isUntouched, flash: flash && hasFlash, raw: raw && rawSupported, record: lookRecord)
    }

    /// The phone's own picture, untouched: saved exactly as the camera made it.
    private var isUntouched: Bool {
        guard isOriginal, look.style.isIdentity, textLayers.isEmpty else { return false }
        var l = look
        l.exposureEv = camera.look.exposureEv
        l.style = camera.look.style
        l.shutter = camera.look.shutter
        return l == camera.look
    }

    private func startRecording() {
        engine.startRecording(sound: shutterSound, record: lookRecord)
    }

    private func stopRecording() {
        engine.stopRecording(sound: shutterSound)
    }

    private func startSeries() {
        if timerSeconds > 0 {
            countdown = timerSeconds
            Haptics.tick()
            countdownTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
                Task { @MainActor in self?.countdownTick() }
            }
        } else {
            startBurst()
        }
    }

    private func countdownTick() {
        guard countdown > 0 else { return }
        countdown -= 1
        if countdown > 0 { Haptics.tick(); return }
        countdownTimer?.invalidate()
        countdownTimer = nil
        if mode == .VIDEO { startRecording() } else if burstCount != 1 { startBurst() } else { takePhoto() }
    }

    private func startBurst() {
        burstTaken = 0
        burstTotal = burstCount
        burstShot()
        burstTimer = Timer.scheduledTimer(withTimeInterval: TimeInterval(burstInterval), repeats: true) { [weak self] _ in
            Task { @MainActor in self?.burstShot() }
        }
    }

    private func burstShot() {
        guard burstTotal >= 0 else { return }
        takePhoto()
        burstTaken += 1
        if burstTotal > 0 && burstTaken >= burstTotal { endBurst() }
    }

    private func endBurst() {
        burstTimer?.invalidate()
        burstTimer = nil
        burstTotal = -1
    }

    func cancelSeries() {
        countdownTimer?.invalidate()
        countdownTimer = nil
        countdown = 0
        endBurst()
    }

    private func saved(_ item: MediaItem?, _ thumb: UIImage?) {
        if let thumb { thumbnail = thumb }
        if let item {
            lastItem = item
            if item.isVideo { videoSaved(item) }
            if screen == .GALLERY { refreshGallery() }
        } else if thumb == nil {
            message = "Couldn't save to Photos"
        }
    }

    private func refreshThumbnail() {
        DispatchQueue.global(qos: .userInitiated).async {
            let first = MediaLibrary.list().first
            guard let first else { return }
            MediaLibrary.thumbnail(first, side: 160) { img in
                Task { @MainActor in
                    if self.thumbnail == nil { self.thumbnail = img }
                    if self.lastItem == nil { self.lastItem = first }
                }
            }
        }
    }

    // MARK: - Gallery and viewer

    func refreshGallery() {
        DispatchQueue.global(qos: .userInitiated).async {
            let items = MediaLibrary.list()
            Task { @MainActor in self.gallery = items }
        }
    }

    func openGallery() {
        cancelSeries()
        dock = .NONE
        quick = nil
        MediaLibrary.requestAccess { ok in
            if !ok { self.message = "Allow access to Photos in Settings to see your shots here" }
            self.screen = .GALLERY
            self.refreshGallery()
        }
    }

    func closeGallery() { screen = .CAMERA }

    /// The viewer was opened from the camera's thumbnail: closing it goes back there.
    private var viewerFromCamera = false

    func openItem(_ item: MediaItem) {
        viewerFromCamera = screen == .CAMERA
        viewing = item
        screen = .VIEWER
    }

    func closeViewer() {
        viewing = nil
        screen = viewerFromCamera ? .CAMERA : .GALLERY
        viewerFromCamera = false
        refreshGallery()
    }

    /// The last shot, straight in the viewer.
    func openLast() {
        MediaLibrary.requestAccess { ok in
            guard ok else { self.message = "Allow access to Photos in Settings to see your shots here"; return }
            self.refreshGallery()
            if let item = self.lastItem ?? MediaLibrary.list().first { self.openItem(item) } else { self.screen = .GALLERY }
        }
    }

    func deleteItem(_ item: MediaItem) {
        MediaLibrary.delete([item]) { ok in
            guard ok else { return }
            if let i = self.gallery.firstIndex(of: item) {
                self.gallery.remove(at: i)
                if self.viewing == item {
                    self.viewing = self.gallery.isEmpty ? nil : self.gallery[min(i, self.gallery.count - 1)]
                    if self.viewing == nil { self.screen = .GALLERY }
                }
            }
            if self.lastItem == item {
                self.lastItem = self.gallery.first
                self.thumbnail = nil
                self.refreshThumbnail()
            }
        }
    }

    func trimItem(_ item: MediaItem, startMs: Int64, endMs: Int64) {
        progress = 0.5
        progressLabel = "Trimming"
        MediaLibrary.trim(item, startMs: startMs, endMs: endMs) { newItem in
            self.progress = -1
            if let newItem {
                self.refreshGallery()
                self.viewing = newItem
                self.message = "Saved the trimmed clip"
            } else {
                self.message = "Couldn't trim the clip"
            }
        }
    }

    func lookOf(_ item: MediaItem) -> LookRecord? { MediaLibrary.look(of: item) }

    /// Puts on the look a take was made with and goes back to the camera.
    func useLookOf(_ item: MediaItem) {
        guard let r = lookOf(item) else { return }
        if r.id.isEmpty { removeLook() } else if let cam = spec.camera(r.id) ?? userLooks.first(where: { $0.id == r.id }) { selectCamera(cam) }
        viewing = nil
        screen = .CAMERA
    }

    // MARK: - Imports (developing a picture or clip from the library)

    /// The library picker is open (to bring in a picture or clip to develop).
    @Published var pickingMedia = false

    func importMedia() {
        cancelSeries()
        pickingMedia = true
    }

    /// A picture or clip from the picker, copied to a temporary file.
    func imported(_ url: URL?, video: Bool) {
        guard let url else { message = "Couldn't open that file"; return }
        beginEdit(url, video: video)
    }

    /// Develops a picture or clip from the gallery with a look.
    func editItem(_ item: MediaItem) {
        progress = 0
        progressLabel = "Opening"
        MediaLibrary.file(item) { url in
            self.progress = -1
            guard let url else { self.message = "Couldn't open that file"; return }
            self.beginEdit(url, video: item.isVideo)
        }
    }

    private func beginEdit(_ url: URL, video: Bool) {
        var w = 0, h = 0
        var ms: Int64 = 0
        if video {
            let asset = AVURLAsset(url: url)
            if let t = asset.tracks(withMediaType: .video).first {
                let r = CGRect(origin: .zero, size: t.naturalSize).applying(t.preferredTransform)
                w = Int(abs(r.width)); h = Int(abs(r.height))
            }
            ms = Int64(CMTimeGetSeconds(asset.duration) * 1000)
        } else if let src = CGImageSourceCreateWithURL(url as CFURL, nil),
                  let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any] {
            w = props[kCGImagePropertyPixelWidth] as? Int ?? 0
            h = props[kCGImagePropertyPixelHeight] as? Int ?? 0
            let o = props[kCGImagePropertyOrientation] as? Int ?? 1
            if o >= 5 { swap(&w, &h) }
        }
        guard w > 0, h > 0 else { message = "Couldn't open that file"; return }
        if recording { return }
        edit = EditSession(url: url, video: video, width: w, height: h, durationMs: ms)
        editRatio = nil
        dock = .NONE
        quick = nil
        screen = .CAMERA
        viewing = nil
        pushLook()
        applyShutter()
        engine.startEdit(url: url, video: video)
    }

    func cancelEdit() {
        guard edit != nil else { return }
        engine.stopEdit()
        edit = nil
        editRatio = nil
        screen = .CAMERA
        pushLook()
        if hasCamera { openCamera() }
    }

    /// The shutter while developing: saves a developed copy (the original stays as it is).
    private func saveEdit() {
        guard let e = edit else { return }
        if !e.video {
            flashPulse += 1
            engine.developPhoto(url: e.url, look: look, aspect: frameAspect, record: lookRecord) { item in
                self.message = item != nil ? "Saved a developed copy" : "Couldn't save the photo"
            }
            return
        }
        progress = 0
        progressLabel = "Developing"
        let job = ClipJob(url: e.url, look: look, aspect: editRatio?.value, text: textLayers.isEmpty ? nil : textOverlay,
                          denoise: voiceDenoise, record: lookRecord)
        engine.developClip(job, progress: { self.progress = $0 }) { item in
            self.progress = -1
            self.message = item != nil ? "Saved a developed copy" : "Couldn't develop the clip"
        }
    }

    // MARK: - Subtitles

    /// The clip open in the subtitle editor, and its lines (nil when the editor is closed).
    @Published private(set) var subtitles: SubtitleSession?
    /// The person's Gemini API key (free from Google AI Studio) and the model to use.
    @Published private(set) var geminiKey = UserDefaults.standard.string(forKey: "geminiKey") ?? ""
    @Published private(set) var geminiModel = UserDefaults.standard.string(forKey: "geminiModel") ?? GeminiTranscriber.DEFAULT_MODEL
    /// Live subtitles while recording, the language spoken ("en" or "te"), the line heard
    /// just now, and what the recognizer is doing (for the CC pill).
    @Published private(set) var liveCaptions = UserDefaults.standard.bool(forKey: "liveCaptions")
    @Published private(set) var captionLanguage = UserDefaults.standard.string(forKey: "captionLanguage") ?? "en"
    @Published private(set) var liveCaption: String?
    @Published private(set) var captionState = ""
    /// The take whose live subtitles can be edited now ("Edit live subtitles ›").
    @Published private(set) var captionsFor: MediaItem?
    /// A .srt file to hand to the share sheet.
    @Published var subtitleShare: URL?

    /// Where closing the subtitle editor goes back to (the viewer, or the camera after a take).
    private var subtitlesReturn: Screen = .VIEWER
    private var transcriber: GeminiTranscriber?
    private var alignTask: Task<Void, Never>?
    private var captioner: LiveCaptioner?
    private var captionWatch: AnyCancellable?
    /// When the take being recorded started (live lines are timed on it), and the lines of the
    /// take just recorded, waiting for it to be saved.
    private var captionClipStart = Date()
    private var pendingCaptions: [Cue]?

    /// Opens [item] (a clip) in the subtitle editor, with the lines saved for it.
    func openSubtitles(_ item: MediaItem) {
        guard item.isVideo else { return }
        if screen != .SUBTITLES { subtitlesReturn = screen }
        // The font list is read once; have it ready before the editor asks.
        DispatchQueue.global(qos: .userInitiated).async { _ = FontLibrary.shared.families }
        SubtitleClip.load(item) { info in
            guard let info else { self.message = "Couldn't read the clip"; return }
            let saved = SubtitleStore.load(item.id)
            let s = SubtitleSession(item: item, url: info.url, aspect: info.aspect, durationMs: info.durationMs)
            s.track = saved
            self.subtitles = s
            self.screen = .SUBTITLES
            // Lines saved before words were timed (or live ones) get timed now.
            if let saved, WordAligner.needsAligning(saved) { self.scheduleAlign(s) }
        }
    }

    func closeSubtitles() {
        cancelSubtitles()
        subtitles = nil
        if subtitlesReturn == .CAMERA || (subtitlesReturn == .VIEWER && viewing == nil) {
            screen = .CAMERA
        } else {
            screen = subtitlesReturn
        }
    }

    func setGemini(key: String, model: String) {
        geminiKey = key.trimmingCharacters(in: .whitespacesAndNewlines)
        let m = model.trimmingCharacters(in: .whitespacesAndNewlines)
        geminiModel = m.isEmpty ? GeminiTranscriber.DEFAULT_MODEL : m
        prefs.set(geminiKey, forKey: "geminiKey")
        prefs.set(geminiModel, forKey: "geminiModel")
    }

    /// Sends the clip's sound to Gemini and makes subtitles of what is said.
    func generateSubtitles() {
        guard let s = subtitles, s.status == nil else { return }
        let key = geminiKey
        if key.isEmpty { s.error = "Add your Gemini API key first"; return }
        let t = GeminiTranscriber(apiKey: key, model: geminiModel)
        transcriber = t
        s.error = nil
        s.status = "Reading the sound"
        s.startedAt = Date()
        s.linesSoFar = 0
        let url = s.url
        let duration = s.durationMs
        // The reading and the request run off the main thread (they are nonisolated async).
        Task {
            var cues: [Cue] = []
            var failure: String?
            do {
                guard let audio = try await AudioExtract.extract(url) else { throw TranscribeError("This clip has no sound") }
                cues = try await t.transcribe(audio, durationMs: duration, onStatus: { @Sendable st in
                    Task { @MainActor in if self.transcriber === t { s.status = st } }
                }, onText: { @Sendable text in
                    // Each finished line carries an "end": count them as they stream in.
                    let n = text.components(separatedBy: "\"end\"").count - 1
                    Task { @MainActor in
                        if self.transcriber === t, s.status != nil { s.status = "Writing"; s.linesSoFar = n }
                    }
                })
            } catch let e as TranscribeError {
                failure = e.message
            } catch {
                failure = "Couldn't make subtitles (\(type(of: error)): \(error.localizedDescription))"
            }
            guard self.transcriber === t else { return }   // cancelled meanwhile
            self.transcriber = nil
            s.status = nil
            if let failure { s.error = failure; return }
            if cues.isEmpty { s.error = "No speech found in this clip"; return }
            // A clip spoken in Telugu opens on Telugu subtitles; otherwise English.
            let teluguMostly = cues.filter { $0.language.hasPrefix("te") }.count * 2 > cues.count
            var style = s.track?.style ?? SubtitleStyle()
            if s.track == nil && teluguMostly { style.language = .TELUGU }
            if self.subtitles === s { self.updateSubtitles(SubtitleTrack(cues, style)) }
        }
    }

    func cancelSubtitles() {
        guard let t = transcriber else { return }
        t.cancel()
        transcriber = nil
        if let s = subtitles { s.status = nil; s.error = "Cancelled" }
    }

    /// The track changed: kept with the clip, and any retyped words timed to the voice again.
    func updateSubtitles(_ track: SubtitleTrack) {
        guard let s = subtitles else { return }
        s.track = track
        SubtitleStore.save(track, for: s.item.id)
        if WordAligner.needsAligning(track) { scheduleAlign(s) }
    }

    /// Finds when each word of [s]'s lines is said (shortly after a change, so typing isn't
    /// held up), then puts the times on the track if it hasn't changed meanwhile.
    private func scheduleAlign(_ s: SubtitleSession, after ms: UInt64 = 500) {
        alignTask?.cancel()
        alignTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: ms * 1_000_000)
            guard !Task.isCancelled, let self, self.subtitles === s, let track = s.track,
                  WordAligner.needsAligning(track), !s.aligning else { return }
            s.aligning = true
            let url = s.url
            let probs = s.letterProbs
            let (aligned, lp) = await Task.detached(priority: .userInitiated) {
                await SubtitleAligning.align(url: url, letterProbs: probs, track: track)
            }.value
            s.aligning = false
            if let lp { s.letterProbs = lp }
            guard self.subtitles === s, let aligned else { return }
            // Changed while timing: time the new version instead.
            if s.track == track { self.updateSubtitles(aligned) } else { self.scheduleAlign(s, after: 100) }
        }
    }

    /// The lines as a SubRip file, handed to the share sheet (save to Files, AirDrop...).
    func saveSrt() {
        guard let s = subtitles, let track = s.track else { return }
        let lang = track.style.language
        let suffix = lang == .ENGLISH ? "en" : lang == .TELUGU ? "te" : "te-en"
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyyMMdd_HHmmss"
        let name = "FilmCam_\(f.string(from: Date())).\(suffix).srt"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        do {
            try Data(track.toSrt(lang).utf8).write(to: url, options: .atomic)
            subtitleShare = url
        } catch {
            message = "Couldn't save the .srt"
        }
    }

    /// Burns the subtitles into a copy of the clip: every frame goes through the engine with
    /// the plain Original look (no grain, no grade) and the words showing at its time as text.
    func burnSubtitles() {
        guard let s = subtitles, let track = s.track, progress < 0 else { return }
        let aspect = s.aspect
        let measurer = CoreTextMeasurer()
        let overlay = TextOverlay()
        overlay.layersAt = { @Sendable t in track.layersAt(Int64((Double(t) * 1000).rounded()), aspect: aspect, measurer: measurer) }
        progress = 0
        progressLabel = "Adding subtitles"
        // The copy keeps the look the clip was shot with (it is already in the picture).
        let job = ClipJob(url: s.url, look: spec.original.look, aspect: nil, text: overlay,
                          denoise: track.style.cleanVoice > 0, record: lookOf(s.item))
        engine.developClip(job, progress: { self.progress = $0 }) { item in
            self.progress = -1
            guard let item else { self.message = "Couldn't add the subtitles"; return }
            self.message = "Saved a copy with subtitles"
            self.refreshGallery()
            self.viewing = item
            if self.subtitles === s { self.subtitles = nil }
            self.screen = .VIEWER
        }
    }

    // MARK: Live subtitles

    /// Follows recording starting and stopping (the viewfinder's caption overlay calls this
    /// when it first appears).
    func watchLiveCaptions() {
        guard captionWatch == nil else { return }
        captionWatch = $recording.removeDuplicates().dropFirst().receive(on: DispatchQueue.main).sink { [weak self] on in
            self?.recordingChanged(on)
        }
    }

    private func recordingChanged(_ on: Bool) {
        if on {
            captionClipStart = Date()
            captionsFor = nil
            pendingCaptions = nil
            if liveCaptions { startCaptions() }
        } else {
            keepCaptions()
        }
    }

    /// Starts listening to the recording's own sound. Lines show on screen only; they are kept
    /// with the clip as subtitles to fix, style and burn in afterwards.
    private func startCaptions() {
        guard recording else { return }
        let c: LiveCaptioner
        if let existing = captioner {
            c = existing
        } else {
            c = LiveCaptioner()
            c.onCaption = { [weak self] t in self?.liveCaption = t }
            c.onState = { [weak self] st in self?.captionState = st }
            c.onProblem = { [weak self] msg in self?.message = msg }
            captioner = c
        }
        engine.onAudioSample = { @Sendable [weak c] buffer in c?.feed(buffer) }
        c.start(languageTag: captionLanguage == "te" ? "te-IN" : "en-US", clipStartedAt: captionClipStart)
    }

    /// Stops listening (captions turned off, or the take ended); the lines so far are kept.
    @discardableResult
    private func stopCaptions() -> [Cue] {
        engine.onAudioSample = nil
        let cues = captioner?.stop() ?? []
        liveCaption = nil
        captionState = ""
        return cues
    }

    /// The take ended: its live lines wait for the clip to be saved (see [videoSaved]).
    private func keepCaptions() {
        let cues = stopCaptions()
        captioner?.reset()
        pendingCaptions = cues.isEmpty ? nil : cues
    }

    /// A clip was just recorded and saved (live subtitles are kept with it).
    private func videoSaved(_ item: MediaItem) {
        guard let cues = pendingCaptions, !recording else { return }
        pendingCaptions = nil
        let te = cues.contains { $0.language == "te" }
        let en = cues.contains { $0.language != "te" }
        var style = SubtitleStyle()
        style.language = te && en ? .BOTH : te ? .TELUGU : .ENGLISH
        SubtitleStore.save(SubtitleTrack(cues, style), for: item.id)
        captionsFor = item
    }

    func setLiveCaptions(_ on: Bool) {
        guard on else {
            liveCaptions = false
            prefs.set(false, forKey: "liveCaptions")
            stopCaptions()
            return
        }
        LiveCaptioner.authorize { problem in
            if let problem { self.message = problem; return }
            self.liveCaptions = true
            self.prefs.set(true, forKey: "liveCaptions")
            self.startCaptions()
        }
    }

    func setCaptionLanguage(_ lang: String) {
        captionLanguage = lang
        prefs.set(lang, forKey: "captionLanguage")
        if liveCaptions && recording { stopCaptions(); startCaptions() }
    }

    /// Opens the take just recorded in the subtitle editor, on the lines heard live.
    func editLiveSubtitles() {
        guard let item = captionsFor, !recording, !savingVideo else { return }
        captionsFor = nil
        openSubtitles(item)
    }

    // MARK: - Imported LUTs

    /// The file picker is open for a .cube LUT (or a graded Hald image).
    @Published var pickingLut = false

    func importLut() { pickingLut = true }

    /// Reads the LUT, bakes it and puts it on.
    func importLut(from url: URL) {
        DispatchQueue.global(qos: .userInitiated).async {
            let result = Result { try UserLooks.importFile(url) }
            Task { @MainActor in
                switch result {
                case .success(let (cam, rough)):
                    self.userLooks.append(cam)
                    UserLooks.save(self.userLooks)
                    self.setShelf(.CATEGORY, category: "CUSTOM")
                    self.selectCamera(cam)
                    self.message = rough ? "Added \(cam.name), but some of its colours jump about (a watermark or text on the image?)"
                        : "Added \(cam.name)"
                case .failure(let e):
                    self.message = (e as? CubeException)?.description ?? "That file isn't a .cube LUT this app can read"
                }
            }
        }
    }

    func removeUserLook(_ id: String) {
        guard let cam = userLooks.first(where: { $0.id == id }) else { return }
        if camera.id == id { removeLook() }
        userLooks.removeAll { $0.id == id }
        UserLooks.save(userLooks)
        UserLooks.remove(id)
        message = "Removed \(cam.name)"
    }

    // MARK: - Text

    func setTextLayers(_ layers: [TextLayer]) {
        textLayers = layers
        textOverlay.update(layers)
        prefs.set(TextLayer.listToJson(layers), forKey: "textLayers")
    }

    /// Fonts for text and subtitles: bundled, imported and system faces.
    var fonts: FontLibrary { FontLibrary.shared }
    /// Bumped when fonts are imported, so the pickers list them.
    @Published var fontsVersion = 0
    /// What the text tray's ruler or panel changes.
    @Published var textTool: TextTool = .FONT
    /// What text set behind the subject goes behind: "People", or the picked subject.
    @Published var subjectLabel = "People"
    /// What the subject cut-out is doing ("Cutting out people", "No person in view", an error).
    @Published var subjectStatus = ""
    private var subjectBound = false

    var selectedLayer: TextLayer? { textLayers.first { $0.id == selectedText } }

    /// A new, empty text in the middle of the frame (without a shadow), being typed.
    func addText() {
        var new = TextLayer()
        new.text = ""
        new.x = 0.5
        new.y = 0.5
        setTextLayers(textLayers + [new])
        selectedText = new.id
        editingText = true
    }

    /// Puts [layer] in place of the layer with its id.
    func replaceText(_ layer: TextLayer) {
        setTextLayers(textLayers.map { $0.id == layer.id ? layer : $0 })
    }

    func deleteText(_ id: Int64) {
        setTextLayers(textLayers.filter { $0.id != id })
        if selectedText == id { selectedText = nil }
    }

    /// Hears from the subject cut-out (called when the text tray shows).
    func bindSubject() {
        guard !subjectBound else { return }
        subjectBound = true
        textOverlay.subjects.onStatus = { [weak self] s in self?.subjectStatus = s }
        textOverlay.subjects.onSubject = { [weak self] label in
            if let label { self?.subjectLabel = label } else { self?.message = "Nothing to cut out there: tap a person, pet or object" }
        }
    }

    /// Text behind the subject goes behind what is under ([x], [y]) (upright frame, 0..1, y down).
    func pickSubject(_ x: Float, _ y: Float) {
        bindSubject()
        textOverlay.subjects.pick(x, y)
    }

    /// Back to every person in the frame.
    func resetSubject() {
        textOverlay.subjects.reset()
        subjectLabel = "People"
    }

    /// Font files, or .zip files of a font folder: every face inside is added, grouped by family.
    func importFonts(_ urls: [URL]) {
        guard !urls.isEmpty else { return }
        DispatchQueue.global(qos: .userInitiated).async {
            let added = FontLibrary.shared.importAll(urls: urls)
            Task { @MainActor in self.fontsImported(added) }
        }
    }

    private func fontsImported(_ added: [String]) {
        if added.isEmpty { message = "No fonts this phone can read in that"; return }
        fontsVersion += 1
        var fams: [String] = []
        for k in added {
            if let f = fonts.entry(k)?.family, !fams.contains(f) { fams.append(f) }
        }
        message = fams.count == 1 ? "Added \(fams[0]) (\(added.count) style\(added.count == 1 ? "" : "s"))" : "Added \(fams.count) font families"
        // The first new family's regular goes on the selected text.
        if let f = fams.first, let main = fonts.families.first(where: { $0.name == f })?.main, var l = selectedLayer {
            l.font = main.key
            replaceText(l)
        }
    }
}

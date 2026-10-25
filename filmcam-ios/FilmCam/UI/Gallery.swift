import AVFoundation
import Combine
import Photos
import SwiftUI
import UIKit

// The gallery and the viewer (Gallery.kt on Android).

/// Thumbnails already loaded, by item and size, so the grid and the viewer don't flash.
private enum Thumbs {
    private static let cache: NSCache<NSString, UIImage> = {
        let c = NSCache<NSString, UIImage>()
        c.countLimit = 240
        return c
    }()

    private static func key(_ id: String, _ side: CGFloat) -> NSString { "\(id)@\(Int(side))" as NSString }
    static func get(_ id: String, _ side: CGFloat) -> UIImage? { cache.object(forKey: key(id, side)) }
    static func put(_ id: String, _ side: CGFloat, _ img: UIImage) { cache.setObject(img, forKey: key(id, side)) }
}

/// A take's thumbnail, faded in as it loads rather than popping. [side] is in pixels.
private struct ThumbImage: View {
    let item: MediaItem
    let side: CGFloat
    var fit = false
    @State var image: UIImage?

    init(item: MediaItem, side: CGFloat, fit: Bool = false) {
        self.item = item
        self.side = side
        self.fit = fit
        _image = State(initialValue: Thumbs.get(item.id, side))
    }

    var body: some View {
        ZStack {
            if let image {
                Image(uiImage: image).resizable().aspectRatio(contentMode: fit ? .fit : .fill)
                    .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.22), value: image != nil)
        .onAppear(perform: load)
    }

    private func load() {
        let id = item.id, px = self.side
        MediaLibrary.thumbnail(item, side: px) { img in
            guard let img else { return }
            DispatchQueue.main.async {
                Thumbs.put(id, px, img)
                image = img
            }
        }
    }
}

// MARK: - Gallery

/// Everything the app has shot, newest first, and the way in for imports.
struct GalleryScreen: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.palette) var p

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                IconCircle(glyph: Ico.back) { model.closeGallery() }
                Spacer().frame(width: 6)
                Text("Gallery").font(UiType.sans(20, .medium)).foregroundStyle(p.text)
                Spacer(minLength: 0)
                Button { model.importMedia() } label: {
                    HStack(spacing: 6) {
                        IconView(Ico.importIcon, size: 16, color: p.bg)
                        Text("Import").font(UiType.sans(13, .medium)).foregroundStyle(p.bg)
                    }
                    .padding(.horizontal, 14).padding(.vertical, 8)
                    .background(RoundedRectangle(cornerRadius: Corners.small).fill(p.text))
                    .contentShape(Rectangle())
                }
                .buttonStyle(GentlePress())
            }
            .frame(height: 56)
            .padding(.horizontal, 12)

            if model.gallery.isEmpty {
                VStack(spacing: 0) {
                    IconView(Ico.gallery, size: 30, color: p.muted)
                    Text("Nothing here yet").font(UiType.sans(18, .medium)).foregroundStyle(p.text).padding(.top, 14)
                    Text("Photos and clips you shoot appear here. Import brings in any photo or video from your phone to develop with a look.")
                        .font(UiType.sans(13)).foregroundStyle(p.muted).lineSpacing(5)
                        .multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 8)
                }
                .padding(36)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .transition(.opacity)
            } else {
                ScrollView {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 3), spacing: 4) {
                        ForEach(model.gallery) { item in
                            GalleryCell(item: item) { model.openItem(item) }
                        }
                    }
                    .padding(4)
                    .animation(.easeOut(duration: 0.25), value: model.gallery)
                }
                .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.22), value: model.gallery.isEmpty)
    }
}

/// One square of the grid: the thumbnail, and a clip's length in the corner.
private struct GalleryCell: View {
    @Environment(\.palette) var p
    let item: MediaItem
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Rectangle().fill(p.surfaceHigh)
                .aspectRatio(1, contentMode: .fit)
                .overlay { ThumbImage(item: item, side: 360) }
                .overlay(alignment: .bottomTrailing) {
                    if item.isVideo {
                        HStack(spacing: 3) {
                            IconView(Ico.play, size: 10, color: .white)
                            Text(clipLabel(item.durationMs)).font(UiType.mono(10)).foregroundStyle(.white)
                        }
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(RoundedRectangle(cornerRadius: Corners.small).fill(Color(argb: 0x88000000)))
                        .padding(5)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: Corners.small))
                .contentShape(Rectangle())
        }
        .buttonStyle(GentlePress())
        .transition(.opacity)
    }
}

// MARK: - Viewer

/// A file handed to the share sheet.
struct GalleryShareFile: Identifiable {
    let id = UUID()
    let url: URL
}

/// One photo or clip, full screen: play, trim, share, develop again or delete. Swipe left and
/// right for the next and previous take; the look each was made with sits at the top.
struct ViewerScreen: View {
    @EnvironmentObject var model: AppModel
    @State var trimming = false
    @State var confirmDelete = false
    @State var zoomed = false
    /// The page the pager is on; kept in step with `model.viewing`.
    @State var pageId: String?
    /// False until the pager has scrolled to the opened take (it would report the first one).
    @State var ready = false
    @State var share: GalleryShareFile?
    @State var preparingShare = false

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if let current = model.viewing {
                content(current)
            }
            if model.progress >= 0 {
                Text("\(model.progressLabel)  \(Int((model.progress * 100).rounded()))%")
                    .font(UiType.sans(14)).foregroundStyle(.white)
                    .padding(.horizontal, 18).padding(.vertical, 12)
                    .background(RoundedRectangle(cornerRadius: Corners.medium).fill(Color(argb: 0xCC000000)))
                    .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.2), value: model.progress >= 0)
        .sheet(item: $share) { f in
            ActivitySheet(items: [f.url])
                .presentationDetents([.medium, .large])
                .ignoresSafeArea()
        }
    }

    @ViewBuilder private func content(_ current: MediaItem) -> some View {
        // Everything in the gallery, or just this take until the gallery has loaded.
        let items = model.gallery.contains(current) ? model.gallery : [current]
        let index = items.firstIndex(of: current) ?? 0
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                DarkIcon(glyph: Ico.back) { model.closeViewer() }
                Spacer(minLength: 0)
                if items.count > 1 {
                    Text("\(index + 1) / \(items.count)").font(UiType.mono(11)).tracking(1)
                        .foregroundStyle(Color.white.opacity(0.55))
                }
                Spacer(minLength: 0)
                DarkIcon(glyph: Ico.gallery) { model.openGallery() }
            }
            .frame(height: 56)
            .padding(.horizontal, 12)

            ShotLook(item: current)

            pager(items)
                .frame(maxWidth: .infinity, maxHeight: .infinity)

            if !trimming {
                HStack(spacing: 0) {
                    ViewerAction(glyph: Ico.share, label: "Share") { shareItem(current) }
                    Spacer(minLength: 0)
                    ViewerAction(glyph: Ico.wand, label: "Develop") { model.editItem(current) }
                    if current.isVideo {
                        Spacer(minLength: 0)
                        ViewerAction(glyph: Ico.scissors, label: "Trim") { trimming = true }
                        Spacer(minLength: 0)
                        ViewerAction(glyph: Ico.subtitles, label: "Subtitles") { model.openSubtitles(current) }
                    }
                    Spacer(minLength: 0)
                    ViewerAction(glyph: Ico.trash, label: confirmDelete ? "Sure?" : "Delete", danger: confirmDelete) {
                        if confirmDelete {
                            model.deleteItem(current)
                        } else {
                            Haptics.tap()
                            confirmDelete = true
                        }
                    }
                }
                .padding(.horizontal, 18).padding(.vertical, 12)
                .transition(.opacity.combined(with: .offset(y: 12)))
            }
        }
        .animation(.easeOut(duration: 0.2), value: trimming)
        .animation(.easeOut(duration: 0.18), value: confirmDelete)
    }

    /// Takes side by side, a page each; only the one in view plays, its neighbours show a still.
    private func pager(_ items: [MediaItem]) -> some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 0) {
                    ForEach(items) { it in
                        page(it)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .containerRelativeFrame([.horizontal, .vertical])
                            .scrollTransition(.interactive, axis: .horizontal) { content, phase in
                                content
                                    .opacity(1 - 0.5 * abs(phase.value))
                                    .scaleEffect(1 - 0.06 * abs(phase.value))
                            }
                            .id(it.id)
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.paging)
            .scrollPosition(id: $pageId)
            .scrollDisabled(trimming || zoomed || items.count < 2)
            .opacity(ready ? 1 : 0)
            .animation(.easeOut(duration: 0.18), value: ready)
            .onAppear {
                guard let id = model.viewing?.id else { return }
                pageId = id
                proxy.scrollTo(id)
                Task { @MainActor in
                    try? await Task.sleep(nanoseconds: 50_000_000)
                    if let id = model.viewing?.id {
                        proxy.scrollTo(id)
                        pageId = id
                    }
                    ready = true
                }
            }
            .onChange(of: pageId) { _, id in
                // A swipe settled on another take.
                guard ready, let id, id != model.viewing?.id,
                      let it = model.gallery.first(where: { $0.id == id }) else { return }
                model.viewing = it
            }
            .onChange(of: model.viewing?.id) { _, id in
                trimming = false
                confirmDelete = false
                zoomed = false
                // Moved by the model (a delete or a trim): follow it.
                if let id, id != pageId {
                    pageId = id
                    proxy.scrollTo(id)
                }
            }
            .onChange(of: items.map(\.id)) { _, _ in
                // The list can arrive after the viewer opens: keep showing the same take.
                Task { @MainActor in
                    guard let id = model.viewing?.id else { return }
                    proxy.scrollTo(id)
                    pageId = id
                }
            }
        }
    }

    @ViewBuilder private func page(_ it: MediaItem) -> some View {
        let active = it.id == model.viewing?.id
        if it.isVideo && active {
            ClipPlayer(item: it, trimming: $trimming)
        } else if it.isVideo {
            ThumbImage(item: it, side: 720, fit: true)
        } else {
            PhotoPage(item: it) { z in if it.id == model.viewing?.id { zoomed = z } }
        }
    }

    private func shareItem(_ item: MediaItem) {
        guard !preparingShare else { return }
        preparingShare = true
        MediaLibrary.file(item) { url in
            preparingShare = false
            if let url { share = GalleryShareFile(url: url) } else { model.message = "Couldn't share this" }
        }
    }
}

/// The look a take was made with; tapping it puts that look on the camera.
private struct ShotLook: View {
    @EnvironmentObject var model: AppModel
    let item: MediaItem

    var body: some View {
        ZStack {
            if let look = model.lookOf(item) {
                let usable = !look.id.isEmpty
                Button { model.useLookOf(item) } label: {
                    HStack(spacing: 0) {
                        Text("SHOT WITH").font(UiType.mono(9)).tracking(1.4).foregroundStyle(Color.white.opacity(0.5))
                        Text(look.name).font(UiType.sans(13, .medium)).foregroundStyle(.white).lineLimit(1)
                            .padding(.leading, 8)
                        if usable {
                            Text("USE  ›").font(UiType.mono(9)).tracking(1.4).foregroundStyle(Color.white.opacity(0.7))
                                .padding(.leading, 10)
                        }
                    }
                    .padding(.horizontal, 10).padding(.vertical, 6)
                    .overlay(RoundedRectangle(cornerRadius: Corners.small).stroke(Color.white.opacity(0.16), lineWidth: 1))
                    .contentShape(Rectangle())
                }
                .buttonStyle(GentlePress())
                .allowsHitTesting(usable)
                .id(item.id)
                .transition(.asymmetric(insertion: .opacity.animation(.easeOut(duration: 0.2)),
                                        removal: .opacity.animation(.easeOut(duration: 0.14))))
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: 40)
        .animation(.easeOut(duration: 0.2), value: item.id)
    }
}

/// A white icon on the black viewer, whatever the theme.
private struct DarkIcon: View {
    let glyph: Glyph
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            IconView(glyph, size: 22, color: .white)
                .frame(width: 40, height: 40)
                .contentShape(Circle())
        }
        .buttonStyle(GentlePress())
    }
}

private struct ViewerAction: View {
    let glyph: Glyph
    let label: String
    var danger = false
    let action: () -> Void

    var body: some View {
        let tint = danger ? Color(argb: 0xFFF0553D) : Color.white
        Button(action: action) {
            VStack(spacing: 5) {
                IconView(glyph, size: 22, color: tint)
                Text(label).font(UiType.sans(11)).foregroundStyle(tint.opacity(0.8)).lineLimit(1)
            }
            .frame(width: 64)
            .padding(.vertical, 6)
            .contentShape(Rectangle())
        }
        .buttonStyle(GentlePress())
    }
}

/// The system share sheet.
private struct ActivitySheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}

// MARK: - Photo

/// A photo, fitted to the screen. Pinch to zoom and, once zoomed, drag to pan; double tap
/// zooms in or back out. An unzoomed swipe is left to the pager.
private struct PhotoPage: View {
    let item: MediaItem
    let onZoom: (Bool) -> Void
    @State var image: UIImage?
    @State var scale: CGFloat = 1
    @State var baseScale: CGFloat = 1
    @State var offset: CGSize = .zero
    @State var baseOffset: CGSize = .zero

    init(item: MediaItem, onZoom: @escaping (Bool) -> Void) {
        self.item = item
        self.onZoom = onZoom
        _image = State(initialValue: Thumbs.get(item.id, 720) ?? Thumbs.get(item.id, 360))
    }

    var body: some View {
        ZStack {
            if let image {
                Image(uiImage: image).resizable().scaledToFit()
                    .scaleEffect(scale)
                    .offset(offset)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .contentShape(Rectangle())
        .onTapGesture(count: 2) { toggleZoom() }
        .gesture(pan, including: scale > 1 ? .all : .subviews)
        .simultaneousGesture(pinch)
        .onAppear(perform: load)
    }

    private var pinch: some Gesture {
        MagnifyGesture()
            .onChanged { v in
                scale = min(max(baseScale * v.magnification, 1), 6)
                onZoom(scale > 1)
            }
            .onEnded { _ in
                if scale <= 1.01 { reset() } else { baseScale = scale }
                onZoom(scale > 1)
            }
    }

    private var pan: some Gesture {
        DragGesture()
            .onChanged { v in
                offset = CGSize(width: baseOffset.width + v.translation.width, height: baseOffset.height + v.translation.height)
            }
            .onEnded { _ in baseOffset = offset }
    }

    private func toggleZoom() {
        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
            if scale > 1 {
                reset()
            } else {
                scale = 2.5
                baseScale = 2.5
            }
        }
        onZoom(scale > 1)
    }

    private func reset() {
        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
            scale = 1
            offset = .zero
        }
        baseScale = 1
        baseOffset = .zero
    }

    private func load() {
        MediaLibrary.image(item, maxSide: 2560) { img in
            guard let img else { return }
            DispatchQueue.main.async { image = img }
        }
    }
}

// MARK: - Video

/// Plays one clip for the viewer: an AVPlayer that loops, its position, the trim range and the
/// frames of the trim strip.
private final class ClipController: ObservableObject {
    @Published var player: AVPlayer?
    @Published var duration: Int64
    @Published var position: Int64 = 0
    @Published var playing = true
    @Published var start: Int64 = 0
    @Published var end: Int64
    @Published var frames: [UIImage?] = Array(repeating: nil, count: 8)
    /// While trimming, only the part that will be kept plays.
    var trimming = false

    private var asset: AVAsset?
    private var timeObserver: Any?
    private var endObserver: NSObjectProtocol?
    private var generator: AVAssetImageGenerator?
    private var token = 0

    init(durationMs: Int64) {
        duration = durationMs
        end = durationMs
    }

    deinit { release() }

    func load(_ item: MediaItem) {
        guard player == nil else { return }
        token += 1
        let mine = token
        MediaLibrary.avAsset(item) { [weak self] asset in
            guard let self, let asset, self.token == mine else { return }
            self.asset = asset
            let player = AVPlayer(playerItem: AVPlayerItem(asset: asset))
            player.actionAtItemEnd = .none
            self.endObserver = NotificationCenter.default.addObserver(
                forName: .AVPlayerItemDidPlayToEndTime, object: player.currentItem, queue: .main
            ) { [weak self] _ in
                guard let self else { return }
                self.seek(self.trimming ? self.start : 0)
                if self.playing { self.player?.play() }
            }
            self.timeObserver = player.addPeriodicTimeObserver(forInterval: CMTime(value: 1, timescale: 10), queue: .main) { [weak self] t in
                self?.tick(t)
            }
            self.player = player
            if self.playing { player.play() }
            if self.trimming { self.loadFrames() }
        }
    }

    private func tick(_ t: CMTime) {
        if let d = player?.currentItem?.duration, d.isNumeric, d.seconds > 0 {
            let ms = Int64(d.seconds * 1000)
            if ms != duration {
                if end >= duration || end > ms { end = ms }
                duration = ms
            }
        }
        position = Int64(max(t.seconds.isFinite ? t.seconds : 0, 0) * 1000)
        if trimming && end > start && (position > end || position < start - 300) { seek(start) }
    }

    func seek(_ ms: Int64) {
        position = ms
        player?.seek(to: CMTime(value: ms, timescale: 1000), toleranceBefore: .zero, toleranceAfter: .zero)
    }

    func toggle() {
        guard let player else { return }
        if playing { player.pause() } else { player.play() }
        playing.toggle()
    }

    /// Eight frames across the clip, for the trim strip.
    func loadFrames() {
        guard let asset, generator == nil, duration > 0 else { return }
        let g = AVAssetImageGenerator(asset: asset)
        g.appliesPreferredTrackTransform = true
        g.maximumSize = CGSize(width: 160, height: 160)
        generator = g
        let d = duration
        let stamps: [Int64] = (0..<8).map { i in d * Int64(2 * i + 1) / 16 }
        let times = stamps.map { NSValue(time: CMTime(value: $0, timescale: 1000)) }
        g.generateCGImagesAsynchronously(forTimes: times) { [weak self] requested, image, _, _, _ in
            guard let image else { return }
            let ms = Int64((requested.seconds * 1000).rounded())
            guard let i = stamps.firstIndex(where: { abs($0 - ms) <= 2 }) else { return }
            let ui = UIImage(cgImage: image)
            DispatchQueue.main.async { self?.frames[i] = ui }
        }
    }

    func stop() {
        token += 1
        release()
        player = nil
        playing = true
    }

    private func release() {
        player?.pause()
        if let t = timeObserver { player?.removeTimeObserver(t) }
        timeObserver = nil
        if let e = endObserver { NotificationCenter.default.removeObserver(e) }
        endObserver = nil
        generator?.cancelAllCGImageGeneration()
        generator = nil
    }
}

private final class PlayerUIView: UIView {
    override class var layerClass: AnyClass { AVPlayerLayer.self }
    var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
}

/// The player's picture, fitted, with no system controls.
private struct PlayerSurface: UIViewRepresentable {
    let player: AVPlayer?

    func makeUIView(context: Context) -> PlayerUIView {
        let v = PlayerUIView()
        v.backgroundColor = .clear
        v.playerLayer.videoGravity = .resizeAspect
        v.playerLayer.player = player
        return v
    }

    func updateUIView(_ v: PlayerUIView, context: Context) {
        if v.playerLayer.player !== player { v.playerLayer.player = player }
    }
}

/// Plays a clip, with a scrubber and, while [trimming], a trim bar.
private struct ClipPlayer: View {
    @EnvironmentObject var model: AppModel
    let item: MediaItem
    @Binding var trimming: Bool
    @StateObject var clip: ClipController

    init(item: MediaItem, trimming: Binding<Bool>) {
        self.item = item
        _trimming = trimming
        _clip = StateObject(wrappedValue: ClipController(durationMs: item.durationMs))
    }

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                // The still sits under the player until its first frame is up.
                ThumbImage(item: item, side: 720, fit: true)
                PlayerSurface(player: clip.player)
                Color.clear.contentShape(Rectangle()).onTapGesture { clip.toggle() }
                if !clip.playing {
                    IconView(Ico.play, size: 30, color: .white)
                        .frame(width: 64, height: 64)
                        .background(Circle().fill(Color(argb: 0x66000000)))
                        .allowsHitTesting(false)
                        .transition(.opacity.combined(with: .scale(scale: 0.9)))
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .animation(.easeOut(duration: 0.16), value: clip.playing)

            if trimming && clip.duration > 0 {
                VStack(spacing: 0) {
                    TrimBar(clip: clip)
                    HStack(spacing: 0) {
                        Button {
                            clip.start = 0
                            clip.end = clip.duration
                            trimming = false
                        } label: {
                            Text("Cancel").font(UiType.sans(14)).foregroundStyle(.white)
                                .padding(.horizontal, 14).padding(.vertical, 9)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(GentlePress())
                        Spacer(minLength: 0)
                        Text("\(clipLabel(clip.end - clip.start)) kept").font(UiType.mono(12))
                            .foregroundStyle(Color.white.opacity(0.6))
                        Spacer(minLength: 0)
                        Button {
                            model.trimItem(item, startMs: clip.start, endMs: clip.end)
                            trimming = false
                        } label: {
                            Text("Save clip").font(UiType.sans(14, .semibold)).foregroundStyle(.black)
                                .padding(.horizontal, 16).padding(.vertical, 9)
                                .background(RoundedRectangle(cornerRadius: Corners.small).fill(Color.white))
                        }
                        .buttonStyle(GentlePress())
                    }
                    .padding(.horizontal, 18).padding(.vertical, 12)
                }
                .transition(.opacity.combined(with: .offset(y: 16)))
            } else if clip.duration > 0 {
                Scrubber(duration: clip.duration, position: clip.position) { clip.seek($0) }
                    .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.2), value: trimming)
        .onAppear {
            clip.trimming = trimming
            clip.load(item)
        }
        .onDisappear { clip.stop() }
        .onChange(of: trimming) { _, t in
            clip.trimming = t
            if t { clip.loadFrames() }
        }
    }
}

/// A thin seek bar with the time on either side.
private struct Scrubber: View {
    let duration: Int64
    let position: Int64
    let onSeek: (Int64) -> Void

    var body: some View {
        HStack(spacing: 0) {
            Text(clipLabel(position)).font(UiType.mono(11)).foregroundStyle(.white)
            GeometryReader { g in
                let w = max(g.size.width, 1)
                let f = CGFloat(min(max(Double(position) / Double(max(duration, 1)), 0), 1))
                ZStack(alignment: .leading) {
                    Rectangle().fill(Color.white.opacity(0.3)).frame(height: 2)
                    Rectangle().fill(Color.white).frame(width: w * f, height: 2)
                    Circle().fill(Color.white).frame(width: 12, height: 12).offset(x: w * f - 6)
                }
                .frame(width: w, height: g.size.height)
                .contentShape(Rectangle())
                .highPriorityGesture(DragGesture(minimumDistance: 0).onChanged { v in
                    let t = Int64(Double(v.location.x / w) * Double(duration))
                    onSeek(min(max(t, 0), duration))
                })
            }
            .frame(height: 32)
            .padding(.horizontal, 10)
            Text(clipLabel(duration)).font(UiType.mono(11)).foregroundStyle(Color.white.opacity(0.6))
        }
        .padding(.horizontal, 18).padding(.vertical, 6)
    }
}

/// Frames of the clip with two handles: the part between them is kept.
private struct TrimBar: View {
    @ObservedObject var clip: ClipController
    @State var dragStartFrom: Int64?
    @State var dragEndFrom: Int64?

    let handleW: CGFloat = 14
    let barH: CGFloat = 56

    var body: some View {
        GeometryReader { g in
            let w = max(g.size.width, 1)
            let d = max(clip.duration, 1)
            let minGap = min(Int64(500), d / 2)
            let a = x(clip.start, d, w)
            let b = x(clip.end, d, w)
            let px = x(clip.position, d, w)
            ZStack(alignment: .topLeading) {
                HStack(spacing: 0) {
                    ForEach(0..<clip.frames.count, id: \.self) { i in
                        Color.clear
                            .overlay {
                                if let f = clip.frames[i] {
                                    Image(uiImage: f).resizable().scaledToFill().transition(.opacity)
                                }
                            }
                            .clipped()
                    }
                }
                .frame(width: w, height: barH)
                .background(Color(argb: 0xFF222222))
                .clipShape(RoundedRectangle(cornerRadius: Corners.small))
                .animation(.easeOut(duration: 0.2), value: clip.frames.compactMap { $0 }.count)

                Canvas { ctx, size in
                    let dim = Color(argb: 0xAA000000)
                    ctx.fill(Path(CGRect(x: 0, y: 0, width: a, height: size.height)), with: .color(dim))
                    ctx.fill(Path(CGRect(x: b, y: 0, width: max(size.width - b, 0), height: size.height)), with: .color(dim))
                    ctx.stroke(Path(CGRect(x: a, y: 0, width: max(b - a, 0), height: size.height)), with: .color(.gold), lineWidth: 2)
                    var line = Path()
                    line.move(to: CGPoint(x: px, y: 0))
                    line.addLine(to: CGPoint(x: px, y: size.height))
                    ctx.stroke(line, with: .color(.white), lineWidth: 1.5)
                }
                .frame(width: w, height: barH)
                .allowsHitTesting(false)

                handle
                    .gesture(DragGesture(minimumDistance: 0, coordinateSpace: CoordinateSpace.named("trim"))
                        .onChanged { v in
                            let from = dragStartFrom ?? clip.start
                            if dragStartFrom == nil { dragStartFrom = from }
                            let ns = max(min(t(x(from, d, w) + v.translation.width, d, w), clip.end - minGap), 0)
                            if ns != clip.start {
                                clip.start = ns
                                clip.seek(ns)
                            }
                        }
                        .onEnded { _ in dragStartFrom = nil })
                    .offset(x: a - handleW)

                handle
                    .gesture(DragGesture(minimumDistance: 0, coordinateSpace: CoordinateSpace.named("trim"))
                        .onChanged { v in
                            let from = dragEndFrom ?? clip.end
                            if dragEndFrom == nil { dragEndFrom = from }
                            let ne = min(max(t(x(from, d, w) + v.translation.width, d, w), clip.start + minGap), d)
                            if ne != clip.end { clip.end = ne }
                        }
                        .onEnded { _ in dragEndFrom = nil })
                    .offset(x: b)
            }
            .frame(width: w, height: barH, alignment: .topLeading)
            .coordinateSpace(name: "trim")
        }
        .frame(height: barH)
        .padding(.horizontal, 18).padding(.vertical, 8)
    }

    private var handle: some View {
        RoundedRectangle(cornerRadius: Corners.small).fill(Color.gold)
            .overlay(RoundedRectangle(cornerRadius: Corners.small).stroke(Color(argb: 0x33000000), lineWidth: 1))
            .overlay(Rectangle().fill(Color(argb: 0x99000000)).frame(width: 2, height: 18))
            .frame(width: handleW, height: barH)
            .contentShape(Rectangle().inset(by: -8))
    }

    private func x(_ t: Int64, _ d: Int64, _ w: CGFloat) -> CGFloat { CGFloat(Double(t) / Double(d)) * w }
    private func t(_ x: CGFloat, _ d: Int64, _ w: CGFloat) -> Int64 { min(max(Int64(Double(x / w) * Double(d)), 0), d) }
}

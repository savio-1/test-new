import AVFoundation
import SwiftUI
import UIKit

// The clip playing in the subtitle editor with its subtitles drawn over it, exactly as they
// will be burnt in (SubVideo, ClipView and SubPlayer in SubtitleEditor.kt on Android).

/// Measures caption text with the real fonts (shared by the preview and its hit tests).
enum SubMeasure {
    static let shared = CoreTextMeasurer()
}

/// The clip's player, shared by the inline preview and the full-screen one: whether it is
/// playing, and where it is (published a few times a second for the play bar and the lines;
/// the captions read the player's own clock every frame).
@MainActor
final class SubPlayer: ObservableObject {
    let player: AVPlayer
    @Published private(set) var playing = true
    @Published private(set) var positionMs: Int64 = 0
    private var timeObserver: Any?
    private var endObserver: NSObjectProtocol?
    /// A seek on its way: the clock's old time isn't reported meanwhile, so the scrubber holds still.
    private var seekingTo: Int64?

    init(url: URL) {
        let p = AVPlayer(url: url)
        p.actionAtItemEnd = .none
        player = p
        timeObserver = p.addPeriodicTimeObserver(forInterval: CMTime(value: 1, timescale: 20), queue: .main) { [weak self] t in
            MainActor.assumeIsolated { self?.tick(t) }
        }
        // Loops, as the clip did on Android.
        endObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: p.currentItem, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.looped() }
        }
        p.play()
    }

    /// Where the clip is right now.
    var liveMs: Int64 {
        if seekingTo != nil { return positionMs }
        let s = CMTimeGetSeconds(player.currentTime())
        return s.isFinite ? Int64(s * 1000) : positionMs
    }

    private func tick(_ t: CMTime) {
        guard seekingTo == nil else { return }
        let s = CMTimeGetSeconds(t)
        if s.isFinite { positionMs = Int64(s * 1000) }
    }

    private func looped() {
        player.seek(to: .zero)
        if playing { player.play() }
    }

    func seek(_ ms: Int64) {
        positionMs = ms
        seekingTo = ms
        player.seek(to: CMTime(value: ms, timescale: 1000), toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] _ in
            Task { @MainActor in if self?.seekingTo == ms { self?.seekingTo = nil } }
        }
    }

    func play() { player.play(); playing = true }

    func pause() {
        player.pause()
        playing = false
        let s = CMTimeGetSeconds(player.currentTime())
        if s.isFinite && seekingTo == nil { positionMs = Int64(s * 1000) }
    }

    func toggle() { if playing { pause() } else { play() } }

    /// The editor closed: stop and let go.
    func close() {
        player.pause()
        if let o = timeObserver { player.removeTimeObserver(o); timeObserver = nil }
        if let o = endObserver { NotificationCenter.default.removeObserver(o); endObserver = nil }
    }
}

/// The clip's picture (an AVPlayerLayer), fitted inside its frame.
struct SubPlayerView: UIViewRepresentable {
    let player: AVPlayer

    final class Surface: UIView {
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
    }

    func makeUIView(context: Context) -> Surface {
        let v = Surface()
        v.backgroundColor = .black
        v.playerLayer.videoGravity = .resizeAspect
        v.playerLayer.player = player
        return v
    }

    func updateUIView(_ v: Surface, context: Context) {
        if v.playerLayer.player !== player { v.playerLayer.player = player }
    }
}

/// Picking words on the video (kinetic captions): the one picked, and how to pick another.
struct WordPick {
    let selected: String?
    let select: (String?) -> Void
}

/// [size] fitted inside [box] at [aspect] (width / height).
func subFit(_ box: CGSize, _ aspect: Float) -> CGSize {
    let a = CGFloat(max(aspect, 0.01))
    guard box.width > 0, box.height > 0 else { return .zero }
    return box.width / box.height > a ? CGSize(width: box.height * a, height: box.height) : CGSize(width: box.width, height: box.width / a)
}

/// What is on screen at [ms]. Kinetic: the words of the moment, as they will be burnt in (those
/// set behind the subject faded, as the preview has no cut-out). Classic: the line due now;
/// while placing with nothing due, the first line stands in.
func subLayers(_ track: SubtitleTrack?, _ ms: Int64, aspect: Float, movable: Bool) -> [TextLayer] {
    guard let track else { return [] }
    if track.style.kinetic {
        return track.layersAt(ms, aspect: aspect, measurer: SubMeasure.shared).map { l in
            guard l.behind else { return l }
            var f = l
            f.opacity *= 0.45
            return f
        }
    }
    guard let cue = track.at(ms) ?? (movable ? track.cues.first : nil) else { return [] }
    return track.layersFor(cue, aspect: aspect, measurer: SubMeasure.shared)
}

/// How kinetic captions mix with the picture, as near as the screen can show it.
func subBlend(_ b: TextBlend) -> BlendMode {
    switch b {
    case .NORMAL: return .normal
    case .SCREEN: return .screen
    case .ADD: return .plusLighter
    case .OVERLAY: return .overlay
    case .SOFT_LIGHT: return .softLight
    case .MULTIPLY: return .multiply
    case .DIFFERENCE: return .difference
    case .COLOR_DODGE: return .colorDodge
    }
}

/// The clip playing with its subtitles over it. Tap to pause; with [movable], drag the
/// subtitles to place them (they snap to the centre line). With [words], tap a word to pick it
/// and drag it anywhere.
struct SubVideo: View {
    @ObservedObject var s: SubtitleSession
    @ObservedObject var player: SubPlayer
    var movable = false
    var words: WordPick?
    let commit: (SubtitleTrack) -> Void

    @State var dragging = false
    @State var dragId: String?
    @State var dragFrom = CGPoint.zero

    var body: some View {
        GeometryReader { geo in
            let size = geo.size
            ZStack {
                SubPlayerView(player: player.player)
                if movable { SubGuides().allowsHitTesting(false) }
                SubCaptions(track: s.track, aspect: s.aspect, movable: movable, selected: words?.selected,
                            pausedMs: player.playing ? -1 : player.positionMs, player: player)
                    .equatable()
                    .allowsHitTesting(false)
                Color.clear.contentShape(Rectangle())
                    .gesture(tap(size))
                    .simultaneousGesture(drag(size))
                if !player.playing && words?.selected == nil {
                    IconView(Ico.play, size: 26, color: .white)
                        .frame(width: 54, height: 54)
                        .background(Circle().fill(Color(argb: 0x66000000)))
                        .allowsHitTesting(false)
                }
            }
        }
    }

    private func tap(_ size: CGSize) -> some Gesture {
        SpatialTapGesture().onEnded { e in
            subHideKeyboard()
            guard let wp = words else { player.toggle(); return }
            if let hit = wordAt(e.location, size, slop: 6) {
                player.pause()
                wp.select(hit)
            } else if wp.selected != nil {
                wp.select(nil)
            } else {
                player.toggle()
            }
        }
    }

    private func drag(_ size: CGSize) -> some Gesture {
        DragGesture(minimumDistance: 4).onChanged { g in
            let w = max(size.width, 1), h = max(size.height, 1)
            guard let t = s.track else { return }
            if let wp = words {
                // Drag a word: it is picked, the clip holds still, and the word goes where it is put.
                if !dragging {
                    dragging = true
                    dragId = nil
                    guard let id = wordAt(g.startLocation, size, slop: 10),
                          let placed = Kinetic.placedWord(t, id, aspect: s.aspect, measurer: SubMeasure.shared) else { return }
                    player.pause()
                    wp.select(id)
                    dragId = id
                    dragFrom = CGPoint(x: CGFloat(placed.x), y: CGFloat(placed.y))
                }
                guard let id = dragId,
                      let word = Kinetic.phraseOf(t, id)?.words.first(where: { $0.id == id }) else { return }
                let x0 = min(max(dragFrom.x + g.translation.width / w, 0.02), 0.98)
                let y = min(max(dragFrom.y + g.translation.height / h, 0.03), 0.97)
                // The centre line snaps, as with the classic block.
                let x = abs(x0 - 0.5) < 0.02 ? 0.5 : x0
                var e = t.edits[id].flatMap { $0.text == word.text ? $0 : nil } ?? WordEdit(text: word.text)
                e.x = Float(x)
                e.y = Float(y)
                s.track = t.withEdit(id, e)
            } else if movable {
                if !dragging {
                    dragging = true
                    dragFrom = CGPoint(x: CGFloat(t.style.x), y: CGFloat(t.style.y))
                }
                var x = min(max(dragFrom.x + g.translation.width / w, 0), 1)
                let y = min(max(dragFrom.y + g.translation.height / h, 0.03), 0.97)
                if t.style.align == .CENTER && abs(x - 0.5) < 0.025 { x = 0.5 }
                var moved = t
                moved.style.x = Float(x)
                moved.style.y = Float(y)
                s.track = moved
            }
        }.onEnded { _ in
            let moved = dragging && (words != nil ? dragId != nil : movable)
            dragging = false
            dragId = nil
            if moved, let t = s.track { commit(t) }
        }
    }

    /// The word under a touch, if any (the smallest one, when words overlap).
    private func wordAt(_ p: CGPoint, _ size: CGSize, slop: CGFloat) -> String? {
        guard let t = s.track, t.style.kinetic else { return nil }
        var best: (id: String, area: CGFloat)?
        for l in t.layersAt(player.liveMs, aspect: s.aspect, measurer: SubMeasure.shared) {
            let b = TextRenderer.blockSize(l, w: size.width, h: size.height)
            let inside = abs(p.x - CGFloat(l.x) * size.width) <= b.width / 2 + slop
                && abs(p.y - CGFloat(l.y) * size.height) <= b.height / 2 + slop
            if inside, best.map({ b.width * b.height < $0.area }) ?? true {
                best = (Kinetic.wordIdOf(l.id), b.width * b.height)
            }
        }
        return best?.id
    }
}

/// The subtitles over the picture: redrawn every frame while the clip plays, once when it is
/// held. Equatable, so the play bar ticking doesn't redraw them on top of that.
struct SubCaptions: View, Equatable {
    let track: SubtitleTrack?
    let aspect: Float
    let movable: Bool
    let selected: String?
    /// Where the clip is held, or -1 while it plays.
    let pausedMs: Int64
    let player: SubPlayer

    static func == (a: SubCaptions, b: SubCaptions) -> Bool {
        a.track == b.track && a.aspect == b.aspect && a.movable == b.movable && a.selected == b.selected
            && a.pausedMs == b.pausedMs && a.player === b.player
    }

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: pausedMs >= 0)) { _ in
            let ms = pausedMs >= 0 ? pausedMs : player.liveMs
            SubCaptionCanvas(layers: subLayers(track, ms, aspect: aspect, movable: movable), timeMs: ms, selected: selected)
        }
        .blendMode(track.map { $0.style.kinetic ? subBlend($0.style.blend) : .normal } ?? .normal)
    }
}

/// [layers] drawn as the renderer burns them in, with the picked word framed.
struct SubCaptionCanvas: View {
    let layers: [TextLayer]
    let timeMs: Int64
    let selected: String?

    var body: some View {
        Canvas { ctx, size in
            guard !layers.isEmpty else { return }
            ctx.withCGContext { cg in
                TextRenderer.draw(cg, layers, w: size.width, h: size.height, t: Float(timeMs) / 1000)
            }
            // The picked word, framed.
            if let sel = selected, let l = layers.first(where: { Kinetic.wordIdOf($0.id) == sel }) {
                let b = TextRenderer.blockSize(l, w: size.width, h: size.height)
                let pad: CGFloat = 4
                let r = CGRect(x: CGFloat(l.x) * size.width - b.width / 2 - pad, y: CGFloat(l.y) * size.height - b.height / 2 - pad,
                               width: b.width + 2 * pad, height: b.height + 2 * pad)
                ctx.stroke(Path(roundedRect: r, cornerRadius: 3), with: .color(SubInk.accent), lineWidth: 1.5)
            }
        }
    }
}

/// Thirds and centre guides while placing, and a frame round the picture.
struct SubGuides: View {
    var body: some View {
        Canvas { ctx, size in
            var p = Path()
            for f in [1.0 / 3, 0.5, 2.0 / 3] {
                p.move(to: CGPoint(x: size.width * f, y: 0)); p.addLine(to: CGPoint(x: size.width * f, y: size.height))
                p.move(to: CGPoint(x: 0, y: size.height * f)); p.addLine(to: CGPoint(x: size.width, y: size.height * f))
            }
            ctx.stroke(p, with: .color(.white.opacity(0.18)), lineWidth: 1)
            ctx.stroke(Path(CGRect(origin: .zero, size: size).insetBy(dx: 1, dy: 1)), with: .color(SubInk.accent.opacity(0.6)), lineWidth: 2)
        }
    }
}

/// The clip full screen with its subtitles, to check them before burning in.
struct SubFullScreen: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject var s: SubtitleSession
    @ObservedObject var player: SubPlayer
    let close: () -> Void

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            GeometryReader { geo in
                let box = subFit(geo.size, s.aspect)
                SubVideo(s: s, player: player) { t in model.updateSubtitles(t) }
                    .frame(width: box.width, height: box.height)
                    .position(x: geo.size.width / 2, y: geo.size.height / 2)
            }
            .ignoresSafeArea()
            VStack {
                HStack {
                    Button(action: close) {
                        IconView(Ico.close, size: 22, color: .white)
                            .frame(width: 42, height: 42)
                            .background(Circle().fill(Color(argb: 0x66000000)))
                    }
                    .buttonStyle(GentlePress())
                    Spacer()
                }
                .padding(8)
                Spacer()
                bottom
            }
        }
    }

    private var bottom: some View {
        VStack(spacing: 4) {
            HStack(spacing: 0) {
                SubPlayButton(player: player, size: 20)
                SubScrubber(player: player, durationMs: s.durationMs, fontSize: 12)
            }
            HStack(spacing: 8) {
                SubSecondary("Back to editing", action: close)
                Spacer()
                SubPrimary("Burn into video", enabled: model.progress < 0 && !(s.track?.cues.isEmpty ?? true)) { model.burnSubtitles() }
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 8)
        .background(Color(argb: 0x99000000).ignoresSafeArea(edges: .bottom))
    }
}

/// Play / pause.
struct SubPlayButton: View {
    @ObservedObject var player: SubPlayer
    var size: CGFloat = 18

    var body: some View {
        Button { player.toggle() } label: {
            IconView(player.playing ? Ico.pause : Ico.play, size: size, color: .white)
                .frame(width: 36, height: 36)
                .contentShape(Circle())
        }
        .buttonStyle(GentlePress())
    }
}

/// Where the clip is, a scrubber, and its length.
struct SubScrubber: View {
    @ObservedObject var player: SubPlayer
    let durationMs: Int64
    var fontSize: CGFloat = 11

    var body: some View {
        let dur = max(durationMs, 1)
        HStack(spacing: 0) {
            Text(subStamp(player.positionMs)).font(UiType.mono(fontSize)).foregroundStyle(.white)
            LineSlider(value: min(max(Float(player.positionMs) / Float(dur), 0), 1), onChange: { f in
                player.seek(Int64(f * Float(dur)))
            })
            .padding(.horizontal, 10)
            Text(subStamp(dur)).font(UiType.mono(fontSize)).foregroundStyle(SubInk.muted)
        }
    }
}

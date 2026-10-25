import AVFoundation
import Combine
import Foundation

// The subtitle editor's state (SubtitleSession in UiState.kt on Android), where each clip's
// track is kept, and the helpers the flow in AppModel leans on: reading a clip's shape and
// length, and timing words to the voice off the main thread.

/// The editor's tools, along the bottom; each opens one short panel over the rail.
enum SubTool: String, CaseIterable {
    case LINES, STYLE, TEXT, EFFECTS, MOTION, WORDS, PLACE, SOUND, MORE

    var label: String {
        switch self {
        case .LINES: return "Lines"
        case .STYLE: return "Style"
        case .TEXT: return "Text"
        case .EFFECTS: return "Effects"
        case .MOTION: return "Motion"
        case .WORDS: return "Words"
        case .PLACE: return "Position"
        case .SOUND: return "Sound"
        case .MORE: return "More"
        }
    }

    /// Classic lines are placed as a block; kinetic captions word by word, and they move.
    static func toolsFor(_ track: SubtitleTrack?) -> [SubTool] {
        track?.style.kinetic == true
            ? [.LINES, .STYLE, .TEXT, .EFFECTS, .MOTION, .WORDS, .SOUND, .MORE]
            : [.LINES, .STYLE, .TEXT, .EFFECTS, .PLACE, .SOUND, .MORE]
    }
}

/// A clip open in the subtitle editor: its lines, and what the editor is doing with them.
@MainActor
final class SubtitleSession: ObservableObject {
    let item: MediaItem
    /// The clip's file (to play, listen to and burn into), its shape upright (width / height)
    /// and its length.
    let url: URL
    let aspect: Float
    let durationMs: Int64

    @Published var track: SubtitleTrack?
    /// "Listening" etc. while transcribing; nil when idle.
    @Published var status: String?
    @Published var error: String?
    /// When transcription started (elapsed time on screen) and lines received so far.
    @Published var startedAt = Date()
    @Published var linesSoFar = 0
    /// The editor's open tool (nil: none, the clip as big as it gets), and the word picked in Words (by id).
    @Published var tool: SubTool?
    @Published var selectedWord: String?
    /// Words are being timed to the voice.
    @Published var aligning = false
    /// The clip's letter probabilities (worked out once, kept for re-timing retyped lines).
    var letterProbs: LetterLogProbs?

    init(item: MediaItem, url: URL, aspect: Float, durationMs: Int64) {
        self.item = item
        self.url = url
        self.aspect = aspect
        self.durationMs = durationMs
    }
}

/// Each clip's subtitles, kept as JSON (the same shape Android saves) in Application Support,
/// by the clip's Photos id. Writes go one at a time, in order, off the main thread.
enum SubtitleStore {
    private static let queue = DispatchQueue(label: "filmcam.subtitles.store", qos: .utility)

    private static var dir: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory())
        let d = base.appendingPathComponent("subtitles")
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }

    /// The file for a clip (Photos ids hold slashes: anything but letters and digits becomes "_").
    static func file(_ id: String) -> URL {
        let safe = String(id.unicodeScalars.map { c -> Character in
            c.isASCII && (CharacterSet.alphanumerics.contains(c) || c == "-") ? Character(c) : "_"
        })
        return dir.appendingPathComponent(safe + ".json")
    }

    static func load(_ id: String) -> SubtitleTrack? {
        guard let data = try? Data(contentsOf: file(id)) else { return nil }
        return SubtitleTrack.fromJson(data)
    }

    static func save(_ track: SubtitleTrack, for id: String) {
        let data = track.toJson()
        let url = file(id)
        queue.async { try? data.write(to: url, options: .atomic) }
    }
}

/// What the editor needs to know about a clip before it opens: a file to read, its shape
/// upright and its length (MediaLibrary.videoInfo on Android).
enum SubtitleClip {
    struct Info {
        let url: URL
        let aspect: Float
        let durationMs: Int64
    }

    /// Reads [item]; [done] runs on the main thread (nil: the clip couldn't be read).
    @MainActor
    static func load(_ item: MediaItem, done: @escaping (Info?) -> Void) {
        MediaLibrary.avAsset(item) { asset in
            // A clip in Photos usually comes as its own file; anything else (a slow-motion
            // composition, say) is written out to a temporary one first.
            if let u = asset as? AVURLAsset {
                Task { done(await info(u.url)) }
            } else {
                MediaLibrary.file(item) { url in
                    guard let url else { done(nil); return }
                    Task { done(await info(url)) }
                }
            }
        }
    }

    static func info(_ url: URL) async -> Info? {
        let asset = AVURLAsset(url: url)
        guard let track = try? await asset.loadTracks(withMediaType: .video).first,
              let shape = try? await track.load(.naturalSize, .preferredTransform),
              let duration = try? await asset.load(.duration) else { return nil }
        let r = CGRect(origin: .zero, size: shape.0).applying(shape.1)
        let w = abs(r.width), h = abs(r.height)
        guard w > 0, h > 0 else { return nil }
        let secs = CMTimeGetSeconds(duration)
        return Info(url: url, aspect: Float(w / h), durationMs: secs.isFinite ? Int64(secs * 1000) : 0)
    }
}

/// Times each word of a track to the voice: the clip's sound through the small model once
/// (kept as letter probabilities), then each cue forced through them. Call off the main thread.
enum SubtitleAligning {
    /// The bundled model, read the first time it is needed (nil if it can't be).
    static let model: AlignModel? = try? AlignModel.bundled()

    /// [track] with its words timed, and the clip's letter probabilities (worked out here when
    /// [letterProbs] is nil). A nil track: there is no model to time with.
    static func align(url: URL, letterProbs: LetterLogProbs?, track: SubtitleTrack) async -> (SubtitleTrack?, LetterLogProbs?) {
        guard let model else { return (nil, letterProbs) }
        var lp = letterProbs
        if lp == nil {
            let pcm = (try? await AudioExtract.pcm16k(url)) ?? nil
            lp = model.logProbs(pcm ?? [])
        }
        guard let probs = lp else { return (nil, nil) }
        return (WordAligner(model: model).alignWith(probs, track), probs)
    }
}

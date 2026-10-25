import Foundation

// The camera's choices and the screen's places (UiState.kt and LensCatalog.kt on Android).

enum CaptureMode: String { case PHOTO, VIDEO }

/// The tray above the shutter. One at a time keeps the screen calm.
enum Dock: String, CaseIterable {
    case NONE, LOOKS, ADJUST, FRAME, TEXT
    var label: String { self == .NONE ? "" : String(rawValue.prefix(1)) + rawValue.dropFirst().lowercased() }
}

/// The small option panels opened from the chips above the viewfinder.
enum Quick: String { case RATIO, SIZE, VIDEO, TIMER, BURST, LOG }

/// Full-screen places other than the camera.
enum Screen: String { case CAMERA, GALLERY, VIEWER, SUBTITLES }

/// Which looks the looks tray lists: favourites, every look, or one category.
enum LookShelf: String { case FAVOURITES, ALL, CATEGORY }

/// The log curve: HLG (10-bit, every iPhone that films HDR) or Apple Log (Pro iPhones).
enum LogCurveChoice: String, CaseIterable {
    case HLG, APPLE_LOG
    var label: String { self == .HLG ? "HLG 10-bit" : "Apple Log" }
}

/// Frame shapes, width:height with the phone upright. The frame turns with the phone, so 9:16
/// becomes 16:9 when it is held sideways.
enum AspectRatio: String, CaseIterable, Hashable {
    case R3_4, R4_5, R1_1, R2_3, R9_16

    var w: Int { switch self { case .R3_4: return 3; case .R4_5: return 4; case .R1_1: return 1; case .R2_3: return 2; case .R9_16: return 9 } }
    var h: Int { switch self { case .R3_4: return 4; case .R4_5: return 5; case .R1_1: return 1; case .R2_3: return 3; case .R9_16: return 16 } }
    var value: Float { Float(w) / Float(h) }
    /// The label for how the phone is held: 3:4 upright, 4:3 sideways.
    func label(_ sideways: Bool) -> String { sideways && w != h ? "\(h):\(w)" : "\(w):\(h)" }
}

enum VideoResolution: String, CaseIterable, Hashable {
    case HD, FHD, UHD
    var label: String { switch self { case .HD: return "720p"; case .FHD: return "1080p"; case .UHD: return "4K" } }
    var width: Int { switch self { case .HD: return 1280; case .FHD: return 1920; case .UHD: return 3840 } }
    var height: Int { switch self { case .HD: return 720; case .FHD: return 1080; case .UHD: return 2160 } }
}

/// A still size the camera offers.
struct PhotoSize: Hashable {
    var width: Int
    var height: Int
    var pixels: Int { width * height }
    var mp: Int { Swift.max(1, (pixels + 500_000) / 1_000_000) }
    var label: String { "\(mp) MP" }
}

/// Shots in an interval burst (0 = until stopped) and the gap between them, in seconds.
let burstCounts = [1, 3, 5, 10, 20, 0]
let burstIntervals: [Float] = [0.5, 1, 2, 5, 10, 30]
let timerChoices = [0, 3, 5, 10]
let fpsChoices = [24, 25, 30, 60]

func timerLabel(_ s: Int) -> String { s == 0 ? "Off" : "\(s)s" }
func intervalLabel(_ v: Float) -> String { v < 1 ? "\(v)s" : "\(Int(v.rounded()))s" }
func burstLabel(_ count: Int, _ interval: Float) -> String {
    switch count {
    case 1: return "Off"
    case 0: return "∞ · \(intervalLabel(interval))"
    default: return "\(count) · \(intervalLabel(interval))"
    }
}
func clipLabel(_ ms: Int64) -> String { let s = (ms + 500) / 1000; return String(format: "%d:%02d", s / 60, s % 60) }

func zoomLabel(_ z: Float, _ selected: Bool) -> String {
    let text: String
    if z >= 10 || abs(z - z.rounded()) < 0.05 { text = "\(Int(z.rounded()))" } else {
        var s = String(format: "%.1f", z)
        if s.hasPrefix("0") { s.removeFirst() }
        text = s
    }
    return selected ? text + "×" : text
}

/// A picture or clip brought in from the library to develop with a look. The viewfinder shows
/// it instead of the camera; the shutter saves it.
struct EditSession: Equatable {
    var url: URL
    var video: Bool
    var width: Int
    var height: Int
    var durationMs: Int64 = 0
    var aspect: Float { Float(width) / Float(height) }
}

import Foundation
import OpenGLES

/// Draws the text layers into the frames (see TextLayerSource). Placeholder: no text yet.
final class TextOverlay: TextLayerSource {
    private let lock = NSLock()
    private var layers: [TextLayer] = []

    /// The layers to draw from now on (main thread).
    func update(_ layers: [TextLayer]) {
        lock.lock(); self.layers = layers; lock.unlock()
    }

    func frame(_ req: TextRequest) -> TextFrame { TextFrame() }
}

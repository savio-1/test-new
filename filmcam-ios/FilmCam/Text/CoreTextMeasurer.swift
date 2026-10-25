import CoreGraphics
import CoreText
import Foundation

/// Measures text for the subtitle engine with the real fonts, laid out exactly as
/// TextRenderer draws it (the fonts-backed measurer on Android).
struct CoreTextMeasurer: TextMeasurer {
    init() {}

    func width(_ text: String, font: String, size: Float, tracking: Float) -> Float {
        if text.isEmpty { return 0 }
        let a = TextRenderer.attributed(text, font: font, size: CGFloat(max(1, size)), tracking: tracking)
        return Float(CTLineGetTypographicBounds(CTLineCreateWithAttributedString(a), nil, nil, nil))
    }

    func blockSize(_ layer: TextLayer, frameWidth: Float, frameHeight: Float) -> (width: Float, height: Float) {
        let s = TextRenderer.blockSize(layer, w: CGFloat(frameWidth), h: CGFloat(frameHeight))
        return (Float(s.width), Float(s.height))
    }
}

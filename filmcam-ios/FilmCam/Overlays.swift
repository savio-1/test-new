import UIKit

/// Bitmaps the final pass samples: the date stamp, the camcorder display and the film edge
/// print (sizes and layout as on Android: DateStamp.kt, Overlays.kt).
enum Overlays {
    static let stampSize = CGSize(width: 512, height: 112)

    private static func render(_ size: CGSize, _ draw: (CGContext) -> Void) -> CGImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        return UIGraphicsImageRenderer(size: size, format: format).image { draw($0.cgContext) }.cgImage!
    }

    static func dateText(_ date: Date = Date(), year98: Bool = false) -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
        let y = year98 ? 98 : (c.year ?? 2026) % 100
        return String(format: "'%02d %2d %2d", y, c.month ?? 1, c.day ?? 1)
    }

    /// Seven-segment orange date, glowing, on black (the shader screens it over the picture).
    static func stamp(_ text: String) -> CGImage {
        render(stampSize) { ctx in
            ctx.setFillColor(UIColor.black.cgColor)
            ctx.fill(CGRect(origin: .zero, size: stampSize))
            let font = UIFont(name: "DBLCDTempBlack", size: 78) ?? .monospacedDigitSystemFont(ofSize: 74, weight: .bold)
            let orange = UIColor(red: 1.0, green: 0.55, blue: 0.16, alpha: 1)
            let shadow = NSShadow()
            shadow.shadowColor = UIColor(red: 1, green: 0.35, blue: 0.05, alpha: 0.9)
            shadow.shadowBlurRadius = 10
            let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: orange, .shadow: shadow, .kern: 6]
            let s = NSAttributedString(string: text, attributes: attrs)
            let b = s.size()
            UIGraphicsPushContext(ctx)
            s.draw(at: CGPoint(x: (stampSize.width - b.width) / 2, y: (stampSize.height - b.height) / 2))
            UIGraphicsPopContext()
        }
    }

    static func osdTime(_ date: Date = Date()) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US")
        f.dateFormat = "MMM.dd yyyy  h:mm:ss a"
        return f.string(from: date).uppercased()
    }

    /// Camcorder display: REC / PLAY on the top half, date and time on the bottom half.
    static func osd(recording: Bool, time: String) -> CGImage {
        let size = CGSize(width: 1024, height: 256)
        return render(size) { ctx in
            let font = UIFont.monospacedSystemFont(ofSize: 64, weight: .semibold)
            let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: UIColor.white]
            UIGraphicsPushContext(ctx)
            if recording {
                ctx.setFillColor(UIColor(red: 0.95, green: 0.15, blue: 0.1, alpha: 1).cgColor)
                ctx.fillEllipse(in: CGRect(x: 20, y: 40, width: 52, height: 52))
                NSAttributedString(string: "REC", attributes: attrs).draw(at: CGPoint(x: 92, y: 26))
            } else {
                NSAttributedString(string: "▶ PLAY", attributes: attrs).draw(at: CGPoint(x: 12, y: 26))
            }
            NSAttributedString(string: "SP", attributes: attrs).draw(at: CGPoint(x: 600, y: 26))
            let small: [NSAttributedString.Key: Any] = [.font: UIFont.monospacedSystemFont(ofSize: 50, weight: .semibold),
                                                         .foregroundColor: UIColor.white]
            NSAttributedString(string: time, attributes: small).draw(at: CGPoint(x: 12, y: 160))
            UIGraphicsPopContext()
        }
    }

    /// Edge print along a 35mm strip: frame numbers and the film's name.
    static func edge() -> CGImage {
        let size = CGSize(width: 1024, height: 64)
        return render(size) { ctx in
            let attrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.monospacedSystemFont(ofSize: 30, weight: .bold),
                .foregroundColor: UIColor(red: 1, green: 0.62, blue: 0.25, alpha: 0.9),
            ]
            UIGraphicsPushContext(ctx)
            for (text, x) in [("▸ 14", 30.0), ("FC 400-5", 250.0), ("▸ 14A", 560.0), ("SAFETY FILM", 760.0)] {
                NSAttributedString(string: text, attributes: attrs).draw(at: CGPoint(x: x, y: 14))
            }
            UIGraphicsPopContext()
        }
    }
}

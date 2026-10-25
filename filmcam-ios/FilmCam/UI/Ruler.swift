import SwiftUI

/// The adjustment ruler: ticks slide under a fixed centre line, with the value in a bubble
/// above it. With [options] it snaps between named stops instead. Double-tap resets.
/// [onActive] reports drag start and end, so the screen can hide everything else meanwhile.
struct Ruler: View {
    @Environment(\.palette) var p
    let value: Float
    let min: Float
    let max: Float
    let defaultValue: Float
    let format: (Float) -> String
    var options: [String]?
    let onChange: (Float) -> Void
    let onActive: (Bool) -> Void

    @State var dragging = false
    @State var freePos: Float = 0
    @State var startValue: Float = 0
    @State var lastX: CGFloat = 0
    @State var last: Float = 0

    private var discrete: Bool { options != nil }
    private var ticks: Int { 60 }
    private var tickPx: CGFloat { discrete ? 64 : 9 }
    private var pxPerUnit: CGFloat { discrete ? tickPx : CGFloat(ticks) * tickPx / CGFloat(max - min) }

    var body: some View {
        let shown = discrete && dragging ? freePos : value
        VStack(spacing: 0) {
            Text(bubble(shown)).font(UiType.mono(12)).fontWeight(.semibold).foregroundStyle(p.text)
                .padding(.horizontal, 10).padding(.vertical, 3)
                .background(RoundedRectangle(cornerRadius: Corners.small).fill(p.surface.opacity(0.92)))
                .overlay(RoundedRectangle(cornerRadius: Corners.small).stroke(p.accent, lineWidth: 1))
            Rectangle().fill(p.accent).frame(width: 1.5, height: 10)
            Canvas { ctx, size in draw(ctx, size, shown) }
                .frame(height: discrete ? 46 : 34)
                .mask(LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: .black, location: 0.18),
                                             .init(color: .black, location: 0.82), .init(color: .clear, location: 1)],
                                     startPoint: .leading, endPoint: .trailing))
                .contentShape(Rectangle())
                .onTapGesture(count: 2) {
                    Haptics.tap()
                    onChange(defaultValue)
                }
                .gesture(DragGesture(minimumDistance: 2).onChanged { g in
                    if !dragging {
                        dragging = true
                        freePos = value
                        startValue = value
                        last = value
                        lastX = 0
                        onActive(true)
                    }
                    let dx = g.translation.width - lastX
                    lastX = g.translation.width
                    if discrete {
                        let before = Int(freePos.rounded())
                        freePos = Swift.min(Swift.max(freePos - Float(dx / pxPerUnit), min), max)
                        let now = Int(freePos.rounded())
                        if now != before { Haptics.tick(); onChange(Float(now)) }
                    } else {
                        let next = Swift.min(Swift.max(last - Float(dx / pxPerUnit), min), max)
                        // A small tick of feedback on each tenth of the range.
                        let step = (max - min) / 10
                        if ((next - min) / step).rounded(.down) != ((last - min) / step).rounded(.down) { Haptics.tick() }
                        last = next
                        onChange(next)
                    }
                }.onEnded { _ in
                    dragging = false
                    if discrete { onChange(Swift.min(Swift.max(freePos.rounded(), min), max)) }
                    onActive(false)
                })
        }
        .frame(maxWidth: .infinity)
    }

    private func bubble(_ v: Float) -> String {
        if let options { return options[Swift.min(Swift.max(Int(v.rounded()), 0), options.count - 1)] }
        return format(v)
    }

    private func draw(_ ctx: GraphicsContext, _ size: CGSize, _ shown: Float) {
        let cx = size.width / 2
        if let options {
            for (i, label) in options.enumerated() {
                let x = cx + CGFloat(Float(i) - shown) * pxPerUnit
                if x < -tickPx || x > size.width + tickPx { continue }
                let near = abs(Float(i) - shown) < 0.5
                var line = Path()
                line.move(to: CGPoint(x: x, y: 0)); line.addLine(to: CGPoint(x: x, y: 14))
                ctx.stroke(line, with: .color(near ? p.text : p.faint), style: StrokeStyle(lineWidth: 1.5, lineCap: .round))
                ctx.draw(Text(label).font(UiType.mono(11)).foregroundColor(near ? p.text : p.muted),
                         at: CGPoint(x: x, y: 27), anchor: .center)
            }
        } else {
            let unit = (max - min) / Float(ticks)
            for i in 0...ticks {
                let v = min + Float(i) * unit
                let x = cx + CGFloat(v - shown) * pxPerUnit
                if x < 0 || x > size.width { continue }
                let major = i % 10 == 0
                let h: CGFloat = major ? 18 : 10
                var line = Path()
                line.move(to: CGPoint(x: x, y: (18 - h) / 2 + 2)); line.addLine(to: CGPoint(x: x, y: (18 + h) / 2 + 2))
                ctx.stroke(line, with: .color(major ? p.muted : p.faint), style: StrokeStyle(lineWidth: 1, lineCap: .round))
            }
            // The look's own value is marked with a dot, so "back to neutral" is easy to find.
            let dx = cx + CGFloat(defaultValue - shown) * pxPerUnit
            if dx >= 0 && dx <= size.width {
                ctx.fill(Path(ellipseIn: CGRect(x: dx - 2, y: 26, width: 4, height: 4)), with: .color(p.accent))
            }
        }
    }
}

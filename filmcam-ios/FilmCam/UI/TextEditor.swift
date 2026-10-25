import SwiftUI
import UIKit
import UniformTypeIdentifiers

// The Text tray, the layer editor on the viewfinder and full-screen typing (TextEditor.kt on
// Android).

/// What the ruler or panel in the text tray changes.
enum TextTool: String, CaseIterable {
    case FONT, SIZE, ROTATE, OPACITY, SPACING, LINES, COLOR, PLACE, DEPTH, ANIMATE

    var label: String {
        switch self {
        case .FONT: return "Font"
        case .SIZE: return "Size"
        case .ROTATE: return "Rotate"
        case .OPACITY: return "Opacity"
        case .SPACING: return "Spacing"
        case .LINES: return "Lines"
        case .COLOR: return "Colour"
        case .PLACE: return "Place"
        case .DEPTH: return "Depth"
        case .ANIMATE: return "Animate"
        }
    }
}

/// Text colours: neutrals, then warm to cool, then pastels and deep tones.
private let swatches: [UInt32] = [
    0xFFFFFFFF, 0xFFF2E6D0, 0xFFBDBDBD, 0xFF6B6B6B, 0xFF111111,
    0xFFFFE14D, 0xFFFFD45A, 0xFFFFB627, 0xFFFF8A3D, 0xFFFF5F1F, 0xFFE5402B, 0xFFC81D4E, 0xFFFF4F9A, 0xFFF2A7C3,
    0xFFB57EDC, 0xFF7B4FD6, 0xFF3B4BD8, 0xFF5B8DEF, 0xFF39B5E0, 0xFF4FB3A9, 0xFF2BB673, 0xFF7ED957, 0xFFC9E265,
    0xFFFFF1B5, 0xFFFFD6C2, 0xFFCDE8D9, 0xFFC9DDF7, 0xFFE3D5F5,
    0xFF8B5A2B, 0xFF5C3A21, 0xFF1F3A5F, 0xFF214D3B, 0xFF5B1A2E,
]

private extension Color {
    init(layerColor c: Int32) { self.init(argb: UInt32(bitPattern: c)) }
}

/// A layer's font as a SwiftUI font.
private func layerFont(_ key: String, _ size: CGFloat) -> Font { Font(TextFonts.font(key, size: size)) }

// MARK: - Frame mapping

/// Maps between the viewfinder (points, y down) and a layer's frame coordinates (0..1, y down,
/// upright for however the phone is held: the same space the renderer draws text in).
struct FrameMap {
    let w: CGFloat
    let h: CGFloat
    let k: Int

    var fw: CGFloat { k % 2 == 1 ? h : w }
    var fh: CGFloat { k % 2 == 1 ? w : h }

    private func rot(_ k: Int, _ x: CGFloat, _ y: CGFloat) -> (CGFloat, CGFloat) {
        switch k & 3 {
        case 1: return (y, 1 - x)
        case 2: return (1 - x, 1 - y)
        case 3: return (1 - y, x)
        default: return (x, y)
        }
    }

    func toLayer(_ v: CGPoint) -> CGPoint {
        let (fx, fy) = rot(k, v.x / w, 1 - v.y / h)
        return CGPoint(x: fx, y: 1 - fy)
    }

    func toView(_ l: CGPoint) -> CGPoint {
        let (sx, sy) = rot(4 - k, l.x, 1 - l.y)
        return CGPoint(x: sx * w, y: (1 - sy) * h)
    }

    /// The four corners of a layer's text block, in view points.
    func corners(_ layer: TextLayer, pad: CGFloat) -> [CGPoint] {
        let b = TextRenderer.blockSize(layer, w: fw, h: fh)
        let a = CGFloat(layer.rotation) * .pi / 180
        let c = cos(a), s = sin(a)
        let cx = CGFloat(layer.x) * fw, cy = CGFloat(layer.y) * fh
        return [(-1.0, -1.0), (1.0, -1.0), (1.0, 1.0), (-1.0, 1.0)].map { (sx: CGFloat, sy: CGFloat) in
            let dx = sx * (b.width / 2 + pad), dy = sy * (b.height / 2 + pad)
            return toView(CGPoint(x: (cx + dx * c - dy * s) / fw, y: (cy + dx * s + dy * c) / fh))
        }
    }

    func hit(_ layer: TextLayer, _ v: CGPoint, pad: CGFloat) -> Bool {
        let b = TextRenderer.blockSize(layer, w: fw, h: fh)
        let l = toLayer(v)
        let dx = (l.x - CGFloat(layer.x)) * fw, dy = (l.y - CGFloat(layer.y)) * fh
        let a = -CGFloat(layer.rotation) * .pi / 180
        let lx = dx * cos(a) - dy * sin(a), ly = dx * sin(a) + dy * cos(a)
        return abs(lx) <= b.width / 2 + pad && abs(ly) <= b.height / 2 + pad
    }

    /// Where the delete badge of a layer sits: the corner that is top-right on screen.
    func deleteBadge(_ layer: TextLayer, pad: CGFloat) -> CGPoint? {
        if layer.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return nil }
        return corners(layer, pad: pad).max { ($0.x - $0.y) < ($1.x - $1.y) }
    }
}

// MARK: - Editing on the viewfinder

/// Touches on the picture while the Text tray is open: tap to pick a text (or the subject, with
/// Depth), double-tap to type, and drag, pinch and twist (together) to move, size and turn the
/// picked one. Values follow the fingers; shown values snap to the centre lines and right angles.
@MainActor
final class TextGestures: ObservableObject {
    weak var model: AppModel?
    var size: CGSize = .zero
    @Published var guideX = false
    @Published var guideY = false
    /// Where the last subject pick was tapped, frame space, for a moment.
    @Published var subjectTap: CGPoint?

    private var active = 0
    private var moving = false
    private var start: TextLayer?
    private var rawX: CGFloat = 0
    private var rawY: CGFloat = 0
    private var rawRot: CGFloat = 0
    private var textSize: CGFloat = 0

    private var map: FrameMap { FrameMap(w: max(size.width, 1), h: max(size.height, 1), k: model?.frameTurns ?? 0) }

    /// A finger came down: a touch on a text picks it, so a drag anywhere then moves it.
    func down(_ p: CGPoint) {
        guard let model, active == 0 else { return }
        let m = map
        if let hit = model.textLayers.last(where: { m.hit($0, p, pad: 24) }) { model.selectedText = hit.id }
    }

    func tap(_ p: CGPoint) {
        guard let model else { return }
        let m = map
        let sel = model.selectedLayer
        if let sel, let badge = m.deleteBadge(sel, pad: 8), hypot(badge.x - p.x, badge.y - p.y) < 20 {
            model.deleteText(sel.id)
            return
        }
        let hit = model.textLayers.last { m.hit($0, p, pad: 12) }
        // Depth tool: a tap anywhere on the picture (over the text too, which often covers the
        // subject) picks what the text goes behind.
        if model.textTool == .DEPTH && sel?.behind == true {
            let l = m.toLayer(p)
            model.pickSubject(Float(l.x), Float(l.y))
            subjectTap = l
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) { [weak self] in
                if self?.subjectTap == l { self?.subjectTap = nil }
            }
            return
        }
        // A tap on empty picture: first it deselects, then it closes the tray.
        if hit == nil && model.selectedText == nil { model.dock = .NONE }
        model.selectedText = hit?.id
    }

    func doubleTap(_ p: CGPoint) {
        guard let model else { return }
        let m = map
        if let hit = model.textLayers.last(where: { m.hit($0, p, pad: 12) }) {
            model.selectedText = hit.id
            model.editingText = true
        }
    }

    func began() {
        active += 1
        guard active == 1, let model, let layer = model.selectedLayer else { return }
        start = layer
        rawX = CGFloat(layer.x)
        rawY = CGFloat(layer.y)
        rawRot = CGFloat(layer.rotation)
        textSize = CGFloat(layer.size)
        moving = true
        model.adjusting = true
        model.movingText = true
    }

    func ended() {
        active = max(0, active - 1)
        guard active == 0, moving else { return }
        moving = false
        start = nil
        model?.adjusting = false
        model?.movingText = false
        guideX = false
        guideY = false
    }

    /// One step of the fingers: moved by [pan] points, scaled by [zoom], turned [degrees] clockwise.
    func change(pan: CGSize = .zero, zoom: CGFloat = 1, degrees: CGFloat = 0) {
        guard moving, let model, let start else { return }
        let m = map
        let centre = m.toView(CGPoint(x: rawX, y: rawY))
        let next = m.toLayer(CGPoint(x: centre.x + pan.width, y: centre.y + pan.height))
        rawX = min(max(next.x, 0), 1)
        rawY = min(max(next.y, 0), 1)
        rawRot += degrees
        textSize = min(max(textSize * zoom, 0.015), 0.4)
        let snapX = abs(rawX - 0.5) < 0.018
        let snapY = abs(rawY - 0.5) < 0.018
        let nearest = (rawRot / 90).rounded() * 90
        let rot = abs(rawRot - nearest) < 4 ? nearest : rawRot
        if guideX != snapX { guideX = snapX }
        if guideY != snapY { guideY = snapY }
        var cur = model.selectedLayer ?? start
        cur.x = snapX ? 0.5 : Float(rawX)
        cur.y = snapY ? 0.5 : Float(rawY)
        cur.rotation = Float((rot + 540).truncatingRemainder(dividingBy: 360) - 180)
        cur.size = Float(textSize)
        model.replaceText(cur)
    }
}

/// The UIKit surface the gestures run on: pan, pinch and rotation recognised together, a tap
/// that waits for a double-tap, and touch-down for picking.
final class TextTouchView: UIView, UIGestureRecognizerDelegate {
    weak var gestures: TextGestures?

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        isMultipleTouchEnabled = true
        let pan = UIPanGestureRecognizer(target: self, action: #selector(onPan(_:)))
        let pinch = UIPinchGestureRecognizer(target: self, action: #selector(onPinch(_:)))
        let rotate = UIRotationGestureRecognizer(target: self, action: #selector(onRotate(_:)))
        let double = UITapGestureRecognizer(target: self, action: #selector(onDoubleTap(_:)))
        double.numberOfTapsRequired = 2
        let tap = UITapGestureRecognizer(target: self, action: #selector(onTap(_:)))
        tap.require(toFail: double)
        for g in [pan, pinch, rotate, double, tap] as [UIGestureRecognizer] {
            g.delegate = self
            addGestureRecognizer(g)
        }
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func layoutSubviews() {
        super.layoutSubviews()
        gestures?.size = bounds.size
    }

    func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        !(g is UITapGestureRecognizer) && !(other is UITapGestureRecognizer)
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        super.touchesBegan(touches, with: event)
        gestures?.size = bounds.size
        if (event?.allTouches?.count ?? touches.count) == 1, let t = touches.first { gestures?.down(t.location(in: self)) }
    }

    private func phase(_ g: UIGestureRecognizer, _ step: () -> Void) {
        switch g.state {
        case .began: gestures?.began(); step()
        case .changed: step()
        case .ended, .cancelled, .failed: gestures?.ended()
        default: break
        }
    }

    @objc private func onPan(_ g: UIPanGestureRecognizer) {
        phase(g) {
            let t = g.translation(in: self)
            g.setTranslation(.zero, in: self)
            gestures?.change(pan: CGSize(width: t.x, height: t.y))
        }
    }

    @objc private func onPinch(_ g: UIPinchGestureRecognizer) {
        phase(g) {
            let s = g.scale
            g.scale = 1
            gestures?.change(zoom: s)
        }
    }

    @objc private func onRotate(_ g: UIRotationGestureRecognizer) {
        phase(g) {
            let r = g.rotation
            g.rotation = 0
            gestures?.change(degrees: r * 180 / .pi)
        }
    }

    @objc private func onTap(_ g: UITapGestureRecognizer) {
        if g.state == .ended { gestures?.tap(g.location(in: self)) }
    }

    @objc private func onDoubleTap(_ g: UITapGestureRecognizer) {
        if g.state == .ended { gestures?.doubleTap(g.location(in: self)) }
    }
}

private struct TextTouchSurface: UIViewRepresentable {
    let gestures: TextGestures

    func makeUIView(context: Context) -> TextTouchView {
        let v = TextTouchView(frame: .zero)
        v.gestures = gestures
        return v
    }

    func updateUIView(_ v: TextTouchView, context: Context) { v.gestures = gestures }
}

/// Touch handling and the selection box on the viewfinder while the Text tray is open.
struct TextEditorLayer: View {
    @EnvironmentObject var model: AppModel
    @StateObject var gestures = TextGestures()

    var body: some View {
        let turns = model.frameTurns
        ZStack {
            TextTouchSurface(gestures: gestures)
            Canvas { ctx, size in draw(ctx, size, turns) }
                .allowsHitTesting(false)
            if model.textLayers.isEmpty {
                Text("Add text with  +  below").font(UiType.sans(12)).foregroundStyle(.white)
                    .padding(.horizontal, 12).padding(.vertical, 6)
                    .background(RoundedRectangle(cornerRadius: Corners.medium).fill(Color.glass))
                    .allowsHitTesting(false)
            }
        }
        .onAppear {
            gestures.model = model
            model.bindSubject()
        }
    }

    private func draw(_ ctx: GraphicsContext, _ size: CGSize, _ turns: Int) {
        guard size.width > 1, size.height > 1 else { return }
        let map = FrameMap(w: size.width, h: size.height, k: turns)
        if let t = gestures.subjectTap {
            let c = map.toView(t)
            ctx.stroke(Path(ellipseIn: CGRect(x: c.x - 26, y: c.y - 26, width: 52, height: 52)), with: .color(.white), lineWidth: 2)
            ctx.fill(Path(ellipseIn: CGRect(x: c.x - 4, y: c.y - 4, width: 8, height: 8)), with: .color(.gold))
        }
        if gestures.guideX { line(ctx, map.toView(CGPoint(x: 0.5, y: 0)), map.toView(CGPoint(x: 0.5, y: 1))) }
        if gestures.guideY { line(ctx, map.toView(CGPoint(x: 0, y: 0.5)), map.toView(CGPoint(x: 1, y: 0.5))) }
        guard let sel = model.selectedLayer, !sel.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        let c = map.corners(sel, pad: 8)
        var box = Path()
        box.addLines(c)
        box.closeSubpath()
        ctx.stroke(box, with: .color(.black.opacity(0.35)), lineWidth: 2.5)
        ctx.stroke(box, with: .color(.white), style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
        for p in c { ctx.fill(Path(ellipseIn: CGRect(x: p.x - 3, y: p.y - 3, width: 6, height: 6)), with: .color(.white)) }
        // Delete badge: a small x on the top-right corner.
        if let b = map.deleteBadge(sel, pad: 8) {
            let r: CGFloat = 10, a: CGFloat = 3.5
            let circle = Path(ellipseIn: CGRect(x: b.x - r, y: b.y - r, width: 2 * r, height: 2 * r))
            ctx.fill(circle, with: .color(Color(argb: 0xFFE5402B)))
            ctx.stroke(circle, with: .color(.white), lineWidth: 1)
            var x = Path()
            x.move(to: CGPoint(x: b.x - a, y: b.y - a)); x.addLine(to: CGPoint(x: b.x + a, y: b.y + a))
            x.move(to: CGPoint(x: b.x - a, y: b.y + a)); x.addLine(to: CGPoint(x: b.x + a, y: b.y - a))
            ctx.stroke(x, with: .color(.white), style: StrokeStyle(lineWidth: 1.6, lineCap: .round))
        }
    }

    private func line(_ ctx: GraphicsContext, _ a: CGPoint, _ b: CGPoint) {
        var p = Path()
        p.move(to: a)
        p.addLine(to: b)
        ctx.stroke(p, with: .color(.gold), lineWidth: 1)
    }
}

// MARK: - The tray

/// The Text tray: layers, then the tools for the selected one.
struct TextTray: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.palette) var p
    let chrome: Double
    @State var importing = false

    var body: some View {
        let _ = model.fontsVersion
        let layer = model.selectedLayer
        TrayCard(chrome: chrome) {
            VStack(spacing: 0) {
                layersRow.opacity(chrome)
                if let layer {
                    Spacer().frame(height: 10)
                    tools(layer).opacity(chrome)
                    Spacer().frame(height: 10)
                    panel(layer)
                } else {
                    Text(model.textLayers.isEmpty ? "Text is burnt into photos and video as you shoot."
                         : "Tap a text to style it. Drag to move, pinch to resize, twist to rotate.")
                        .font(UiType.sans(11)).foregroundStyle(p.muted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 16).padding(.vertical, 10)
                        .opacity(chrome)
                }
            }
            .animation(.easeOut(duration: 0.18), value: model.textTool)
        }
        .onAppear { model.bindSubject() }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.font, .zip, .data], allowsMultipleSelection: true) { result in
            if case let .success(urls) = result { model.importFonts(urls) }
        }
    }

    private var layersRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(model.textLayers) { l in
                    let sel = l.id == model.selectedText
                    let first = l.text.components(separatedBy: .newlines).first ?? ""
                    Button { model.selectedText = sel ? nil : l.id } label: {
                        Text(String((first.trimmingCharacters(in: .whitespaces).isEmpty ? "Text" : first).prefix(14)))
                            .font(layerFont(l.font, 13)).lineLimit(1)
                            .foregroundStyle(sel ? p.bg : p.text)
                            .padding(.horizontal, 12).padding(.vertical, 7)
                            .background(RoundedRectangle(cornerRadius: Corners.medium).fill(sel ? p.text : p.surfaceHigh))
                    }
                    .buttonStyle(GentlePress())
                }
                Button {
                    // New text always starts in the middle of the frame, without a shadow.
                    var new = TextLayer()
                    new.text = ""
                    new.x = 0.5
                    new.y = 0.5
                    model.setTextLayers(model.textLayers + [new])
                    model.selectedText = new.id
                    model.editingText = true
                } label: {
                    IconView(Ico.plus, size: 18, color: p.text)
                        .frame(width: 34, height: 34)
                        .overlay(Circle().stroke(p.line, lineWidth: 1))
                        .contentShape(Circle())
                }
                .buttonStyle(GentlePress())
            }
            .padding(.horizontal, 12)
        }
    }

    private func tools(_ layer: TextLayer) -> some View {
        let tool = model.textTool
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 2) {
                ToolButton(glyph: Ico.text, label: "Edit", selected: false) { model.editingText = true }
                ToolButton(glyph: Ico.trash, label: "Delete", selected: false, danger: true) { model.deleteText(layer.id) }
                toolButton(Ico.fonts, .FONT)
                toolButton(Ico.textSize, .SIZE)
                toolButton(Ico.rotate, .ROTATE)
                toolButton(Ico.fade, .COLOR)
                toolButton(Ico.focus, .PLACE)
                ToolButton(glyph: Ico.depth, label: "Depth", selected: tool == .DEPTH || layer.behind) { model.textTool = .DEPTH }
                toolButton(Ico.opacity, .OPACITY)
                toolButton(Ico.spacing, .SPACING)
                toolButton(Ico.lineHeight, .LINES)
                ToolButton(glyph: Ico.motion, label: "Animate", selected: tool == .ANIMATE, changed: layer.anim != .NONE) { model.textTool = .ANIMATE }
                ToolButton(glyph: layer.align == .LEFT ? Ico.alignLeft : layer.align == .CENTER ? Ico.alignCenter : Ico.alignRight,
                           label: "Align", selected: false) {
                    var l = layer
                    let all = TextAlign.allCases
                    l.align = all[(all.firstIndex(of: layer.align)! + 1) % all.count]
                    model.replaceText(l)
                }
                ToolButton(glyph: Ico.shadow, label: "Shadow", selected: layer.shadow) {
                    var l = layer
                    l.shadow.toggle()
                    model.replaceText(l)
                }
            }
            .padding(.horizontal, 8)
        }
    }

    private func toolButton(_ glyph: Glyph, _ t: TextTool) -> ToolButton {
        ToolButton(glyph: glyph, label: t.label, selected: model.textTool == t) { model.textTool = t }
    }

    @ViewBuilder private func panel(_ layer: TextLayer) -> some View {
        switch model.textTool {
        case .FONT: FontRow(layer: layer, chrome: chrome) { importing = true }
        case .SIZE:
            ruler("Size", layer.size, 0.015, 0.3, 0.07, { "\(Int(($0 * 100).rounded()))" }) { v in edit(layer) { $0.size = v } }
        case .ROTATE:
            ruler("Rotation", layer.rotation, -180, 180, 0, { "\(Int($0.rounded()))°" }) { v in
                let near = (v / 90).rounded() * 90
                edit(layer) { $0.rotation = abs(v - near) < 2 ? near : v }
            }
        case .OPACITY:
            ruler("Opacity", layer.opacity, 0.1, 1, 1, { "\(Int(($0 * 100).rounded()))%" }) { v in edit(layer) { $0.opacity = v } }
        case .SPACING:
            ruler("Letter spacing", layer.tracking, -0.1, 0.6, 0, { String(format: "%.2f", Double($0)) }) { v in edit(layer) { $0.tracking = v } }
        case .LINES:
            ruler("Line spacing", layer.lineSpacing, 0.6, 2.5, 1, { String(format: "%.2f×", Double($0)) }) { v in
                edit(layer) { $0.lineSpacing = (v * 20).rounded() / 20 }
            }
        case .COLOR: ColourPanel(color: layer.color) { c in edit(layer) { $0.color = c } }
        case .ANIMATE: AnimatePanel(layer: layer) { a in edit(layer) { $0.anim = a } }
        case .PLACE: PlaceGrid(layer: layer)
        case .DEPTH: DepthPanel(layer: layer)
        }
    }

    /// Changes the layer as it is now (the ruler's value arrives after other edits).
    private func edit(_ layer: TextLayer, _ change: (inout TextLayer) -> Void) {
        var l = model.textLayers.first { $0.id == layer.id } ?? layer
        change(&l)
        model.replaceText(l)
    }

    private func ruler(_ label: String, _ value: Float, _ min: Float, _ max: Float, _ def: Float,
                       _ format: @escaping (Float) -> String, _ onChange: @escaping (Float) -> Void) -> some View {
        VStack(spacing: 4) {
            Text(label).font(UiType.sans(10)).tracking(1).foregroundStyle(p.muted)
            Ruler(value: value, min: min, max: max, defaultValue: def, format: format,
                  onChange: onChange, onActive: { model.adjusting = $0 })
        }
        .frame(maxWidth: .infinity)
    }
}

/// Families, one tile each in its own regular face, then the chosen family's weights and styles.
private struct FontRow: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.palette) var p
    let layer: TextLayer
    let chrome: Double
    let onImport: () -> Void

    var body: some View {
        let fonts = model.fonts
        let current = fonts.familyOf(layer.font)
        VStack(spacing: 8) {
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(spacing: 8) {
                        FontTile(label: "Import", selected: false, outlined: true, action: onImport) {
                            IconView(Ico.importIcon, size: 20, color: p.text)
                        }
                        ForEach(fonts.families, id: \.name) { fam in
                            let sel = fam.name == current?.name
                            let n = fam.faces.count
                            FontTile(label: n > 1 ? "\(fam.name) · \(n)" : fam.name, selected: sel, action: {
                                var l = layer
                                l.font = fonts.nearest(fam, like: layer.font).key
                                model.replaceText(l)
                            }) {
                                Text("Aa").font(layerFont(fam.main.key, 21)).lineLimit(1).foregroundStyle(sel ? p.bg : p.text)
                            }
                            .id(fam.name)
                        }
                    }
                    .padding(.horizontal, 12)
                }
                .frame(height: 62)
                .onAppear { if let c = current { proxy.scrollTo(c.name, anchor: .center) } }
            }
            .opacity(chrome)
            if let current, current.faces.count > 1 {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(current.faces, id: \.key) { f in
                            let sel = f.key == layer.font
                            Button {
                                var l = layer
                                l.font = f.key
                                model.replaceText(l)
                            } label: {
                                Text(f.style).font(layerFont(f.key, 13)).lineLimit(1).foregroundStyle(sel ? p.bg : p.text)
                                    .padding(.horizontal, 10).padding(.vertical, 6)
                                    .background(RoundedRectangle(cornerRadius: Corners.small).fill(sel ? p.text : p.surfaceHigh))
                            }
                            .buttonStyle(GentlePress())
                        }
                    }
                    .padding(.horizontal, 12)
                }
                .opacity(chrome)
            }
        }
    }
}

/// One font in the picker: a fixed-size tile so the row lines up.
private struct FontTile<Sample: View>: View {
    @Environment(\.palette) var p
    let label: String
    let selected: Bool
    var outlined = false
    let action: () -> Void
    @ViewBuilder let sample: () -> Sample

    var body: some View {
        Button(action: action) {
            VStack(spacing: 3) {
                sample().frame(height: 30).frame(maxWidth: .infinity).clipped()
                Text(label).font(UiType.sans(9)).lineLimit(1).truncationMode(.tail)
                    .foregroundStyle(selected ? p.bg.opacity(0.75) : p.muted)
            }
            .padding(.horizontal, 4)
            .frame(width: 74, height: 62)
            .background(RoundedRectangle(cornerRadius: Corners.medium).fill(selected ? p.text : outlined ? .clear : p.surfaceHigh))
            .overlay(RoundedRectangle(cornerRadius: Corners.medium).stroke(outlined ? p.line : .clear, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(GentlePress())
    }
}

// MARK: - Colour

/// HSV as Android's Color.colorToHSV / HSVToColor: hue 0..360, saturation and value 0..1.
enum HSV {
    static func of(_ argb: Int32) -> (h: Float, s: Float, v: Float) {
        let r = argb.argbR, g = argb.argbG, b = argb.argbB
        let mx = max(r, g, b), mn = min(r, g, b), d = mx - mn
        var h: Float = 0
        if d > 0 {
            if mx == r { h = (g - b) / d } else if mx == g { h = (b - r) / d + 2 } else { h = (r - g) / d + 4 }
            h *= 60
            if h < 0 { h += 360 }
        }
        return (h, mx > 0 ? d / mx : 0, mx)
    }

    static func color(_ h: Float, _ s: Float, _ v: Float) -> Int32 {
        let hh = (h.truncatingRemainder(dividingBy: 360) + 360).truncatingRemainder(dividingBy: 360) / 60
        let i = Int(hh), f = hh - Float(i)
        let p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f))
        let (r, g, b): (Float, Float, Float)
        switch i {
        case 0: (r, g, b) = (v, t, p)
        case 1: (r, g, b) = (q, v, p)
        case 2: (r, g, b) = (p, v, t)
        case 3: (r, g, b) = (p, q, v)
        case 4: (r, g, b) = (t, p, v)
        default: (r, g, b) = (v, p, q)
        }
        return Int32.argb(1, r, g, b)
    }
}

/// Swatches, and a spectrum bar for any other hue (with a lightness bar under it).
private struct ColourPanel: View {
    @Environment(\.palette) var p
    let color: Int32
    let onPick: (Int32) -> Void

    var body: some View {
        let hsv = HSV.of(color)
        let hue = Color(layerColor: HSV.color(hsv.h, 1, 1))
        // Lightness: dark, the pure hue in the middle, then toward white.
        let light: Float = hsv.s < 1 && hsv.v >= 1 ? 0.5 + 0.5 * (1 - hsv.s) : 0.5 * hsv.v
        VStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(swatches, id: \.self) { c in
                        let v = Int32(bitPattern: c)
                        let sel = v == color
                        Button { onPick(v) } label: {
                            Circle().fill(Color(argb: c))
                                .padding(sel ? 4 : 0)
                                .frame(width: 30, height: 30)
                                .overlay(Circle().stroke(sel ? p.text : p.line, lineWidth: sel ? 2 : 1))
                                .contentShape(Circle())
                        }
                        .buttonStyle(GentlePress())
                        .animation(.easeOut(duration: 0.15), value: sel)
                    }
                }
                .padding(.horizontal, 14)
            }
            Spacer().frame(height: 12)
            SpectrumBar(colors: (0...6).map { Color(layerColor: HSV.color(Float($0) * 60, 1, 1)) }, value: hsv.h / 360) { f in
                onPick(HSV.color(f * 359.9, max(hsv.s, 0.6), max(hsv.v, 0.6)))
            }
            Spacer().frame(height: 8)
            SpectrumBar(colors: [.black, hue, .white], value: light) { f in
                onPick(f <= 0.5 ? HSV.color(hsv.h, 1, f * 2) : HSV.color(hsv.h, 1 - (f - 0.5) * 2, 1))
            }
        }
    }
}

/// A gradient bar with a ring marking [value]; tap or drag to pick along it.
private struct SpectrumBar: View {
    let colors: [Color]
    let value: Float
    let onPick: (Float) -> Void

    var body: some View {
        GeometryReader { geo in
            let w = max(geo.size.width, 1)
            let r: CGFloat = 5
            let x = min(max(CGFloat(min(max(value, 0), 1)) * w, r * 1.6), w - r * 1.6)
            ZStack(alignment: .topLeading) {
                Capsule().fill(LinearGradient(colors: colors, startPoint: .leading, endPoint: .trailing))
                    .frame(height: 2 * r).offset(y: geo.size.height / 2 - r)
                Circle().fill(Color.black.opacity(0.35)).frame(width: r * 3.5, height: r * 3.5)
                    .offset(x: x - r * 1.75, y: geo.size.height / 2 - r * 1.75)
                Circle().stroke(Color.white, lineWidth: 2).frame(width: r * 3.2, height: r * 3.2)
                    .offset(x: x - r * 1.6, y: geo.size.height / 2 - r * 1.6)
            }
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0).onChanged { g in
                onPick(Float(min(max(g.location.x / w, 0), 1)))
            })
        }
        .frame(height: 22)
        .padding(.horizontal, 16)
    }
}

// MARK: - Animate, place, depth

/// How the text moves in video. Each choice previews itself: the "Aa" in its tile moves the
/// way the text will.
private struct AnimatePanel: View {
    @Environment(\.palette) var p
    let layer: TextLayer
    let onPick: (TextAnim) -> Void

    var body: some View {
        VStack(spacing: 0) {
            TimelineView(.animation) { tl in
                let t = Float(tl.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 12))
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(TextAnim.allCases, id: \.self) { a in tile(a, t) }
                    }
                    .padding(.horizontal, 12)
                }
            }
            Text(layer.anim == .NONE ? "Text moves in video; photos show it at rest."
                 : "\(layer.anim.label): plays in video and the viewfinder; photos show it at rest.")
                .font(UiType.sans(11)).foregroundStyle(p.muted)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 16).padding(.vertical, 8)
        }
    }

    private func tile(_ a: TextAnim, _ t: Float) -> some View {
        let sel = a == layer.anim
        let pose = a.pose(t, seed: 7, length: 2)
        let shown = String("Aa".prefix(max(0, pose.chars)))
        return Button { onPick(a) } label: {
            VStack(spacing: 2) {
                Text(shown.isEmpty ? " " : shown).font(UiType.sans(19, .semibold)).foregroundStyle(sel ? p.bg : p.text)
                    .scaleEffect(CGFloat(pose.scale))
                    .rotationEffect(.degrees(Double(pose.rotation)))
                    .offset(x: CGFloat(pose.dx) * 19, y: CGFloat(pose.dy) * 19)
                    .opacity(Double(pose.alpha))
                    .frame(height: 30).frame(maxWidth: .infinity).clipped()
                Text(a.label).font(UiType.sans(9)).lineLimit(1).foregroundStyle(sel ? p.bg.opacity(0.75) : p.muted)
            }
            .frame(width: 74, height: 62)
            .background(RoundedRectangle(cornerRadius: Corners.medium).fill(sel ? p.text : p.surfaceHigh))
            .contentShape(Rectangle())
        }
        .buttonStyle(GentlePress())
    }
}

/// Nine anchor points: the text jumps there and aligns to that side.
private struct PlaceGrid: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.palette) var p
    let layer: TextLayer

    private let xs: [Float] = [0.2, 0.5, 0.8]
    private let ys: [Float] = [0.12, 0.5, 0.88]

    var body: some View {
        HStack(spacing: 18) {
            VStack(spacing: 2) {
                ForEach(ys, id: \.self) { y in
                    HStack(spacing: 2) {
                        ForEach(0..<3, id: \.self) { i in
                            let x = xs[i]
                            let sel = abs(layer.x - x) < 0.01 && abs(layer.y - y) < 0.01
                            Button { place(x, y, TextAlign.allCases[i]) } label: {
                                Circle().fill(sel ? p.accent : p.faint).frame(width: sel ? 8 : 5, height: sel ? 8 : 5)
                                    .frame(width: 30, height: 22)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(6)
            .background(RoundedRectangle(cornerRadius: Corners.medium).fill(p.surfaceHigh))
            VStack(spacing: 8) {
                Pill("Centre") { place(0.5, 0.5, .CENTER) }
                Pill("Level") {
                    var l = layer
                    l.rotation = 0
                    model.replaceText(l)
                }
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func place(_ x: Float, _ y: Float, _ align: TextAlign) {
        var l = layer
        l.x = x
        l.y = y
        l.align = align
        model.replaceText(l)
    }
}

/// In front of everything, or behind the subject: the subject (every person, or what was
/// tapped) is cut out of each frame and passes in front of the text, even while it moves.
private struct DepthPanel: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.palette) var p
    let layer: TextLayer

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                Pill("In front", filled: !layer.behind) { set(false) }
                Pill("Behind subject", filled: layer.behind) { set(true) }
            }
            if layer.behind {
                VStack(spacing: 4) {
                    if !model.subjectStatus.isEmpty {
                        Text(model.subjectStatus).font(UiType.sans(11, .semibold))
                            .foregroundStyle(model.subjectStatus.hasPrefix("Cutting") ? p.accent : p.muted)
                    }
                    HStack(spacing: 0) {
                        Text("Behind: \(model.subjectLabel)  ·  tap the subject in the picture to pick it")
                            .font(UiType.sans(11)).foregroundStyle(p.muted)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.horizontal, 16)
                        if model.subjectLabel != "People" {
                            Button { model.resetSubject() } label: {
                                Text("All people").font(UiType.sans(11, .semibold)).foregroundStyle(p.accent)
                                    .padding(.horizontal, 10).padding(.vertical, 6)
                            }
                            .buttonStyle(GentlePress())
                        }
                    }
                }
            } else {
                Text("Text sits on top of the picture.").font(UiType.sans(11)).foregroundStyle(p.muted)
            }
        }
        .frame(maxWidth: .infinity)
        .animation(.easeOut(duration: 0.18), value: layer.behind)
    }

    private func set(_ behind: Bool) {
        var l = layer
        l.behind = behind
        model.replaceText(l)
    }
}

// MARK: - Typing

/// Full-screen typing, in the chosen font, over a dimmed viewfinder.
struct TextEditOverlay: View {
    @EnvironmentObject var model: AppModel
    @State var value = ""
    @State var editingId: Int64?
    @FocusState var focused: Bool

    var body: some View {
        let layer = model.selectedLayer
        ZStack {
            Color.black.opacity(0.72).ignoresSafeArea()
                .contentShape(Rectangle())
                .onTapGesture { finish() }
            VStack(spacing: 0) {
                HStack {
                    Text("Text").font(UiType.sans(13)).foregroundStyle(Color.white.opacity(0.6))
                    Spacer()
                    Button { finish() } label: {
                        Text("Done").font(UiType.sans(13, .semibold)).foregroundStyle(.black)
                            .padding(.horizontal, 16).padding(.vertical, 8)
                            .background(RoundedRectangle(cornerRadius: Corners.medium).fill(.white))
                    }
                    .buttonStyle(GentlePress())
                }
                .padding(.horizontal, 16).padding(.vertical, 10)
                Spacer(minLength: 0)
                if let layer {
                    TextField("", text: $value, axis: .vertical)
                        .font(layerFont(layer.font, 34))
                        .foregroundStyle(Color(layerColor: layer.color | Int32(bitPattern: 0xFF00_0000)))
                        .multilineTextAlignment(layer.align == .LEFT ? .leading : layer.align == .CENTER ? .center : .trailing)
                        .tint(.white)
                        .focused($focused)
                        .textInputAutocapitalization(.sentences)
                        .padding(.horizontal, 28)
                }
                Spacer(minLength: 0)
            }
        }
        .onAppear {
            guard let layer else { model.editingText = false; return }
            editingId = layer.id
            value = layer.text
            DispatchQueue.main.async { focused = true }
        }
    }

    private func finish() {
        defer { model.editingText = false }
        guard let id = editingId, var layer = model.textLayers.first(where: { $0.id == id }) else { return }
        var text = value
        while let last = text.last, last.isWhitespace { text.removeLast() }
        if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            model.deleteText(id)
        } else {
            layer.text = text
            model.replaceText(layer)
        }
    }
}

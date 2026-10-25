import SwiftUI
import UIKit

// The shared pieces of the editor UI (Controls.kt, Trays.kt on Android).

/// A row of section tabs in the mono face: "/ CHOSEN" in ink, the rest faint.
struct TextTabs<T: Hashable>: View {
    @Environment(\.palette) var p
    let items: [T]
    let selected: T
    let label: (T) -> String
    let onPick: (T) -> Void

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 2) {
                    ForEach(items, id: \.self) { item in
                        let sel = item == selected
                        Button { onPick(item) } label: {
                            HStack(spacing: 0) {
                                Text("/ ").font(UiType.mono(10)).foregroundStyle(p.text)
                                    .frame(width: sel ? 14 : 0, alignment: .leading).opacity(sel ? 1 : 0).clipped()
                                Text(label(item).uppercased()).font(UiType.mono(10)).tracking(1.4).lineLimit(1)
                                    .foregroundStyle(sel ? p.text : p.faint)
                            }
                            .padding(.horizontal, 8).padding(.vertical, 6)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .id(item)
                    }
                }
                .padding(.horizontal, 12)
                .animation(.easeOut(duration: 0.2), value: selected)
            }
            .onAppear { proxy.scrollTo(selected, anchor: .center) }
        }
    }
}

/// A section head: "/ LABEL" in the mono face.
struct SectionLabel: View {
    @Environment(\.palette) var p
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text("/  " + text.uppercased()).font(UiType.mono(10)).tracking(1.6).foregroundStyle(p.muted)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Segmented control; the chosen segment is inverted.
struct Segmented<T: Hashable>: View {
    @Environment(\.palette) var p
    let options: [T]
    let selected: T
    let label: (T) -> String
    var enabled: (T) -> Bool = { _ in true }
    let onPick: (T) -> Void

    var body: some View {
        HStack(spacing: 0) {
            ForEach(options, id: \.self) { o in
                let sel = o == selected
                let on = enabled(o)
                Button { onPick(o) } label: {
                    Text(label(o)).font(UiType.sans(12, .medium)).lineLimit(1).minimumScaleFactor(0.7)
                        .foregroundStyle(sel ? p.bg : on ? p.text : p.faint)
                        .frame(maxWidth: .infinity).padding(.vertical, 8)
                        .background(RoundedRectangle(cornerRadius: Corners.small).fill(sel ? p.text : .clear))
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(!on)
            }
        }
        .padding(3)
        .overlay(RoundedRectangle(cornerRadius: Corners.small).stroke(p.line, lineWidth: 1))
        .animation(.easeOut(duration: 0.2), value: selected)
    }
}

/// A square tool button with a label under it, as in the adjustment row.
struct ToolButton: View {
    @Environment(\.palette) var p
    let glyph: Glyph
    let label: String
    let selected: Bool
    var changed = false
    var danger = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 0) {
                IconView(glyph, size: 20, color: selected ? p.bg : danger ? p.danger : p.text)
                    .frame(width: 44, height: 44)
                    .background(RoundedRectangle(cornerRadius: Corners.small).fill(selected ? p.text : p.surfaceHigh))
                    .overlay(RoundedRectangle(cornerRadius: Corners.small).stroke(selected ? p.text : p.line, lineWidth: 1))
                Text(label).font(UiType.sans(10)).lineLimit(1)
                    .foregroundStyle(selected ? p.text : danger ? p.danger : p.muted)
                    .padding(.top, 5)
                // A dot marks tools moved away from the look's own setting.
                Circle().fill(changed ? p.accent : .clear).frame(width: 3, height: 3).padding(.top, 3)
            }
            .frame(width: 58)
            .contentShape(Rectangle())
        }
        .buttonStyle(GentlePress())
        .animation(.easeOut(duration: 0.18), value: selected)
    }
}

/// A round icon button.
struct IconCircle: View {
    @Environment(\.palette) var p
    let glyph: Glyph
    var size: CGFloat = 40
    var enabled = true
    var selected = false
    var rotation: Double = 0
    var tint: Color?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            IconView(glyph, size: 22, color: selected ? p.bg : tint ?? p.text)
                .rotationEffect(.degrees(rotation))
                .frame(width: size, height: size)
                .background(Circle().fill(selected ? p.text : .clear))
                .contentShape(Circle())
        }
        .buttonStyle(GentlePress())
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.3)
    }
}

/// A text button: filled (inverted) or outlined.
struct Pill: View {
    @Environment(\.palette) var p
    let text: String
    var filled = false
    var enabled = true
    let action: () -> Void

    init(_ text: String, filled: Bool = false, enabled: Bool = true, action: @escaping () -> Void) {
        self.text = text
        self.filled = filled
        self.enabled = enabled
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            Text(text).font(UiType.sans(13, .medium)).foregroundStyle(filled ? p.bg : p.text)
                .padding(.horizontal, 18).padding(.vertical, 10)
                .background(RoundedRectangle(cornerRadius: Corners.small).fill(filled ? p.text : .clear))
                .overlay(RoundedRectangle(cornerRadius: Corners.small).stroke(filled ? p.text : p.line, lineWidth: 1))
        }
        .buttonStyle(GentlePress())
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.35)
    }
}

/// A small, square switch: the knob slides across with a soft spring.
struct Toggle2: View {
    @Environment(\.palette) var p
    let on: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack(alignment: on ? .trailing : .leading) {
                RoundedRectangle(cornerRadius: Corners.small).fill(on ? p.text : p.surfaceHigh)
                    .overlay(RoundedRectangle(cornerRadius: Corners.small).stroke(on ? p.text : p.line, lineWidth: 1))
                RoundedRectangle(cornerRadius: 2).fill(on ? p.bg : p.muted).frame(width: 14, height: 14).padding(4)
            }
            .frame(width: 38, height: 22)
            .animation(.spring(response: 0.3, dampingFraction: 0.7), value: on)
        }
        .buttonStyle(.plain)
    }
}

/// A slim slider: a hairline track, the filled part in ink and a small round thumb.
struct LineSlider: View {
    @Environment(\.palette) var p
    let value: Float
    var min: Float = 0
    var max: Float = 1
    var onActive: (Bool) -> Void = { _ in }
    let onChange: (Float) -> Void
    @State var dragging = false

    var body: some View {
        GeometryReader { geo in
            let w = Swift.max(geo.size.width, 1)
            let f = CGFloat(Swift.min(Swift.max((value - min) / (max - min), 0), 1))
            ZStack(alignment: .leading) {
                Rectangle().fill(p.line).frame(height: 2)
                Rectangle().fill(p.text).frame(width: w * f, height: 2)
                Circle().fill(p.text).frame(width: 12, height: 12)
                    .offset(x: Swift.min(Swift.max(w * f, 6), w - 6) - 6)
            }
            .frame(maxHeight: .infinity)
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0).onChanged { g in
                if !dragging { dragging = true; onActive(true) }
                onChange(min + Float(Swift.min(Swift.max(g.location.x / w, 0), 1)) * (max - min))
            }.onEnded { _ in dragging = false; onActive(false) })
        }
        .frame(height: 28)
    }
}

/// A rounded card for trays; it fades to nothing while a ruler is dragged, the ruler stays.
struct TrayCard<Content: View>: View {
    @Environment(\.palette) var p
    let chrome: Double
    @ViewBuilder let content: () -> Content

    var body: some View {
        content()
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: Corners.large).fill(p.surface.opacity(0.96 * chrome)))
            .overlay(RoundedRectangle(cornerRadius: Corners.large).stroke(p.line.opacity(chrome), lineWidth: 1))
            .contentShape(Rectangle())
            .onTapGesture {}
            .padding(.horizontal, 8)
    }
}

/// White text on glass, over the picture.
struct GlassText: View {
    let text: String
    var big = false
    init(_ text: String, big: Bool = false) { self.text = text; self.big = big }

    var body: some View {
        Text(text).font(UiType.sans(big ? 15 : 12, .semibold)).foregroundStyle(.white)
            .padding(.horizontal, 12).padding(.vertical, 6)
            .background(RoundedRectangle(cornerRadius: Corners.medium).fill(Color.glass))
    }
}

struct PanelLabel: View {
    @Environment(\.palette) var p
    let text: String
    var top: CGFloat = 0
    init(_ text: String, top: CGFloat = 0) { self.text = text; self.top = top }

    var body: some View {
        Text(text.uppercased()).font(UiType.sans(10, .semibold)).tracking(1.6).foregroundStyle(p.muted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, top).padding(.bottom, 8)
    }
}

struct PanelHelp: View {
    @Environment(\.palette) var p
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        if !text.isEmpty {
            Text(text).font(UiType.sans(11)).foregroundStyle(p.muted).lineSpacing(2)
                .frame(maxWidth: .infinity, alignment: .leading).padding(.top, 8)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// A row with a title, a line of help and a switch.
struct SettingSwitch: View {
    @Environment(\.palette) var p
    let title: String
    let help: String
    let value: Bool
    let onChange: (Bool) -> Void

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(UiType.sans(14)).foregroundStyle(p.text)
                if !help.isEmpty {
                    Text(help).font(UiType.sans(11)).foregroundStyle(p.muted).fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Toggle2(on: value) { onChange(!value) }
        }
        .padding(.top, 16)
    }
}

enum Haptics {
    private static let light = UIImpactFeedbackGenerator(style: .light)
    private static let select = UISelectionFeedbackGenerator()
    static func tick() { select.selectionChanged() }
    static func tap() { light.impactOccurred() }
}

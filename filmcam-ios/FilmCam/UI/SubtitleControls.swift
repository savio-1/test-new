import SwiftUI
import UIKit

// The subtitle editor's small pieces (the Sub* helpers in SubtitleEditor.kt on Android). The
// editor is always dark, whatever the theme: the clip is judged against black.

enum SubInk {
    static let accent = Color(argb: 0xFFF4F4F2)
    static let panel = Color(argb: 0xFF111112)
    static let muted = Color.white.opacity(0.55)
    static let field = Color(argb: 0xFF232323)
    static let raised = Color(argb: 0xFF1A1A1C)
    static let error = Color(argb: 0xFFFF7A66)
}

/// Text colours, and box / outline colours, offered for subtitles.
let subTextColors: [Int32] = ([
    0xFFFFFFFF, 0xFFFFE14D, 0xFFFFB347, 0xFFFF5A4D, 0xFFFF6FB5, 0xFFA970FF, 0xFF4D7CFF, 0xFF4DD9FF, 0xFF5BE37D, 0xFF000000,
] as [UInt32]).map { Int32(bitPattern: $0) }
let subBackColors: [Int32] = ([
    0xFF000000, 0xFF1E1E1E, 0xFFFFFFFF, 0xFFFFE14D, 0xFFFF5A4D, 0xFF4D7CFF, 0xFF1F8A4C, 0xFF7A2BD9,
] as [UInt32]).map { Int32(bitPattern: $0) }

/// "m:ss.t"
func subStamp(_ ms: Int64) -> String {
    let t = max(0, ms) / 100
    return String(format: "%d:%02d.%d", t / 600, t / 10 % 60, t % 10)
}

/// A subtitle font (by key) for the editor's own text.
func subFont(_ key: String, _ size: CGFloat) -> Font { Font(TextFonts.font(key, size: size)) }

/// Two ARGB colours the same, opacity aside.
func subSameColor(_ a: Int32, _ b: Int32) -> Bool { (UInt32(bitPattern: a) | 0xFF00_0000) == (UInt32(bitPattern: b) | 0xFF00_0000) }

/// Puts the keyboard away (a tap on the clip, or another tool).
func subHideKeyboard() {
    UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
}

extension Int32 {
    /// An ARGB colour as a SwiftUI one.
    var subColor: Color { Color(argb: UInt32(bitPattern: self)) }
}

struct SubIcon: View {
    let glyph: Glyph
    var flip = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            IconView(glyph, size: 21, color: .white)
                .scaleEffect(x: flip ? -1 : 1, y: 1)
                .frame(width: 40, height: 40)
                .contentShape(Circle())
        }
        .buttonStyle(GentlePress())
    }
}

struct SubChip: View {
    let text: String
    let on: Bool
    var font: Font?
    let action: () -> Void

    init(_ text: String, on: Bool, font: Font? = nil, action: @escaping () -> Void) {
        self.text = text
        self.on = on
        self.font = font
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            Text(text).font(font ?? UiType.sans(13)).lineLimit(1)
                .foregroundStyle(on ? Color.black : Color.white)
                .padding(.horizontal, 12).padding(.vertical, 7)
                .background(RoundedRectangle(cornerRadius: Corners.medium).fill(on ? Color.white : SubInk.panel))
                .overlay(RoundedRectangle(cornerRadius: Corners.medium).stroke(on ? Color.white : Color.white.opacity(0.15), lineWidth: 1))
        }
        .buttonStyle(GentlePress())
        .animation(.easeOut(duration: 0.16), value: on)
    }
}

struct SubPrimary: View {
    let text: String
    var enabled = true
    var compact = false
    let action: () -> Void

    init(_ text: String, enabled: Bool = true, compact: Bool = false, action: @escaping () -> Void) {
        self.text = text
        self.enabled = enabled
        self.compact = compact
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            Text(text).font(UiType.sans(compact ? 13 : 14, .semibold)).foregroundStyle(.black).lineLimit(1)
                .padding(.horizontal, compact ? 14 : 18).padding(.vertical, compact ? 8 : 11)
                .background(RoundedRectangle(cornerRadius: Corners.small).fill(SubInk.accent.opacity(enabled ? 1 : 0.4)))
        }
        .buttonStyle(GentlePress())
        .disabled(!enabled)
    }
}

struct SubSecondary: View {
    let text: String
    let action: () -> Void

    init(_ text: String, action: @escaping () -> Void) {
        self.text = text
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            Text(text).font(UiType.sans(13)).foregroundStyle(.white).lineLimit(1)
                .padding(.horizontal, 14).padding(.vertical, 10)
                .overlay(RoundedRectangle(cornerRadius: Corners.small).stroke(Color.white.opacity(0.25), lineWidth: 1))
                .contentShape(Rectangle())
        }
        .buttonStyle(GentlePress())
    }
}

/// An accent-coloured text button ("Or write them yourself", "Now", "Reset"...).
struct SubLink: View {
    let text: String
    var size: CGFloat = 13
    var padding: CGFloat = 8
    let action: () -> Void

    init(_ text: String, size: CGFloat = 13, padding: CGFloat = 8, action: @escaping () -> Void) {
        self.text = text
        self.size = size
        self.padding = padding
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            Text(text).font(UiType.sans(size)).foregroundStyle(SubInk.accent).lineLimit(1)
                .padding(padding).contentShape(Rectangle())
        }
        .buttonStyle(GentlePress())
    }
}

struct SubLabel: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text).font(UiType.sans(11)).foregroundStyle(SubInk.muted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// A text field on a dark well, with a faint hint while empty. [multiline] grows with the text.
struct SubField: View {
    let value: String
    let hint: String
    var font: Font?
    var size: CGFloat = 14
    var multiline = false
    var mono = false
    let onChange: (String) -> Void

    var body: some View {
        let binding = Binding(get: { value }, set: { onChange($0) })
        let f = font ?? (mono ? UiType.mono(size) : UiType.sans(size))
        ZStack(alignment: .topLeading) {
            if value.isEmpty {
                Text(hint).font(f).foregroundStyle(Color.white.opacity(0.3)).allowsHitTesting(false)
            }
            if multiline {
                TextField("", text: binding, axis: .vertical).font(f).foregroundStyle(.white).tint(SubInk.accent)
                    .lineLimit(1...4)
            } else {
                TextField("", text: binding).font(f).foregroundStyle(.white).tint(SubInk.accent)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
            }
        }
        .padding(.horizontal, 10).padding(.vertical, 9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: Corners.small).fill(SubInk.field))
    }
}

/// A row of colour dots; the chosen one ringed.
struct SubSwatches: View {
    let colors: [Int32]
    let selected: Int32?
    var dot: CGFloat = 30
    let pick: (Int32) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(colors, id: \.self) { c in
                    let on = selected.map { subSameColor($0, c) } ?? false
                    Button { pick(c) } label: {
                        Circle().fill(c.subColor).frame(width: dot, height: dot)
                            .overlay(Circle().strokeBorder(on ? SubInk.accent : Color.white.opacity(0.3), lineWidth: on ? 3 : 1))
                    }
                    .buttonStyle(GentlePress())
                }
            }
            .padding(.vertical, 2)
        }
    }
}

/// A label, a slider and its value, on one line.
struct SubSliderRow: View {
    let label: String
    let value: Float
    let min: Float
    let max: Float
    let shown: String
    let change: (Float) -> Void

    var body: some View {
        HStack(spacing: 0) {
            Text(label).font(UiType.sans(12)).foregroundStyle(SubInk.muted).frame(width: 64, alignment: .leading)
            LineSlider(value: value, min: min, max: max, onChange: change)
            Text(shown).font(UiType.mono(12)).foregroundStyle(.white).frame(width: 48, alignment: .trailing)
        }
    }
}

/// A small round button that repeats while held: once at once, then after a beat, quickly.
struct SubRepeat: View {
    let text: String
    let onStep: () -> Void
    @State var job: Task<Void, Never>?
    /// The newest step (the row it nudges changes with every step).
    @State var latest = StepBox()

    final class StepBox {
        var step: () -> Void = {}
        func set(_ f: @escaping () -> Void) { step = f }
    }

    var body: some View {
        let _ = latest.set(onStep)
        Text(text).font(UiType.sans(15)).foregroundStyle(.white)
            .frame(width: 28, height: 28)
            .background(Circle().fill(Color(argb: 0xFF2A2A2A)))
            .contentShape(Circle())
            .gesture(DragGesture(minimumDistance: 0).onChanged { _ in
                guard job == nil else { return }
                let box = latest
                job = Task { @MainActor in
                    box.step()
                    try? await Task.sleep(nanoseconds: 420_000_000)
                    while !Task.isCancelled {
                        box.step()
                        try? await Task.sleep(nanoseconds: 90_000_000)
                    }
                }
            }.onEnded { _ in
                job?.cancel()
                job = nil
            })
    }
}

/// A font drop-down with its label in front, on one line.
struct SubFontRow: View {
    let label: String
    let selected: String
    let telugu: Bool
    let pick: (String) -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            Text(label).font(UiType.sans(12)).foregroundStyle(SubInk.muted).frame(width: 64, alignment: .leading)
                .padding(.top, 11)
            SubFontMenu(selected: selected, telugu: telugu, pick: pick)
        }
    }
}

/// Fonts by family: a list of the families that have the script's letters, each shown in its
/// own face, and the chosen family's weights and styles underneath.
struct SubFontMenu: View {
    let selected: String
    let telugu: Bool
    let pick: (String) -> Void
    @State var open = false

    var body: some View {
        let lib = FontLibrary.shared
        let families = lib.families.filter { telugu ? $0.telugu : $0.latin }
        let current = lib.familyOf(selected)
        VStack(alignment: .leading, spacing: 6) {
            Button { open = true } label: {
                HStack {
                    Text(lib.label(selected)).font(subFont(selected, 15)).foregroundStyle(.white).lineLimit(1)
                    Spacer(minLength: 8)
                    Text("\(families.count) families  ▾").font(UiType.sans(12)).foregroundStyle(SubInk.muted)
                }
                .padding(.horizontal, 12).padding(.vertical, 9)
                .background(RoundedRectangle(cornerRadius: Corners.medium).fill(SubInk.panel))
                .overlay(RoundedRectangle(cornerRadius: Corners.medium).stroke(Color.white.opacity(0.15), lineWidth: 1))
                .contentShape(Rectangle())
            }
            .buttonStyle(GentlePress())
            if let current, current.faces.count > 1 {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(current.faces, id: \.key) { f in
                            SubChip(f.style, on: f.key == selected, font: subFont(f.key, 13)) { pick(f.key) }
                        }
                    }
                }
            }
        }
        .sheet(isPresented: $open) {
            SubFontList(families: families, current: current?.name, telugu: telugu) { f in
                pick(lib.nearest(f, like: selected).key)
                open = false
            }
            .presentationDetents([.medium, .large])
            .presentationBackground(Color(argb: 0xFF1C1C1C))
        }
    }
}

/// The families to pick from, each in its own face with a sample line.
struct SubFontList: View {
    let families: [FontFamilyGroup]
    let current: String?
    let telugu: Bool
    let pick: (FontFamilyGroup) -> Void

    var body: some View {
        let sample = telugu ? "తెలుగు ఉపశీర్షికలు" : "Subtitles Aa"
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                ForEach(families, id: \.name) { f in
                    Button { pick(f) } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(f.faces.count > 1 ? "\(f.name)  ·  \(f.faces.count) styles" : f.name)
                                .font(subFont(f.main.key, 16)).lineLimit(1)
                                .foregroundStyle(f.name == current ? SubInk.accent : .white)
                            Text(sample).font(subFont(f.main.key, 12)).foregroundStyle(SubInk.muted).lineLimit(1)
                        }
                        .padding(.horizontal, 18).padding(.vertical, 10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(f.name == current ? Color.white.opacity(0.06) : .clear)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.vertical, 12)
        }
        .preferredColorScheme(.dark)
    }
}

/// The share sheet, for a .srt file.
struct SubShareSheet: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }

    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}

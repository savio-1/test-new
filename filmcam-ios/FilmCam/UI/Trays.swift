import SwiftUI
import UIKit

/// Bundled tile pictures (shared with Android): looks/<camera>.jpg; imported looks keep theirs
/// with the app's files.
enum Tiles {
    private static var cache: [String: UIImage] = [:]

    static func look(_ id: String) -> UIImage? {
        if let i = cache[id] { return i }
        var img: UIImage?
        if let path = Bundle.main.path(forResource: id, ofType: "jpg", inDirectory: "looks") {
            img = UIImage(contentsOfFile: path)
        } else {
            let url = UserLooks.dir.appendingPathComponent("\(id).jpg")
            img = UIImage(contentsOfFile: url.path)
        }
        if let img { cache[id] = img }
        return img
    }
}

// MARK: - Looks

struct LooksTray: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.palette) var p
    let chrome: Double

    private struct Shelf: Hashable { let shelf: LookShelf; let category: String? }

    var body: some View {
        let category = model.category == "ORIGINAL" ? "FUJI" : model.category
        let shelves = [Shelf(shelf: .FAVOURITES, category: nil), Shelf(shelf: .ALL, category: nil)]
            + model.lookCategories.map { Shelf(shelf: .CATEGORY, category: $0.id) }
        let shelf = model.lookShelf == .CATEGORY ? Shelf(shelf: .CATEGORY, category: category) : Shelf(shelf: model.lookShelf, category: nil)
        let all = model.allLooks
        let cams: [FilmCamera] = {
            switch shelf.shelf {
            case .FAVOURITES: return all.filter { model.favourites.contains($0.id) }
            case .ALL: return all
            case .CATEGORY: return all.filter { $0.category == category }
            }
        }()
        TrayCard(chrome: chrome) {
            VStack(spacing: 0) {
                TextTabs(items: shelves, selected: shelf, label: { s in
                    switch s.shelf {
                    case .FAVOURITES: return "Favourites"
                    case .ALL: return "All"
                    case .CATEGORY: return model.lookCategories.first { $0.id == s.category }?.label ?? ""
                    }
                }) { s in model.setShelf(s.shelf, category: s.category) }
                .opacity(chrome)
                .padding(.bottom, 8)
                // Each shelf is its own row, faded in when it opens: tiles never slide across.
                ScrollViewReader { proxy in
                    ScrollView(.horizontal, showsIndicators: false) {
                        LazyHStack(spacing: 8) {
                            NoLookCard(selected: model.isOriginal) { model.removeLook() }.id("none")
                            ForEach(cams, id: \.id) { cam in
                                let sel = cam.id == model.camera.id
                                let imported = cam.id.hasPrefix(UserLooks.prefix)
                                LookCard(cam: cam, selected: sel, favourite: model.favourites.contains(cam.id),
                                         onRemove: sel && imported ? { model.removeUserLook(cam.id) } : nil) {
                                    if sel { model.removeLook() } else { model.selectCamera(cam) }
                                }
                                .id(cam.id)
                            }
                            if shelf.category == "CUSTOM" { ImportLutCard { model.importLut() }.id("import") }
                        }
                        .padding(.horizontal, 14)
                    }
                    .frame(height: 86)
                    .onAppear { proxy.scrollTo(model.camera.id, anchor: .center) }
                }
                .id(shelf)
                .transition(.opacity)
                .overlay(alignment: .leading) {
                    if cams.isEmpty && shelf.shelf == .FAVOURITES {
                        Text("Tap the heart under a look to keep it here").font(UiType.sans(12)).foregroundStyle(p.muted)
                            .padding(.leading, 96).padding(.bottom, 20)
                    }
                }
                .opacity(chrome)
                if !model.isOriginal {
                    LookStrength(chrome: chrome).transition(.opacity.combined(with: .move(edge: .bottom)))
                }
            }
            .animation(.easeOut(duration: 0.16), value: shelf)
            .animation(.easeOut(duration: 0.2), value: model.isOriginal)
        }
    }
}

/// A heart to keep the chosen look in Favourites, and its intensity, right with the looks.
private struct LookStrength: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.palette) var p
    let chrome: Double

    var body: some View {
        let fav = model.favourites.contains(model.camera.id)
        HStack(spacing: 0) {
            Button { model.toggleFavourite(model.camera.id) } label: {
                IconView(fav ? Ico.heartFilled : Ico.heart, size: 20, color: p.text)
                    .scaleEffect(fav ? 1 : 0.92)
                    .frame(width: 36, height: 36)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .animation(.spring(response: 0.3, dampingFraction: 0.45), value: fav)
            .opacity(chrome)
            Text("INTENSITY").font(UiType.mono(9)).tracking(1.6).foregroundStyle(p.muted)
                .padding(.leading, 4).padding(.trailing, 10).opacity(chrome)
            LineSlider(value: model.look.intensity, onActive: { model.adjusting = $0 }) { v in model.setIntensity(v) }
            Text("\(Int((model.look.intensity * 100).rounded()))").font(UiType.mono(11)).foregroundStyle(p.text)
                .frame(width: 34, alignment: .trailing)
        }
        .padding(.leading, 10).padding(.trailing, 16).padding(.top, 10)
    }
}

private struct NoLookCard: View {
    @Environment(\.palette) var p
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                IconView(Ico.none, size: 24, color: selected ? p.text : p.muted)
                    .frame(width: 62, height: 64)
                    .overlay(RoundedRectangle(cornerRadius: Corners.medium).stroke(selected ? p.text : p.line, lineWidth: selected ? 1.5 : 1))
                Text("None").font(UiType.sans(10, selected ? .semibold : .regular)).foregroundStyle(selected ? p.text : p.muted).lineLimit(1)
            }
            .frame(width: 64)
        }
        .buttonStyle(GentlePress())
    }
}

private struct ImportLutCard: View {
    @Environment(\.palette) var p
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                VStack(spacing: 2) {
                    IconView(Ico.plus, size: 20, color: p.text)
                    Text(".cube").font(UiType.sans(9)).foregroundStyle(p.muted)
                }
                .frame(width: 62, height: 64)
                .overlay(RoundedRectangle(cornerRadius: Corners.medium).stroke(p.line, lineWidth: 1))
                Text("Import LUT").font(UiType.sans(10)).foregroundStyle(p.muted).lineLimit(1)
            }
            .frame(width: 64)
        }
        .buttonStyle(GentlePress())
    }
}

private struct LookCard: View {
    @Environment(\.palette) var p
    let cam: FilmCamera
    let selected: Bool
    var favourite = false
    var onRemove: (() -> Void)?
    let action: () -> Void

    var body: some View {
        let swatch = Color(uiColor: Spec.shared.stock(cam.look.stock).swatch.argbColor)
        Button(action: action) {
            VStack(spacing: 4) {
                ZStack(alignment: .topTrailing) {
                    LinearGradient(colors: [swatch, swatch.opacity(0.4)], startPoint: .top, endPoint: .bottom)
                    if let img = Tiles.look(cam.id) {
                        Image(uiImage: img).resizable().scaledToFill()
                    }
                    if favourite && onRemove == nil {
                        IconView(Ico.heartFilled, size: 11, color: .white).padding(4)
                    }
                }
                .frame(width: selected ? 56 : 62, height: selected ? 58 : 64)
                .clipShape(RoundedRectangle(cornerRadius: selected ? Corners.small : Corners.medium))
                .frame(width: 62, height: 64)
                .overlay(RoundedRectangle(cornerRadius: Corners.medium).stroke(selected ? p.text : p.line, lineWidth: selected ? 1.5 : 1))
                .overlay(alignment: .topTrailing) {
                    if let onRemove {
                        Button(action: onRemove) {
                            IconView(Ico.close, size: 12, color: .white)
                                .frame(width: 20, height: 20)
                                .background(Circle().fill(Color(argb: 0xCC000000)))
                        }
                        .buttonStyle(.plain)
                        .padding(2)
                    }
                }
                Text(cam.name).font(UiType.sans(10, selected ? .semibold : .regular)).foregroundStyle(selected ? p.text : p.muted).lineLimit(1)
            }
            .frame(width: 64)
        }
        .buttonStyle(GentlePress())
        .animation(.spring(response: 0.3, dampingFraction: 0.6), value: selected)
    }
}

// MARK: - Adjust

struct AdjustTray: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.palette) var p
    let chrome: Double

    var body: some View {
        let tools = model.tools
        let visible = tools.filter { $0.group == model.toolGroup && $0.visible(model.look) }
        let tool = visible.first { $0.id == model.toolId } ?? visible.first
        let preset = model.camera.look
        TrayCard(chrome: chrome) {
            VStack(spacing: 0) {
                HStack(spacing: 0) {
                    TextTabs(items: ToolGroup.allCases, selected: model.toolGroup, label: { $0.label }) { g in
                        model.toolGroup = g
                        model.toolId = tools.first { $0.group == g }?.id ?? model.toolId
                    }
                    IconCircle(glyph: Ico.reset, size: 34) { model.resetLook() }.padding(.trailing, 8)
                }
                .opacity(chrome)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 4) {
                        ForEach(visible) { t in
                            ToolButton(glyph: t.glyph, label: t.label, selected: t.id == tool?.id,
                                       changed: t.get(model.look) != t.get(preset)) { model.toolId = t.id }
                        }
                    }
                    .padding(.horizontal, 10)
                }
                .padding(.top, 6)
                .opacity(chrome)
                if let tool {
                    Text(tool.label).font(UiType.sans(10)).tracking(1).foregroundStyle(p.muted).padding(.top, 10).opacity(chrome)
                    Ruler(value: tool.get(model.look), min: tool.min, max: tool.max, defaultValue: tool.get(preset),
                          format: tool.format, options: tool.options,
                          onChange: { v in model.adjustTool(tool.id, v) },
                          onActive: { model.adjusting = $0 })
                        .id(tool.id)
                        .padding(.top, 4)
                }
            }
        }
    }
}

// MARK: - Frame

struct FrameTray: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.palette) var p
    let chrome: Double

    var body: some View {
        TrayCard(chrome: chrome) {
            VStack(spacing: 12) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(model.spec.frames, id: \.id) { style in
                            let sel = model.look.frame == style.id
                            Button { model.setFrame(style.id) } label: {
                                VStack(spacing: 5) {
                                    BorderThumb(style: style.id)
                                        .clipShape(RoundedRectangle(cornerRadius: Corners.small))
                                        .padding(sel ? 3 : 1)
                                        .frame(width: 48, height: 64)
                                        .overlay(RoundedRectangle(cornerRadius: Corners.small).stroke(sel ? p.text : p.line, lineWidth: sel ? 2 : 1))
                                    Text(style.label).font(UiType.sans(9)).foregroundStyle(sel ? p.text : p.muted).lineLimit(1)
                                }
                                .frame(width: 58)
                            }
                            .buttonStyle(GentlePress())
                        }
                    }
                    .padding(.horizontal, 14)
                }
                HStack(spacing: 10) {
                    IconView(Ico.stamp, size: 18, color: p.muted)
                    Segmented(options: model.spec.stamps.map { $0.id }, selected: model.look.stamp,
                              label: { id in model.spec.stamps.first { $0.id == id }?.label ?? id }) { model.setStamp($0) }
                }
                .padding(.horizontal, 14)
            }
            .opacity(chrome)
        }
    }
}

/// A small picture of each border, so the list reads at a glance.
private struct BorderThumb: View {
    let style: String

    var body: some View {
        Canvas { ctx, size in
            let w = size.width, h = size.height, s = min(w, h)
            let pic = Gradient(colors: [Color(argb: 0xFFE2A25E), Color(argb: 0xFF7F9A92), Color(argb: 0xFF34424B)])
            let cream = Color(argb: 0xFFF1ECE2), dark = Color(argb: 0xFF0C0B0A)
            func fill(_ c: Color) { ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(c)) }
            func picture(_ l: CGFloat, _ t: CGFloat, _ r: CGFloat, _ b: CGFloat, _ radius: CGFloat = 0) {
                ctx.fill(Path(roundedRect: CGRect(x: l, y: t, width: r - l, height: b - t), cornerRadius: radius),
                         with: .linearGradient(pic, startPoint: .zero, endPoint: CGPoint(x: w, y: h)))
            }
            func rr(_ c: Color, _ x: CGFloat, _ y: CGFloat, _ rw: CGFloat, _ rh: CGFloat, _ radius: CGFloat) {
                ctx.fill(Path(roundedRect: CGRect(x: x, y: y, width: rw, height: rh), cornerRadius: radius), with: .color(c))
            }
            switch style {
            case "GATE": fill(dark); picture(s * 0.06, s * 0.06, w - s * 0.06, h - s * 0.06, s * 0.12)
            case "INSTANT": fill(cream); picture(s * 0.08, s * 0.08, w - s * 0.08, h - s * 0.3)
            case "INSTANT_SQUARE": fill(cream); picture(s * 0.08, s * 0.08, w - s * 0.08, s * 0.08 + (w - s * 0.16))
            case "INSTANT_MINI": fill(cream); picture(s * 0.11, s * 0.08, w - s * 0.11, h - s * 0.28)
            case "FILMSTRIP":
                fill(dark); picture(s * 0.22, s * 0.03, w - s * 0.22, h - s * 0.03, 2)
                var y: CGFloat = 2
                while y < h {
                    for x in [s * 0.06, w - s * 0.14] { rr(cream, x, y, s * 0.08, s * 0.06, 1.5) }
                    y += s * 0.15
                }
            case "FILED": fill(dark); picture(s * 0.07, s * 0.07, w - s * 0.07, h - s * 0.07)
            case "WHITE": fill(cream); picture(s * 0.06, s * 0.06, w - s * 0.06, h - s * 0.06)
            case "MAT":
                fill(cream); rr(Color(argb: 0xFF333333), s * 0.15, s * 0.15, w - s * 0.3, h - s * 0.3, 0)
                picture(s * 0.17, s * 0.17, w - s * 0.17, h - s * 0.17)
            case "BLACK": fill(dark); picture(s * 0.06, s * 0.06, w - s * 0.06, h - s * 0.06)
            case "STRIP_120":
                fill(dark)
                var y = -s * 0.45
                while y < h { picture(s * 0.09, y, w - s * 0.09, y + w - s * 0.18, 2); y += w - s * 0.12 }
            case "SUPER8_STRIP":
                fill(Color(argb: 0xFF120D09))
                var y = -s * 0.2
                let cell = (w - s * 0.32) * 0.75
                while y < h {
                    picture(s * 0.26, y, w - s * 0.06, y + cell, 4)
                    rr(cream, s * 0.06, y + cell * 0.35, s * 0.1, s * 0.12, 2)
                    y += cell + s * 0.08
                }
            case "SLIDE_MOUNT": fill(Color(argb: 0xFFE6E2D9)); picture(s * 0.18, h * 0.22, w - s * 0.18, h - h * 0.22, 4)
            case "LETTERBOX": fill(.black); picture(0, h / 2 - w / 4.8, w, h / 2 + w / 4.8)
            case "ACADEMY": fill(.black); picture(0, h / 2 - w * 2 / 3, w, h / 2 + w * 2 / 3)
            case "DECKLE":
                fill(Color(argb: 0xFF1A1715)); rr(cream, 3, 3, w - 6, h - 6, 4)
                picture(s * 0.13, s * 0.13, w - s * 0.13, h - s * 0.13)
            case "ROUNDED": fill(.black); picture(s * 0.05, s * 0.05, w - s * 0.05, h - s * 0.05, s * 0.15)
            default: picture(0, 0, w, h)
            }
        }
    }
}

// MARK: - Quick panels

/// The small panel under the chips: one choice at a time, over the top of the picture.
struct QuickPanel: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.palette) var p
    let q: Quick

    var body: some View {
        VStack(spacing: 0) {
            switch q {
            case .RATIO:
                if model.edit != nil {
                    PanelLabel("Shape")
                    let options: [AspectRatio?] = [nil] + AspectRatio.allCases
                    Segmented(options: options, selected: model.editRatio, label: { $0?.label(false) ?? "Original" }) { model.setRatio($0) }
                } else {
                    PanelLabel("Frame shape")
                    Segmented(options: AspectRatio.allCases, selected: model.mode == .VIDEO ? model.videoRatio : model.photoRatio,
                              label: { $0.label(model.sideways) }) { model.setRatio($0) }
                    PanelHelp("The frame turns with the phone: hold it sideways for \(AspectRatio.R9_16.label(true)).")
                }
            case .SIZE:
                PanelLabel("Photo size")
                let sizes = model.caps.photoSizes
                if !sizes.isEmpty {
                    Segmented(options: sizes, selected: sizes.first { $0.mp == model.photoSize?.mp } ?? sizes.last!, label: { $0.label }) { model.setPhotoSize($0) }
                }
                if let sel = model.photoSize, sel.height > 1 {
                    PanelHelp(sel.mp > 30 ? "The full sensor: most detail in good light, slower to shoot and more noise in low light."
                              : "\(sel.width) × \(sel.height) from the sensor.")
                }
            case .VIDEO:
                PanelLabel("Resolution")
                Segmented(options: VideoResolution.allCases, selected: model.videoRes, label: { $0.label },
                          enabled: { model.caps.videoRes.contains($0) }) { model.setVideoResolution($0) }
                PanelLabel("Frame rate", top: 12)
                Segmented(options: fpsChoices, selected: model.fps, label: { "\($0)" },
                          enabled: { model.caps.fps.contains($0) }) { model.setFps($0) }
                PanelHelp(model.caps.encoderInfo)
            case .TIMER:
                PanelLabel("Self-timer")
                Segmented(options: timerChoices, selected: model.timerSeconds, label: { timerLabel($0) }) { model.setTimer($0) }
            case .BURST:
                PanelLabel("Burst · shots")
                Segmented(options: burstCounts, selected: model.burstCount, label: { $0 == 1 ? "Off" : $0 == 0 ? "∞" : "\($0)" }) {
                    model.setBurst($0, model.burstInterval)
                }
                PanelLabel("Every", top: 12)
                Segmented(options: burstIntervals, selected: model.burstInterval, label: { intervalLabel($0) },
                          enabled: { _ in model.burstCount != 1 }) { model.setBurst(model.burstCount, $0) }
                PanelHelp("Press the shutter to start; press again to stop. Works with the self-timer.")
            case .LOG:
                PanelHelp("Log video is coming to iPhone.")
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .background(RoundedRectangle(cornerRadius: Corners.small).fill(p.surface.opacity(0.97)))
        .overlay(RoundedRectangle(cornerRadius: Corners.small).stroke(p.line, lineWidth: 1))
        .contentShape(Rectangle())
        .onTapGesture {}
        .padding(.horizontal, 8)
    }
}

// MARK: - Settings

struct SettingsSheet: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.palette) var p

    var body: some View {
        ZStack(alignment: .bottom) {
            Color.black.opacity(0.45).ignoresSafeArea().contentShape(Rectangle()).onTapGesture { model.settingsOpen = false }
            ScrollView {
                VStack(spacing: 0) {
                    HStack {
                        Text("Settings").font(UiType.sans(20, .medium)).foregroundStyle(p.text)
                        Spacer()
                        IconCircle(glyph: Ico.close, size: 36) { model.settingsOpen = false }
                    }
                    label("Appearance")
                    Segmented(options: ThemeMode.allCases, selected: model.theme, label: { $0.label }) { model.setTheme($0) }
                    if model.mode == .VIDEO {
                        label("Video resolution")
                        Segmented(options: VideoResolution.allCases, selected: model.videoRes, label: { $0.label },
                                  enabled: { model.caps.videoRes.contains($0) }) { model.setVideoResolution($0) }
                        label("Frame rate")
                        Segmented(options: fpsChoices, selected: model.fps, label: { "\($0)" },
                                  enabled: { model.caps.fps.contains($0) }) { model.setFps($0) }
                        if !model.caps.encoderInfo.isEmpty {
                            Text(model.caps.encoderInfo).font(UiType.mono(11)).foregroundStyle(p.muted)
                                .frame(maxWidth: .infinity, alignment: .leading).padding(.top, 8)
                        }
                        if model.caps.stabilization {
                            SettingSwitch(title: "Stabilisation", help: "Steadier, slightly cropped", value: model.stabilization) { model.setStabilization($0) }
                        }
                        SettingSwitch(title: "Reduce background noise", help: "Hiss, hum, fans and traffic taken out of the sound; the voice stays natural",
                                      value: model.voiceDenoise) { model.setVoiceDenoise($0) }
                    } else if !model.caps.photoSizes.isEmpty {
                        label("Photo size")
                        let sizes = model.caps.photoSizes
                        Segmented(options: sizes, selected: sizes.first { $0.mp == model.photoSize?.mp } ?? sizes.last!, label: { $0.label }) { model.setPhotoSize($0) }
                        if sizes.count > 1 {
                            PanelHelp("The larger size reads every pixel of the sensor: most detail in good light, more noise in low light.")
                        }
                        SettingSwitch(title: "Real shutter speed", help: "The sensor exposes for the chosen speed", value: model.realShutter) { model.setRealShutter($0) }
                    }
                    SettingSwitch(title: "Shutter and record sounds", help: "The click, and the tones when recording starts and stops",
                                  value: model.shutterSound) { model.setShutterSound($0) }
                }
                .padding(.horizontal, 18).padding(.vertical, 16)
            }
            .scrollBounceBehavior(.basedOnSize)
            .frame(maxHeight: 560)
            .fixedSize(horizontal: false, vertical: true)
            .background(RoundedRectangle(cornerRadius: Corners.large).fill(p.surface))
            .overlay(RoundedRectangle(cornerRadius: Corners.large).stroke(p.line, lineWidth: 1))
            .padding(10)
        }
    }

    private func label(_ text: String) -> some View {
        SectionLabel(text).padding(.top, 18).padding(.bottom, 8)
    }
}

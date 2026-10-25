import AVFoundation
import SwiftUI
import UniformTypeIdentifiers

/// The viewfinder: the GL layer the render queue draws the final pass into.
/// The camera's own preview, for log (the file is flat; the screen shows it as the camera sees it).
struct CameraPreview: UIViewRepresentable {
    let session: AVCaptureSession

    final class PreviewView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var preview: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    }

    func makeUIView(context: Context) -> PreviewView {
        let v = PreviewView()
        v.backgroundColor = .black
        v.preview.session = session
        v.preview.videoGravity = .resizeAspectFill
        return v
    }

    func updateUIView(_ uiView: PreviewView, context: Context) {}
}

struct ViewfinderGL: UIViewRepresentable {
    let engine: CameraEngine

    func makeUIView(context: Context) -> GLDisplayView {
        let v = GLDisplayView(frame: .zero)
        engine.attach(v)
        return v
    }

    func updateUIView(_ uiView: GLDisplayView, context: Context) {}
}

/// The whole app: the camera, or the gallery, viewer or subtitle editor over it.
struct RootView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.scenePhase) var phase
    @Environment(\.colorScheme) var system

    private var palette: Palette {
        switch model.theme {
        case .SYSTEM: return system == .dark ? .darkPalette : .light
        case .LIGHT: return .light
        case .DARK: return .darkPalette
        }
    }

    var body: some View {
        let p = palette
        ZStack {
            p.bg.ignoresSafeArea()
            if !p.dark { DotGrid(color: p.dots).ignoresSafeArea() }
            Group {
                switch model.screen {
                case .CAMERA: CameraPage()
                case .GALLERY: GalleryScreen()
                case .VIEWER: ViewerScreen()
                case .SUBTITLES: SubtitleScreen()
                }
            }
            .transition(.opacity.combined(with: .scale(scale: 0.985)))
            Toast()
        }
        .animation(.easeOut(duration: 0.22), value: model.screen)
        .environment(\.palette, p)
        .preferredColorScheme(model.theme == .SYSTEM ? nil : model.theme == .DARK ? .dark : .light)
        .statusBarHidden(model.screen == .CAMERA)
        .onAppear { model.appear() }
        .onChange(of: phase) { _, ph in model.scenePhase(ph) }
        .sheet(isPresented: $model.pickingMedia) {
            MediaPicker(onPick: { url, video in
                model.pickingMedia = false
                model.imported(url, video: video)
            }, onCancel: { model.pickingMedia = false })
            .ignoresSafeArea()
        }
        .fileImporter(isPresented: $model.pickingLut,
                      allowedContentTypes: [UTType(filenameExtension: "cube") ?? .data, .png, .jpeg, .data]) { result in
            if case .success(let url) = result { model.importLut(from: url) }
        }
    }
}

/// A short message, faded and lifted in, then out.
private struct Toast: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.palette) var p

    var body: some View {
        VStack {
            if let msg = model.message {
                Text(msg).font(UiType.sans(13)).foregroundStyle(p.text).multilineTextAlignment(.center)
                    .padding(.horizontal, 16).padding(.vertical, 12)
                    .background(RoundedRectangle(cornerRadius: Corners.small).fill(p.surface))
                    .overlay(RoundedRectangle(cornerRadius: Corners.small).stroke(p.line, lineWidth: 1))
                    .padding(32)
                    .transition(.opacity.combined(with: .offset(y: 12)))
                    .task(id: msg) {
                        try? await Task.sleep(nanoseconds: 2_600_000_000)
                        if model.message == msg { model.message = nil }
                    }
                    .onTapGesture { model.message = nil }
            }
        }
        .animation(.easeOut(duration: 0.22), value: model.message)
    }
}

struct CameraPage: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.palette) var p

    var body: some View {
        // Everything except the control being dragged fades out, so the picture can be judged.
        let chrome: Double = model.adjusting ? 0 : 1
        ZStack {
            if !model.hasCamera && model.edit == nil {
                PermissionPrompt()
            } else {
                VStack(spacing: 0) {
                    TopBar().opacity(chrome)
                    QuickBar().opacity(chrome)
                    ZStack {
                        // A tap outside a tray or panel closes it.
                        Color.clear.contentShape(Rectangle()).onTapGesture { model.dock = .NONE; model.quick = nil }
                        Viewfinder(chrome: chrome)
                        VStack {
                            if let q = model.quick {
                                QuickPanel(q: q).opacity(chrome)
                                    .transition(.opacity.combined(with: .scale(scale: 0.96, anchor: .top)))
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.top, 6)
                        VStack {
                            Spacer(minLength: 0)
                            tray(chrome).opacity(model.movingText ? 0 : 1)
                        }
                        .padding(.bottom, 8)
                    }
                    .padding(.horizontal, 10)
                    .frame(maxHeight: .infinity)
                    DockBar().opacity(chrome)
                    if model.edit != nil { EditLabel().opacity(chrome) } else { ModeSwitch().opacity(chrome) }
                    ShutterRow().opacity(chrome)
                }
                .animation(.easeOut(duration: 0.16), value: model.adjusting)
                .animation(.easeOut(duration: 0.2), value: model.quick)
                .animation(.easeOut(duration: 0.22), value: model.dock)
            }
            if model.progress >= 0 { ProgressVeil() }
            if model.settingsOpen { SettingsSheet().transition(.opacity) }
            if model.editingText { TextEditOverlay().transition(.opacity) }
        }
        .animation(.easeOut(duration: 0.18), value: model.settingsOpen)
        .animation(.easeOut(duration: 0.16), value: model.editingText)
    }

    @ViewBuilder private func tray(_ chrome: Double) -> some View {
        let shown: Dock = (model.recording && model.dock != .TEXT) || model.logActive ? .NONE : model.dock
        Group {
            switch shown {
            case .LOOKS: LooksTray(chrome: chrome)
            case .ADJUST: AdjustTray(chrome: chrome)
            case .FRAME: FrameTray(chrome: chrome)
            case .TEXT: TextTray(chrome: chrome)
            case .NONE: EmptyView()
            }
        }
        .transition(.opacity.combined(with: .offset(y: 30)))
        .id(shown)
    }
}

private struct PermissionPrompt: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.palette) var p

    var body: some View {
        VStack(spacing: 0) {
            IconView(Ico.film, size: 36, color: p.text)
            Text("S film").font(UiType.sans(32, .medium)).foregroundStyle(p.text).padding(.top, 18)
            Text("Photos and video through a live film emulsion. It needs the camera, and the microphone for sound.")
                .font(UiType.sans(14)).foregroundStyle(p.muted).multilineTextAlignment(.leading).lineSpacing(4)
                .padding(.top, 10)
            if model.permissionAsked {
                Pill("Open Settings", filled: true) {
                    if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                }
                .padding(.top, 28)
            }
        }
        .padding(36)
    }
}

// MARK: - Top bar

private struct TopBar: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.palette) var p

    var body: some View {
        let rot = iconRotation(model.frameTurns)
        HStack(spacing: 0) {
            HStack {
                if model.edit != nil {
                    IconCircle(glyph: Ico.close) { model.cancelEdit() }
                } else {
                    IconCircle(glyph: model.flash ? Ico.flash : Ico.flashOff, enabled: model.hasFlash, rotation: rot,
                               tint: model.flash ? p.accent : p.text) { model.toggleFlash() }
                }
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity)
            Button {
                if !model.recording && !model.logActive { model.dock = model.dock == .LOOKS ? .NONE : .LOOKS }
            } label: {
                VStack(spacing: 1) {
                    Text(model.logActive ? "Log" : model.camera.name).font(UiType.sans(18, .medium)).foregroundStyle(p.text).lineLimit(1)
                        .id(model.camera.id)
                        .transition(.opacity.combined(with: .offset(y: 6)))
                    Text(subtitle).font(UiType.mono(9)).tracking(1.2).foregroundStyle(p.muted).lineLimit(1)
                }
                .padding(.horizontal, 10).padding(.vertical, 2)
                .animation(.easeOut(duration: 0.2), value: model.camera.id)
            }
            .buttonStyle(.plain)
            HStack(spacing: 0) {
                Spacer(minLength: 0)
                if model.edit == nil {
                    IconCircle(glyph: Ico.gallery, enabled: !model.recording, rotation: rot) { model.openGallery() }
                }
                IconCircle(glyph: Ico.tune, enabled: !model.recording, rotation: rot) { model.settingsOpen = true }
            }
            .frame(maxWidth: .infinity)
        }
        .frame(height: 56)
        .padding(.horizontal, 12)
    }

    private var subtitle: String {
        var parts: [String]
        if model.logActive {
            parts = model.logCurveInUse == .APPLE_LOG ? ["Apple Log", "10-bit", "Rec.2020"] : ["HLG", "10-bit", "Rec.2020"]
        } else if model.edit != nil {
            parts = ["Developing", model.spec.stock(model.look.stock).name]
        } else if model.isOriginal {
            parts = ["No look", model.mode == .VIDEO ? "Video" : "Photo"]
        } else {
            parts = [model.spec.stock(model.look.stock).name, model.spec.shutterSpeeds.first { $0.id == model.look.shutter }?.label ?? ""]
            if model.mode == .VIDEO, model.look.frameRate != "NATIVE" {
                parts.append("\(model.spec.fps(model.look.frameRate))fps")
            }
        }
        return parts.filter { !$0.isEmpty }.joined(separator: "  ·  ").uppercased()
    }
}

func iconRotation(_ turns: Int) -> Double {
    switch turns & 3 { case 1: return -90; case 2: return 180; case 3: return 90; default: return 0 }
}

/// Chips for the shot's shape and options; each opens a small panel over the picture.
private struct QuickBar: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        HStack(spacing: 6) {
            if let e = model.edit {
                QuickChip(quick: .RATIO, glyph: Ico.ratio, text: model.editRatio?.label(false) ?? "Original")
                QuickChip(quick: nil, glyph: nil, text: e.video ? clipLabel(e.durationMs) : "\(e.width)×\(e.height)")
            } else if model.mode == .VIDEO {
                QuickChip(quick: .RATIO, glyph: Ico.ratio, text: model.videoRatio.label(model.sideways))
                QuickChip(quick: .VIDEO, glyph: nil, text: "\(model.videoRes.label) · \(model.fps)")
                if model.caps.hlg || model.caps.appleLog {
                    QuickChip(quick: .LOG, glyph: Ico.log, text: model.log ? "Log" : "Std", active: model.log)
                }
                QuickChip(quick: .TIMER, glyph: Ico.timer, text: timerLabel(model.timerSeconds), active: model.timerSeconds > 0)
            } else {
                QuickChip(quick: .RATIO, glyph: Ico.ratio, text: model.photoRatio.label(model.sideways))
                QuickChip(quick: .SIZE, glyph: nil, text: model.photoSize?.label ?? "—")
                if model.rawSupported { ToggleChip(text: "RAW", on: model.raw) { model.setRaw(!model.raw) } }
                QuickChip(quick: .TIMER, glyph: Ico.timer, text: timerLabel(model.timerSeconds), active: model.timerSeconds > 0)
                QuickChip(quick: .BURST, glyph: Ico.burst, text: burstLabel(model.burstCount, model.burstInterval), active: model.burstCount != 1)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.bottom, 6)
    }
}

private struct QuickChip: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.palette) var p
    let quick: Quick?
    let glyph: Glyph?
    let text: String
    var active = false

    var body: some View {
        let open = quick != nil && model.quick == quick
        let tint = open ? p.bg : active ? p.accent : p.text
        Button {
            guard let quick, !model.recording else { return }
            model.dock = .NONE
            model.quick = open ? nil : quick
        } label: {
            HStack(spacing: 5) {
                if let glyph { IconView(glyph, size: 14, color: tint) }
                Text(text).font(UiType.mono(11)).fontWeight(.semibold).foregroundStyle(tint).lineLimit(1)
            }
            .padding(.horizontal, 9).padding(.vertical, 5)
            .background(RoundedRectangle(cornerRadius: Corners.small).fill(open ? p.text : .clear))
            .overlay(RoundedRectangle(cornerRadius: Corners.small).stroke(open ? p.text : p.line, lineWidth: 1))
        }
        .buttonStyle(GentlePress())
    }
}

/// A chip that switches something on and off (RAW).
private struct ToggleChip: View {
    @Environment(\.palette) var p
    let text: String
    let on: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(text).font(UiType.mono(11)).fontWeight(.semibold).foregroundStyle(on ? p.bg : p.text)
                .padding(.horizontal, 9).padding(.vertical, 5)
                .background(RoundedRectangle(cornerRadius: Corners.small).fill(on ? p.accent : .clear))
                .overlay(RoundedRectangle(cornerRadius: Corners.small).stroke(on ? p.accent : p.line, lineWidth: 1))
        }
        .buttonStyle(GentlePress())
    }
}

// MARK: - Viewfinder

private struct Viewfinder: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.palette) var p
    let chrome: Double

    @State var focus: CGPoint?
    @State var focusKey = 0
    @State var exposing = false
    @State var startEv: Float = 0
    @State var flashAlpha: Double = 0
    @State var lastPinch: CGFloat = 1

    var body: some View {
        let aspect = CGFloat(model.frameAspect)
        GeometryReader { geo in
            let box = fit(geo.size, aspect)
            ZStack {
                ViewfinderGL(engine: model.engine)
                if model.logActive { CameraPreview(session: model.engine.session) }
                if model.dock == .TEXT && !model.logActive {
                    TextEditorLayer()
                } else if model.edit == nil {
                    gestures(box)
                }
                if let f = focus {
                    FocusRing(pos: f, key: focusKey, ev: model.look.exposureEv, evMin: model.evMin, evMax: model.evMax,
                              active: exposing, rotation: iconRotation(model.frameTurns)) { focus = nil }
                }
                Color.white.opacity(flashAlpha).allowsHitTesting(false)
                overlays.opacity(chrome)
                if model.zooming { GlassText(zoomLabel(model.zoom, true), big: true).allowsHitTesting(false) }
                if model.countdown > 0 {
                    Text("\(model.countdown)").font(UiType.sans(76)).foregroundStyle(.white)
                        .frame(width: 132, height: 132).background(Circle().fill(Color.glass))
                        .rotationEffect(.degrees(iconRotation(model.frameTurns)))
                        .allowsHitTesting(false)
                }
            }
            .frame(width: box.width, height: box.height)
            .clipShape(RoundedRectangle(cornerRadius: Corners.large))
            .background(RoundedRectangle(cornerRadius: Corners.large).fill(.black))
            .position(x: geo.size.width / 2, y: geo.size.height / 2)
        }
        .onChange(of: model.flashPulse) { _, _ in
            flashAlpha = 0.85
            withAnimation(.easeOut(duration: 0.32)) { flashAlpha = 0 }
        }
    }

    private func fit(_ size: CGSize, _ aspect: CGFloat) -> CGSize {
        guard size.width > 0, size.height > 0 else { return .zero }
        return size.width / size.height > aspect ? CGSize(width: size.height * aspect, height: size.height)
            : CGSize(width: size.width, height: size.width / aspect)
    }

    /// Like a phone's own camera: tap to focus and meter there, then drag up or down to
    /// brighten or darken; pinch to zoom.
    private func gestures(_ box: CGSize) -> some View {
        Color.clear
            .contentShape(Rectangle())
            .gesture(SpatialTapGesture().onEnded { e in
                // With a tray or panel open, a tap on the picture closes it rather than focusing.
                if model.quick != nil || model.dock != .NONE {
                    model.quick = nil
                    model.dock = .NONE
                    return
                }
                focus = e.location
                focusKey += 1
                model.tapToFocus(e.location.x / max(box.width, 1), e.location.y / max(box.height, 1))
            })
            .simultaneousGesture(DragGesture(minimumDistance: 12).onChanged { g in
                guard focus != nil, exposing || abs(g.translation.height) > abs(g.translation.width) else { return }
                if !exposing { exposing = true; startEv = model.look.exposureEv }
                focusKey += 1
                // Half the frame's height spans the whole range.
                let span = model.evMax - model.evMin
                let v = min(max(startEv - Float(g.translation.height / (box.height * 0.5)) * span / 2, model.evMin), model.evMax)
                let stepped = (v * 10).rounded() / 10
                if stepped != model.look.exposureEv {
                    var l = model.look
                    l.exposureEv = stepped
                    model.updateLook(l)
                }
            }.onEnded { _ in exposing = false })
            .simultaneousGesture(MagnificationGesture().onChanged { s in
                let step = s / lastPinch
                lastPinch = s
                if abs(step - 1) > 0.001 { model.pinch(Float(step)) }
            }.onEnded { _ in lastPinch = 1 })
    }

    @ViewBuilder private var overlays: some View {
        ZStack {
            VStack {
                HStack(alignment: .top) {
                    Spacer()
                    if model.recording {
                        RecordingBadge()
                    } else if model.burstTotal >= 0 {
                        GlassText(model.burstTotal == 0 ? "Burst  \(model.burstTaken)" : "Burst  \(model.burstTaken) / \(model.burstTotal)")
                    }
                    Spacer()
                }
                .padding(.top, 12)
                Spacer()
            }
            VStack {
                HStack {
                    Spacer()
                    StatusPill()
                }
                .padding(12)
                Spacer()
            }
            if model.edit == nil && (model.dock == .NONE || model.recording) {
                VStack {
                    Spacer()
                    ZoomPills().padding(.bottom, 12)
                }
            }
        }
    }
}

private struct StatusPill: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        let status: String? = model.savingVideo ? "Saving" : model.developing > 0 ? "Developing"
            : model.logActive ? "Log · 10-bit" : nil
        if let status {
            HStack(spacing: 7) {
                ProgressView().controlSize(.mini).tint(.white)
                Text(status).font(UiType.sans(11)).foregroundStyle(.white)
            }
            .padding(.horizontal, 10).padding(.vertical, 6)
            .background(RoundedRectangle(cornerRadius: Corners.medium).fill(Color.glass))
            .allowsHitTesting(false)
        }
    }
}

private struct RecordingBadge: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.25)) { ctx in
            let secs = max(0, Int(ctx.date.timeIntervalSince(model.recordStart)))
            let blink = Int(ctx.date.timeIntervalSince1970 * 2) % 2 == 0
            HStack(spacing: 8) {
                Circle().fill(Color(argb: blink ? 0xFFF0553D : 0x55F0553D)).frame(width: 7, height: 7)
                Text(String(format: "%02d:%02d", secs / 60, secs % 60)).font(UiType.mono(12)).foregroundStyle(.white)
                if !model.caps.encoderInfo.isEmpty {
                    Text(model.caps.encoderInfo).font(UiType.mono(10)).foregroundStyle(.white.opacity(0.6))
                }
            }
            .padding(.horizontal, 12).padding(.vertical, 6)
            .background(RoundedRectangle(cornerRadius: Corners.medium).fill(Color.glass))
        }
        .allowsHitTesting(false)
    }
}

/// Where the camera focuses and meters, with the exposure beside it: a sun on a short line that
/// moves as the picture is brightened or darkened. It fades a few seconds after the last touch.
private struct FocusRing: View {
    let pos: CGPoint
    let key: Int
    let ev: Float
    let evMin: Float
    let evMax: Float
    let active: Bool
    let rotation: Double
    let onDone: () -> Void

    @State var settle: CGFloat = 1.35
    @State var fade: Double = 1

    var body: some View {
        let box: CGFloat = 74
        let f = CGFloat(min(max((ev - evMin) / max(evMax - evMin, 0.01), 0), 1))
        ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: box * 0.78 / settle * 0.08)
                .stroke(Color.gold, lineWidth: 1.2)
                .frame(width: box * 0.78 / settle, height: box * 0.78 / settle)
                .frame(width: box, height: box)
            Canvas { ctx, size in
                let x = size.width / 2
                let sunY = size.height * (1 - f)
                let r: CGFloat = 5
                var line = Path()
                if sunY - r * 1.8 > 0 { line.move(to: CGPoint(x: x, y: 0)); line.addLine(to: CGPoint(x: x, y: sunY - r * 1.8)) }
                if sunY + r * 1.8 < size.height { line.move(to: CGPoint(x: x, y: sunY + r * 1.8)); line.addLine(to: CGPoint(x: x, y: size.height)) }
                ctx.stroke(line, with: .color(Color.gold.opacity(0.7)), lineWidth: 1)
                ctx.fill(Path(ellipseIn: CGRect(x: x - r * 0.62, y: sunY - r * 0.62, width: r * 1.24, height: r * 1.24)), with: .color(.gold))
                var rays = Path()
                for k in 0..<8 {
                    let a = Double(k) * .pi / 4
                    rays.move(to: CGPoint(x: x + cos(a) * r * 0.95, y: sunY + sin(a) * r * 0.95))
                    rays.addLine(to: CGPoint(x: x + cos(a) * r * 1.4, y: sunY + sin(a) * r * 1.4))
                }
                ctx.stroke(rays, with: .color(.gold), lineWidth: 1)
            }
            .frame(width: 22, height: box)
            .offset(x: box + 4)
            if active || ev != 0 {
                Text(String(format: "%+.1f", ev)).font(UiType.mono(11)).foregroundStyle(Color.gold)
                    .rotationEffect(.degrees(rotation))
                    .offset(x: box + 28, y: box / 2 - 8)
            }
        }
        .frame(width: box, height: box, alignment: .topLeading)
        .position(x: pos.x + 0, y: pos.y)
        .opacity(fade)
        .allowsHitTesting(false)
        .onAppear { withAnimation(.spring(response: 0.4, dampingFraction: 0.6)) { settle = 1 } }
        .onChange(of: pos) { _, _ in
            settle = 1.35
            withAnimation(.spring(response: 0.4, dampingFraction: 0.6)) { settle = 1 }
        }
        .task(id: "\(key) \(active)") {
            fade = 1
            if active { return }
            try? await Task.sleep(nanoseconds: 2_600_000_000)
            if Task.isCancelled { return }
            withAnimation(.easeOut(duration: 0.4)) { fade = 0 }
            try? await Task.sleep(nanoseconds: 420_000_000)
            if !Task.isCancelled { onDone() }
        }
    }
}

private struct ZoomPills: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        let stops = model.caps.zoomStops
        if stops.count >= 2 {
            let active = stops.filter { $0 <= model.zoom * 1.001 }.max() ?? stops[0]
            HStack(spacing: 2) {
                ForEach(stops, id: \.self) { z in
                    let sel = z == active
                    let shown = sel && abs(model.zoom - z) > 0.05 ? model.zoom : z
                    Button { model.setZoom(z) } label: {
                        Text(zoomLabel(shown, sel)).font(UiType.sans(sel ? 11 : 10, .semibold))
                            .foregroundStyle(sel ? Color.gold : .white)
                            .rotationEffect(.degrees(iconRotation(model.frameTurns)))
                            .frame(width: 34, height: 34)
                            .background(Circle().fill(Color.white.opacity(sel ? 0.18 : 0)))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(3)
            .background(RoundedRectangle(cornerRadius: Corners.small).fill(Color.glass))
            .animation(.easeOut(duration: 0.18), value: active)
        }
    }
}

// MARK: - Bottom

private struct DockBar: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.palette) var p

    var body: some View {
        HStack(spacing: 0) {
            ForEach([Dock.LOOKS, .ADJUST, .FRAME, .TEXT], id: \.self) { d in
                let sel = model.dock == d
                let glyph: Glyph = d == .LOOKS ? Ico.film : d == .ADJUST ? Ico.adjust : d == .FRAME ? Ico.frame : Ico.text
                Button {
                    guard (!model.recording || d == .TEXT) && !model.logActive else { return }
                    model.quick = nil
                    model.dock = sel ? .NONE : d
                } label: {
                    VStack(spacing: 4) {
                        IconView(glyph, size: 21, color: sel ? p.text : p.muted)
                        Text(d.label).font(UiType.sans(11)).foregroundStyle(sel ? p.text : p.muted)
                    }
                    .frame(width: 72).padding(.vertical, 7)
                    // The chosen dock sits in a hairline box on a slightly lifted ground.
                    .background(RoundedRectangle(cornerRadius: Corners.small).fill(sel ? p.surfaceHigh : .clear))
                    .overlay(RoundedRectangle(cornerRadius: Corners.small).stroke(sel ? p.text.opacity(0.55) : .clear, lineWidth: 1))
                    .contentShape(Rectangle())
                }
                .buttonStyle(GentlePress())
                .opacity(model.logActive ? 0.35 : 1)
                .frame(maxWidth: .infinity)
            }
        }
        .padding(.top, 4)
        .animation(.easeOut(duration: 0.2), value: model.dock)
    }
}

private struct ModeSwitch: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.palette) var p

    var body: some View {
        HStack(spacing: 0) {
            ForEach([CaptureMode.PHOTO, .VIDEO], id: \.self) { m in
                Button { model.setMode(m) } label: {
                    Text(m == .PHOTO ? "PHOTO" : "VIDEO").font(UiType.mono(11)).tracking(2.4)
                        .foregroundStyle(model.mode == m ? p.text : p.faint)
                        .padding(.horizontal, 14).padding(.vertical, 6)
                }
                .buttonStyle(.plain)
                .disabled(model.recording)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 2)
        .animation(.easeOut(duration: 0.2), value: model.mode)
    }
}

private struct EditLabel: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.palette) var p

    var body: some View {
        Text(((model.edit?.video ?? false) ? "IMPORTED CLIP" : "IMPORTED PHOTO") + "  ·  SHUTTER SAVES A COPY")
            .font(UiType.sans(10, .semibold)).tracking(1.6).foregroundStyle(p.muted)
            .padding(.horizontal, 14).padding(.vertical, 6)
            .frame(maxWidth: .infinity)
            .padding(.top, 2)
    }
}

private struct ShutterRow: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.palette) var p

    var body: some View {
        let rot = iconRotation(model.frameTurns)
        HStack {
            Button { model.openLast() } label: {
                ZStack {
                    if let t = model.thumbnail {
                        Image(uiImage: t).resizable().scaledToFill()
                    } else {
                        IconView(Ico.gallery, size: 18, color: p.muted)
                    }
                }
                .frame(width: 46, height: 46)
                .clipShape(RoundedRectangle(cornerRadius: Corners.medium))
                .background(RoundedRectangle(cornerRadius: Corners.medium).fill(p.surfaceHigh))
                .overlay(RoundedRectangle(cornerRadius: Corners.medium).stroke(p.line, lineWidth: 1))
                .rotationEffect(.degrees(rot))
            }
            .buttonStyle(GentlePress())
            .disabled(model.recording)
            Spacer()
            ShutterButton()
            Spacer()
            Button {
                if model.edit != nil { model.importMedia() } else { model.switchFacing() }
            } label: {
                IconView(model.edit != nil ? Ico.importIcon : Ico.flip, size: 21, color: p.text)
                    .rotationEffect(.degrees(rot))
                    .frame(width: 46, height: 46)
                    .background(RoundedRectangle(cornerRadius: Corners.small).fill(p.surfaceHigh))
                    .overlay(RoundedRectangle(cornerRadius: Corners.small).stroke(p.line, lineWidth: 1))
            }
            .buttonStyle(GentlePress())
            .disabled(model.recording)
        }
        .padding(.horizontal, 30).padding(.vertical, 8)
        .animation(.easeOut(duration: 0.26), value: model.frameTurns)
    }
}

private struct ShutterButton: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.palette) var p

    var body: some View {
        let video = model.mode == .VIDEO && model.edit == nil
        let stop = model.recording || model.seriesRunning
        let inner: CGFloat = stop ? 0.38 : 0.8
        let corner: CGFloat = stop ? 0.22 : 0.5
        Button { model.shutter() } label: {
            ZStack {
                Circle().stroke(p.text, lineWidth: 2).padding(1.5)
                RoundedRectangle(cornerRadius: 74 * inner * corner)
                    .fill(video ? p.danger : p.text)
                    .frame(width: 74 * inner, height: 74 * inner)
                if model.edit != nil { IconView(Ico.check, size: 28, color: p.bg) }
            }
            .frame(width: 74, height: 74)
            .contentShape(Circle())
        }
        .buttonStyle(GentlePress())
        .disabled(model.savingVideo || model.progress >= 0)
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: stop)
    }
}

/// While a clip is being developed or trimmed: progress over everything, nothing to tap.
private struct ProgressVeil: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.palette) var p

    var body: some View {
        ZStack {
            Color.black.opacity(0.35).ignoresSafeArea().contentShape(Rectangle()).onTapGesture {}
            VStack(spacing: 12) {
                Text("\(model.progressLabel)  \(Int((model.progress * 100).rounded()))%").font(UiType.sans(14)).foregroundStyle(p.text)
                GeometryReader { g in
                    ZStack(alignment: .leading) {
                        Rectangle().fill(p.surfaceHigh)
                        Rectangle().fill(p.accent).frame(width: g.size.width * CGFloat(min(max(model.progress, 0), 1)))
                    }
                }
                .frame(height: 3)
                .clipShape(RoundedRectangle(cornerRadius: Corners.small))
            }
            .padding(18)
            .frame(width: 220)
            .background(RoundedRectangle(cornerRadius: Corners.small).fill(p.surface))
            .overlay(RoundedRectangle(cornerRadius: Corners.small).stroke(p.line, lineWidth: 1))
        }
    }
}

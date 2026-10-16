import SwiftUI

private let accent = Color(red: 1.0, green: 0.62, blue: 0.22)
private let panel = Color(white: 0.09).opacity(0.94)

struct Viewfinder: UIViewRepresentable {
    let engine: CameraEngine

    func makeUIView(context: Context) -> GLDisplayView {
        let v = GLDisplayView(frame: .zero)
        engine.attach(v)
        return v
    }

    func updateUIView(_ uiView: GLDisplayView, context: Context) {}
}

struct CameraView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.scenePhase) private var phase
    @State private var focusPoint: CGPoint?

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .top) {
                Color.black.ignoresSafeArea()
                VStack(spacing: 0) {
                    topBar
                    viewfinder(width: geo.size.width)
                    Spacer(minLength: 0)
                }
                VStack(spacing: 0) {
                    Spacer()
                    if model.tray != .none { trayView.transition(.move(edge: .bottom).combined(with: .opacity)) }
                    controls
                }
            }
        }
        .preferredColorScheme(.dark)
        .statusBarHidden(true)
        .onAppear { model.appear() }
        .onChange(of: phase) { _, p in model.scenePhase(p) }
        .sheet(isPresented: $model.showSettings) { SettingsView().environmentObject(model) }
        .alert(model.message ?? "", isPresented: Binding(get: { model.message != nil }, set: { if !$0 { model.message = nil } })) {
            Button("OK", role: .cancel) {}
        }
        .animation(.easeOut(duration: 0.2), value: model.tray)
    }

    // MARK: Top

    private var topBar: some View {
        HStack {
            iconButton("gearshape") { model.showSettings = true }
            Spacer()
            if model.recording {
                TimelineView(.periodic(from: .now, by: 1)) { ctx in
                    let s = Int(ctx.date.timeIntervalSince(model.recordingSince))
                    HStack(spacing: 6) {
                        Circle().fill(.red).frame(width: 8, height: 8)
                        Text(String(format: "%02d:%02d", s / 60, s % 60)).font(.system(.callout, design: .monospaced))
                    }
                    .padding(.horizontal, 10).padding(.vertical, 4)
                    .background(Capsule().fill(.black.opacity(0.5)))
                }
            } else {
                Text(model.camera.name.uppercased())
                    .font(.system(size: 13, weight: .semibold)).tracking(2)
                    .foregroundStyle(accent)
            }
            Spacer()
            iconButton("arrow.triangle.2.circlepath.camera") { model.flip() }
        }
        .padding(.horizontal, 16)
        .frame(height: 48)
    }

    private func iconButton(_ name: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: name).font(.system(size: 19, weight: .regular)).foregroundStyle(.white)
                .frame(width: 40, height: 40)
        }
    }

    // MARK: Viewfinder

    private func viewfinder(width: CGFloat) -> some View {
        let h = width / model.aspect
        return ZStack(alignment: .bottom) {
            Viewfinder(engine: model.engine)
            Color.white.opacity(model.flashShutter ? 0.6 : 0).allowsHitTesting(false)
            if let p = focusPoint {
                RoundedRectangle(cornerRadius: 4).stroke(accent, lineWidth: 1.5)
                    .frame(width: 70, height: 70).position(p).allowsHitTesting(false)
            }
            if model.zoomStops.count > 1 && model.tray == .none { zoomPills.padding(.bottom, 14) }
        }
        .frame(width: width, height: h)
        .clipped()
        .contentShape(Rectangle())
        .gesture(SpatialTapGesture().onEnded { e in
            // A tap closes an open panel; otherwise it focuses.
            if model.tray != .none { model.tray = .none; return }
            focusPoint = e.location
            model.focus(CGPoint(x: e.location.x / width, y: e.location.y / h))
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { focusPoint = nil }
        })
    }

    private var zoomPills: some View {
        HStack(spacing: 6) {
            ForEach(model.zoomStops, id: \.self) { stop in
                let on = abs(model.zoom - stop.factor) < 0.01
                Button { model.setZoom(stop) } label: {
                    Text(on ? stop.label + "×" : stop.label)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(on ? accent : .white)
                        .frame(width: on ? 40 : 32, height: on ? 40 : 32)
                        .background(Circle().fill(.black.opacity(0.45)))
                }
            }
        }
        .padding(5)
        .background(Capsule().fill(.black.opacity(0.25)))
    }

    // MARK: Bottom

    private var controls: some View {
        VStack(spacing: 14) {
            HStack(spacing: 0) {
                dockButton("Styles", "camera.filters", .styles)
                dockButton("Looks", "film.stack", .looks)
                dockButton("Adjust", "slider.horizontal.3", .adjust)
            }
            HStack(spacing: 22) {
                modeLabel("PHOTO", !model.videoMode) { model.setVideoMode(false) }
                modeLabel("VIDEO", model.videoMode) { model.setVideoMode(true) }
            }
            HStack {
                Button { model.openPhotos() } label: {
                    Group {
                        if let t = model.thumbnail { Image(uiImage: t).resizable().scaledToFill() } else { Color(white: 0.18) }
                    }
                    .frame(width: 48, height: 48)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(.white.opacity(0.3), lineWidth: 1))
                }
                Spacer()
                shutterButton
                Spacer()
                lookBadge
            }
            .padding(.horizontal, 28)
        }
        .padding(.top, 12)
        .padding(.bottom, 8)
        .background(LinearGradient(colors: [.black.opacity(0), .black.opacity(0.85), .black], startPoint: .top, endPoint: .center).ignoresSafeArea())
    }

    private func dockButton(_ title: String, _ symbol: String, _ tray: Tray) -> some View {
        let on = model.tray == tray
        return Button { model.tray = on ? .none : tray } label: {
            VStack(spacing: 3) {
                Image(systemName: symbol).font(.system(size: 18))
                Text(title).font(.system(size: 10, weight: .medium))
            }
            .foregroundStyle(on ? accent : .white.opacity(0.85))
            .frame(maxWidth: .infinity)
        }
    }

    private func modeLabel(_ text: String, _ on: Bool, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(text).font(.system(size: 12, weight: .semibold)).tracking(1.5)
                .foregroundStyle(on ? accent : .white.opacity(0.6))
        }
        .disabled(model.recording)
    }

    private var shutterButton: some View {
        Button { model.shutter() } label: {
            ZStack {
                Circle().stroke(.white, lineWidth: 4).frame(width: 74, height: 74)
                if model.videoMode {
                    RoundedRectangle(cornerRadius: model.recording ? 6 : 30)
                        .fill(Color.red)
                        .frame(width: model.recording ? 28 : 60, height: model.recording ? 28 : 60)
                } else {
                    Circle().fill(.white).frame(width: 62, height: 62)
                }
            }
            .animation(.easeOut(duration: 0.15), value: model.recording)
        }
    }

    private var lookBadge: some View {
        Button { model.tray = model.tray == .looks ? .none : .looks } label: {
            Group {
                if let img = Tiles.image("looks", model.camera.id) {
                    Image(uiImage: img).resizable().scaledToFill()
                } else {
                    Color(white: 0.25).overlay(Image(systemName: "camera").foregroundStyle(.white))
                }
            }
            .frame(width: 48, height: 48)
            .clipShape(Circle())
            .overlay(Circle().stroke(accent, lineWidth: 1.5))
        }
    }

    // MARK: Trays

    @ViewBuilder private var trayView: some View {
        VStack(spacing: 10) {
            switch model.tray {
            case .looks: LooksTray()
            case .styles: StylesTray()
            case .adjust: AdjustTray()
            case .none: EmptyView()
            }
        }
        .padding(.vertical, 12)
        .background(RoundedRectangle(cornerRadius: 18).fill(panel))
        .padding(.horizontal, 8)
        .contentShape(Rectangle())
        .onTapGesture {}   // taps inside a panel don't close it
    }
}

// MARK: - Looks

struct LooksTray: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        VStack(spacing: 10) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(model.categories, id: \.id) { c in
                        Chip(text: c.label, on: model.category == c.id) { model.category = c.id }
                    }
                }
                .padding(.horizontal, 12)
            }
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(spacing: 10) {
                        ForEach(model.visibleCameras) { cam in
                            LookTile(cam: cam, on: cam.id == model.camera.id).id(cam.id)
                                .onTapGesture { model.select(cam) }
                        }
                    }
                    .padding(.horizontal, 12)
                }
                .frame(height: 112)
                .onAppear { proxy.scrollTo(model.camera.id, anchor: .center) }
            }
        }
    }
}

struct LookTile: View {
    let cam: FilmCamera
    let on: Bool

    var body: some View {
        VStack(spacing: 4) {
            Group {
                if let img = Tiles.image("looks", cam.id) {
                    Image(uiImage: img).resizable().scaledToFill()
                } else {
                    LinearGradient(colors: [Color(white: 0.35), Color(white: 0.15)], startPoint: .top, endPoint: .bottom)
                        .overlay(Image(systemName: "camera").font(.system(size: 22)).foregroundStyle(.white.opacity(0.8)))
                }
            }
            .frame(width: 72, height: 82)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(on ? accent : .clear, lineWidth: 2))
            Text(cam.name).font(.system(size: 10, weight: on ? .bold : .regular))
                .foregroundStyle(on ? accent : .white.opacity(0.85)).lineLimit(1).frame(width: 76)
        }
    }
}

struct Chip: View {
    let text: String
    let on: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(text).font(.system(size: 12, weight: .medium))
                .foregroundStyle(on ? .black : .white.opacity(0.85))
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(Capsule().fill(on ? accent : Color.white.opacity(0.1)))
        }
    }
}

// MARK: - Styles

struct StylesTray: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(spacing: 8) {
                StylePad(tone: model.look.style.tone, color: model.look.style.color) { t, c in model.setStylePad(tone: t, color: c) }
                    .frame(width: 112, height: 112)
                    .opacity(model.look.style.style == "STANDARD" ? 0.4 : 1)
                    .disabled(model.look.style.style == "STANDARD")
                HStack(spacing: 4) {
                    Image(systemName: "paintpalette").font(.system(size: 11))
                    Slider(value: Binding(get: { Double(model.look.style.palette) }, set: { model.setPalette(Float($0)) }), in: 0...1)
                        .tint(accent)
                }
                .frame(width: 112)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 8) {
                    ForEach(model.spec.styles) { s in
                        let on = model.look.style.style == s.id
                        VStack(spacing: 4) {
                            Group {
                                if let img = Tiles.image("styles", s.id.lowercased()) {
                                    Image(uiImage: img).resizable().scaledToFill()
                                } else {
                                    Color(uiColor: s.swatch.argbColor)
                                }
                            }
                            .frame(width: 60, height: 80)
                            .clipShape(RoundedRectangle(cornerRadius: 9))
                            .overlay(RoundedRectangle(cornerRadius: 9).stroke(on ? accent : .clear, lineWidth: 2))
                            Text(s.label).font(.system(size: 10, weight: on ? .bold : .regular))
                                .foregroundStyle(on ? accent : .white.opacity(0.85)).lineLimit(1)
                        }
                        .onTapGesture { model.setStyle(s.id) }
                    }
                }
            }
            .frame(height: 112)
        }
        .padding(.horizontal, 12)
    }
}

/// Tone (up: brighter, airier) by colour (right: richer) — the iPhone's own style pad.
struct StylePad: View {
    let tone: Float
    let color: Float
    let onChange: (Float, Float) -> Void

    var body: some View {
        GeometryReader { g in
            let w = g.size.width, h = g.size.height
            ZStack {
                RoundedRectangle(cornerRadius: 12)
                    .fill(LinearGradient(colors: [Color(white: 0.32), Color(white: 0.12)], startPoint: .top, endPoint: .bottom))
                Path { p in
                    for i in 1..<4 {
                        let x = w * CGFloat(i) / 4, y = h * CGFloat(i) / 4
                        p.move(to: CGPoint(x: x, y: 0)); p.addLine(to: CGPoint(x: x, y: h))
                        p.move(to: CGPoint(x: 0, y: y)); p.addLine(to: CGPoint(x: w, y: y))
                    }
                }
                .stroke(.white.opacity(0.08))
                Circle().fill(accent).frame(width: 16, height: 16)
                    .position(x: CGFloat(color + 1) / 2 * w, y: CGFloat(1 - tone) / 2 * h)
            }
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0).onChanged { v in
                let c = Float(min(max(v.location.x / w, 0), 1)) * 2 - 1
                let t = 1 - Float(min(max(v.location.y / h, 0), 1)) * 2
                onChange(t, c)
            })
            .onTapGesture(count: 2) { onChange(0, 0) }
        }
    }
}

// MARK: - Adjust

struct AdjustTray: View {
    @EnvironmentObject var model: AppModel

    private var tools: [Tool] { Tool.all.filter { $0.group == model.toolGroup } }
    private var tool: Tool { Tool.all.first { $0.id == model.toolId } ?? Tool.all[0] }

    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 8) {
                ForEach(ToolGroup.allCases, id: \.self) { g in
                    Chip(text: g.rawValue, on: model.toolGroup == g) {
                        model.toolGroup = g
                        if let first = Tool.all.first(where: { $0.group == g }) { model.toolId = first.id }
                    }
                }
                Spacer()
                if model.adjusted {
                    Button("Reset") { model.resetAll() }.font(.system(size: 12, weight: .semibold)).foregroundStyle(accent)
                }
            }
            .padding(.horizontal, 12)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 14) {
                    ForEach(tools) { t in
                        let on = t.id == model.toolId
                        let v = model.value(t)
                        let changed = abs(v - model.camera.look[keyPath: t.key]) > 0.005
                        Button { model.toolId = t.id } label: {
                            VStack(spacing: 4) {
                                ZStack {
                                    Circle().stroke(on ? accent : .white.opacity(0.25), lineWidth: 1.5).frame(width: 40, height: 40)
                                    Image(systemName: t.symbol).font(.system(size: 15))
                                }
                                Text(changed ? t.format(v) : t.label).font(.system(size: 10, weight: on ? .bold : .regular)).lineLimit(1)
                            }
                            .foregroundStyle(on ? accent : (changed ? .white : .white.opacity(0.75)))
                            .frame(width: 58)
                        }
                    }
                }
                .padding(.horizontal, 12)
            }
            HStack(spacing: 10) {
                Text(tool.label).font(.system(size: 12, weight: .semibold)).frame(width: 74, alignment: .leading)
                Slider(value: Binding(get: { Double(model.value(tool)) }, set: { model.set(tool, Float($0)) }),
                       in: Double(tool.min)...Double(tool.max))
                    .tint(accent)
                Text(tool.format(model.value(tool))).font(.system(size: 12, design: .monospaced)).frame(width: 40, alignment: .trailing)
                    .onTapGesture(count: 2) { model.reset(tool) }
            }
            .padding(.horizontal, 16)
        }
    }
}

// MARK: - Settings

struct SettingsView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Toggle("Shutter & record sound", isOn: $model.shutterSound).tint(accent)
                } footer: {
                    Text("In some regions iOS always plays the camera shutter sound.")
                }
                Section("About") {
                    LabeledContent("Looks", value: "\(model.spec.cameras.count)")
                    LabeledContent("Film stocks", value: "\(model.spec.stocks.count)")
                    Text("Film looks are developed on the GPU with the same shaders and 3D LUTs as FilmCam for Android.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}

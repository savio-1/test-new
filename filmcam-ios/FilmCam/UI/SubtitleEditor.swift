import SwiftUI

// The subtitle editor (SubtitleEditor.kt on Android). The panels of each tool are in
// SubtitleSheets.swift, the clip and its captions in SubtitleVideo.swift.

/// After a clip is shot: its speech as subtitles, in English, Telugu or both. Make them with
/// Gemini (or keep the ones heard live), fix any line by typing, set exactly when each shows,
/// style and place them, check them full screen, then burn them into a copy of the clip or
/// save an .srt.
///
/// Laid out for a phone: the clip takes all the room there is, a slim play bar sits under it,
/// and the tools run along the bottom. A tool opens one short panel; tapping it again closes
/// the panel and the clip grows back.
struct SubtitleScreen: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if let s = model.subtitles {
                SubEditor(s: s, showKey: model.geminiKey.isEmpty && s.track == nil)
                    .id(ObjectIdentifier(s))
            }
        }
        .environment(\.palette, .darkPalette)
    }
}

/// The editor for one clip; owns the player (shared with full screen).
struct SubEditor: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject var s: SubtitleSession
    @StateObject var player: SubPlayer
    @State var showKey: Bool
    @State var full = false

    init(s: SubtitleSession, showKey: Bool) {
        _s = ObservedObject(wrappedValue: s)
        _player = StateObject(wrappedValue: SubPlayer(url: s.url))
        _showKey = State(initialValue: showKey)
    }

    var body: some View {
        ZStack {
            if full {
                SubFullScreen(s: s, player: player) { full = false }
                    .transition(.opacity)
            } else {
                editor.transition(.opacity)
            }
            if model.progress >= 0 {
                Text("\(model.progressLabel)  \(Int((model.progress * 100).rounded()))%")
                    .font(UiType.sans(14)).foregroundStyle(.white)
                    .padding(.horizontal, 18).padding(.vertical, 12)
                    .background(RoundedRectangle(cornerRadius: Corners.medium).fill(Color(argb: 0xCC000000)))
            }
        }
        .animation(.easeOut(duration: 0.2), value: full)
        .onDisappear { player.close() }
        .sheet(isPresented: Binding(get: { model.subtitleShare != nil }, set: { if !$0 { model.subtitleShare = nil } })) {
            if let url = model.subtitleShare { SubShareSheet(url: url).presentationDetents([.medium, .large]) }
        }
    }

    /// The open tool. Switching template swaps Position for Words (and back).
    private func openTool(_ tools: [SubTool]) -> SubTool? {
        guard let t = s.tool else { return nil }
        if tools.contains(t) { return t }
        if t == .PLACE || t == .WORDS { return tools.first { $0 == .PLACE || $0 == .WORDS } }
        return nil
    }

    private var editor: some View {
        GeometryReader { geo in
            let tools = SubTool.toolsFor(s.track)
            let tool = openTool(tools)
            VStack(spacing: 0) {
                SubTopBar(s: s, showKey: $showKey, full: $full)
                if showKey { SubKeyPanel(key: model.geminiKey, modelName: model.geminiModel) { showKey = false } }
                clip(tool)
                SubTransport(player: player, durationMs: s.durationMs)
                if s.aligning {
                    Text("Timing each word to the voice…").font(UiType.sans(11)).foregroundStyle(SubInk.muted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.leading, 16).padding(.bottom, 4)
                }
                bottom(tools, tool, geo.size.height)
            }
            .animation(.easeOut(duration: 0.22), value: tool)
            .animation(.easeOut(duration: 0.2), value: showKey)
        }
    }

    /// The clip, as big as the screen allows, with the subtitles drawn exactly as they will be burnt in.
    private func clip(_ tool: SubTool?) -> some View {
        GeometryReader { g in
            let box = subFit(g.size, s.aspect)
            SubVideo(s: s, player: player, movable: tool == .PLACE,
                     words: tool == .WORDS ? WordPick(selected: s.selectedWord) { s.selectedWord = $0 } : nil) { t in
                model.updateSubtitles(t)
            }
            .frame(width: box.width, height: box.height)
            .clipShape(RoundedRectangle(cornerRadius: Corners.medium))
            .position(x: g.size.width / 2, y: g.size.height / 2)
        }
        .padding(.horizontal, 10)
        .frame(maxHeight: .infinity)
    }

    @ViewBuilder
    private func bottom(_ tools: [SubTool], _ tool: SubTool?, _ screenH: CGFloat) -> some View {
        if s.status != nil {
            SubWorking(s: s)
        } else if s.track == nil {
            SubStart(s: s)
        } else if let track = s.track {
            if let e = s.error {
                Text(e).font(UiType.sans(12)).foregroundStyle(SubInk.error)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 16)
            }
            if let tool {
                SubSheet(tool: tool, s: s, track: track, player: player) { full = true }
                    .frame(maxHeight: tool == .LINES ? screenH * 0.42 : screenH * 0.34)
                    .padding(.top, 4)
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
            SubToolRail(tools: tools, open: tool) { t in
                subHideKeyboard()
                s.tool = t == tool ? nil : t
                if t != .WORDS { s.selectedWord = nil }
            }
        }
    }
}

/// Back, the title, full screen, the Gemini key and Burn in.
struct SubTopBar: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject var s: SubtitleSession
    @Binding var showKey: Bool
    @Binding var full: Bool

    var body: some View {
        HStack(spacing: 0) {
            SubIcon(glyph: Ico.back) { model.closeSubtitles() }
            Text("Subtitles").font(UiType.sans(16, .semibold)).foregroundStyle(.white).padding(.leading, 6)
            Spacer()
            SubIcon(glyph: Ico.fullscreen) { full = true }
            SubIcon(glyph: Ico.key) { showKey.toggle() }
            if let track = s.track {
                SubPrimary("Burn in", enabled: model.progress < 0 && !track.cues.isEmpty, compact: true) { model.burnSubtitles() }
                    .padding(.leading, 4)
            }
        }
        .padding(.horizontal, 8)
        .frame(height: 52)
    }
}

/// Play / pause, where the clip is, and a scrubber.
struct SubTransport: View {
    @ObservedObject var player: SubPlayer
    let durationMs: Int64

    var body: some View {
        HStack(spacing: 0) {
            SubPlayButton(player: player)
            SubScrubber(player: player, durationMs: durationMs)
        }
        .padding(.horizontal, 8)
        .frame(height: 40)
    }
}

/// The tools, each an icon over its name; the open one is lit.
struct SubToolRail: View {
    let tools: [SubTool]
    let open: SubTool?
    let pick: (SubTool) -> Void

    static func icon(_ t: SubTool) -> Glyph {
        switch t {
        case .LINES: return Ico.subtitles
        case .STYLE: return Ico.styles
        case .TEXT: return Ico.fonts
        case .EFFECTS: return Ico.shadow
        case .MOTION: return Ico.motion
        case .WORDS: return Ico.text
        case .PLACE: return Ico.frame
        case .SOUND: return Ico.mic
        case .MORE: return Ico.more
        }
    }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 2) {
                ForEach(tools, id: \.self) { t in
                    let on = t == open
                    Button { pick(t) } label: {
                        VStack(spacing: 3) {
                            IconView(Self.icon(t), size: 21, color: on ? .white : SubInk.muted)
                            Text(t.label).font(UiType.sans(10)).lineLimit(1).foregroundStyle(on ? .white : SubInk.muted)
                        }
                        .frame(width: 58)
                        .padding(.vertical, 7)
                        .background(RoundedRectangle(cornerRadius: Corners.medium).fill(on ? Color.white.opacity(0.1) : .clear))
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(GentlePress())
                    .animation(.easeOut(duration: 0.16), value: on)
                }
            }
            .padding(6)
        }
        .frame(maxWidth: .infinity)
        .background(SubInk.panel.ignoresSafeArea(edges: .bottom))
    }
}

/// The person's Gemini API key (free from Google AI Studio) and the model to use.
struct SubKeyPanel: View {
    @EnvironmentObject var model: AppModel
    @State var key: String
    @State var modelName: String
    let done: () -> Void

    init(key: String, modelName: String, done: @escaping () -> Void) {
        _key = State(initialValue: key)
        _modelName = State(initialValue: modelName)
        self.done = done
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Gemini API key").font(UiType.sans(13, .semibold)).foregroundStyle(.white)
            Text("Free from aistudio.google.com/apikey. The clip's sound is sent to Google to be transcribed; nothing else leaves the phone.")
                .font(UiType.sans(11)).foregroundStyle(SubInk.muted).fixedSize(horizontal: false, vertical: true)
                .padding(.top, 3).padding(.bottom, 8)
            SubField(value: key, hint: "Paste your key") { key = $0 }
            Text("Model").font(UiType.sans(11)).foregroundStyle(SubInk.muted).padding(.top, 8)
            HStack(spacing: 8) {
                SubChip("Best (3.8 Flash)", on: modelName == GeminiTranscriber.DEFAULT_MODEL) { modelName = GeminiTranscriber.DEFAULT_MODEL }
                SubChip("Fast (3.5 Flash-Lite)", on: modelName == GeminiTranscriber.FAST_MODEL) { modelName = GeminiTranscriber.FAST_MODEL }
            }
            .padding(.vertical, 6)
            SubField(value: modelName, hint: GeminiTranscriber.DEFAULT_MODEL) { modelName = $0 }
            HStack {
                Spacer()
                SubPrimary("Save") {
                    model.setGemini(key: key, model: modelName)
                    done()
                }
            }
            .padding(.top, 10)
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: Corners.medium).fill(SubInk.panel))
        .padding(12)
        .transition(.opacity.combined(with: .move(edge: .top)))
    }
}

/// Transcribing: how long it has taken, lines so far, and Cancel.
struct SubWorking: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject var s: SubtitleSession

    var body: some View {
        VStack(spacing: 0) {
            ProgressView().progressViewStyle(.circular).tint(SubInk.accent).controlSize(.large)
                .frame(width: 34, height: 34)
            TimelineView(.periodic(from: .now, by: 0.5)) { ctx in
                let secs = max(0, Int(ctx.date.timeIntervalSince(s.startedAt)))
                Text("\(s.status ?? "")…  \(secs)s").font(UiType.sans(14)).foregroundStyle(.white)
            }
            .padding(.top, 14)
            Text(s.linesSoFar > 0 ? "\(s.linesSoFar) lines so far" : "A minute of speech usually takes 10–40 seconds")
                .font(UiType.sans(11)).foregroundStyle(SubInk.muted).padding(.top, 4)
            SubSecondary("Cancel") { model.cancelSubtitles() }.padding(.top, 14)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 32).padding(.bottom, 16)
    }
}

/// No subtitles yet: make them with Gemini, or start a line by hand.
struct SubStart: View {
    @EnvironmentObject var model: AppModel
    @ObservedObject var s: SubtitleSession

    var body: some View {
        VStack(spacing: 0) {
            Text("Subtitles from what's said").font(UiType.sans(17, .semibold)).foregroundStyle(.white)
            Text("Speech in Telugu or English is written out in both languages. Check every line and fix anything before you save.")
                .font(UiType.sans(12)).foregroundStyle(SubInk.muted).multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 6).padding(.bottom, 18)
            SubPrimary("Generate subtitles", enabled: !model.geminiKey.isEmpty) { model.generateSubtitles() }
            if let e = s.error {
                Text(e).font(UiType.sans(12)).foregroundStyle(SubInk.error).multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true).padding(.top, 12)
            }
            SubLink("Or write them yourself") {
                model.updateSubtitles(SubtitleTrack([Cue(0, min(3000, max(s.durationMs, 1000)))]))
            }
            .padding(.top, 14)
        }
        .frame(maxWidth: .infinity)
        .padding(24)
    }
}

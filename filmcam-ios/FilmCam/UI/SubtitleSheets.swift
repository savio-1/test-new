import SwiftUI

// The subtitle editor's tool panels (SubSheet and the panels under it in SubtitleEditor.kt on
// Android): lines and their times, templates, text, effects or background, motion, single
// words, position, sound and the rest.

extension SubtitleTrack {
    /// The track with its style changed by [f].
    func withStyle(_ f: (inout SubtitleStyle) -> Void) -> SubtitleTrack {
        var t = self
        f(&t.style)
        return t
    }
}

/// The panel of the open tool.
struct SubSheet: View {
    @EnvironmentObject var model: AppModel
    let tool: SubTool
    @ObservedObject var s: SubtitleSession
    let track: SubtitleTrack
    let player: SubPlayer
    let preview: () -> Void

    var body: some View {
        let set: (SubtitleTrack) -> Void = { model.updateSubtitles($0) }
        switch tool {
        case .LINES:
            SubLines(player: player, track: track, durationMs: s.durationMs, set: set)
        case .STYLE:
            SubSheetColumn {
                SubTemplates(selected: track.style.template) { tpl in set(track.withStyle { $0.template = tpl }) }
                SubLanguageRow(track: track, set: set)
            }
        case .TEXT:
            SubSheetColumn { SubTextSheet(track: track, set: set) }
        case .EFFECTS:
            SubSheetColumn {
                if track.style.kinetic { SubEffectsSheet(track: track, set: set) } else { SubBackgroundSheet(track: track, set: set) }
            }
        case .MOTION:
            SubSheetColumn { SubMotionSheet(track: track, set: set) }
        case .WORDS:
            SubWordsPanel(s: s, player: player, track: track, set: set)
        case .PLACE:
            SubPlacePanel(track: track, set: set)
        case .SOUND:
            SubSheetColumn { SubSoundSheet(track: track, set: set) }
        case .MORE:
            SubSheetColumn { SubMoreSheet(track: track, preview: preview, set: set) }
        }
    }
}

/// A panel's body: scrolls when it is taller than the room it has.
struct SubSheetColumn<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        ViewThatFits(in: .vertical) {
            column
            ScrollView(showsIndicators: false) { column }
        }
    }

    private var column: some View {
        VStack(alignment: .leading, spacing: 10) { content() }
            .padding(.horizontal, 14).padding(.vertical, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Lines

/// A line of the list, keyed by its place and start (as on Android).
struct SubCueItem: Identifiable {
    let id: String
    let index: Int
    let cue: Cue
}

/// Every line, in order of time: its words, and exactly when it starts and ends.
struct SubLines: View {
    @ObservedObject var player: SubPlayer
    let track: SubtitleTrack
    let durationMs: Int64
    let set: (SubtitleTrack) -> Void

    private func setCue(_ i: Int, _ c: Cue) {
        var cues = track.cues
        cues[i] = c
        // Kept in order of time (a stable sort, as Kotlin's sortedBy).
        cues = cues.enumerated().sorted { a, b in
            a.element.startMs != b.element.startMs ? a.element.startMs < b.element.startMs : a.offset < b.offset
        }.map(\.element)
        var t = track
        t.cues = cues
        set(t)
    }

    var body: some View {
        let now = player.positionMs
        let current = track.cues.firstIndex { now >= $0.startMs && now < $0.endMs }
        let items = track.cues.enumerated().map { SubCueItem(id: "\($0.offset)-\($0.element.startMs)", index: $0.offset, cue: $0.element) }
        ScrollView(showsIndicators: false) {
            LazyVStack(spacing: 8) {
                ForEach(items) { item in row(item, active: item.index == current, now: now) }
                addLine(now)
            }
            .padding(.horizontal, 12).padding(.vertical, 6)
        }
    }

    private func row(_ item: SubCueItem, active: Bool, now: Int64) -> some View {
        let i = item.index, c = item.cue
        let dur = durationMs > 0 ? durationMs : Int64.max
        return SubCueRow(
            cue: c, active: active, style: track.style, now: now,
            seek: { player.seek($0) },
            onChange: { setCue(i, $0) },
            setStart: { ms in var k = c; k.startMs = min(max(ms, 0), c.endMs - 200); setCue(i, k) },
            setEnd: { ms in var k = c; k.endMs = min(max(ms, c.startMs + 200), dur); setCue(i, k) },
            delete: {
                var t = track
                t.cues.remove(at: i)
                set(t)
            })
    }

    private func addLine(_ now: Int64) -> some View {
        HStack {
            SubLink("+ Add a line at \(subStamp(now))", padding: 10) {
                let start = now
                let next = track.cues.first { $0.startMs > start }?.startMs ?? durationMs
                let cue = Cue(start, min(start + 2500, max(next, start + 500)))
                var t = track
                t.cues = (t.cues + [cue]).enumerated().sorted { a, b in
                    a.element.startMs != b.element.startMs ? a.element.startMs < b.element.startMs : a.offset < b.offset
                }.map(\.element)
                set(t)
            }
            Spacer()
        }
    }
}

struct SubCueRow: View {
    let cue: Cue
    let active: Bool
    let style: SubtitleStyle
    let now: Int64
    let seek: (Int64) -> Void
    let onChange: (Cue) -> Void
    let setStart: (Int64) -> Void
    let setEnd: (Int64) -> Void
    let delete: () -> Void

    var body: some View {
        let c = cue
        VStack(spacing: 4) {
            HStack(spacing: 6) {
                SubTime(label: "Start", ms: c.startMs, seek: { seek(c.startMs) },
                        nudge: { setStart(c.startMs + $0) }, toNow: { setStart(now) })
                SubTime(label: "End", ms: c.endMs, seek: { seek(max(c.endMs - 300, c.startMs)) },
                        nudge: { setEnd(c.endMs + $0) }, toNow: { setEnd(now) })
                Button(action: delete) {
                    IconView(Ico.trash, size: 16, color: SubInk.muted).frame(width: 30, height: 30).contentShape(Circle())
                }
                .buttonStyle(GentlePress())
            }
            if style.language != .ENGLISH {
                SubField(value: c.telugu, hint: "తెలుగు", font: subFont(style.teluguFont, 16), size: 16, multiline: true) { v in
                    var k = c; k.telugu = v; onChange(k)
                }
            }
            if style.language != .TELUGU {
                SubField(value: c.english, hint: "English", font: subFont(style.latinFont, 15), size: 15, multiline: true) { v in
                    var k = c; k.english = v; onChange(k)
                }
            }
        }
        .padding(.horizontal, 10).padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: Corners.medium).fill(active ? Color(argb: 0xFF1E1E20) : SubInk.panel))
        .overlay(RoundedRectangle(cornerRadius: Corners.medium).stroke(active ? SubInk.accent.opacity(0.7) : .clear, lineWidth: 1))
    }
}

/// One end of a line: its time (tap to jump there), − / + a tenth of a second (hold to run), Now.
struct SubTime: View {
    let label: String
    let ms: Int64
    let seek: () -> Void
    let nudge: (Int64) -> Void
    let toNow: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(UiType.sans(10)).foregroundStyle(SubInk.muted).padding(.leading, 4)
            HStack(spacing: 0) {
                SubRepeat(text: "−") { nudge(-100) }
                Button(action: seek) {
                    Text(subStamp(ms)).font(UiType.mono(13)).foregroundStyle(.white).lineLimit(1).minimumScaleFactor(0.8)
                        .padding(.horizontal, 3).padding(.vertical, 4)
                }
                .buttonStyle(GentlePress())
                SubRepeat(text: "+") { nudge(100) }
                SubLink("Now", size: 11, padding: 5, action: toNow)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Position

/// Where the subtitles sit: nine quick spots (top, middle, bottom by left, centre, right), or
/// drag them on the video. They stay inside the frame either way.
struct SubPlacePanel: View {
    let track: SubtitleTrack
    let set: (SubtitleTrack) -> Void

    static let cols: [(Float, TextAlign)] = [(0.05, .LEFT), (0.5, .CENTER), (0.95, .RIGHT)]
    static let rows: [Float] = [0.1, 0.5, 0.86]

    var body: some View {
        let style = track.style
        ScrollView(showsIndicators: false) {
            VStack(spacing: 0) {
                Text("Drag the subtitles on the video to put them anywhere, or pick a spot.")
                    .font(UiType.sans(12)).foregroundStyle(SubInk.muted).multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true).padding(.bottom, 10)
                pad(style)
                Text("Line up").font(UiType.sans(11)).foregroundStyle(SubInk.muted).padding(.top, 10)
                HStack(spacing: 8) {
                    alignChip(Ico.alignLeft, .LEFT, style)
                    alignChip(Ico.alignCenter, .CENTER, style)
                    alignChip(Ico.alignRight, .RIGHT, style)
                }
                .padding(.top, 6).padding(.bottom, 10)
            }
            .padding(.horizontal, 12).padding(.vertical, 4)
            .frame(maxWidth: .infinity)
        }
    }

    private func pad(_ style: SubtitleStyle) -> some View {
        VStack(spacing: 6) {
            ForEach(Self.rows, id: \.self) { y in
                HStack(spacing: 6) {
                    ForEach(0..<3, id: \.self) { k in spot(Self.cols[k].0, Self.cols[k].1, y, style) }
                }
            }
        }
        .padding(6)
        .frame(width: 220, height: 176)
        .background(RoundedRectangle(cornerRadius: Corners.medium).fill(SubInk.panel))
        .overlay(RoundedRectangle(cornerRadius: Corners.medium).stroke(Color.white.opacity(0.15), lineWidth: 1))
    }

    private func spot(_ x: Float, _ align: TextAlign, _ y: Float, _ style: SubtitleStyle) -> some View {
        let on = style.align == align && abs(style.x - x) < 0.03 && abs(style.y - y) < 0.04
        let at: Alignment = align == .LEFT ? .leading : align == .RIGHT ? .trailing : .center
        return Button {
            set(track.withStyle { $0.x = x; $0.y = y; $0.align = align })
        } label: {
            RoundedRectangle(cornerRadius: Corners.small).fill(on ? Color.black : Color.white.opacity(0.6))
                .frame(width: 26, height: 5)
                .padding(.horizontal, 6)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: at)
                .background(RoundedRectangle(cornerRadius: Corners.small).fill(on ? SubInk.accent : Color(argb: 0xFF242424)))
        }
        .buttonStyle(GentlePress())
    }

    private func alignChip(_ glyph: Glyph, _ align: TextAlign, _ style: SubtitleStyle) -> some View {
        let on = style.align == align
        return Button { set(track.withStyle { $0.align = align }) } label: {
            IconView(glyph, size: 20, color: on ? .black : .white)
                .frame(width: 40, height: 40)
                .background(RoundedRectangle(cornerRadius: Corners.medium).fill(on ? Color.white : SubInk.panel))
                .overlay(RoundedRectangle(cornerRadius: Corners.medium).stroke(Color.white.opacity(0.15), lineWidth: 1))
        }
        .buttonStyle(GentlePress())
    }
}

// MARK: - Style

/// The ways to set subtitles, each with a little picture of how the words sit.
struct SubTemplates: View {
    let selected: CaptionTemplate
    let pick: (CaptionTemplate) -> Void

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(CaptionTemplate.allCases, id: \.self) { t in card(t).id(t) }
                }
            }
            .onAppear { proxy.scrollTo(selected, anchor: .center) }
        }
        Text(selected.blurb).font(UiType.sans(11)).foregroundStyle(SubInk.muted).fixedSize(horizontal: false, vertical: true)
    }

    private func card(_ t: CaptionTemplate) -> some View {
        let on = t == selected
        let ink: Color = on ? .black : .white
        return Button { pick(t) } label: {
            VStack(alignment: .leading, spacing: 0) {
                SubTemplateArt(template: t, ink: ink, on: on).frame(maxWidth: .infinity, maxHeight: .infinity)
                Text(t.label).font(UiType.sans(12, .semibold)).foregroundStyle(ink).lineLimit(1)
            }
            .padding(10)
            .frame(width: 132, height: 92)
            .background(RoundedRectangle(cornerRadius: Corners.medium).fill(on ? SubInk.accent : SubInk.panel))
            .overlay(RoundedRectangle(cornerRadius: Corners.medium).stroke(on ? SubInk.accent : Color.white.opacity(0.15), lineWidth: 1))
        }
        .buttonStyle(GentlePress())
    }
}

/// A little picture of a template: how its words sit.
struct SubTemplateArt: View {
    let template: CaptionTemplate
    let ink: Color
    let on: Bool

    private func sans(_ s: CGFloat) -> Font { subFont(FontKeys.interTight700, s) }
    private func serif(_ s: CGFloat) -> Font { subFont(FontKeys.serifItalic, s) }
    private func word(_ t: String, _ f: Font, _ c: Color? = nil) -> Text { Text(t).font(f).foregroundColor(c ?? ink) }

    var body: some View {
        switch template {
        case .CLASSIC:
            Text("a line at a time").font(UiType.sans(10)).foregroundStyle(ink).lineLimit(1)
                .padding(.horizontal, 4)
                .background(RoundedRectangle(cornerRadius: Corners.small).fill(on ? Color(argb: 0x22000000) : Color(argb: 0x33FFFFFF)))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        case .SCATTER:
            VStack(alignment: .leading, spacing: 0) {
                word("the one", sans(8)).padding(.leading, 2)
                word("question", sans(20)).padding(.top, 2)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        case .STACK:
            VStack(spacing: -2) { word("never said", sans(14)); word("out loud", serif(16)) }
        case .FOCUS:
            word("viral ideas", sans(15))
        case .SIDES:
            HStack {
                VStack(alignment: .leading, spacing: -1) { word("the one", sans(8)); word("idea", sans(15)) }
                Spacer()
                VStack(alignment: .trailing, spacing: -1) { word("that", sans(8)); word("works", sans(15)) }
            }
        case .CASCADE:
            VStack(alignment: .leading, spacing: -1) {
                word("step", sans(11))
                word("by", sans(11)).padding(.leading, 18)
                word("step", sans(14)).padding(.leading, 34)
            }
        case .HIGHLIGHT:
            (word("say ", sans(12)) + word("this ", sans(13), Color(argb: 0xFFE0B400)) + word("now", sans(12), ink.opacity(0.45)))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        case .LOWER:
            (word("out ", sans(11)) + word("loud", serif(15)))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
        case .HEADLINE:
            word("BIG NEWS", sans(16)).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        case .PUNCH:
            word("WOW", sans(24))
        }
    }
}

/// Language, and for kinetic captions a new layout of the same words.
struct SubLanguageRow: View {
    let track: SubtitleTrack
    let set: (SubtitleTrack) -> Void

    var body: some View {
        let style = track.style
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(SubtitleLanguage.allCases, id: \.self) { l in
                    SubChip(l.label, on: style.language == l) { set(track.withStyle { $0.language = l }) }
                }
                if style.kinetic {
                    SubChip("Shuffle layout", on: false) { set(track.withStyle { $0.seed += 1 }) }.padding(.leading, 6)
                    if style.seed != 0 { SubChip("Original", on: false) { set(track.withStyle { $0.seed = 0 }) } }
                }
            }
        }
        if style.kinetic && style.language == .BOTH {
            SubLabel("Kinetic captions show one language: English here.")
        }
    }
}

// MARK: - Text

/// Size, letter spacing, colour and fonts.
struct SubTextSheet: View {
    let track: SubtitleTrack
    let set: (SubtitleTrack) -> Void

    private func st(_ f: (inout SubtitleStyle) -> Void) { set(track.withStyle(f)) }

    var body: some View {
        let style = track.style
        if style.kinetic {
            SubSliderRow(label: "Size", value: style.captionScale, min: 0.5, max: 1.6, shown: "\(Int((style.captionScale * 100).rounded()))%") { v in
                st { $0.captionScale = (v * 20).rounded() / 20 }
            }
        } else {
            SubSliderRow(label: "Size", value: style.size, min: 0.022, max: 0.12, shown: "\(Int((style.size / 0.045 * 100).rounded()))%") { v in
                st { $0.size = v }
            }
        }
        SubSliderRow(label: "Spacing", value: style.tracking, min: -0.05, max: 0.4, shown: String(format: "%+d", Int((style.tracking * 100).rounded()))) { v in
            st { $0.tracking = abs(v) < 0.012 ? 0 : (v * 100).rounded() / 100 }
        }
        SubSwatches(colors: subTextColors, selected: style.color) { c in st { $0.color = c } }
        if style.template == .HIGHLIGHT {
            SubLabel("Word being said")
            SubSwatches(colors: subTextColors, selected: style.accentColor) { c in st { $0.accentColor = c } }
        }
        fonts(style)
    }

    @ViewBuilder
    private func fonts(_ style: SubtitleStyle) -> some View {
        if style.kinetic {
            if style.language == .TELUGU {
                SubFontRow(label: "Telugu", selected: style.teluguFont, telugu: true) { k in st { $0.teluguFont = k } }
            } else {
                SubFontRow(label: "Main", selected: style.captionFont, telugu: false) { k in st { $0.captionFont = k } }
                SubFontRow(label: "Accent", selected: style.accentFont, telugu: false) { k in st { $0.accentFont = k } }
                if style.template == .STACK {
                    SubFontRow(label: "Italic", selected: style.captionItalic, telugu: false) { k in st { $0.captionItalic = k } }
                }
            }
        } else {
            if style.language != .TELUGU {
                SubFontRow(label: "English", selected: style.latinFont, telugu: false) { k in st { $0.latinFont = k } }
            }
            if style.language != .ENGLISH {
                SubFontRow(label: "Telugu", selected: style.teluguFont, telugu: true) { k in st { $0.teluguFont = k } }
            }
        }
    }
}

// MARK: - Effects

/// Kinetic captions: a finish on the letters, each shown on a little tile, how strong, and its
/// colour; and how they blend with the picture.
struct SubEffectsSheet: View {
    let track: SubtitleTrack
    let set: (SubtitleTrack) -> Void

    private func st(_ f: (inout SubtitleStyle) -> Void) { set(track.withStyle(f)) }

    var body: some View {
        let style = track.style
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(TextFx.allCases, id: \.self) { fx in
                    SubEffectTile(fx: fx, style: style, on: style.effect == fx) { st { $0.effect = fx } }
                }
            }
        }
        SubLabel("Blend with the picture")
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(TextBlend.allCases, id: \.self) { b in
                    SubChip(b.label, on: style.blend == b) { st { $0.blend = b } }
                }
            }
        }
        if style.effect != .NONE {
            SubSliderRow(label: "Strength", value: style.effectAmount, min: 0, max: 1, shown: "\(Int((style.effectAmount * 100).rounded()))%") { v in
                st { $0.effectAmount = v }
            }
            effectColours(style)
        }
    }

    private func effectColours(_ style: SubtitleStyle) -> some View {
        var colours: [Int32] = []
        for c in subBackColors + subTextColors.dropFirst() where !colours.contains(c) { colours.append(c) }
        return HStack(spacing: 8) {
            SubChip("Auto", on: style.effectColor == 0) { st { $0.effectColor = 0 } }
            SubSwatches(colors: colours, selected: style.effectColor == 0 ? nil : style.effectColor, dot: 28) { c in st { $0.effectColor = c } }
        }
    }
}

/// "Aa" with an effect, over a soft picture-like background.
struct SubEffectTile: View {
    let fx: TextFx
    let style: SubtitleStyle
    let on: Bool
    let action: () -> Void

    var body: some View {
        var layer = TextLayer()
        layer.id = 1
        layer.text = "Aa"
        layer.font = style.captionFont
        layer.size = 0.62
        layer.x = 0.5
        layer.y = 0.5
        layer.color = Int32(bitPattern: 0xFFFF_FFFF)
        layer.fx = fx
        layer.fxAmount = fx == style.effect ? max(style.effectAmount, 0.35) : 0.6
        layer.fxColor = fx == style.effect ? style.effectColor : 0
        let layers = [layer]
        return Button(action: action) {
            VStack(spacing: 3) {
                Canvas { ctx, size in
                    ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .linearGradient(
                        Gradient(colors: [Color(argb: 0xFF8C8A84), Color(argb: 0xFFD9D4C8), Color(argb: 0xFF6F7A80)]),
                        startPoint: .zero, endPoint: CGPoint(x: size.width, y: size.height)))
                    ctx.withCGContext { cg in TextRenderer.draw(cg, layers, w: size.width, h: size.height, t: -1) }
                }
                .frame(width: 64, height: 50)
                .clipShape(RoundedRectangle(cornerRadius: Corners.medium))
                .overlay(RoundedRectangle(cornerRadius: Corners.medium).stroke(on ? SubInk.accent : Color.white.opacity(0.15), lineWidth: on ? 2 : 1))
                Text(fx.label).font(UiType.sans(10)).foregroundStyle(on ? .white : SubInk.muted).lineLimit(1)
            }
        }
        .buttonStyle(GentlePress())
    }
}

/// Classic lines: what sits behind the letters (none, shadow, outline or a box), its colour and opacity.
struct SubBackgroundSheet: View {
    let track: SubtitleTrack
    let set: (SubtitleTrack) -> Void

    private func st(_ f: (inout SubtitleStyle) -> Void) { set(track.withStyle(f)) }

    var body: some View {
        let style = track.style
        HStack(spacing: 8) {
            ForEach(SubtitleBackground.allCases, id: \.self) { b in
                SubChip(b.label, on: style.background == b) { st { $0.background = b } }
            }
        }
        if style.background == .BOX || style.background == .OUTLINE {
            SubSwatches(colors: subBackColors, selected: style.backColor) { c in st { $0.backColor = c } }
        }
        if style.background == .BOX {
            SubSliderRow(label: "Opacity", value: style.backOpacity, min: 0.2, max: 1, shown: "\(Int((style.backOpacity * 100).rounded()))%") { v in
                st { $0.backOpacity = v }
            }
        }
    }
}

// MARK: - Motion, sound, more

/// Kinetic captions: how words come in, and words passing behind the subject.
struct SubMotionSheet: View {
    let track: SubtitleTrack
    let set: (SubtitleTrack) -> Void

    var body: some View {
        let style = track.style
        SubLabel("Words come in")
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(WordAnim.allCases, id: \.self) { a in
                    SubChip(a.label, on: style.wordAnim == a) { set(track.withStyle { $0.wordAnim = a }) }
                }
            }
        }
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Text behind subject").font(UiType.sans(14)).foregroundStyle(.white)
                Text("Some big words pass behind you, the rest stay in front. Faded here; tucked behind you when burnt in.")
                    .font(UiType.sans(11)).foregroundStyle(SubInk.muted).fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Toggle2(on: style.behindSubject) { set(track.withStyle { $0.behindSubject.toggle() }) }
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: Corners.medium).fill(SubInk.raised))
    }
}

/// Taking background noise out of the voice when burning in.
struct SubSoundSheet: View {
    let track: SubtitleTrack
    let set: (SubtitleTrack) -> Void

    static let levels: [(Float, String)] = [(0, "Off"), (0.3, "Light"), (0.6, "Medium"), (1, "Strong")]

    var body: some View {
        let style = track.style
        Text("Reduce background noise").font(UiType.sans(14)).foregroundStyle(.white)
        SubLabel("Hiss, hum, fans, traffic and room noise are taken down, most of all between words; the voice itself is kept natural. Applied when you burn in.")
        HStack(spacing: 8) {
            ForEach(0..<Self.levels.count, id: \.self) { i in
                let v = Self.levels[i].0
                SubChip(Self.levels[i].1, on: abs(style.cleanVoice - v) < 0.05) { set(track.withStyle { $0.cleanVoice = v }) }
            }
        }
    }
}

/// Preview, redo, the .srt file and undoing word changes.
struct SubMoreSheet: View {
    @EnvironmentObject var model: AppModel
    let track: SubtitleTrack
    let preview: () -> Void
    let set: (SubtitleTrack) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                SubSecondary("Full-screen preview", action: preview)
                SubSecondary("Redo with Gemini") { model.generateSubtitles() }
                SubSecondary("Save .srt") { model.saveSrt() }
            }
        }
        if !track.edits.isEmpty {
            let n = track.edits.count
            SubSecondary("Undo \(n) word change\(n == 1 ? "" : "s")") {
                var t = track
                t.edits = [:]
                set(t)
            }
        }
        if model.geminiKey.isEmpty {
            SubLabel("Add a Gemini key (the key button above) to make subtitles from the clip's speech.")
        }
    }
}

// MARK: - Words

enum WordPart: String, CaseIterable {
    case FONT, SIZE, COLOUR, ANIM, DEPTH

    var label: String {
        switch self {
        case .FONT: return "Font"
        case .SIZE: return "Size"
        case .COLOUR: return "Colour"
        case .ANIM: return "Comes in"
        case .DEPTH: return "Depth"
        }
    }
}

/// One word at a time: tap a word on the video (or below) to pick it, drag it anywhere, and
/// change its font, size, colour, entrance and whether it sits in front of or behind you.
struct SubWordsPanel: View {
    @ObservedObject var s: SubtitleSession
    @ObservedObject var player: SubPlayer
    let track: SubtitleTrack
    let set: (SubtitleTrack) -> Void
    @State var part: WordPart = .FONT

    /// Holds the clip where the whole phrase is in, and picks [id] (or nothing).
    private func show(_ p: Phrase, _ id: String? = nil) {
        player.pause()
        if let last = p.words.last { player.seek(min(last.startMs + Kinetic.IN_MS + 40, p.endMs - 1)) }
        s.selectedWord = id
    }

    var body: some View {
        let phrases = Kinetic.plan(track).phrases
        // The phrase picked, else the one on screen.
        let phrase = s.selectedWord.flatMap { Kinetic.phraseOf(track, $0) } ?? Kinetic.phraseAt(track, player.positionMs) ?? phrases.first
        SubSheetColumn {
            if let phrase {
                wordsRow(phrase, phrases)
                if let word = phrase.words.first(where: { $0.id == s.selectedWord }) {
                    SubWordEditor(s: s, track: track, word: word, part: $part, set: set)
                } else {
                    SubLabel("Tap a word on the video, or above, to change it. Drag a word to move it.")
                }
            } else {
                SubLabel("No words yet: write some lines first.")
            }
        }
    }

    /// The phrase's words, with steps to the one before and after.
    private func wordsRow(_ phrase: Phrase, _ phrases: [Phrase]) -> some View {
        HStack(spacing: 0) {
            SubIcon(glyph: Ico.back) { if phrase.index > 0 { show(phrases[phrase.index - 1]) } }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(phrase.words, id: \.id) { w in
                        let edited = track.edits[w.id].map { $0.text == w.text } ?? false
                        SubChip(edited ? "\(w.text) •" : w.text, on: w.id == s.selectedWord) {
                            show(phrase, w.id == s.selectedWord ? nil : w.id)
                        }
                    }
                }
            }
            SubIcon(glyph: Ico.back, flip: true) { if phrase.index + 1 < phrases.count { show(phrases[phrase.index + 1]) } }
        }
    }
}

/// The picked word's parts: font, size, colour, entrance and depth.
struct SubWordEditor: View {
    @ObservedObject var s: SubtitleSession
    let track: SubtitleTrack
    let word: Word
    @Binding var part: WordPart
    let set: (SubtitleTrack) -> Void

    private var edit: WordEdit { track.edits[word.id].flatMap { $0.text == word.text ? $0 : nil } ?? WordEdit(text: word.text) }
    private func ed(_ f: (inout WordEdit) -> Void) {
        var e = edit
        f(&e)
        set(track.withEdit(word.id, e))
    }

    var body: some View {
        let placed = Kinetic.placedWord(track, word.id, aspect: s.aspect, measurer: SubMeasure.shared)
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 16) {
                ForEach(WordPart.allCases, id: \.self) { p in
                    Button { part = p } label: {
                        Text(p.label).font(UiType.sans(12, p == part ? .semibold : .regular))
                            .foregroundStyle(p == part ? .white : SubInk.muted).padding(.vertical, 4)
                    }
                    .buttonStyle(.plain)
                }
                if !edit.isEmpty {
                    SubLink("Reset", size: 12, padding: 4) { set(track.withEdit(word.id, WordEdit(text: word.text))) }.padding(.leading, 8)
                }
                SubLink("Done", size: 12, padding: 4) { s.selectedWord = nil }
            }
        }
        partView(placed)
    }

    @ViewBuilder
    private func partView(_ placed: Kinetic.Placed?) -> some View {
        let style = track.style
        switch part {
        case .FONT:
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    let faces = [(style.captionFont, "Sans"), (style.captionItalic, "Italic"), (style.accentFont, "Serif")]
                    ForEach(0..<faces.count, id: \.self) { i in
                        let key = faces[i].0
                        SubChip(faces[i].1, on: placed?.font == key, font: subFont(key, 13)) { ed { $0.font = key } }
                    }
                    SubFontMenu(selected: placed?.font ?? style.captionFont, telugu: style.language == .TELUGU) { k in ed { $0.font = k } }
                        .frame(width: 190)
                }
            }
        case .SIZE:
            let now = placed?.size ?? 0.08
            // Shown against the template's own size for the word.
            let base = edit.size == nil ? now : (Kinetic.placedWord(track.withEdit(word.id, sizeless(edit)), word.id, aspect: s.aspect, measurer: SubMeasure.shared)?.size ?? now)
            SubSliderRow(label: "Size", value: now / base, min: 0.4, max: 2.5, shown: "\(Int((now / base * 100).rounded()))%") { k in
                ed { $0.size = min(max(base * k, 0.025), 0.32) }
            }
        case .COLOUR:
            SubSwatches(colors: subTextColors, selected: placed?.color ?? style.color) { c in ed { $0.color = c } }
        case .ANIM:
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(WordAnim.allCases, id: \.self) { a in
                        SubChip(a.label, on: (edit.anim ?? style.wordAnim) == a) { ed { $0.anim = a } }
                    }
                }
            }
        case .DEPTH:
            HStack(spacing: 8) {
                ForEach(WordDepth.allCases, id: \.self) { d in
                    SubChip(d.label, on: edit.depth == d) { ed { $0.depth = d } }
                }
            }
            if placed?.behind == true {
                SubLabel("Behind you: faded in this preview, tucked behind you when burnt in.")
            }
        }
    }

    private func sizeless(_ e: WordEdit) -> WordEdit {
        var k = e
        k.size = nil
        return k
    }
}

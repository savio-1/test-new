import SwiftUI

/// Live subtitles on the viewfinder (CaptionToggle and the caption line in CameraScreen.kt on
/// Android): CC on/off (also while recording) and the language spoken, top left in video mode
/// (not while developing an import); the line heard just now, low in the frame; and after a
/// take, "Edit live subtitles ›". Live subtitles show here only: they are kept with the clip to
/// edit and burn in later. Fills the viewfinder; only its own pieces take touches.
struct LiveCaptionOverlay: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        ZStack {
            if model.mode == .VIDEO && model.edit == nil {
                VStack {
                    HStack(alignment: .top) {
                        LiveCaptionToggle()
                        Spacer(minLength: 0)
                    }
                    Spacer(minLength: 0)
                }
                .padding(12)
            }
            VStack {
                Spacer(minLength: 0)
                if let line = model.liveCaption {
                    Text(line).font(UiType.sans(17, .semibold)).foregroundStyle(.white).multilineTextAlignment(.center)
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(RoundedRectangle(cornerRadius: Corners.small).fill(Color(argb: 0x99000000)))
                        .padding(.horizontal, 24)
                        .allowsHitTesting(false)
                        .transition(.opacity)
                } else if model.captionsFor != nil && !model.recording && !model.savingVideo && model.edit == nil {
                    Button { model.editLiveSubtitles() } label: {
                        Text("Edit live subtitles  ›").font(UiType.sans(13, .semibold)).foregroundStyle(.black)
                            .padding(.horizontal, 16).padding(.vertical, 9)
                            .background(RoundedRectangle(cornerRadius: Corners.small).fill(Color.white))
                    }
                    .buttonStyle(GentlePress())
                    .transition(.opacity.combined(with: .offset(y: 8)))
                }
            }
            .padding(.bottom, 70)
        }
        .animation(.easeOut(duration: 0.18), value: model.liveCaption)
        .animation(.easeOut(duration: 0.2), value: model.captionsFor?.id)
        .onAppear { model.watchLiveCaptions() }
    }
}

/// CC on/off, the language spoken, and what the recognizer is doing while recording (so a
/// silent failure can't pass for "nobody spoke").
struct LiveCaptionToggle: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        let on = model.liveCaptions
        HStack(alignment: .top, spacing: 6) {
            Button { model.setLiveCaptions(!on) } label: {
                Text("CC").font(UiType.sans(12, .bold)).foregroundStyle(on ? Color.black : Color.white)
                    .padding(.horizontal, 10).padding(.vertical, 6)
                    .background(RoundedRectangle(cornerRadius: Corners.small).fill(on ? Color.white : Color.glass))
            }
            .buttonStyle(GentlePress())
            if on {
                Button { model.setCaptionLanguage(model.captionLanguage == "te" ? "en" : "te") } label: {
                    Text(model.captionLanguage == "te" ? "తెలుగు" : "English").font(UiType.sans(12)).foregroundStyle(.white)
                        .padding(.horizontal, 10).padding(.vertical, 6)
                        .background(RoundedRectangle(cornerRadius: Corners.small).fill(Color.glass))
                }
                .buttonStyle(GentlePress())
            }
            if on && model.recording && !model.captionState.isEmpty {
                // At most 180 wide (padding included), and no wider than the words.
                Text(model.captionState).font(UiType.sans(11)).foregroundStyle(.white.opacity(0.8)).lineLimit(2)
                    .frame(maxWidth: 164, alignment: .leading)
                    .fixedSize(horizontal: true, vertical: false)
                    .padding(.horizontal, 8).padding(.vertical, 6)
                    .background(RoundedRectangle(cornerRadius: Corners.small).fill(Color.glass))
                    .allowsHitTesting(false)
            }
        }
        .animation(.easeOut(duration: 0.16), value: on)
    }
}

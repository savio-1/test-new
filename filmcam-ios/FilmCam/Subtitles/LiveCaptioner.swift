import AVFoundation
import Foundation
import Speech

/// Live subtitles while recording (LiveCaptioner.kt on Android): the phone's speech recognizer
/// listens to the same microphone sound the video records (the engine hands each buffer to
/// [feed]), so it never opens the microphone itself and can't take sound away from the clip.
/// On the phone itself where it can be, else through Apple's service.
///
/// What is heard shows on screen as it comes ([onCaption]) and is kept as timed cues on the
/// clip's clock, so after recording the lines can be fixed, styled and placed before they are
/// burnt in. Nothing is drawn into the video while recording.
///
/// Each line is one recognition request: when the speaker pauses (or a line runs long) the
/// request is closed and a fresh one takes the next words, while the closed one settles into
/// its final text. Main thread, except [feed], which the audio queue calls.
final class LiveCaptioner: @unchecked Sendable {
    /// The line to show now, or nil for none.
    var onCaption: ((String?) -> Void)?
    /// What the recognizer is doing ("Listening", "Hearing you"...), for the CC pill.
    var onState: ((String) -> Void)?
    /// Something the person should know (language not available, no network...).
    var onProblem: ((String) -> Void)?

    /// One request: the words of one line.
    private final class Listen {
        let request: SFSpeechAudioBufferRecognitionRequest
        var task: SFSpeechRecognitionTask?
        /// When its sound starts, on the clip's clock (ms).
        let startMs: Int64
        var text: String?
        var firstHeard: Int64 = -1
        var lastHeard: Int64 = -1
        /// Its sound has ended (a pause, or stopping); it is only settling now.
        var ended = false
        /// Its line has been kept.
        var kept = false

        init(_ request: SFSpeechAudioBufferRecognitionRequest, _ startMs: Int64) {
            self.request = request
            self.startMs = startMs
        }
    }

    private var recognizer: SFSpeechRecognizer?
    private var current: Listen?
    private var settling: [Listen] = []
    private var active = false
    private var language = "en-US"
    /// When the clip started: cue times are on the clip's clock.
    private var clipStart = Date()
    private var clearTimer: Timer?
    private var pauseTimer: Timer?
    private var restartTimer: Timer?

    // What has been said (main thread).
    private var cues: [Cue] = []
    private var failures = 0
    private var reported = false

    /// The request the audio goes into (audio queue and main thread).
    private let lock = NSLock()
    private var feeding: SFSpeechAudioBufferRecognitionRequest?

    /// Speech starts a little before the first words come back.
    private static let LEAD_MS: Int64 = 500
    /// A pause this long ends the line.
    private static let PAUSE_S: TimeInterval = 1.1
    /// A line that runs this long is ended at its next breath anyway.
    private static let LONGEST_MS: Int64 = 12_000

    // MARK: - Permission

    /// Asks for speech recognition if it hasn't been yet; [done] (main thread) gets nil when
    /// live subtitles can run, else why not.
    static func authorize(_ done: @escaping (String?) -> Void) {
        guard SFSpeechRecognizer() != nil else { done("No speech recognition on this phone"); return }
        func answer(_ s: SFSpeechRecognizerAuthorizationStatus) -> String? {
            switch s {
            case .authorized: return nil
            case .restricted: return "Speech recognition isn't available on this phone"
            default: return "Speech recognition isn't allowed. Turn it on for S film in Settings"
            }
        }
        let now = SFSpeechRecognizer.authorizationStatus()
        if now != .notDetermined { done(answer(now)); return }
        SFSpeechRecognizer.requestAuthorization { s in DispatchQueue.main.async { done(answer(s)) } }
    }

    // MARK: - Listening

    /// Starts captioning in [languageTag] ("te-IN", "en-US") for a clip that began at [clipStartedAt].
    func start(languageTag: String, clipStartedAt: Date) {
        if active { endAll() }
        active = false
        language = languageTag
        clipStart = clipStartedAt
        failures = 0
        reported = false
        guard let r = SFSpeechRecognizer(locale: Locale(identifier: languageTag)) else {
            problem(languageTag.hasPrefix("te") ? "Telugu live subtitles aren't available on this phone. Try English, or Subtitles after recording"
                    : "This language isn't available for live subtitles on this phone")
            return
        }
        r.queue = .main
        r.defaultTaskHint = .dictation
        recognizer = r
        if !r.isAvailable && !r.supportsOnDeviceRecognition {
            problem("Live subtitles need an internet connection")
        }
        active = true
        onState?("Starting")
        session()
    }

    /// Stops listening; returns every line heard since the clip started, in order.
    func stop() -> [Cue] {
        active = false
        // Whatever is still being said or settled is kept as it was last heard.
        if let c = current { keep(c, nil) }
        for l in settling { keep(l, nil) }
        endAll()
        clearTimer?.invalidate()
        onCaption?(nil)
        return SubtitleTrack.clean(cues, durationMs: 0)
    }

    /// Forgets the lines of the last clip.
    func reset() {
        cues = []
    }

    /// Microphone sound while recording (audio queue). Goes to the request listening now.
    func feed(_ buffer: CMSampleBuffer) {
        lock.lock()
        let r = feeding
        lock.unlock()
        r?.appendAudioSampleBuffer(buffer)
    }

    private func now() -> Int64 { Int64(Date().timeIntervalSince(clipStart) * 1000) }

    /// A fresh request for the next line.
    private func session() {
        restartTimer?.invalidate()
        guard active, let r = recognizer else { return }
        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        req.taskHint = .dictation
        req.addsPunctuation = true
        // On the phone where it can be: no time limit, no network, nothing leaves the phone.
        if r.supportsOnDeviceRecognition { req.requiresOnDeviceRecognition = true }
        let l = Listen(req, max(0, now()))
        current = l
        lock.lock(); feeding = req; lock.unlock()
        l.task = r.recognitionTask(with: req) { [weak self, weak l] result, error in
            // The recognizer calls back on its queue (main).
            guard let self, let l else { return }
            self.handle(l, result, error)
        }
        onState?("Listening")
    }

    /// The line's sound is over: close its request (it settles in the background) and start the next.
    private func endLine(_ l: Listen) {
        guard !l.ended else { return }
        l.ended = true
        pauseTimer?.invalidate()
        if current === l {
            current = nil
            lock.lock(); feeding = nil; lock.unlock()
        }
        l.request.endAudio()
        settling.append(l)
        if active { session() }
    }

    private func endAll() {
        pauseTimer?.invalidate()
        restartTimer?.invalidate()
        lock.lock(); feeding = nil; lock.unlock()
        for l in settling + (current.map { [$0] } ?? []) {
            l.request.endAudio()
            l.task?.cancel()
        }
        settling = []
        current = nil
    }

    private func finish(_ l: Listen) {
        settling.removeAll { $0 === l }
        if current === l {
            current = nil
            lock.lock(); feeding = nil; lock.unlock()
        }
    }

    private func handle(_ l: Listen, _ result: SFSpeechRecognitionResult?, _ error: Error?) {
        if let result {
            let t = result.bestTranscription.formattedString.trimmingCharacters(in: .whitespacesAndNewlines)
            if !t.isEmpty && !l.kept {
                failures = 0
                let at = now()
                if l.firstHeard < 0 {
                    l.firstHeard = at
                    if l === current { onState?("Hearing you") }
                }
                l.lastHeard = at
                l.text = t
                // An older line settling doesn't take the screen from the one being spoken.
                if l === current || current?.text == nil { show(t, final: result.isFinal) }
                if l === current && !result.isFinal { waitForPause(l) }
            }
            if result.isFinal {
                keep(l, result.bestTranscription.segments)
                let wasCurrent = l === current
                finish(l)
                if wasCurrent && active { session() }
            }
            return
        }
        guard let error else { return }
        keep(l, nil)
        let wasCurrent = l === current
        finish(l)
        // A closed line with nothing in it, or one stopped on purpose, isn't a problem.
        guard wasCurrent, active else { return }
        let e = error as NSError
        switch (e.domain, e.code) {
        case ("kAFAssistantErrorDomain", 1110), ("kAFAssistantErrorDomain", 203):
            // Silence or nothing understood: just keep listening.
            restart()
        case ("kAFAssistantErrorDomain", 216), ("kAFAssistantErrorDomain", 301):
            restart()   // cancelled
        default:
            failures += 1
            if let r = recognizer, !r.isAvailable, !r.supportsOnDeviceRecognition {
                problem("Live subtitles need an internet connection")
            } else if failures >= 3 {
                problem("Live subtitles: \(e.localizedDescription)")
            }
            restart()
        }
    }

    /// The request ended (silence, a hiccup): start a fresh one while captions are on. Backs
    /// off when the recognizer keeps failing, so it isn't hammered.
    private func restart() {
        guard active, current == nil else { return }
        let wait: TimeInterval = failures <= 1 ? 0.15 : failures <= 3 ? 0.8 : 2.5
        restartTimer?.invalidate()
        restartTimer = Timer.scheduledTimer(withTimeInterval: wait, repeats: false) { [weak self] _ in
            DispatchQueue.main.async {
                guard let self, self.active, self.current == nil else { return }
                self.session()
            }
        }
    }

    /// Ends the line when nothing new is heard for a moment (or it has run long).
    private func waitForPause(_ l: Listen) {
        pauseTimer?.invalidate()
        let long = l.firstHeard >= 0 && now() - l.firstHeard > Self.LONGEST_MS
        pauseTimer = Timer.scheduledTimer(withTimeInterval: long ? 0.45 : Self.PAUSE_S, repeats: false) { [weak self, weak l] _ in
            DispatchQueue.main.async {
                guard let self, let l, self.current === l, l.text != nil else { return }
                self.endLine(l)
            }
        }
    }

    private func show(_ text: String, final: Bool) {
        clearTimer?.invalidate()
        onCaption?(lastWords(text))
        clearTimer = Timer.scheduledTimer(withTimeInterval: final ? 2.2 : 3.5, repeats: false) { [weak self] _ in
            DispatchQueue.main.async { self?.onCaption?(nil) }
        }
    }

    /// The line becomes a cue: timed by the recognizer's own word times when it gives them,
    /// else from when it was first heard to when it was last heard.
    private func keep(_ l: Listen, _ segments: [SFTranscriptionSegment]?) {
        guard !l.kept, let t = l.text, !t.isEmpty else { return }
        l.kept = true
        let lastEnd = cues.map(\.endMs).max() ?? 0
        var start = max(0, l.firstHeard - Self.LEAD_MS)
        var end = max(l.lastHeard + 300, start + 700)
        if let segs = segments, let first = segs.first, let last = segs.last, last.timestamp + last.duration > 0 {
            start = l.startMs + Int64(first.timestamp * 1000)
            end = l.startMs + Int64((last.timestamp + last.duration) * 1000)
        }
        start = max(start, lastEnd)
        end = max(end, start + 700)
        cues.append(language.hasPrefix("te") ? Cue(start, end, "te", "", t) : Cue(start, end, "en", t, ""))
    }

    /// Long speech keeps only its last ~12 words on screen, like live captions do.
    private func lastWords(_ t: String) -> String {
        let words = t.split(whereSeparator: { $0.isWhitespace })
        return words.count <= 12 ? t : words.suffix(12).joined(separator: " ")
    }

    private func problem(_ msg: String) {
        onState?(msg)
        if !reported { reported = true; onProblem?(msg) }
    }
}

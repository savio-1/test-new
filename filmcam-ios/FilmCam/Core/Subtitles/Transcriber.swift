import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

// A port of Transcriber.kt: speech to subtitles with Gemini (request, streamed reply, cues),
// and the clip's sound for it and for the word aligner (AVFoundation, iOS only).

/// The sound of a clip, ready to send: bytes and their MIME type.
struct ClipAudio {
    let bytes: Data
    let mime: String
}

/// A transcription that failed, with a message to show as it is.
struct TranscribeError: Error, LocalizedError, Equatable {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

enum AudioExtract {
    /// The 7-byte ADTS header in front of each raw AAC frame.
    static func adtsHeader(_ payload: Int, objectType: Int, freqIndex: Int, channels: Int) -> [UInt8] {
        let len = payload + 7
        let profile = Kt.coerceIn(objectType - 1, 0, 3)
        return [
            0xFF, 0xF1,
            UInt8(truncatingIfNeeded: (profile << 6) | (freqIndex << 2) | (channels >> 2)),
            UInt8(truncatingIfNeeded: ((channels & 3) << 6) | (len >> 11)),
            UInt8(truncatingIfNeeded: (len & 0x7FF) >> 3),
            UInt8(truncatingIfNeeded: ((len & 7) << 5) | 0x1F),
            0xFC,
        ]
    }

    /// A WAV file around 16-bit mono little-endian [pcm] at [rate].
    static func wav(_ pcm: Data, rate: Int) -> Data {
        var h = Data()
        func u32(_ v: Int) { var x = UInt32(truncatingIfNeeded: v).littleEndian; withUnsafeBytes(of: &x) { h.append(contentsOf: $0) } }
        func u16(_ v: Int) { var x = UInt16(truncatingIfNeeded: v).littleEndian; withUnsafeBytes(of: &x) { h.append(contentsOf: $0) } }
        h.append(contentsOf: Array("RIFF".utf8)); u32(36 + pcm.count); h.append(contentsOf: Array("WAVE".utf8))
        h.append(contentsOf: Array("fmt ".utf8)); u32(16); u16(1); u16(1); u32(rate); u32(rate * 2); u16(2); u16(16)
        h.append(contentsOf: Array("data".utf8)); u32(pcm.count)
        return h + pcm
    }

    /// 16-bit little-endian PCM bytes as samples, -1..1.
    static func floats(_ pcm: Data) -> [Float] {
        let n = pcm.count / 2
        return pcm.withUnsafeBytes { (raw: UnsafeRawBufferPointer) -> [Float] in
            [Float](unsafeUninitializedCapacity: n) { buf, count in
                for i in 0..<n {
                    let v = Int16(bitPattern: UInt16(raw[2 * i]) | UInt16(raw[2 * i + 1]) << 8)
                    buf[i] = Float(v) / 32768
                }
                count = n
            }
        }
    }
}

/// Server-sent events as they arrive: "data:" lines gathered until a blank line.
struct SSEParser {
    private var pending = Data()
    private var data = ""

    init() {}

    /// The events completed by [chunk].
    mutating func feed(_ chunk: Data) -> [String] {
        pending.append(chunk)
        var events: [String] = []
        var from = pending.startIndex
        while let nl = pending[from...].firstIndex(of: 0x0A) {
            var line = pending[from..<nl]
            if line.last == 0x0D { line = line.dropLast() }   // \r\n
            handle(String(decoding: line, as: UTF8.self), &events)
            from = pending.index(after: nl)
        }
        pending = Data(pending[from...])
        return events
    }

    /// Whatever is left when the stream ends.
    mutating func finish() -> [String] {
        var events: [String] = []
        if !pending.isEmpty { handle(String(decoding: pending, as: UTF8.self), &events); pending = Data() }
        if !data.isEmpty { events.append(data); data = "" }
        return events
    }

    private mutating func handle(_ line: String, _ events: inout [String]) {
        if line.hasPrefix("data:") {
            data += Kt.trim(String(line.dropFirst(5)))
        } else if line.isEmpty && !data.isEmpty {
            events.append(data)
            data = ""
        }
    }
}

/// Speech to subtitles with Google's Gemini API: the clip's sound goes up with a request for
/// timed cues, each in the language spoken plus English and Telugu (Telugu script), so the
/// same transcript serves either language. Uses the person's own API key.
final class GeminiTranscriber: @unchecked Sendable {
    let apiKey: String
    let model: String
    private let lock = NSLock()
    private var cancelled = false
    private var open: URLSessionTask?

    static let DEFAULT_MODEL = "gemini-3.8-flash"
    /// Quicker and cheaper; a little less exact on Telugu.
    static let FAST_MODEL = "gemini-3.5-flash-lite"
    static let BASE = "https://generativelanguage.googleapis.com"
    /// Inline audio above this goes through the Files API (the request limit is 20 MB, base64 adds a third).
    static let INLINE_LIMIT = 13 * 1024 * 1024

    init(apiKey: String, model: String = GeminiTranscriber.DEFAULT_MODEL) {
        self.apiKey = apiKey
        self.model = model
    }

    private var isCancelled: Bool { lock.lock(); defer { lock.unlock() }; return cancelled }

    /// Stops a transcription in progress (from any thread).
    func cancel() {
        lock.lock()
        cancelled = true
        let t = open
        lock.unlock()
        t?.cancel()
    }

    /// Transcribes [audio] of a [durationMs] clip into tidied cues. [onText] gets the reply so
    /// far as it streams in (for showing progress). Callbacks come on a background queue.
    func transcribe(_ audio: ClipAudio, durationMs: Int64, onStatus: @escaping (String) -> Void,
                    onText: @escaping (String) -> Void = { _ in }) async throws -> [Cue] {
        let part: [String: Any]
        if audio.bytes.count > GeminiTranscriber.INLINE_LIMIT {
            onStatus("Uploading sound")
            part = ["fileData": ["mimeType": audio.mime, "fileUri": try await upload(audio)]]
        } else {
            part = ["inlineData": ["mimeType": audio.mime, "data": audio.bytes.base64EncodedString()]]
        }
        onStatus("Listening")
        // Ask for little "thinking" (transcription doesn't need it, and it can take minutes),
        // with the JSON schema; step back from either if this model or endpoint refuses it.
        let attempts = [(true, true), (false, true), (false, false)]
        var last: HttpError?
        for (thinkingLow, schema) in attempts {
            if isCancelled { throw TranscribeError("Cancelled") }
            do {
                let text = try await generate(part, durationMs, schema, thinkingLow, onText)
                return SubtitleTrack.clean(try GeminiTranscriber.parseCues(text), durationMs: durationMs)
            } catch let e as HttpError {
                last = e
                if e.code != 400 || e.body.range(of: "API key", options: .caseInsensitive) != nil { throw e.readable(model) }
            }
        }
        throw last!.readable(model)
    }

    /// The generateContent request body (as JSON-ready dictionaries).
    static func requestBody(audioPart: [String: Any], durationMs: Int64, withSchema: Bool, thinkingLow: Bool) -> [String: Any] {
        var config: [String: Any] = ["temperature": 0.2, "responseMimeType": "application/json"]
        if withSchema { config["responseSchema"] = schema }
        if thinkingLow { config["thinkingConfig"] = ["thinkingLevel": "low"] }
        return [
            "contents": [["role": "user", "parts": [audioPart, ["text": prompt(durationMs, schemaInRequest: withSchema)]]]],
            "generationConfig": config,
        ]
    }

    /// Streams the reply (server-sent events) and returns its whole text.
    private func generate(_ audioPart: [String: Any], _ durationMs: Int64, _ withSchema: Bool, _ thinkingLow: Bool,
                          _ onText: @escaping (String) -> Void) async throws -> String {
        let body = try JSONSerialization.data(withJSONObject: GeminiTranscriber.requestBody(
            audioPart: audioPart, durationMs: durationMs, withSchema: withSchema, thinkingLow: thinkingLow))
        let reply = ReplyText()
        try await stream("\(GeminiTranscriber.BASE)/v1beta/models/\(model):streamGenerateContent?alt=sse", body) { event in
            GeminiTranscriber.readEvent(event, into: reply)
            onText(reply.text)
        }
        if reply.text.isEmpty {
            throw TranscribeError(reply.blocked.map { "Gemini declined: \($0)" } ?? "Gemini sent no transcript")
        }
        return reply.text
    }

    /// The reply so far, and why the prompt was blocked (if it was).
    final class ReplyText: @unchecked Sendable {
        var text = ""
        var blocked: String?
    }

    /// Adds one streamed event's text (thoughts left out) to [reply].
    static func readEvent(_ event: String, into reply: ReplyText) {
        guard let json = (try? JSONSerialization.jsonObject(with: Data(event.utf8))) as? [String: Any] else { return }
        if let fb = json["promptFeedback"] as? [String: Any], let r = fb["blockReason"] as? String, !r.isEmpty { reply.blocked = r }
        guard let cands = json["candidates"] as? [Any], let c0 = cands.first as? [String: Any],
              let content = c0["content"] as? [String: Any], let parts = content["parts"] as? [Any] else { return }
        for p in parts {
            guard let p = p as? [String: Any] else { continue }
            if (p["thought"] as? Bool) != true { reply.text += (p["text"] as? String) ?? "" }
        }
    }

    // ------------------------------------------------------------------ HTTP

    struct HttpError: Error {
        let code: Int
        let body: String

        func readable(_ model: String) -> TranscribeError {
            var msg = String(body.prefix(200))
            if let o = (try? JSONSerialization.jsonObject(with: Data(body.utf8))) as? [String: Any],
               let e = o["error"] as? [String: Any], let m = e["message"] as? String { msg = m }
            switch code {
            case 400: return TranscribeError(msg.range(of: "API key", options: .caseInsensitive) != nil ? "That API key isn't valid" : "Gemini: \(msg)")
            case 401, 403: return TranscribeError("The API key was refused: \(msg)")
            case 404: return TranscribeError("Model \"\(model)\" isn't available. Change it under Subtitles settings.")
            case 429: return TranscribeError("Gemini's free limit is used up for now. Try again in a minute.")
            default: return TranscribeError("Gemini error \(code): \(msg)")
            }
        }
    }

    /// Hands a data task's bytes to the stream parser (or keeps them as the error body).
    private final class StreamDelegate: NSObject, URLSessionDataDelegate, @unchecked Sendable {
        private var parser = SSEParser()
        private var errorBody = Data()
        private let onEvent: (String) -> Void
        private let done: (Int, Data, Error?) -> Void

        init(onEvent: @escaping (String) -> Void, done: @escaping (Int, Data, Error?) -> Void) {
            self.onEvent = onEvent
            self.done = done
        }

        private func status(_ task: URLSessionTask) -> Int { (task.response as? HTTPURLResponse)?.statusCode ?? 0 }

        func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
            if (200..<300).contains(status(dataTask)) { for e in parser.feed(data) { onEvent(e) } } else { errorBody.append(data) }
        }

        func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
            let code = status(task)
            if error == nil && (200..<300).contains(code) { for e in parser.finish() { onEvent(e) } }
            done(code, errorBody, error)
            session.finishTasksAndInvalidate()
        }
    }

    private func session(_ delegate: URLSessionDelegate?, readTimeout: TimeInterval) -> URLSession {
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = readTimeout
        cfg.timeoutIntervalForResource = 3600
        return URLSession(configuration: cfg, delegate: delegate, delegateQueue: nil)
    }

    private func start(_ task: URLSessionTask) throws {
        lock.lock()
        if cancelled { lock.unlock(); throw TranscribeError("Cancelled") }
        open = task
        lock.unlock()
        task.resume()
    }

    private func finished() { lock.lock(); open = nil; lock.unlock() }

    /// POSTs [body] and hands each server-sent event's data to [onEvent] as it arrives.
    private func stream(_ url: String, _ body: Data, _ onEvent: @escaping (String) -> Void) async throws {
        var req = URLRequest(url: URL(string: url)!)
        req.httpMethod = "POST"
        req.setValue(apiKey, forHTTPHeaderField: "x-goog-api-key")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = body
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
                let d = StreamDelegate(onEvent: onEvent) { [weak self] code, errBody, error in
                    self?.finished()
                    if let error {
                        if self?.isCancelled ?? true || (error as? URLError)?.code == .cancelled { cont.resume(throwing: TranscribeError("Cancelled")) }
                        else { cont.resume(throwing: TranscribeError("Lost the connection to Gemini (\(error.localizedDescription))")) }
                    } else if !(200..<300).contains(code) {
                        cont.resume(throwing: HttpError(code: code, body: String(decoding: errBody, as: UTF8.self)))
                    } else {
                        cont.resume()
                    }
                }
                let task = session(d, readTimeout: 180).dataTask(with: req)
                do { try start(task) } catch { cont.resume(throwing: error) }
            }
        } onCancel: { [weak self] in self?.cancel() }
    }

    private struct Response {
        let body: Data
        let headers: [String: String]
    }

    private func request(_ url: String, _ method: String, _ body: Data?, _ type: String?, _ headers: [String: String]) async throws -> Response {
        var req = URLRequest(url: URL(string: url)!)
        req.httpMethod = method
        req.setValue(apiKey, forHTTPHeaderField: "x-goog-api-key")
        for (k, v) in headers { req.setValue(v, forHTTPHeaderField: k) }
        if let body {
            if let type { req.setValue(type, forHTTPHeaderField: "Content-Type") }
            req.httpBody = body
        }
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Response, Error>) in
                let s = session(nil, readTimeout: 300)
                let task = s.dataTask(with: req) { [weak self] data, response, error in
                    self?.finished()
                    s.finishTasksAndInvalidate()
                    if let error {
                        if self?.isCancelled ?? true || (error as? URLError)?.code == .cancelled { cont.resume(throwing: TranscribeError("Cancelled")) }
                        else { cont.resume(throwing: TranscribeError("No connection to Gemini (\(error.localizedDescription))")) }
                        return
                    }
                    let http = response as? HTTPURLResponse
                    let code = http?.statusCode ?? 0
                    let text = data ?? Data()
                    if !(200..<300).contains(code) { cont.resume(throwing: HttpError(code: code, body: String(decoding: text, as: UTF8.self))); return }
                    var h: [String: String] = [:]
                    for (k, v) in http?.allHeaderFields ?? [:] { if let k = k as? String { h[k.lowercased()] = "\(v)" } }
                    cont.resume(returning: Response(body: text, headers: h))
                }
                do { try start(task) } catch { cont.resume(throwing: error) }
            }
        } onCancel: { [weak self] in self?.cancel() }
    }

    /// Files API: resumable upload in one go; returns the file's URI.
    private func upload(_ audio: ClipAudio) async throws -> String {
        let meta = try JSONSerialization.data(withJSONObject: ["file": ["displayName": "filmcam-audio"]])
        let start = try await request("\(GeminiTranscriber.BASE)/upload/v1beta/files", "POST", meta, "application/json", [
            "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start",
            "X-Goog-Upload-Header-Content-Length": String(audio.bytes.count),
            "X-Goog-Upload-Header-Content-Type": audio.mime,
        ])
        guard let url = start.headers["x-goog-upload-url"] else { throw TranscribeError("Upload refused") }
        let done = try await request(url, "POST", audio.bytes, audio.mime,
                                     ["X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize"])
        guard let o = (try? JSONSerialization.jsonObject(with: done.body)) as? [String: Any], let file = o["file"] as? [String: Any],
              let name = file["name"] as? String, let uri = file["uri"] as? String else { throw TranscribeError("Upload refused") }
        var state = (file["state"] as? String) ?? ""
        var tries = 0
        while state == "PROCESSING" && tries < 60 {
            tries += 1
            try await Task.sleep(nanoseconds: 1_000_000_000)
            let r = try await request("\(GeminiTranscriber.BASE)/v1beta/\(name)", "GET", nil, nil, [:])
            state = ((try? JSONSerialization.jsonObject(with: r.body)) as? [String: Any])?["state"] as? String ?? ""
        }
        if state == "FAILED" { throw TranscribeError("Gemini couldn't read the sound") }
        return uri
    }

    // ------------------------------------------------------------------ prompt and reply

    private static let SCHEMA = """
        {"type":"OBJECT","properties":{"cues":{"type":"ARRAY","items":{"type":"OBJECT","properties":{
          "start":{"type":"NUMBER","description":"seconds from the start of the audio"},
          "end":{"type":"NUMBER","description":"seconds from the start of the audio"},
          "language":{"type":"STRING","description":"ISO 639-1 code of the language spoken"},
          "spoken":{"type":"STRING","description":"the words as spoken, in that language's own script"},
          "english":{"type":"STRING"},
          "telugu":{"type":"STRING","description":"in Telugu script"}},
          "required":["start","end","language","spoken","english","telugu"]}}},"required":["cues"]}
        """

    /// The response schema sent with the request.
    static var schema: [String: Any] {
        (try? JSONSerialization.jsonObject(with: Data(SCHEMA.utf8))) as? [String: Any] ?? [:]
    }

    static func prompt(_ durationMs: Int64, schemaInRequest: Bool) -> String {
        var s = "You write subtitles. Transcribe every word spoken in this audio"
        s += " (it is \(String(format: "%.1f", Double(durationMs) / 1000.0)) seconds long) and split it into subtitle cues.\n"
        s += "Rules:\n"
        s += "- Each cue: start and end in seconds from the beginning of the audio, matching when the words are said; 1 to 6 seconds; at most about 80 characters; break at natural pauses; in order; no overlaps.\n"
        s += "- spoken: exactly what was said, in the script of the language spoken (Telugu in Telugu script, English in Latin letters; keep English words that are mixed into Telugu speech as they were said).\n"
        s += "- language: the ISO 639-1 code of the main language of that cue (te, en, hi, ...).\n"
        s += "- english: a natural English subtitle for the cue (the same words if they spoke English).\n"
        s += "- telugu: a natural Telugu subtitle for the cue in Telugu script (the same words if they spoke Telugu).\n"
        s += "- Only real speech: no sound descriptions; write [inaudible] for words you cannot make out. If nobody speaks, return no cues.\n"
        if !schemaInRequest {
            s += "Reply with only JSON in this form: {\"cues\":[{\"start\":0.0,\"end\":2.4,\"language\":\"te\",\"spoken\":\"...\",\"english\":\"...\",\"telugu\":\"...\"}]}"
        }
        return s
    }

    /// Cues from the model's reply (JSON, possibly wrapped in a code fence or bare as an array).
    /// Not yet tidied: [SubtitleTrack.clean] does that.
    static func parseCues(_ text: String) throws -> [Cue] {
        var t = Kt.trim(text)
        if t.hasPrefix("```json") { t.removeFirst(7) } else if t.hasPrefix("```") { t.removeFirst(3) }
        if t.hasSuffix("```") { t.removeLast(3) }
        t = Kt.trim(t)
        let unreadable = TranscribeError("Gemini's reply wasn't readable")
        let arr: [Any]
        if t.hasPrefix("[") {
            guard let a = (try? JSONSerialization.jsonObject(with: Data(t.utf8))) as? [Any] else { throw unreadable }
            arr = a
        } else {
            guard let start = t.firstIndex(of: "{"), let end = t.lastIndex(of: "}"), start < end,
                  let o = (try? JSONSerialization.jsonObject(with: Data(t[start...end].utf8))) as? [String: Any] else { throw unreadable }
            arr = (o["cues"] as? [Any]) ?? []
        }
        return try arr.map { item in
            guard let o = item as? [String: Any] else { throw unreadable }
            func str(_ k: String) -> String { (o[k] as? String) ?? "" }
            let lang = String(str("language").lowercased().prefix(5))
            let spoken = str("spoken")
            var en = str("english")
            var te = str("telugu")
            if Kt.isBlank(en) && lang.hasPrefix("en") { en = spoken }
            if Kt.isBlank(te) && lang.hasPrefix("te") { te = spoken }
            return Cue(SubtitleTrack.parseTime(o["start"]), SubtitleTrack.parseTime(o["end"]), lang, Kt.trim(en), Kt.trim(te))
        }
    }
}

#if canImport(AVFoundation)
import AVFoundation
import CoreMedia

extension AudioExtract {
    /// The clip's sound as 16 kHz mono 16-bit little-endian PCM; nil when it has no sound.
    /// AVFoundation resamples and mixes down (Android picks the nearest sample; speech
    /// needs nothing finer either way).
    static func decodeMono16k(_ url: URL) async throws -> Data? {
        let asset = AVURLAsset(url: url)
        let tracks = try await asset.loadTracks(withMediaType: .audio)
        guard !tracks.isEmpty else { return nil }
        let reader = try AVAssetReader(asset: asset)
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVSampleRateKey: 16_000,
            AVNumberOfChannelsKey: 1,
            AVLinearPCMBitDepthKey: 16,
            AVLinearPCMIsFloatKey: false,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsNonInterleaved: false,
        ]
        let output = AVAssetReaderAudioMixOutput(audioTracks: [tracks[0]], audioSettings: settings)
        output.alwaysCopiesSampleData = false
        guard reader.canAdd(output) else { throw TranscribeError("Couldn't read the clip's sound") }
        reader.add(output)
        guard reader.startReading() else { throw reader.error ?? TranscribeError("Couldn't read the clip's sound") }
        var out = Data()
        while let sb = output.copyNextSampleBuffer() {
            guard let bb = CMSampleBufferGetDataBuffer(sb) else { continue }
            let len = CMBlockBufferGetDataLength(bb)
            if len == 0 { continue }
            let at = out.count
            out.count += len
            let status = out.withUnsafeMutableBytes { p in
                CMBlockBufferCopyDataBytes(bb, atOffset: 0, dataLength: len, destination: p.baseAddress! + at)
            }
            if status != kCMBlockBufferNoErr { out.count = at }
        }
        if reader.status == .failed { throw reader.error ?? TranscribeError("Couldn't read the clip's sound") }
        return out
    }

    /// The clip's sound as 16 kHz mono samples, -1..1 (for aligning words); nil without sound.
    static func pcm16k(_ url: URL) async throws -> [Float]? {
        guard let pcm = try await decodeMono16k(url) else { return nil }
        return floats(pcm)
    }

    /// The clip's sound to send to Gemini: 16 kHz mono WAV (about 1.9 MB a minute); nil
    /// without sound. (Android copies AAC tracks as ADTS instead; WAV works for any clip.)
    static func extract(_ url: URL) async throws -> ClipAudio? {
        guard let pcm = try await decodeMono16k(url) else { return nil }
        return ClipAudio(bytes: wav(pcm, rate: 16_000), mime: "audio/wav")
    }

    /// The clip's length in milliseconds.
    static func durationMs(_ url: URL) async throws -> Int64 {
        let d = try await AVURLAsset(url: url).load(.duration)
        let s = CMTimeGetSeconds(d)
        return s.isFinite ? Int64(s * 1000) : 0
    }
}
#endif

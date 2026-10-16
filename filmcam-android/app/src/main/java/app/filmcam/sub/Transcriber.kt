package app.filmcam.sub

import android.content.Context
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import android.util.Base64
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteBuffer
import java.nio.ByteOrder
import org.json.JSONArray
import org.json.JSONObject

/** The sound of a clip, ready to send: bytes and their MIME type. */
class ClipAudio(val bytes: ByteArray, val mime: String)

object AudioExtract {
    /**
     * The clip's sound track: AAC copied as it is (ADTS framed, no re-encoding), anything else
     * decoded and sent as 16 kHz mono WAV. Null when the clip has no sound.
     */
    fun extract(context: Context, uri: Uri): ClipAudio? {
        val ex = MediaExtractor()
        try {
            ex.setDataSource(context, uri, null)
            val track = (0 until ex.trackCount).firstOrNull { ex.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true }
                ?: return null
            val format = ex.getTrackFormat(track)
            ex.selectTrack(track)
            val mime = format.getString(MediaFormat.KEY_MIME)!!
            val csd = format.getByteBuffer("csd-0")
            return if (mime == MediaFormat.MIMETYPE_AUDIO_AAC && csd != null && csd.remaining() >= 2) {
                copyAac(ex, csd)
            } else {
                decodeToWav(ex, format)
            }
        } finally {
            ex.release()
        }
    }

    private fun copyAac(ex: MediaExtractor, csd: ByteBuffer): ClipAudio {
        val b0 = csd.get(0).toInt() and 0xFF
        val b1 = csd.get(1).toInt() and 0xFF
        val objectType = b0 shr 3
        val freqIndex = ((b0 and 7) shl 1) or (b1 shr 7)
        val channels = (b1 shr 3) and 0xF
        val out = ByteArrayOutputStream()
        val buf = ByteBuffer.allocate(1 shl 16)
        while (true) {
            buf.clear()
            val n = ex.readSampleData(buf, 0)
            if (n < 0) break
            out.write(adtsHeader(n, objectType, freqIndex, channels))
            out.write(buf.array(), 0, n)
            ex.advance()
        }
        return ClipAudio(out.toByteArray(), "audio/aac")
    }

    /** The 7-byte ADTS header in front of each raw AAC frame. */
    fun adtsHeader(payload: Int, objectType: Int, freqIndex: Int, channels: Int): ByteArray {
        val len = payload + 7
        val profile = (objectType - 1).coerceIn(0, 3)
        return byteArrayOf(
            0xFF.toByte(), 0xF1.toByte(),
            ((profile shl 6) or (freqIndex shl 2) or (channels shr 2)).toByte(),
            (((channels and 3) shl 6) or (len shr 11)).toByte(),
            ((len and 0x7FF) shr 3).toByte(),
            (((len and 7) shl 5) or 0x1F).toByte(),
            0xFC.toByte(),
        )
    }

    private fun decodeToWav(ex: MediaExtractor, format: MediaFormat): ClipAudio {
        val codec = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME)!!)
        codec.configure(format, null, null, 0)
        codec.start()
        val pcm = ByteArrayOutputStream()
        var rate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
        var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
        val info = MediaCodec.BufferInfo()
        var inDone = false
        var outDone = false
        // Mono 16 kHz, resampled by nearest sample (speech needs nothing finer).
        var phase = 0.0
        try {
            while (!outDone) {
                if (!inDone) {
                    val i = codec.dequeueInputBuffer(10_000)
                    if (i >= 0) {
                        val n = ex.readSampleData(codec.getInputBuffer(i)!!, 0)
                        if (n < 0) { codec.queueInputBuffer(i, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM); inDone = true }
                        else { codec.queueInputBuffer(i, 0, n, ex.sampleTime, 0); ex.advance() }
                    }
                }
                val o = codec.dequeueOutputBuffer(info, 10_000)
                if (o == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    rate = codec.outputFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
                    channels = codec.outputFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
                } else if (o >= 0) {
                    val b = codec.getOutputBuffer(o)!!.order(ByteOrder.LITTLE_ENDIAN)
                    b.position(info.offset)
                    val frames = info.size / 2 / channels
                    val step = rate / 16_000.0
                    val s = b.asShortBuffer()
                    while (phase < frames) {
                        val f = phase.toInt()
                        var sum = 0
                        for (c in 0 until channels) sum += s.get(f * channels + c)
                        val v = sum / channels
                        pcm.write(v and 0xFF); pcm.write((v shr 8) and 0xFF)
                        phase += step
                    }
                    phase -= frames
                    codec.releaseOutputBuffer(o, false)
                    if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) outDone = true
                }
            }
        } finally {
            runCatching { codec.stop() }
            codec.release()
        }
        return ClipAudio(wav(pcm.toByteArray(), 16_000), "audio/wav")
    }

    private fun wav(pcm: ByteArray, rate: Int): ByteArray {
        val h = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
        h.put("RIFF".toByteArray()).putInt(36 + pcm.size).put("WAVE".toByteArray())
        h.put("fmt ".toByteArray()).putInt(16).putShort(1).putShort(1).putInt(rate).putInt(rate * 2).putShort(2).putShort(16)
        h.put("data".toByteArray()).putInt(pcm.size)
        return h.array() + pcm
    }
}

class TranscribeException(message: String) : Exception(message)

/**
 * Speech to subtitles with Google's Gemini API: the clip's sound goes up with a request for
 * timed cues, each in the language spoken plus English and Telugu (Telugu script), so the
 * same transcript serves either language. Uses the person's own API key.
 */
class GeminiTranscriber(private val apiKey: String, private val model: String) {
    @Volatile private var cancelled = false
    @Volatile private var open: HttpURLConnection? = null

    /** Stops a transcription in progress (from any thread). */
    fun cancel() {
        cancelled = true
        open?.disconnect()
    }

    /**
     * Transcribes [audio] of a [durationMs] clip. Blocks; call off the main thread.
     * [onText] gets the reply so far as it streams in (for showing progress).
     */
    fun transcribe(audio: ClipAudio, durationMs: Long, onStatus: (String) -> Unit, onText: (String) -> Unit = {}): List<Cue> {
        val part = if (audio.bytes.size > INLINE_LIMIT) {
            onStatus("Uploading sound")
            JSONObject().put("fileData", JSONObject().put("mimeType", audio.mime).put("fileUri", upload(audio)))
        } else {
            JSONObject().put("inlineData", JSONObject().put("mimeType", audio.mime)
                .put("data", Base64.encodeToString(audio.bytes, Base64.NO_WRAP)))
        }
        onStatus("Listening")
        // Ask for little "thinking" (transcription doesn't need it, and it can take minutes),
        // with the JSON schema; step back from either if this model or endpoint refuses it.
        val attempts = listOf(true to true, false to true, false to false)
        var last: HttpError? = null
        for ((thinkingLow, schema) in attempts) {
            if (cancelled) throw TranscribeException("Cancelled")
            try {
                val text = generate(part, durationMs, schema, thinkingLow, onText)
                return SubtitleTrack.clean(parseCues(text), durationMs)
            } catch (e: HttpError) {
                last = e
                if (e.code != 400 || e.body.contains("API key", true)) throw e.readable(model)
            }
        }
        throw last!!.readable(model)
    }

    /** Streams the reply (server-sent events) and returns its whole text. */
    private fun generate(audioPart: JSONObject, durationMs: Long, withSchema: Boolean, thinkingLow: Boolean, onText: (String) -> Unit): String {
        val config = JSONObject().put("temperature", 0.2).put("responseMimeType", "application/json")
        if (withSchema) config.put("responseSchema", SCHEMA)
        if (thinkingLow) config.put("thinkingConfig", JSONObject().put("thinkingLevel", "low"))
        val body = JSONObject()
            .put("contents", JSONArray().put(JSONObject().put("role", "user").put("parts",
                JSONArray().put(audioPart).put(JSONObject().put("text", prompt(durationMs, withSchema))))))
            .put("generationConfig", config)
        val text = StringBuilder()
        var blocked: String? = null
        stream("$BASE/v1beta/models/$model:streamGenerateContent?alt=sse", body.toString().toByteArray()) { event ->
            val json = runCatching { JSONObject(event) }.getOrNull() ?: return@stream
            json.optJSONObject("promptFeedback")?.optString("blockReason")?.takeIf { it.isNotEmpty() }?.let { blocked = it }
            val parts = json.optJSONArray("candidates")?.optJSONObject(0)?.optJSONObject("content")?.optJSONArray("parts") ?: return@stream
            for (i in 0 until parts.length()) {
                val p = parts.getJSONObject(i)
                if (!p.optBoolean("thought", false)) text.append(p.optString("text"))
            }
            onText(text.toString())
        }
        if (text.isEmpty()) throw TranscribeException(blocked?.let { "Gemini declined: $it" } ?: "Gemini sent no transcript")
        return text.toString()
    }

    /** POSTs [body] and hands each server-sent event's data to [onEvent] as it arrives. */
    private fun stream(url: String, body: ByteArray, onEvent: (String) -> Unit) {
        val c = URL(url).openConnection() as HttpURLConnection
        open = c
        try {
            c.requestMethod = "POST"
            c.connectTimeout = 30_000
            c.readTimeout = 180_000
            c.setRequestProperty("x-goog-api-key", apiKey)
            c.setRequestProperty("Content-Type", "application/json")
            c.doOutput = true
            c.setFixedLengthStreamingMode(body.size)
            c.outputStream.use { it.write(body) }
            val code = c.responseCode
            if (code !in 200..299) throw HttpError(code, c.errorStream?.use { it.readBytes().decodeToString() } ?: "")
            c.inputStream.bufferedReader().use { r ->
                val data = StringBuilder()
                while (true) {
                    val line = r.readLine() ?: break
                    if (line.startsWith("data:")) data.append(line.removePrefix("data:").trim())
                    else if (line.isEmpty() && data.isNotEmpty()) { onEvent(data.toString()); data.setLength(0) }
                }
                if (data.isNotEmpty()) onEvent(data.toString())
            }
        } catch (e: HttpError) {
            throw e
        } catch (e: IOException) {
            if (cancelled) throw TranscribeException("Cancelled")
            throw TranscribeException("Lost the connection to Gemini (${e.message ?: "network error"})")
        } finally {
            open = null
            c.disconnect()
        }
    }

    /** Files API: resumable upload in one go; returns the file's URI. */
    private fun upload(audio: ClipAudio): String {
        val start = request("$BASE/upload/v1beta/files", "POST",
            JSONObject().put("file", JSONObject().put("displayName", "filmcam-audio")).toString().toByteArray(), "application/json",
            mapOf(
                "X-Goog-Upload-Protocol" to "resumable", "X-Goog-Upload-Command" to "start",
                "X-Goog-Upload-Header-Content-Length" to audio.bytes.size.toString(),
                "X-Goog-Upload-Header-Content-Type" to audio.mime,
            ))
        val url = start.headers["x-goog-upload-url"] ?: throw TranscribeException("Upload refused")
        val done = request(url, "POST", audio.bytes, audio.mime,
            mapOf("X-Goog-Upload-Offset" to "0", "X-Goog-Upload-Command" to "upload, finalize"))
        val file = JSONObject(done.body).getJSONObject("file")
        var state = file.optString("state")
        val name = file.getString("name")
        var tries = 0
        while (state == "PROCESSING" && tries++ < 60) {
            Thread.sleep(1000)
            state = JSONObject(request("$BASE/v1beta/$name", "GET", null, null, emptyMap()).body).optString("state")
        }
        if (state == "FAILED") throw TranscribeException("Gemini couldn't read the sound")
        return file.getString("uri")
    }

    private class Response(val body: String, val headers: Map<String, String>)
    private class HttpError(val code: Int, val body: String) : IOException("HTTP $code") {
        fun readable(model: String): TranscribeException {
            val msg = runCatching { JSONObject(body).getJSONObject("error").getString("message") }.getOrDefault(body.take(200))
            return TranscribeException(when (code) {
                400 -> if (msg.contains("API key", true)) "That API key isn't valid" else "Gemini: $msg"
                401, 403 -> "The API key was refused: $msg"
                404 -> "Model \"$model\" isn't available. Change it under Subtitles settings."
                429 -> "Gemini's free limit is used up for now. Try again in a minute."
                else -> "Gemini error $code: $msg"
            })
        }
    }

    private fun request(url: String, method: String, body: ByteArray?, type: String?, headers: Map<String, String>): Response {
        val c = URL(url).openConnection() as HttpURLConnection
        open = c
        try {
            c.requestMethod = method
            c.connectTimeout = 30_000
            c.readTimeout = 300_000
            c.setRequestProperty("x-goog-api-key", apiKey)
            headers.forEach { (k, v) -> c.setRequestProperty(k, v) }
            if (body != null) {
                c.doOutput = true
                if (type != null) c.setRequestProperty("Content-Type", type)
                c.setFixedLengthStreamingMode(body.size)
                c.outputStream.use { it.write(body) }
            }
            val code = c.responseCode
            val text = (if (code in 200..299) c.inputStream else c.errorStream)?.use { it.readBytes().decodeToString() } ?: ""
            if (code !in 200..299) throw HttpError(code, text)
            val h = c.headerFields.filterKeys { it != null }.mapKeys { it.key.lowercase() }.mapValues { it.value.firstOrNull() ?: "" }
            return Response(text, h)
        } catch (e: HttpError) {
            throw e
        } catch (e: IOException) {
            if (cancelled) throw TranscribeException("Cancelled")
            throw TranscribeException("No connection to Gemini (${e.message ?: "network error"})")
        } finally {
            open = null
            c.disconnect()
        }
    }

    companion object {
        const val DEFAULT_MODEL = "gemini-3.8-flash"
        /** Quicker and cheaper; a little less exact on Telugu. */
        const val FAST_MODEL = "gemini-3.5-flash-lite"
        private const val BASE = "https://generativelanguage.googleapis.com"
        /** Inline audio above this goes through the Files API (the request limit is 20 MB, base64 adds a third). */
        private const val INLINE_LIMIT = 13 * 1024 * 1024

        private val SCHEMA: JSONObject = JSONObject("""
            {"type":"OBJECT","properties":{"cues":{"type":"ARRAY","items":{"type":"OBJECT","properties":{
              "start":{"type":"NUMBER","description":"seconds from the start of the audio"},
              "end":{"type":"NUMBER","description":"seconds from the start of the audio"},
              "language":{"type":"STRING","description":"ISO 639-1 code of the language spoken"},
              "spoken":{"type":"STRING","description":"the words as spoken, in that language's own script"},
              "english":{"type":"STRING"},
              "telugu":{"type":"STRING","description":"in Telugu script"}},
              "required":["start","end","language","spoken","english","telugu"]}}},"required":["cues"]}
        """.trimIndent())

        fun prompt(durationMs: Long, schemaInRequest: Boolean): String = buildString {
            append("You write subtitles. Transcribe every word spoken in this audio")
            append(" (it is ${"%.1f".format(durationMs / 1000.0)} seconds long) and split it into subtitle cues.\n")
            append("Rules:\n")
            append("- Each cue: start and end in seconds from the beginning of the audio, matching when the words are said; 1 to 6 seconds; at most about 80 characters; break at natural pauses; in order; no overlaps.\n")
            append("- spoken: exactly what was said, in the script of the language spoken (Telugu in Telugu script, English in Latin letters; keep English words that are mixed into Telugu speech as they were said).\n")
            append("- language: the ISO 639-1 code of the main language of that cue (te, en, hi, ...).\n")
            append("- english: a natural English subtitle for the cue (the same words if they spoke English).\n")
            append("- telugu: a natural Telugu subtitle for the cue in Telugu script (the same words if they spoke Telugu).\n")
            append("- Only real speech: no sound descriptions; write [inaudible] for words you cannot make out. If nobody speaks, return no cues.\n")
            if (!schemaInRequest) {
                append("Reply with only JSON in this form: {\"cues\":[{\"start\":0.0,\"end\":2.4,\"language\":\"te\",\"spoken\":\"...\",\"english\":\"...\",\"telugu\":\"...\"}]}")
            }
        }

        /** Cues from the model's reply (JSON, possibly wrapped in a code fence or bare as an array). */
        fun parseCues(text: String): List<Cue> {
            val t = text.trim().removePrefix("```json").removePrefix("```").removeSuffix("```").trim()
            val arr = when {
                t.startsWith("[") -> JSONArray(t)
                else -> {
                    val start = t.indexOf('{')
                    val end = t.lastIndexOf('}')
                    if (start < 0 || end <= start) throw TranscribeException("Gemini's reply wasn't readable")
                    JSONObject(t.substring(start, end + 1)).optJSONArray("cues") ?: JSONArray()
                }
            }
            return List(arr.length()) { i ->
                val o = arr.getJSONObject(i)
                val lang = o.optString("language").lowercase().take(5)
                val spoken = o.optString("spoken")
                var en = o.optString("english")
                var te = o.optString("telugu")
                if (en.isBlank() && lang.startsWith("en")) en = spoken
                if (te.isBlank() && lang.startsWith("te")) te = spoken
                Cue(SubtitleTrack.parseTime(o.opt("start")), SubtitleTrack.parseTime(o.opt("end")), lang, en.trim(), te.trim())
            }
        }
    }
}

package app.filmcam.sub

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.media.AudioFormat
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.os.SystemClock
import android.speech.RecognitionListener
import android.speech.RecognitionService
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.TimeUnit
import kotlin.math.max

/**
 * Live subtitles while recording: the phone's speech recognizer (Google's where installed,
 * Android 13+) listens to the same microphone sound the video records, fed through a pipe at
 * 16 kHz, so it never opens the microphone itself and can't take sound away from the clip.
 *
 * What is heard shows on screen as it comes ([onCaption]) and is kept as timed cues on the
 * clip's clock, so after recording the lines can be fixed, styled and placed before they are
 * burnt in. Nothing is drawn into the video while recording.
 *
 * Main thread, except [feed], which the audio thread calls with each block of PCM.
 */
class LiveCaptioner(private val context: Context) {
    /** The line to show now, or null for none. */
    var onCaption: ((String?) -> Unit)? = null
    /** What the recognizer is doing ("Listening", "Hearing you"...), for the CC pill. */
    var onState: ((String) -> Unit)? = null
    /** Something the person should know (language not available, no network...). */
    var onProblem: ((String) -> Unit)? = null

    private val main = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null
    private var readSide: ParcelFileDescriptor? = null
    private var writeSide: ParcelFileDescriptor? = null
    private val queue = ArrayBlockingQueue<ByteArray>(96)
    @Volatile private var active = false
    private var language = "en-IN"
    /** When the clip started (elapsedRealtime): cue times are on the clip's clock. */
    private var clipStart = 0L
    private val clear = Runnable { onCaption?.invoke(null) }

    /** Brings the recorder's sound down to 16 kHz (audio thread). */
    @Volatile private var decimator = Decimator(48_000, RATE)

    // What has been said (main thread).
    private val cues = ArrayList<Cue>()
    private var pending: String? = null
    private var pendingStart = -1L
    private var failures = 0
    private var reported = false

    companion object {
        /** Live captions need a recognizer that takes its audio from the app (Android 13+). */
        fun supported(context: Context): Boolean =
            Build.VERSION.SDK_INT >= 33 && SpeechRecognizer.isRecognitionAvailable(context)
        private const val TAG = "LiveCaptioner"
        private const val RATE = 16_000
        /** Speech starts a little before the first words come back. */
        private const val LEAD_MS = 500L
        private val GOOGLE = listOf("com.google.android.googlequicksearchbox", "com.google.android.tts", "com.google.android.as")
    }

    /**
     * Starts captioning in [languageTag] ("te-IN", "en-IN") for a clip that began at
     * [clipStartedAt] (elapsedRealtime); PCM at [rate] Hz arrives through [feed].
     */
    fun start(languageTag: String, rate: Int, clipStartedAt: Long) {
        if (Build.VERSION.SDK_INT < 33) { onProblem?.invoke("Live subtitles need Android 13 or newer"); return }
        if (!SpeechRecognizer.isRecognitionAvailable(context)) { onProblem?.invoke("No speech recognition on this phone"); return }
        if (active) endSession()
        language = languageTag
        decimator = Decimator(rate, RATE)
        clipStart = clipStartedAt
        failures = 0
        reported = false
        active = true
        onState?.invoke("Starting")
        session()
    }

    /** Stops listening; returns every line heard since the clip started, in order. */
    fun stop(): List<Cue> {
        commitPending()
        active = false
        main.removeCallbacks(clear)
        endSession()
        onCaption?.invoke(null)
        return cues.toList()
    }

    /** Forgets the lines of the last clip. */
    fun reset() {
        cues.clear()
        pending = null
        pendingStart = -1L
    }

    /** PCM 16-bit mono from the recorder (audio thread). Dropped when the recognizer lags. */
    fun feed(pcm: ByteBuffer, offset: Int, length: Int) {
        if (!active || length < 2) return
        val out = decimator.process(pcm, offset, length)
        if (out.isNotEmpty()) queue.offer(out)
    }

    private fun now() = SystemClock.elapsedRealtime() - clipStart

    private fun session() {
        if (!active || Build.VERSION.SDK_INT < 33) return
        val (read, write) = ParcelFileDescriptor.createPipe()
        // The read side stays open until the session ends: startListening hands the intent to
        // the recognizer later, on its own thread, and a closed descriptor there means silence.
        readSide = read
        writeSide = write
        queue.clear()
        Thread({
            try {
                FileOutputStream(write.fileDescriptor).use { out ->
                    while (active && writeSide === write) {
                        val b = queue.poll(200, TimeUnit.MILLISECONDS) ?: continue
                        out.write(b)
                    }
                }
            } catch (e: Exception) {
                // The recognizer closed its end: the session is over.
            }
        }, "CaptionAudio").start()

        val r = createRecognizer()
        recognizer = r
        r.setRecognitionListener(listener)
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE, read)
            putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_CHANNEL_COUNT, 1)
            putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_ENCODING, AudioFormat.ENCODING_PCM_16BIT)
            putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_SAMPLING_RATE, RATE)
            // One long session that keeps going through pauses, in segments.
            putExtra(RecognizerIntent.EXTRA_SEGMENTED_SESSION, RecognizerIntent.EXTRA_AUDIO_SOURCE)
        }
        try {
            r.startListening(intent)
        } catch (e: Exception) {
            Log.w(TAG, "start", e)
            problem("Live subtitles couldn't start (${e.javaClass.simpleName})")
            active = false
            endSession()
        }
    }

    /** Google's recognizer where it is installed (it takes audio from the app), else the default. */
    private fun createRecognizer(): SpeechRecognizer {
        val services = runCatching {
            context.packageManager.queryIntentServices(Intent(RecognitionService.SERVICE_INTERFACE), 0)
        }.getOrDefault(emptyList())
        val google = GOOGLE.firstNotNullOfOrNull { pkg -> services.firstOrNull { it.serviceInfo.packageName == pkg } }
        Log.i(TAG, "recognizers: ${services.map { it.serviceInfo.packageName }} using ${google?.serviceInfo?.packageName ?: "default"}")
        return if (google != null) {
            SpeechRecognizer.createSpeechRecognizer(context, ComponentName(google.serviceInfo.packageName, google.serviceInfo.name))
        } else {
            SpeechRecognizer.createSpeechRecognizer(context)
        }
    }

    private fun endSession() {
        writeSide?.let { runCatching { it.close() } }
        writeSide = null
        recognizer?.let { runCatching { it.cancel() }; runCatching { it.destroy() } }
        recognizer = null
        readSide?.let { runCatching { it.close() } }
        readSide = null
    }

    /** The session ended (silence, a hiccup): start a fresh one while captions are on. */
    private fun restart() {
        endSession()
        if (!active) return
        // Back off when the recognizer keeps failing, so it isn't hammered.
        val wait = when (failures) { 0, 1 -> 150L; 2, 3 -> 800L; else -> 2500L }
        main.postDelayed({ if (active && recognizer == null) session() }, wait)
    }

    private fun show(text: String?, final: Boolean) {
        if (text.isNullOrBlank()) return
        failures = 0
        val t = text.trim()
        if (pendingStart < 0) pendingStart = max(0L, now() - LEAD_MS).coerceAtLeast(cues.lastOrNull()?.endMs ?: 0L)
        pending = t
        main.removeCallbacks(clear)
        onCaption?.invoke(lastWords(t))
        main.postDelayed(clear, if (final) 2200 else 3500)
        if (final) commitPending()
    }

    /** The line being spoken becomes a cue, from when it was first heard to now. */
    private fun commitPending() {
        val t = pending ?: return
        val start = max(0L, pendingStart)
        val end = max(start + 700, now())
        cues += if (language.startsWith("te")) Cue(start, end, "te", telugu = t) else Cue(start, end, "en", english = t)
        pending = null
        pendingStart = -1L
    }

    /** Long speech keeps only its last ~12 words on screen, like live captions do. */
    private fun lastWords(t: String): String {
        val words = t.split(Regex("\\s+"))
        return if (words.size <= 12) t else words.takeLast(12).joinToString(" ")
    }

    private fun problem(msg: String) {
        onState?.invoke(msg)
        if (!reported) { reported = true; onProblem?.invoke(msg) }
    }

    private fun errorName(e: Int) = when (e) {
        SpeechRecognizer.ERROR_AUDIO -> "audio error"
        SpeechRecognizer.ERROR_CLIENT -> "client error"
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "recognizer busy"
        SpeechRecognizer.ERROR_SERVER_DISCONNECTED -> "service disconnected"
        SpeechRecognizer.ERROR_TOO_MANY_REQUESTS -> "too many requests"
        SpeechRecognizer.ERROR_CANNOT_CHECK_SUPPORT -> "can't check language support"
        else -> "error $e"
    }

    private val listener = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) { onState?.invoke("Listening") }
        override fun onBeginningOfSpeech() { onState?.invoke("Hearing you") }
        override fun onRmsChanged(rmsdB: Float) = Unit
        override fun onBufferReceived(buffer: ByteArray?) = Unit
        override fun onEndOfSpeech() = Unit
        override fun onEvent(eventType: Int, params: Bundle?) = Unit

        override fun onPartialResults(partial: Bundle?) {
            show(partial?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull(), final = false)
        }

        override fun onSegmentResults(segment: Bundle) {
            show(segment.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull(), final = true)
        }

        override fun onEndOfSegmentedSession() = restart()

        override fun onResults(results: Bundle?) {
            show(results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull(), final = true)
            restart()
        }

        override fun onError(error: Int) {
            Log.w(TAG, "error $error")
            when (error) {
                SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED, SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE -> {
                    active = false
                    endSession()
                    problem(if (language.startsWith("te")) "Telugu live subtitles aren't available on this phone. Try English, or Subtitles after recording"
                        else "This language isn't available for live subtitles on this phone")
                }
                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> { active = false; endSession(); problem("Speech recognition isn't allowed") }
                SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT, SpeechRecognizer.ERROR_SERVER -> {
                    failures++
                    problem("Live subtitles need an internet connection")
                    restart()
                }
                // Silence or nothing understood: just keep listening.
                SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> restart()
                else -> {
                    failures++
                    if (failures >= 3) problem("Live subtitles: ${errorName(error)}")
                    restart()
                }
            }
        }
    }
}

/**
 * Lowers the sample rate of 16-bit little-endian mono PCM by averaging the samples that fall
 * in each output period (a box filter: enough for speech). Keeps its place between blocks.
 */
class Decimator(private val inRate: Int, private val outRate: Int) {
    private var acc = 0L
    private var count = 0
    private var phase = 0

    fun process(pcm: ByteBuffer, offset: Int, length: Int): ByteArray {
        val src = pcm.duplicate().order(ByteOrder.LITTLE_ENDIAN)
        src.position(offset)
        val n = length / 2
        val out = ByteBuffer.allocate((n.toLong() * outRate / inRate + 2).toInt() * 2).order(ByteOrder.LITTLE_ENDIAN)
        repeat(n) {
            acc += src.short
            count++
            phase += outRate
            if (phase >= inRate) {
                phase -= inRate
                if (out.remaining() >= 2) out.putShort((acc / count).toInt().toShort())
                acc = 0
                count = 0
            }
        }
        return out.array().copyOf(out.position())
    }
}

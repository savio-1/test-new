package app.filmcam.sub

import android.content.Context
import android.content.Intent
import android.media.AudioFormat
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import java.io.FileOutputStream
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.TimeUnit

/**
 * Live captions while recording: the phone's speech recognizer (Google's, on Android 13+)
 * listens to the same microphone audio the video records, fed through a pipe, so it never
 * opens the microphone itself and can't take sound away from the clip. Partial results show
 * as they are heard; a line stays up briefly after the speaker stops.
 *
 * Main thread, except [feed], which the audio thread calls with each block of PCM.
 */
class LiveCaptioner(private val context: Context) {
    /** The caption to show now, or null for none. */
    var onCaption: ((String?) -> Unit)? = null
    /** Something the person should know ("Telugu isn't available...", errors). */
    var onProblem: ((String) -> Unit)? = null

    private val main = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null
    private var writeSide: ParcelFileDescriptor? = null
    private var writer: Thread? = null
    private val queue = ArrayBlockingQueue<ByteArray>(64)
    @Volatile private var active = false
    private var language = "en-IN"
    private var sampleRate = 48_000
    private val clear = Runnable { onCaption?.invoke(null) }

    companion object {
        /** Live captions need a recognizer that takes its audio from the app (Android 13+). */
        fun supported(context: Context): Boolean =
            Build.VERSION.SDK_INT >= 33 && SpeechRecognizer.isRecognitionAvailable(context)
        private const val TAG = "LiveCaptioner"
    }

    /** Starts captioning in [languageTag] ("te-IN", "en-IN"); audio arrives through [feed]. */
    fun start(languageTag: String, rate: Int) {
        if (Build.VERSION.SDK_INT < 33) { onProblem?.invoke("Live subtitles need Android 13 or newer"); return }
        if (!SpeechRecognizer.isRecognitionAvailable(context)) { onProblem?.invoke("No speech recognition on this phone"); return }
        stop()
        language = languageTag
        sampleRate = rate
        active = true
        session()
    }

    fun stop() {
        active = false
        main.removeCallbacks(clear)
        endSession()
        onCaption?.invoke(null)
    }

    /** PCM 16-bit mono from the recorder (audio thread). Dropped when the recognizer lags. */
    fun feed(pcm: java.nio.ByteBuffer, offset: Int, length: Int) {
        if (!active || length <= 0) return
        val b = ByteArray(length)
        val dup = pcm.duplicate()
        dup.position(offset)
        dup.get(b, 0, length)
        queue.offer(b)
    }

    private fun session() {
        if (!active || Build.VERSION.SDK_INT < 33) return
        val (read, write) = ParcelFileDescriptor.createPipe()
        writeSide = write
        queue.clear()
        writer = Thread({
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
        }, "CaptionAudio").apply { start() }

        val r = SpeechRecognizer.createSpeechRecognizer(context)
        recognizer = r
        r.setRecognitionListener(listener)
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE, read)
            putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_CHANNEL_COUNT, 1)
            putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_ENCODING, AudioFormat.ENCODING_PCM_16BIT)
            putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_SAMPLING_RATE, sampleRate)
            // One long session that keeps going through pauses, in segments.
            putExtra(RecognizerIntent.EXTRA_SEGMENTED_SESSION, RecognizerIntent.EXTRA_AUDIO_SOURCE)
        }
        try {
            r.startListening(intent)
        } catch (e: Exception) {
            Log.w(TAG, "start", e)
            onProblem?.invoke("Live subtitles couldn't start")
            active = false
        }
        read.close()
    }

    private fun endSession() {
        writeSide?.let { runCatching { it.close() } }
        writeSide = null
        writer = null
        recognizer?.let { runCatching { it.cancel() }; runCatching { it.destroy() } }
        recognizer = null
    }

    /** The session ended (silence, a hiccup): start a fresh one while captions are on. */
    private fun restart() {
        endSession()
        if (active) main.postDelayed({ if (active && recognizer == null) session() }, 150)
    }

    private fun show(text: String?, final: Boolean) {
        if (text.isNullOrBlank()) return
        main.removeCallbacks(clear)
        onCaption?.invoke(lastWords(text.trim()))
        main.postDelayed(clear, if (final) 2200 else 3500)
    }

    /** Long speech keeps only its last ~12 words on screen, like live captions do. */
    private fun lastWords(t: String): String {
        val words = t.split(Regex("\\s+"))
        return if (words.size <= 12) t else words.takeLast(12).joinToString(" ")
    }

    private val listener = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) = Unit
        override fun onBeginningOfSpeech() = Unit
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
            when (error) {
                SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED, SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE -> {
                    active = false
                    endSession()
                    onProblem?.invoke(if (language.startsWith("te")) "Telugu live subtitles aren't available on this phone (try English, or Subtitles after recording)"
                        else "This language isn't available for live subtitles on this phone")
                }
                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> { active = false; endSession(); onProblem?.invoke("Speech recognition isn't allowed") }
                SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT, SpeechRecognizer.ERROR_SERVER -> {
                    onProblem?.invoke("Live subtitles need an internet connection")
                    restart()
                }
                // No match, silence, busy, client hiccups: just keep listening.
                else -> restart()
            }
        }
    }
}

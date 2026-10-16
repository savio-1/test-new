package app.filmcam.record

import android.content.Context
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import android.util.Log
import android.view.Surface
import app.filmcam.gl.FilmEngine
import app.filmcam.util.MediaSaver
import app.filmcam.util.VideoInfo
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit
import kotlin.math.max

private fun videoTrack(ex: MediaExtractor): Int =
    (0 until ex.trackCount).firstOrNull { ex.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("video/") == true } ?: -1

private fun audioTrack(ex: MediaExtractor): Int =
    (0 until ex.trackCount).firstOrNull { ex.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true } ?: -1

/**
 * Plays an imported clip into the film pipeline for the edit preview: decoded straight into
 * the engine's input surface in real time, looping, without sound.
 */
class PreviewPlayer(private val context: Context, private val uri: Uri, private val surface: Surface) {
    @Volatile private var running = true
    private val thread = Thread({ loop() }, "PreviewPlayer")

    fun start() = thread.start()

    fun stop() {
        running = false
        runCatching { thread.join(1500) }
    }

    private fun loop() {
        val ex = MediaExtractor()
        var codec: MediaCodec? = null
        try {
            ex.setDataSource(context, uri, null)
            val track = videoTrack(ex)
            if (track < 0) return
            ex.selectTrack(track)
            val format = ex.getTrackFormat(track)
            val c = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME)!!)
            codec = c
            c.configure(format, surface, null, 0)
            c.start()
            val info = MediaCodec.BufferInfo()
            var inputDone = false
            var clockStart = -1L
            var firstPts = 0L
            while (running) {
                if (!inputDone) {
                    val i = c.dequeueInputBuffer(5_000)
                    if (i >= 0) {
                        val n = ex.readSampleData(c.getInputBuffer(i)!!, 0)
                        if (n < 0) {
                            c.queueInputBuffer(i, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                            inputDone = true
                        } else {
                            c.queueInputBuffer(i, 0, n, ex.sampleTime, 0)
                            ex.advance()
                        }
                    }
                }
                val o = c.dequeueOutputBuffer(info, 5_000)
                if (o >= 0) {
                    val eos = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
                    if (info.size > 0) {
                        if (clockStart < 0) { clockStart = System.nanoTime(); firstPts = info.presentationTimeUs }
                        // Hold each frame until its time comes.
                        val due = clockStart + (info.presentationTimeUs - firstPts) * 1000L
                        while (running) {
                            val wait = due - System.nanoTime()
                            if (wait <= 0) break
                            Thread.sleep(minOf(wait / 1_000_000L, 20L).coerceAtLeast(1L))
                        }
                    }
                    c.releaseOutputBuffer(o, info.size > 0)
                    if (eos) {
                        // Loop.
                        ex.seekTo(0, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)
                        c.flush()
                        inputDone = false
                        clockStart = -1L
                    }
                }
            }
        } catch (e: Exception) {
            Log.w("PreviewPlayer", "loop", e)
        } finally {
            runCatching { codec?.stop() }
            runCatching { codec?.release() }
            runCatching { ex.release() }
        }
    }
}

/**
 * Develops an imported clip with the current look: every frame is decoded into the engine,
 * rendered through the film pipeline into an encoder, one frame at a time, and the clip's
 * own sound is copied across untouched. Runs on its own thread.
 */
class VideoExporter(
    private val context: Context,
    private val uri: Uri,
    private val info: VideoInfo,
    private val engine: FilmEngine,
    private val onProgress: (Float) -> Unit,
    private val onDone: (Uri?) -> Unit,
) {
    @Volatile private var cancelled = false

    fun cancel() { cancelled = true }

    fun start() = Thread({ run() }, "VideoExporter").start()

    private fun run() {
        val ex = MediaExtractor()
        var decoder: MediaCodec? = null
        var recorder: VideoRecorder? = null
        var out: Uri? = null
        val finished = Semaphore(0)
        var ok = false
        try {
            ex.setDataSource(context, uri, null)
            val vt = videoTrack(ex)
            if (vt < 0) throw IllegalStateException("no video track")
            ex.selectTrack(vt)
            val vf = ex.getTrackFormat(vt)
            val durationUs = if (vf.containsKey(MediaFormat.KEY_DURATION)) vf.getLong(MediaFormat.KEY_DURATION) else info.durationMs * 1000L
            val fps = if (vf.containsKey(MediaFormat.KEY_FRAME_RATE)) runCatching { vf.getInteger(MediaFormat.KEY_FRAME_RATE) }
                .getOrElse { vf.getFloat(MediaFormat.KEY_FRAME_RATE).toInt() } else 30

            // The encoder buffer is landscape; a portrait picture is turned by the rotation flag.
            val frame = engine.frameSizeFor(info.uprightW, info.uprightH)
            val portrait = frame.height > frame.width
            val choice = VideoRecorder.choose(max(frame.width, frame.height), minOf(frame.width, frame.height), fps.coerceIn(1, 120))
            val target = MediaSaver.createVideo(context) ?: throw IllegalStateException("can't create file")
            out = target.first

            val at = audioTrack(ex)
            val audio = if (at >= 0) AudioCopy({ MediaExtractor().apply { setDataSource(context, uri, null) } }, at,
                ex.getTrackFormat(at), 0L, Long.MAX_VALUE) else null
            val rec = VideoRecorder.create(choice, if (portrait) 90 else 0, target.second, audio) { success ->
                ok = success
                finished.release()
            }
            recorder = rec

            // Decoder -> engine input surface.
            val surfaceReady = Semaphore(0)
            var input: Surface? = null
            engine.openCameraInput(info.width, info.height, info.rotation) { s -> input = s; surfaceReady.release() }
            if (!surfaceReady.tryAcquire(3, TimeUnit.SECONDS)) throw IllegalStateException("no input surface")
            val frameDone = Semaphore(0)
            engine.startExport(rec, if (portrait) 1 else 0) { frameDone.release() }

            val d = MediaCodec.createDecoderByType(vf.getString(MediaFormat.KEY_MIME)!!)
            decoder = d
            d.configure(vf, input, null, 0)
            d.start()
            val bi = MediaCodec.BufferInfo()
            var inputDone = false
            var outputDone = false
            while (!outputDone && !cancelled) {
                if (!inputDone) {
                    val i = d.dequeueInputBuffer(10_000)
                    if (i >= 0) {
                        val n = ex.readSampleData(d.getInputBuffer(i)!!, 0)
                        if (n < 0) {
                            d.queueInputBuffer(i, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                            inputDone = true
                        } else {
                            d.queueInputBuffer(i, 0, n, ex.sampleTime, 0)
                            ex.advance()
                        }
                    }
                }
                val o = d.dequeueOutputBuffer(bi, 10_000)
                if (o >= 0) {
                    outputDone = bi.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
                    val render = bi.size > 0
                    d.releaseOutputBuffer(o, render)
                    if (render) {
                        // One frame in, one frame out: wait for the engine before the next.
                        frameDone.tryAcquire(3, TimeUnit.SECONDS)
                        if (durationUs > 0) onProgress((bi.presentationTimeUs.toFloat() / durationUs).coerceIn(0f, 1f))
                    }
                }
            }
            if (cancelled) audio?.forceDone()
            engine.finishExport()
            finished.tryAcquire(30, TimeUnit.SECONDS)
        } catch (e: Exception) {
            Log.e("VideoExporter", "export", e)
            recorder?.let { engine.finishExport() }
        } finally {
            runCatching { decoder?.stop() }
            runCatching { decoder?.release() }
            runCatching { ex.release() }
            engine.closeCameraInput()
            val result = if (ok && !cancelled) out else null
            out?.let { MediaSaver.publishVideo(context, it, result != null) }
            onDone(result)
        }
    }
}

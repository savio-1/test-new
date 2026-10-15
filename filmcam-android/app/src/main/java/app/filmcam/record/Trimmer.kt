package app.filmcam.record

import android.content.Context
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import android.net.Uri
import android.util.Log
import app.filmcam.util.MediaLibrary
import app.filmcam.util.MediaSaver
import java.nio.ByteBuffer

/**
 * Cuts a clip out of a video without re-encoding: every track is copied sample by sample, so
 * the picture is untouched and it takes seconds. The cut starts on the key frame at or before
 * [startUs] (the app records one every second), so it can begin up to a second early.
 */
object Trimmer {
    private const val TAG = "Trimmer"

    /** Writes [startUs]..[endUs] of [source] to a new video in the album. Returns it, or null. */
    fun trim(context: Context, source: Uri, startUs: Long, endUs: Long, onProgress: (Float) -> Unit = {}): Uri? {
        val info = MediaLibrary.videoInfo(context, source)
        val target = MediaSaver.createVideo(context) ?: return null
        val (uri, pfd) = target
        var ok = false
        val extractor = MediaExtractor()
        var muxer: MediaMuxer? = null
        try {
            extractor.setDataSource(context, source, null)
            val m = MediaMuxer(pfd.fileDescriptor, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
            muxer = m
            m.setOrientationHint(info?.rotation ?: 0)
            val map = HashMap<Int, Int>()
            var videoTrack = -1
            var maxSize = 256 * 1024
            for (i in 0 until extractor.trackCount) {
                val f = extractor.getTrackFormat(i)
                val mime = f.getString(MediaFormat.KEY_MIME) ?: continue
                if (!mime.startsWith("video/") && !mime.startsWith("audio/")) continue
                if (mime.startsWith("video/")) { if (videoTrack >= 0) continue; videoTrack = i }
                map[i] = m.addTrack(f)
                extractor.selectTrack(i)
                if (f.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)) maxSize = maxOf(maxSize, f.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE))
            }
            if (videoTrack < 0) return null
            // Start on the key frame before the cut so the first frame decodes.
            extractor.seekTo(startUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)
            var first = extractor.sampleTime
            if (first < 0) first = startUs
            m.start()
            val buf = ByteBuffer.allocateDirect(maxSize)
            val bi = MediaCodec.BufferInfo()
            val span = (endUs - first).coerceAtLeast(1L)
            var samples = 0
            while (true) {
                val track = extractor.sampleTrackIndex
                if (track < 0) break
                val t = extractor.sampleTime
                if (t > endUs) {
                    // This track is done; others may still have samples before the end.
                    extractor.unselectTrack(track)
                    continue
                }
                val size = extractor.readSampleData(buf, 0)
                if (size < 0) break
                if (t >= first) {
                    val key = extractor.sampleFlags and MediaExtractor.SAMPLE_FLAG_SYNC != 0
                    bi.set(0, size, t - first, if (key) MediaCodec.BUFFER_FLAG_KEY_FRAME else 0)
                    map[track]?.let { m.writeSampleData(it, buf, bi); samples++ }
                    if (track == videoTrack) onProgress(((t - first).toFloat() / span).coerceIn(0f, 1f))
                }
                extractor.advance()
            }
            m.stop()
            ok = samples > 0
        } catch (e: Exception) {
            Log.e(TAG, "trim", e)
        } finally {
            runCatching { muxer?.release() }
            runCatching { extractor.release() }
            runCatching { pfd.close() }
            MediaSaver.publishVideo(context, uri, ok)
        }
        return if (ok) uri else null
    }
}

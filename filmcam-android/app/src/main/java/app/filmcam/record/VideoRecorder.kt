package app.filmcam.record

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.media.MediaFormat
import android.media.MediaMuxer
import android.media.MediaRecorder
import android.os.Handler
import android.os.HandlerThread
import android.os.ParcelFileDescriptor
import android.util.Log
import android.view.Surface
import java.nio.ByteBuffer
import java.util.concurrent.atomic.AtomicBoolean

/** The encoder choice for one recording. */
data class EncoderChoice(val mime: String, val width: Int, val height: Int, val fps: Int, val bitrate: Int) {
    val codecName get() = if (mime == MediaFormat.MIMETYPE_VIDEO_HEVC) "HEVC" else "H.264"
}

/**
 * H.264 or HEVC + AAC into an MP4. Video frames arrive through [inputSurface], drawn by the film
 * renderer; audio is pulled from the microphone on its own thread. Timestamps on both
 * tracks come from System.nanoTime so they line up.
 */
class VideoRecorder(
    private val choice: EncoderChoice,
    orientationHint: Int,
    private val output: ParcelFileDescriptor,
    withAudio: Boolean,
    private val onFinished: (success: Boolean) -> Unit,
) {
    val width = choice.width
    val height = choice.height
    private val videoThread = HandlerThread("VideoEncoder").apply { start() }
    private val videoCodec: MediaCodec
    val inputSurface: Surface
    private val muxer = MediaMuxer(output.fileDescriptor, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    private val sink: MuxerSink
    private val audio: AudioPump?

    private val videoDone = AtomicBoolean(false)
    private val finished = AtomicBoolean(false)
    private var videoTrack = -1
    private var lastVideoPts = -1L

    init {
        muxer.setOrientationHint(orientationHint)
        val format = MediaFormat.createVideoFormat(choice.mime, width, height).apply {
            setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
            // Grain is pure entropy; give it bits or it turns to mush.
            setInteger(MediaFormat.KEY_BIT_RATE, choice.bitrate)
            setInteger(MediaFormat.KEY_FRAME_RATE, choice.fps)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
        }
        videoCodec = MediaCodec.createEncoderByType(choice.mime)
        videoCodec.setCallback(object : MediaCodec.Callback() {
            override fun onInputBufferAvailable(codec: MediaCodec, index: Int) = Unit

            override fun onOutputBufferAvailable(codec: MediaCodec, index: Int, info: MediaCodec.BufferInfo) {
                try {
                    val buf = codec.getOutputBuffer(index)
                    val isConfig = info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0
                    if (buf != null && info.size > 0 && !isConfig && videoTrack >= 0 && info.presentationTimeUs > lastVideoPts) {
                        lastVideoPts = info.presentationTimeUs
                        sink.write(videoTrack, buf, info)
                    }
                    codec.releaseOutputBuffer(index, false)
                    if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
                        videoDone.set(true)
                        maybeFinish()
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "video output", e)
                }
            }

            override fun onOutputFormatChanged(codec: MediaCodec, format: MediaFormat) {
                videoTrack = sink.addTrack(format)
            }

            override fun onError(codec: MediaCodec, e: MediaCodec.CodecException) {
                Log.e(TAG, "video codec error", e)
                videoDone.set(true)
                maybeFinish()
            }
        }, Handler(videoThread.looper))
        videoCodec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        inputSurface = videoCodec.createInputSurface()

        audio = if (withAudio) AudioPump.create() else null
        sink = MuxerSink(muxer, if (audio != null) 2 else 1)
        audio?.sink = sink
        audio?.onDone = { maybeFinish() }
    }

    fun start() {
        videoCodec.start()
        audio?.start()
    }

    /** Ends both streams; [onFinished] runs once the file is complete. */
    fun stop() {
        try {
            videoCodec.signalEndOfInputStream()
        } catch (e: Exception) {
            Log.w(TAG, "signalEndOfInputStream", e)
            videoDone.set(true)
        }
        audio?.stop()
        // Safety net: never leave the file pending if an encoder goes quiet.
        Handler(videoThread.looper).postDelayed({
            if (!finished.get()) {
                Log.w(TAG, "encoder drain timed out")
                videoDone.set(true)
                audio?.forceDone()
                maybeFinish()
            }
        }, 4000)
        maybeFinish()
    }

    private fun maybeFinish() {
        if (!videoDone.get() || (audio != null && !audio.done)) return
        if (!finished.compareAndSet(false, true)) return
        val ok = sink.finish()
        runCatching { videoCodec.stop() }
        runCatching { videoCodec.release() }
        runCatching { inputSurface.release() }
        runCatching { output.close() }
        videoThread.quitSafely()
        onFinished(ok)
    }

    companion object {
        private const val TAG = "VideoRecorder"

        private fun videoCaps(mime: String) = MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos
            .filter { it.isEncoder && it.supportedTypes.any { t -> t.equals(mime, true) } }
            .mapNotNull { runCatching { it.getCapabilitiesForType(mime).videoCapabilities }.getOrNull() }

        /** Whether some encoder can take [w]x[h] at [fps] in this format. */
        fun canEncode(mime: String, w: Int, h: Int, fps: Int): Boolean =
            videoCaps(mime).any { runCatching { it.areSizeAndRateSupported(w, h, fps.toDouble()) }.getOrDefault(false) }

        /**
         * Picks the codec for a landscape [w]x[h] recording: HEVC from 4K up (smaller files,
         * and often the only 8K encoder), H.264 below; whichever can actually take the size.
         * Steps the size down if neither can. Bitrate is generous: grain eats bits.
         */
        fun choose(w: Int, h: Int, fps: Int): EncoderChoice {
            val big = w.toLong() * h > 2_500_000L
            val order = if (big) listOf(MediaFormat.MIMETYPE_VIDEO_HEVC, MediaFormat.MIMETYPE_VIDEO_AVC)
                else listOf(MediaFormat.MIMETYPE_VIDEO_AVC, MediaFormat.MIMETYPE_VIDEO_HEVC)
            var cw = w
            var ch = h
            while (cw >= 320) {
                for (mime in order) {
                    if (canEncode(mime, cw, ch, fps)) {
                        val perPixel = if (mime == MediaFormat.MIMETYPE_VIDEO_HEVC) 0.2 else 0.3
                        var rate = (cw.toLong() * ch * fps * perPixel).toLong().coerceIn(6_000_000L, 240_000_000L)
                        videoCaps(mime).firstOrNull { it.isSizeSupported(cw, ch) }?.bitrateRange?.let {
                            rate = rate.coerceIn(it.lower.toLong(), it.upper.toLong())
                        }
                        return EncoderChoice(mime, cw, ch, fps, rate.toInt())
                    }
                }
                cw = (cw * 3 / 4) and -2
                ch = (ch * 3 / 4) and -2
            }
            return EncoderChoice(MediaFormat.MIMETYPE_VIDEO_AVC, 1920, 1080, fps, 20_000_000)
        }
    }
}

/** Starts the muxer once every track has a format; buffers samples that arrive before. */
class MuxerSink(private val muxer: MediaMuxer, private val expectedTracks: Int) {
    private class Pending(val track: Int, val data: ByteArray, val info: MediaCodec.BufferInfo)
    private val pending = ArrayList<Pending>()
    private var added = 0
    private var started = false
    private var samples = 0

    @Synchronized
    fun addTrack(format: MediaFormat): Int {
        val idx = muxer.addTrack(format)
        added++
        if (added == expectedTracks) {
            muxer.start()
            started = true
            for (p in pending) {
                muxer.writeSampleData(p.track, ByteBuffer.wrap(p.data), p.info)
                samples++
            }
            pending.clear()
        }
        return idx
    }

    @Synchronized
    fun write(track: Int, buf: ByteBuffer, info: MediaCodec.BufferInfo) {
        buf.position(info.offset)
        buf.limit(info.offset + info.size)
        if (!started) {
            if (pending.size > 600) return
            val copy = ByteArray(info.size)
            buf.get(copy)
            val i = MediaCodec.BufferInfo().apply { set(0, info.size, info.presentationTimeUs, info.flags) }
            pending.add(Pending(track, copy, i))
            return
        }
        muxer.writeSampleData(track, buf, info)
        samples++
    }

    /** Returns whether a playable file was written. */
    @Synchronized
    fun finish(): Boolean {
        var ok = started && samples > 0
        if (started) {
            try { muxer.stop() } catch (e: Exception) { ok = false }
        }
        runCatching { muxer.release() }
        return ok
    }
}

/** Microphone -> AAC on a dedicated thread. */
class AudioPump private constructor(private val record: AudioRecord, private val codec: MediaCodec) {
    var sink: MuxerSink? = null
    var onDone: (() -> Unit)? = null
    @Volatile var done = false
        private set
    @Volatile private var running = false
    private var thread: Thread? = null
    private var track = -1

    fun start() {
        running = true
        thread = Thread({ loop() }, "AudioEncoder").apply { start() }
    }

    fun stop() { running = false }

    fun forceDone() { running = false; done = true }

    private fun loop() {
        try {
            codec.start()
            record.startRecording()
            val info = MediaCodec.BufferInfo()
            var startNs = -1L
            var frames = 0L
            var eosQueued = false
            var lastPts = -1L
            while (!done) {
                if (!eosQueued) {
                    val inIdx = codec.dequeueInputBuffer(10_000)
                    if (inIdx >= 0) {
                        val buf = codec.getInputBuffer(inIdx)!!
                        buf.clear()
                        if (!running) {
                            codec.queueInputBuffer(inIdx, 0, 0, ptsUs(startNs, frames), MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                            eosQueued = true
                        } else {
                            val read = record.read(buf, minOf(buf.capacity(), CHUNK))
                            if (read > 0) {
                                if (startNs < 0) startNs = System.nanoTime() - LATENCY_NS
                                codec.queueInputBuffer(inIdx, 0, read, ptsUs(startNs, frames), 0)
                                frames += read / 2
                            } else {
                                codec.queueInputBuffer(inIdx, 0, 0, ptsUs(startNs, frames), 0)
                            }
                        }
                    }
                }
                while (true) {
                    val outIdx = codec.dequeueOutputBuffer(info, if (eosQueued) 10_000 else 0)
                    if (outIdx == MediaCodec.INFO_TRY_AGAIN_LATER) break
                    if (outIdx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                        track = sink!!.addTrack(codec.outputFormat)
                        continue
                    }
                    if (outIdx < 0) continue
                    val out = codec.getOutputBuffer(outIdx)
                    val isConfig = info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0
                    if (out != null && info.size > 0 && !isConfig && track >= 0 && info.presentationTimeUs > lastPts) {
                        lastPts = info.presentationTimeUs
                        sink!!.write(track, out, info)
                    }
                    codec.releaseOutputBuffer(outIdx, false)
                    if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
                        done = true
                        break
                    }
                }
            }
        } catch (e: Exception) {
            Log.e("AudioPump", "audio loop", e)
        } finally {
            done = true
            runCatching { record.stop() }
            runCatching { record.release() }
            runCatching { codec.stop() }
            runCatching { codec.release() }
            onDone?.invoke()
        }
    }

    private fun ptsUs(startNs: Long, frames: Long): Long {
        val base = if (startNs < 0) System.nanoTime() else startNs
        return (base + frames * 1_000_000_000L / SAMPLE_RATE) / 1000L
    }

    companion object {
        private const val SAMPLE_RATE = 48_000
        private const val CHUNK = 4096
        private const val LATENCY_NS = 20_000_000L

        /** Null if the microphone is unavailable (no permission, in use, no hardware). */
        @SuppressLint("MissingPermission")
        fun create(): AudioPump? = try {
            val min = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
            val record = AudioRecord(
                MediaRecorder.AudioSource.CAMCORDER, SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT, maxOf(min * 4, CHUNK * 4),
            )
            if (record.state != AudioRecord.STATE_INITIALIZED) {
                record.release(); null
            } else {
                val fmt = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, SAMPLE_RATE, 1).apply {
                    setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
                    setInteger(MediaFormat.KEY_BIT_RATE, 128_000)
                    setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, CHUNK * 2)
                }
                val codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC)
                codec.configure(fmt, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
                AudioPump(record, codec)
            }
        } catch (e: Exception) {
            Log.w("AudioPump", "no audio", e)
            null
        }
    }
}

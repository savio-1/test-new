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
data class EncoderChoice(
    val mime: String, val width: Int, val height: Int, val fps: Int, val bitrate: Int,
    /** 10-bit HEVC Main10 tagged BT.2020 / HLG. */
    val hlg: Boolean = false,
) {
    val codecName get() = if (hlg) "HEVC 10-bit HLG" else if (mime == MediaFormat.MIMETYPE_VIDEO_HEVC) "HEVC" else "H.264"
}

/**
 * H.264 or HEVC + AAC into an MP4. Video frames arrive through [inputSurface], drawn by the film
 * renderer; audio is pulled from the microphone on its own thread. Timestamps on both
 * tracks come from System.nanoTime so they line up.
 */
class VideoRecorder(
    private val choice: EncoderChoice,
    /**
     * A persistent input surface the camera writes into directly (10-bit takes). The codec is
     * configured on it straight away, before the camera session that uses it is built.
     */
    private val persistent: Surface? = null,
) {
    val width = choice.width
    val height = choice.height
    private val videoThread = HandlerThread("VideoEncoder").apply { start() }
    private val videoCodec: MediaCodec
    val inputSurface: Surface
    private lateinit var output: ParcelFileDescriptor
    private lateinit var muxer: MediaMuxer
    private lateinit var sink: MuxerSink
    private var audio: AudioFeed? = null
    private var onFinished: (Boolean) -> Unit = {}

    private val videoDone = AtomicBoolean(false)
    private val finished = AtomicBoolean(false)
    private var videoTrack = -1
    private var lastVideoPts = -1L

    init {
        val format = MediaFormat.createVideoFormat(choice.mime, width, height).apply {
            setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
            // Grain is pure entropy; give it bits or it turns to mush.
            setInteger(MediaFormat.KEY_BIT_RATE, choice.bitrate)
            setInteger(MediaFormat.KEY_FRAME_RATE, choice.fps)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
            if (choice.hlg) {
                setInteger(MediaFormat.KEY_PROFILE, MediaCodecInfo.CodecProfileLevel.HEVCProfileMain10)
                setInteger(MediaFormat.KEY_COLOR_STANDARD, MediaFormat.COLOR_STANDARD_BT2020)
                setInteger(MediaFormat.KEY_COLOR_TRANSFER, MediaFormat.COLOR_TRANSFER_HLG)
                setInteger(MediaFormat.KEY_COLOR_RANGE, MediaFormat.COLOR_RANGE_LIMITED)
            }
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
        // H.264 at High profile (encoders default to Baseline, which spends the same bits on a
        // visibly softer picture). Falls back to the encoder's own choice if it refuses.
        val high = if (choice.mime == MediaFormat.MIMETYPE_VIDEO_AVC && !choice.hlg) runCatching {
            videoCodec.codecInfo.getCapabilitiesForType(choice.mime).profileLevels
                .filter { it.profile == MediaCodecInfo.CodecProfileLevel.AVCProfileHigh }.maxByOrNull { it.level }
        }.getOrNull() else null
        if (high != null) {
            format.setInteger(MediaFormat.KEY_PROFILE, high.profile)
            format.setInteger(MediaFormat.KEY_LEVEL, high.level)
        }
        try {
            videoCodec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        } catch (e: Exception) {
            if (high == null) throw e
            format.removeKey(MediaFormat.KEY_PROFILE)
            format.removeKey(MediaFormat.KEY_LEVEL)
            videoCodec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        }
        inputSurface = if (persistent != null) persistent.also { videoCodec.setInputSurface(it) } else videoCodec.createInputSurface()
    }

    /**
     * Where the take goes: the file, its rotation flag, the sound ([AudioPump] for the
     * microphone, [AudioCopy] for an imported clip, or none) and what to do when it's written.
     */
    fun open(orientationHint: Int, output: ParcelFileDescriptor, audio: AudioFeed?, onFinished: (success: Boolean) -> Unit) {
        this.output = output
        this.audio = audio
        this.onFinished = onFinished
        muxer = MediaMuxer(output.fileDescriptor, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
        muxer.setOrientationHint(orientationHint)
        sink = MuxerSink(muxer, if (audio != null) 2 else 1)
        audio?.sink = sink
        audio?.onDone = { maybeFinish() }
    }

    /** Frees a recorder that was prepared but never used. */
    fun discard() {
        runCatching { videoCodec.release() }
        if (persistent == null) runCatching { inputSurface.release() }
        videoThread.quitSafely()
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
        val audio = audio
        if (!videoDone.get() || (audio != null && !audio.done)) return
        if (!finished.compareAndSet(false, true)) return
        val ok = sink.finish()
        runCatching { videoCodec.stop() }
        runCatching { videoCodec.release() }
        if (persistent == null) runCatching { inputSurface.release() }
        runCatching { output.close() }
        videoThread.quitSafely()
        onFinished(ok)
    }

    companion object {
        private const val TAG = "VideoRecorder"

        /** A recorder fed by the GPU, writing to [output] straight away. */
        fun create(
            choice: EncoderChoice, orientationHint: Int, output: ParcelFileDescriptor, audio: AudioFeed?,
            onFinished: (success: Boolean) -> Unit,
        ) = VideoRecorder(choice).also { it.open(orientationHint, output, audio, onFinished) }

        /** A 10-bit HLG HEVC encoder for [w]x[h] (sensor-oriented) at [fps], or null if the phone has none. */
        fun chooseHlg(w: Int, h: Int, fps: Int): EncoderChoice? {
            val mime = MediaFormat.MIMETYPE_VIDEO_HEVC
            val ok = MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos.any { info ->
                info.isEncoder && info.supportedTypes.any { it.equals(mime, true) } && runCatching {
                    val caps = info.getCapabilitiesForType(mime)
                    caps.profileLevels.any { it.profile == MediaCodecInfo.CodecProfileLevel.HEVCProfileMain10 } &&
                        caps.videoCapabilities.areSizeAndRateSupported(w, h, fps.toDouble())
                }.getOrDefault(false)
            }
            if (!ok) return null
            // 10-bit log is graded hard: plenty of bits.
            val rate = (w.toLong() * h * fps * 0.3).toLong().coerceIn(20_000_000L, 200_000_000L)
            return EncoderChoice(mime, w, h, fps, rate.toInt(), hlg = true)
        }

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
        fun choose(w: Int, h: Int, fps: Int, log: Boolean = false): EncoderChoice {
            // Log footage gets HEVC and a third more bits: flat pictures band easily.
            val big = log || w.toLong() * h > 2_500_000L
            val order = if (big) listOf(MediaFormat.MIMETYPE_VIDEO_HEVC, MediaFormat.MIMETYPE_VIDEO_AVC)
                else listOf(MediaFormat.MIMETYPE_VIDEO_AVC, MediaFormat.MIMETYPE_VIDEO_HEVC)
            var cw = w
            var ch = h
            while (cw >= 320) {
                for (mime in order) {
                    if (canEncode(mime, cw, ch, fps)) {
                        val perPixel = (if (mime == MediaFormat.MIMETYPE_VIDEO_HEVC) 0.2 else 0.3) * (if (log) 1.35 else 1.0)
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
    @Volatile var started = false
        private set
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

/** A source of the audio track. */
interface AudioFeed {
    var sink: MuxerSink?
    var onDone: (() -> Unit)?
    val done: Boolean
    fun start()
    /** The video has ended. */
    fun stop()
    fun forceDone()
}

/**
 * Copies the sound of an imported clip as it is (no re-encode), between [startUs] and [endUs]
 * of the source, with the source's own timestamps so it lines up with the exported frames.
 */
class AudioCopy(private val open: () -> android.media.MediaExtractor, private val track: Int,
                private val format: MediaFormat, private val startUs: Long, private val endUs: Long) : AudioFeed {
    override var sink: MuxerSink? = null
    override var onDone: (() -> Unit)? = null
    @Volatile override var done = false
        private set
    @Volatile private var cancelled = false

    override fun start() {
        Thread({
            val ex = runCatching { open() }.getOrNull()
            try {
                val s = sink!!
                val out = s.addTrack(format)
                ex?.selectTrack(track)
                ex?.seekTo(startUs, android.media.MediaExtractor.SEEK_TO_PREVIOUS_SYNC)
                // Wait for the video track so the muxer is running; buffering a whole clip's
                // audio in memory is not an option.
                val t0 = System.currentTimeMillis()
                while (!s.started && !cancelled && System.currentTimeMillis() - t0 < 20_000) Thread.sleep(10)
                val buf = ByteBuffer.allocateDirect(format.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 256 * 1024))
                val info = MediaCodec.BufferInfo()
                while (ex != null && !cancelled && s.started) {
                    val size = ex.readSampleData(buf, 0)
                    if (size < 0) break
                    val t = ex.sampleTime
                    if (t > endUs) break
                    if (t >= startUs - 50_000) {
                        info.set(0, size, t, if (ex.sampleFlags and android.media.MediaExtractor.SAMPLE_FLAG_SYNC != 0) MediaCodec.BUFFER_FLAG_KEY_FRAME else 0)
                        s.write(out, buf, info)
                    }
                    ex.advance()
                }
            } catch (e: Exception) {
                Log.e("AudioCopy", "copy", e)
            } finally {
                runCatching { ex?.release() }
                done = true
                onDone?.invoke()
            }
        }, "AudioCopy").start()
    }

    override fun stop() = Unit
    override fun forceDone() { cancelled = true; done = true }
}

/**
 * The sound of an imported clip with its background noise taken out: decoded, cleaned by
 * [app.filmcam.audio.VoiceDenoiser] and encoded again as AAC, on the source's own timestamps so
 * it lines up with the exported frames.
 */
class AudioClean(
    private val open: () -> android.media.MediaExtractor, private val track: Int, private val format: MediaFormat,
    private val model: app.filmcam.audio.RnNoiseModel, private val strength: Float,
) : AudioFeed {
    override var sink: MuxerSink? = null
    override var onDone: (() -> Unit)? = null
    @Volatile override var done = false
        private set
    @Volatile private var cancelled = false

    override fun start() {
        Thread({ run() }, "AudioClean").start()
    }

    private fun run() {
        var ex: android.media.MediaExtractor? = null
        var dec: MediaCodec? = null
        var enc: MediaCodec? = null
        try {
            ex = open()
            ex.selectTrack(track)
            val d = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME)!!)
            dec = d
            d.configure(format, null, null, 0)
            d.start()
            var rate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
            var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
            var dn: app.filmcam.audio.VoiceDenoiser? = null
            var skip = 0
            var e: MediaCodec? = null
            var outTrack = -1
            var firstUs = -1L
            var framesIn = 0L
            val info = MediaCodec.BufferInfo()
            val einfo = MediaCodec.BufferInfo()
            var lastPts = -1L
            var encDone = false

            fun drainEncoder(wait: Boolean) {
                val c = e ?: return
                while (true) {
                    val o = c.dequeueOutputBuffer(einfo, if (wait) 10_000 else 0)
                    if (o == MediaCodec.INFO_TRY_AGAIN_LATER) { if (!wait || encDone) return else continue }
                    if (o == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) { outTrack = sink!!.addTrack(c.outputFormat); continue }
                    if (o < 0) continue
                    val buf = c.getOutputBuffer(o)
                    val config = einfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0
                    if (buf != null && einfo.size > 0 && !config && outTrack >= 0 && einfo.presentationTimeUs > lastPts) {
                        lastPts = einfo.presentationTimeUs
                        sink!!.write(outTrack, buf, einfo)
                    }
                    c.releaseOutputBuffer(o, false)
                    if (einfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) { encDone = true; return }
                }
            }

            /** Cleaned samples into the encoder, timed from the first sample of the source. */
            fun encode(pcm: ShortArray, from: Int, eos: Boolean) {
                val c = e ?: return
                var pos = from
                while ((pos < pcm.size || eos) && !cancelled) {
                    val i = c.dequeueInputBuffer(10_000)
                    if (i < 0) { drainEncoder(false); continue }
                    val b = c.getInputBuffer(i)!!
                    b.clear()
                    val n = minOf(pcm.size - pos, b.capacity() / 2) / channels * channels
                    b.order(java.nio.ByteOrder.LITTLE_ENDIAN).asShortBuffer().put(pcm, pos, n)
                    val pts = firstUs + framesIn * 1_000_000L / rate
                    val last = eos && pos + n >= pcm.size
                    c.queueInputBuffer(i, 0, n * 2, pts, if (last) MediaCodec.BUFFER_FLAG_END_OF_STREAM else 0)
                    pos += n
                    framesIn += n / channels
                    drainEncoder(false)
                    if (last) break
                }
            }

            fun startEncoder() {
                val fmt = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, rate, channels).apply {
                    setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
                    setInteger(MediaFormat.KEY_BIT_RATE, 96_000 * channels.coerceAtMost(2))
                    setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 16_384)
                }
                e = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC).also {
                    it.configure(fmt, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
                    it.start()
                }
                enc = e
                dn = app.filmcam.audio.VoiceDenoiser(model, rate, channels, strength)
                skip = dn!!.latencyFrames * channels
            }

            var inDone = false
            var outDone = false
            while (!outDone && !cancelled) {
                if (!inDone) {
                    val i = d.dequeueInputBuffer(10_000)
                    if (i >= 0) {
                        val n = ex.readSampleData(d.getInputBuffer(i)!!, 0)
                        if (n < 0) { d.queueInputBuffer(i, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM); inDone = true }
                        else { d.queueInputBuffer(i, 0, n, ex.sampleTime, 0); ex.advance() }
                    }
                }
                val o = d.dequeueOutputBuffer(info, 10_000)
                if (o == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    if (e == null) {
                        rate = d.outputFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
                        channels = d.outputFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
                    }
                } else if (o >= 0) {
                    if (e == null) startEncoder()
                    if (info.size > 0) {
                        if (firstUs < 0) firstUs = info.presentationTimeUs
                        val b = d.getOutputBuffer(o)!!.order(java.nio.ByteOrder.LITTLE_ENDIAN)
                        b.position(info.offset)
                        val pcm = ShortArray(info.size / 2)
                        b.asShortBuffer().get(pcm)
                        val clean = dn!!.process(pcm, 0, pcm.size)
                        // The first latency's worth out is the denoiser filling up: drop it.
                        val from = minOf(skip, clean.size)
                        skip -= from
                        if (from < clean.size) encode(clean, from, false)
                    }
                    d.releaseOutputBuffer(o, false)
                    if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
                        outDone = true
                        if (e == null) startEncoder()
                        if (firstUs < 0) firstUs = 0
                        encode(dn!!.flush(), 0, true)
                        while (!encDone && !cancelled) drainEncoder(true)
                    }
                }
            }
        } catch (ex2: Exception) {
            Log.e("AudioClean", "clean", ex2)
        } finally {
            runCatching { dec?.stop() }; runCatching { dec?.release() }
            runCatching { enc?.stop() }; runCatching { enc?.release() }
            runCatching { ex?.release() }
            done = true
            onDone?.invoke()
        }
    }

    override fun stop() = Unit
    override fun forceDone() { cancelled = true; done = true }
}

/**
 * Microphone -> AAC on a dedicated thread. [clock] gives nanoseconds on the same clock as the
 * video frames: System.nanoTime for the GPU path, the camera's own for direct 10-bit takes.
 */
class AudioPump private constructor(
    private val record: AudioRecord, private val codec: MediaCodec, private val clock: () -> Long,
    /** Takes background noise out of the voice as it is recorded (null: the microphone as it is). */
    private val denoiser: app.filmcam.audio.VoiceDenoiser? = null,
) : AudioFeed {
    override var sink: MuxerSink? = null
    override var onDone: (() -> Unit)? = null
    @Volatile override var done = false
        private set
    @Volatile private var running = false
    private var thread: Thread? = null
    private var track = -1
    private val pcm = ShortArray(CHUNK / 2)
    private var skip = denoiser?.latencyFrames ?: 0
    private var tail: ShortArray? = null
    private var tailPos = 0

    override fun start() {
        running = true
        thread = Thread({ loop() }, "AudioEncoder").apply { start() }
    }

    override fun stop() { running = false }

    override fun forceDone() { running = false; done = true }

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
                        if (denoiser != null) {
                            // Cleaned audio comes out a fixed latency late: the first samples out
                            // are dropped and the tail is flushed at the end, so sample n out is
                            // sample n in and the timestamps stay as they are.
                            if (!running && tail == null) tail = denoiser.flush()
                            val t = tail
                            if (t != null) {
                                val n = minOf(t.size - tailPos, buf.capacity() / 2)
                                if (n > 0) {
                                    buf.order(java.nio.ByteOrder.LITTLE_ENDIAN).asShortBuffer().put(t, tailPos, n)
                                    codec.queueInputBuffer(inIdx, 0, n * 2, ptsUs(startNs, frames), 0)
                                    tailPos += n; frames += n
                                } else {
                                    codec.queueInputBuffer(inIdx, 0, 0, ptsUs(startNs, frames), MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                                    eosQueued = true
                                }
                            } else {
                                val read = record.read(pcm, 0, minOf(pcm.size, buf.capacity() / 2))
                                if (read > 0) {
                                    tap?.let { f ->
                                        val raw = ByteBuffer.allocate(read * 2).order(java.nio.ByteOrder.LITTLE_ENDIAN)
                                        raw.asShortBuffer().put(pcm, 0, read)
                                        f(raw, 0, read * 2)
                                    }
                                    if (startNs < 0) startNs = clock() - LATENCY_NS
                                    val clean = denoiser.process(pcm, 0, read)
                                    val from = minOf(skip, clean.size)
                                    skip -= from
                                    val n = clean.size - from
                                    if (n > 0) buf.order(java.nio.ByteOrder.LITTLE_ENDIAN).asShortBuffer().put(clean, from, n)
                                    codec.queueInputBuffer(inIdx, 0, n * 2, ptsUs(startNs, frames), 0)
                                    frames += n
                                } else {
                                    codec.queueInputBuffer(inIdx, 0, 0, ptsUs(startNs, frames), 0)
                                }
                            }
                        } else if (!running) {
                            codec.queueInputBuffer(inIdx, 0, 0, ptsUs(startNs, frames), MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                            eosQueued = true
                        } else {
                            val read = record.read(buf, minOf(buf.capacity(), CHUNK))
                            if (read > 0) {
                                tap?.invoke(buf, 0, read)
                                if (startNs < 0) startNs = clock() - LATENCY_NS
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
        val base = if (startNs < 0) clock() else startNs
        return (base + frames * 1_000_000_000L / SAMPLE_RATE) / 1000L
    }

    companion object {
        /** Gets a copy of the microphone PCM as it is recorded (live subtitles listen to it). */
        @Volatile var tap: ((ByteBuffer, Int, Int) -> Unit)? = null
        const val SAMPLE_RATE = 48_000
        private const val CHUNK = 4096
        private const val LATENCY_NS = 20_000_000L

        /** Null if the microphone is unavailable (no permission, in use, no hardware). */
        @SuppressLint("MissingPermission")
        fun create(clock: () -> Long = System::nanoTime, denoiser: app.filmcam.audio.VoiceDenoiser? = null): AudioPump? = try {
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
                AudioPump(record, codec, clock, denoiser)
            }
        } catch (e: Exception) {
            Log.w("AudioPump", "no audio", e)
            null
        }
    }
}

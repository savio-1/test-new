package app.filmcam.camera

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.ImageFormat
import android.graphics.Rect
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CameraMetadata
import android.hardware.camera2.CaptureRequest
import android.hardware.camera2.CaptureResult
import android.hardware.camera2.TotalCaptureResult
import android.hardware.camera2.params.MeteringRectangle
import android.hardware.camera2.params.OutputConfiguration
import android.hardware.camera2.params.SessionConfiguration
import android.media.ImageReader
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.util.Size
import android.view.Surface
import app.filmcam.gl.FilmEngine
import java.util.concurrent.Executor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt

/**
 * A JPEG straight off the sensor, plus how to turn it upright. [zoomCrop] is digital zoom the
 * sensor couldn't apply (full-resolution mode shoots the whole sensor), left for the GPU.
 */
class StillJpeg(val bytes: ByteArray, val rotationCw: Int, val mirror: Boolean, val zoomCrop: Float = 1f)

/** How the camera should be opened. Changing any of this rebuilds the session. */
data class CameraConfig(
    val lens: Lens,
    val mode: CaptureMode,
    val videoRes: VideoResolution,
    val photo: PhotoSize,
    val fps: Int,
    /** Video in log: our own tone curve in the camera's ISP instead of its picture style. */
    val log: Boolean = false,
    /**
     * Log as 10-bit HLG: the camera streams HLG10 and writes straight into [direct], the
     * encoder's persistent input surface, with no 8-bit GPU step in between.
     */
    val hlg: Boolean = false,
    val direct: Surface? = null,
    /** Also shoot a RAW frame (DNG) with every photo. */
    val raw: Boolean = false,
)

/**
 * Camera2 directly, so the film pipeline gets the full streams the phone can do (4K and 8K
 * where the sensor offers them), every lens, fixed frame rates and real manual exposure.
 * All camera work happens on its own thread.
 */
class Camera2Controller(context: Context, private val engine: FilmEngine) {
    interface Listener {
        /** The camera is streaming with [config] (which may differ from the request after a fallback). */
        fun onCameraReady(config: CameraConfig, caps: CameraCaps)
        fun onCameraError(message: String)
        /** Log video: stops of underexposure to give back, and whether the camera applies the curve. */
        fun onLogState(under: Float, inIsp: Boolean) = Unit
        /** A DNG of the frame just shot. */
        fun onRawCaptured(dng: ByteArray) = Unit
    }

    var listener: Listener? = null
    private val manager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
    val catalog = LensCatalog(manager)

    private val thread = HandlerThread("Camera2").apply { start() }
    private val handler = Handler(thread.looper)
    private val executor = Executor { handler.post(it) }

    // Settings that only change the repeating request. Written from the main thread.
    @Volatile var realShutter = false
    @Volatile var shutterSeconds = 1f / 125f
    @Volatile var exposureEv = 0f
    @Volatile var flash = false
    @Volatile var stabilization = false
    @Volatile var userZoom = 1f

    private var generation = 0
    private var config: CameraConfig? = null
    private var caps: CameraCaps? = null
    private var device: CameraDevice? = null
    private var session: CameraCaptureSession? = null
    private var previewSurface: Surface? = null
    private var reader: ImageReader? = null
    private var rawReader: ImageReader? = null
    private var rawImage: android.media.Image? = null
    private var rawResult: TotalCaptureResult? = null
    private var rawRotation = 0
    /** The camera ignored our log curve (some phones list it but don't apply it). */
    private var ispCurveRejected = false
    @Volatile private var directOn = false
    private var streamSize = Size(1920, 1080)

    private var lastExposureNs = 0L
    private var lastIso = 0
    private var focusRegion: MeteringRectangle? = null
    private var pendingStill: ((StillJpeg?) -> Unit)? = null
    private var pendingRotation = 0
    private var pendingZoomCrop = 1f
    private var precaptureFrames = -1

    // ------------------------------------------------------------------ lifecycle

    fun open(cfg: CameraConfig) = handler.post {
        val cur = config
        if (cfg == cur && device != null) return@post
        // Another lens behind the same camera is only a zoom ratio away: no new session.
        if (cur != null && session != null && cfg.lens.cameraId == cur.lens.cameraId && cfg.copy(lens = cur.lens) == cur) {
            config = cfg
            applyRepeating()
            return@post
        }
        closeInternal()
        openInternal(cfg)
    }

    fun close() = handler.post { closeInternal() }

    fun release() = handler.post { closeInternal(); thread.quitSafely() }

    /** Re-sends the repeating request after a settings change. */
    fun applySettings() = handler.post { applyRepeating() }

    @SuppressLint("MissingPermission")
    private fun openInternal(cfg: CameraConfig) {
        val c = catalog.caps[cfg.lens.cameraId] ?: run { listener?.onCameraError("Camera unavailable"); return }
        val gen = ++generation
        config = cfg
        caps = c
        streamSize = if (cfg.mode == CaptureMode.VIDEO) {
            c.videoSize(cfg.videoRes) ?: c.videoSizes.firstOrNull { it.width <= cfg.videoRes.width } ?: c.photoPreviewSize
        } else c.photoPreviewSize
        try {
            manager.openCamera(c.id, object : CameraDevice.StateCallback() {
                override fun onOpened(dev: CameraDevice) {
                    if (gen != generation) { dev.close(); return }
                    device = dev
                    engine.openCameraInput(streamSize.width, streamSize.height) { surface ->
                        // Closed in the meantime: hand the stream back rather than leave it open.
                        handler.post { if (gen == generation) createSession(surface, gen) else engine.closeCameraInput(surface) }
                    }
                }

                override fun onDisconnected(dev: CameraDevice) {
                    dev.close()
                    if (device === dev) { device = null; session = null }
                }

                override fun onError(dev: CameraDevice, error: Int) {
                    Log.e(TAG, "camera error $error")
                    dev.close()
                    if (device === dev) {
                        device = null; session = null
                        listener?.onCameraError("Camera error ($error)")
                    }
                }
            }, handler)
        } catch (e: Exception) {
            Log.e(TAG, "openCamera", e)
            listener?.onCameraError("Couldn't open the camera")
        }
    }

    private fun createSession(surface: Surface, gen: Int) {
        val dev = device ?: return
        val cfg = config ?: return
        val c = caps ?: return
        previewSurface = surface
        val hlg = cfg.mode == CaptureMode.VIDEO && cfg.hlg && c.hlg10 && Build.VERSION.SDK_INT >= 33
        fun out(s: Surface) = OutputConfiguration(s).also {
            if (hlg && Build.VERSION.SDK_INT >= 33) it.dynamicRangeProfile = android.hardware.camera2.params.DynamicRangeProfiles.HLG10
        }
        val outputs = arrayListOf(out(surface))
        if (cfg.mode == CaptureMode.VIDEO) cfg.direct?.let { outputs += out(it) }
        if (cfg.mode == CaptureMode.PHOTO && cfg.raw && !cfg.photo.maxRes) c.rawSize?.let { rs ->
            rawReader = ImageReader.newInstance(rs.width, rs.height, ImageFormat.RAW_SENSOR, 2).also { r ->
                r.setOnImageAvailableListener({ onRaw(it) }, handler)
                outputs += OutputConfiguration(r.surface)
            }
        }
        if (cfg.mode == CaptureMode.PHOTO) {
            val js = cfg.photo
            reader = ImageReader.newInstance(js.width, js.height, ImageFormat.JPEG, 2).also { r ->
                r.setOnImageAvailableListener({ onJpeg(it) }, handler)
                val out = OutputConfiguration(r.surface)
                if (js.maxRes && Build.VERSION.SDK_INT >= 31) {
                    out.addSensorPixelModeUsed(CameraMetadata.SENSOR_PIXEL_MODE_MAXIMUM_RESOLUTION)
                }
                outputs += out
            }
        }
        val sessionCfg = SessionConfiguration(
            SessionConfiguration.SESSION_REGULAR, outputs, executor,
            object : CameraCaptureSession.StateCallback() {
                override fun onConfigured(s: CameraCaptureSession) {
                    if (gen != generation) { s.close(); return }
                    session = s
                    applyRepeating()
                    listener?.onCameraReady(cfg.copy(videoRes = resolutionOf(streamSize, cfg.videoRes)), c)
                }

                override fun onConfigureFailed(s: CameraCaptureSession) {
                    Log.e(TAG, "configure failed for $streamSize")
                    if (gen != generation) return
                    // Fall back: drop high-res stills first, then step the video size down.
                    val smaller = c.photoSizes.filter { it.pixels < cfg.photo.pixels }.maxByOrNull { it.pixels }
                    val retry = when {
                        // Drop the extras first: 10-bit, then RAW.
                        cfg.hlg || cfg.direct != null -> cfg.copy(hlg = false, direct = null)
                        cfg.raw -> cfg.copy(raw = false)
                        cfg.mode == CaptureMode.PHOTO && smaller != null -> cfg.copy(photo = smaller)
                        cfg.mode == CaptureMode.VIDEO && cfg.videoRes != VideoResolution.HD ->
                            cfg.copy(videoRes = VideoResolution.entries[cfg.videoRes.ordinal - 1])
                        else -> null
                    }
                    closeInternal()
                    if (retry != null) {
                        listener?.onCameraError("Falling back: this camera couldn't stream that combination")
                        openInternal(retry)
                    } else {
                        listener?.onCameraError("Camera session failed")
                    }
                }
            },
        )
        try {
            dev.createCaptureSession(sessionCfg)
        } catch (e: Exception) {
            Log.e(TAG, "createCaptureSession", e)
            listener?.onCameraError("Camera session failed")
        }
    }

    private fun resolutionOf(size: Size, fallback: VideoResolution) =
        VideoResolution.entries.firstOrNull { it.width == size.width && it.height == size.height } ?: fallback

    private fun closeInternal() {
        val surface = previewSurface
        generation++
        runCatching { session?.close() }
        runCatching { device?.close() }
        runCatching { reader?.close() }
        runCatching { rawReader?.close() }
        runCatching { rawImage?.close() }
        session = null
        device = null
        reader = null
        rawReader = null
        rawImage = null
        rawResult = null
        directOn = false
        previewSurface = null
        pendingStill?.invoke(null)
        pendingStill = null
        precaptureFrames = -1
        // Only our own stream: an imported clip may already be playing into the engine.
        engine.closeCameraInput(surface ?: return)
    }

    // ------------------------------------------------------------------ requests

    private fun applyRepeating() {
        val dev = device ?: return
        val s = session ?: return
        val surface = previewSurface ?: return
        val cfg = config ?: return
        try {
            val template = if (cfg.mode == CaptureMode.VIDEO) CameraDevice.TEMPLATE_RECORD else CameraDevice.TEMPLATE_PREVIEW
            val b = dev.createCaptureRequest(template)
            b.addTarget(surface)
            // While a 10-bit take runs, the camera feeds the encoder directly as well.
            if (directOn) cfg.direct?.let { b.addTarget(it) }
            fill(b, still = false)
            s.setRepeatingRequest(b.build(), captureCallback, handler)
        } catch (e: Exception) {
            Log.e(TAG, "setRepeatingRequest", e)
        }
    }

    /** Starts or stops the camera writing into the 10-bit encoder surface. */
    fun setDirectRecording(on: Boolean) = handler.post {
        directOn = on
        applyRepeating()
    }

    /** Clockwise rotation that stands a sensor-oriented frame upright for [quarterTurns]. */
    fun uprightRotation(quarterTurns: Int): Int {
        val c = caps ?: return 90
        val deg = (quarterTurns and 3) * 90
        return if (c.front) (c.sensorOrientation - deg + 360) % 360 else (c.sensorOrientation + deg) % 360
    }

    /** True when exposure is set by hand (real shutter speed). */
    private fun manual() = realShutter && caps?.manualSensor == true

    /**
     * Log puts 18% grey low, like a cinema camera, to leave room above it for highlights.
     * Returns the stops of underexposure actually applied (AE steps are coarse).
     */
    private fun logUnder(c: CameraCaps): Float {
        // HLG keeps its own highlight headroom: expose normally.
        if (config?.log != true || config?.hlg == true) return 0f
        if (manual() || c.evStep <= 0f) return LogCurve.UNDER
        val idx = ((exposureEv - LogCurve.UNDER) / c.evStep).roundToInt().coerceIn(c.evRange.lower, c.evRange.upper)
        return (exposureEv - idx * c.evStep).coerceAtLeast(0f)
    }

    /** Exposure compensation to send, log offset included. */
    private fun effectiveEv(c: CameraCaps) = exposureEv - logUnder(c)

    /** Stops of underexposure the log curve gives back, and whether the ISP applies it. */
    @Volatile var appliedLogUnder = 0f
        private set
    @Volatile var logInIsp = false
        private set

    private fun fill(b: CaptureRequest.Builder, still: Boolean) {
        val c = caps ?: return
        val cfg = config ?: return
        val video = cfg.mode == CaptureMode.VIDEO

        // Focus: continuous, or locked on a tapped point.
        val region = focusRegion
        if (region != null && CameraMetadata.CONTROL_AF_MODE_AUTO in c.afModes) {
            b.set(CaptureRequest.CONTROL_AF_MODE, CameraMetadata.CONTROL_AF_MODE_AUTO)
            b.set(CaptureRequest.CONTROL_AF_REGIONS, arrayOf(region))
            b.set(CaptureRequest.CONTROL_AE_REGIONS, arrayOf(region))
        } else {
            val af = when {
                video && CameraMetadata.CONTROL_AF_MODE_CONTINUOUS_VIDEO in c.afModes -> CameraMetadata.CONTROL_AF_MODE_CONTINUOUS_VIDEO
                CameraMetadata.CONTROL_AF_MODE_CONTINUOUS_PICTURE in c.afModes -> CameraMetadata.CONTROL_AF_MODE_CONTINUOUS_PICTURE
                else -> null
            }
            if (af != null) b.set(CaptureRequest.CONTROL_AF_MODE, af)
        }

        // Exposure: auto with compensation, or a real shutter speed with the ISO worked out.
        val frameNs = if (video) 1_000_000_000L / cfg.fps else 33_333_333L
        if (manual()) {
            val expRange = c.exposureRange
            var exp = (shutterSeconds * 1e9).toLong()
            if (video) exp = min(exp, frameNs)
            if (expRange != null) exp = exp.coerceIn(expRange.lower, expRange.upper)
            val baseExp = if (lastExposureNs > 0) lastExposureNs else 16_666_666L
            val baseIso = if (lastIso > 0) lastIso else 200
            var iso = (baseIso * baseExp.toDouble() / exp * 2.0.pow(effectiveEv(c).toDouble())).roundToInt()
            c.isoRange?.let { iso = iso.coerceIn(it.lower, it.upper) }
            b.set(CaptureRequest.CONTROL_AE_MODE, CameraMetadata.CONTROL_AE_MODE_OFF)
            b.set(CaptureRequest.SENSOR_EXPOSURE_TIME, exp)
            b.set(CaptureRequest.SENSOR_SENSITIVITY, iso)
            b.set(CaptureRequest.SENSOR_FRAME_DURATION, max(exp, frameNs))
            if (still && flash && c.hasFlash) b.set(CaptureRequest.FLASH_MODE, CameraMetadata.FLASH_MODE_SINGLE)
        } else {
            val photoFlash = !video && flash && c.hasFlash
            b.set(
                CaptureRequest.CONTROL_AE_MODE,
                if (photoFlash) CameraMetadata.CONTROL_AE_MODE_ON_ALWAYS_FLASH else CameraMetadata.CONTROL_AE_MODE_ON,
            )
            if (c.evStep > 0f) {
                val idx = (effectiveEv(c) / c.evStep).roundToInt().coerceIn(c.evRange.lower, c.evRange.upper)
                b.set(CaptureRequest.CONTROL_AE_EXPOSURE_COMPENSATION, idx)
            }
            (if (video) c.fpsRange(cfg.fps) else c.fpsRange(30))?.let { b.set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, it) }
        }
        if (video && c.hasFlash) {
            b.set(CaptureRequest.FLASH_MODE, if (flash) CameraMetadata.FLASH_MODE_TORCH else CameraMetadata.FLASH_MODE_OFF)
        }

        // Zoom: on multi-lens cameras the zoom ratio is what picks the physical lens.
        val want = cfg.lens.zoom * userZoom
        val range = c.zoomRange
        if (Build.VERSION.SDK_INT >= 30 && range != null) {
            b.set(CaptureRequest.CONTROL_ZOOM_RATIO, want.coerceIn(range.lower, range.upper))
        } else {
            val z = want.coerceIn(1f, max(1f, c.maxDigitalZoom))
            val a = c.activeArray
            val w = (a.width() / z).roundToInt()
            val h = (a.height() / z).roundToInt()
            b.set(CaptureRequest.SCALER_CROP_REGION, Rect(a.centerX() - w / 2, a.centerY() - h / 2, a.centerX() + w / 2, a.centerY() + h / 2))
        }

        // Log: an S-Log3 curve on the sensor's linear signal in place of the phone's picture
        // style, and no extra sharpening (it bakes in halos a grade can't take out).
        val log = video && cfg.log && !cfg.hlg
        val under = if (log) logUnder(c) else 0f
        val isp = log && c.contrastCurve && !ispCurveRejected
        if (!still && (under != appliedLogUnder || isp != logInIsp)) {
            appliedLogUnder = under
            logInIsp = isp
            listener?.onLogState(under, isp)
        }
        if (logInIsp) {
            b.set(CaptureRequest.TONEMAP_MODE, CameraMetadata.TONEMAP_MODE_CONTRAST_CURVE)
            b.set(CaptureRequest.TONEMAP_CURVE, LogCurve.tonemap(min(c.maxCurvePoints, 64), appliedLogUnder))
            if (CameraMetadata.EDGE_MODE_OFF in c.edgeModes) b.set(CaptureRequest.EDGE_MODE, CameraMetadata.EDGE_MODE_OFF)
        }

        if (video && c.stabilization) {
            b.set(
                CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE,
                if (stabilization) CameraMetadata.CONTROL_VIDEO_STABILIZATION_MODE_ON else CameraMetadata.CONTROL_VIDEO_STABILIZATION_MODE_OFF,
            )
        }
    }

    private val captureCallback = object : CameraCaptureSession.CaptureCallback() {
        override fun onCaptureCompleted(s: CameraCaptureSession, request: CaptureRequest, result: TotalCaptureResult) {
            // Some phones list custom tone curves but quietly use their own. Check what was
            // applied; if it wasn't ours, make log on the GPU instead of showing a wrong picture.
            if (logInIsp && request.get(CaptureRequest.TONEMAP_MODE) == CameraMetadata.TONEMAP_MODE_CONTRAST_CURVE &&
                result.get(CaptureResult.TONEMAP_MODE) != CameraMetadata.TONEMAP_MODE_CONTRAST_CURVE
            ) {
                Log.w(TAG, "tone curve not applied (${result.get(CaptureResult.TONEMAP_MODE)}); log falls back to the GPU")
                ispCurveRejected = true
                applyRepeating()
            }
            if (!manual()) {
                result.get(CaptureResult.SENSOR_EXPOSURE_TIME)?.let { if (it > 0) lastExposureNs = it }
                result.get(CaptureResult.SENSOR_SENSITIVITY)?.let { if (it > 0) lastIso = it }
            }
            if (precaptureFrames >= 0) {
                precaptureFrames++
                val ae = result.get(CaptureResult.CONTROL_AE_STATE)
                val settled = ae == null || ae == CaptureResult.CONTROL_AE_STATE_CONVERGED ||
                    ae == CaptureResult.CONTROL_AE_STATE_FLASH_REQUIRED || ae == CaptureResult.CONTROL_AE_STATE_LOCKED
                if ((settled && precaptureFrames > 3) || precaptureFrames > 45) {
                    precaptureFrames = -1
                    shoot()
                }
            }
        }
    }

    // ------------------------------------------------------------------ focus

    /** Focus and meter on a point of the camera stream, in 0..1 buffer coordinates (y down). */
    fun focusAt(bufferX: Float, bufferY: Float) = handler.post {
        val c = caps ?: return@post
        val a = c.activeArray
        // The stream is the active array cropped to its own aspect ratio.
        val streamAspect = streamSize.width.toFloat() / streamSize.height
        val arrayAspect = a.width().toFloat() / a.height()
        var visW = a.width().toFloat()
        var visH = a.height().toFloat()
        if (streamAspect > arrayAspect) visH = visW / streamAspect else visW = visH * streamAspect
        val x = a.left + (a.width() - visW) / 2f + bufferX.coerceIn(0f, 1f) * visW
        val y = a.top + (a.height() - visH) / 2f + bufferY.coerceIn(0f, 1f) * visH
        val r = min(a.width(), a.height()) * 0.06f
        focusRegion = MeteringRectangle(
            (x - r).roundToInt().coerceIn(a.left, a.right - 1), (y - r).roundToInt().coerceIn(a.top, a.bottom - 1),
            (r * 2).roundToInt(), (r * 2).roundToInt(), MeteringRectangle.METERING_WEIGHT_MAX - 1,
        )
        applyRepeating()
        triggerAf()
        handler.removeCallbacks(clearFocus)
        handler.postDelayed(clearFocus, 5000)
    }

    private val clearFocus = Runnable { focusRegion = null; applyRepeating() }

    private fun triggerAf() {
        val dev = device ?: return
        val s = session ?: return
        val surface = previewSurface ?: return
        try {
            val b = dev.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW)
            b.addTarget(surface)
            fill(b, still = false)
            b.set(CaptureRequest.CONTROL_AF_TRIGGER, CameraMetadata.CONTROL_AF_TRIGGER_START)
            s.capture(b.build(), null, handler)
        } catch (e: Exception) {
            Log.w(TAG, "af trigger", e)
        }
    }

    // ------------------------------------------------------------------ stills

    /** Shoots a full-resolution JPEG. [quarterTurns] is how the phone is held. */
    fun takePicture(quarterTurns: Int, done: (StillJpeg?) -> Unit) = handler.post {
        val c = caps
        if (c == null || reader == null || session == null || pendingStill != null) { done(null); return@post }
        pendingStill = done
        val deg = (quarterTurns and 3) * 90
        pendingRotation = if (c.front) (c.sensorOrientation - deg + 360) % 360 else (c.sensorOrientation + deg) % 360
        if (flash && c.hasFlash && !manual()) startPrecapture() else shoot()
        handler.postDelayed({
            if (pendingStill === done) { pendingStill = null; done(null) }
        }, 8000)
    }

    private fun startPrecapture() {
        val dev = device ?: return shoot()
        val s = session ?: return shoot()
        val surface = previewSurface ?: return shoot()
        try {
            val b = dev.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW)
            b.addTarget(surface)
            fill(b, still = true)
            b.set(CaptureRequest.CONTROL_AE_PRECAPTURE_TRIGGER, CameraMetadata.CONTROL_AE_PRECAPTURE_TRIGGER_START)
            s.capture(b.build(), null, handler)
            precaptureFrames = 0
        } catch (e: Exception) {
            shoot()
        }
    }

    private fun shoot() {
        val dev = device ?: return failStill()
        val s = session ?: return failStill()
        val r = reader ?: return failStill()
        val cfg = config ?: return failStill()
        try {
            val b = dev.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE)
            b.addTarget(r.surface)
            val maxRes = cfg.photo.maxRes && Build.VERSION.SDK_INT >= 31
            // Full-resolution captures can only go to streams set up for that mode.
            if (!maxRes) previewSurface?.let { b.addTarget(it) }
            val raw = if (!maxRes) rawReader else null
            raw?.let { b.addTarget(it.surface) }
            fill(b, still = true)
            pendingZoomCrop = 1f
            if (maxRes) {
                b.set(CaptureRequest.SENSOR_PIXEL_MODE, CameraMetadata.SENSOR_PIXEL_MODE_MAXIMUM_RESOLUTION)
                // The sensor's full mode reads the whole array; the GPU crops the zoom instead.
                if (caps?.zoomRange != null) b.set(CaptureRequest.CONTROL_ZOOM_RATIO, 1f)
                b.set(CaptureRequest.CONTROL_AF_REGIONS, null)
                b.set(CaptureRequest.CONTROL_AE_REGIONS, null)
                pendingZoomCrop = (cfg.lens.zoom * userZoom).coerceAtLeast(1f)
            }
            // Keep the pixels in sensor orientation; the film pipeline turns them upright.
            b.set(CaptureRequest.JPEG_ORIENTATION, 0)
            b.set(CaptureRequest.JPEG_QUALITY, 97.toByte())
            rawImage?.close(); rawImage = null; rawResult = null
            rawRotation = pendingRotation
            val callback = if (raw == null) null else object : CameraCaptureSession.CaptureCallback() {
                override fun onCaptureCompleted(s: CameraCaptureSession, r: CaptureRequest, result: TotalCaptureResult) {
                    rawResult = result
                    writeDng()
                }
            }
            s.capture(b.build(), callback, handler)
        } catch (e: Exception) {
            Log.e(TAG, "still capture", e)
            failStill()
        }
    }

    private fun failStill() {
        pendingStill?.invoke(null)
        pendingStill = null
    }

    private fun onRaw(r: ImageReader) {
        val image = runCatching { r.acquireNextImage() }.getOrNull() ?: return
        rawImage?.close()
        rawImage = image
        writeDng()
    }

    /** Once the raw frame and its capture result are both in: a DNG, upright by its tag. */
    private fun writeDng() {
        val image = rawImage ?: return
        val result = rawResult ?: return
        val c = caps ?: return
        rawImage = null
        rawResult = null
        try {
            val out = java.io.ByteArrayOutputStream(image.width * image.height * 2 + 65536)
            android.hardware.camera2.DngCreator(c.characteristics, result).use { dng ->
                dng.setOrientation(when ((rawRotation / 90) and 3) {
                    1 -> android.media.ExifInterface.ORIENTATION_ROTATE_90
                    2 -> android.media.ExifInterface.ORIENTATION_ROTATE_180
                    3 -> android.media.ExifInterface.ORIENTATION_ROTATE_270
                    else -> android.media.ExifInterface.ORIENTATION_NORMAL
                })
                dng.writeImage(out, image)
            }
            listener?.onRawCaptured(out.toByteArray())
        } catch (e: Exception) {
            Log.e(TAG, "dng", e)
        } finally {
            image.close()
        }
    }

    private fun onJpeg(r: ImageReader) {
        val image = runCatching { r.acquireNextImage() }.getOrNull() ?: return
        val bytes = try {
            val buf = image.planes[0].buffer
            ByteArray(buf.remaining()).also { buf.get(it) }
        } finally {
            image.close()
        }
        val cb = pendingStill ?: return
        pendingStill = null
        cb(StillJpeg(bytes, pendingRotation, caps?.front == true, pendingZoomCrop))
    }

    companion object {
        private const val TAG = "Camera2Controller"
    }
}

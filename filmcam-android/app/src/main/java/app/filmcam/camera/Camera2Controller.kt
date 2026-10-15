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

/** A JPEG straight off the sensor, plus how to turn it upright. */
class StillJpeg(val bytes: ByteArray, val rotationCw: Int, val mirror: Boolean)

/** How the camera should be opened. Changing any of this rebuilds the session. */
data class CameraConfig(
    val lens: Lens,
    val mode: CaptureMode,
    val videoRes: VideoResolution,
    val photoRes: PhotoResolution,
    val fps: Int,
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
    private var streamSize = Size(1920, 1080)
    private var highResFailed = false

    private var lastExposureNs = 0L
    private var lastIso = 0
    private var focusRegion: MeteringRectangle? = null
    private var pendingStill: ((StillJpeg?) -> Unit)? = null
    private var pendingRotation = 0
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
                        handler.post { if (gen == generation) createSession(surface, gen) }
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
        val outputs = arrayListOf(OutputConfiguration(surface))
        if (cfg.mode == CaptureMode.PHOTO) {
            val js = c.jpegSize(cfg.photoRes, allowHighRes = !highResFailed)
            reader = ImageReader.newInstance(js.width, js.height, ImageFormat.JPEG, 2).also { r ->
                r.setOnImageAvailableListener({ onJpeg(it) }, handler)
                outputs += OutputConfiguration(r.surface)
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
                    val retry = when {
                        cfg.mode == CaptureMode.PHOTO && !highResFailed && c.hasHighResJpeg -> { highResFailed = true; cfg }
                        cfg.mode == CaptureMode.VIDEO && cfg.videoRes != VideoResolution.FHD ->
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
        generation++
        runCatching { session?.close() }
        runCatching { device?.close() }
        runCatching { reader?.close() }
        session = null
        device = null
        reader = null
        previewSurface = null
        pendingStill?.invoke(null)
        pendingStill = null
        precaptureFrames = -1
        engine.closeCameraInput()
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
            fill(b, still = false)
            s.setRepeatingRequest(b.build(), captureCallback, handler)
        } catch (e: Exception) {
            Log.e(TAG, "setRepeatingRequest", e)
        }
    }

    /** True when exposure is set by hand (real shutter speed). */
    private fun manual() = realShutter && caps?.manualSensor == true

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
            var iso = (baseIso * baseExp.toDouble() / exp * 2.0.pow(exposureEv.toDouble())).roundToInt()
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
                val idx = (exposureEv / c.evStep).roundToInt().coerceIn(c.evRange.lower, c.evRange.upper)
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

        if (video && c.stabilization) {
            b.set(
                CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE,
                if (stabilization) CameraMetadata.CONTROL_VIDEO_STABILIZATION_MODE_ON else CameraMetadata.CONTROL_VIDEO_STABILIZATION_MODE_OFF,
            )
        }
    }

    private val captureCallback = object : CameraCaptureSession.CaptureCallback() {
        override fun onCaptureCompleted(s: CameraCaptureSession, request: CaptureRequest, result: TotalCaptureResult) {
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
        try {
            val b = dev.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE)
            b.addTarget(r.surface)
            previewSurface?.let { b.addTarget(it) }
            fill(b, still = true)
            // Keep the pixels in sensor orientation; the film pipeline turns them upright.
            b.set(CaptureRequest.JPEG_ORIENTATION, 0)
            b.set(CaptureRequest.JPEG_QUALITY, 97.toByte())
            s.capture(b.build(), null, handler)
        } catch (e: Exception) {
            Log.e(TAG, "still capture", e)
            failStill()
        }
    }

    private fun failStill() {
        pendingStill?.invoke(null)
        pendingStill = null
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
        cb(StillJpeg(bytes, pendingRotation, caps?.front == true))
    }

    companion object {
        private const val TAG = "Camera2Controller"
    }
}

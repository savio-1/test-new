package app.filmcam.camera

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CaptureRequest
import android.util.Log
import android.util.Range
import android.util.Size
import android.view.Display
import android.view.Surface
import androidx.camera.camera2.interop.Camera2CameraInfo
import androidx.camera.camera2.interop.Camera2Interop
import androidx.camera.camera2.interop.ExperimentalCamera2Interop
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.DisplayOrientedMeteringPointFactory
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import app.filmcam.gl.FilmEngine
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.math.max
import kotlin.math.roundToInt

enum class CaptureMode { PHOTO, VIDEO }

/** CameraX glue: a Preview feeding the film engine, plus ImageCapture for full-res stills. */
class CameraController(
    private val context: Context,
    private val owner: LifecycleOwner,
    private val engine: FilmEngine,
) {
    private var provider: ProcessCameraProvider? = null
    private var camera: Camera? = null
    private var imageCapture: ImageCapture? = null
    private val ioExecutor = Executors.newSingleThreadExecutor()

    var lensFacing = CameraSelector.LENS_FACING_BACK
        private set
    var mode = CaptureMode.PHOTO
        private set
    var flashOn = false
        private set

    var onCameraReady: ((hasFlash: Boolean, evStep: Float, evMin: Float, evMax: Float) -> Unit)? = null

    fun start() {
        val future = ProcessCameraProvider.getInstance(context)
        future.addListener({
            provider = future.get()
            if (provider?.hasCamera(selector()) != true) {
                lensFacing = if (lensFacing == CameraSelector.LENS_FACING_BACK) CameraSelector.LENS_FACING_FRONT else CameraSelector.LENS_FACING_BACK
            }
            bind()
        }, ContextCompat.getMainExecutor(context))
    }

    private fun selector() = CameraSelector.Builder().requireLensFacing(lensFacing).build()

    fun setMode(m: CaptureMode) {
        if (m == mode) return
        mode = m
        bind()
    }

    fun switchLens() {
        val other = if (lensFacing == CameraSelector.LENS_FACING_BACK) CameraSelector.LENS_FACING_FRONT else CameraSelector.LENS_FACING_BACK
        val p = provider ?: return
        if (!p.hasCamera(CameraSelector.Builder().requireLensFacing(other).build())) return
        lensFacing = other
        bind()
    }

    @androidx.annotation.OptIn(ExperimentalCamera2Interop::class)
    private fun bind() {
        val p = provider ?: return
        engine.outputAspect = if (mode == CaptureMode.PHOTO) 3f / 4f else 9f / 16f
        engine.videoMode = mode == CaptureMode.VIDEO
        val ratio = if (mode == CaptureMode.PHOTO) androidx.camera.core.AspectRatio.RATIO_4_3 else androidx.camera.core.AspectRatio.RATIO_16_9
        val previewSize = if (mode == CaptureMode.PHOTO) Size(1440, 1080) else Size(1920, 1080)
        val previewSelector = ResolutionSelector.Builder()
            .setAspectRatioStrategy(AspectRatioStrategy(ratio, AspectRatioStrategy.FALLBACK_RULE_AUTO))
            .setResolutionStrategy(ResolutionStrategy(previewSize, ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER))
            .build()

        val previewBuilder = Preview.Builder()
            .setResolutionSelector(previewSelector)
            .setTargetRotation(Surface.ROTATION_0)
        if (mode == CaptureMode.VIDEO) {
            pickFpsRange(p)?.let {
                Camera2Interop.Extender(previewBuilder).setCaptureRequestOption(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, it)
            }
        }
        val preview = previewBuilder.build().also { it.surfaceProvider = engine.surfaceProvider }

        imageCapture = if (mode == CaptureMode.PHOTO) {
            ImageCapture.Builder()
                .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                .setResolutionSelector(
                    ResolutionSelector.Builder()
                        .setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY)
                        .setResolutionStrategy(ResolutionStrategy(Size(4032, 3024), ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER))
                        .build(),
                )
                .setFlashMode(if (flashOn) ImageCapture.FLASH_MODE_ON else ImageCapture.FLASH_MODE_OFF)
                .build()
        } else null

        try {
            p.unbindAll()
            val useCases = listOfNotNull(preview, imageCapture).toTypedArray()
            camera = p.bindToLifecycle(owner, selector(), *useCases)
            camera?.let { cam ->
                val ex = cam.cameraInfo.exposureState
                val step = ex.exposureCompensationStep.toFloat()
                onCameraReady?.invoke(
                    cam.cameraInfo.hasFlashUnit(), step,
                    ex.exposureCompensationRange.lower * step, ex.exposureCompensationRange.upper * step,
                )
                if (mode == CaptureMode.VIDEO && flashOn) cam.cameraControl.enableTorch(true)
            }
            setExposure(engine.look.exposureEv)
        } catch (e: Exception) {
            Log.e(TAG, "bind failed", e)
        }
    }

    /** Highest-frame-rate range that tops out at 30 and doesn't dip below 24 if possible. */
    @androidx.annotation.OptIn(ExperimentalCamera2Interop::class)
    private fun pickFpsRange(p: ProcessCameraProvider): Range<Int>? = try {
        val info = p.availableCameraInfos.firstOrNull { selector().filter(listOf(it)).isNotEmpty() } ?: return null
        val ranges = Camera2CameraInfo.from(info)
            .getCameraCharacteristic(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES) ?: return null
        ranges.filter { it.upper == 30 }.maxByOrNull { it.lower }
    } catch (e: Exception) {
        null
    }

    fun setFlash(on: Boolean) {
        flashOn = on
        imageCapture?.flashMode = if (on) ImageCapture.FLASH_MODE_ON else ImageCapture.FLASH_MODE_OFF
        if (mode == CaptureMode.VIDEO) camera?.cameraControl?.enableTorch(on)
    }

    fun setExposure(ev: Float) {
        val cam = camera ?: return
        val ex = cam.cameraInfo.exposureState
        if (!ex.isExposureCompensationSupported) return
        val step = ex.exposureCompensationStep.toFloat()
        if (step <= 0f) return
        val idx = (ev / step).roundToInt().coerceIn(ex.exposureCompensationRange.lower, ex.exposureCompensationRange.upper)
        cam.cameraControl.setExposureCompensationIndex(idx)
    }

    fun zoomBy(scale: Float) {
        val cam = camera ?: return
        val z = cam.cameraInfo.zoomState.value ?: return
        cam.cameraControl.setZoomRatio((z.zoomRatio * scale).coerceIn(z.minZoomRatio, z.maxZoomRatio))
    }

    fun focusAt(display: Display, viewW: Float, viewH: Float, x: Float, y: Float) {
        val cam = camera ?: return
        val factory = DisplayOrientedMeteringPointFactory(display, cam.cameraInfo, viewW, viewH)
        val action = FocusMeteringAction.Builder(factory.createPoint(x, y))
            .setAutoCancelDuration(4, TimeUnit.SECONDS)
            .build()
        cam.cameraControl.startFocusAndMetering(action)
    }

    /**
     * Takes a full-resolution still and returns it decoded, upright for how the phone was
     * held ([quarterTurns]) and mirrored for the selfie camera to match the preview.
     */
    fun takePicture(quarterTurns: Int, maxSide: Int, onResult: (Bitmap?) -> Unit) {
        val ic = imageCapture ?: return onResult(null)
        ic.targetRotation = when (quarterTurns and 3) {
            1 -> Surface.ROTATION_270
            2 -> Surface.ROTATION_180
            3 -> Surface.ROTATION_90
            else -> Surface.ROTATION_0
        }
        val mirror = lensFacing == CameraSelector.LENS_FACING_FRONT
        ic.takePicture(ioExecutor, object : ImageCapture.OnImageCapturedCallback() {
            override fun onCaptureSuccess(image: ImageProxy) {
                val bmp = try {
                    decode(image, maxSide, mirror)
                } catch (e: Throwable) {
                    Log.e(TAG, "decode", e)
                    null
                } finally {
                    image.close()
                }
                onResult(bmp)
            }

            override fun onError(exception: ImageCaptureException) {
                Log.e(TAG, "capture failed", exception)
                onResult(null)
            }
        })
    }

    private fun decode(image: ImageProxy, maxSide: Int, mirror: Boolean): Bitmap? {
        val rotation = image.imageInfo.rotationDegrees
        val raw: Bitmap = if (image.format == android.graphics.ImageFormat.JPEG) {
            val buf = image.planes[0].buffer
            val bytes = ByteArray(buf.remaining()).also { buf.get(it) }
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
            var sample = 1
            while (max(bounds.outWidth, bounds.outHeight) / sample > maxSide * 1.5f) sample *= 2
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
                ?: return null
        } else {
            image.toBitmap()
        }
        val longest = max(raw.width, raw.height)
        val scale = if (longest > maxSide) maxSide.toFloat() / longest else 1f
        if (rotation == 0 && scale == 1f && !mirror) return raw
        val m = Matrix().apply {
            postRotate(rotation.toFloat())
            if (mirror) postScale(-1f, 1f)
            if (scale != 1f) postScale(scale, scale)
        }
        val out = Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, m, true)
        if (out !== raw) raw.recycle()
        return out
    }

    fun shutdown() {
        provider?.unbindAll()
        ioExecutor.shutdown()
    }

    companion object {
        private const val TAG = "CameraController"
    }
}

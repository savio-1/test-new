package app.filmcam.camera

import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.SurfaceTexture
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CameraMetadata
import android.os.Build
import android.util.Log
import android.util.Range
import android.util.Size
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.roundToInt

enum class CaptureMode { PHOTO, VIDEO }

enum class VideoResolution(val label: String, val width: Int, val height: Int) {
    HD("720p", 1280, 720),
    FHD("1080p", 1920, 1080),
    UHD("4K", 3840, 2160),
    UHD8K("8K", 7680, 4320),
}

/**
 * A still size the sensor offers. [maxRes] sizes need the sensor's full-resolution pixel mode
 * (the 50/108/200 MP modes of quad-Bayer sensors); [highRes] ones are slow "burst-less" sizes.
 */
data class PhotoSize(val width: Int, val height: Int, val highRes: Boolean = false, val maxRes: Boolean = false) {
    val pixels get() = width.toLong() * height
    val mp: Int get() = ((pixels + 500_000) / 1_000_000).toInt().coerceAtLeast(1)
    val label get() = "$mp MP"
    val size get() = Size(width, height)
}

/**
 * Frame shapes, as width:height with the phone upright. The frame turns with the phone, so
 * 9:16 becomes 16:9 when it is held sideways.
 */
enum class AspectRatio(val w: Int, val h: Int) {
    R3_4(3, 4),
    R4_5(4, 5),
    R1_1(1, 1),
    R2_3(2, 3),
    R9_16(9, 16);

    val value get() = w.toFloat() / h
    /** The label for how the phone is held: 3:4 upright, 4:3 sideways. */
    fun label(sideways: Boolean) = if (sideways && w != h) "$h:$w" else "$w:$h"
}

/** One button on the lens row: a camera, and the zoom ratio that selects a lens on it. */
data class Lens(
    val cameraId: String,
    /** CONTROL_ZOOM_RATIO to request; on multi-lens cameras this is what switches lenses. */
    val zoom: Float,
    val front: Boolean,
    /** 35mm-equivalent focal length. */
    val eqMm: Int,
    val label: String,
    /** Magnification relative to the main camera (0.5 for an ultra-wide, 3 for a 3x tele). */
    val ratio: Float = 1f,
) {
    val key get() = "$cameraId@$zoom"
}

/** What one camera can do. */
class CameraCaps(val id: String, ch: CameraCharacteristics) {
    val front = ch.get(CameraCharacteristics.LENS_FACING) == CameraMetadata.LENS_FACING_FRONT
    val sensorOrientation = ch.get(CameraCharacteristics.SENSOR_ORIENTATION) ?: 90
    val activeArray: Rect = ch.get(CameraCharacteristics.SENSOR_INFO_ACTIVE_ARRAY_SIZE) ?: Rect(0, 0, 4000, 3000)
    val zoomRange: Range<Float>? =
        if (Build.VERSION.SDK_INT >= 30) ch.get(CameraCharacteristics.CONTROL_ZOOM_RATIO_RANGE) else null
    val maxDigitalZoom = ch.get(CameraCharacteristics.SCALER_AVAILABLE_MAX_DIGITAL_ZOOM) ?: 1f
    val hasFlash = ch.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
    val afModes: IntArray = ch.get(CameraCharacteristics.CONTROL_AF_AVAILABLE_MODES) ?: IntArray(0)
    val fpsRanges: Array<Range<Int>> = ch.get(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES) ?: emptyArray()
    val evRange: Range<Int> = ch.get(CameraCharacteristics.CONTROL_AE_COMPENSATION_RANGE) ?: Range(0, 0)
    val evStep: Float = ch.get(CameraCharacteristics.CONTROL_AE_COMPENSATION_STEP)?.toFloat() ?: 0f
    private val capabilities = ch.get(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES) ?: IntArray(0)
    val manualSensor = CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_MANUAL_SENSOR in capabilities
    val isoRange: Range<Int>? = ch.get(CameraCharacteristics.SENSOR_INFO_SENSITIVITY_RANGE)
    val exposureRange: Range<Long>? = ch.get(CameraCharacteristics.SENSOR_INFO_EXPOSURE_TIME_RANGE)
    val stabilization = (ch.get(CameraCharacteristics.CONTROL_AVAILABLE_VIDEO_STABILIZATION_MODES) ?: IntArray(0))
        .contains(CameraMetadata.CONTROL_VIDEO_STABILIZATION_MODE_ON)
    val logical = CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_LOGICAL_MULTI_CAMERA in capabilities
    val physicalIds: Set<String> = if (logical) ch.physicalCameraIds else emptySet()

    /** 35mm-equivalent focal length of the widest physical lens at zoom 1. */
    val eqMm: Float = run {
        val f = ch.get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS)?.firstOrNull() ?: 4.3f
        val s = ch.get(CameraCharacteristics.SENSOR_INFO_PHYSICAL_SIZE)
        if (s != null && s.width > 0f) f * 43.27f / hypot(s.width, s.height) else 26f
    }

    private val map = ch.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
    private val streamSizes: List<Size> = map?.getOutputSizes(SurfaceTexture::class.java)?.toList() ?: emptyList()

    fun minFrameNs(size: Size): Long =
        runCatching { map?.getOutputMinFrameDuration(SurfaceTexture::class.java, size) ?: 0L }.getOrDefault(0L)

    /** 16:9 streams the camera can deliver at 24 fps or better. */
    val videoSizes: List<Size> = streamSizes
        .filter { abs(it.width.toFloat() / it.height - 16f / 9f) < 0.01f }
        .filter { minFrameNs(it) <= 1_000_000_000L / 24 + 100_000L }
        .sortedByDescending { it.width }

    /** 4:3 live-view stream for photo mode, no bigger than needed for a sharp screen. */
    val photoPreviewSize: Size = streamSizes
        .filter { abs(it.width.toFloat() / it.height - 4f / 3f) < 0.01f && it.width <= 2048 }
        .maxByOrNull { it.width } ?: streamSizes.firstOrNull() ?: Size(1440, 1080)

    private val jpegStandard: List<Size> = map?.getOutputSizes(ImageFormat.JPEG)?.toList() ?: emptyList()
    private val jpegHighRes: List<Size> =
        map?.getHighResolutionOutputSizes(ImageFormat.JPEG)?.toList() ?: emptyList()

    private fun is43(s: Size) = abs(s.width.toFloat() / s.height - 4f / 3f) < 0.02f

    /** Sizes from the sensor's full-resolution mode (quad-Bayer 50/200 MP), API 31+. */
    private val jpegMaxRes: List<Size> = if (Build.VERSION.SDK_INT >= 31 &&
        CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_ULTRA_HIGH_RESOLUTION_SENSOR in capabilities
    ) {
        ch.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP_MAXIMUM_RESOLUTION)
            ?.getOutputSizes(ImageFormat.JPEG)?.toList() ?: emptyList()
    } else emptyList()

    /** Active array of the full-resolution mode, for regions in max-res requests. */
    val maxResArray: Rect? = if (Build.VERSION.SDK_INT >= 31)
        ch.get(CameraCharacteristics.SENSOR_INFO_ACTIVE_ARRAY_SIZE_MAXIMUM_RESOLUTION) else null

    /**
     * The photo sizes worth offering, smallest first: about 12 MP, then every larger size the
     * sensor really has (e.g. 12, 50 and 200 MP on a 200 MP phone). 4:3 only, the sensor shape.
     */
    val photoSizes: List<PhotoSize> = run {
        val all = jpegStandard.filter(::is43).map { PhotoSize(it.width, it.height) } +
            jpegHighRes.filter(::is43).map { PhotoSize(it.width, it.height, highRes = true) } +
            jpegMaxRes.filter(::is43).map { PhotoSize(it.width, it.height, maxRes = true) }
        if (all.isEmpty()) return@run listOf(PhotoSize(4000, 3000))
        val base = all.filter { !it.highRes && !it.maxRes }.ifEmpty { all }
            .minBy { abs(it.pixels - 12_000_000L) }
        val out = arrayListOf(base)
        // Larger sizes, one per megapixel class; plain streams before high-res before max-res.
        all.filter { it.pixels > base.pixels * 1.3 }
            .sortedWith(compareBy<PhotoSize>({ it.maxRes }, { it.highRes }))
            .forEach { s -> if (out.none { abs(it.pixels - s.pixels) < s.pixels * 0.15 }) out += s }
        out.sortedBy { it.pixels }
    }

    /** The offered size closest to [mp] megapixels. */
    fun photoSize(mp: Int): PhotoSize = photoSizes.minBy { abs(it.pixels - mp * 1_000_000L) }

    val noiseModes: IntArray = ch.get(CameraCharacteristics.NOISE_REDUCTION_AVAILABLE_NOISE_REDUCTION_MODES) ?: IntArray(0)
    /** The camera can be told what each stream is for (video record, still), so it processes it as such. */
    val streamUseCases: LongArray = if (Build.VERSION.SDK_INT >= 33 &&
        CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_STREAM_USE_CASE in capabilities
    ) ch.get(CameraCharacteristics.SCALER_AVAILABLE_STREAM_USE_CASES) ?: LongArray(0) else LongArray(0)

    /** Kept for the DNG writer. */
    val characteristics: CameraCharacteristics = ch

    /** Largest RAW_SENSOR size, if the camera hands out raw frames. */
    val rawSize: Size? = if (CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_RAW in capabilities)
        map?.getOutputSizes(ImageFormat.RAW_SENSOR)?.maxByOrNull { it.width.toLong() * it.height } else null

    /** 10-bit HLG straight from the sensor (Android 13+, on phones that open it to apps). */
    val hlg10: Boolean = Build.VERSION.SDK_INT >= 33 &&
        CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_DYNAMIC_RANGE_TEN_BIT in capabilities &&
        ch.get(CameraCharacteristics.REQUEST_AVAILABLE_DYNAMIC_RANGE_PROFILES)?.supportedProfiles
            ?.contains(android.hardware.camera2.params.DynamicRangeProfiles.HLG10) == true

    /** Frame timestamps on the elapsed-realtime clock (else the monotonic one). */
    val realtimeTimestamps = ch.get(CameraCharacteristics.SENSOR_INFO_TIMESTAMP_SOURCE) ==
        CameraMetadata.SENSOR_INFO_TIMESTAMP_SOURCE_REALTIME

    /** Whether the camera can apply our own tone curve (needed for true log). */
    val contrastCurve: Boolean = (ch.get(CameraCharacteristics.TONEMAP_AVAILABLE_TONE_MAP_MODES) ?: IntArray(0))
        .contains(CameraMetadata.TONEMAP_MODE_CONTRAST_CURVE) && (ch.get(CameraCharacteristics.TONEMAP_MAX_CURVE_POINTS) ?: 0) >= 32
    val maxCurvePoints: Int = ch.get(CameraCharacteristics.TONEMAP_MAX_CURVE_POINTS) ?: 0
    /** A plain sRGB (or gamma) tone curve can be asked for: the GPU log path can then undo it exactly. */
    val presetCurve: Boolean = (ch.get(CameraCharacteristics.TONEMAP_AVAILABLE_TONE_MAP_MODES) ?: IntArray(0))
        .contains(CameraMetadata.TONEMAP_MODE_PRESET_CURVE)
    val gammaCurve: Boolean = (ch.get(CameraCharacteristics.TONEMAP_AVAILABLE_TONE_MAP_MODES) ?: IntArray(0))
        .contains(CameraMetadata.TONEMAP_MODE_GAMMA_VALUE)
    val edgeModes: IntArray = ch.get(CameraCharacteristics.EDGE_AVAILABLE_EDGE_MODES) ?: IntArray(0)

    /** Exact size for a resolution choice, or null if this camera can't stream it. */
    fun videoSize(res: VideoResolution): Size? = videoSizes.firstOrNull { it.width == res.width && it.height == res.height }

    fun supportsFps(size: Size, fps: Int): Boolean =
        minFrameNs(size) <= 1_000_000_000L / fps + 100_000L && fpsRanges.any { fps in it.lower..it.upper }

    /** AE frame-rate range for [fps]: fixed if possible, otherwise one that tops out there. */
    fun fpsRange(fps: Int): Range<Int>? =
        fpsRanges.firstOrNull { it.lower == fps && it.upper == fps }
            ?: fpsRanges.filter { it.upper == fps }.maxByOrNull { it.lower }
            ?: fpsRanges.filter { fps in it.lower..it.upper }.minByOrNull { it.upper }
}

/** Every camera on the phone, turned into the familiar row of lens buttons. */
class LensCatalog(manager: CameraManager) {
    val caps: Map<String, CameraCaps>
    val lenses: List<Lens>

    init {
        val all = LinkedHashMap<String, CameraCaps>()
        for (id in runCatching { manager.cameraIdList.toList() }.getOrDefault(emptyList())) {
            runCatching { all[id] = CameraCaps(id, manager.getCameraCharacteristics(id)) }
                .onFailure { Log.w(TAG, "camera $id", it) }
        }
        caps = all
        lenses = buildLenses(manager, all)
    }

    private fun buildLenses(manager: CameraManager, all: Map<String, CameraCaps>): List<Lens> {
        val out = ArrayList<Lens>()
        val backs = all.values.filter { !it.front }
        val main = backs.firstOrNull()
        if (main != null) {
            val mainEq = main.eqMm
            val range = main.zoomRange
            val candidates = ArrayList<Pair<Float, Lens>>() // eq -> lens
            fun add(cameraId: String, zoom: Float, eq: Float) {
                candidates += eq to Lens(cameraId, zoom, false, eq.roundToInt(), ratioLabel(eq / mainEq), eq / mainEq)
            }
            add(main.id, 1f, mainEq)
            // Lenses behind the main logical camera, reached through the zoom ratio.
            if (range != null) {
                if (range.lower < 0.95f) add(main.id, range.lower, mainEq * range.lower)
                for (pid in main.physicalIds) {
                    val pch = runCatching { manager.getCameraCharacteristics(pid) }.getOrNull() ?: continue
                    val peq = CameraCaps(pid, pch).eqMm
                    val ratio = peq / mainEq
                    if (ratio > 1.4f && ratio <= range.upper) add(main.id, (ratio * 10f).roundToInt() / 10f, peq)
                }
            }
            // Cameras the phone exposes on their own.
            for (c in backs) if (c !== main && c.id !in main.physicalIds) add(c.id, 1f, c.eqMm)
            // A 2x crop of the main sensor, if nothing sits near it.
            val upper = range?.upper ?: main.maxDigitalZoom
            if (upper >= 2f) add(main.id, 2f, mainEq * 2f)

            candidates.sortBy { it.first }
            for ((eq, lens) in candidates) {
                val near = out.any { abs(it.eqMm - eq) / eq < 0.12f }
                // Prefer the real lens over the 2x crop when they are close.
                if (!near) out += lens
                else if (lens.zoom != 2f || lens.cameraId != main.id) {
                    val idx = out.indexOfFirst { abs(it.eqMm - eq) / eq < 0.12f }
                    if (idx >= 0 && out[idx].zoom == 2f && out[idx].cameraId == main.id) out[idx] = lens
                }
            }
        }
        all.values.filter { it.front }.forEachIndexed { i, c ->
            out += Lens(c.id, 1f, true, c.eqMm.roundToInt(), if (i == 0) "Selfie" else "Selfie ${i + 1}")
        }
        return out
    }

    /** Most magnification any lens facing this way can reach, relative to the main camera. */
    fun maxZoom(front: Boolean): Float = lenses.filter { it.front == front }.maxOfOrNull { lens ->
        val c = caps[lens.cameraId] ?: return@maxOfOrNull lens.ratio
        val cameraMax = c.zoomRange?.upper ?: c.maxDigitalZoom
        lens.ratio / lens.zoom * cameraMax
    } ?: 1f

    fun minZoom(front: Boolean): Float = lenses.filter { it.front == front }.minOfOrNull { it.ratio } ?: 1f

    /**
     * The zoom buttons: every real lens, plus the usual 2x, 5x, 10x... steps the camera can
     * reach, without two buttons nearly the same.
     */
    fun zoomStops(front: Boolean): List<Float> {
        val max = maxZoom(front)
        val out = ArrayList<Float>()
        lenses.filter { it.front == front }.forEach { out += it.ratio }
        for (z in floatArrayOf(1f, 2f, 3f, 5f, 10f, 20f, 30f, 50f, 100f)) {
            if (z <= max * 1.01f && out.none { abs(it - z) / z < 0.15f }) out += z
        }
        out.sort()
        // Keep the row short: lenses always, then the round numbers.
        while (out.size > 7) {
            val lensRatios = lenses.filter { it.front == front }.map { it.ratio }
            val drop = out.filter { r -> lensRatios.none { abs(it - r) < 0.01f } && r != 10f }.maxOrNull() ?: break
            out.remove(drop)
        }
        return out
    }

    private fun ratioLabel(r: Float): String {
        val rounded = (r * 10f).roundToInt() / 10f
        return if (abs(rounded - rounded.roundToInt()) < 0.05f) "${rounded.roundToInt()}×" else "${"%.1f".format(rounded).trimStart('0')}×"
    }

    companion object {
        private const val TAG = "LensCatalog"
    }
}

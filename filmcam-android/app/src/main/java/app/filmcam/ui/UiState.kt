package app.filmcam.ui

import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.filmcam.camera.AspectRatio
import app.filmcam.camera.CaptureMode
import app.filmcam.camera.Lens
import app.filmcam.camera.PhotoSize
import app.filmcam.camera.VideoResolution
import app.filmcam.util.MediaItem
import app.filmcam.film.CameraCategory
import app.filmcam.film.FilmCamera
import app.filmcam.film.FilmCameras
import app.filmcam.film.FilmLook
import app.filmcam.film.FontLibrary
import app.filmcam.film.FrameStyle
import app.filmcam.film.StampStyle
import app.filmcam.film.TextLayer

/** The tray above the shutter. One at a time keeps the screen calm. */
enum class Dock(val label: String) { NONE(""), STYLES("Styles"), LOOKS("Looks"), ADJUST("Adjust"), FRAME("Frame"), TEXT("Text") }

/** How log is made, best first. */
enum class LogPath(val words: List<String>) {
    /** 10-bit HLG from the sensor straight into the encoder. */
    HLG10(listOf("HLG", "10-bit", "Rec.2020")),
    /** S-Log3 tone curve applied by the camera's processor, 8-bit. */
    ISP(listOf("S-Log3", "Rec.709", "in camera")),
    /** S-Log3 made on the GPU from the camera's normal picture. */
    GPU(listOf("S-Log3", "Rec.709", "approx.")),
}

/** The log curve the user prefers when the phone offers both. */
enum class LogCurveChoice(val label: String) { HLG("HLG 10-bit"), SLOG3("S-Log3") }

/** The small option panels opened from the chips above the viewfinder. */
enum class Quick { RATIO, SIZE, VIDEO, TIMER, BURST, LOG }

/** Full-screen places other than the camera. */
enum class Screen { CAMERA, GALLERY, VIEWER }

/** Shots in an interval burst (0 = until stopped) and the gap between them, in seconds. */
val BurstCounts = listOf(1, 3, 5, 10, 20, 0)
val BurstIntervals = listOf(0.5f, 1f, 2f, 5f, 10f, 30f)
val TimerChoices = listOf(0, 3, 5, 10)

/**
 * A picture or clip brought in from the gallery to develop with a look. The viewfinder shows
 * it instead of the camera; the shutter saves it.
 */
class EditSession(val uri: android.net.Uri, val video: Boolean, val width: Int, val height: Int, val durationMs: Long = 0L) {
    val aspect get() = width.toFloat() / height
}

/** What the ruler in the text tray changes. */
enum class TextTool(val label: String) { FONT("Font"), SIZE("Size"), ROTATE("Rotate"), OPACITY("Opacity"), SPACING("Spacing"), COLOR("Colour"), PLACE("Place") }

/** Everything the screen shows. Owned by the activity, mutated on the main thread. */
class UiState {
    var permissionAsked by mutableStateOf(false)
    var hasCamera by mutableStateOf(false)
    var theme by mutableStateOf(ThemeMode.SYSTEM)
    var mode by mutableStateOf(CaptureMode.PHOTO)
    var camera by mutableStateOf(FilmCameras.byId(null))
    var category by mutableStateOf(CameraCategory.FUJI)
    var look by mutableStateOf(FilmCameras.byId(null).look)
    /** Photographic style of the Original camera (kept while a look is on, for when it comes off). */
    var style by mutableStateOf(app.filmcam.film.StyleSetting())
    /** No look applied: the phone's own picture, with its photographic style. */
    val isOriginal get() = camera.id == FilmCameras.ORIGINAL.id

    // chrome
    var dock by mutableStateOf(Dock.NONE)
    var toolGroup by mutableStateOf(ToolGroup.BASIC)
    var toolId by mutableStateOf("exposure")
    /** True while a ruler or a text layer is being dragged: everything else steps aside. */
    var adjusting by mutableStateOf(false)
    var settingsOpen by mutableStateOf(false)
    var quick by mutableStateOf<Quick?>(null)
    var screen by mutableStateOf(Screen.CAMERA)

    // text overlays
    var fonts: FontLibrary? = null
    var fontsVersion by mutableIntStateOf(0)
    var textLayers by mutableStateOf<List<TextLayer>>(emptyList())
    var selectedText by mutableStateOf<Long?>(null)
    var textTool by mutableStateOf(TextTool.FONT)
    var editingText by mutableStateOf(false)
    var guideX by mutableStateOf(false)
    var guideY by mutableStateOf(false)

    // capture
    var recording by mutableStateOf(false)
    var recordStartMs by mutableLongStateOf(0L)
    var savingVideo by mutableStateOf(false)
    var developing by mutableIntStateOf(0)
    var halfFramePending by mutableStateOf(false)
    var sampling by mutableStateOf(false)
    var thumbnail by mutableStateOf<Bitmap?>(null)
    var lastUri by mutableStateOf<Uri?>(null)
    var lastIsVideo by mutableStateOf(false)
    var flashPulse by mutableIntStateOf(0)
    var message by mutableStateOf<String?>(null)

    // timer and interval shooting
    var timerSeconds by mutableIntStateOf(0)
    var burstCount by mutableIntStateOf(1)
    var burstInterval by mutableFloatStateOf(1f)
    /** Seconds left on the self-timer, 0 when it isn't running. */
    var countdown by mutableIntStateOf(0)
    /** Shots taken / due in a running burst; total 0 means "until stopped". */
    var burstTaken by mutableIntStateOf(0)
    var burstTotal by mutableIntStateOf(-1)
    val seriesRunning get() = countdown > 0 || burstTotal >= 0

    // gallery, viewer and imports
    var gallery by mutableStateOf<List<MediaItem>>(emptyList())
    var viewing by mutableStateOf<MediaItem?>(null)
    var edit by mutableStateOf<EditSession?>(null)
    /** Edit mode: null keeps the imported picture's own shape. */
    var editRatio by mutableStateOf<AspectRatio?>(null)
    /** 0..1 while exporting or trimming, -1 otherwise. */
    var progress by mutableFloatStateOf(-1f)
    var progressLabel by mutableStateOf("")

    // camera hardware
    var lenses by mutableStateOf<List<Lens>>(emptyList())
    var lens by mutableStateOf<Lens?>(null)
    /** Total magnification relative to the main camera, and the buttons to jump to. */
    var zoom by mutableFloatStateOf(1f)
    var zoomStops by mutableStateOf<List<Float>>(listOf(1f))
    var mainEqMm by mutableIntStateOf(26)
    var zooming by mutableStateOf(false)
    var flash by mutableStateOf(false)
    var hasFlash by mutableStateOf(false)
    var videoRes by mutableStateOf(VideoResolution.UHD)
    var photoSizes by mutableStateOf<List<PhotoSize>>(emptyList())
    var photoSize by mutableStateOf<PhotoSize?>(null)
    var photoRatio by mutableStateOf(AspectRatio.R3_4)
    var videoRatio by mutableStateOf(AspectRatio.R9_16)
    var log by mutableStateOf(false)
    /** True when the camera's own processor applies the log curve; false means it is approximated. */
    var logInIsp by mutableStateOf(false)
    var logViewAssist by mutableStateOf(true)
    var logCurve by mutableStateOf(LogCurveChoice.HLG)
    /** The phone streams 10-bit HLG and has a 10-bit encoder for the current size. */
    var hlgAvailable by mutableStateOf(false)
    /** The camera refused the 10-bit session; S-Log3 takes over. */
    var hlgFailed by mutableStateOf(false)
    var raw by mutableStateOf(false)
    var shutterSound by mutableStateOf(true)
    /** Some countries require the shutter sound; then it can't be turned off. */
    var shutterSoundRequired by mutableStateOf(false)
    var rawSupported by mutableStateOf(false)
    val useHlg get() = logActive && logCurve == LogCurveChoice.HLG && hlgAvailable && !hlgFailed
    val logPath get() = when {
        useHlg -> LogPath.HLG10
        logInIsp -> LogPath.ISP
        else -> LogPath.GPU
    }
    val logSummary get() = logPath.words
    var fps by mutableIntStateOf(30)
    var availableVideoRes by mutableStateOf<Set<VideoResolution>>(setOf(VideoResolution.FHD))
    var availableFps by mutableStateOf<Set<Int>>(setOf(30))
    var realShutter by mutableStateOf(false)
    var manualSupported by mutableStateOf(false)
    var stabilization by mutableStateOf(false)
    var stabilizationSupported by mutableStateOf(false)
    var encoderInfo by mutableStateOf("")
    var quarterTurns by mutableIntStateOf(0)
    var evMin by mutableFloatStateOf(-2f)
    var evMax by mutableFloatStateOf(2f)

    val selectedLayer: TextLayer? get() = textLayers.firstOrNull { it.id == selectedText }

    /** The frame shape in use, upright: the mode's ratio, or the imported picture's. */
    val frameAspect: Float get() {
        edit?.let { e -> return editRatio?.value ?: e.aspect }
        // 10-bit takes record the sensor's 16:9 stream as it is.
        if (useHlg) return 9f / 16f
        return if (mode == CaptureMode.VIDEO) videoRatio.value else photoRatio.value
    }
    val logActive get() = log && mode == CaptureMode.VIDEO && edit == null
    /** How the frame is turned: with the phone, or upright while editing an import. */
    val frameTurns get() = if (edit != null) 0 else quarterTurns
}

/** What the screen can ask for. */
interface CameraActions {
    fun requestPermissions()
    fun shutter()
    fun setMode(mode: CaptureMode)
    fun switchFacing()
    fun setZoom(total: Float)
    fun selectCamera(camera: FilmCamera)
    /** Back to the Original camera. */
    fun removeLook()
    fun setStyle(style: app.filmcam.film.StyleSetting)
    fun updateLook(look: FilmLook)
    fun resetLook()
    fun setFrame(frame: FrameStyle)
    fun setStamp(stamp: StampStyle)
    fun toggleFlash()
    fun setVideoResolution(res: VideoResolution)
    fun setPhotoSize(size: PhotoSize)
    fun setRatio(ratio: AspectRatio?)
    fun setLog(on: Boolean)
    fun setLogViewAssist(on: Boolean)
    fun setLogCurve(curve: LogCurveChoice)
    fun setRaw(on: Boolean)
    fun setShutterSound(on: Boolean)
    fun saveLut()
    fun setTimer(seconds: Int)
    fun setBurst(count: Int, interval: Float)
    fun openGallery()
    fun openItem(item: MediaItem)
    fun closeViewer()
    fun closeGallery()
    fun shareItem(item: MediaItem)
    fun deleteItem(item: MediaItem)
    fun trimItem(item: MediaItem, startMs: Long, endMs: Long)
    fun importMedia()
    fun editItem(item: MediaItem)
    fun cancelEdit()
    fun setFps(fps: Int)
    fun setRealShutter(on: Boolean)
    fun setStabilization(on: Boolean)
    fun setTheme(mode: ThemeMode)
    fun setTextLayers(layers: List<TextLayer>)
    fun importFont()
    fun openLast()
    fun tapToFocus(x: Float, y: Float, w: Float, h: Float)
    fun zoom(scale: Float)
    fun bindPreview(view: android.view.TextureView)
}

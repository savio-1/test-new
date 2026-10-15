package app.filmcam.ui

import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.filmcam.camera.CaptureMode
import app.filmcam.camera.Lens
import app.filmcam.camera.PhotoResolution
import app.filmcam.camera.VideoResolution
import app.filmcam.film.CameraCategory
import app.filmcam.film.FilmCamera
import app.filmcam.film.FilmCameras
import app.filmcam.film.FilmLook
import app.filmcam.film.FontLibrary
import app.filmcam.film.FrameStyle
import app.filmcam.film.StampStyle
import app.filmcam.film.TextLayer

/** The tray above the shutter. One at a time keeps the screen calm. */
enum class Dock(val label: String) { NONE(""), LOOKS("Looks"), ADJUST("Adjust"), FRAME("Frame"), TEXT("Text") }

/** What the ruler in the text tray changes. */
enum class TextTool(val label: String) { FONT("Font"), SIZE("Size"), ROTATE("Rotate"), OPACITY("Opacity"), SPACING("Spacing"), COLOR("Colour"), PLACE("Place") }

/** Everything the screen shows. Owned by the activity, mutated on the main thread. */
class UiState {
    var permissionAsked by mutableStateOf(false)
    var hasCamera by mutableStateOf(false)
    var theme by mutableStateOf(ThemeMode.SYSTEM)
    var mode by mutableStateOf(CaptureMode.PHOTO)
    var camera by mutableStateOf<FilmCamera>(FilmCameras.ALL.first())
    var category by mutableStateOf(CameraCategory.FILM)
    var look by mutableStateOf(FilmCameras.ALL.first().look)

    // chrome
    var dock by mutableStateOf(Dock.NONE)
    var toolGroup by mutableStateOf(ToolGroup.LIGHT)
    var toolId by mutableStateOf("exposure")
    /** True while a ruler or a text layer is being dragged: everything else steps aside. */
    var adjusting by mutableStateOf(false)
    var settingsOpen by mutableStateOf(false)

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
    var photoRes by mutableStateOf(PhotoResolution.MAX)
    var fps by mutableIntStateOf(30)
    var availableVideoRes by mutableStateOf<Set<VideoResolution>>(setOf(VideoResolution.FHD))
    var availableFps by mutableStateOf<Set<Int>>(setOf(30))
    var maxPhotoMp by mutableIntStateOf(12)
    var realShutter by mutableStateOf(false)
    var manualSupported by mutableStateOf(false)
    var stabilization by mutableStateOf(false)
    var stabilizationSupported by mutableStateOf(false)
    var encoderInfo by mutableStateOf("")
    var quarterTurns by mutableIntStateOf(0)
    var evMin by mutableFloatStateOf(-2f)
    var evMax by mutableFloatStateOf(2f)

    val selectedLayer: TextLayer? get() = textLayers.firstOrNull { it.id == selectedText }
}

/** What the screen can ask for. */
interface CameraActions {
    fun requestPermissions()
    fun shutter()
    fun setMode(mode: CaptureMode)
    fun switchFacing()
    fun setZoom(total: Float)
    fun selectCamera(camera: FilmCamera)
    fun updateLook(look: FilmLook)
    fun resetLook()
    fun setFrame(frame: FrameStyle)
    fun setStamp(stamp: StampStyle)
    fun toggleFlash()
    fun setVideoResolution(res: VideoResolution)
    fun setPhotoResolution(res: PhotoResolution)
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

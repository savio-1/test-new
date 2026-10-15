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
import app.filmcam.film.FilmCamera
import app.filmcam.film.FilmCameras
import app.filmcam.film.FilmLook

/** Everything the screen shows. Owned by the activity, mutated on the main thread. */
class UiState {
    var permissionAsked by mutableStateOf(false)
    var hasCamera by mutableStateOf(false)
    var mode by mutableStateOf(CaptureMode.PHOTO)
    var camera by mutableStateOf<FilmCamera>(FilmCameras.ALL.first())
    var look by mutableStateOf(FilmCameras.ALL.first().look)
    var recording by mutableStateOf(false)
    var recordStartMs by mutableLongStateOf(0L)
    var savingVideo by mutableStateOf(false)
    var developing by mutableIntStateOf(0)
    var thumbnail by mutableStateOf<Bitmap?>(null)
    var lastUri by mutableStateOf<Uri?>(null)
    var lastIsVideo by mutableStateOf(false)
    var flash by mutableStateOf(false)
    var hasFlash by mutableStateOf(false)
    var showAdjust by mutableStateOf(false)
    var quarterTurns by mutableIntStateOf(0)
    var evMin by mutableFloatStateOf(-2f)
    var evMax by mutableFloatStateOf(2f)
    var flashPulse by mutableIntStateOf(0)
    var message by mutableStateOf<String?>(null)
}

/** What the screen can ask for. */
interface CameraActions {
    fun requestPermissions()
    fun shutter()
    fun setMode(mode: CaptureMode)
    fun switchLens()
    fun selectCamera(camera: FilmCamera)
    fun updateLook(look: FilmLook)
    fun resetLook()
    fun toggleFlash()
    fun openLast()
    fun tapToFocus(x: Float, y: Float, w: Float, h: Float)
    fun zoom(scale: Float)
    fun bindPreview(view: android.view.SurfaceView)
}

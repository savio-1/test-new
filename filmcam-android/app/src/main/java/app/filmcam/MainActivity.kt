package app.filmcam

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.media.MediaActionSound
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.util.Size
import android.view.KeyEvent
import android.view.OrientationEventListener
import android.view.SurfaceView
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.content.edit
import androidx.core.graphics.scale
import app.filmcam.camera.CameraController
import app.filmcam.camera.CaptureMode
import app.filmcam.film.FilmCamera
import app.filmcam.film.FilmCameras
import app.filmcam.film.FilmLook
import app.filmcam.gl.FilmEngine
import app.filmcam.record.VideoRecorder
import app.filmcam.ui.CameraActions
import app.filmcam.ui.CameraScreen
import app.filmcam.ui.UiState
import app.filmcam.util.MediaSaver
import java.util.concurrent.Executors

class MainActivity : ComponentActivity(), CameraActions {
    private val ui = UiState()
    private lateinit var engine: FilmEngine
    private var camera: CameraController? = null
    private lateinit var orientation: OrientationEventListener
    private val io = Executors.newSingleThreadExecutor()
    private val sound = MediaActionSound()
    private val prefs by lazy { getSharedPreferences("filmcam", MODE_PRIVATE) }

    private val permissionLauncher = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        ui.permissionAsked = true
        onPermissionsChanged()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        engine = FilmEngine()

        val saved = FilmCameras.byId(prefs.getString("camera", null))
        ui.camera = saved
        ui.look = saved.look
        ui.mode = runCatching { CaptureMode.valueOf(prefs.getString("mode", "PHOTO")!!) }.getOrDefault(CaptureMode.PHOTO)
        engine.look = ui.look

        orientation = object : OrientationEventListener(this) {
            override fun onOrientationChanged(deg: Int) {
                if (deg == ORIENTATION_UNKNOWN) return
                // Hysteresis so the frame doesn't flap around 45 degrees.
                val current = ui.quarterTurns * 90
                val diff = ((deg - current + 540) % 360) - 180
                if (kotlin.math.abs(diff) < 55) return
                val turns = ((deg + 45) / 90) % 4
                if (turns != ui.quarterTurns) {
                    ui.quarterTurns = turns
                    engine.deviceQuarterTurns = turns
                }
            }
        }

        setContent { CameraScreen(ui, this) }

        if (hasPermission(Manifest.permission.CAMERA)) onPermissionsChanged() else requestPermissions()
    }

    override fun onResume() {
        super.onResume()
        updateDisplayRotation()
        if (orientation.canDetectOrientation()) orientation.enable()
        if (!ui.hasCamera && hasPermission(Manifest.permission.CAMERA)) onPermissionsChanged()
    }

    override fun onPause() {
        orientation.disable()
        if (ui.recording) stopRecording()
        super.onPause()
    }

    override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
        super.onConfigurationChanged(newConfig)
        updateDisplayRotation()
    }

    private fun updateDisplayRotation() {
        val r = window.decorView.display?.rotation ?: return
        engine.displayRotationDegrees = when (r) {
            android.view.Surface.ROTATION_90 -> 90
            android.view.Surface.ROTATION_180 -> 180
            android.view.Surface.ROTATION_270 -> 270
            else -> 0
        }
    }

    override fun onDestroy() {
        camera?.shutdown()
        engine.release()
        sound.release()
        io.shutdown()
        super.onDestroy()
    }

    private fun hasPermission(p: String) = ContextCompat.checkSelfPermission(this, p) == PackageManager.PERMISSION_GRANTED

    private fun onPermissionsChanged() {
        if (!hasPermission(Manifest.permission.CAMERA)) {
            ui.hasCamera = false
            return
        }
        if (camera != null) return
        ui.hasCamera = true
        camera = CameraController(this, this, engine).also { c ->
            c.onCameraReady = { hasFlash, _, evMin, evMax ->
                ui.hasFlash = hasFlash
                if (evMax > evMin) { ui.evMin = evMin.coerceAtLeast(-3f); ui.evMax = evMax.coerceAtMost(3f) }
            }
            c.setMode(ui.mode)
            c.start()
        }
    }

    // ------------------------------------------------------------------ CameraActions

    override fun requestPermissions() {
        permissionLauncher.launch(arrayOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO))
    }

    override fun bindPreview(view: SurfaceView) {
        view.holder.addCallback(engine.surfaceCallback)
    }

    override fun shutter() {
        when (ui.mode) {
            CaptureMode.PHOTO -> takePhoto()
            CaptureMode.VIDEO -> if (ui.recording) stopRecording() else startRecording()
        }
    }

    override fun setMode(mode: CaptureMode) {
        if (ui.recording || mode == ui.mode) return
        ui.mode = mode
        prefs.edit { putString("mode", mode.name) }
        camera?.setMode(mode)
    }

    override fun switchLens() {
        if (ui.recording) return
        camera?.switchLens()
    }

    override fun selectCamera(camera: FilmCamera) {
        ui.camera = camera
        updateLook(camera.look.copy(exposureEv = ui.look.exposureEv))
        prefs.edit { putString("camera", camera.id) }
    }

    override fun updateLook(look: FilmLook) {
        val evChanged = look.exposureEv != ui.look.exposureEv
        ui.look = look
        engine.look = look
        if (evChanged) camera?.setExposure(look.exposureEv)
    }

    override fun resetLook() = updateLook(ui.camera.look)

    override fun toggleFlash() {
        ui.flash = !ui.flash
        camera?.setFlash(ui.flash)
    }

    override fun openLast() {
        val uri = ui.lastUri ?: return
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, if (ui.lastIsVideo) "video/*" else "image/*")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        try { startActivity(intent) } catch (e: ActivityNotFoundException) { ui.message = "No app to open it" }
    }

    override fun tapToFocus(x: Float, y: Float, w: Float, h: Float) {
        val display = window.decorView.display ?: return
        camera?.focusAt(display, w, h, x, y)
    }

    override fun zoom(scale: Float) {
        camera?.zoomBy(scale)
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if ((keyCode == KeyEvent.KEYCODE_VOLUME_DOWN || keyCode == KeyEvent.KEYCODE_VOLUME_UP) && ui.hasCamera) {
            if (event?.repeatCount == 0) shutter()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    // ------------------------------------------------------------------ photo

    private fun takePhoto() {
        val cam = camera ?: return
        if (ui.developing >= 2) return // don't pile up full-res frames
        val look = ui.look
        val turns = ui.quarterTurns
        ui.developing++
        ui.flashPulse++
        sound.play(MediaActionSound.SHUTTER_CLICK)
        engine.snapshotTrail()
        cam.takePicture(turns, engine.maxStillSide()) { still ->
            if (still == null) {
                runOnUiThread { ui.developing--; ui.message = "Couldn't take the picture" }
                return@takePicture
            }
            engine.developStill(still, look, turns) { developed ->
                if (developed == null) {
                    runOnUiThread { ui.developing--; ui.message = "Couldn't develop the picture" }
                    return@developStill
                }
                io.execute {
                    val uri = MediaSaver.savePhoto(this, developed)
                    val thumb = developed.scale(160, (160f * developed.height / developed.width).toInt().coerceAtLeast(1))
                    developed.recycle()
                    runOnUiThread {
                        ui.developing--
                        if (uri != null) {
                            ui.thumbnail = thumb
                            ui.lastUri = uri
                            ui.lastIsVideo = false
                        } else {
                            ui.message = "Couldn't save the picture"
                        }
                    }
                }
            }
        }
    }

    // ------------------------------------------------------------------ video

    private fun startRecording() {
        val size = engine.outputSize ?: return
        // The encoder runs landscape; the file carries a rotation for players.
        val (vw, vh) = VideoRecorder.supportedSize(size.height, size.width)
        val turns = ui.quarterTurns
        val target = MediaSaver.createVideo(this) ?: run { ui.message = "Couldn't create the video file"; return }
        val (uri, pfd) = target
        val recorder = try {
            VideoRecorder(
                vw, vh, (turns * 90 + 90) % 360, pfd,
                withAudio = hasPermission(Manifest.permission.RECORD_AUDIO),
            ) { ok -> onVideoFinished(uri, ok) }
        } catch (e: Exception) {
            Log.e("FilmCam", "recorder", e)
            runCatching { pfd.close() }
            MediaSaver.publishVideo(this, uri, false)
            ui.message = "Video encoder unavailable"
            return
        }
        sound.play(MediaActionSound.START_VIDEO_RECORDING)
        engine.startRecording(recorder)
        ui.recording = true
        ui.showAdjust = false
        ui.recordStartMs = System.currentTimeMillis()
    }

    private fun stopRecording() {
        if (!ui.recording) return
        engine.stopRecording()
        sound.play(MediaActionSound.STOP_VIDEO_RECORDING)
        ui.recording = false
        ui.savingVideo = true
    }

    private fun onVideoFinished(uri: Uri, ok: Boolean) {
        io.execute {
            MediaSaver.publishVideo(this, uri, ok)
            val thumb = if (ok) runCatching { contentResolver.loadThumbnail(uri, Size(240, 240), null) }.getOrNull() else null
            runOnUiThread {
                ui.savingVideo = false
                if (ok) {
                    ui.lastUri = uri
                    ui.lastIsVideo = true
                    if (thumb != null) ui.thumbnail = thumb
                } else {
                    ui.message = "Video couldn't be saved"
                }
            }
        }
    }
}

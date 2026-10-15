package app.filmcam

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
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
import app.filmcam.camera.Camera2Controller
import app.filmcam.camera.CameraCaps
import app.filmcam.camera.CameraConfig
import app.filmcam.camera.CaptureMode
import app.filmcam.camera.Lens
import app.filmcam.camera.PhotoResolution
import app.filmcam.camera.StillJpeg
import app.filmcam.camera.VideoResolution
import app.filmcam.film.FilmCamera
import app.filmcam.film.FilmCameras
import app.filmcam.film.FilmLook
import app.filmcam.film.FrameStyle
import app.filmcam.film.MultiShot
import app.filmcam.film.ShutterSpeed
import app.filmcam.film.StampStyle
import app.filmcam.gl.FilmEngine
import app.filmcam.record.VideoRecorder
import app.filmcam.ui.CameraActions
import app.filmcam.ui.CameraScreen
import app.filmcam.ui.UiState
import app.filmcam.util.HalfFrame
import app.filmcam.util.MediaSaver
import java.util.concurrent.Executors
import kotlin.math.max

class MainActivity : ComponentActivity(), CameraActions, Camera2Controller.Listener {
    private val ui = UiState()
    private lateinit var engine: FilmEngine
    private var camera: Camera2Controller? = null
    private lateinit var orientation: OrientationEventListener
    private val io = Executors.newSingleThreadExecutor()
    private val sound = MediaActionSound()
    private val prefs by lazy { getSharedPreferences("filmcam", MODE_PRIVATE) }
    private var resumed = false
    private var halfFrameFirst: Bitmap? = null
    private val encodeCache = HashMap<String, Boolean>()

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
        ui.category = saved.category
        ui.look = saved.look
        ui.mode = enumPref("mode", CaptureMode.PHOTO)
        ui.videoRes = enumPref("videoRes", VideoResolution.UHD)
        ui.photoRes = enumPref("photoRes", PhotoResolution.MAX)
        ui.fps = prefs.getInt("fps", 30)
        ui.realShutter = prefs.getBoolean("realShutter", false)
        ui.stabilization = prefs.getBoolean("stabilization", false)
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

    private inline fun <reified T : Enum<T>> enumPref(key: String, default: T): T =
        runCatching { enumValueOf<T>(prefs.getString(key, default.name)!!) }.getOrDefault(default)

    override fun onResume() {
        super.onResume()
        resumed = true
        updateDisplayRotation()
        if (orientation.canDetectOrientation()) orientation.enable()
        if (camera == null && hasPermission(Manifest.permission.CAMERA)) onPermissionsChanged()
        openCamera()
    }

    override fun onPause() {
        resumed = false
        orientation.disable()
        if (ui.recording) stopRecording(immediately = true)
        camera?.close()
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
        camera?.release()
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
        val c = Camera2Controller(this, engine).also { it.listener = this }
        camera = c
        ui.lenses = c.catalog.lenses
        if (ui.lenses.isEmpty()) { ui.message = "No camera found"; return }
        val savedKey = prefs.getString("lens", null)
        ui.lens = ui.lenses.firstOrNull { it.key == savedKey } ?: ui.lenses.first { !it.front || ui.lenses.all { l -> l.front } }
        ui.zoom = ui.lens?.ratio ?: 1f
        refreshZoomStops()
        ui.hasCamera = true
        if (resumed) openCamera()
    }

    // ------------------------------------------------------------------ camera

    private fun caps(): CameraCaps? = ui.lens?.let { camera?.catalog?.caps?.get(it.cameraId) }

    private fun canEncode(w: Int, h: Int, fps: Int): Boolean = encodeCache.getOrPut("$w $h $fps") {
        VideoRecorder.canEncode(android.media.MediaFormat.MIMETYPE_VIDEO_HEVC, w, h, fps) ||
            VideoRecorder.canEncode(android.media.MediaFormat.MIMETYPE_VIDEO_AVC, w, h, fps)
    }

    /** Works out which resolutions and frame rates this lens, the GPU and the encoder all support. */
    private fun refreshAvailability() {
        val c = caps() ?: return
        val gpu = engine.maxTextureSize
        ui.availableVideoRes = VideoResolution.entries.filter { res ->
            res.width <= gpu && c.videoSize(res) != null && canEncode(res.width, res.height, 24)
        }.toSet().ifEmpty { setOf(VideoResolution.FHD) }
        if (ui.videoRes !in ui.availableVideoRes) ui.videoRes = ui.availableVideoRes.maxBy { it.width }
        val size = c.videoSize(ui.videoRes) ?: Size(ui.videoRes.width, ui.videoRes.height)
        ui.availableFps = listOf(24, 25, 30, 60).filter { c.supportsFps(size, it) && canEncode(size.width, size.height, it) }
            .toSet().ifEmpty { setOf(30) }
        if (ui.fps !in ui.availableFps) ui.fps = if (30 in ui.availableFps) 30 else ui.availableFps.first()
        ui.manualSupported = c.manualSensor
        ui.stabilizationSupported = c.stabilization
        ui.hasFlash = c.hasFlash
        val maxJpeg = c.jpegSize(PhotoResolution.MAX, allowHighRes = true)
        ui.maxPhotoMp = ((maxJpeg.width.toLong() * maxJpeg.height + 500_000) / 1_000_000).toInt()
        if (c.evStep > 0f) {
            ui.evMin = (c.evRange.lower * c.evStep).coerceAtLeast(-3f)
            ui.evMax = (c.evRange.upper * c.evStep).coerceAtMost(3f)
        }
        val enc = VideoRecorder.choose(ui.videoRes.width, ui.videoRes.height, ui.fps)
        ui.encoderInfo = "${enc.width}×${enc.height} ${enc.codecName} ${enc.fps}p ${enc.bitrate / 1_000_000} Mb/s"
    }

    private fun openCamera() {
        val c = camera ?: return
        val lens = ui.lens ?: return
        if (!resumed) return
        refreshAvailability()
        val caps = caps()
        val video = ui.mode == CaptureMode.VIDEO
        engine.outputAspect = if (video) 9f / 16f else 3f / 4f
        engine.videoMode = video
        engine.maxWorkSide = if (video) max(ui.videoRes.width, 1920) else 1920
        engine.simulateShutter = !(ui.realShutter && caps?.manualSensor == true)
        c.realShutter = ui.realShutter
        c.shutterSeconds = ui.look.shutter.seconds
        c.exposureEv = ui.look.exposureEv
        c.flash = ui.flash
        c.stabilization = ui.stabilization
        c.open(CameraConfig(lens, ui.mode, ui.videoRes, ui.photoRes, ui.fps))
    }

    override fun onCameraReady(config: CameraConfig, caps: CameraCaps) {
        runOnUiThread {
            if (config.mode == CaptureMode.VIDEO && config.videoRes != ui.videoRes) {
                ui.videoRes = config.videoRes
                engine.maxWorkSide = max(ui.videoRes.width, 1920)
                refreshAvailability()
            }
        }
    }

    override fun onCameraError(message: String) {
        runOnUiThread { ui.message = message }
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
        dropHalfFrame()
        prefs.edit { putString("mode", mode.name) }
        openCamera()
    }

    override fun switchFacing() {
        if (ui.recording) return
        val front = ui.lens?.front == true
        val other = ui.lenses.firstOrNull { it.front != front && (front || it.zoom == 1f) } ?: ui.lenses.firstOrNull { it.front != front } ?: return
        selectLens(other)
    }

    override fun selectLens(lens: Lens) {
        val current = ui.lens
        if (ui.recording && lens.cameraId != current?.cameraId) return
        val facingChanged = lens.front != current?.front
        ui.lens = lens
        ui.zoom = lens.ratio
        camera?.userZoom = 1f
        if (facingChanged) refreshZoomStops()
        prefs.edit { putString("lens", lens.key) }
        openCamera()
    }

    private fun refreshZoomStops() {
        val catalog = camera?.catalog ?: return
        val front = ui.lens?.front == true
        ui.zoomStops = catalog.zoomStops(front)
        val main = ui.lenses.firstOrNull { it.front == front && it.ratio == 1f } ?: ui.lens
        ui.mainEqMm = main?.eqMm ?: 26
    }

    /** The lens to use for a total magnification: the longest one that doesn't overshoot. */
    private fun lensFor(total: Float, sameCamera: String?): Lens? {
        val front = ui.lens?.front == true
        val facing = ui.lenses.filter { it.front == front }
        val pool = facing.filter { sameCamera == null || it.cameraId == sameCamera }.ifEmpty { facing }
        return pool.filter { it.ratio <= total * 1.001f }.maxByOrNull { it.ratio } ?: pool.minByOrNull { it.ratio }
    }

    private fun zoomTo(total: Float, sameCamera: String?) {
        val c = camera ?: return
        val front = ui.lens?.front == true
        val t = total.coerceIn(c.catalog.minZoom(front), c.catalog.maxZoom(front))
        val lens = lensFor(t, sameCamera) ?: return
        if (ui.recording && lens.cameraId != ui.lens?.cameraId) return
        ui.zoom = t
        c.userZoom = t / lens.ratio
        if (lens.key != ui.lens?.key) {
            ui.lens = lens
            prefs.edit { putString("lens", lens.key) }
            openCamera()
        } else {
            c.applySettings()
        }
    }

    override fun setZoom(total: Float) = zoomTo(total, sameCamera = null)

    override fun selectCamera(camera: FilmCamera) {
        ui.camera = camera
        dropHalfFrame()
        updateLook(camera.look.copy(exposureEv = ui.look.exposureEv))
        prefs.edit { putString("camera", camera.id) }
    }

    override fun updateLook(look: FilmLook) {
        val old = ui.look
        ui.look = look
        engine.look = look
        val c = camera ?: return
        if (look.exposureEv != old.exposureEv || look.shutter != old.shutter) {
            c.exposureEv = look.exposureEv
            c.shutterSeconds = look.shutter.seconds
            c.applySettings()
        }
        if (look.multiShot != MultiShot.HALF_FRAME) dropHalfFrame()
    }

    override fun resetLook() = updateLook(ui.camera.look.copy(exposureEv = 0f))

    override fun setShutter(speed: ShutterSpeed) = updateLook(ui.look.copy(shutter = speed))

    override fun setFrame(frame: FrameStyle) = updateLook(ui.look.copy(frame = frame))

    override fun setStamp(stamp: StampStyle) = updateLook(ui.look.copy(stamp = stamp))

    override fun toggleFlash() {
        ui.flash = !ui.flash
        camera?.flash = ui.flash
        camera?.applySettings()
    }

    override fun setVideoResolution(res: VideoResolution) {
        if (ui.recording) return
        ui.videoRes = res
        prefs.edit { putString("videoRes", res.name) }
        openCamera()
    }

    override fun setPhotoResolution(res: PhotoResolution) {
        ui.photoRes = res
        prefs.edit { putString("photoRes", res.name) }
        openCamera()
    }

    override fun setFps(fps: Int) {
        if (ui.recording) return
        ui.fps = fps
        prefs.edit { putInt("fps", fps) }
        openCamera()
    }

    override fun setRealShutter(on: Boolean) {
        ui.realShutter = on
        prefs.edit { putBoolean("realShutter", on) }
        engine.simulateShutter = !(on && caps()?.manualSensor == true)
        camera?.realShutter = on
        camera?.applySettings()
    }

    override fun setStabilization(on: Boolean) {
        ui.stabilization = on
        prefs.edit { putBoolean("stabilization", on) }
        camera?.stabilization = on
        camera?.applySettings()
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
        if (w <= 0f || h <= 0f) return
        val (bx, by) = engine.previewToBuffer(x / w, y / h)
        camera?.focusAt(bx, by)
    }

    private val hideZoom = Runnable { ui.zooming = false }

    /** Pinch: stays on the current camera so the picture never blinks mid-gesture. */
    override fun zoom(scale: Float) {
        zoomTo(ui.zoom * scale, sameCamera = ui.lens?.cameraId)
        ui.zooming = true
        window.decorView.removeCallbacks(hideZoom)
        window.decorView.postDelayed(hideZoom, 900)
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
        val look = ui.look
        if (look.multiShot == MultiShot.SAMPLER) {
            if (ui.sampling) return
            ui.sampling = true
            sound.play(MediaActionSound.SHUTTER_CLICK)
            engine.captureSampler(look) { grid ->
                runOnUiThread { ui.sampling = false }
                if (grid == null) runOnUiThread { ui.message = "Couldn't take the frames" } else savePhoto(grid)
            }
            return
        }
        if (ui.developing >= 2) return // don't pile up full-res frames
        val turns = ui.quarterTurns
        val shotLook = if (look.multiShot == MultiShot.HALF_FRAME) look.copy(frame = FrameStyle.NONE) else look
        ui.developing++
        ui.flashPulse++
        sound.play(MediaActionSound.SHUTTER_CLICK)
        engine.snapshotTrail()
        cam.takePicture(turns) { jpeg ->
            if (jpeg == null) {
                runOnUiThread { ui.developing--; ui.message = "Couldn't take the picture" }
                return@takePicture
            }
            io.execute { developJpeg(jpeg, shotLook, turns, look.multiShot == MultiShot.HALF_FRAME) }
        }
    }

    private fun developJpeg(jpeg: StillJpeg, look: FilmLook, turns: Int, halfFrame: Boolean) {
        val still = decode(jpeg.bytes, engine.maxStillSide())
        if (still == null) {
            runOnUiThread { ui.developing--; ui.message = "Couldn't read the picture" }
            return
        }
        engine.developStill(still, jpeg.rotationCw, jpeg.mirror, look, turns) { developed ->
            if (developed == null) {
                runOnUiThread { ui.developing--; ui.message = "Couldn't develop the picture" }
                return@developStill
            }
            io.execute {
                if (halfFrame) {
                    val first = halfFrameFirst
                    if (first == null) {
                        halfFrameFirst = developed
                        runOnUiThread { ui.developing--; ui.halfFramePending = true }
                        return@execute
                    }
                    halfFrameFirst = null
                    val pair = HalfFrame.compose(first, developed)
                    first.recycle(); developed.recycle()
                    runOnUiThread { ui.halfFramePending = false }
                    savePhoto(pair, alreadyOnIo = true)
                } else {
                    savePhoto(developed, alreadyOnIo = true)
                }
                runOnUiThread { ui.developing-- }
            }
        }
    }

    private fun dropHalfFrame() {
        io.execute { halfFrameFirst?.recycle(); halfFrameFirst = null }
        ui.halfFramePending = false
    }

    private fun decode(bytes: ByteArray, maxSide: Int): Bitmap? = try {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        var sample = 1
        while (max(bounds.outWidth, bounds.outHeight) / sample > maxSide) sample *= 2
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
    } catch (e: OutOfMemoryError) {
        Log.e("FilmCam", "decode", e)
        null
    }

    private fun savePhoto(bitmap: Bitmap, alreadyOnIo: Boolean = false) {
        val work = Runnable {
            val uri = MediaSaver.savePhoto(this, bitmap)
            val thumb = bitmap.scale(160, (160f * bitmap.height / bitmap.width).toInt().coerceAtLeast(1))
            bitmap.recycle()
            runOnUiThread {
                if (uri != null) {
                    ui.thumbnail = thumb
                    ui.lastUri = uri
                    ui.lastIsVideo = false
                } else {
                    ui.message = "Couldn't save the picture"
                }
            }
        }
        if (alreadyOnIo) work.run() else io.execute(work)
    }

    // ------------------------------------------------------------------ video

    private fun startRecording() {
        val size = engine.outputSize ?: return
        val turns = ui.quarterTurns
        // The encoder runs landscape; the file carries a rotation for players.
        val choice = VideoRecorder.choose(size.height, size.width, ui.fps)
        val target = MediaSaver.createVideo(this) ?: run { ui.message = "Couldn't create the video file"; return }
        val (uri, pfd) = target
        val recorder = try {
            VideoRecorder(
                choice, (turns * 90 + 90) % 360, pfd,
                withAudio = hasPermission(Manifest.permission.RECORD_AUDIO),
            ) { ok -> onVideoFinished(uri, ok) }
        } catch (e: Exception) {
            Log.e("FilmCam", "recorder", e)
            runCatching { pfd.close() }
            MediaSaver.publishVideo(this, uri, false)
            ui.message = "Video encoder unavailable"
            return
        }
        ui.encoderInfo = "${choice.width}×${choice.height} ${choice.codecName} ${choice.fps}p"
        sound.play(MediaActionSound.START_VIDEO_RECORDING)
        engine.startRecording(recorder)
        ui.recording = true
        ui.sheet = app.filmcam.ui.Sheet.NONE
        ui.recordStartMs = System.currentTimeMillis()
    }

    private fun stopRecording(immediately: Boolean = false) {
        if (!ui.recording) return
        engine.stopRecording(immediately)
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
                refreshAvailability()
            }
        }
    }
}

package app.filmcam

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.ImageDecoder
import android.os.Handler
import android.os.Looper
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.PickVisualMediaRequest
import app.filmcam.camera.AspectRatio
import app.filmcam.camera.LogCurve
import app.filmcam.camera.PhotoSize
import app.filmcam.gl.StillCrop
import app.filmcam.record.AudioPump
import app.filmcam.record.PreviewPlayer
import app.filmcam.record.Trimmer
import app.filmcam.record.VideoExporter
import app.filmcam.ui.Dock
import app.filmcam.ui.EditSession
import app.filmcam.ui.Screen
import app.filmcam.util.MediaItem
import app.filmcam.util.MediaLibrary
import kotlin.math.min
import kotlin.math.pow
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
import android.view.TextureView
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
import app.filmcam.camera.StillJpeg
import app.filmcam.camera.VideoResolution
import app.filmcam.film.FilmCamera
import app.filmcam.film.FilmCameras
import app.filmcam.film.FilmLook
import app.filmcam.film.FrameStyle
import app.filmcam.film.MultiShot
import app.filmcam.film.StampStyle
import app.filmcam.film.FontLibrary
import app.filmcam.film.TextLayer
import app.filmcam.seg.SubjectMasker
import app.filmcam.film.CustomLooks
import app.filmcam.sub.AudioExtract
import app.filmcam.sub.Cue
import app.filmcam.sub.LiveCaptioner
import app.filmcam.sub.GeminiTranscriber
import app.filmcam.sub.SubtitleLanguage
import app.filmcam.sub.SubtitleStyle
import app.filmcam.sub.SubtitleTrack
import app.filmcam.sub.TranscribeException
import app.filmcam.ui.SubtitleSession
import app.filmcam.ui.ThemeMode
import app.filmcam.gl.FilmEngine
import app.filmcam.record.VideoRecorder
import app.filmcam.ui.CameraActions
import app.filmcam.ui.CameraScreen
import app.filmcam.ui.UiState
import app.filmcam.util.HalfFrame
import app.filmcam.util.MediaSaver
import java.util.concurrent.Executors
import kotlin.math.max
import java.util.Locale
import java.util.Date
import java.text.SimpleDateFormat

class MainActivity : ComponentActivity(), CameraActions, Camera2Controller.Listener {
    private var subjects: SubjectMasker? = null
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
    private val main = Handler(Looper.getMainLooper())
    private var previewPlayer: PreviewPlayer? = null
    /** 10-bit log: the encoder surface the camera writes into, kept for the app's lifetime. */
    private var directSurface: android.view.Surface? = null
    /** An encoder prepared on [directSurface] for the next 10-bit take, and the one running. */
    private var directRecorder: VideoRecorder? = null
    private var directActive: VideoRecorder? = null
    private var exporter: VideoExporter? = null
    private var viewerFromGallery = false

    private val mediaPicker = registerForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri == null) return@registerForActivityResult
        val video = contentResolver.getType(uri)?.startsWith("video/") == true
        startEdit(uri, video)
    }

    private lateinit var fonts: FontLibrary

    private val fontPicker = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@registerForActivityResult
        io.execute {
            val key = fonts.import(uri)
            runOnUiThread {
                if (key == null) { ui.message = "That file isn't a font this phone can read"; return@runOnUiThread }
                ui.fontsVersion++
                ui.selectedLayer?.let { l -> setTextLayers(ui.textLayers.map { if (it.id == l.id) it.copy(font = key) else it }) }
            }
        }
    }

    private val lutPicker = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) importLutFrom(uri)
    }

    private val permissionLauncher = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        ui.permissionAsked = true
        onPermissionsChanged()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        engine = FilmEngine()
        engine.lutSource = { id ->
            runCatching {
                if (id.startsWith(CustomLooks.USER_PREFIX)) BitmapFactory.decodeFile(java.io.File(filesDir, "luts/$id.png").path)
                else assets.open("luts/$id.png").use { BitmapFactory.decodeStream(it) }
            }.getOrNull()
        }
        loadUserLooks()
        fonts = FontLibrary(this)
        ui.fonts = fonts
        engine.fonts = fonts
        subjects = SubjectMasker(applicationContext).also { m ->
            m.onStatus = { st -> ui.subjectStatus = st }
            m.onSubject = { label ->
                if (label == null) ui.message = "Nothing to cut out there: tap a person, pet or object"
                else ui.subjectLabel = label
            }
            engine.subjects = m
        }
        ui.theme = enumPref("theme", ThemeMode.DARK)
        ui.geminiKey = prefs.getString("geminiKey", "") ?: ""
        ui.liveCaptions = prefs.getBoolean("liveCaptions", false) && LiveCaptioner.supported(this)
        ui.captionLanguage = prefs.getString("captionLanguage", "en") ?: "en"
        ui.geminiModel = prefs.getString("geminiModel", null) ?: GeminiTranscriber.DEFAULT_MODEL
        ui.textLayers = TextLayer.listFromJson(prefs.getString("text", null))
        engine.textLayers = ui.textLayers

        ui.favourites = prefs.getStringSet("favourites", null)?.toSet() ?: emptySet()
        val saved = FilmCameras.byId(prefs.getString("camera", null))
        ui.camera = saved
        ui.category = if (saved.category == app.filmcam.film.CameraCategory.ORIGINAL) app.filmcam.film.CameraCategory.FUJI else saved.category
        ui.look = saved.look
        ui.mode = enumPref("mode", CaptureMode.PHOTO)
        ui.videoRes = enumPref("videoRes", VideoResolution.UHD)
        ui.photoRatio = enumPref("photoRatio", AspectRatio.R3_4)
        ui.videoRatio = enumPref("videoRatio", AspectRatio.R9_16)
        ui.log = prefs.getBoolean("log", false)
        ui.logViewAssist = prefs.getBoolean("logViewAssist", true)
        ui.logCurve = enumPref("logCurve", app.filmcam.ui.LogCurveChoice.HLG)
        ui.raw = prefs.getBoolean("raw", false)
        ui.shutterSound = prefs.getBoolean("shutterSound", true)
        ui.shutterSoundRequired = android.os.Build.VERSION.SDK_INT >= 33 && MediaActionSound.mustPlayShutterSound()
        ui.timerSeconds = prefs.getInt("timer", 0)
        ui.burstCount = prefs.getInt("burstCount", 1)
        ui.burstInterval = prefs.getFloat("burstInterval", 1f)
        ui.fps = prefs.getInt("fps", 30)
        ui.realShutter = prefs.getBoolean("realShutter", false)
        ui.stabilization = prefs.getBoolean("stabilization", false)
        pushLook()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                when {
                    ui.progress >= 0f -> Unit
                    ui.screen == Screen.SUBTITLES -> closeSubtitles()
                    ui.screen == Screen.VIEWER -> closeViewer()
                    ui.screen == Screen.GALLERY -> closeGallery()
                    ui.editingText -> ui.editingText = false
                    ui.settingsOpen -> ui.settingsOpen = false
                    ui.quick != null -> ui.quick = null
                    ui.edit != null -> cancelEdit()
                    ui.dock != Dock.NONE -> ui.dock = Dock.NONE
                    else -> { isEnabled = false; onBackPressedDispatcher.onBackPressed(); isEnabled = true }
                }
            }
        })

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
        debugIntent(intent)

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
        val e = ui.edit
        if (e != null && e.video && exporter == null) startPreviewPlayer(e)
        openCamera()
    }

    override fun onPause() {
        resumed = false
        orientation.disable()
        cancelSeries()
        if (ui.recording) stopRecording(immediately = true)
        camera?.close()
        stopPreviewPlayer()
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
        directRecorder?.discard()
        directRecorder = null
        directSurface?.release()
        exporter?.cancel()
        stopPreviewPlayer()
        camera?.release()
        engine.release()
        subjects?.release()
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
        // Full-resolution sensor modes only work on the main lens, unzoomed by the camera.
        val onMain = ui.lens?.zoom == 1f
        ui.photoSizes = c.photoSizes.filter { onMain || !it.maxRes }.ifEmpty { c.photoSizes }
        // Default: the sensor's binned size (about 12 MP), as the system camera uses. The 50 MP
        // and 200 MP modes read every photosite on their own and are noisier except in bright light.
        val base = ui.photoSizes.firstOrNull { !it.highRes && !it.maxRes } ?: ui.photoSizes.first()
        val wantMp = prefs.getInt("photoMp", base.mp)
        ui.photoSize = ui.photoSizes.minBy { kotlin.math.abs(it.mp - wantMp) }
        if (!ui.logActive || ui.logPath != app.filmcam.ui.LogPath.GPU) ui.logInIsp = c.contrastCurve
        ui.rawSupported = c.rawSize != null
        val stream = c.videoSize(ui.videoRes)
        ui.hlgAvailable = c.hlg10 && stream != null && VideoRecorder.chooseHlg(stream.width, stream.height, ui.fps) != null
        if (c.evStep > 0f) {
            ui.evMin = (c.evRange.lower * c.evStep).coerceAtLeast(-3f)
            ui.evMax = (c.evRange.upper * c.evStep).coerceAtMost(3f)
        }
        val enc = VideoRecorder.choose(ui.videoRes.width, ui.videoRes.height, ui.fps, log = ui.log)
        ui.encoderInfo = "${enc.width}×${enc.height} ${enc.codecName} ${enc.fps}p ${enc.bitrate / 1_000_000} Mb/s"
    }

    private fun openCamera() {
        val c = camera ?: return
        val lens = ui.lens ?: return
        if (!resumed || ui.edit != null || ui.screen != Screen.CAMERA) return
        refreshAvailability()
        val caps = caps()
        val video = ui.mode == CaptureMode.VIDEO
        engine.upright = false
        engine.outputAspect = ui.frameAspect
        engine.videoMode = video
        pushLook()
        engine.maxWorkSide = if (video) max(ui.videoRes.width, 1920) else 1920
        engine.simulateShutter = !(ui.realShutter && caps?.manualSensor == true)
        c.realShutter = ui.realShutter
        c.shutterSeconds = ui.look.shutter.seconds
        c.exposureEv = ui.look.exposureEv
        c.flash = ui.flash
        c.stabilization = ui.stabilization
        val photo = ui.photoSize ?: caps?.photoSizes?.first() ?: PhotoSize(4000, 3000)
        val direct = if (ui.useHlg) prepareDirect(caps) else { dropDirect(); null }
        c.open(CameraConfig(
            lens, ui.mode, ui.videoRes, photo, ui.fps, log = ui.logActive,
            hlg = direct != null, direct = direct, raw = ui.raw && ui.mode == CaptureMode.PHOTO && ui.rawSupported,
        ))
    }

    /**
     * Makes sure a 10-bit HLG encoder is configured on the persistent surface before the camera
     * session that writes into it is built. Returns that surface, or null if it can't be done.
     */
    private fun prepareDirect(caps: CameraCaps?): android.view.Surface? {
        if (directActive != null) return directSurface
        val size = caps?.videoSize(ui.videoRes) ?: return null
        val choice = VideoRecorder.chooseHlg(size.width, size.height, ui.fps) ?: return null
        val surface = directSurface ?: android.media.MediaCodec.createPersistentInputSurface().also { directSurface = it }
        val ready = directRecorder
        if (ready != null && ready.width == choice.width && ready.height == choice.height) return surface
        ready?.discard()
        directRecorder = try {
            VideoRecorder(choice, surface)
        } catch (e: Exception) {
            Log.e("FilmCam", "10-bit encoder", e)
            null
        }
        return if (directRecorder != null) surface else null
    }

    private fun dropDirect() {
        if (directActive != null) return
        directRecorder?.discard()
        directRecorder = null
    }

    /** What the engine draws: the look (plain in log, which is for grading) and the text. */
    private fun pushLook() {
        val log = ui.logActive
        engine.look = when {
            log -> FilmCameras.ORIGINAL.look.copy(exposureEv = ui.look.exposureEv)
            // Styles belong to the Original camera; a look brings its own grading.
            ui.isOriginal -> ui.look.copy(style = ui.style)
            else -> ui.look
        }
        engine.textLayers = if (log) emptyList() else ui.textLayers
        applyLogModes()
    }

    private var logUnder = LogCurve.UNDER

    private fun applyLogModes() {
        val isp = ui.logInIsp
        engine.logGain = 2f.pow(logUnder)
        if (!ui.logActive) { engine.logDisplay = 0; engine.logEncode = 0; return }
        if (ui.logPath == app.filmcam.ui.LogPath.HLG10) {
            // The camera writes the file itself; the screen just needs the HLG shown sensibly.
            engine.logDisplay = if (ui.logViewAssist) 4 else 0
            engine.logEncode = 0
            return
        }
        // The camera makes log itself where it can; otherwise the GPU turns its picture into log.
        engine.logEncode = if (isp) 0 else 1
        engine.logDisplay = when {
            isp && ui.logViewAssist -> 2
            isp -> 0
            ui.logViewAssist -> 3
            else -> 1
        }
    }

    override fun onLogState(under: Float, inIsp: Boolean) {
        runOnUiThread {
            logUnder = if (under > 0f) under else LogCurve.UNDER
            if (ui.logActive) ui.logInIsp = inIsp
            applyLogModes()
        }
    }

    override fun onCameraReady(config: CameraConfig, caps: CameraCaps) {
        runOnUiThread {
            if (config.mode == CaptureMode.PHOTO && config.photo != ui.photoSize) ui.photoSize = config.photo
            if (ui.useHlg && !config.hlg) {
                // The camera wouldn't build a 10-bit session: S-Log3 it is.
                ui.hlgFailed = true
                dropDirect()
                engine.outputAspect = ui.frameAspect
                applyLogModes()
            }
            if (config.mode == CaptureMode.PHOTO && ui.raw && !config.raw) ui.message = "RAW isn't available with this lens or size"
            if (config.mode == CaptureMode.VIDEO && config.videoRes != ui.videoRes) {
                ui.videoRes = config.videoRes
                engine.maxWorkSide = max(ui.videoRes.width, 1920)
                refreshAvailability()
            }
        }
    }

    override fun onRawCaptured(dng: ByteArray) {
        io.execute {
            val uri = MediaSaver.saveDng(this, dng)
            if (uri == null) runOnUiThread { ui.message = "Couldn't save the RAW file" }
        }
    }

    override fun onCameraError(message: String) {
        runOnUiThread { ui.message = message }
    }

    // ------------------------------------------------------------------ CameraActions

    override fun requestPermissions() {
        permissionLauncher.launch(arrayOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO))
    }

    override fun bindPreview(view: TextureView) {
        view.surfaceTextureListener = engine.textureListener
    }

    override fun setTheme(mode: ThemeMode) {
        ui.theme = mode
        prefs.edit { putString("theme", mode.name) }
    }

    override fun setTextLayers(layers: List<TextLayer>) {
        ui.textLayers = layers
        pushLook()
        prefs.edit { putString("text", TextLayer.listToJson(layers)) }
    }

    override fun pickSubject(x: Float, y: Float) {
        subjects?.pick(x, y)
    }

    override fun resetSubject() {
        subjects?.reset()
        ui.subjectLabel = "People"
    }

    // ------------------------------------------------------------------ imported LUTs

    /** Imported .cube looks, as saved: [{id, name}]. */
    private fun loadUserLooks() {
        val list = runCatching {
            val a = org.json.JSONArray(prefs.getString("userLuts", "[]"))
            List(a.length()) { a.getJSONObject(it) }.map { CustomLooks.importedCamera(it.getString("id"), it.getString("name")) }
        }.getOrDefault(emptyList()).filter { java.io.File(filesDir, "luts/${it.id}.png").exists() }
        setUserLooks(list)
    }

    private fun setUserLooks(list: List<FilmCamera>) {
        CustomLooks.imported = list
        ui.userLooks = list
        val a = org.json.JSONArray()
        list.forEach { a.put(org.json.JSONObject().put("id", it.id).put("name", it.name)) }
        prefs.edit { putString("userLuts", a.toString()) }
    }

    override fun importLut() {
        lutPicker.launch(arrayOf("*/*"))
    }

    /** Reads a .cube, bakes it into the app's 33^3 strip and a tile, and selects it. */
    private fun importLutFrom(uri: Uri) {
        io.execute {
            var rough = false
            val result = runCatching {
                val fileName = contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                    if (c.moveToFirst()) c.getString(0) else null
                } ?: "Imported"
                val name = fileName.substringBeforeLast('.').take(24)
                val bytes = contentResolver.openInputStream(uri)?.use { input -> input.readBytes() }
                    ?: throw app.filmcam.film.CubeException("Couldn't open the file")
                if (bytes.size > 64 * 1024 * 1024) throw app.filmcam.film.CubeException("That file is too large for a LUT")
                val ext = fileName.substringAfterLast('.', "").lowercase()
                val isImage = contentResolver.getType(uri)?.startsWith("image/") == true || ext in setOf("png", "jpg", "jpeg", "webp", "tif", "tiff")
                // A .cube, or a Hald CLUT image that has been through a grade (FilmBox, Lightroom...).
                val cube = if (isImage) {
                    if (ext == "tif" || ext == "tiff") throw app.filmcam.film.CubeException("Save the Hald image as PNG (TIFF can't be read here)")
                    val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply {
                        inPreferredConfig = Bitmap.Config.ARGB_8888; inScaled = false
                    }) ?: throw app.filmcam.film.CubeException("Couldn't read that image")
                    val px = IntArray(bmp.width * bmp.height)
                    bmp.getPixels(px, 0, bmp.width, 0, 0, bmp.width, bmp.height)
                    app.filmcam.film.CubeLut.fromHald(bmp.width, bmp.height, px).also { bmp.recycle() }
                } else {
                    app.filmcam.film.CubeLut.parse(String(bytes, Charsets.UTF_8))
                }
                rough = cube.roughness() > 0.004f
                val id = CustomLooks.USER_PREFIX + System.currentTimeMillis()
                val strip = Bitmap.createBitmap(33 * 33, 33, Bitmap.Config.ARGB_8888)
                strip.setPixels(cube.toStrip(), 0, 33 * 33, 0, 0, 33 * 33, 33)
                val lutDir = java.io.File(filesDir, "luts").apply { mkdirs() }
                java.io.FileOutputStream(java.io.File(lutDir, "$id.png")).use { strip.compress(Bitmap.CompressFormat.PNG, 100, it) }
                strip.recycle()
                // Its tile: the Provia tile (close to a phone's own picture) through the LUT.
                runCatching {
                    val base = assets.open("looks/fx_provia.jpg").use { BitmapFactory.decodeStream(it) }
                    val px = IntArray(base.width * base.height)
                    base.getPixels(px, 0, base.width, 0, 0, base.width, base.height)
                    val o = FloatArray(3)
                    for (i in px.indices) {
                        val c = px[i]
                        cube.sample(((c shr 16) and 255) / 255f, ((c shr 8) and 255) / 255f, (c and 255) / 255f, o)
                        px[i] = (0xFF shl 24) or ((o[0] * 255 + 0.5f).toInt() shl 16) or ((o[1] * 255 + 0.5f).toInt() shl 8) or (o[2] * 255 + 0.5f).toInt()
                    }
                    val tile = Bitmap.createBitmap(px, base.width, base.height, Bitmap.Config.ARGB_8888)
                    val dir = java.io.File(filesDir, "looks").apply { mkdirs() }
                    java.io.FileOutputStream(java.io.File(dir, "$id.jpg")).use { tile.compress(Bitmap.CompressFormat.JPEG, 88, it) }
                }
                CustomLooks.importedCamera(id, name.ifBlank { cube.title.ifBlank { "Imported" } })
            }
            runOnUiThread {
                result.onSuccess { cam ->
                    setUserLooks(ui.userLooks + cam)
                    ui.category = app.filmcam.film.CameraCategory.CUSTOM
                    selectCamera(cam)
                    ui.message = if (rough) "Added ${cam.name}, but some of its colours jump about (a watermark or text on the image?)"
                        else "Added ${cam.name}"
                }.onFailure { e ->
                    Log.w("FilmCam", "import LUT", e)
                    ui.message = (e as? app.filmcam.film.CubeException)?.message ?: "That file isn't a .cube LUT this app can read"
                }
            }
        }
    }

    override fun removeUserLook(id: String) {
        val cam = ui.userLooks.firstOrNull { it.id == id } ?: return
        if (ui.camera.id == id) removeLook()
        setUserLooks(ui.userLooks - cam)
        io.execute {
            java.io.File(filesDir, "luts/$id.png").delete()
            java.io.File(filesDir, "looks/$id.jpg").delete()
        }
        ui.message = "Removed ${cam.name}"
    }

    override fun importFont() {
        fontPicker.launch(arrayOf("font/ttf", "font/otf", "font/sfnt", "application/x-font-ttf", "application/x-font-otf", "application/octet-stream"))
    }

    override fun shutter() {
        if (ui.edit != null) { saveEdit(); return }
        if (ui.seriesRunning) { cancelSeries(); return }
        when (ui.mode) {
            CaptureMode.PHOTO -> if (ui.timerSeconds > 0 || ui.burstCount != 1) startSeries() else takePhoto()
            CaptureMode.VIDEO -> when {
                ui.recording -> stopRecording()
                ui.timerSeconds > 0 -> startSeries()
                else -> startRecording()
            }
        }
    }

    // ------------------------------------------------------------------ timer and bursts

    private val countdownTick = object : Runnable {
        override fun run() {
            if (ui.countdown <= 0) return
            ui.countdown--
            if (ui.countdown > 0) {
                click(MediaActionSound.FOCUS_COMPLETE)
                main.postDelayed(this, 1000)
            } else if (ui.mode == CaptureMode.VIDEO) {
                startRecording()
            } else {
                startBurst()
            }
        }
    }

    private val burstShot = object : Runnable {
        override fun run() {
            if (ui.burstTotal < 0) return
            // Wait for the camera rather than drop a frame of the series.
            if (ui.developing >= 2 || ui.sampling) { main.postDelayed(this, 120); return }
            takePhoto()
            ui.burstTaken++
            if (ui.burstTotal > 0 && ui.burstTaken >= ui.burstTotal) { ui.burstTotal = -1; return }
            main.postDelayed(this, (ui.burstInterval * 1000).toLong())
        }
    }

    private fun startSeries() {
        if (ui.timerSeconds > 0) {
            ui.countdown = ui.timerSeconds
            click(MediaActionSound.FOCUS_COMPLETE)
            main.postDelayed(countdownTick, 1000)
        } else {
            startBurst()
        }
    }

    private fun startBurst() {
        if (ui.burstCount == 1) { takePhoto(); return }
        ui.burstTaken = 0
        ui.burstTotal = ui.burstCount
        burstShot.run()
    }

    private fun cancelSeries() {
        main.removeCallbacks(countdownTick)
        main.removeCallbacks(burstShot)
        ui.countdown = 0
        ui.burstTotal = -1
    }

    override fun setTimer(seconds: Int) {
        ui.timerSeconds = seconds
        prefs.edit { putInt("timer", seconds) }
    }

    override fun setBurst(count: Int, interval: Float) {
        ui.burstCount = count
        ui.burstInterval = interval
        prefs.edit { putInt("burstCount", count); putFloat("burstInterval", interval) }
    }

    override fun setRatio(ratio: AspectRatio?) {
        if (ui.recording) return
        if (ui.edit != null) {
            ui.editRatio = ratio
            engine.outputAspect = ui.frameAspect
            return
        }
        if (ratio == null) return
        if (ui.mode == CaptureMode.VIDEO) {
            ui.videoRatio = ratio
            prefs.edit { putString("videoRatio", ratio.name) }
        } else {
            ui.photoRatio = ratio
            prefs.edit { putString("photoRatio", ratio.name) }
        }
        dropHalfFrame()
        engine.outputAspect = ui.frameAspect
    }

    override fun setLog(on: Boolean) {
        if (ui.recording) return
        ui.log = on
        ui.hlgFailed = false
        prefs.edit { putBoolean("log", on) }
        pushLook()
        openCamera()
    }

    override fun setLogCurve(curve: app.filmcam.ui.LogCurveChoice) {
        if (ui.recording) return
        ui.logCurve = curve
        ui.hlgFailed = false
        prefs.edit { putString("logCurve", curve.name) }
        pushLook()
        openCamera()
    }

    /** Camera sounds, unless turned off (and the law allows it). */
    private fun click(kind: Int) {
        if (ui.shutterSound || ui.shutterSoundRequired) sound.play(kind)
    }

    override fun setShutterSound(on: Boolean) {
        ui.shutterSound = on
        prefs.edit { putBoolean("shutterSound", on) }
    }

    override fun setRaw(on: Boolean) {
        ui.raw = on
        prefs.edit { putBoolean("raw", on) }
        openCamera()
    }

    override fun setLogViewAssist(on: Boolean) {
        ui.logViewAssist = on
        prefs.edit { putBoolean("logViewAssist", on) }
        applyLogModes()
    }

    override fun saveLut() {
        io.execute {
            val hlg = ui.logPath == app.filmcam.ui.LogPath.HLG10
            val name = if (hlg) "FilmCam HLG to Rec709.cube" else "FilmCam S-Log3 to Rec709.cube"
            val uri = MediaSaver.saveDownload(this, name, "application/octet-stream", LogCurve.cube(hlg))
            runOnUiThread { ui.message = if (uri != null) "LUT saved to Download/FilmCam" else "Couldn't save the LUT" }
        }
    }

    override fun setMode(mode: CaptureMode) {
        if (ui.recording || mode == ui.mode) return
        cancelSeries()
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

    private fun selectLens(lens: Lens) {
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
        pushLook()
        val c = camera ?: return
        if (look.exposureEv != old.exposureEv || look.shutter != old.shutter) {
            c.exposureEv = look.exposureEv
            c.shutterSeconds = look.shutter.seconds
            c.applySettings()
        }
        if (look.multiShot != MultiShot.HALF_FRAME) dropHalfFrame()
    }

    override fun removeLook() = selectCamera(FilmCameras.ORIGINAL)

    override fun resetLook() = updateLook(ui.camera.look.copy(exposureEv = 0f))

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

    override fun setPhotoSize(size: PhotoSize) {
        ui.photoSize = size
        prefs.edit { putInt("photoMp", size.mp) }
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
        val uri = ui.lastUri
        if (uri == null) { openGallery(); return }
        val info = if (ui.lastIsVideo) MediaLibrary.videoInfo(this, uri) else null
        showViewer(MediaItem(uri, ui.lastIsVideo, System.currentTimeMillis(), info?.durationMs ?: 0L,
            info?.uprightW ?: 0, info?.uprightH ?: 0), fromGallery = false)
        refreshGallery()
    }

    // ------------------------------------------------------------------ gallery and viewer

    /** Leaves the camera for a full-screen page; the camera is closed while it isn't seen. */
    private fun leaveCamera(screen: Screen) {
        cancelSeries()
        if (ui.recording) stopRecording()
        ui.screen = screen
        ui.dock = Dock.NONE
        ui.quick = null
        camera?.close()
    }

    private fun backToCamera() {
        ui.screen = Screen.CAMERA
        ui.viewing = null
        openCamera()
    }

    /** Which look each take was made with (id and name), kept with the app, keyed by the file. */
    private val shots by lazy { getSharedPreferences("shots", MODE_PRIVATE) }

    private fun tagShot(uri: Uri, id: String = if (ui.logActive) "" else ui.camera.id, name: String = when {
        ui.logActive -> "Log"
        ui.isOriginal -> "No look"
        else -> ui.camera.name
    }) = shots.edit { putString(uri.toString(), "$id\t$name") }

    override fun lookOf(item: MediaItem): Pair<String, String>? =
        shots.getString(item.uri.toString(), null)?.split('\t', limit = 2)?.takeIf { it.size == 2 }?.let { it[0] to it[1] }

    override fun useLookOf(item: MediaItem) {
        val id = lookOf(item)?.first ?: return
        val cam = FilmCameras.byId(id)
        if (id.isNotEmpty() && cam.id != id) { ui.message = "That look isn't here any more"; return }
        selectCamera(cam)
        if (!cam.id.startsWith(CustomLooks.USER_PREFIX) && cam.category != app.filmcam.film.CameraCategory.ORIGINAL) ui.category = cam.category
        ui.viewing = null
        backToCamera()
        ui.message = if (cam.id == FilmCameras.ORIGINAL.id) "No look" else "${cam.name} is on"
    }

    override fun toggleFavourite(id: String) {
        val now = if (id in ui.favourites) ui.favourites - id else ui.favourites + id
        ui.favourites = now
        prefs.edit { putStringSet("favourites", now) }
    }

    private fun refreshGallery() {
        io.execute {
            val items = MediaLibrary.list(this)
            runOnUiThread { ui.gallery = items }
        }
    }

    override fun openGallery() {
        leaveCamera(Screen.GALLERY)
        refreshGallery()
    }

    override fun closeGallery() {
        if (ui.edit != null) { ui.screen = Screen.CAMERA; return }
        backToCamera()
    }

    private fun showViewer(item: MediaItem, fromGallery: Boolean) {
        viewerFromGallery = fromGallery
        ui.viewing = item
        leaveCamera(Screen.VIEWER)
    }

    override fun openItem(item: MediaItem) = showViewer(item, fromGallery = true)

    override fun closeViewer() {
        ui.viewing = null
        if (viewerFromGallery) ui.screen = Screen.GALLERY
        else if (ui.edit != null) ui.screen = Screen.CAMERA
        else backToCamera()
    }

    override fun shareItem(item: MediaItem) {
        val send = Intent(Intent.ACTION_SEND).apply {
            type = if (item.video) "video/mp4" else "image/jpeg"
            putExtra(Intent.EXTRA_STREAM, item.uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        try { startActivity(Intent.createChooser(send, null)) } catch (e: ActivityNotFoundException) { ui.message = "No app to share with" }
    }

    override fun deleteItem(item: MediaItem) {
        io.execute {
            val ok = MediaSaver.delete(this, item.uri)
            val items = MediaLibrary.list(this)
            runOnUiThread {
                if (!ok) { ui.message = "Couldn't delete it"; return@runOnUiThread }
                ui.gallery = items
                if (ui.lastUri == item.uri) {
                    ui.lastUri = items.firstOrNull()?.uri
                    ui.lastIsVideo = items.firstOrNull()?.video == true
                    ui.thumbnail = null
                    items.firstOrNull()?.let { loadThumb(it) }
                }
                if (ui.viewing?.uri == item.uri) closeViewer()
            }
        }
    }

    private fun loadThumb(item: MediaItem) {
        io.execute {
            val t = runCatching { contentResolver.loadThumbnail(item.uri, Size(240, 240), null) }.getOrNull()
            runOnUiThread { if (ui.lastUri == item.uri) ui.thumbnail = t }
        }
    }

    override fun trimItem(item: MediaItem, startMs: Long, endMs: Long) {
        if (ui.progress >= 0f) return
        ui.progress = 0f
        ui.progressLabel = "Trimming"
        io.execute {
            val out = Trimmer.trim(this, item.uri, startMs * 1000L, endMs * 1000L) { f -> runOnUiThread { ui.progress = f } }
            val items = MediaLibrary.list(this)
            runOnUiThread {
                ui.progress = -1f
                ui.gallery = items
                if (out == null) { ui.message = "Couldn't trim the clip"; return@runOnUiThread }
                ui.message = "Trimmed copy saved"
                shots.getString(item.uri.toString(), null)?.let { t -> shots.edit { putString(out.toString(), t) } }
                items.firstOrNull { it.uri == out }?.let { ui.viewing = it }
                ui.lastUri = out
                ui.lastIsVideo = true
                items.firstOrNull { it.uri == out }?.let { loadThumb(it) }
            }
        }
    }

    // ------------------------------------------------------------------ subtitles

    private fun subtitleFile(uri: Uri): java.io.File {
        val id = java.security.MessageDigest.getInstance("SHA-1").digest(uri.toString().toByteArray())
            .joinToString("") { "%02x".format(it) }
        return java.io.File(java.io.File(filesDir, "subtitles").apply { mkdirs() }, "$id.json")
    }

    /** Where closing the subtitle editor goes back to (the viewer, or the camera after a take). */
    private var subtitlesReturn = Screen.VIEWER

    override fun openSubtitles(item: MediaItem) {
        if (!item.video) return
        subtitlesReturn = if (ui.screen == Screen.SUBTITLES) subtitlesReturn else ui.screen
        io.execute {
            val info = MediaLibrary.videoInfo(this, item.uri)
            val saved = runCatching { SubtitleTrack.fromJson(org.json.JSONObject(subtitleFile(item.uri).readText())) }.getOrNull()
            runOnUiThread {
                if (info == null) { ui.message = "Couldn't read the clip"; return@runOnUiThread }
                val session = SubtitleSession(item, info.uprightW.toFloat() / max(1, info.uprightH), info.durationMs)
                session.track = saved
                ui.subtitles = session
                ui.screen = Screen.SUBTITLES
            }
        }
    }

    override fun closeSubtitles() {
        ui.subtitles = null
        if (subtitlesReturn == Screen.CAMERA || (subtitlesReturn == Screen.VIEWER && ui.viewing == null)) backToCamera()
        else ui.screen = subtitlesReturn
    }

    override fun setGemini(key: String, model: String) {
        ui.geminiKey = key.trim()
        ui.geminiModel = model.trim().ifEmpty { GeminiTranscriber.DEFAULT_MODEL }
        prefs.edit { putString("geminiKey", ui.geminiKey); putString("geminiModel", ui.geminiModel) }
    }

    private var transcriber: GeminiTranscriber? = null

    override fun generateSubtitles() {
        val s = ui.subtitles ?: return
        if (s.status != null) return
        val key = ui.geminiKey
        if (key.isBlank()) { s.error = "Add your Gemini API key first"; return }
        val t = GeminiTranscriber(key, ui.geminiModel)
        transcriber = t
        s.error = null
        s.status = "Reading the sound"
        s.startedAt = System.currentTimeMillis()
        s.linesSoFar = 0
        Thread({
            try {
                val audio = AudioExtract.extract(this, s.item.uri) ?: throw TranscribeException("This clip has no sound")
                val cues = t.transcribe(audio, s.durationMs,
                    onStatus = { st -> runOnUiThread { s.status = st } },
                    onText = { text ->
                        // Each finished line carries an "end": count them as they stream in.
                        val n = Regex("\"end\"").findAll(text).count()
                        runOnUiThread { if (s.status != null) { s.status = "Writing"; s.linesSoFar = n } }
                    })
                runOnUiThread {
                    s.status = null
                    if (cues.isEmpty()) { s.error = "No speech found in this clip"; return@runOnUiThread }
                    // A clip spoken in Telugu opens on Telugu subtitles; otherwise English.
                    val teluguMostly = cues.count { it.language.startsWith("te") } * 2 > cues.size
                    val style = (s.track?.style ?: SubtitleStyle()).let {
                        if (s.track == null && teluguMostly) it.copy(language = SubtitleLanguage.TELUGU) else it
                    }
                    updateSubtitles(SubtitleTrack(cues, style))
                }
            } catch (e: TranscribeException) {
                runOnUiThread { s.status = null; s.error = e.message }
            } catch (e: Exception) {
                Log.e("FilmCam", "subtitles", e)
                runOnUiThread { s.status = null; s.error = "Couldn't make subtitles (${e.javaClass.simpleName}: ${e.message})" }
            } finally {
                if (transcriber === t) transcriber = null
            }
        }, "Subtitles").start()
    }

    /**
     * Test hook, debuggable builds only: `am start -n app.filmcam/.MainActivity --es test_edit <uri>
     * --es test_text "TEXT" --es test_pick "x,y"` opens a picture to develop, adds a text set behind
     * the subject and picks the subject at (x, y). Lets the cut-out be checked on an emulator.
     */
    private fun debugIntent(i: Intent?) {
        if (i == null || applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE == 0) return
        i.getStringExtra("test_edit")?.let { startEdit(Uri.parse(it), false) }
        i.getStringExtra("test_text")?.let { t ->
            setTextLayers(listOf(TextLayer(id = 1L, text = t, font = FontLibrary.SUBTITLE_LATIN, size = 0.16f, y = 0.4f, behind = true)))
        }
        i.getStringExtra("test_pick")?.split(',')?.mapNotNull { it.toFloatOrNull() }?.takeIf { it.size == 2 }?.let { (x, y) ->
            main.postDelayed({ pickSubject(x, y) }, 4000)
        }
        i.getStringExtra("test_shoot")?.toLongOrNull()?.let { ms -> main.postDelayed({ shutter() }, ms) }
        i.getStringExtra("test_seg")?.let { path -> debugSegment(path, i.getStringExtra("test_seg_pick")) }
        i.getStringExtra("test_burn")?.let { u ->
            openSubtitles(MediaItem(Uri.parse(u), true, 0L))
            main.postDelayed({
                ui.subtitles?.track = SubtitleTrack(listOf(Cue(0, 600_000, english = "Subtitle test")))
                burnSubtitles()
            }, 4000)
        }
    }

    /** Debug: cuts the subject out of a picture file and writes the matte next to it. */
    private fun debugSegment(path: String, pickAt: String?) = Thread {
        val src = android.graphics.BitmapFactory.decodeFile(path) ?: return@Thread
        val k = SubjectMasker.INPUT_SIDE.toFloat() / maxOf(src.width, src.height)
        val small = android.graphics.Bitmap.createScaledBitmap(src, (src.width * k).toInt(), (src.height * k).toInt(), true)
        val buf = java.nio.ByteBuffer.allocateDirect(small.width * small.height * 4)
        small.copyPixelsToBuffer(buf)
        val m = SubjectMasker(applicationContext)
        m.onStatus = { Log.i("SegTest", "status: $it") }
        m.onSubject = { Log.i("SegTest", "subject: $it") }
        pickAt?.split(',')?.mapNotNull { it.toFloatOrNull() }?.takeIf { it.size == 2 }?.let { (x, y) -> m.pick(x, y) }
        for (run in 0 until 3) {
            val t0 = System.nanoTime()
            m.submit(buf, small.width, small.height)
            m.await(300_000)
            Log.i("SegTest", "run $run: ${(System.nanoTime() - t0) / 1_000_000} ms")
        }
        val matte = m.latest
        Log.i("SegTest", "matte ${matte?.w}x${matte?.h} empty=${matte?.empty}")
        if (matte != null) {
            val out = android.graphics.Bitmap.createBitmap(matte.w, matte.h, android.graphics.Bitmap.Config.ARGB_8888)
            val px = IntArray(matte.w * matte.h) { val v = matte.pixels.get(it).toInt() and 0xFF; (0xFF shl 24) or (v shl 16) or (v shl 8) or v }
            out.setPixels(px, 0, matte.w, 0, 0, matte.w, matte.h)
            java.io.FileOutputStream(java.io.File(filesDir, "matte.png")).use { out.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
        }
        m.release()
    }.start()

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        debugIntent(intent)
    }

    // ------------------------------------------------------------------ live subtitles

    private var captioner: LiveCaptioner? = null

    /** The clip being recorded, and when it started (elapsedRealtime): live lines are timed on it. */
    private var recordingUri: Uri? = null
    private var recordingStartedAt = 0L

    /**
     * Starts listening to the recording's own sound. Lines show on screen only; they are kept
     * with the clip as subtitles to fix, style and burn in afterwards.
     */
    private fun startCaptions() {
        if (!ui.recording) return
        val c = captioner ?: LiveCaptioner(this).also { cap ->
            captioner = cap
            cap.onCaption = { t -> ui.liveCaption = t }
            cap.onState = { st -> ui.captionState = st }
            cap.onProblem = { msg -> ui.message = msg }
        }
        AudioPump.tap = { b, o, l -> c.feed(b, o, l) }
        c.start(if (ui.captionLanguage == "te") "te-IN" else "en-IN", AudioPump.SAMPLE_RATE, recordingStartedAt)
    }

    /** Stops listening (captions turned off, or the take ended); the lines so far are kept. */
    private fun stopCaptions(): List<Cue> {
        AudioPump.tap = null
        val cues = captioner?.stop() ?: emptyList()
        ui.liveCaption = null
        ui.captionState = ""
        return cues
    }

    /** The take ended: its live lines become the clip's subtitles, ready to edit. */
    private fun keepCaptions(uri: Uri?) {
        val cues = stopCaptions()
        captioner?.reset()
        if (uri == null || cues.isEmpty()) return
        val te = cues.any { it.language == "te" }
        val en = cues.any { it.language != "te" }
        val language = if (te && en) SubtitleLanguage.BOTH else if (te) SubtitleLanguage.TELUGU else SubtitleLanguage.ENGLISH
        val json = SubtitleTrack(cues, SubtitleStyle(language = language)).toJson().toString()
        val file = subtitleFile(uri)
        io.execute { runCatching { file.writeText(json) } }
        ui.captionsFor = uri
    }

    override fun setLiveCaptions(on: Boolean) {
        if (on && !LiveCaptioner.supported(this)) {
            ui.message = if (android.os.Build.VERSION.SDK_INT < 33) "Live subtitles need Android 13 or newer" else "No speech recognition on this phone"
            return
        }
        ui.liveCaptions = on
        prefs.edit { putBoolean("liveCaptions", on) }
        if (on) startCaptions() else stopCaptions()
    }

    override fun editLiveSubtitles() {
        val uri = ui.captionsFor ?: return
        if (ui.recording || ui.savingVideo) return
        ui.captionsFor = null
        leaveCamera(Screen.CAMERA)
        openSubtitles(MediaItem(uri, true, System.currentTimeMillis()))
    }

    override fun setCaptionLanguage(lang: String) {
        ui.captionLanguage = lang
        prefs.edit { putString("captionLanguage", lang) }
        if (ui.liveCaptions && ui.recording) { stopCaptions(); startCaptions() }
    }

    override fun cancelSubtitles() {
        transcriber?.cancel()
        transcriber = null
        ui.subtitles?.let { it.status = null; it.error = "Cancelled" }
    }

    override fun updateSubtitles(track: SubtitleTrack) {
        val s = ui.subtitles ?: return
        s.track = track
        val file = subtitleFile(s.item.uri)
        val json = track.toJson().toString()
        io.execute { runCatching { file.writeText(json) } }
    }

    override fun saveSrt() {
        val s = ui.subtitles ?: return
        val track = s.track ?: return
        val lang = track.style.language
        val suffix = when (lang) { SubtitleLanguage.ENGLISH -> "en"; SubtitleLanguage.TELUGU -> "te"; SubtitleLanguage.BOTH -> "te-en" }
        io.execute {
            val name = "FilmCam_${SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())}.$suffix.srt"
            val uri = MediaSaver.saveDownload(this, name, "application/x-subrip", track.toSrt(lang))
            runOnUiThread { ui.message = if (uri != null) "Saved $name to Downloads" else "Couldn't save the .srt" }
        }
    }

    /**
     * Burns the subtitles into a copy of the clip: every frame goes through the engine with
     * the plain Original look (no grain, no grade) and the cue showing at its time as text.
     */
    override fun burnSubtitles() {
        val s = ui.subtitles ?: return
        val track = s.track ?: return
        if (ui.progress >= 0f || exporter != null) return
        val info = MediaLibrary.videoInfo(this, s.item.uri) ?: run { ui.message = "Couldn't read the clip"; return }
        stopPreviewPlayer()
        engine.closeCameraInput()
        val saved = listOf(engine.look, engine.textLayers, engine.upright, engine.videoMode, engine.maxWorkSide,
            engine.outputAspect, engine.simulateShutter, engine.logEncode)
        val aspect = info.uprightW.toFloat() / max(1, info.uprightH)
        engine.look = FilmCameras.ORIGINAL.look
        engine.textLayers = emptyList()
        engine.upright = true
        engine.videoMode = true
        engine.simulateShutter = false
        engine.logEncode = 0
        engine.outputAspect = aspect
        engine.maxWorkSide = min(3840, max(info.uprightW, info.uprightH))
        ui.progress = 0f
        ui.progressLabel = "Adding subtitles"
        exporter = VideoExporter(this, s.item.uri, info, engine,
            onProgress = { f -> runOnUiThread { ui.progress = f } },
            onFrameTime = { us -> engine.textLayers = track.layersAt(us / 1000, aspect, fonts) },
            onDone = { out ->
                @Suppress("UNCHECKED_CAST")
                runOnUiThread {
                    exporter = null
                    ui.progress = -1f
                    engine.look = saved[0] as FilmLook
                    engine.textLayers = saved[1] as List<TextLayer>
                    engine.upright = saved[2] as Boolean
                    engine.videoMode = saved[3] as Boolean
                    engine.maxWorkSide = saved[4] as Int
                    engine.outputAspect = saved[5] as Float
                    engine.simulateShutter = saved[6] as Boolean
                    engine.logEncode = saved[7] as Int
                    if (out == null) { ui.message = "Couldn't add the subtitles"; return@runOnUiThread }
                    ui.message = "Saved a copy with subtitles"
                    ui.lastUri = out
                    ui.lastIsVideo = true
                    io.execute {
                        val items = MediaLibrary.list(this)
                        runOnUiThread {
                            ui.gallery = items
                            items.firstOrNull { it.uri == out }?.let { loadThumb(it); ui.viewing = it }
                            ui.subtitles = null
                            ui.screen = Screen.VIEWER
                        }
                    }
                }
            },
        ).also { it.start() }
    }

    // ------------------------------------------------------------------ importing

    override fun importMedia() {
        try {
            mediaPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo))
        } catch (e: ActivityNotFoundException) {
            ui.message = "No photo picker on this phone"
        }
    }

    override fun editItem(item: MediaItem) = startEdit(item.uri, item.video)

    /** Brings a picture or clip into the viewfinder to develop with any look. */
    private fun startEdit(uri: Uri, video: Boolean) {
        stopPreviewPlayer()
        engine.showStill(null)
        cancelSeries()
        if (ui.recording) stopRecording(immediately = true)
        camera?.close()
        io.execute {
            val session: EditSession? = if (video) {
                MediaLibrary.videoInfo(this, uri)?.let { EditSession(uri, true, it.uprightW, it.uprightH, it.durationMs) }
            } else {
                decodeUpright(uri, 2048)?.let { bmp ->
                    val s = EditSession(uri, false, bmp.width, bmp.height)
                    engine.showStill(bmp)
                    s
                }
            }
            runOnUiThread {
                if (session == null) { ui.message = "Couldn't open that file"; if (ui.edit == null) backToCamera(); return@runOnUiThread }
                ui.edit = session
                ui.editRatio = null
                ui.viewing = null
                ui.screen = Screen.CAMERA
                ui.dock = Dock.LOOKS
                ui.quick = null
                engine.upright = true
                engine.videoMode = video
                engine.maxWorkSide = 1920
                engine.simulateShutter = true
                engine.outputAspect = ui.frameAspect
                pushLook()
                if (video) startPreviewPlayer(session)
            }
        }
    }

    private fun startPreviewPlayer(e: EditSession) {
        stopPreviewPlayer()
        val info = MediaLibrary.videoInfo(this, e.uri) ?: return
        // The decoder turns the picture upright itself (the clip's rotation-degrees reaches the
        // SurfaceTexture transform), so the engine adds no turn of its own.
        engine.openCameraInput(info.width, info.height, 0) { surface ->
            runOnUiThread {
                if (ui.edit !== e || exporter != null) return@runOnUiThread
                previewPlayer = PreviewPlayer(this, e.uri, surface).also { it.start() }
            }
        }
    }

    private fun stopPreviewPlayer() {
        previewPlayer?.stop()
        previewPlayer = null
    }

    override fun cancelEdit() {
        exporter?.cancel()
        stopPreviewPlayer()
        engine.showStill(null)
        engine.closeCameraInput()
        engine.upright = false
        ui.edit = null
        ui.editRatio = null
        ui.dock = Dock.NONE
        backToCamera()
    }

    /** Decodes a picture upright (EXIF applied), its long side at most [maxSide]. */
    private fun decodeUpright(uri: Uri, maxSide: Int): Bitmap? = try {
        ImageDecoder.decodeBitmap(ImageDecoder.createSource(contentResolver, uri)) { decoder, info, _ ->
            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            val long = max(info.size.width, info.size.height)
            if (long > maxSide) {
                val k = maxSide.toFloat() / long
                decoder.setTargetSize(max(1, (info.size.width * k).toInt()), max(1, (info.size.height * k).toInt()))
            }
        }
    } catch (e: Throwable) {
        Log.e("FilmCam", "decodeUpright", e)
        null
    }

    /** The shutter while editing: develop the full picture, or the whole clip, with the look. */
    private fun saveEdit() {
        val e = ui.edit ?: return
        if (ui.progress >= 0f || ui.developing > 0) return
        val look = engine.look
        if (!e.video) {
            ui.developing++
            ui.flashPulse++
            val fx = engine.liveFx()
            io.execute {
                val bmp = decodeUpright(e.uri, engine.maxStillSide())
                if (bmp == null) { runOnUiThread { ui.developing--; ui.message = "Couldn't read the picture" }; return@execute }
                engine.developStill(bmp, 0, false, look, 0, StillCrop(aspect = ui.editRatio?.value), fx) { out ->
                    if (out == null) runOnUiThread { ui.developing--; ui.message = "Couldn't develop the picture" }
                    else io.execute {
                        savePhoto(out, alreadyOnIo = true)
                        runOnUiThread { ui.developing--; ui.message = "Saved with ${ui.camera.name}" }
                    }
                }
            }
            return
        }
        val info = MediaLibrary.videoInfo(this, e.uri) ?: run { ui.message = "Couldn't read the clip"; return }
        stopPreviewPlayer()
        engine.closeCameraInput()
        engine.videoMode = true
        engine.maxWorkSide = min(3840, max(info.uprightW, info.uprightH))
        ui.progress = 0f
        ui.progressLabel = "Developing"
        exporter = VideoExporter(this, e.uri, info, engine,
            onProgress = { f -> runOnUiThread { ui.progress = f } },
            onDone = { out ->
                runOnUiThread {
                    exporter = null
                    ui.progress = -1f
                    engine.maxWorkSide = 1920
                    if (out != null) {
                        ui.message = "Saved with ${ui.camera.name}"
                        tagShot(out)
                        ui.lastUri = out
                        ui.lastIsVideo = true
                        loadThumb(MediaItem(out, true, 0L))
                    } else {
                        ui.message = "Couldn't develop the clip"
                    }
                    if (ui.edit === e && resumed) startPreviewPlayer(e)
                }
            },
        ).also { it.start() }
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
        if ((keyCode == KeyEvent.KEYCODE_VOLUME_DOWN || keyCode == KeyEvent.KEYCODE_VOLUME_UP) && ui.hasCamera &&
            ui.screen == Screen.CAMERA && ui.progress < 0f
        ) {
            if (event?.repeatCount == 0) shutter()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    // ------------------------------------------------------------------ photo

    private fun takePhoto() {
        val cam = camera ?: return
        val look = engine.look   // what the viewfinder shows: the look, or Original with its style
        if (look.multiShot == MultiShot.SAMPLER) {
            if (ui.sampling) return
            ui.sampling = true
            click(MediaActionSound.SHUTTER_CLICK)
            engine.captureSampler(look) { grid ->
                runOnUiThread { ui.sampling = false }
                if (grid == null) runOnUiThread { ui.message = "Couldn't take the frames" } else savePhoto(grid)
            }
            return
        }
        if (ui.developing >= 2) return // don't pile up full-res frames
        val turns = ui.quarterTurns
        val shotLook = if (look.multiShot == MultiShot.HALF_FRAME) look.copy(frame = FrameStyle.NONE) else look
        // Original, unframed, in the sensor's own shape: keep the camera's JPEG as it is.
        val untouched = look.copy(exposureEv = 0f, style = app.filmcam.film.StyleSetting()) == FilmCameras.ORIGINAL.look &&
            look.style.isIdentity && ui.textLayers.isEmpty() &&
            ui.photoRatio == AspectRatio.R3_4
        // The saved frame has the viewfinder's shape, turned with the phone.
        val ratio = ui.photoRatio.value
        val aspect = if (turns % 2 == 1) 1f / ratio else ratio
        val fx = engine.liveFx()
        ui.developing++
        ui.flashPulse++
        click(MediaActionSound.SHUTTER_CLICK)
        engine.snapshotTrail()
        cam.takePicture(turns) { jpeg ->
            if (jpeg == null) {
                runOnUiThread { ui.developing--; ui.message = "Couldn't take the picture" }
                return@takePicture
            }
            io.execute {
                if (untouched && !jpeg.mirror && jpeg.zoomCrop <= 1.001f) saveUntouched(jpeg)
                else developJpeg(jpeg, shotLook, turns, look.multiShot == MultiShot.HALF_FRAME, StillCrop(aspect, jpeg.zoomCrop), fx)
            }
        }
    }

    private fun saveUntouched(jpeg: StillJpeg) {
        val uri = MediaSaver.saveJpeg(this, jpeg.bytes, jpeg.rotationCw)
        val thumb = uri?.let { runCatching { contentResolver.loadThumbnail(it, Size(240, 240), null) }.getOrNull() }
        runOnUiThread {
            ui.developing--
            if (uri == null) { ui.message = "Couldn't save the picture"; return@runOnUiThread }
            tagShot(uri, "", "No look")
            ui.lastUri = uri
            ui.lastIsVideo = false
            if (thumb != null) ui.thumbnail = thumb
        }
    }

    private fun developJpeg(jpeg: StillJpeg, look: FilmLook, turns: Int, halfFrame: Boolean, crop: StillCrop, fx: app.filmcam.film.FrameFx) {
        val still = decode(jpeg.bytes, engine.maxStillSide())
        if (still == null) {
            runOnUiThread { ui.developing--; ui.message = "Couldn't read the picture" }
            return
        }
        engine.developStill(still, jpeg.rotationCw, jpeg.mirror, look, turns, crop, fx) { developed ->
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
                    tagShot(uri)
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
        if (ui.logPath == app.filmcam.ui.LogPath.HLG10 && ui.logActive) { startDirectRecording(); return }
        val size = engine.outputSize ?: return
        val turns = ui.quarterTurns
        // The encoder runs landscape; the file carries a rotation for players.
        val choice = VideoRecorder.choose(size.height, size.width, ui.fps, log = ui.logActive)
        val target = MediaSaver.createVideo(this) ?: run { ui.message = "Couldn't create the video file"; return }
        val (uri, pfd) = target
        val recorder = try {
            VideoRecorder.create(
                choice, (turns * 90 + 90) % 360, pfd,
                audio = if (hasPermission(Manifest.permission.RECORD_AUDIO)) AudioPump.create() else null,
            ) { ok -> onVideoFinished(uri, ok) }
        } catch (e: Exception) {
            Log.e("FilmCam", "recorder", e)
            runCatching { pfd.close() }
            MediaSaver.publishVideo(this, uri, false)
            ui.message = "Video encoder unavailable"
            return
        }
        ui.encoderInfo = "${choice.width}×${choice.height} ${choice.codecName} ${choice.fps}p" + if (ui.logActive) " · Log" else ""
        click(MediaActionSound.START_VIDEO_RECORDING)
        engine.startRecording(recorder)
        ui.recording = true
        ui.dock = app.filmcam.ui.Dock.NONE
        ui.recordStartMs = System.currentTimeMillis()
        recordingUri = uri
        tagShot(uri)
        recordingStartedAt = android.os.SystemClock.elapsedRealtime()
        ui.captionsFor = null
        if (ui.liveCaptions) startCaptions()
    }

    /** A 10-bit HLG take: the camera writes straight into the prepared encoder. */
    private fun startDirectRecording() {
        val cam = camera ?: return
        val rec = directRecorder ?: run { ui.message = "10-bit recorder isn't ready yet"; return }
        val target = MediaSaver.createVideo(this) ?: run { ui.message = "Couldn't create the video file"; return }
        val (uri, pfd) = target
        // Sound on the same clock as the camera's frame timestamps.
        val realtime = caps()?.realtimeTimestamps == true
        val clock: () -> Long = if (realtime) android.os.SystemClock::elapsedRealtimeNanos else System::nanoTime
        try {
            rec.open(cam.uprightRotation(ui.quarterTurns), pfd,
                if (hasPermission(Manifest.permission.RECORD_AUDIO)) AudioPump.create(clock) else null) { ok -> onVideoFinished(uri, ok) }
            rec.start()
        } catch (e: Exception) {
            Log.e("FilmCam", "10-bit start", e)
            runCatching { pfd.close() }
            MediaSaver.publishVideo(this, uri, false)
            ui.message = "10-bit recording failed"
            return
        }
        directRecorder = null
        directActive = rec
        cam.setDirectRecording(true)
        ui.encoderInfo = "${rec.width}×${rec.height} HEVC 10-bit HLG ${ui.fps}p"
        click(MediaActionSound.START_VIDEO_RECORDING)
        ui.recording = true
        ui.dock = app.filmcam.ui.Dock.NONE
        ui.recordStartMs = System.currentTimeMillis()
        recordingUri = uri
        tagShot(uri)
        recordingStartedAt = android.os.SystemClock.elapsedRealtime()
        ui.captionsFor = null
        if (ui.liveCaptions) startCaptions()
    }

    private fun stopRecording(immediately: Boolean = false) {
        if (!ui.recording) return
        keepCaptions(recordingUri)
        recordingUri = null
        val direct = directActive
        if (direct != null) {
            camera?.setDirectRecording(false)
            // Let the frames already on their way land before closing the stream.
            main.postDelayed({ direct.stop() }, if (immediately) 0L else 150L)
            click(MediaActionSound.STOP_VIDEO_RECORDING)
            ui.recording = false
            ui.savingVideo = true
            return
        }
        engine.stopRecording(immediately)
        click(MediaActionSound.STOP_VIDEO_RECORDING)
        ui.recording = false
        ui.savingVideo = true
    }

    private fun onVideoFinished(uri: Uri, ok: Boolean) {
        io.execute {
            MediaSaver.publishVideo(this, uri, ok)
            val thumb = if (ok) runCatching { contentResolver.loadThumbnail(uri, Size(240, 240), null) }.getOrNull() else null
            runOnUiThread {
                ui.savingVideo = false
                if (directActive != null) {
                    // Arm a fresh 10-bit encoder on the same surface for the next take.
                    directActive = null
                    if (ui.useHlg) prepareDirect(caps())
                }
                if (ok) {
                    ui.lastUri = uri
                    ui.lastIsVideo = true
                    if (thumb != null) ui.thumbnail = thumb
                } else {
                    ui.message = "Video couldn't be saved"
                    if (ui.captionsFor == uri) ui.captionsFor = null
                }
                refreshAvailability()
            }
        }
    }
}

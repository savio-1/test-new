package app.filmcam

import android.graphics.BitmapFactory
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.asImageBitmap
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import app.filmcam.camera.CaptureMode
import app.filmcam.camera.Lens
import app.filmcam.film.FilmCameras
import app.filmcam.film.FontLibrary
import app.filmcam.film.TextLayer
import app.filmcam.ui.CameraActions
import app.filmcam.ui.CameraScreen
import app.filmcam.ui.Dock
import app.filmcam.ui.LocalViewfinderStill
import app.filmcam.ui.ThemeMode
import app.filmcam.ui.ToolGroup
import app.filmcam.ui.UiState
import org.junit.Rule
import org.junit.Test
import java.lang.reflect.Proxy

/** Renders the real screens to PNG (./gradlew recordPaparazziDebug) to review the design. */
class ScreenshotTest {
    @get:Rule
    val paparazzi = Paparazzi(deviceConfig = DeviceConfig.PIXEL_6, maxPercentDifference = 1.0)

    private val actions = Proxy.newProxyInstance(
        CameraActions::class.java.classLoader, arrayOf(CameraActions::class.java),
    ) { _, _, _ -> null } as CameraActions

    private fun state(theme: ThemeMode, setup: UiState.() -> Unit = {}) = UiState().apply {
        hasCamera = true
        this.theme = theme
        camera = FilmCameras.byId("classic35")
        look = camera.look
        lenses = listOf(Lens("0", 0.5f, false, 13, ".5×", 0.5f), Lens("0", 1f, false, 24, "1×", 1f), Lens("0", 3f, false, 77, "3×", 3f))
        lens = lenses[1]
        zoomStops = listOf(0.5f, 1f, 2f, 3f, 10f)
        hasFlash = true
        maxPhotoMp = 50
        fonts = FontLibrary(paparazzi.context)
        setup()
    }

    private fun shot(ui: UiState) {
        val frame = javaClass.classLoader!!.getResourceAsStream("frame.png").use { BitmapFactory.decodeStream(it) }.asImageBitmap()
        paparazzi.snapshot {
            CompositionLocalProvider(LocalViewfinderStill provides frame) { CameraScreen(ui, actions) }
        }
    }

    @Test fun homeLight() = shot(state(ThemeMode.LIGHT))
    @Test fun homeDark() = shot(state(ThemeMode.DARK))
    @Test fun looksDark() = shot(state(ThemeMode.DARK) { dock = Dock.LOOKS })
    @Test fun adjustLight() = shot(state(ThemeMode.LIGHT) { dock = Dock.ADJUST; toolGroup = ToolGroup.LIGHT; toolId = "halation" })
    @Test fun adjustFocusMode() = shot(state(ThemeMode.DARK) { dock = Dock.ADJUST; toolId = "exposure"; adjusting = true })
    @Test fun frameDark() = shot(state(ThemeMode.DARK) { dock = Dock.FRAME })
    @Test fun textLight() = shot(state(ThemeMode.LIGHT) {
        dock = Dock.TEXT
        textLayers = listOf(TextLayer(id = 1, text = "Summer '26", y = 0.8f), TextLayer(id = 2, text = "Lisbon", font = "asset:BebasNeue.ttf", y = 0.15f, size = 0.05f, tracking = 0.3f))
        selectedText = 1
    })
    @Test fun settingsDark() = shot(state(ThemeMode.DARK) { settingsOpen = true; mode = CaptureMode.VIDEO; availableVideoRes = setOf(app.filmcam.camera.VideoResolution.FHD, app.filmcam.camera.VideoResolution.UHD); availableFps = setOf(24, 25, 30) })
}

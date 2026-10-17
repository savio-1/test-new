package app.filmcam.ui

import android.app.Activity
import android.content.res.AssetManager
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LocalTextStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.core.view.WindowCompat

enum class ThemeMode(val label: String) { SYSTEM("Auto"), LIGHT("Light"), DARK("Dark") }

/**
 * The whole palette. Monochrome by design: selection is shown by inverting, and the one warm
 * accent is kept for the value being changed.
 */
@Immutable
data class Palette(
    val dark: Boolean,
    val bg: Color,
    val surface: Color,
    val surfaceHigh: Color,
    val line: Color,
    val text: Color,
    val muted: Color,
    val faint: Color,
    val accent: Color,
    val danger: Color,
    /** Background dots (the light theme sits on a fine dot grid). */
    val dots: Color,
)

// An editor's palette: near-black panels with hairline borders (white paper in light), text
// in one ink, and no colour of its own: the picture is the colour. Changed values are marked
// in a soft white rather than a hue.
val LightPalette = Palette(
    dark = false,
    bg = Color(0xFFF6F6F5),
    surface = Color(0xFFFFFFFF),
    surfaceHigh = Color(0xFFF0F0EF),
    line = Color(0xFFE2E2E0),
    text = Color(0xFF0B0B0B),
    muted = Color(0xFF7A7A78),
    faint = Color(0xFFB4B4B1),
    accent = Color(0xFF0B0B0B),
    danger = Color(0xFFE0442E),
    dots = Color(0x16000000),
)

val DarkPalette = Palette(
    dark = true,
    bg = Color(0xFF000000),
    surface = Color(0xFF0B0B0C),
    surfaceHigh = Color(0xFF161618),
    line = Color(0xFF242427),
    text = Color(0xFFF4F4F2),
    muted = Color(0xFF8E8E8A),
    faint = Color(0xFF4E4E4C),
    accent = Color(0xFFF4F4F2),
    danger = Color(0xFFF0553D),
    dots = Color(0x1AFFFFFF),
)

val LocalPalette = staticCompositionLocalOf { DarkPalette }

/**
 * The app's two faces: Inter for everything you read, and Space Mono for labels, values and
 * section heads (small, upper case, spaced out). Loaded once from the bundled fonts.
 */
object UiType {
    var sans: FontFamily = FontFamily.Default
        private set
    var mono: FontFamily = FontFamily.Monospace
        private set
    private var ready = false

    fun init(assets: AssetManager) {
        if (ready) return
        ready = true
        sans = FontFamily(
            Font("fonts/Inter.ttf", assets, FontWeight.Normal),
            Font("fonts/Inter.ttf", assets, FontWeight.Medium),
            Font("fonts/InterBold.ttf", assets, FontWeight.SemiBold),
            Font("fonts/InterBold.ttf", assets, FontWeight.Bold),
        )
        mono = FontFamily(Font("fonts/SpaceMono.ttf", assets))
    }
}

/** Shapes: crisp, nearly square corners, as in an editor. */
object Corners {
    val small = RoundedCornerShape(3.dp)
    val medium = RoundedCornerShape(6.dp)
    val large = RoundedCornerShape(10.dp)
}

@Composable
fun FilmTheme(mode: ThemeMode, content: @Composable () -> Unit) {
    val dark = when (mode) {
        ThemeMode.SYSTEM -> isSystemInDarkTheme()
        ThemeMode.LIGHT -> false
        ThemeMode.DARK -> true
    }
    val palette = if (dark) DarkPalette else LightPalette
    val view = LocalView.current
    val context = LocalContext.current
    SideEffect {
        val window = (context as? Activity)?.window ?: return@SideEffect
        WindowCompat.getInsetsController(window, view).apply {
            isAppearanceLightStatusBars = !dark
            isAppearanceLightNavigationBars = !dark
        }
    }
    UiType.init(context.assets)
    CompositionLocalProvider(
        LocalPalette provides palette,
        LocalIndication provides GentlePress,
        LocalTextStyle provides LocalTextStyle.current.merge(TextStyle(fontFamily = UiType.sans, color = palette.text)),
        content = content,
    )
}

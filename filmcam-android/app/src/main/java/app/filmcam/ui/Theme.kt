package app.filmcam.ui

import android.app.Activity
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

val LightPalette = Palette(
    dark = false,
    bg = Color(0xFFEDECE8),
    surface = Color(0xFFFFFFFF),
    surfaceHigh = Color(0xFFF5F4F1),
    line = Color(0xFFDDDBD5),
    text = Color(0xFF141414),
    muted = Color(0xFF85837E),
    faint = Color(0xFFB9B6AF),
    accent = Color(0xFFC9771E),
    danger = Color(0xFFE0442E),
    dots = Color(0x14000000),
)

val DarkPalette = Palette(
    dark = true,
    bg = Color(0xFF0A0A0B),
    surface = Color(0xFF17171A),
    surfaceHigh = Color(0xFF222226),
    line = Color(0xFF2B2B30),
    text = Color(0xFFF3F2EE),
    muted = Color(0xFF8C8A85),
    faint = Color(0xFF55534F),
    accent = Color(0xFFEDAA45),
    danger = Color(0xFFF0553D),
    dots = Color(0x0FFFFFFF),
)

val LocalPalette = staticCompositionLocalOf { DarkPalette }

/** Display serif for names and titles; everything else is the system sans. */
val SerifDisplay = FontFamily(Font(app.filmcam.R.font.instrument_serif))

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
    CompositionLocalProvider(LocalPalette provides palette, content = content)
}

package app.filmcam.camera

import android.hardware.camera2.params.TonemapCurve
import kotlin.math.exp
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.pow

/**
 * The log curve for video: Sony's published S-Log3 transfer function, applied to the sensor's
 * linear signal with Rec.709 primaries (the phone's own colour matrix). In a grading app,
 * set the input to "S-Log3" gamma and "Rec.709" colour space, or use the LUT the app saves.
 *
 * The camera underexposes by [UNDER] stops and the curve gives it back, so 18% grey lands
 * at 41% like on a cinema camera and the highlights keep ~4 stops above it before clipping.
 */
object LogCurve {
    const val UNDER = 1.7f

    private const val CUT = 171.2102946929

    /** Scene-linear reflectance (0.18 = grey) -> S-Log3 code value 0..1. */
    fun encode(x: Double): Double =
        if (x >= 0.01125) (420.0 + log10((x + 0.01) / 0.19) * 261.5) / 1023.0
        else (x * (CUT - 95.0) / 0.01125 + 95.0) / 1023.0

    /** S-Log3 code value 0..1 -> scene-linear reflectance. */
    fun decode(y: Double): Double {
        val v = y * 1023.0
        return if (v >= CUT) 10.0.pow((v - 420.0) / 261.5) * 0.19 - 0.01 else (v - 95.0) * 0.01125 / (CUT - 95.0)
    }

    /**
     * The camera's tone curve: sensor-linear input (1 = clip) -> S-Log3, undoing [under] stops of
     * underexposure. Points are spaced evenly in stops so the shadows get their share.
     */
    fun tonemap(points: Int, under: Float): TonemapCurve {
        val n = points.coerceIn(2, 64)
        val gain = 2.0.pow(under.toDouble())
        val curve = FloatArray(n * 2)
        for (i in 0 until n) {
            val t = i.toDouble() / (n - 1)
            val x = if (i == 0) 0.0 else (2.0.pow(t * 12.0) - 1.0) / (2.0.pow(12.0) - 1.0)
            curve[i * 2] = x.toFloat()
            curve[i * 2 + 1] = encode(x * gain).coerceIn(0.0, 1.0).toFloat()
        }
        return TonemapCurve(curve, curve, curve)
    }

    /** How log footage is shown on the phone ("view assist"): a soft filmic roll-off to Rec.709. */
    fun view(linear: Double): Double {
        val d = 1.0 - exp(-max(linear, 0.0) * 1.6)
        return if (d <= 0.0031308) d * 12.92 else 1.055 * d.pow(1 / 2.4) - 0.055
    }

    /** A 33-point .cube LUT from this log to the same Rec.709 picture the app shows. */
    fun cube(): String {
        val n = 33
        val sb = StringBuilder()
        sb.append("TITLE \"FilmCam S-Log3 (Rec.709) to Rec.709\"\n")
        sb.append("# FilmCam log: S-Log3 curve, Rec.709 primaries. Viewing transform as shown in the app.\n")
        sb.append("LUT_3D_SIZE $n\n")
        for (b in 0 until n) for (g in 0 until n) for (r in 0 until n) {
            val rr = view(decode(r / (n - 1.0)))
            val gg = view(decode(g / (n - 1.0)))
            val bb = view(decode(b / (n - 1.0)))
            sb.append("%.6f %.6f %.6f\n".format(java.util.Locale.US, rr, gg, bb))
        }
        return sb.toString()
    }
}

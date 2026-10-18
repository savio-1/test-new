package app.filmcam

import app.filmcam.camera.AspectRatio
import app.filmcam.camera.LogCurve
import app.filmcam.film.BlurMode
import app.filmcam.film.CameraCategory
import app.filmcam.film.FilmCameras
import app.filmcam.film.FilmFrameRate
import app.filmcam.film.FilmStocks
import app.filmcam.film.FrameStyle
import app.filmcam.film.MultiShot
import app.filmcam.film.PhotoStyle
import app.filmcam.film.ShutterSpeed
import app.filmcam.film.StampStyle
import app.filmcam.gl.Shaders
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.lang.reflect.Modifier

/**
 * Writes the platform-neutral description of the film engine to ../filmcam-shared: every film
 * stock, camera, photographic style and option as JSON, and the GLSL of every pass. The iOS app
 * reads the same files, so both platforms render the same looks. Every unit-test run rewrites
 * them when the Kotlin changes; on CI (CI set) a stale checked-in copy fails the build.
 */
class SpecExportTest {
    private val root = File(System.getProperty("user.dir")!!).let { if (it.name == "app") it.parentFile!! else it }
        .parentFile!!.resolve("filmcam-shared")

    @Test
    fun exportSpec() {
        val spec = linkedMapOf<String, Any?>(
            "version" to 1,
            "about" to "FilmCam film engine spec, generated from the Android sources by SpecExportTest. Do not edit by hand.",
            "stocks" to FilmStocks.ALL.map(::obj),
            "cameras" to FilmCameras.ALL.map {
                linkedMapOf("id" to it.id, "name" to it.name, "subtitle" to it.subtitle, "category" to it.category.name,
                    "look" to obj(it.look).also { l -> (l as MutableMap<String, Any?>)["stock"] = it.look.stock.id })
            },
            "categories" to CameraCategory.entries.map { linkedMapOf("id" to it.name, "label" to it.label) },
            "styles" to PhotoStyle.entries.map { linkedMapOf<String, Any?>("id" to it.name).apply { putAll(obj(it) as Map<String, Any?>) } },
            "frames" to FrameStyle.entries.map { linkedMapOf("id" to it.name, "label" to it.label, "shaderId" to it.shaderId) },
            "stamps" to StampStyle.entries.map { linkedMapOf("id" to it.name, "label" to it.label, "shaderId" to it.shaderId) },
            "blurModes" to BlurMode.entries.map { linkedMapOf("id" to it.name, "label" to it.label, "shaderId" to it.shaderId) },
            "shutterSpeeds" to ShutterSpeed.entries.map { linkedMapOf("id" to it.name, "label" to it.label, "seconds" to it.seconds) },
            "frameRates" to FilmFrameRate.entries.map { linkedMapOf("id" to it.name, "label" to it.label, "fps" to it.fps) },
            "multiShot" to MultiShot.entries.map { linkedMapOf("id" to it.name, "label" to it.label, "shots" to it.shots) },
            "aspectRatios" to AspectRatio.entries.map { linkedMapOf("id" to it.name, "w" to it.w, "h" to it.h) },
            "lutFormat" to "luts/<stock id>.png: 33^3 RGB, a 1089x33 strip; pixel (x = b*33 + r, y = g) is the output for input (r, g, b)/32. Stocks without one use the parametric grade.",
            "log" to linkedMapOf("curve" to "S-Log3", "primaries" to "Rec.709", "underexposeStops" to LogCurve.UNDER,
                "hlgGreyScale" to LogCurve.HLG_GREY, "view" to "srgb(1 - exp(-1.6 * linear))"),
        )
        val json = toJson(spec, "") + "\n"
        val specFile = root.resolve("spec/filmcam-spec.json")
        val shaders = mapOf(
            "vertex.vert" to Shaders.VERTEX, "develop_camera.frag" to Shaders.DEVELOP_OES, "develop_image.frag" to Shaders.DEVELOP_2D,
            "trail.frag" to Shaders.TRAIL, "bright.frag" to Shaders.BRIGHT, "blur.frag" to Shaders.BLUR, "gauss.frag" to Shaders.GAUSS, "final.frag" to Shaders.FINAL, "seg_input.frag" to Shaders.SEG_INPUT,
        )
        var stale = write(specFile, json)
        for ((name, src) in shaders) stale = write(root.resolve("shaders/$name"), src.trimStart() + "\n") || stale
        // Film stock LUTs (33^3 strips from tools/film-lab), byte for byte.
        val luts = root.parentFile!!.resolve("filmcam-android/app/src/main/assets/luts")
        luts.listFiles()?.sortedBy { it.name }?.forEach { f ->
            val dst = root.resolve("luts/${f.name}")
            if (!dst.exists() || !dst.readBytes().contentEquals(f.readBytes())) {
                dst.parentFile!!.mkdirs(); f.copyTo(dst, overwrite = true); stale = true
            }
        }

        assertEquals(FilmCameras.ALL.size, Regex("\"subtitle\"").findAll(json).count())
        assertTrue("filmcam-shared was out of date and has been rewritten; commit it", !stale || System.getenv("CI") == null)
    }

    /** Writes [text] if it changed; returns true when it did. */
    private fun write(f: File, text: String): Boolean {
        if (f.exists() && f.readText() == text) return false
        f.parentFile!!.mkdirs()
        f.writeText(text)
        return true
    }

    /** A data object's own fields, in declaration order. */
    private fun obj(o: Any): Any? {
        val out = linkedMapOf<String, Any?>()
        for (f in o.javaClass.declaredFields) {
            if (Modifier.isStatic(f.modifiers) || f.isSynthetic) continue
            if (o is Enum<*> && f.name in setOf("ordinal", "name")) continue
            f.isAccessible = true
            out[f.name] = value(f.get(o))
        }
        return out
    }

    private fun value(v: Any?): Any? = when (v) {
        null, is Number, is Boolean, is String -> v
        is Enum<*> -> v.name
        is FloatArray -> v.toList()
        is List<*> -> v.map(::value)
        else -> obj(v)
    }

    private fun toJson(v: Any?, indent: String): String = when (v) {
        null -> "null"
        is String -> "\"" + v.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n") + "\""
        is Float -> if (v == v.toInt().toFloat()) v.toInt().toString() else v.toString()
        is Double -> v.toString()
        is Long -> if (v > 0xFFFFFFL) "\"#%08X\"".format(v) else v.toString()   // colours as hex
        is Number, is Boolean -> v.toString()
        is Map<*, *> -> if (v.isEmpty()) "{}" else v.entries.joinToString(",\n", "{\n", "\n$indent}") { (k, x) ->
            "$indent  \"$k\": " + toJson(x, "$indent  ")
        }
        is List<*> -> if (v.all { it is Number }) v.joinToString(", ", "[", "]") { toJson(it, indent) }
            else v.joinToString(",\n", "[\n", "\n$indent]") { "$indent  " + toJson(it, "$indent  ") }
        else -> error("unexpected ${v::class}")
    }
}

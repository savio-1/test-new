package app.filmcam.film

// The cu_* LUTs are made by tools/film-lab/customlab.py: edit that, then run
//   python3 customlab.py luts ../../app/src/main/assets/luts [look ...]

/**
 * Custom looks: a creator's grade measured from their published before/after frames, and
 * any .cube LUT the person imports (their own, or one they bought), applied exactly.
 */
object CustomLooks {
    val STOCKS: List<FilmStock> = listOf(
        FilmStock(id = "cu_sleepycharlie", name = "Sleepy Charlie", colorGrain = 0.08f, monochrome = false, swatch = 0xFF89836E),
        // Dehancer's halation is redder than film's usual orange, and pulls a little blue.
        FilmStock(id = "cu_dehancer250d", name = "Dehancer 250D", colorGrain = 0.1f, monochrome = false, swatch = 0xFF8E7A68,
            halationColor = Rgb(1f, 0.2f, 0.02f)),
        FilmStock(id = "cu_dehancer500t", name = "Dehancer 500T", colorGrain = 0.1f, monochrome = false, swatch = 0xFF5E6676,
            halationColor = Rgb(1f, 0.2f, 0.02f)),
    )

    val CAMERAS: List<FilmCamera> by lazy {
        listOf(
            // Colour: fitted to the eight Rec.709 / Cinecell 02 pairs on sleepycharlie.com
            // (dense colour, cream-amber highlights, lifted navy blacks). Grain and halation:
            // measured from the same frames (fine grain, an orange halo round lights, no vignette).
            FilmCamera("cu_sleepycharlie", "Sleepy Charlie", "Cinecell 02 film look: dense colour, warm cream highlights, navy blacks",
                CameraCategory.CUSTOM, FilmLook(
                    stock = FilmStocks.byId("cu_sleepycharlie"), halation = 0.3f, halationSize = 0.35f, bloom = 0.08f,
                    vignette = 0f, aberration = 0f, grain = 0.22f, grainSize = 0.9f, softness = 0f,
                )),
            // Dehancer Pro. Colour: fitted to Dehancer's own before/after frames, with the film
            // lab's cine stocks filling in colours those frames don't show. Effects: matched to
            // Dehancer's None / Halation / Bloom / Grain frames rendered through these shaders
            // (grain 0.4 = its default 35 mm ISO 250; diffusion stands in for its wide bloom).
            FilmCamera("cu_dehancer250d", "Dehancer 250D", "Dehancer Pro's default: Kodak Vision3 250D daylight negative",
                CameraCategory.CUSTOM, FilmLook(
                    stock = FilmStocks.byId("cu_dehancer250d"), halation = 0.8f, halationSize = 0.35f, bloom = 0.1f,
                    diffusion = 0.3f, vignette = 0f, aberration = 0f, grain = 0.4f, grainSize = 1.0f, softness = 0f,
                )),
            FilmCamera("cu_dehancer500t", "Dehancer 500T", "Dehancer Pro: Kodak Vision3 500T tungsten, printed, with grain and bloom",
                CameraCategory.CUSTOM, FilmLook(
                    stock = FilmStocks.byId("cu_dehancer500t"), halation = 0.9f, halationSize = 0.4f, bloom = 0.1f,
                    diffusion = 0.3f, vignette = 0f, aberration = 0f, grain = 0.4f, grainSize = 1.0f, softness = 0f,
                )),
        )
    }

    /** Looks made from imported .cube files (set by the activity at start and on import). */
    @Volatile var imported: List<FilmCamera> = emptyList()

    /** Imported LUTs live in files/luts/<id>.png and their tiles in files/looks/<id>.jpg. */
    const val USER_PREFIX = "user_"

    /** A look for an imported LUT: the LUT alone, nothing added on top. */
    fun importedCamera(id: String, name: String): FilmCamera = FilmCamera(
        id, name, "Imported LUT", CameraCategory.CUSTOM,
        FilmLook(
            stock = FilmStock(id = id, name = name, colorGrain = 0f, monochrome = false, swatch = 0xFF8C8C8C),
            halation = 0f, bloom = 0f, vignette = 0f, aberration = 0f, grain = 0f,
        ),
    )
}

/** A .cube that couldn't be read, with why. */
class CubeException(message: String) : Exception(message)

/**
 * An Adobe / Resolve .cube 3D LUT. [data] holds size^3 RGB triples with red changing fastest,
 * then green, then blue, as the file lists them.
 */
class CubeLut(val title: String, val size: Int, val data: FloatArray, val domainMin: FloatArray, val domainMax: FloatArray) {

    /** The output for an input colour in 0..1 (trilinear, inputs mapped onto the domain). */
    fun sample(r: Float, g: Float, b: Float, out: FloatArray) {
        val n = size - 1
        fun pos(v: Float, c: Int): Float {
            val span = domainMax[c] - domainMin[c]
            val t = if (span > 0f) (v - domainMin[c]) / span else v
            return t.coerceIn(0f, 1f) * n
        }
        val pr = pos(r, 0); val pg = pos(g, 1); val pb = pos(b, 2)
        val r0 = minOf(pr.toInt(), n - 1); val g0 = minOf(pg.toInt(), n - 1); val b0 = minOf(pb.toInt(), n - 1)
        val fr = pr - r0; val fg = pg - g0; val fb = pb - b0
        for (c in 0 until 3) {
            fun at(dr: Int, dg: Int, db: Int) = data[(((b0 + db) * size + (g0 + dg)) * size + (r0 + dr)) * 3 + c]
            val c00 = at(0, 0, 0) * (1 - fr) + at(1, 0, 0) * fr
            val c10 = at(0, 1, 0) * (1 - fr) + at(1, 1, 0) * fr
            val c01 = at(0, 0, 1) * (1 - fr) + at(1, 0, 1) * fr
            val c11 = at(0, 1, 1) * (1 - fr) + at(1, 1, 1) * fr
            out[c] = ((c00 * (1 - fg) + c10 * fg) * (1 - fb) + (c01 * (1 - fg) + c11 * fg) * fb).coerceIn(0f, 1f)
        }
    }

    /**
     * The share of lattice points that jump away from their neighbours (more than 0.15 from
     * the mean of the six around them): near 0 for any real grade; a watermark or text burnt
     * into a Hald image shows up as a patch of them.
     */
    fun roughness(): Float {
        if (size < 3) return 0f
        var bad = 0
        var total = 0
        fun at(r: Int, g: Int, b: Int, c: Int) = data[((b * size + g) * size + r) * 3 + c]
        for (b in 1 until size - 1) for (g in 1 until size - 1) for (r in 1 until size - 1) {
            total++
            for (c in 0 until 3) {
                val mean = (at(r - 1, g, b, c) + at(r + 1, g, b, c) + at(r, g - 1, b, c) + at(r, g + 1, b, c) +
                    at(r, g, b - 1, c) + at(r, g, b + 1, c)) / 6f
                if (kotlin.math.abs(at(r, g, b, c) - mean) > 0.15f) { bad++; break }
            }
        }
        return if (total == 0) 0f else bad.toFloat() / total
    }

    /**
     * The app's LUT strip: 33^3 as a 1089x33 ARGB image, pixel (x = b*33 + r, y = g) holding
     * the output for input (r, g, b)/32.
     */
    fun toStrip(): IntArray {
        val n = 33
        val px = IntArray(n * n * n)
        val o = FloatArray(3)
        for (b in 0 until n) for (g in 0 until n) for (r in 0 until n) {
            sample(r / 32f, g / 32f, b / 32f, o)
            val ir = (o[0] * 255f + 0.5f).toInt(); val ig = (o[1] * 255f + 0.5f).toInt(); val ib = (o[2] * 255f + 0.5f).toInt()
            px[g * (n * n) + b * n + r] = (0xFF shl 24) or (ir shl 16) or (ig shl 8) or ib
        }
        return px
    }

    companion object {
        /**
         * A Hald CLUT: an identity image of every colour ([level]^3 pixels square, a
         * [level]^2-point cube, red changing fastest, row by row) after it has been through a
         * grade. Each pixel is the grade's output for its colour. [argb] holds the pixels.
         */
        fun fromHald(width: Int, height: Int, argb: IntArray): CubeLut {
            val level = (2..16).firstOrNull { it * it * it == width }
                ?: throw CubeException("That image isn't a Hald CLUT: it should be square, 512×512 (or another level³ size), not ${width}×$height")
            if (height != width) throw CubeException("A Hald CLUT is square; this one is ${width}×$height. Render it at its original size, without scaling or cropping")
            val n = level * level
            val data = FloatArray(n * n * n * 3)
            for (i in 0 until n * n * n) {
                val c = argb[i]
                data[i * 3] = ((c shr 16) and 255) / 255f
                data[i * 3 + 1] = ((c shr 8) and 255) / 255f
                data[i * 3 + 2] = (c and 255) / 255f
            }
            return CubeLut("", n, data, floatArrayOf(0f, 0f, 0f), floatArrayOf(1f, 1f, 1f))
        }

        /** The identity Hald CLUT of [level] (8: 512×512, a 64-point cube), as ARGB pixels. */
        fun identityHald(level: Int): IntArray {
            val n = level * level
            return IntArray(n * n * n) { i ->
                val r = i % n; val g = i / n % n; val b = i / (n * n)
                fun v(x: Int) = (x * 255f / (n - 1) + 0.5f).toInt()
                (0xFF shl 24) or (v(r) shl 16) or (v(g) shl 8) or v(b)
            }
        }

        fun parse(text: String): CubeLut {
            var title = ""
            var size = 0
            val min = floatArrayOf(0f, 0f, 0f)
            val max = floatArrayOf(1f, 1f, 1f)
            var values = FloatArray(0)
            var count = 0
            for (raw in text.lineSequence()) {
                val line = raw.substringBefore('#').trim()
                if (line.isEmpty()) continue
                val first = line[0]
                if (first.isLetter()) {
                    val parts = line.split(Regex("\\s+"))
                    when (parts[0].uppercase()) {
                        "TITLE" -> title = line.substringAfter("TITLE").trim().trim('"')
                        "LUT_3D_SIZE" -> {
                            size = parts.getOrNull(1)?.toIntOrNull() ?: throw CubeException("Bad LUT_3D_SIZE")
                            if (size !in 2..256) throw CubeException("LUT size $size isn't supported")
                            values = FloatArray(size * size * size * 3)
                        }
                        "LUT_1D_SIZE" -> throw CubeException("This is a 1D LUT; only 3D LUTs can be used as a look")
                        "DOMAIN_MIN" -> for (c in 0 until 3) min[c] = parts.getOrNull(c + 1)?.toFloatOrNull() ?: 0f
                        "DOMAIN_MAX" -> for (c in 0 until 3) max[c] = parts.getOrNull(c + 1)?.toFloatOrNull() ?: 1f
                        else -> Unit   // LUT_3D_INPUT_RANGE and other keywords: not needed
                    }
                    continue
                }
                if (size == 0) throw CubeException("No LUT_3D_SIZE before the data")
                val parts = line.split(Regex("\\s+"))
                if (parts.size < 3) continue
                if (count >= size * size * size) throw CubeException("More rows than LUT_3D_SIZE says")
                for (c in 0 until 3) values[count * 3 + c] = parts[c].toFloatOrNull() ?: throw CubeException("Bad number: ${parts[c]}")
                count++
            }
            if (size == 0) throw CubeException("Not a 3D .cube file")
            if (count != size * size * size) throw CubeException("Expected ${size * size * size} rows, found $count")
            return CubeLut(title, size, values, min, max)
        }
    }
}

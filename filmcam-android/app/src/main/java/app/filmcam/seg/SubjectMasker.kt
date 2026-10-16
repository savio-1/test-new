package app.filmcam.seg

import android.content.Context
import android.graphics.Bitmap
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.framework.image.ByteBufferExtractor
import com.google.mediapipe.framework.image.MPImage
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.imagesegmenter.ImageSegmenter
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.math.max
import kotlin.math.min

/**
 * Cuts the subject out of each frame so text can sit behind it.
 *
 * DeepLab v3 (MediaPipe, on-device) says what every pixel is: person, horse, dog, car, bike...
 * By default every person is the subject. A tap picks one subject instead: the connected
 * foreground region under the finger (a rider and their horse are one region), followed
 * from frame to frame as it moves, so two people side by side stay apart. Where the subject
 * is a person, the fast selfie model adds the soft edge of hair and clothing.
 *
 * The models run on one worker thread; the render thread hands over small upright frames
 * (see FilmRenderer.readSegInput) and takes the newest matte.
 */
class SubjectMasker(private val context: Context) {

    /** One matte: [w]x[h] bytes, 0 background .. 255 subject, first row at the top. */
    class Matte(val pixels: ByteBuffer, val w: Int, val h: Int, val seq: Long, val empty: Boolean)

    private sealed class Target {
        /** Every person in the frame (nothing picked yet). */
        data object AllPeople : Target()
        /** One subject, followed by its connected foreground region. */
        class One(val tracker: SubjectTracker) : Target()
    }

    private val thread = HandlerThread("subject").apply { start() }
    private val handler = Handler(thread.looper)
    private var people: ImageSegmenter? = null
    private var objects: ImageSegmenter? = null
    private var failed = false
    private var timestamp = 0L
    private var seq = 0L
    private var target: Target = Target.AllPeople

    @Volatile private var busy = false
    @Volatile private var inFlight: CountDownLatch? = null
    @Volatile private var pendingPick: FloatArray? = null
    @Volatile private var pendingReset = false

    /** Newest matte. */
    @Volatile var latest: Matte? = null
        private set

    /** What the subject is now ("People", "Horse"...), or null when a tap found nothing. Main thread. */
    var onSubject: ((String?) -> Unit)? = null

    val idle get() = !busy

    /** Picks the subject under ([x], [y]): upright picture space, 0..1, y down. */
    fun pick(x: Float, y: Float) { pendingPick = floatArrayOf(x, y) }

    /** Back to every person in the frame. */
    fun reset() { pendingReset = true }

    /** Blocks until the worker is free (a still waits for the live frame in flight). */
    fun awaitIdle(timeoutMs: Long) {
        val end = System.nanoTime() + timeoutMs * 1_000_000
        while (busy && System.nanoTime() < end) Thread.sleep(2)
    }

    /**
     * Starts segmenting an RGBA frame ([w]x[h], first row at the top) on the worker. Call
     * [await] before using [latest]; if the models are slower, the matte lands on a later frame.
     */
    fun submit(rgba: ByteBuffer, w: Int, h: Int) {
        if (busy || failed) return
        busy = true
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        rgba.position(0)
        bmp.copyPixelsFromBuffer(rgba)
        val done = CountDownLatch(1)
        inFlight = done
        handler.post {
            try {
                process(bmp)
            } catch (e: Throwable) {
                Log.e(TAG, "segment", e)
            } finally {
                bmp.recycle()
                busy = false
                done.countDown()
            }
        }
    }

    /** Waits up to [ms] for the frame last submitted. */
    fun await(ms: Long) {
        inFlight?.await(ms, TimeUnit.MILLISECONDS)
    }

    fun release() {
        handler.post {
            people?.close(); objects?.close()
            people = null; objects = null
        }
        thread.quitSafely()
    }

    // ------------------------------------------------------------------ worker

    private fun segmenter(asset: String, category: Boolean, delegate: Delegate): ImageSegmenter? = try {
        ImageSegmenter.createFromOptions(
            context,
            ImageSegmenter.ImageSegmenterOptions.builder()
                .setBaseOptions(BaseOptions.builder().setModelAssetPath(asset).setDelegate(delegate).build())
                .setRunningMode(RunningMode.VIDEO)
                .setOutputCategoryMask(category)
                .setOutputConfidenceMasks(!category)
                .build(),
        )
    } catch (e: Throwable) {
        Log.w(TAG, "load $asset on $delegate", e)
        null
    }

    private fun peopleModel() = people ?: segmenter(PEOPLE_MODEL, category = false, Delegate.CPU).also { people = it }

    /** DeepLab on the GPU where it runs (several times faster), else on the CPU. */
    private fun objectModel() = objects
        ?: (segmenter(OBJECT_MODEL, category = true, Delegate.GPU) ?: segmenter(OBJECT_MODEL, category = true, Delegate.CPU))
            .also { objects = it }

    /** Person confidence, 0..1 per pixel. */
    private fun personConfidence(img: MPImage): FloatArray? {
        val r = peopleModel()?.segmentForVideo(img, ++timestamp) ?: return null
        val masks = r.confidenceMasks().orElse(null) ?: return null
        // One channel (person), or background + person.
        val m = masks[if (masks.size > 1) 1 else 0]
        val out = FloatArray(m.width * m.height)
        ByteBufferExtractor.extract(m).order(ByteOrder.nativeOrder()).asFloatBuffer().get(out)
        masks.forEach { it.close() }
        return out
    }

    /** Object class per pixel (DeepLab v3 / PASCAL VOC: 0 background, 15 person...). */
    private fun objectClasses(img: MPImage): ByteArray? {
        val r = objectModel()?.segmentForVideo(img, ++timestamp) ?: return null
        val m = r.categoryMask().orElse(null) ?: return null
        val out = ByteArray(m.width * m.height)
        ByteBufferExtractor.extract(m).get(out)
        m.close()
        return out
    }

    private fun process(bmp: Bitmap) {
        val w = bmp.width
        val h = bmp.height
        val img = BitmapImageBuilder(bmp).build()
        if (pendingReset) {
            pendingReset = false
            target = Target.AllPeople
            post("People")
        }
        val cls = objectClasses(img) ?: return fail()
        pendingPick?.let { p ->
            pendingPick = null
            choose(cls, w, h, p[0], p[1])
        }

        val region: BooleanArray? = when (val t = target) {
            is Target.AllPeople -> BooleanArray(w * h) { (cls[it].toInt() and 0xFF) == PERSON }
            is Target.One -> t.tracker.follow(BooleanArray(w * h) { isForeground(cls[it]) }, w, h)
        }
        val out = ByteBuffer.allocateDirect(w * h)
        var any = false
        if (region != null) {
            var persons = 0
            for (i in region.indices) if (region[i]) {
                out.put(i, 255.toByte())
                any = true
                if ((cls[i].toInt() and 0xFF) == PERSON) persons++
            }
            // People: the selfie model's soft edge (hair, sleeves) around what DeepLab found.
            if (persons > 0) personConfidence(img)?.let { conf ->
                val near = Regions.dilate(BooleanArray(w * h) { region[it] && (cls[it].toInt() and 0xFF) == PERSON }, w, h, max(2, w / 40))
                for (i in conf.indices) if (near[i] && !region[i]) {
                    out.put(i, (conf[i] * 255f + 0.5f).toInt().coerceIn(0, 255).toByte())
                }
            }
        }
        out.position(0)
        latest = Matte(out, w, h, ++seq, empty = !any)
    }

    private fun isForeground(c: Byte): Boolean {
        val v = c.toInt() and 0xFF
        return v != 0 && v != 255
    }

    private fun fail() {
        failed = objects == null
        latest = null
    }

    /** Picks the foreground region under the finger; says what it is. */
    private fun choose(cls: ByteArray, w: Int, h: Int, x: Float, y: Float) {
        val px = (x * w).toInt().coerceIn(0, w - 1)
        val py = (y * h).toInt().coerceIn(0, h - 1)
        // The nearest foreground pixel within a small radius of the finger.
        val r = max(3, min(w, h) / 25)
        var best = -1
        var bestD = Int.MAX_VALUE
        for (dy in -r..r) for (dx in -r..r) {
            val xx = px + dx
            val yy = py + dy
            if (xx !in 0 until w || yy !in 0 until h) continue
            val i = yy * w + xx
            val d = dx * dx + dy * dy
            if (isForeground(cls[i]) && d < bestD) { bestD = d; best = i }
        }
        if (best < 0) { post(null); return }
        val t = SubjectTracker((best % w + 0.5f) / w, (best / w + 0.5f) / h)
        val region = t.follow(BooleanArray(w * h) { isForeground(cls[it]) }, w, h) ?: run { post(null); return }
        target = Target.One(t)
        // Name it after what most of it is ("Horse" for a rider on a horse too).
        val counts = IntArray(256)
        for (i in region.indices) if (region[i]) counts[cls[i].toInt() and 0xFF]++
        val main = counts.indices.maxBy { counts[it] }
        post(LABELS.getOrElse(main) { "Subject" })
    }

    private fun post(label: String?) {
        Handler(context.mainLooper).post { onSubject?.invoke(label) }
    }

    companion object {
        private const val TAG = "SubjectMasker"
        /** Longest side of the frames the models see. */
        const val INPUT_SIDE = 256
        private const val PEOPLE_MODEL = "seg/selfie_segmenter.tflite"
        private const val OBJECT_MODEL = "seg/deeplab_v3.tflite"
        private const val PERSON = 15
        private val LABELS = listOf(
            "Background", "Aeroplane", "Bicycle", "Bird", "Boat", "Bottle", "Bus", "Car", "Cat", "Chair", "Cow",
            "Table", "Dog", "Horse", "Motorbike", "Person", "Plant", "Sheep", "Sofa", "Train", "Screen",
        )
    }
}

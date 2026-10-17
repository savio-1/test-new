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
 * Two on-device models (MediaPipe): DeepLab v3 says what every pixel is (person, horse, dog,
 * car, bike...) and the selfie model draws people precisely, hair included. By default every
 * person is the subject: the selfie model runs on every frame, kept to where DeepLab (run every
 * few frames) sees people, so a landscape is never mistaken for a face. A tap picks one subject
 * instead: the connected region under the finger (a rider and their horse are one region),
 * followed from frame to frame as it moves; animals and objects use DeepLab on every frame.
 *
 * The models run on one worker thread; the render thread hands over small upright frames
 * (see FilmRenderer.readSegInput) and takes the newest matte. [onStatus] says what is going
 * on, so a failure is visible instead of silent.
 */
class SubjectMasker(private val context: Context) {

    /** One matte: [w]x[h] bytes, 0 background .. 255 subject, first row at the top. */
    class Matte(val pixels: ByteBuffer, val w: Int, val h: Int, val seq: Long, val empty: Boolean)

    private sealed class Target {
        /** Every person in the frame (nothing picked yet). */
        data object AllPeople : Target()
        /** One subject, followed by its connected foreground region. */
        class One(val tracker: SubjectTracker, var person: Boolean) : Target()
    }

    private val thread = HandlerThread("subject").apply { start() }
    private val handler = Handler(thread.looper)
    private val main = Handler(context.mainLooper)
    private var people: ImageSegmenter? = null
    private var objects: ImageSegmenter? = null
    private var failed = false
    private var peopleTs = 0L
    private var objectsTs = 0L
    private var seq = 0L
    private var frame = 0L
    private var target: Target = Target.AllPeople
    /** DeepLab's last class map, and the subject region in it (kept between DeepLab runs). */
    private var classes: ByteArray? = null
    private var classesSize = 0 to 0
    private var region: BooleanArray? = null
    private var lastStatus = ""
    /** The subject fills enough of the frame for the selfie model alone to draw it. */
    private var bigSubject = false

    @Volatile private var busy = false
    @Volatile private var inFlight: CountDownLatch? = null
    @Volatile private var pendingPick: FloatArray? = null
    @Volatile private var pendingReset = false

    /** Newest matte. */
    @Volatile var latest: Matte? = null
        private set

    /** What the subject is now ("People", "Horse"...), or null when a tap found nothing. Main thread. */
    var onSubject: ((String?) -> Unit)? = null
    /** What the cut-out is doing ("Person found", "No person in view", an error). Main thread. */
    var onStatus: ((String) -> Unit)? = null

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
                status("Cut-out error: ${e.message ?: e.javaClass.simpleName}")
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
        lastError = generateSequence(e) { it.cause }.take(4)
            .joinToString(" ← ") { "${it.javaClass.simpleName}${it.message?.let { m -> ": " + m.take(120) } ?: ""}" }
        null
    }

    private var lastError = ""

    private fun peopleModel() = people ?: segmenter(PEOPLE_MODEL, category = false, Delegate.CPU).also { people = it }

    /**
     * DeepLab on the CPU (XNNPACK). Not the GPU delegate: where it can't start (no OpenGL ES
     * 3.1) its GL thread crashes the whole app a few seconds later, which no catch can stop,
     * and at 256 px the CPU keeps up.
     */
    private fun objectModel(): ImageSegmenter? =
        objects ?: segmenter(OBJECT_MODEL, category = true, Delegate.CPU).also { objects = it }

    /** Person confidence, 0..1 per pixel. */
    private fun personConfidence(img: MPImage): FloatArray? {
        val r = peopleModel()?.segmentForVideo(img, ++peopleTs) ?: return null
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
        val r = objectModel()?.segmentForVideo(img, ++objectsTs) ?: return null
        val m = r.categoryMask().orElse(null) ?: return null
        val out = ByteArray(m.width * m.height)
        ByteBufferExtractor.extract(m).get(out)
        m.close()
        return out
    }

    private fun process(bmp: Bitmap) {
        val w = bmp.width
        val h = bmp.height
        val n = w * h
        val img = BitmapImageBuilder(bmp).build()
        if (pendingReset) {
            pendingReset = false
            target = Target.AllPeople
            region = null
            post("People")
        }
        val t = target
        val pick = pendingPick
        // DeepLab: every frame for an animal or object, every third for people (they move
        // less between runs than the selfie model's precise edge needs), and for any tap.
        val needClasses = pick != null || classes == null || classesSize != w to h ||
            (t is Target.One && !t.person) || !bigSubject || frame % 3 == 0L
        frame++
        if (needClasses) {
            val cls = objectClasses(img) ?: return fail()
            classes = cls
            classesSize = w to h
            if (pick != null) {
                pendingPick = null
                choose(cls, w, h, pick[0], pick[1])
            }
            region = when (val tt = target) {
                is Target.AllPeople -> BooleanArray(n) { (cls[it].toInt() and 0xFF) == PERSON }.takeIf { r -> r.any { it } }
                is Target.One -> tt.tracker.follow(BooleanArray(n) { isForeground(cls[it]) }, w, h)
            }
            bigSubject = (region?.count { it } ?: 0) > n * 0.06f
        }
        val cls = classes!!
        val reg = region
        val out = ByteBuffer.allocateDirect(n)
        var any = false
        if (reg != null) {
            val tt = target
            val personSubject = tt is Target.AllPeople || (tt is Target.One && tt.person)
            if (personSubject) {
                // Close up, the selfie model draws people precisely (hair, fingers): its
                // confidence, kept to near where DeepLab saw them. Small or far people (where
                // it is weak) also take DeepLab's own outline, which is fresh every frame then.
                val conf = personConfidence(img)
                val near = Regions.dilate(reg, w, h, max(3, w / 14))
                for (i in 0 until n) {
                    var m = if (near[i] && conf != null) (conf[i] * 255f + 0.5f).toInt().coerceIn(0, 255) else 0
                    if ((!bigSubject || conf == null) && reg[i]) m = 255
                    if (m > 0) { out.put(i, m.toByte()); if (m > 127) any = true }
                }
            } else {
                for (i in 0 until n) if (reg[i]) { out.put(i, 255.toByte()); any = true }
            }
        }
        out.position(0)
        latest = Matte(out, w, h, ++seq, empty = !any)
        status(when {
            any && tt() is Target.AllPeople -> "Cutting out people"
            any -> "Cutting out the subject"
            tt() is Target.AllPeople -> "No person in view"
            else -> "Subject out of view"
        })
    }

    private fun tt() = target

    private fun isForeground(c: Byte): Boolean {
        val v = c.toInt() and 0xFF
        return v != 0 && v != 255
    }

    private fun fail() {
        failed = objects == null
        latest = null
        if (failed) status("Couldn't start the cut-out: $lastError")
    }

    /** Picks the foreground region under the finger; says what it is. */
    private fun choose(cls: ByteArray, w: Int, h: Int, x: Float, y: Float) {
        val px = (x * w).toInt().coerceIn(0, w - 1)
        val py = (y * h).toInt().coerceIn(0, h - 1)
        // The nearest foreground pixel within a small radius of the finger.
        val r = max(4, min(w, h) / 12)
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
        val tr = SubjectTracker((best % w + 0.5f) / w, (best / w + 0.5f) / h)
        val reg = tr.follow(BooleanArray(w * h) { isForeground(cls[it]) }, w, h) ?: run { post(null); return }
        // Name it after what most of it is ("Horse" for a rider on a horse too).
        val counts = IntArray(256)
        for (i in reg.indices) if (reg[i]) counts[cls[i].toInt() and 0xFF]++
        val mainClass = counts.indices.maxBy { counts[it] }
        target = Target.One(tr, person = mainClass == PERSON)
        post(LABELS.getOrElse(mainClass) { "Subject" })
    }

    private fun post(label: String?) {
        main.post { onSubject?.invoke(label) }
    }

    private fun status(s: String) {
        if (s == lastStatus) return
        lastStatus = s
        Log.i(TAG, s)
        main.post { onStatus?.invoke(s) }
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

package app.filmcam.seg

import kotlin.math.hypot

/**
 * Follows one subject through a stream of foreground masks (pure logic, no Android, so it
 * is unit tested). Each frame the mask is split into connected regions; the subject is the
 * region that overlaps its outline in the last frame most, else the region under its seed
 * point, else the nearest sizeable one. The seed then moves to the new region's centre.
 */
class SubjectTracker(x: Float, y: Float) {
    /** Seed point, 0..1, y down. */
    var x = x
        private set
    var y = y
        private set
    private var prev: BooleanArray? = null
    private var lost = 0

    /** The subject's region in [mask] ([w]x[h]), or null when it can't be found this frame. */
    fun follow(mask: BooleanArray, w: Int, h: Int): BooleanArray? {
        val (labels, sizes) = Regions.label(mask, w, h)
        if (sizes.size == 1) return miss()
        val sx = (x * w).toInt().coerceIn(0, w - 1)
        val sy = (y * h).toInt().coerceIn(0, h - 1)
        var chosen = 0
        val p = prev
        if (p != null && p.size == mask.size) {
            val overlap = IntArray(sizes.size)
            for (i in mask.indices) if (p[i] && labels[i] != 0) overlap[labels[i]]++
            val best = overlap.indices.maxBy { overlap[it] }
            if (overlap[best] > 0) chosen = best
        }
        if (chosen == 0) chosen = labels[sy * w + sx]
        if (chosen == 0) {
            // Nearest region within a quarter of the frame, ignoring specks.
            var bestD = 0.25f * hypot(w.toFloat(), h.toFloat())
            val minSize = w * h / 500
            for (i in labels.indices) {
                val l = labels[i]
                if (l == 0 || sizes[l] < minSize) continue
                val d = hypot((i % w - sx).toFloat(), (i / w - sy).toFloat())
                if (d < bestD) { bestD = d; chosen = l }
            }
        }
        if (chosen == 0) return miss()

        val region = BooleanArray(w * h)
        var cx = 0.0
        var cy = 0.0
        var n = 0
        for (i in labels.indices) if (labels[i] == chosen) { region[i] = true; cx += i % w; cy += i / w; n++ }
        cx /= n
        cy /= n
        // The seed moves to the region's pixel nearest its centre (a centre can fall outside a ring).
        var seed = -1
        var bestD = Double.MAX_VALUE
        for (i in region.indices) if (region[i]) {
            val d = (i % w - cx) * (i % w - cx) + (i / w - cy) * (i / w - cy)
            if (d < bestD) { bestD = d; seed = i }
        }
        x = (seed % w + 0.5f) / w
        y = (seed / w + 0.5f) / h
        lost = 0
        prev = region
        return region
    }

    private fun miss(): BooleanArray? {
        // After ~1.5 s out of sight, stop matching the old outline; the seed stays put.
        if (++lost > 45) prev = null
        return null
    }
}

object Regions {
    /** 4-connected regions: a label per pixel (0 = background) and each label's size. */
    fun label(mask: BooleanArray, w: Int, h: Int): Pair<IntArray, IntArray> {
        val labels = IntArray(w * h)
        val sizes = ArrayList<Int>().apply { add(0) }
        val queue = IntArray(w * h)
        for (start in mask.indices) {
            if (!mask[start] || labels[start] != 0) continue
            val id = sizes.size
            var head = 0
            var tail = 0
            queue[tail++] = start
            labels[start] = id
            while (head < tail) {
                val i = queue[head++]
                val x = i % w
                if (x > 0 && mask[i - 1] && labels[i - 1] == 0) { labels[i - 1] = id; queue[tail++] = i - 1 }
                if (x < w - 1 && mask[i + 1] && labels[i + 1] == 0) { labels[i + 1] = id; queue[tail++] = i + 1 }
                if (i >= w && mask[i - w] && labels[i - w] == 0) { labels[i - w] = id; queue[tail++] = i - w }
                if (i < w * (h - 1) && mask[i + w] && labels[i + w] == 0) { labels[i + w] = id; queue[tail++] = i + w }
            }
            sizes.add(tail)
        }
        return labels to sizes.toIntArray()
    }

    /** Grows a region by [r] pixels (square). */
    fun dilate(m: BooleanArray, w: Int, h: Int, r: Int): BooleanArray {
        val a = BooleanArray(m.size)
        for (y in 0 until h) {
            val row = y * w
            var last = Int.MIN_VALUE / 2
            for (x in 0 until w) { if (m[row + x]) last = x; if (x - last <= r) a[row + x] = true }
            last = Int.MAX_VALUE / 2
            for (x in w - 1 downTo 0) { if (m[row + x]) last = x; if (last - x <= r) a[row + x] = true }
        }
        val b = BooleanArray(m.size)
        for (x in 0 until w) {
            var last = Int.MIN_VALUE / 2
            for (y in 0 until h) { if (a[y * w + x]) last = y; if (y - last <= r) b[y * w + x] = true }
            last = Int.MAX_VALUE / 2
            for (y in h - 1 downTo 0) { if (a[y * w + x]) last = y; if (last - y <= r) b[y * w + x] = true }
        }
        return b
    }
}

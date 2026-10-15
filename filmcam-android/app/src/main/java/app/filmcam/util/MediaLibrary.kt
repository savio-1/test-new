package app.filmcam.util

import android.content.ContentUris
import android.content.Context
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.provider.MediaStore
import android.util.Log

/** One picture or clip in the app's own album. */
data class MediaItem(
    val uri: Uri,
    val video: Boolean,
    val dateMs: Long,
    val durationMs: Long = 0L,
    val width: Int = 0,
    val height: Int = 0,
)

/** Video facts needed before decoding: size as stored, rotation to stand it up, length. */
data class VideoInfo(val width: Int, val height: Int, val rotation: Int, val durationMs: Long) {
    val uprightW get() = if (rotation % 180 == 0) width else height
    val uprightH get() = if (rotation % 180 == 0) height else width
}

/**
 * Lists what FilmCam has saved (Pictures/FilmCam and Movies/FilmCam). On Android 10+ an app
 * sees its own files in the shared album without any storage permission.
 */
object MediaLibrary {
    fun list(context: Context): List<MediaItem> {
        val out = ArrayList<MediaItem>()
        runCatching { query(context, video = false, out) }.onFailure { Log.w(TAG, "images", it) }
        runCatching { query(context, video = true, out) }.onFailure { Log.w(TAG, "videos", it) }
        return out.sortedByDescending { it.dateMs }
    }

    private fun query(context: Context, video: Boolean, out: MutableList<MediaItem>) {
        val base = if (video) MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
            else MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        val cols = arrayListOf(MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DATE_ADDED,
            MediaStore.MediaColumns.WIDTH, MediaStore.MediaColumns.HEIGHT)
        if (video) cols += MediaStore.Video.VideoColumns.DURATION
        val album = if (video) "Movies/FilmCam%" else "Pictures/FilmCam%"
        context.contentResolver.query(
            base, cols.toTypedArray(),
            "${MediaStore.MediaColumns.RELATIVE_PATH} LIKE ? AND ${MediaStore.MediaColumns.IS_PENDING} = 0",
            arrayOf(album), "${MediaStore.MediaColumns.DATE_ADDED} DESC",
        )?.use { c ->
            val id = c.getColumnIndexOrThrow(MediaStore.MediaColumns._ID)
            val date = c.getColumnIndexOrThrow(MediaStore.MediaColumns.DATE_ADDED)
            val w = c.getColumnIndexOrThrow(MediaStore.MediaColumns.WIDTH)
            val h = c.getColumnIndexOrThrow(MediaStore.MediaColumns.HEIGHT)
            val dur = if (video) c.getColumnIndexOrThrow(MediaStore.Video.VideoColumns.DURATION) else -1
            while (c.moveToNext()) {
                out += MediaItem(
                    ContentUris.withAppendedId(base, c.getLong(id)), video, c.getLong(date) * 1000L,
                    if (dur >= 0) c.getLong(dur) else 0L, c.getInt(w), c.getInt(h),
                )
            }
        }
    }

    fun videoInfo(context: Context, uri: Uri): VideoInfo? {
        val r = MediaMetadataRetriever()
        return try {
            r.setDataSource(context, uri)
            fun num(key: Int) = r.extractMetadata(key)?.toLongOrNull() ?: 0L
            VideoInfo(
                num(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH).toInt(),
                num(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT).toInt(),
                num(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION).toInt(),
                num(MediaMetadataRetriever.METADATA_KEY_DURATION),
            ).takeIf { it.width > 0 && it.height > 0 }
        } catch (e: Exception) {
            Log.w(TAG, "videoInfo", e)
            null
        } finally {
            runCatching { r.release() }
        }
    }

    private const val TAG = "MediaLibrary"
}

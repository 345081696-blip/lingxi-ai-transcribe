package com.zerocreate.transcribemobile.media

import android.content.Context
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.provider.MediaStore
import android.webkit.MimeTypeMap
import java.io.File
import java.io.FileInputStream

object VideoMetadataReader {
    fun read(context: Context, uri: Uri, preferredKind: MediaKind? = null): VideoFileInfo {
        val resolver = context.contentResolver
        val fileSchemeFile = uri.toFileIfPossible()
        val fallbackName = fileSchemeFile?.name ?: uri.lastPathSegment?.substringAfterLast('/') ?: "未命名视频"
        var displayName = fallbackName
        var sizeBytes: Long? = null
        var durationMs: Long? = null

        if (fileSchemeFile != null) {
            displayName = fileSchemeFile.name.ifBlank { displayName }
            sizeBytes = fileSchemeFile.length().takeIf { it >= 0 }
        } else {
            val projection = arrayOf(
                MediaStore.MediaColumns.DISPLAY_NAME,
                MediaStore.MediaColumns.SIZE,
                MediaStore.Video.Media.DURATION,
            )
            resolver.query(uri, projection, null, null, null)?.use { cursor ->
                val nameIndex = cursor.getColumnIndex(MediaStore.MediaColumns.DISPLAY_NAME)
                val sizeIndex = cursor.getColumnIndex(MediaStore.MediaColumns.SIZE)
                val durationIndex = cursor.getColumnIndex(MediaStore.Video.Media.DURATION)
                if (cursor.moveToFirst()) {
                    if (nameIndex >= 0 && !cursor.isNull(nameIndex)) {
                        displayName = cursor.getString(nameIndex)
                    }
                    if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) {
                        sizeBytes = cursor.getLong(sizeIndex).takeIf { it >= 0 }
                    }
                    if (durationIndex >= 0 && !cursor.isNull(durationIndex)) {
                        durationMs = cursor.getLong(durationIndex).takeIf { it >= 0 }
                    }
                }
            }
        }

        val retrieverDurationMs = runCatching {
            val retriever = MediaMetadataRetriever()
            try {
                if (fileSchemeFile != null) {
                    runCatching {
                        retriever.setDataSource(fileSchemeFile.absolutePath)
                    }.recoverCatching {
                        FileInputStream(fileSchemeFile).use { input ->
                            retriever.setDataSource(input.fd)
                        }
                    }.getOrThrow()
                } else {
                    resolver.openFileDescriptor(uri, "r")?.use { descriptor ->
                        retriever.setDataSource(descriptor.fileDescriptor)
                    } ?: retriever.setDataSource(context, uri)
                }
                retriever
                    .extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
                    ?.toLongOrNull()
            } finally {
                retriever.release()
            }
        }.getOrNull()

        if (durationMs == null) {
            durationMs = retrieverDurationMs
        }

        val mimeType = resolver.getType(uri)
            ?: fileSchemeFile?.extension
                ?.takeIf { it.isNotBlank() }
                ?.let { ext -> MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext.lowercase()) }

        return VideoFileInfo(
            uri = uri,
            displayName = displayName,
            sizeBytes = sizeBytes,
            durationMs = durationMs,
            mimeType = mimeType,
            kind = preferredKind ?: mimeType.toMediaKind(),
        )
    }

    private fun String?.toMediaKind(): MediaKind {
        return when {
            this?.startsWith("audio/") == true -> MediaKind.Audio
            else -> MediaKind.Video
        }
    }

    private fun Uri.toFileIfPossible(): File? {
        return if (scheme == "file") {
            path?.let(::File)
        } else {
            null
        }
    }
}

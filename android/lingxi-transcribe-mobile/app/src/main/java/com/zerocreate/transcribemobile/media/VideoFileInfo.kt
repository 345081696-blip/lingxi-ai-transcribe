package com.zerocreate.transcribemobile.media

import android.net.Uri

data class VideoFileInfo(
    val uri: Uri,
    val displayName: String,
    val sizeBytes: Long?,
    val durationMs: Long?,
    val mimeType: String?,
    val kind: MediaKind = MediaKind.Video,
)

enum class MediaKind {
    Video,
    Audio,
    Recording,
}

data class AudioExtractionResult(
    val outputPath: String,
    val outputBytes: Long,
    val durationMs: Long?,
    val sampleRate: Int = 16_000,
    val channelCount: Int = 1,
    val publicUri: String? = null,
    val publicPathHint: String? = null,
)

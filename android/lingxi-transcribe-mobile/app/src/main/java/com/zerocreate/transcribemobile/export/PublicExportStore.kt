package com.zerocreate.transcribemobile.export

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import java.io.File

data class PublicExportResult(
    val displayName: String,
    val uri: String,
    val relativePath: String,
)

class PublicExportStore(private val context: Context) {
    fun exportFile(
        sourcePath: String,
        displayName: String,
        mimeType: String,
        bucket: ExportBucket,
    ): PublicExportResult {
        val source = File(sourcePath)
        require(source.exists() && source.length() > 0) { "导出源文件不存在或为空" }

        val safeName = displayName.safeFileName().ifBlank { source.name.safeFileName() }
        val relativePath = "${Environment.DIRECTORY_DOWNLOADS}/零析AI 转写/${bucket.folderName}"

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val resolver = context.contentResolver
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, safeName)
                put(MediaStore.Downloads.MIME_TYPE, mimeType)
                put(MediaStore.Downloads.RELATIVE_PATH, relativePath)
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: error("无法创建公共下载文件")
            runCatching {
                resolver.openOutputStream(uri)?.use { output ->
                    source.inputStream().use { input -> input.copyTo(output) }
                } ?: error("无法写入公共下载文件")
                values.clear()
                values.put(MediaStore.Downloads.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
            }.onFailure {
                resolver.delete(uri, null, null)
                throw it
            }
            return PublicExportResult(safeName, uri.toString(), relativePath)
        }

        val outputDir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "零析AI 转写/${bucket.folderName}")
            .apply { mkdirs() }
        val outputFile = File(outputDir, safeName)
        source.copyTo(outputFile, overwrite = true)
        return PublicExportResult(safeName, Uri.fromFile(outputFile).toString(), "Downloads/零析AI 转写/${bucket.folderName}")
    }

    private fun String.safeFileName(): String {
        return replace(Regex("[\\\\/:*?\"<>|]+"), "_").trim().ifBlank { "lingxi-output" }
    }
}

enum class ExportBucket(val folderName: String) {
    Audio("音频"),
    Transcripts("文稿"),
    Subtitles("字幕辅助"),
}

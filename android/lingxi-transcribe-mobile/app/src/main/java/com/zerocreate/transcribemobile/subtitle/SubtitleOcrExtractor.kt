package com.zerocreate.transcribemobile.subtitle

import android.content.Context
import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.io.File
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.math.max

data class SubtitleAssistResult(
    val outputPath: String,
    val text: String,
    val frameCount: Int,
    val lineCount: Int,
    val publicUri: String? = null,
    val publicPathHint: String? = null,
)

class SubtitleOcrExtractor(private val context: Context) {
    private val recognizer = TextRecognition.getClient(ChineseTextRecognizerOptions.Builder().build())

    suspend fun extractFromVideo(
        uri: Uri,
        displayName: String,
        durationMs: Long?,
        onProgress: (Float) -> Unit = {},
    ): SubtitleAssistResult = withContext(Dispatchers.IO) {
        val outputDir = File(context.filesDir, "subtitle_assist").apply { mkdirs() }
        val outputFile = File(outputDir, "${displayName.safeBaseName()}-${System.currentTimeMillis()}-subtitles.txt")
        val retriever = MediaMetadataRetriever()
        val candidates = mutableListOf<SubtitleCandidate>()
        var frames = 0

        try {
            context.contentResolver.openFileDescriptor(uri, "r")?.use { descriptor ->
                retriever.setDataSource(descriptor.fileDescriptor)
            } ?: retriever.setDataSource(context, uri)

            val duration = durationMs
                ?: retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()
                ?: 0L
            val sampleTimes = buildSampleTimes(duration)

            sampleTimes.forEachIndexed { index, timeMs ->
                val frame = retriever.getFrameAtTime(timeMs * 1000L, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
                if (frame != null) {
                    frames += 1
                    val subtitleArea = frame.cropSubtitleArea()
                    val recognized = recognizeText(subtitleArea)
                    subtitleArea.recycleIfNeeded(frame)
                    frame.recycle()
                    recognized.lines()
                        .map { it.trimForSubtitle() }
                        .mapNotNull { line -> line.toSubtitleCandidate() }
                        .forEach(candidates::add)
                }
                onProgress(((index + 1).toFloat() / sampleTimes.size.toFloat()).coerceIn(0f, 1f))
            }
        } finally {
            retriever.release()
        }

        val merged = candidates.toStableSubtitleLines()
        val text = merged.joinToString("\n")
        outputFile.writeText(text.ifBlank { "未识别到字幕文字" })

        SubtitleAssistResult(
            outputPath = outputFile.absolutePath,
            text = text,
            frameCount = frames,
            lineCount = merged.size,
        )
    }

    fun close() {
        recognizer.close()
    }

    private fun buildSampleTimes(durationMs: Long): List<Long> {
        if (durationMs <= 0) return listOf(0L)
        val interval = 1_500L
        val maxFrames = 90
        val start = 500L
        val end = max(start, durationMs - 300L)
        return generateSequence(start) { it + interval }
            .takeWhile { it <= end }
            .take(maxFrames)
            .toList()
            .ifEmpty { listOf(durationMs / 2) }
    }

    private suspend fun recognizeText(bitmap: Bitmap): String {
        val image = InputImage.fromBitmap(bitmap, 0)
        return suspendCancellableCoroutine { continuation ->
            recognizer.process(image)
                .addOnSuccessListener { result ->
                    continuation.resume(result.text)
                }
                .addOnFailureListener { error ->
                    continuation.resumeWithException(error)
                }
        }
    }

    private fun Bitmap.cropSubtitleArea(): Bitmap {
        val left = (width * 0.06f).toInt().coerceIn(0, width - 1)
        val top = (height * 0.38f).toInt().coerceIn(0, height - 1)
        val right = (width * 0.94f).toInt().coerceIn(left + 1, width)
        val bottom = (height * 0.88f).toInt().coerceIn(top + 1, height)
        return Bitmap.createBitmap(this, left, top, right - left, bottom - top)
    }

    private fun Bitmap.recycleIfNeeded(source: Bitmap) {
        if (this !== source && !isRecycled) recycle()
    }

    private fun String.trimForSubtitle(): String {
        return replace(Regex("\\s+"), " ")
            .replace(Regex("^[\\p{Punct}\\s]+|[\\p{Punct}\\s]+$"), "")
            .trim()
    }

    private fun String.toSubtitleCandidate(): SubtitleCandidate? {
        val normalized = normalizeSubtitleLine()
        if (!looksLikeSubtitleLine(normalized)) return null
        return SubtitleCandidate(text = this, normalized = normalized)
    }

    private fun String.normalizeSubtitleLine(): String {
        return replace(Regex("\\s+"), "")
            .replace(Regex("[，。！？、,.!?；;：:\"'“”‘’（）()【】\\[\\]{}<>《》|/\\\\-]+"), "")
            .trim()
    }

    private fun String.looksLikeSubtitleLine(normalized: String): Boolean {
        if (length < 2 || length > 42) return false
        if (count { it.isDigit() } >= length / 2) return false
        if (normalized.length < 2 || normalized.length > 38) return false
        val hardNoise = listOf(
            "#",
            "点击推荐",
            "展开",
            "分享",
            "合集",
            "评论",
            "小时前",
            "分钟前",
            "刚刚",
            "最新集",
            "AI落地",
            "大模型",
            "粉丝",
            "会员复购",
            "点赞",
            "收藏",
            "转发",
            "关注",
            "私信",
            "首页",
            "消息",
            "朋友",
            "推荐",
            "同城",
            "搜索",
            "广告",
        )
        if (hardNoise.any { contains(it, ignoreCase = true) || normalized.contains(it, ignoreCase = true) }) return false
        if (normalized.matches(Regex("^第\\d+集$"))) return false
        if (normalized.matches(Regex("^\\d+[万wW]?赞$"))) return false
        if (normalized.matches(Regex("^\\d+[万wW]?$"))) return false
        if (normalized.startsWith("@")) return false
        if (normalized.length <= 4 && normalized.any { it in uiButtonChars }) return false
        val chineseCount = count { it in '\u4e00'..'\u9fff' }
        val normalizedChineseCount = normalized.count { it in '\u4e00'..'\u9fff' }
        return chineseCount >= 2 && normalizedChineseCount >= 2
    }

    private fun List<SubtitleCandidate>.toStableSubtitleLines(): List<String> {
        val grouped = mutableListOf<SubtitleGroup>()
        for (candidate in this) {
            val existing = grouped.firstOrNull { it.normalized.similarTo(candidate.normalized) }
            if (existing == null) {
                grouped.add(SubtitleGroup(candidate.text, candidate.normalized, 1))
            } else {
                existing.count += 1
                if (candidate.text.length > existing.text.length) {
                    existing.text = candidate.text
                }
            }
        }

        return grouped
            .filter { it.count >= 2 || it.normalized.length >= 10 }
            .map { it.text }
            .mergeAdjacentDuplicates()
    }

    private fun List<String>.mergeAdjacentDuplicates(): List<String> {
        val result = mutableListOf<String>()
        for (line in this) {
            if (result.none { it.similarTo(line) }) {
                result.add(line)
            }
        }
        return result
    }

    private fun String.similarTo(other: String): Boolean {
        if (this == other) return true
        val shorter = minOf(length, other.length)
        if (shorter < 4) return false
        return contains(other) || other.contains(this)
    }

    private fun String.safeBaseName(): String {
        return substringBeforeLast('.')
            .replace(Regex("[^A-Za-z0-9._-]+"), "_")
            .trim('_')
            .ifBlank { "subtitle" }
    }

    private data class SubtitleCandidate(
        val text: String,
        val normalized: String,
    )

    private data class SubtitleGroup(
        var text: String,
        val normalized: String,
        var count: Int,
    )

    private companion object {
        val uiButtonChars = setOf('赞', '评', '转', '藏', '私', '信', '关', '注', '粉')
    }
}

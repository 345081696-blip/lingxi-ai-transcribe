package com.zerocreate.transcribemobile.transcribe

import android.content.Context
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

data class TranscriptExports(
    val txtPath: String,
    val docxPath: String,
    val srtPath: String,
    val vttPath: String,
    val publicTxtUri: String? = null,
    val publicDocxUri: String? = null,
    val publicPathHint: String? = null,
)

class TranscriptExporter(context: Context) {
    private val outputDir = File(context.filesDir, "transcripts").apply { mkdirs() }

    fun write(
        videoName: String,
        result: TranscriptionResult,
        subtitleAssistText: String = "",
        glossaryText: String = "",
    ): TranscriptExports {
        val baseName = "${videoName.safeBaseName()}-${System.currentTimeMillis()}"
        val txtFile = File(outputDir, "$baseName.txt")
        val docxFile = File(outputDir, "$baseName.docx")
        val srtFile = File(outputDir, "$baseName.srt")
        val vttFile = File(outputDir, "$baseName.vtt")
        val formattedText = result.toFormattedText(videoName, subtitleAssistText, glossaryText)

        txtFile.writeText(formattedText)
        docxFile.writeDocx(formattedText)
        srtFile.writeText(result.toSrt())
        vttFile.writeText(result.toVtt())

        return TranscriptExports(
            txtPath = txtFile.absolutePath,
            docxPath = docxFile.absolutePath,
            srtPath = srtFile.absolutePath,
            vttPath = vttFile.absolutePath,
        )
    }

    private fun TranscriptionResult.toFormattedText(
        videoName: String,
        subtitleAssistText: String,
        glossaryText: String,
    ): String {
        val generatedAt = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.CHINA).format(Date())
        val glossary = glossaryText.toGlossaryRules()
        val cleanText = fullText.ifBlank {
            segments.joinToString("\n") { it.text.trim() }
        }.trim().ifBlank { "未识别到文本" }.applyGlossary(glossary)
        val subtitleText = subtitleAssistText.trim().applyGlossary(glossary)
        val assistedText = if (subtitleText.isReliableSubtitleReference(cleanText)) {
            subtitleText
        } else {
            cleanText
        }

        return buildString {
            appendLine("零析AI 转写文稿")
            appendLine("副标题：零析AI 转写")
            appendLine("素材：$videoName")
            appendLine("生成时间：$generatedAt")
            appendLine("识别语言：${language.ifBlank { "auto" }}")
            appendLine("片段数量：${segments.size}")
            appendLine("字幕辅助：${if (subtitleAssistText.isBlank()) "未启用" else "已启用"}")
            appendLine("词表纠错：${if (glossary.isEmpty()) "未启用" else "已启用 ${glossary.size} 条"}")
            appendLine()
            appendLine("一、字幕辅助修正版")
            appendLine(assistedText)
            appendLine()
            appendLine("二、Whisper 原始识别")
            appendLine(cleanText)
            appendLine()
            appendLine("三、字幕辅助参考")
            appendLine(subtitleText.ifBlank { "未捕捉到字幕辅助文本" })
            appendLine()
            appendLine("四、专有词与错词表")
            appendLine(glossaryText.trim().ifBlank { "未填写" })
            appendLine()
            appendLine("五、时间轴文稿")
            if (segments.isEmpty()) {
                appendLine("[00:00] $cleanText")
            } else {
                segments.forEach { segment ->
                    appendLine("[${segment.startMs.toMinuteTime()}] ${segment.text.trim().applyGlossary(glossary)}")
                }
            }
        }
    }

    private fun File.writeDocx(text: String) {
        parentFile?.mkdirs()
        ZipOutputStream(outputStream()).use { zip ->
            zip.putText(
                "[Content_Types].xml",
                """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>""",
            )
            zip.putText(
                "_rels/.rels",
                """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>""",
            )
            zip.putText("word/document.xml", text.toDocumentXml())
        }
    }

    private fun ZipOutputStream.putText(path: String, value: String) {
        putNextEntry(ZipEntry(path))
        write(value.toByteArray(Charsets.UTF_8))
        closeEntry()
    }

    private fun String.toDocumentXml(): String {
        val body = lineSequence().joinToString("") { line ->
            val paragraphStyle = if (
                line == "零析AI 转写文稿" ||
                line == "一、字幕辅助修正版" ||
                line == "二、Whisper 原始识别" ||
                line == "三、字幕辅助参考" ||
                line == "四、专有词与错词表" ||
                line == "五、时间轴文稿"
            ) {
                """<w:pPr><w:pStyle w:val="Title"/></w:pPr>"""
            } else {
                ""
            }
            """<w:p>$paragraphStyle<w:r><w:t xml:space="preserve">${line.escapeXml()}</w:t></w:r></w:p>"""
        }
        return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    $body
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>"""
    }

    private fun TranscriptionResult.toSrt(): String {
        return buildString {
            segments.forEachIndexed { index, segment ->
                appendLine(index + 1)
                appendLine("${segment.startMs.toSrtTime()} --> ${segment.endMs.toSrtTime()}")
                appendLine(segment.text.trim())
                appendLine()
            }
        }.ifBlank {
            "1\n00:00:00,000 --> 00:00:01,000\n${fullText.ifBlank { "未识别到文本" }}\n"
        }
    }

    private fun TranscriptionResult.toVtt(): String {
        return buildString {
            appendLine("WEBVTT")
            appendLine()
            segments.forEach { segment ->
                appendLine("${segment.startMs.toVttTime()} --> ${segment.endMs.toVttTime()}")
                appendLine(segment.text.trim())
                appendLine()
            }
        }
    }

    private fun Long.toSrtTime(): String {
        val hours = this / 3_600_000
        val minutes = (this % 3_600_000) / 60_000
        val seconds = (this % 60_000) / 1_000
        val millis = this % 1_000
        return String.format(Locale.US, "%02d:%02d:%02d,%03d", hours, minutes, seconds, millis)
    }

    private fun Long.toVttTime(): String {
        return toSrtTime().replace(',', '.')
    }

    private fun Long.toMinuteTime(): String {
        val totalSeconds = this / 1000
        val hours = totalSeconds / 3600
        val minutes = (totalSeconds % 3600) / 60
        val seconds = totalSeconds % 60
        return if (hours > 0) {
            String.format(Locale.US, "%02d:%02d:%02d", hours, minutes, seconds)
        } else {
            String.format(Locale.US, "%02d:%02d", minutes, seconds)
        }
    }

    private fun String.escapeXml(): String {
        return replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\"", "&quot;")
            .replace("'", "&apos;")
    }

    private fun String.isReliableSubtitleReference(whisperText: String): Boolean {
        if (isBlank()) return false
        val subtitleChars = count { !it.isWhitespace() }
        val whisperChars = whisperText.count { !it.isWhitespace() }.coerceAtLeast(1)
        val lineCount = lineSequence().count { it.trim().length >= 2 }
        return lineCount >= 2 && subtitleChars >= 12 && subtitleChars >= whisperChars * 0.25
    }

    private fun String.toGlossaryRules(): List<Pair<String, String>> {
        return lineSequence()
            .map { it.trim() }
            .filter { it.isNotBlank() }
            .mapNotNull { line ->
                val separator = listOf("=>", "=", "->", "：", ":").firstOrNull { line.contains(it) }
                if (separator == null) {
                    line.takeIf { it.length >= 2 }?.let { it to it }
                } else {
                    val wrong = line.substringBefore(separator).trim()
                    val right = line.substringAfter(separator).trim()
                    if (wrong.isNotBlank() && right.isNotBlank()) wrong to right else null
                }
            }
            .distinct()
            .toList()
    }

    private fun String.applyGlossary(rules: List<Pair<String, String>>): String {
        var value = this
        for ((wrong, right) in rules) {
            if (wrong != right) value = value.replace(wrong, right)
        }
        return value
    }

    private fun String.safeBaseName(): String {
        return substringBeforeLast('.')
            .replace(Regex("[^A-Za-z0-9._-]+"), "_")
            .trim('_')
            .ifBlank { "transcript" }
    }
}

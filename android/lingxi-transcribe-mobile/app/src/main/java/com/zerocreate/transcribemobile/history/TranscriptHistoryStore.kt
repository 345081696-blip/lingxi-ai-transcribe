package com.zerocreate.transcribemobile.history

import android.content.Context
import com.zerocreate.transcribemobile.transcribe.TranscriptExports
import com.zerocreate.transcribemobile.transcribe.TranscriptionResult
import org.json.JSONArray
import org.json.JSONObject

data class TranscriptHistoryRecord(
    val id: String,
    val videoName: String,
    val createdAtMs: Long,
    val language: String,
    val segmentCount: Int,
    val preview: String,
    val txtPath: String,
    val docxPath: String,
    val srtPath: String,
    val vttPath: String,
    val publicTxtUri: String?,
    val publicDocxUri: String?,
    val publicPathHint: String?,
)

class TranscriptHistoryStore(context: Context) {
    private val preferences = context.getSharedPreferences("transcript_history", Context.MODE_PRIVATE)

    fun read(): List<TranscriptHistoryRecord> {
        val raw = preferences.getString(KEY_RECORDS, "[]") ?: "[]"
        return runCatching {
            val array = JSONArray(raw)
            buildList {
                for (index in 0 until array.length()) {
                    val item = array.getJSONObject(index)
                    add(
                        TranscriptHistoryRecord(
                            id = item.getString("id"),
                            videoName = item.getString("videoName"),
                            createdAtMs = item.getLong("createdAtMs"),
                            language = item.optString("language", "auto"),
                            segmentCount = item.optInt("segmentCount", 0),
                            preview = item.optString("preview"),
                            txtPath = item.optString("txtPath"),
                            docxPath = item.optString("docxPath"),
                            srtPath = item.optString("srtPath"),
                            vttPath = item.optString("vttPath"),
                            publicTxtUri = item.optString("publicTxtUri").takeIf { it.isNotBlank() },
                            publicDocxUri = item.optString("publicDocxUri").takeIf { it.isNotBlank() },
                            publicPathHint = item.optString("publicPathHint").takeIf { it.isNotBlank() },
                        ),
                    )
                }
            }
        }.getOrDefault(emptyList())
    }

    fun add(videoName: String, result: TranscriptionResult, exports: TranscriptExports): List<TranscriptHistoryRecord> {
        val record = TranscriptHistoryRecord(
            id = "${System.currentTimeMillis()}-${videoName.hashCode()}",
            videoName = videoName,
            createdAtMs = System.currentTimeMillis(),
            language = result.language.ifBlank { "auto" },
            segmentCount = result.segments.size,
            preview = result.fullText.lineSequence().firstOrNull { it.isNotBlank() }?.take(120).orEmpty(),
            txtPath = exports.txtPath,
            docxPath = exports.docxPath,
            srtPath = exports.srtPath,
            vttPath = exports.vttPath,
            publicTxtUri = exports.publicTxtUri,
            publicDocxUri = exports.publicDocxUri,
            publicPathHint = exports.publicPathHint,
        )
        val records = (listOf(record) + read()).take(MAX_RECORDS)
        preferences.edit().putString(KEY_RECORDS, records.toJson()).apply()
        return records
    }

    private fun List<TranscriptHistoryRecord>.toJson(): String {
        val array = JSONArray()
        forEach { record ->
            array.put(
                JSONObject()
                    .put("id", record.id)
                    .put("videoName", record.videoName)
                    .put("createdAtMs", record.createdAtMs)
                    .put("language", record.language)
                    .put("segmentCount", record.segmentCount)
                    .put("preview", record.preview)
                    .put("txtPath", record.txtPath)
                    .put("docxPath", record.docxPath)
                    .put("srtPath", record.srtPath)
                    .put("vttPath", record.vttPath)
                    .put("publicTxtUri", record.publicTxtUri.orEmpty())
                    .put("publicDocxUri", record.publicDocxUri.orEmpty())
                    .put("publicPathHint", record.publicPathHint.orEmpty()),
            )
        }
        return array.toString()
    }

    private companion object {
        const val KEY_RECORDS = "records"
        const val MAX_RECORDS = 20
    }
}

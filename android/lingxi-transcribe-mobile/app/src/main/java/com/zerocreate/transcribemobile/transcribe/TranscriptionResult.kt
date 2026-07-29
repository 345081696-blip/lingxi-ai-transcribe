package com.zerocreate.transcribemobile.transcribe

import org.json.JSONObject

data class TranscriptionSegment(
    val startMs: Long,
    val endMs: Long,
    val text: String,
)

data class TranscriptionResult(
    val fullText: String,
    val language: String,
    val segments: List<TranscriptionSegment>,
) {
    companion object {
        fun fromJson(rawJson: String): TranscriptionResult {
            val json = JSONObject(rawJson)
            val segmentsJson = json.getJSONArray("segments")
            val segments = buildList {
                for (index in 0 until segmentsJson.length()) {
                    val item = segmentsJson.getJSONObject(index)
                    add(
                        TranscriptionSegment(
                            startMs = item.getLong("startMs"),
                            endMs = item.getLong("endMs"),
                            text = item.getString("text").trim(),
                        ),
                    )
                }
            }

            return TranscriptionResult(
                fullText = json.getString("text").trim(),
                language = json.optString("language", "auto"),
                segments = segments,
            )
        }
    }
}

package com.zerocreate.transcribemobile.state

import com.zerocreate.transcribemobile.media.AudioExtractionResult
import com.zerocreate.transcribemobile.media.MediaKind
import com.zerocreate.transcribemobile.media.VideoFileInfo
import com.zerocreate.transcribemobile.history.TranscriptHistoryRecord
import com.zerocreate.transcribemobile.subtitle.SubtitleAssistResult
import com.zerocreate.transcribemobile.transcribe.TranscriptExports
import com.zerocreate.transcribemobile.transcribe.TranscriptionResult

data class TranscribeUiState(
    val phase: WorkPhase = WorkPhase.Idle,
    val statusText: String = "等待导入视频、音频或录音",
    val videoInfo: VideoFileInfo? = null,
    val audioResult: AudioExtractionResult? = null,
    val transcriptionResult: TranscriptionResult? = null,
    val transcriptExports: TranscriptExports? = null,
    val subtitleAssistResult: SubtitleAssistResult? = null,
    val history: List<TranscriptHistoryRecord> = emptyList(),
    val glossaryText: String = "",
    val publicExportHint: String? = null,
    val errorText: String? = null,
    val extractionProgress: Float = 0f,
    val subtitleProgress: Float = 0f,
) {
    val canPickVideo: Boolean
        get() = phase != WorkPhase.ReadingVideo &&
            phase != WorkPhase.Recording &&
            phase != WorkPhase.ExtractingAudio &&
            phase != WorkPhase.CapturingSubtitles &&
            phase != WorkPhase.Transcribing

    val canPickAudio: Boolean
        get() = canPickVideo

    val canRecord: Boolean
        get() = phase != WorkPhase.ReadingVideo &&
            phase != WorkPhase.ExtractingAudio &&
            phase != WorkPhase.CapturingSubtitles &&
            phase != WorkPhase.Transcribing

    val canExtractAudio: Boolean
        get() = videoInfo != null &&
            phase != WorkPhase.ReadingVideo &&
            phase != WorkPhase.Recording &&
            phase != WorkPhase.ExtractingAudio &&
            phase != WorkPhase.CapturingSubtitles &&
            phase != WorkPhase.Transcribing

    val canCaptureSubtitles: Boolean
        get() = videoInfo?.kind == MediaKind.Video &&
            phase != WorkPhase.ReadingVideo &&
            phase != WorkPhase.Recording &&
            phase != WorkPhase.ExtractingAudio &&
            phase != WorkPhase.CapturingSubtitles &&
            phase != WorkPhase.Transcribing

    val canTranscribe: Boolean
        get() = audioResult != null &&
            phase != WorkPhase.ReadingVideo &&
            phase != WorkPhase.Recording &&
            phase != WorkPhase.ExtractingAudio &&
            phase != WorkPhase.CapturingSubtitles &&
            phase != WorkPhase.Transcribing

    val canCancel: Boolean
        get() = phase == WorkPhase.ExtractingAudio ||
            phase == WorkPhase.CapturingSubtitles ||
            phase == WorkPhase.Recording
}

enum class WorkPhase {
    Idle,
    ReadingVideo,
    VideoReady,
    Recording,
    ExtractingAudio,
    CapturingSubtitles,
    AudioReady,
    Transcribing,
    Transcribed,
    Failed,
}

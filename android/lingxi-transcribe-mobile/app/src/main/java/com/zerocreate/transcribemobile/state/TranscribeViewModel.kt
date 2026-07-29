package com.zerocreate.transcribemobile.state

import android.app.Application
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.zerocreate.transcribemobile.export.ExportBucket
import com.zerocreate.transcribemobile.export.PublicExportStore
import com.zerocreate.transcribemobile.history.TranscriptHistoryStore
import com.zerocreate.transcribemobile.media.AudioExtractor
import com.zerocreate.transcribemobile.media.MediaKind
import com.zerocreate.transcribemobile.media.VideoMetadataReader
import com.zerocreate.transcribemobile.recording.AudioRecorder
import com.zerocreate.transcribemobile.subtitle.SubtitleOcrExtractor
import com.zerocreate.transcribemobile.transcribe.TranscriptExporter
import com.zerocreate.transcribemobile.transcribe.WhisperTranscriber
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class TranscribeViewModel(application: Application) : AndroidViewModel(application) {
    private val appContext = application.applicationContext
    private val audioExtractor = AudioExtractor(appContext)
    private val audioRecorder = AudioRecorder(appContext)
    private val subtitleOcrExtractor = SubtitleOcrExtractor(appContext)
    private val transcriptExporter = TranscriptExporter(appContext)
    private val publicExportStore = PublicExportStore(appContext)
    private val historyStore = TranscriptHistoryStore(appContext)
    private val whisperTranscriber = WhisperTranscriber(appContext)
    private var extractionJob: Job? = null
    private var subtitleJob: Job? = null
    private var transcriptionJob: Job? = null
    private val preferences = appContext.getSharedPreferences("lingxi_settings", Context.MODE_PRIVATE)

    private val _uiState = MutableStateFlow(TranscribeUiState())
    val uiState: StateFlow<TranscribeUiState> = _uiState.asStateFlow()

    init {
        _uiState.update {
            it.copy(
                history = historyStore.read(),
                glossaryText = preferences.getString(KEY_GLOSSARY, "").orEmpty(),
            )
        }
    }

    fun updateGlossary(text: String) {
        preferences.edit().putString(KEY_GLOSSARY, text).apply()
        _uiState.update { it.copy(glossaryText = text) }
    }

    fun importVideo(uri: Uri) {
        importMedia(uri, MediaKind.Video)
    }

    fun importAudio(uri: Uri) {
        importMedia(uri, MediaKind.Audio)
    }

    private fun importMedia(uri: Uri, expectedKind: MediaKind) {
        viewModelScope.launch {
            extractionJob?.cancel()
            subtitleJob?.cancel()
            transcriptionJob?.cancel()
            _uiState.value = TranscribeUiState(
                phase = WorkPhase.ReadingVideo,
                statusText = if (expectedKind == MediaKind.Audio) "正在读取音频信息" else "正在读取视频信息",
                videoInfo = _uiState.value.videoInfo,
                history = _uiState.value.history,
            )

            runCatching {
                appContext.contentResolver.takePersistableUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION,
                )
            }

            val result = withContext(Dispatchers.IO) {
                runCatching { VideoMetadataReader.read(appContext, uri, expectedKind) }
            }

            result
                .onSuccess { info ->
                    if (expectedKind == MediaKind.Video && info.mimeType != null && !info.mimeType.startsWith("video/")) {
                        _uiState.value = TranscribeUiState(
                            phase = WorkPhase.Failed,
                            statusText = "导入失败",
                            errorText = "请选择视频文件",
                            history = _uiState.value.history,
                        )
                    } else if (expectedKind == MediaKind.Audio && info.mimeType != null && !info.mimeType.startsWith("audio/")) {
                        _uiState.value = TranscribeUiState(
                            phase = WorkPhase.Failed,
                            statusText = "导入失败",
                            errorText = "请选择音频文件",
                            history = _uiState.value.history,
                        )
                    } else {
                        _uiState.value = TranscribeUiState(
                            phase = WorkPhase.VideoReady,
                            statusText = if (expectedKind == MediaKind.Audio) {
                                "音频已导入，可以转为 WAV"
                            } else {
                                "视频已导入，可以提取音频"
                            },
                            videoInfo = info,
                            history = _uiState.value.history,
                        )
                    }
                }
                .onFailure { error ->
                    _uiState.value = TranscribeUiState(
                        phase = WorkPhase.Failed,
                        statusText = "导入失败",
                        errorText = error.localizedMessage ?: "读取视频信息失败",
                        history = _uiState.value.history,
                    )
                }
        }
    }

    fun startRecording() {
        runCatching {
            val info = audioRecorder.start()
            _uiState.value = TranscribeUiState(
                phase = WorkPhase.Recording,
                statusText = "正在录音，点击停止后转写",
                videoInfo = info,
                history = _uiState.value.history,
            )
        }.onFailure { error ->
            _uiState.update {
                it.copy(
                    phase = WorkPhase.Failed,
                    statusText = "录音启动失败",
                    errorText = error.localizedMessage ?: "无法启动录音",
                )
            }
        }
    }

    fun stopRecording() {
        runCatching {
            val info = audioRecorder.stop()
            _uiState.update {
                it.copy(
                    phase = WorkPhase.VideoReady,
                    statusText = "录音完成，可以转写",
                    videoInfo = info,
                    audioResult = null,
                    transcriptionResult = null,
                    transcriptExports = null,
                    errorText = null,
                )
            }
        }.onFailure { error ->
            _uiState.update {
                it.copy(
                    phase = WorkPhase.Failed,
                    statusText = "录音保存失败",
                    errorText = error.localizedMessage ?: "无法保存录音",
                )
            }
        }
    }

    fun extractAudio() {
        val selected = _uiState.value.videoInfo ?: return
        extractionJob?.cancel()
        extractionJob = viewModelScope.launch {
            _uiState.update {
                it.copy(
                        phase = WorkPhase.ExtractingAudio,
                        statusText = "正在提取音频",
                        audioResult = null,
                        transcriptionResult = null,
                        transcriptExports = null,
                        errorText = null,
                        extractionProgress = 0f,
                    )
            }

            try {
                val result = withWakeLock("lingxi:extract-audio") {
                    val extracted = audioExtractor.extractToWav(
                        uri = selected.uri,
                        displayName = selected.displayName,
                    ) { progress ->
                        _uiState.update {
                            it.copy(extractionProgress = progress.coerceIn(0f, 1f))
                        }
                    }
                    val exported = runCatching {
                        publicExportStore.exportFile(
                            sourcePath = extracted.outputPath,
                            displayName = extracted.outputPath.substringAfterLast('/'),
                            mimeType = "audio/wav",
                            bucket = ExportBucket.Audio,
                        )
                    }.getOrNull()
                    extracted.copy(
                        publicUri = exported?.uri,
                        publicPathHint = exported?.relativePath,
                    )
                }

                _uiState.update {
                    it.copy(
                        phase = WorkPhase.AudioReady,
                        statusText = "音频提取完成，已导出到 Downloads/灵析/音频",
                        audioResult = result,
                        publicExportHint = result.publicPathHint,
                        errorText = null,
                        extractionProgress = 1f,
                    )
                }
            } catch (cancelled: CancellationException) {
                _uiState.update {
                    it.copy(
                        phase = WorkPhase.VideoReady,
                        statusText = "已取消音频提取",
                        errorText = null,
                        extractionProgress = 0f,
                    )
                }
            } catch (error: Throwable) {
                _uiState.update {
                    it.copy(
                        phase = WorkPhase.Failed,
                        statusText = "音频提取失败",
                        errorText = error.localizedMessage ?: "音频提取失败",
                        audioResult = null,
                        extractionProgress = 0f,
                    )
                }
            }
        }
    }

    fun captureSubtitles() {
        val selected = _uiState.value.videoInfo ?: return
        if (selected.kind != MediaKind.Video) return
        subtitleJob?.cancel()
        subtitleJob = viewModelScope.launch {
            _uiState.update {
                it.copy(
                    phase = WorkPhase.CapturingSubtitles,
                    statusText = "正在捕捉视频字幕辅助",
                    subtitleAssistResult = null,
                    errorText = null,
                    subtitleProgress = 0f,
                )
            }

            try {
                val result = withWakeLock("lingxi:capture-subtitles") {
                    val captured = subtitleOcrExtractor.extractFromVideo(
                        uri = selected.uri,
                        displayName = selected.displayName,
                        durationMs = selected.durationMs,
                    ) { progress ->
                        _uiState.update {
                            it.copy(subtitleProgress = progress.coerceIn(0f, 1f))
                        }
                    }
                    val exported = runCatching {
                        publicExportStore.exportFile(
                            sourcePath = captured.outputPath,
                            displayName = captured.outputPath.substringAfterLast('/'),
                            mimeType = "text/plain",
                            bucket = ExportBucket.Subtitles,
                        )
                    }.getOrNull()
                    captured.copy(
                        publicUri = exported?.uri,
                        publicPathHint = exported?.relativePath,
                    )
                }

                _uiState.update {
                    it.copy(
                        phase = if (it.audioResult != null) WorkPhase.AudioReady else WorkPhase.VideoReady,
                        statusText = "字幕辅助捕捉完成，已导出到 Downloads/灵析/字幕辅助",
                        subtitleAssistResult = result,
                        publicExportHint = result.publicPathHint,
                        subtitleProgress = 1f,
                        errorText = null,
                    )
                }
            } catch (cancelled: CancellationException) {
                _uiState.update {
                    it.copy(
                        phase = WorkPhase.VideoReady,
                        statusText = "已取消字幕捕捉",
                        subtitleProgress = 0f,
                        errorText = null,
                    )
                }
            } catch (error: Throwable) {
                _uiState.update {
                    it.copy(
                        phase = WorkPhase.Failed,
                        statusText = "字幕捕捉失败",
                        errorText = error.localizedMessage ?: "字幕 OCR 失败",
                        subtitleProgress = 0f,
                    )
                }
            }
        }
    }

    fun cancelExtraction() {
        if (_uiState.value.phase == WorkPhase.Recording) {
            audioRecorder.cancel()
            _uiState.update {
                it.copy(
                    phase = WorkPhase.Idle,
                    statusText = "录音已取消",
                    videoInfo = null,
                    errorText = null,
                )
            }
        } else {
            if (_uiState.value.phase == WorkPhase.CapturingSubtitles) {
                subtitleJob?.cancel()
            } else {
                extractionJob?.cancel()
            }
        }
    }

    fun transcribeAudio() {
        val audio = _uiState.value.audioResult ?: return
        transcriptionJob?.cancel()
        transcriptionJob = viewModelScope.launch {
            _uiState.update {
                it.copy(
                    phase = WorkPhase.Transcribing,
                    statusText = "正在本地转写（稳定模式）",
                    transcriptionResult = null,
                    errorText = null,
                )
            }

            try {
                val result = withWakeLock("lingxi:transcribe") {
                    whisperTranscriber.transcribe(
                        wavPath = audio.outputPath,
                        language = "zh",
                        translate = false,
                    )
                }
                val mediaName = _uiState.value.videoInfo?.displayName ?: "transcript"
                val exports = transcriptExporter.write(
                    videoName = mediaName,
                    result = result,
                    subtitleAssistText = _uiState.value.subtitleAssistResult?.text.orEmpty(),
                    glossaryText = _uiState.value.glossaryText,
                )
                val publicTxt = runCatching {
                    publicExportStore.exportFile(
                        sourcePath = exports.txtPath,
                        displayName = exports.txtPath.substringAfterLast('/'),
                        mimeType = "text/plain",
                        bucket = ExportBucket.Transcripts,
                    )
                }.getOrNull()
                val publicDocx = runCatching {
                    publicExportStore.exportFile(
                        sourcePath = exports.docxPath,
                        displayName = exports.docxPath.substringAfterLast('/'),
                        mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        bucket = ExportBucket.Transcripts,
                    )
                }.getOrNull()
                val exported = exports.copy(
                    publicTxtUri = publicTxt?.uri,
                    publicDocxUri = publicDocx?.uri,
                    publicPathHint = publicDocx?.relativePath ?: publicTxt?.relativePath,
                )
                val history = historyStore.add(mediaName, result, exported)
                _uiState.update {
                    it.copy(
                        phase = WorkPhase.Transcribed,
                        statusText = "转写完成，已导出到 Downloads/灵析/文稿",
                        transcriptionResult = result,
                        transcriptExports = exported,
                        history = history,
                        publicExportHint = exported.publicPathHint,
                        errorText = null,
                    )
                }
            } catch (cancelled: CancellationException) {
                _uiState.update {
                    it.copy(
                        phase = WorkPhase.AudioReady,
                        statusText = "已取消转写",
                        errorText = null,
                    )
                }
            } catch (error: Throwable) {
                _uiState.update {
                    it.copy(
                        phase = WorkPhase.Failed,
                        statusText = "转写失败",
                        errorText = error.localizedMessage ?: "本地转写失败",
                    )
                }
            }
        }
    }

    override fun onCleared() {
        extractionJob?.cancel()
        subtitleJob?.cancel()
        transcriptionJob?.cancel()
        audioRecorder.cancel()
        subtitleOcrExtractor.close()
        whisperTranscriber.release()
        super.onCleared()
    }

    private suspend fun <T> withWakeLock(tag: String, block: suspend () -> T): T {
        val manager = appContext.getSystemService(Context.POWER_SERVICE) as PowerManager
        val wakeLock = manager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, tag)
        wakeLock.acquire(60 * 60 * 1000L)
        return try {
            block()
        } finally {
            if (wakeLock.isHeld) wakeLock.release()
        }
    }

    private companion object {
        const val KEY_GLOSSARY = "glossary"
    }
}

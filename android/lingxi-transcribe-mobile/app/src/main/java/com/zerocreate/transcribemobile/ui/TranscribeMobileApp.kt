package com.zerocreate.transcribemobile.ui

import android.content.Context
import android.content.Intent
import android.content.ClipData
import android.content.ClipboardManager
import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.DocumentsContract
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Error
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.GraphicEq
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material.icons.rounded.Movie
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.PhotoLibrary
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.StopCircle
import androidx.compose.material.icons.rounded.Subtitles
import androidx.compose.material.icons.rounded.UploadFile
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Shapes
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.zerocreate.transcribemobile.BuildConfig
import com.zerocreate.transcribemobile.media.AudioExtractionResult
import com.zerocreate.transcribemobile.media.MediaKind
import com.zerocreate.transcribemobile.media.VideoFileInfo
import com.zerocreate.transcribemobile.history.TranscriptHistoryRecord
import com.zerocreate.transcribemobile.state.TranscribeUiState
import com.zerocreate.transcribemobile.state.TranscribeViewModel
import com.zerocreate.transcribemobile.state.WorkPhase
import com.zerocreate.transcribemobile.subtitle.SubtitleAssistResult
import com.zerocreate.transcribemobile.transcribe.TranscriptExports
import com.zerocreate.transcribemobile.transcribe.TranscriptionResult
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val Ink = Color(0xFF172120)
private val MutedInk = Color(0xFF62706C)
private val Paper = Color(0xFFF7F8F5)
private val Panel = Color(0xFFFFFFFF)
private val DeepTeal = Color(0xFF123B3A)
private val Field = Color(0xFFE9EFE8)
private val Accent = Color(0xFFE1B84D)
private val Danger = Color(0xFFC84B31)

private val AppColors = lightColorScheme(
    primary = DeepTeal,
    onPrimary = Color.White,
    secondary = Accent,
    background = Paper,
    surface = Panel,
    onSurface = Ink,
    error = Danger,
)

private val AppShapes = Shapes(
    extraSmall = RoundedCornerShape(4.dp),
    small = RoundedCornerShape(6.dp),
    medium = RoundedCornerShape(8.dp),
    large = RoundedCornerShape(8.dp),
    extraLarge = RoundedCornerShape(8.dp),
)

@Composable
fun TranscribeMobileApp(
    sharedMediaUri: Uri?,
    viewModel: TranscribeViewModel = viewModel(),
) {
    val context = LocalContext.current
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val videoPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let(viewModel::importVideo)
    }
    val audioPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let(viewModel::importAudio)
    }
    val recordPermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) {
            viewModel.startRecording()
        } else {
            Toast.makeText(context, "需要麦克风权限才能录音转写", Toast.LENGTH_SHORT).show()
        }
    }

    LaunchedEffect(sharedMediaUri) {
        sharedMediaUri?.let { uri ->
            if (context.contentResolver.getType(uri)?.startsWith("audio/") == true) {
                viewModel.importAudio(uri)
            } else {
                viewModel.importVideo(uri)
            }
        }
    }

    MaterialTheme(
        colorScheme = AppColors,
        shapes = AppShapes,
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        listOf(Color(0xFFF8FAF7), Color(0xFFEAF0F0), Color(0xFFF5F6F2)),
                    ),
                ),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 18.dp, vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Header(state = state)
                ActionPanel(
                    state = state,
                    onPick = { videoPicker.launch(arrayOf("video/*")) },
                    onPickAudio = { audioPicker.launch(arrayOf("audio/*")) },
                    onStartRecording = {
                        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                            viewModel.startRecording()
                        } else {
                            recordPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                        }
                    },
                    onStopRecording = viewModel::stopRecording,
                    onExtract = viewModel::extractAudio,
                    onCaptureSubtitles = viewModel::captureSubtitles,
                    onTranscribe = viewModel::transcribeAudio,
                    onCancel = viewModel::cancelExtraction,
                    onShareAudio = { result -> shareAudio(context, result) },
                    onOpenTranscriptsFolder = { openLingxiDownloadsFolder(context, "文稿") },
                    onOpenAudioFolder = { openLingxiDownloadsFolder(context, "音频") },
                )
                GlossaryPanel(
                    text = state.glossaryText,
                    onChange = viewModel::updateGlossary,
                )
                MediaPanel(videoInfo = state.videoInfo)
                SubtitleAssistPanel(result = state.subtitleAssistResult)
                AudioPanel(audioResult = state.audioResult)
                TranscriptPanel(
                    result = state.transcriptionResult,
                    exports = state.transcriptExports,
                    onCopyText = { text -> copyText(context, text) },
                    onShareTranscript = { path, mime -> shareFile(context, path, mime) },
                )
                HistoryPanel(
                    records = state.history,
                    onShareTranscript = { path, mime -> shareFile(context, path, mime) },
                )
                PipelinePanel(state = state)
                Spacer(modifier = Modifier.height(4.dp))
            }
        }
    }
}

@Composable
private fun Header(state: TranscribeUiState) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                text = "零析AI 转写",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Black,
                color = Ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = "零析AI 转写 · v${BuildConfig.VERSION_NAME.removeSuffix("-lingxi")}",
                style = MaterialTheme.typography.bodySmall,
                color = MutedInk,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Surface(
            shape = RoundedCornerShape(8.dp),
            color = state.phase.badgeColor(),
        ) {
            Text(
                text = state.phase.badgeText(),
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                style = MaterialTheme.typography.labelMedium,
                color = Color.White,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
            )
        }
    }
}

@Composable
private fun ActionPanel(
    state: TranscribeUiState,
    onPick: () -> Unit,
    onPickAudio: () -> Unit,
    onStartRecording: () -> Unit,
    onStopRecording: () -> Unit,
    onExtract: () -> Unit,
    onCaptureSubtitles: () -> Unit,
    onTranscribe: () -> Unit,
    onCancel: () -> Unit,
    onShareAudio: (AudioExtractionResult) -> Unit,
    onOpenTranscriptsFolder: () -> Unit,
    onOpenAudioFolder: () -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = DeepTeal,
        shadowElevation = 2.dp,
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = state.phase.statusIcon(),
                    contentDescription = null,
                    tint = Accent,
                )
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = state.statusText,
                        style = MaterialTheme.typography.titleMedium,
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    state.errorText?.let {
                        Text(
                            text = it,
                            style = MaterialTheme.typography.bodySmall,
                            color = Color(0xFFFFD1C8),
                            maxLines = 3,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    state.publicExportHint?.let {
                        Text(
                            text = "公共导出：$it",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color(0xFFB7D8CE),
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }

            when (state.phase) {
                WorkPhase.ExtractingAudio -> {
                    LinearProgressIndicator(
                        progress = { state.extractionProgress },
                        modifier = Modifier.fillMaxWidth(),
                        color = Accent,
                        trackColor = Color(0xFF315B59),
                    )
                }

                WorkPhase.Transcribing -> {
                    LinearProgressIndicator(
                        modifier = Modifier.fillMaxWidth(),
                        color = Accent,
                        trackColor = Color(0xFF315B59),
                    )
                }

                WorkPhase.CapturingSubtitles -> {
                    LinearProgressIndicator(
                        progress = { state.subtitleProgress },
                        modifier = Modifier.fillMaxWidth(),
                        color = Accent,
                        trackColor = Color(0xFF315B59),
                    )
                }

                else -> Unit
            }

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = onPick,
                    enabled = state.canPickVideo,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Accent,
                        contentColor = Color(0xFF2C2410),
                    ),
                ) {
                    Icon(imageVector = Icons.Rounded.PhotoLibrary, contentDescription = null)
                    Text(
                        text = if (state.phase == WorkPhase.ReadingVideo) "正在读取" else "相册/文件选择视频",
                        modifier = Modifier.padding(start = 8.dp),
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OutlinedButton(
                        onClick = onPickAudio,
                        enabled = state.canPickAudio,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                    ) {
                        Icon(imageVector = Icons.Rounded.MusicNote, contentDescription = null)
                        Text(text = "上传音频", modifier = Modifier.padding(start = 6.dp))
                    }
                    OutlinedButton(
                        onClick = if (state.phase == WorkPhase.Recording) onStopRecording else onStartRecording,
                        enabled = state.canRecord,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                    ) {
                        Icon(
                            imageVector = if (state.phase == WorkPhase.Recording) Icons.Rounded.StopCircle else Icons.Rounded.Mic,
                            contentDescription = null,
                        )
                        Text(
                            text = if (state.phase == WorkPhase.Recording) "停止录音" else "录音转写",
                            modifier = Modifier.padding(start = 6.dp),
                        )
                    }
                }

                Button(
                    onClick = onExtract,
                    enabled = state.canExtractAudio,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color.White,
                        contentColor = DeepTeal,
                    ),
                ) {
                    Icon(imageVector = Icons.Rounded.GraphicEq, contentDescription = null)
                    Text(
                        text = when {
                            state.phase == WorkPhase.ExtractingAudio -> "正在准备音频"
                            state.videoInfo?.kind == MediaKind.Audio || state.videoInfo?.kind == MediaKind.Recording -> "准备转写音频"
                            else -> "提取视频音频"
                        },
                        modifier = Modifier.padding(start = 8.dp),
                    )
                }

                OutlinedButton(
                    onClick = onCaptureSubtitles,
                    enabled = state.canCaptureSubtitles,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                ) {
                    Icon(imageVector = Icons.Rounded.Subtitles, contentDescription = null)
                    Text(
                        text = if (state.phase == WorkPhase.CapturingSubtitles) "正在捕捉字幕辅助" else "捕捉字幕辅助转写",
                        modifier = Modifier.padding(start = 8.dp),
                    )
                }

                if (state.canCancel) {
                    OutlinedButton(
                        onClick = onCancel,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                    ) {
                        Icon(imageVector = Icons.Rounded.Close, contentDescription = null)
                        Text(
                            text = if (state.phase == WorkPhase.Recording) "取消录音" else "取消提取",
                            modifier = Modifier.padding(start = 8.dp),
                        )
                    }
                }

                state.audioResult?.let { result ->
                    Button(
                        onClick = onTranscribe,
                        enabled = state.canTranscribe,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(0xFFF5EFE0),
                            contentColor = DeepTeal,
                        ),
                    ) {
                        Icon(imageVector = Icons.Rounded.GraphicEq, contentDescription = null)
                        Text(
                            text = if (state.phase == WorkPhase.Transcribing) "稳定转写中" else "开始本地转写",
                            modifier = Modifier.padding(start = 8.dp),
                        )
                    }

                    OutlinedButton(
                        onClick = { onShareAudio(result) },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                    ) {
                        Icon(imageVector = Icons.Rounded.Share, contentDescription = null)
                        Text(text = "分享 WAV 文件", modifier = Modifier.padding(start = 8.dp))
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OutlinedButton(
                        onClick = onOpenTranscriptsFolder,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                    ) {
                        Icon(imageVector = Icons.Rounded.Folder, contentDescription = null)
                        Text(text = "文稿文件夹", modifier = Modifier.padding(start = 6.dp))
                    }
                    OutlinedButton(
                        onClick = onOpenAudioFolder,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                    ) {
                        Icon(imageVector = Icons.Rounded.Folder, contentDescription = null)
                        Text(text = "音频文件夹", modifier = Modifier.padding(start = 6.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun GlossaryPanel(
    text: String,
    onChange: (String) -> Unit,
) {
    InfoSurface(title = "专有词与错词纠正", icon = Icons.Rounded.CheckCircle) {
        OutlinedTextField(
            value = text,
            onValueChange = onChange,
            modifier = Modifier.fillMaxWidth(),
            minLines = 3,
            maxLines = 6,
            placeholder = {
                Text("每行一条：\n零析AI 转写\n错误词=正确词\nOPC=OBC")
            },
        )
        Text(
            text = "转写导出时会按词表修正文稿；字幕辅助和 Whisper 原文都会保留，方便核对。",
            style = MaterialTheme.typography.bodySmall,
            color = MutedInk,
        )
    }
}

@Composable
private fun SubtitleAssistPanel(result: SubtitleAssistResult?) {
    InfoSurface(title = "字幕辅助", icon = Icons.Rounded.Subtitles) {
        if (result == null) {
            EmptyLine(text = "可先捕捉视频底部字幕，辅助核对同音字和专有词")
        } else {
            TwoColumnLine(
                leftLabel = "采样帧",
                leftValue = "${result.frameCount}",
                rightLabel = "字幕行",
                rightValue = "${result.lineCount}",
            )
            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = Field,
            ) {
                Text(
                    text = result.text.ifBlank { "未识别到字幕文字" },
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                    style = MaterialTheme.typography.bodySmall,
                    color = Ink,
                    maxLines = 5,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            MetadataLine(label = "输出路径", value = result.outputPath)
            result.publicPathHint?.let {
                MetadataLine(label = "公共目录", value = it)
            }
        }
    }
}

@Composable
private fun TranscriptPanel(
    result: TranscriptionResult?,
    exports: TranscriptExports?,
    onCopyText: (String) -> Unit,
    onShareTranscript: (String, String) -> Unit,
) {
    InfoSurface(title = "转写文稿", icon = Icons.Rounded.Subtitles) {
        if (result == null) {
            EmptyLine(text = "等待本地模型生成文稿")
        } else {
            TwoColumnLine(
                leftLabel = "语言",
                leftValue = result.language.ifBlank { "auto" },
                rightLabel = "片段",
                rightValue = "${result.segments.size}",
            )
            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = Field,
            ) {
                Text(
                    text = result.fullText.ifBlank { "未识别到文本" },
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Ink,
                    maxLines = 10,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedButton(
                    onClick = { onCopyText(result.fullText) },
                    modifier = Modifier.weight(1f),
                ) {
                    Icon(imageVector = Icons.Rounded.ContentCopy, contentDescription = null)
                    Text(text = "复制", modifier = Modifier.padding(start = 6.dp))
                }
                exports?.let {
                    Button(
                        onClick = { onShareTranscript(it.txtPath, "text/plain") },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = DeepTeal,
                            contentColor = Color.White,
                        ),
                    ) {
                        Icon(imageVector = Icons.Rounded.Share, contentDescription = null)
                        Text(text = "TXT", modifier = Modifier.padding(start = 6.dp))
                    }
                }
            }
            exports?.let {
                exports.publicPathHint?.let { path ->
                    MetadataLine(label = "公共目录", value = path)
                }
                Button(
                    onClick = { onShareTranscript(it.docxPath, DOCX_MIME) },
                    enabled = it.docxPath.isNotBlank(),
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Accent,
                        contentColor = Color(0xFF2C2410),
                    ),
                ) {
                    Icon(imageVector = Icons.Rounded.UploadFile, contentDescription = null)
                    Text(text = "导出 DOCX 文档", modifier = Modifier.padding(start = 8.dp))
                }
            }
        }
    }
}

@Composable
private fun HistoryPanel(
    records: List<TranscriptHistoryRecord>,
    onShareTranscript: (String, String) -> Unit,
) {
    InfoSurface(title = "最近历史", icon = Icons.Rounded.History) {
        if (records.isEmpty()) {
            EmptyLine(text = "转写完成后会自动保存最近 20 条记录")
        } else {
            records.take(3).forEach { record ->
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    color = Field,
                ) {
                    Column(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        MetadataLine(label = record.createdAtMs.formatDateTime(), value = record.videoName)
                        Text(
                            text = record.preview.ifBlank { "未识别到文本" },
                            style = MaterialTheme.typography.bodySmall,
                            color = MutedInk,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(
                                onClick = { onShareTranscript(record.txtPath, "text/plain") },
                                modifier = Modifier.weight(1f),
                            ) {
                                Text(text = "TXT")
                            }
                            OutlinedButton(
                                onClick = { onShareTranscript(record.docxPath, DOCX_MIME) },
                                enabled = record.docxPath.isNotBlank(),
                                modifier = Modifier.weight(1f),
                            ) {
                                Text(text = "DOCX")
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MediaPanel(videoInfo: VideoFileInfo?) {
    InfoSurface(
        title = when (videoInfo?.kind) {
            MediaKind.Audio -> "音频信息"
            MediaKind.Recording -> "录音信息"
            else -> "视频信息"
        },
        icon = when (videoInfo?.kind) {
            MediaKind.Audio,
            MediaKind.Recording -> Icons.Rounded.MusicNote
            else -> Icons.Rounded.Movie
        },
    ) {
        if (videoInfo == null) {
            EmptyLine(text = "未选择素材")
        } else {
            MetadataLine(label = "文件名", value = videoInfo.displayName)
            TwoColumnLine(
                leftLabel = "时长",
                leftValue = videoInfo.durationMs.formatDuration(),
                rightLabel = "大小",
                rightValue = videoInfo.sizeBytes.formatBytes(),
            )
            MetadataLine(label = "类型", value = videoInfo.mimeType ?: "未知")
        }
    }
}

@Composable
private fun AudioPanel(audioResult: AudioExtractionResult?) {
    InfoSurface(title = "音频输出", icon = Icons.Rounded.UploadFile) {
        if (audioResult == null) {
            EmptyLine(text = "等待提取 16kHz mono WAV")
        } else {
            TwoColumnLine(
                leftLabel = "格式",
                leftValue = "${audioResult.sampleRate}Hz / mono",
                rightLabel = "体积",
                rightValue = audioResult.outputBytes.formatBytes(),
            )
            MetadataLine(label = "输出路径", value = audioResult.outputPath)
            audioResult.publicPathHint?.let {
                MetadataLine(label = "公共目录", value = it)
            }
        }
    }
}

@Composable
private fun PipelinePanel(state: TranscribeUiState) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        StepTile(
            label = "导入",
            status = if (state.videoInfo == null) "待选择" else "完成",
            done = state.videoInfo != null,
        )
        StepTile(
            label = "提音频",
            status = when (state.phase) {
                WorkPhase.ExtractingAudio -> "处理中"
                else -> if (state.audioResult == null) "待处理" else "完成"
            },
            done = state.audioResult != null,
        )
        StepTile(
            label = "转写",
            status = when {
                state.phase == WorkPhase.Transcribing -> "处理中"
                state.transcriptionResult != null -> "完成"
                else -> "待转写"
            },
            done = state.transcriptionResult != null,
        )
    }
}

@Composable
private fun InfoSurface(
    title: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    content: @Composable ColumnScope.() -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = Panel,
        shadowElevation = 1.dp,
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(imageVector = icon, contentDescription = null, tint = DeepTeal)
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleSmall,
                    color = Ink,
                    fontWeight = FontWeight.Bold,
                )
            }
            content()
        }
    }
}

@Composable
private fun ColumnScope.EmptyLine(text: String) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = Field,
    ) {
        Text(
            text = text,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            style = MaterialTheme.typography.bodyMedium,
            color = MutedInk,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun MetadataLine(label: String, value: String) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MutedInk,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            color = Ink,
            maxLines = 3,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun TwoColumnLine(
    leftLabel: String,
    leftValue: String,
    rightLabel: String,
    rightValue: String,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(modifier = Modifier.weight(1f)) {
            MetadataLine(label = leftLabel, value = leftValue)
        }
        Box(modifier = Modifier.weight(1f)) {
            MetadataLine(label = rightLabel, value = rightValue)
        }
    }
}

@Composable
private fun RowScope.StepTile(label: String, status: String, done: Boolean) {
    Surface(
        modifier = Modifier
            .weight(1f)
            .height(70.dp),
        color = if (done) Color(0xFFE8F2EC) else Color.White,
        shadowElevation = 1.dp,
    ) {
        Column(
            modifier = Modifier.padding(10.dp),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(5.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = if (done) Icons.Rounded.CheckCircle else Icons.Rounded.GraphicEq,
                    contentDescription = null,
                    tint = if (done) DeepTeal else MutedInk,
                )
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold,
                    color = Ink,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text(
                text = status,
                style = MaterialTheme.typography.labelMedium,
                color = MutedInk,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

private fun WorkPhase.badgeText(): String {
    return when (this) {
        WorkPhase.Idle -> "待导入"
        WorkPhase.ReadingVideo -> "读取中"
        WorkPhase.VideoReady -> "已导入"
        WorkPhase.Recording -> "录音中"
        WorkPhase.ExtractingAudio -> "提取中"
        WorkPhase.CapturingSubtitles -> "字幕中"
        WorkPhase.AudioReady -> "已输出"
        WorkPhase.Transcribing -> "转写中"
        WorkPhase.Transcribed -> "已转写"
        WorkPhase.Failed -> "需处理"
    }
}

private fun WorkPhase.badgeColor(): Color {
    return when (this) {
        WorkPhase.Failed -> Danger
        WorkPhase.AudioReady,
        WorkPhase.Transcribed -> DeepTeal
        WorkPhase.Recording -> Danger
        WorkPhase.CapturingSubtitles -> Color(0xFF7B5A12)
        WorkPhase.ExtractingAudio -> Color(0xFF7B5A12)
        WorkPhase.Transcribing -> Color(0xFF7B5A12)
        else -> Color(0xFF4E615E)
    }
}

private fun WorkPhase.statusIcon() = when (this) {
    WorkPhase.Failed -> Icons.Rounded.Error
    WorkPhase.AudioReady,
    WorkPhase.Transcribed -> Icons.Rounded.CheckCircle
    WorkPhase.Idle,
    WorkPhase.ReadingVideo,
    WorkPhase.VideoReady,
    WorkPhase.Recording,
    WorkPhase.ExtractingAudio,
    WorkPhase.CapturingSubtitles,
    WorkPhase.Transcribing -> Icons.Rounded.GraphicEq
}

private fun Long?.formatDuration(): String {
    if (this == null || this < 0) return "未知"
    val totalSeconds = this / 1000
    val hours = totalSeconds / 3600
    val minutes = (totalSeconds % 3600) / 60
    val seconds = totalSeconds % 60
    return if (hours > 0) {
        "%d:%02d:%02d".format(hours, minutes, seconds)
    } else {
        "%02d:%02d".format(minutes, seconds)
    }
}

private fun Long?.formatBytes(): String {
    if (this == null || this < 0) return "未知"
    val units = listOf("B", "KB", "MB", "GB")
    var value = this.toDouble()
    var unitIndex = 0
    while (value >= 1024 && unitIndex < units.lastIndex) {
        value /= 1024
        unitIndex += 1
    }
    return if (unitIndex == 0) {
        "${value.toLong()} ${units[unitIndex]}"
    } else {
        "%.1f %s".format(value, units[unitIndex])
    }
}

private fun shareAudio(context: Context, audioResult: AudioExtractionResult) {
    shareFile(context, audioResult.outputPath, "audio/wav", "分享 WAV 文件")
}

private fun openLingxiDownloadsFolder(context: Context, folderName: String) {
    val documentId = "primary:Download/零析AI 转写/$folderName"
    val uri = DocumentsContract.buildDocumentUri(
        "com.android.externalstorage.documents",
        documentId,
    )
    val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, DocumentsContract.Document.MIME_TYPE_DIR)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    runCatching {
        context.startActivity(Intent.createChooser(intent, "打开文件夹"))
    }.onFailure {
        Toast.makeText(context, "请到系统文件管理器打开 Downloads/零析AI 转写/$folderName", Toast.LENGTH_LONG).show()
    }
}

private fun shareFile(
    context: Context,
    path: String,
    mimeType: String,
    chooserTitle: String = "分享文件",
) {
    val audioFile = File(path)
    val uri = FileProvider.getUriForFile(
        context,
        FILE_PROVIDER_AUTHORITY,
        audioFile,
    )
    val shareIntent = Intent(Intent.ACTION_SEND).apply {
        type = mimeType
        putExtra(Intent.EXTRA_STREAM, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    context.startActivity(Intent.createChooser(shareIntent, chooserTitle))
}

private fun copyText(context: Context, text: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    clipboard.setPrimaryClip(ClipData.newPlainText("转写文稿", text))
    Toast.makeText(context, "已复制文稿", Toast.LENGTH_SHORT).show()
}

private fun Long.formatDateTime(): String {
    return SimpleDateFormat("MM-dd HH:mm", Locale.CHINA).format(Date(this))
}

private const val FILE_PROVIDER_AUTHORITY = "com.zerocreate.transcribemobile.fileprovider"
private const val DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

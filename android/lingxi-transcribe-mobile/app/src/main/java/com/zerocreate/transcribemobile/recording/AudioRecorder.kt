package com.zerocreate.transcribemobile.recording

import android.content.Context
import android.media.MediaRecorder
import android.net.Uri
import com.zerocreate.transcribemobile.media.MediaKind
import com.zerocreate.transcribemobile.media.VideoFileInfo
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class AudioRecorder(private val context: Context) {
    private var recorder: MediaRecorder? = null
    private var outputFile: File? = null

    fun start(): VideoFileInfo {
        stopSilently()
        val dir = File(context.filesDir, "recordings").apply { mkdirs() }
        val name = "灵析录音-${SimpleDateFormat("yyyyMMdd-HHmmss", Locale.CHINA).format(Date())}.m4a"
        val file = File(dir, name)

        val mediaRecorder = MediaRecorder().apply {
            setAudioSource(MediaRecorder.AudioSource.MIC)
            setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            setAudioChannels(1)
            setAudioSamplingRate(16_000)
            setAudioEncodingBitRate(64_000)
            setOutputFile(file.absolutePath)
            prepare()
            start()
        }

        recorder = mediaRecorder
        outputFile = file
        return file.toInfo()
    }

    fun stop(): VideoFileInfo {
        val file = outputFile ?: error("没有正在录制的音频")
        val current = recorder ?: error("录音器未启动")
        runCatching { current.stop() }
        current.release()
        recorder = null
        outputFile = null
        return file.toInfo()
    }

    fun cancel() {
        val file = outputFile
        stopSilently()
        file?.delete()
    }

    private fun stopSilently() {
        runCatching { recorder?.stop() }
        runCatching { recorder?.release() }
        recorder = null
        outputFile = null
    }

    private fun File.toInfo(): VideoFileInfo {
        return VideoFileInfo(
            uri = Uri.fromFile(this),
            displayName = name,
            sizeBytes = length().takeIf { it >= 0 },
            durationMs = null,
            mimeType = "audio/mp4",
            kind = MediaKind.Recording,
        )
    }
}

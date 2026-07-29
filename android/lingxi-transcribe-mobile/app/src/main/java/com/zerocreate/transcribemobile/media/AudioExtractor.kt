package com.zerocreate.transcribemobile.media

import android.content.Context
import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import android.content.res.AssetFileDescriptor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.roundToInt
import kotlin.coroutines.coroutineContext

class AudioExtractor(private val context: Context) {
    suspend fun extractToWav(
        uri: Uri,
        displayName: String,
        onProgress: (Float) -> Unit = {},
    ): AudioExtractionResult = withContext(Dispatchers.IO) {
        val outputDir = File(context.filesDir, "extracted_audio").apply { mkdirs() }
        val outputFile = File(outputDir, "${displayName.safeBaseName()}-${System.currentTimeMillis()}.wav")

        val extractor = MediaExtractor()
        try {
            if (uri.scheme == "file") {
                extractor.setDataSource(uri.path ?: error("文件路径无效"))
            } else {
                context.contentResolver.openAssetFileDescriptor(uri, "r")?.use { descriptor ->
                    extractor.setDataSource(
                        descriptor.fileDescriptor,
                        descriptor.startOffset,
                        descriptor.length,
                    )
                } ?: extractor.setDataSource(context, uri, null)
            }
            decodeSelectedAudioTrack(
                extractor = extractor,
                outputFile = outputFile,
                onProgress = onProgress,
            )
        } finally {
            extractor.release()
        }

        AudioExtractionResult(
            outputPath = outputFile.absolutePath,
            outputBytes = outputFile.length(),
            durationMs = readDurationMs(uri),
        )
    }.also {
        if (it.outputBytes <= WAV_HEADER_BYTES) {
            File(it.outputPath).delete()
            error("音轨解码完成，但没有得到有效音频数据")
        }
    }

    private suspend fun decodeSelectedAudioTrack(
        extractor: MediaExtractor,
        outputFile: File,
        onProgress: (Float) -> Unit,
    ) {
        val trackIndex = findAudioTrack(extractor)
        if (trackIndex < 0) {
            error("没有找到可提取的音轨")
        }

        val inputFormat = extractor.getTrackFormat(trackIndex)
        val mime = inputFormat.getString(MediaFormat.KEY_MIME) ?: error("音轨格式缺少 MIME")
        val durationUs = if (inputFormat.containsKey(MediaFormat.KEY_DURATION)) {
            inputFormat.getLong(MediaFormat.KEY_DURATION)
        } else {
            0L
        }

        extractor.selectTrack(trackIndex)

        val decoder = MediaCodec.createDecoderByType(mime)
        val bufferInfo = MediaCodec.BufferInfo()
        var sawInputEnd = false
        var sawOutputEnd = false
        var outputFormat = inputFormat
        val pcmConverter = PcmToMono16kConverter()

        decoder.configure(inputFormat, null, null, 0)
        decoder.start()

        try {
            WavFileWriter(
                file = outputFile,
                sampleRate = TARGET_SAMPLE_RATE,
                channelCount = TARGET_CHANNEL_COUNT,
                bitsPerSample = BITS_PER_SAMPLE,
            ).use { wavWriter ->
                while (!sawOutputEnd) {
                    coroutineContext.ensureActive()

                    if (!sawInputEnd) {
                        val inputIndex = decoder.dequeueInputBuffer(TIMEOUT_US)
                        if (inputIndex >= 0) {
                            val inputBuffer = decoder.getInputBuffer(inputIndex)
                            inputBuffer?.clear()
                            val sampleSize = inputBuffer?.let { extractor.readSampleData(it, 0) } ?: -1

                            if (sampleSize < 0) {
                                decoder.queueInputBuffer(
                                    inputIndex,
                                    0,
                                    0,
                                    0,
                                    MediaCodec.BUFFER_FLAG_END_OF_STREAM,
                                )
                                sawInputEnd = true
                            } else {
                                decoder.queueInputBuffer(
                                    inputIndex,
                                    0,
                                    sampleSize,
                                    extractor.sampleTime,
                                    0,
                                )
                                extractor.advance()
                            }
                        }
                    }

                    when (val outputIndex = decoder.dequeueOutputBuffer(bufferInfo, TIMEOUT_US)) {
                        MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                            outputFormat = decoder.outputFormat
                        }

                        MediaCodec.INFO_TRY_AGAIN_LATER -> Unit

                        else -> {
                            if (outputIndex >= 0) {
                                decoder.getOutputBuffer(outputIndex)?.let { outputBuffer ->
                                    if (bufferInfo.size > 0) {
                                        outputBuffer.position(bufferInfo.offset)
                                        outputBuffer.limit(bufferInfo.offset + bufferInfo.size)
                                        val wavBytes = pcmConverter.convert(outputBuffer.slice(), outputFormat)
                                        if (wavBytes.isNotEmpty()) {
                                            wavWriter.writePcm(wavBytes)
                                        }
                                    }
                                }

                                if (durationUs > 0 && bufferInfo.presentationTimeUs > 0) {
                                    onProgress(
                                        (bufferInfo.presentationTimeUs.toFloat() / durationUs.toFloat())
                                            .coerceIn(0f, 1f),
                                    )
                                }

                                sawOutputEnd = (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0
                                decoder.releaseOutputBuffer(outputIndex, false)
                            }
                        }
                    }
                }
            }
            onProgress(1f)
        } catch (error: Throwable) {
            outputFile.delete()
            throw error
        } finally {
            runCatching { decoder.stop() }
            decoder.release()
        }
    }

    private fun findAudioTrack(extractor: MediaExtractor): Int {
        for (index in 0 until extractor.trackCount) {
            val format = extractor.getTrackFormat(index)
            val mime = format.getString(MediaFormat.KEY_MIME)
            if (mime?.startsWith("audio/") == true) {
                return index
            }
        }
        return -1
    }

    private fun readDurationMs(uri: Uri): Long? {
        return runCatching { VideoMetadataReader.read(context, uri).durationMs }.getOrNull()
    }

    private fun String.safeBaseName(): String {
        return substringBeforeLast('.')
            .replace(Regex("[^A-Za-z0-9._-]+"), "_")
            .trim('_')
            .ifBlank { "video" }
    }

    companion object {
        private const val TIMEOUT_US = 10_000L
        private const val TARGET_SAMPLE_RATE = 16_000
        private const val TARGET_CHANNEL_COUNT = 1
        private const val BITS_PER_SAMPLE = 16
        private const val WAV_HEADER_BYTES = 44
    }
}

private class PcmToMono16kConverter {
    private var sourceFramesRead = 0L
    private var nextOutputSourceFrame = 0.0
    private var lastSampleRate: Int? = null

    fun convert(buffer: ByteBuffer, format: MediaFormat): ByteArray {
        val sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
        val channelCount = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT).coerceAtLeast(1)
        val pcmEncoding = if (format.containsKey(MediaFormat.KEY_PCM_ENCODING)) {
            format.getInteger(MediaFormat.KEY_PCM_ENCODING)
        } else {
            AudioFormat.ENCODING_PCM_16BIT
        }

        if (lastSampleRate != sampleRate) {
            sourceFramesRead = 0L
            nextOutputSourceFrame = 0.0
            lastSampleRate = sampleRate
        }

        val monoSamples = when (pcmEncoding) {
            AudioFormat.ENCODING_PCM_FLOAT -> buffer.toMonoFloat(channelCount)
            else -> buffer.toMonoFloatFromPcm16(channelCount)
        }

        return resampleTo16kPcm16(monoSamples, sampleRate)
    }

    private fun ByteBuffer.toMonoFloatFromPcm16(channelCount: Int): FloatArray {
        order(ByteOrder.LITTLE_ENDIAN)
        val frameCount = remaining() / (Short.SIZE_BYTES * channelCount)
        val output = FloatArray(frameCount)

        for (frame in 0 until frameCount) {
            var sum = 0f
            repeat(channelCount) {
                sum += getShort().toFloat() / Short.MAX_VALUE.toFloat()
            }
            output[frame] = (sum / channelCount).coerceIn(-1f, 1f)
        }

        return output
    }

    private fun ByteBuffer.toMonoFloat(channelCount: Int): FloatArray {
        order(ByteOrder.nativeOrder())
        val frameCount = remaining() / (Float.SIZE_BYTES * channelCount)
        val output = FloatArray(frameCount)

        for (frame in 0 until frameCount) {
            var sum = 0f
            repeat(channelCount) {
                sum += getFloat()
            }
            output[frame] = (sum / channelCount).coerceIn(-1f, 1f)
        }

        return output
    }

    private fun resampleTo16kPcm16(samples: FloatArray, sampleRate: Int): ByteArray {
        if (samples.isEmpty()) return ByteArray(0)

        val startFrame = sourceFramesRead
        val endFrame = sourceFramesRead + samples.size
        val step = sampleRate.toDouble() / TARGET_SAMPLE_RATE.toDouble()
        val output = ArrayList<Short>()

        while (nextOutputSourceFrame < endFrame) {
            val localIndex = (nextOutputSourceFrame - startFrame).roundToInt()
            if (localIndex in samples.indices) {
                val sample = (samples[localIndex].coerceIn(-1f, 1f) * Short.MAX_VALUE).roundToInt()
                output += sample.coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort()
            }
            nextOutputSourceFrame += step
        }

        sourceFramesRead = endFrame

        val bytes = ByteBuffer.allocate(output.size * Short.SIZE_BYTES).order(ByteOrder.LITTLE_ENDIAN)
        output.forEach { bytes.putShort(it) }
        return bytes.array()
    }

    private companion object {
        const val TARGET_SAMPLE_RATE = 16_000
    }
}

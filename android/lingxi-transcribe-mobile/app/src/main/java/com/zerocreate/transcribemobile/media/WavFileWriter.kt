package com.zerocreate.transcribemobile.media

import java.io.Closeable
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder

class WavFileWriter(
    file: File,
    private val sampleRate: Int,
    private val channelCount: Int,
    private val bitsPerSample: Int,
) : Closeable {
    private val writer = RandomAccessFile(file, "rw")
    private var dataBytes = 0L

    init {
        writer.setLength(0)
        writeHeader(dataBytes)
    }

    fun writePcm(bytes: ByteArray) {
        writer.write(bytes)
        dataBytes += bytes.size
    }

    override fun close() {
        writer.seek(0)
        writeHeader(dataBytes)
        writer.close()
    }

    private fun writeHeader(dataSize: Long) {
        val byteRate = sampleRate * channelCount * bitsPerSample / 8
        val blockAlign = channelCount * bitsPerSample / 8
        val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)

        header.putAscii("RIFF")
        header.putInt((36 + dataSize).coerceAtMost(UInt.MAX_VALUE.toLong()).toInt())
        header.putAscii("WAVE")
        header.putAscii("fmt ")
        header.putInt(16)
        header.putShort(1.toShort())
        header.putShort(channelCount.toShort())
        header.putInt(sampleRate)
        header.putInt(byteRate)
        header.putShort(blockAlign.toShort())
        header.putShort(bitsPerSample.toShort())
        header.putAscii("data")
        header.putInt(dataSize.coerceAtMost(UInt.MAX_VALUE.toLong()).toInt())

        writer.write(header.array())
    }
}

private fun ByteBuffer.putAscii(value: String) {
    put(value.toByteArray(Charsets.US_ASCII))
}

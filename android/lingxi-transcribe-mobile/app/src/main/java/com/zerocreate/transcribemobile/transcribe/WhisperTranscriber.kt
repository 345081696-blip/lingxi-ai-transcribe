package com.zerocreate.transcribemobile.transcribe

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.math.min

class WhisperTranscriber(context: Context) {
    private val modelStore = WhisperModelStore(context.applicationContext)
    private val bridge = WhisperNativeBridge()
    private val lock = Any()
    private var contextHandle: Long = 0L

    suspend fun transcribe(
        wavPath: String,
        language: String? = "zh",
        translate: Boolean = false,
    ): TranscriptionResult = withContext(Dispatchers.IO) {
        val modelFile = modelStore.ensureTinyModel()
        val handle = synchronized(lock) {
            if (contextHandle == 0L) {
                contextHandle = bridge.createContext(modelFile.absolutePath)
            }
            contextHandle
        }

        val rawJson = bridge.transcribe(
            handle = handle,
            wavPath = wavPath,
            language = language,
            translate = translate,
            threadCount = defaultThreadCount(),
        )
        TranscriptionResult.fromJson(rawJson)
    }

    fun release() {
        val handle = synchronized(lock) {
            val current = contextHandle
            contextHandle = 0L
            current
        }
        if (handle != 0L) {
            bridge.releaseContext(handle)
        }
    }

    private fun defaultThreadCount(): Int {
        // 手机长音频转写优先稳定，避免满核导致系统高温保护中断。
        return min(2, Runtime.getRuntime().availableProcessors()).coerceAtLeast(1)
    }
}

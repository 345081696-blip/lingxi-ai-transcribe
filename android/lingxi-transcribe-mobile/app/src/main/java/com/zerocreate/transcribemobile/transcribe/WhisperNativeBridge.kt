package com.zerocreate.transcribemobile.transcribe

class WhisperNativeBridge {
    external fun createContext(modelPath: String): Long

    external fun releaseContext(handle: Long)

    external fun transcribe(
        handle: Long,
        wavPath: String,
        language: String?,
        translate: Boolean,
        threadCount: Int,
    ): String

    companion object {
        init {
            System.loadLibrary("transcribe-native")
        }
    }
}

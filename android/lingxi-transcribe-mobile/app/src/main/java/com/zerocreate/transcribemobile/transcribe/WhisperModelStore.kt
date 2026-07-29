package com.zerocreate.transcribemobile.transcribe

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

class WhisperModelStore(private val context: Context) {
    suspend fun ensureTinyModel(): File = withContext(Dispatchers.IO) {
        val modelFile = File(context.filesDir, "models/$TINY_MODEL_NAME")
        if (modelFile.exists() && modelFile.length() > MIN_MODEL_BYTES) {
            return@withContext modelFile
        }

        val assets = context.assets.list(MODEL_ASSET_DIR).orEmpty()
        if (TINY_MODEL_NAME !in assets) {
            error("未找到本地模型：请放入 $MODEL_ASSET_DIR/$TINY_MODEL_NAME")
        }

        modelFile.parentFile?.mkdirs()
        context.assets.open("$MODEL_ASSET_DIR/$TINY_MODEL_NAME").use { input ->
            modelFile.outputStream().use { output ->
                input.copyTo(output)
            }
        }

        if (modelFile.length() <= MIN_MODEL_BYTES) {
            modelFile.delete()
            error("模型文件无效：$TINY_MODEL_NAME")
        }

        modelFile
    }

    companion object {
        private const val MODEL_ASSET_DIR = "models"
        private const val TINY_MODEL_NAME = "ggml-tiny.bin"
        private const val MIN_MODEL_BYTES = 1_000_000L
    }
}

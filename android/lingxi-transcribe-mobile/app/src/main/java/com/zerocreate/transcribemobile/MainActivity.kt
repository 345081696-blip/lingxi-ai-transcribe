package com.zerocreate.transcribemobile

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.zerocreate.transcribemobile.ui.TranscribeMobileApp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        render(intent.sharedMediaUri())
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        render(intent.sharedMediaUri())
    }

    private fun render(sharedMediaUri: Uri?) {
        setContent {
            TranscribeMobileApp(sharedMediaUri = sharedMediaUri)
        }
    }
}

private fun Intent.sharedMediaUri(): Uri? {
    return when (action) {
        Intent.ACTION_SEND -> sharedStreamUri() ?: firstClipUri()
        Intent.ACTION_SEND_MULTIPLE -> sharedStreamUris().firstOrNull() ?: firstClipUri()
        Intent.ACTION_VIEW -> data
        else -> null
    }
}

@Suppress("DEPRECATION")
private fun Intent.sharedStreamUri(): Uri? {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
    } else {
        getParcelableExtra(Intent.EXTRA_STREAM)
    }
}

@Suppress("DEPRECATION")
private fun Intent.sharedStreamUris(): List<Uri> {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java).orEmpty()
    } else {
        getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM).orEmpty()
    }
}

private fun Intent.firstClipUri(): Uri? {
    return clipData?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.uri
}

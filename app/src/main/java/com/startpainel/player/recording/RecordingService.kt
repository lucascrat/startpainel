package com.startpainel.player.recording

import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import java.io.File

/**
 * Serviço simples (não-foreground) de gravação ao vivo.
 * Para automaticamente quando o app vai para segundo plano ou é encerrado.
 */
class RecordingService : Service() {

    companion object {
        const val ACTION_START   = "com.startpainel.player.recording.START"
        const val ACTION_STOP    = "com.startpainel.player.recording.STOP"

        const val EXTRA_STREAM_ID   = "streamId"
        const val EXTRA_STREAM_URL  = "streamUrl"
        const val EXTRA_TITLE       = "title"
        const val EXTRA_LOGO_URL    = "logoUrl"
        const val EXTRA_OUTPUT_PATH = "outputPath"

        fun startIntent(
            ctx: Context,
            streamId: Int,
            streamUrl: String,
            title: String,
            logoUrl: String?,
            outputFile: File
        ): Intent = Intent(ctx, RecordingService::class.java).apply {
            action = ACTION_START
            putExtra(EXTRA_STREAM_ID,    streamId)
            putExtra(EXTRA_STREAM_URL,   streamUrl)
            putExtra(EXTRA_TITLE,        title)
            putExtra(EXTRA_LOGO_URL,     logoUrl)
            putExtra(EXTRA_OUTPUT_PATH,  outputFile.absolutePath)
        }

        fun stopIntent(ctx: Context): Intent =
            Intent(ctx, RecordingService::class.java).apply { action = ACTION_STOP }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                val streamId   = intent.getIntExtra(EXTRA_STREAM_ID, -1)
                val streamUrl  = intent.getStringExtra(EXTRA_STREAM_URL) ?: return START_NOT_STICKY
                val title      = intent.getStringExtra(EXTRA_TITLE) ?: "Canal"
                val logoUrl    = intent.getStringExtra(EXTRA_LOGO_URL)
                val outputPath = intent.getStringExtra(EXTRA_OUTPUT_PATH) ?: return START_NOT_STICKY
                RecordingManager.start(
                    streamId   = streamId,
                    streamUrl  = streamUrl,
                    title      = title,
                    logoUrl    = logoUrl,
                    outputFile = File(outputPath)
                )
            }
            ACTION_STOP -> {
                RecordingManager.stop()
                stopSelf()
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        // Garante que a gravação para se o serviço for destruído pelo sistema
        RecordingManager.stop()
        super.onDestroy()
    }
}

package com.startpainel.player

import android.content.res.Configuration
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.startpainel.player.data.remote.M3uLeaseManager
import com.startpainel.player.navigation.PainelNavGraph
import com.startpainel.player.ui.player.PipController
import com.startpainel.player.ui.theme.PainelTheme
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            PainelTheme {
                PainelNavGraph()
            }
        }
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (PipController.isPlayerOpen) {
            PipController.enterPip(this)
        }
    }

    override fun onPictureInPictureModeChanged(isInPipMode: Boolean, newConfig: Configuration) {
        super.onPictureInPictureModeChanged(isInPipMode, newConfig)
        PipController.onPipModeChanged(isInPipMode)
    }

    override fun onStop() {
        super.onStop()
        // Quando o app vai para background (Home, troca de app, recentes):
        // Para o heartbeat para não manter lease "ocupada" com ninguém assistindo.
        // A lease expira automaticamente no servidor após 5 min sem heartbeat.
        // (não interrompe em rotação de tela — isChangingConfigurations cobre isso)
        if (!isChangingConfigurations && !isFinishing) {
            M3uLeaseManager.stop()
        }
    }

    override fun onStart() {
        super.onStart()
        // Quando o app volta do background, retoma o heartbeat para manter a lease viva.
        if (M3uLeaseManager.hasActiveLease) {
            M3uLeaseManager.resumeHeartbeat()
        }
    }

    override fun onDestroy() {
        // Libera a lease M3U quando o app é fechado definitivamente.
        // Usa runBlocking para bloquear a thread principal até a request HTTP ser enviada —
        // sem isso, o Android mata o processo antes da coroutine fire-and-forget completar.
        // Timeout de 3s evita ANR (limite do sistema é 5s para activities).
        if (!isChangingConfigurations) {
            runBlocking {
                withTimeoutOrNull(3_000L) {
                    M3uLeaseManager.releaseSync()
                }
            }
        }
        super.onDestroy()
    }
}

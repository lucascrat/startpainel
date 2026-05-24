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

    override fun onDestroy() {
        // Libera a lease M3U quando o app é fechado definitivamente
        // (não em rotação de tela — isChangingConfigurations cobre isso)
        if (!isChangingConfigurations) {
            M3uLeaseManager.release()
        }
        super.onDestroy()
    }
}

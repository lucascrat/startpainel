package com.startpainel.player

import android.app.Application
import com.startpainel.player.ads.AdsInitializer

class PainelApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // Pre-warm singletons so the first screen load is snappier.
        ServiceLocator.credentialsStore(this)
        ServiceLocator.repository()
        // Inicializa o AdMob (em background) e pré-carrega o intersticial.
        AdsInitializer.init(this)
    }
}

package com.startpainel.player.ads

import android.content.Context
import android.util.Log
import com.google.android.gms.ads.MobileAds
import com.google.android.gms.ads.RequestConfiguration
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Inicializa o SDK do AdMob uma única vez.
 * Otimizações de receita:
 *  - Inicialização em background (não trava o app)
 *  - Pré-carrega o primeiro intersticial assim que o SDK fica pronto
 */
object AdsInitializer {
    private const val TAG = "AdsInitializer"
    private val initialized = AtomicBoolean(false)

    fun init(context: Context) {
        if (!initialized.compareAndSet(false, true)) return
        val appCtx = context.applicationContext

        // Configuração de conteúdo: maximiza preenchimento mantendo conformidade.
        MobileAds.setRequestConfiguration(
            RequestConfiguration.Builder()
                .setMaxAdContentRating(RequestConfiguration.MAX_AD_CONTENT_RATING_T)
                .build()
        )

        MobileAds.initialize(appCtx) {
            Log.d(TAG, "AdMob inicializado")
            // Intersticial removido — apenas banner e nativo são usados.
        }
    }
}

package com.startpainel.player.ads

import android.content.res.Configuration
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.AdSize
import com.google.android.gms.ads.AdView

/**
 * Banner ADAPTATIVO ancorado — ocupa a largura disponível e escolhe a melhor
 * altura, gerando mais receita que o banner fixo. Recomendado pelo AdMob.
 */
@Composable
fun AdmobBanner(
    modifier: Modifier = Modifier,
    adUnitId: String = AdIds.BANNER,
) {
    val context = LocalContext.current
    val configuration: Configuration = LocalConfiguration.current
    val adWidthDp = configuration.screenWidthDp

    val adView = remember {
        AdView(context).apply {
            setAdSize(
                AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(context, adWidthDp)
            )
            this.adUnitId = adUnitId
            loadAd(AdRequest.Builder().build())
        }
    }

    AndroidView(
        modifier = modifier.fillMaxWidth(),
        factory = { adView }
    )
}

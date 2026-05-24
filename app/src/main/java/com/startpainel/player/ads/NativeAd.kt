package com.startpainel.player.ads

import android.view.LayoutInflater
import android.widget.Button
import android.widget.ImageView
import android.widget.TextView
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import com.google.android.gms.ads.AdListener
import com.google.android.gms.ads.AdLoader
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.nativead.NativeAd
import com.google.android.gms.ads.nativead.NativeAdView
import com.startpainel.player.R

/**
 * Anúncio NATIVO renderizado no layout do app (native_ad_card.xml).
 * Mistura-se ao conteúdo e tem alto engajamento → boa receita.
 * Carrega 1 anúncio e cuida do ciclo de vida (destroy ao sair da tela).
 */
@Composable
fun AdmobNativeCard(
    modifier: Modifier = Modifier,
    adUnitId: String = AdIds.NATIVE,
) {
    val context = LocalContext.current
    var nativeAd by remember { mutableStateOf<NativeAd?>(null) }

    DisposableEffect(adUnitId) {
        val loader = AdLoader.Builder(context, adUnitId)
            .forNativeAd { ad ->
                // Evita vazamento se um novo chegar
                nativeAd?.destroy()
                nativeAd = ad
            }
            .withAdListener(object : AdListener() {
                override fun onAdFailedToLoad(error: LoadAdError) {
                    nativeAd = null
                }
            })
            .build()
        loader.loadAd(AdRequest.Builder().build())

        onDispose {
            nativeAd?.destroy()
            nativeAd = null
        }
    }

    val ad = nativeAd ?: return

    AndroidView(
        modifier = modifier.fillMaxWidth(),
        factory = { ctx ->
            val view = LayoutInflater.from(ctx)
                .inflate(R.layout.native_ad_card, null) as NativeAdView
            bindNativeAd(ad, view)
            view
        },
        update = { view -> bindNativeAd(ad, view) }
    )
}

private fun bindNativeAd(ad: NativeAd, adView: NativeAdView) {
    val headline = adView.findViewById<TextView>(R.id.ad_headline)
    val body = adView.findViewById<TextView>(R.id.ad_body)
    val cta = adView.findViewById<Button>(R.id.ad_call_to_action)
    val icon = adView.findViewById<ImageView>(R.id.ad_app_icon)
    val advertiser = adView.findViewById<TextView>(R.id.ad_advertiser)
    val media = adView.findViewById<com.google.android.gms.ads.nativead.MediaView>(R.id.ad_media)

    // Headline (obrigatório)
    headline.text = ad.headline
    adView.headlineView = headline

    // Mídia
    adView.mediaView = media
    ad.mediaContent?.let { media.mediaContent = it }

    // Corpo
    if (ad.body == null) {
        body.visibility = android.view.View.GONE
    } else {
        body.visibility = android.view.View.VISIBLE
        body.text = ad.body
        adView.bodyView = body
    }

    // CTA
    if (ad.callToAction == null) {
        cta.visibility = android.view.View.GONE
    } else {
        cta.visibility = android.view.View.VISIBLE
        cta.text = ad.callToAction
        adView.callToActionView = cta
    }

    // Ícone
    if (ad.icon == null) {
        icon.visibility = android.view.View.GONE
    } else {
        icon.visibility = android.view.View.VISIBLE
        icon.setImageDrawable(ad.icon?.drawable)
        adView.iconView = icon
    }

    // Anunciante
    if (ad.advertiser == null) {
        advertiser.visibility = android.view.View.GONE
    } else {
        advertiser.visibility = android.view.View.VISIBLE
        advertiser.text = ad.advertiser
        adView.advertiserView = advertiser
    }

    adView.setNativeAd(ad)
}

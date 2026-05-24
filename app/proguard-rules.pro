# Keep Retrofit interface methods + their signatures
-keep,allowobfuscation,allowshrinking interface retrofit2.Call
-keep,allowobfuscation,allowshrinking class retrofit2.Response

# kotlinx.serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keep,includedescriptorclasses class com.startpainel.player.**$$serializer { *; }
-keepclassmembers class com.startpainel.player.** {
    *** Companion;
}
-keepclasseswithmembers class com.startpainel.player.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Media3
-keep class androidx.media3.** { *; }

# AdMob / Google Mobile Ads — classes do Android 15 (API 35) referenciadas pelo SDK
# mas indisponíveis no compileSdk 34. Suprime avisos do R8.
-dontwarn android.media.LoudnessCodecController
-dontwarn android.media.LoudnessCodecController$OnLoudnessCodecUpdateListener
-keep class com.google.android.gms.ads.** { *; }
-keep public class com.google.android.gms.ads.nativead.** { *; }

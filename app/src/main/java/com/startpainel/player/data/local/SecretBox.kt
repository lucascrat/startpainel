package com.startpainel.player.data.local

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Criptografia simétrica dos dados sensíveis em repouso (credenciais da lista + URL M3U).
 *
 * - API 23+ : chave AES-256 gerada e guardada no Android Keystore — a chave NUNCA sai do
 *   hardware seguro do aparelho, então mesmo num celular com root a lista M3U não pode ser
 *   extraída em texto puro do DataStore.
 * - API <23 : fallback sem criptografia (marcador "v0:") — apenas para aparelhos muito antigos
 *   que não têm Keystore para AES.
 *
 * Formato armazenado:
 *   "v1:" + Base64(IV(12 bytes) || ciphertext+tag)   → criptografado (Keystore)
 *   "v0:" + texto                                     → fallback (sem Keystore)
 *   (sem prefixo)                                     → dado legado pré-atualização → decrypt
 *                                                        retorna null, forçando novo login uma vez.
 */
object SecretBox {
    private const val ALIAS = "startpainel_creds_key_v1"
    private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val IV_LEN = 12
    private const val TAG_BITS = 128
    private const val P_ENC = "v1:"
    private const val P_PLAIN = "v0:"

    private val keystoreSupported get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M

    private fun getOrCreateKey(): SecretKey {
        val ks = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (ks.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        kg.init(
            KeyGenParameterSpec.Builder(
                ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return kg.generateKey()
    }

    /** Criptografa um texto para armazenamento. Nunca lança — cai no fallback se algo falhar. */
    fun encrypt(plain: String): String {
        if (!keystoreSupported) return P_PLAIN + plain
        return try {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
            val iv = cipher.iv
            val ct = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
            val out = ByteArray(iv.size + ct.size)
            System.arraycopy(iv, 0, out, 0, iv.size)
            System.arraycopy(ct, 0, out, iv.size, ct.size)
            P_ENC + Base64.encodeToString(out, Base64.NO_WRAP)
        } catch (_: Exception) {
            P_PLAIN + plain
        }
    }

    /** Descriptografa. Retorna null se o valor for ilegível ou legado (força novo login). */
    fun decrypt(stored: String?): String? {
        if (stored.isNullOrEmpty()) return null
        return when {
            stored.startsWith(P_ENC) -> try {
                val raw = Base64.decode(stored.substring(P_ENC.length), Base64.NO_WRAP)
                if (raw.size <= IV_LEN) return null
                val iv = raw.copyOfRange(0, IV_LEN)
                val ct = raw.copyOfRange(IV_LEN, raw.size)
                val cipher = Cipher.getInstance(TRANSFORMATION)
                cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(TAG_BITS, iv))
                String(cipher.doFinal(ct), Charsets.UTF_8)
            } catch (_: Exception) {
                null
            }
            stored.startsWith(P_PLAIN) -> stored.substring(P_PLAIN.length)
            else -> null // dado legado em texto puro (pré-criptografia) → re-login
        }
    }
}

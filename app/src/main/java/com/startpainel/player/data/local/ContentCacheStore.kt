package com.startpainel.player.data.local

import android.content.Context
import com.startpainel.player.data.remote.dto.Category
import com.startpainel.player.data.remote.dto.LiveStream
import com.startpainel.player.data.remote.dto.SeriesStream
import com.startpainel.player.data.remote.dto.VodStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File

/**
 * Conteúdo completo do app salvo localmente (JSON em arquivo).
 * O app carrega DESTE cache na abertura (instantâneo, sem rede) e só busca
 * conteúdo novo do servidor quando o usuário clica em "Atualizar conteúdo".
 */
@Serializable
data class CachedContent(
    val accountKey: String,                      // dns|username — invalida cache se trocar de conta
    val savedAt: Long = System.currentTimeMillis(),
    val live: List<LiveStream> = emptyList(),
    val movies: List<VodStream> = emptyList(),
    val series: List<SeriesStream> = emptyList(),
    val liveCategories: List<Category> = emptyList(),
    val movieCategories: List<Category> = emptyList(),
    val seriesCategories: List<Category> = emptyList()
)

class ContentCacheStore(context: Context) {

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val file = File(context.filesDir, "content_cache.json")

    suspend fun save(content: CachedContent) = withContext(Dispatchers.IO) {
        try {
            file.writeText(json.encodeToString(content))
        } catch (_: Exception) { /* cache é best-effort */ }
    }

    /** Carrega o cache se existir E for da mesma conta. Senão null. */
    suspend fun load(accountKey: String): CachedContent? = withContext(Dispatchers.IO) {
        try {
            if (!file.exists()) return@withContext null
            val cached = json.decodeFromString<CachedContent>(file.readText())
            if (cached.accountKey != accountKey) null else cached
        } catch (_: Exception) {
            null
        }
    }

    suspend fun clear() = withContext(Dispatchers.IO) {
        try { if (file.exists()) file.delete() } catch (_: Exception) {}
    }
}

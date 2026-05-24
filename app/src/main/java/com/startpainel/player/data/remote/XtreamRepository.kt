package com.startpainel.player.data.remote

import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import com.startpainel.player.data.model.Account
import com.startpainel.player.data.remote.dto.AuthResponse
import com.startpainel.player.data.remote.dto.Category
import com.startpainel.player.data.remote.dto.Episode
import com.startpainel.player.data.remote.dto.LiveStream
import com.startpainel.player.data.remote.dto.SeriesInfoResponse
import com.startpainel.player.data.remote.dto.SeriesStream
import com.startpainel.player.data.remote.dto.VodInfoResponse
import com.startpainel.player.data.remote.dto.VodStream
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonArray
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Response
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import java.util.concurrent.TimeUnit

/** Retries on transient server/proxy errors (523, 502, 503, 504) with linear backoff. */
private class RetryInterceptor(private val maxAttempts: Int = 3) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        var response = chain.proceed(request)
        var attempt = 0
        while (response.code in TRANSIENT_CODES && attempt < maxAttempts) {
            response.close()
            attempt++
            Thread.sleep(1_000L * attempt) // 1 s, 2 s, 3 s
            response = chain.proceed(request)
        }
        return response
    }
    companion object {
        private val TRANSIENT_CODES = setOf(502, 503, 504, 523, 524, 530)
    }
}

class XtreamRepository {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
        explicitNulls = false
    }

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .addInterceptor(RetryInterceptor())
        .addInterceptor(HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        })
        .build()

    @Volatile private var current: Pair<Account, XtreamApi>? = null

    private fun api(account: Account): XtreamApi {
        current?.let { (a, api) -> if (a == account) return api }
        val baseUrl = if (account.normalizedDns.endsWith("/")) account.normalizedDns
        else account.normalizedDns + "/"
        val retrofit = Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
        val api = retrofit.create(XtreamApi::class.java)
        current = account to api
        return api
    }

    suspend fun login(account: Account): Result<AuthResponse> = runCatching {
        val res = api(account).authenticate(account.username, account.password)
        check(res.userInfo?.auth == 1 && res.userInfo.status.equals("Active", ignoreCase = true)) {
            "Credenciais inválidas ou conta inativa."
        }
        res
    }

    suspend fun liveCategories(a: Account): Result<List<Category>> =
        runCatching { api(a).liveCategories(a.username, a.password) }

    suspend fun liveStreams(a: Account, categoryId: String? = null): Result<List<LiveStream>> =
        runCatching { api(a).liveStreams(a.username, a.password, categoryId) }

    suspend fun vodCategories(a: Account): Result<List<Category>> =
        runCatching { api(a).vodCategories(a.username, a.password) }

    suspend fun vodStreams(a: Account, categoryId: String? = null): Result<List<VodStream>> =
        runCatching { api(a).vodStreams(a.username, a.password, categoryId) }

    suspend fun vodInfo(a: Account, vodId: Int): Result<VodInfoResponse> =
        runCatching { api(a).vodInfo(a.username, a.password, vodId) }

    suspend fun seriesCategories(a: Account): Result<List<Category>> =
        runCatching { api(a).seriesCategories(a.username, a.password) }

    suspend fun seriesList(a: Account, categoryId: String? = null): Result<List<SeriesStream>> =
        runCatching { api(a).seriesList(a.username, a.password, categoryId) }

    suspend fun seriesInfo(a: Account, seriesId: Int): Result<SeriesInfoResponse> =
        runCatching { api(a).seriesInfo(a.username, a.password, seriesId) }

    /**
     * Xtream returns `episodes` as a map keyed by season number → list of episodes.
     * Decode that on demand into a typed map.
     */
    fun parseEpisodes(response: SeriesInfoResponse): Map<Int, List<Episode>> {
        val element = response.episodes ?: return emptyMap()
        val obj = element as? JsonObject ?: return emptyMap()
        return obj.entries.mapNotNull { (key, value) ->
            val season = key.toIntOrNull() ?: return@mapNotNull null
            val arr = value as? JsonArray ?: return@mapNotNull null
            val episodes = arr.mapNotNull { ep ->
                runCatching { json.decodeFromJsonElement(Episode.serializer(), ep) }.getOrNull()
            }
            season to episodes
        }.toMap().toSortedMap()
    }
}

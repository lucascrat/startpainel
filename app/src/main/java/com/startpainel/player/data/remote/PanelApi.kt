package com.startpainel.player.data.remote

import com.startpainel.player.data.remote.dto.M3uAccessRequest
import com.startpainel.player.data.remote.dto.M3uAccessResponse
import com.startpainel.player.data.remote.dto.M3uLeaseActionRequest
import com.startpainel.player.data.remote.dto.PanelLoginRequest
import com.startpainel.player.data.remote.dto.PanelLoginResponse
import com.startpainel.player.data.remote.dto.SettingResponse
import kotlinx.serialization.Serializable
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

@Serializable
data class AppLogoutRequest(
    val username: String,
    val device_id: String,
)

interface PanelApi {
    @POST("api/app/login")
    suspend fun login(@Body request: PanelLoginRequest): PanelLoginResponse

    @POST("api/app/logout")
    suspend fun logout(@Body request: AppLogoutRequest): Response<Unit>

    @GET("api/settings/{key}")
    suspend fun getSetting(@Path("key") key: String): SettingResponse

    // ── Pool M3U ──────────────────────────────────────────────────────────────

    /** Acessa uma lista do pool com um código. Retorna credenciais Xtream se URL compatível. */
    @POST("api/m3u/access")
    suspend fun m3uAccess(@Body request: M3uAccessRequest): M3uAccessResponse

    /** Renova o heartbeat da lease (manter lista reservada). */
    @POST("api/m3u/heartbeat")
    suspend fun m3uHeartbeat(@Body request: M3uLeaseActionRequest): Response<Unit>

    /** Libera a lista de volta ao pool. */
    @POST("api/m3u/release")
    suspend fun m3uRelease(@Body request: M3uLeaseActionRequest): Response<Unit>
}

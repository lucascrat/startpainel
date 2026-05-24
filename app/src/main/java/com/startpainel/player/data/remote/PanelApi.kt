package com.startpainel.player.data.remote

import com.startpainel.player.data.remote.dto.M3uAccessRequest
import com.startpainel.player.data.remote.dto.M3uAccessResponse
import com.startpainel.player.data.remote.dto.M3uLeaseActionRequest
import com.startpainel.player.data.remote.dto.PanelLoginRequest
import com.startpainel.player.data.remote.dto.PanelLoginResponse
import com.startpainel.player.data.remote.dto.SettingResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

interface PanelApi {
    @POST("api/app/login")
    suspend fun login(@Body request: PanelLoginRequest): PanelLoginResponse

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

package com.startpainel.player.data.remote.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class M3uAccessResponse(
    val success: Boolean = false,
    @SerialName("lease_id") val leaseId: Int? = null,
    @SerialName("m3u_url") val m3uUrl: String? = null,
    @SerialName("list_name") val listName: String? = null,
    val reused: Boolean? = null,
    /** Credenciais Xtream extraídas da URL M3U (se formato compatível) */
    val dns: String? = null,
    val username: String? = null,
    val password: String? = null,
    val error: String? = null,
    @SerialName("pool_exhausted") val poolExhausted: Boolean? = null,
)

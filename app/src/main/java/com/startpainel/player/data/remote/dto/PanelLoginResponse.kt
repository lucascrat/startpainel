package com.startpainel.player.data.remote.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class PanelLoginResponse(
    val ok: Boolean = false,
    val server: String? = null,
    val username: String? = null,
    val password: String? = null,
    val name: String? = null,
    @SerialName("expires_at") val expiresAt: String? = null,
    val error: String? = null
)

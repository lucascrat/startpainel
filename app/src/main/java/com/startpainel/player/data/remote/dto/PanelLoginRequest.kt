package com.startpainel.player.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class PanelLoginRequest(
    val username: String,
    val password: String
)

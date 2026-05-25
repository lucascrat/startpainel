package com.startpainel.player.data.remote.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class PanelLoginRequest(
    val username: String,
    val password: String,
    @SerialName("device_id")   val deviceId:   String? = null,
    @SerialName("device_name") val deviceName: String? = null,
    val force: Boolean = false,
)

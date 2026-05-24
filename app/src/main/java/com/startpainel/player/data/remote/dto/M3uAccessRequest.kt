package com.startpainel.player.data.remote.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class M3uAccessRequest(
    val code: String,
    @SerialName("device_id") val deviceId: String? = null
)

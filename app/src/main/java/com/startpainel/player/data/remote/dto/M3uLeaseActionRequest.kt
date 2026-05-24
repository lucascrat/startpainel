package com.startpainel.player.data.remote.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Usado tanto para heartbeat quanto para release (mesma estrutura). */
@Serializable
data class M3uLeaseActionRequest(
    val code: String,
    @SerialName("lease_id") val leaseId: Int
)

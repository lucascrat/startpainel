package com.startpainel.player.data.remote.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Category(
    @SerialName("category_id") @Serializable(with = FlexibleStringSerializer::class) val id: String? = null,
    @SerialName("category_name") val name: String? = null,
    @SerialName("parent_id") @Serializable(with = FlexibleIntSerializer::class) val parentId: Int? = null
)

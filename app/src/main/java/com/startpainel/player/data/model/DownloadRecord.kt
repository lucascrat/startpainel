package com.startpainel.player.data.model

import kotlinx.serialization.Serializable

@Serializable
data class DownloadRecord(
    val downloadId: Long,
    val streamId: Int,
    val title: String,
    val imageUrl: String? = null,
    val type: String = "movie",   // "movie" | "series"
    val localPath: String,
    val addedAt: Long = System.currentTimeMillis()
)

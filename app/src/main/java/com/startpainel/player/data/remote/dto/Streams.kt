package com.startpainel.player.data.remote.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class LiveStream(
    val num: Int? = null,
    val name: String? = null,
    @SerialName("stream_type") val streamType: String? = null,
    @SerialName("stream_id") @Serializable(with = FlexibleIntSerializer::class) val streamId: Int? = null,
    @SerialName("stream_icon") val streamIcon: String? = null,
    @SerialName("epg_channel_id") val epgChannelId: String? = null,
    @SerialName("category_id") @Serializable(with = FlexibleStringSerializer::class) val categoryId: String? = null,
    @SerialName("tv_archive") @Serializable(with = FlexibleIntSerializer::class) val tvArchive: Int? = null,
    @SerialName("tv_archive_duration") @Serializable(with = FlexibleIntSerializer::class) val tvArchiveDuration: Int? = null
)

@Serializable
data class VodStream(
    val num: Int? = null,
    val name: String? = null,
    @SerialName("stream_type") val streamType: String? = null,
    @SerialName("stream_id") @Serializable(with = FlexibleIntSerializer::class) val streamId: Int? = null,
    @SerialName("stream_icon") val streamIcon: String? = null,
    val rating: String? = null,
    @SerialName("rating_5based") val rating5based: Double? = null,
    @SerialName("category_id") @Serializable(with = FlexibleStringSerializer::class) val categoryId: String? = null,
    @SerialName("container_extension") val containerExtension: String? = null,
    @SerialName("added") val added: String? = null
)

@Serializable
data class SeriesStream(
    val num: Int? = null,
    val name: String? = null,
    @SerialName("series_id") @Serializable(with = FlexibleIntSerializer::class) val seriesId: Int? = null,
    val cover: String? = null,
    val plot: String? = null,
    val cast: String? = null,
    val director: String? = null,
    val genre: String? = null,
    val releaseDate: String? = null,
    @SerialName("last_modified") val lastModified: String? = null,
    val rating: String? = null,
    @SerialName("rating_5based") val rating5based: Double? = null,
    @SerialName("category_id") @Serializable(with = FlexibleStringSerializer::class) val categoryId: String? = null
)

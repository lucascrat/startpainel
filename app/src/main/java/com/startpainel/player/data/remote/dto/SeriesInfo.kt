package com.startpainel.player.data.remote.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

@Serializable
data class SeriesInfoResponse(
    val seasons: List<Season>? = null,
    val info: SeriesInfoDetails? = null,
    // Xtream returns "episodes" as a map { "1": [..], "2": [..] }. We parse it raw.
    val episodes: JsonElement? = null
)

@Serializable
data class SeriesInfoDetails(
    val name: String? = null,
    val cover: String? = null,
    val plot: String? = null,
    val cast: String? = null,
    val director: String? = null,
    val genre: String? = null,
    val releaseDate: String? = null,
    @SerialName("rating_5based") val rating5based: Double? = null,
    @SerialName("backdrop_path") val backdrops: List<String>? = null,
    @SerialName("youtube_trailer") val youtubeTrailer: String? = null,
    val episodeRunTime: String? = null,
    val category_id: String? = null
)

@Serializable
data class Season(
    @SerialName("air_date") val airDate: String? = null,
    @SerialName("episode_count") val episodeCount: Int? = null,
    val id: Int? = null,
    val name: String? = null,
    val overview: String? = null,
    @SerialName("season_number") val seasonNumber: Int? = null,
    val cover: String? = null,
    @SerialName("cover_big") val coverBig: String? = null
)

@Serializable
data class Episode(
    @SerialName("id") @Serializable(with = FlexibleStringSerializer::class) val id: String? = null,
    @SerialName("episode_num") @Serializable(with = FlexibleIntSerializer::class) val episodeNum: Int? = null,
    val title: String? = null,
    @SerialName("container_extension") val containerExtension: String? = null,
    val info: EpisodeInfo? = null,
    @SerialName("season") @Serializable(with = FlexibleIntSerializer::class) val season: Int? = null
)

@Serializable
data class EpisodeInfo(
    val plot: String? = null,
    val duration: String? = null,
    @SerialName("movie_image") val movieImage: String? = null,
    @SerialName("releaseDate") val releaseDate: String? = null
)

@Serializable
data class VodInfoResponse(
    @SerialName("movie_data") val movieData: VodMovieData? = null,
    val info: VodMovieInfo? = null
)

@Serializable
data class VodMovieData(
    @SerialName("stream_id") @Serializable(with = FlexibleIntSerializer::class) val streamId: Int? = null,
    val name: String? = null,
    @SerialName("container_extension") val containerExtension: String? = null
)

@Serializable
data class VodMovieInfo(
    val name: String? = null,
    @SerialName("movie_image") val movieImage: String? = null,
    val plot: String? = null,
    val cast: String? = null,
    val director: String? = null,
    val genre: String? = null,
    val releaseDate: String? = null,
    val rating: String? = null,
    val duration: String? = null,
    @SerialName("youtube_trailer") val youtubeTrailer: String? = null
)

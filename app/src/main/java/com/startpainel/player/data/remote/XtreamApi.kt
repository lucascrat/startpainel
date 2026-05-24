package com.startpainel.player.data.remote

import com.startpainel.player.data.remote.dto.AuthResponse
import com.startpainel.player.data.remote.dto.Category
import com.startpainel.player.data.remote.dto.LiveStream
import com.startpainel.player.data.remote.dto.SeriesInfoResponse
import com.startpainel.player.data.remote.dto.SeriesStream
import com.startpainel.player.data.remote.dto.VodInfoResponse
import com.startpainel.player.data.remote.dto.VodStream
import retrofit2.http.GET
import retrofit2.http.Query

interface XtreamApi {

    @GET("player_api.php")
    suspend fun authenticate(
        @Query("username") username: String,
        @Query("password") password: String
    ): AuthResponse

    // LIVE
    @GET("player_api.php?action=get_live_categories")
    suspend fun liveCategories(
        @Query("username") username: String,
        @Query("password") password: String
    ): List<Category>

    @GET("player_api.php?action=get_live_streams")
    suspend fun liveStreams(
        @Query("username") username: String,
        @Query("password") password: String,
        @Query("category_id") categoryId: String? = null
    ): List<LiveStream>

    // VOD (Filmes)
    @GET("player_api.php?action=get_vod_categories")
    suspend fun vodCategories(
        @Query("username") username: String,
        @Query("password") password: String
    ): List<Category>

    @GET("player_api.php?action=get_vod_streams")
    suspend fun vodStreams(
        @Query("username") username: String,
        @Query("password") password: String,
        @Query("category_id") categoryId: String? = null
    ): List<VodStream>

    @GET("player_api.php?action=get_vod_info")
    suspend fun vodInfo(
        @Query("username") username: String,
        @Query("password") password: String,
        @Query("vod_id") vodId: Int
    ): VodInfoResponse

    // SERIES
    @GET("player_api.php?action=get_series_categories")
    suspend fun seriesCategories(
        @Query("username") username: String,
        @Query("password") password: String
    ): List<Category>

    @GET("player_api.php?action=get_series")
    suspend fun seriesList(
        @Query("username") username: String,
        @Query("password") password: String,
        @Query("category_id") categoryId: String? = null
    ): List<SeriesStream>

    @GET("player_api.php?action=get_series_info")
    suspend fun seriesInfo(
        @Query("username") username: String,
        @Query("password") password: String,
        @Query("series_id") seriesId: Int
    ): SeriesInfoResponse
}

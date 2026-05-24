package com.startpainel.player.data.model

data class Account(
    val dns: String,
    val username: String,
    val password: String
) {
    val normalizedDns: String
        get() {
            val trimmed = dns.trim().trimEnd('/')
            return if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) trimmed
            else "http://$trimmed"
        }

    fun liveStreamUrl(streamId: Int, ext: String = "ts"): String =
        "$normalizedDns/live/$username/$password/$streamId.$ext"

    fun movieStreamUrl(streamId: Int, ext: String): String =
        "$normalizedDns/movie/$username/$password/$streamId.$ext"

    fun seriesStreamUrl(episodeId: Int, ext: String): String =
        "$normalizedDns/series/$username/$password/$episodeId.$ext"
}

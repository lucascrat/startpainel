package com.startpainel.player.ui.series

import android.app.Application
import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Environment
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.startpainel.player.ServiceLocator
import com.startpainel.player.data.model.Account
import com.startpainel.player.data.model.DownloadRecord
import com.startpainel.player.data.remote.dto.Episode
import com.startpainel.player.data.remote.dto.SeriesInfoDetails
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.File

data class SeriesDetailState(
    val loading: Boolean = true,
    val error: String? = null,
    val info: SeriesInfoDetails? = null,
    val seasons: List<Int> = emptyList(),
    val selectedSeason: Int? = null,
    val episodesBySeason: Map<Int, List<Episode>> = emptyMap(),
    val account: Account? = null,
    val downloads: List<DownloadRecord> = emptyList(),
    val downloadingIds: Set<Int> = emptySet()
)

class SeriesDetailViewModel(app: Application) : AndroidViewModel(app) {
    private val store = ServiceLocator.credentialsStore(app)
    private val repo = ServiceLocator.repository()
    private val downloadsStore = ServiceLocator.downloadsStore(app)

    private val _state = MutableStateFlow(SeriesDetailState())
    val state: StateFlow<SeriesDetailState> = _state.asStateFlow()

    init {
        // Observa todos os downloads e filtra os de séries
        viewModelScope.launch {
            downloadsStore.records.collect { list ->
                _state.update { it.copy(downloads = list.filter { r -> r.type == "series" }) }
            }
        }
    }

    fun load(seriesId: Int) {
        viewModelScope.launch {
            val acc = store.account.first()
            _state.update { it.copy(account = acc, loading = true, error = null) }
            if (acc == null) {
                _state.update { it.copy(loading = false, error = "Sessão expirada.") }
                return@launch
            }
            repo.seriesInfo(acc, seriesId)
                .onSuccess { response ->
                    val episodes = repo.parseEpisodes(response)
                    val seasons = episodes.keys.sorted()
                    _state.update {
                        it.copy(
                            loading = false,
                            info = response.info,
                            episodesBySeason = episodes,
                            seasons = seasons,
                            selectedSeason = seasons.firstOrNull()
                        )
                    }
                }
                .onFailure { e ->
                    _state.update { it.copy(loading = false, error = e.message) }
                }
        }
    }

    fun selectSeason(season: Int) {
        _state.update { it.copy(selectedSeason = season) }
    }

    // ── Download de episódios ────────────────────────────────────

    fun startDownload(episodeId: Int, ext: String, title: String, imageUrl: String?) {
        viewModelScope.launch {
            val app = getApplication<Application>()
            val acc = _state.value.account ?: return@launch
            val dm = app.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            val safeName = title.replace("[^a-zA-Z0-9 _-]".toRegex(), "").trim().take(60)
            val fileName = "${episodeId}_${safeName}.${ext}"
            val dir = app.getExternalFilesDir(Environment.DIRECTORY_MOVIES) ?: app.filesDir
            val destFile = File(dir, fileName)
            val url = acc.seriesStreamUrl(episodeId, ext)

            val request = DownloadManager.Request(Uri.parse(url)).apply {
                setTitle(title)
                setDescription("Startflix — baixando episódio")
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                setDestinationInExternalFilesDir(app, Environment.DIRECTORY_MOVIES, fileName)
                setAllowedOverMetered(true)
                setAllowedOverRoaming(false)
            }

            val downloadId = dm.enqueue(request)
            val record = DownloadRecord(
                downloadId = downloadId,
                streamId = episodeId,
                title = title,
                imageUrl = imageUrl,
                type = "series",
                localPath = destFile.absolutePath
            )
            downloadsStore.add(record)
            _state.update { it.copy(downloadingIds = it.downloadingIds + episodeId) }
        }
    }

    fun removeDownload(record: DownloadRecord) {
        viewModelScope.launch {
            val app = getApplication<Application>()
            val dm = app.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            dm.remove(record.downloadId)
            File(record.localPath).delete()
            downloadsStore.remove(record.downloadId)
        }
    }

    fun isDownloaded(episodeId: Int): Boolean =
        _state.value.downloads.any { it.streamId == episodeId && File(it.localPath).exists() }

    fun isDownloading(episodeId: Int): Boolean =
        _state.value.downloadingIds.contains(episodeId)

    fun getDownloadRecord(episodeId: Int): DownloadRecord? =
        _state.value.downloads.firstOrNull { it.streamId == episodeId }
}

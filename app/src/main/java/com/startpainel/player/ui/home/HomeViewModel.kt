package com.startpainel.player.ui.home

import android.app.Application
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Environment
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.startpainel.player.ServiceLocator
import com.startpainel.player.data.local.CachedContent
import com.startpainel.player.data.model.Account
import com.startpainel.player.data.model.DownloadRecord
import com.startpainel.player.data.model.RecordingRecord
import com.startpainel.player.data.remote.dto.Category
import com.startpainel.player.data.remote.dto.LiveStream
import com.startpainel.player.data.remote.dto.SeriesStream
import com.startpainel.player.data.remote.dto.VodStream
import com.startpainel.player.recording.ActiveRecording
import com.startpainel.player.recording.RecordingManager
import com.startpainel.player.recording.RecordingService
import com.startpainel.player.ui.components.HeroItem
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

enum class Tab { Home, Live, Movies, Series, Search, Downloads, Recordings }

private val ADULT_KEYWORDS = listOf(
    "adulto", "adultos", "adult", "adults", "+18", "18+", "xxx",
    "porno", "porn", "erotico", "erótico", "erotic", "sexy", "sex"
)

fun isAdultCategory(name: String): Boolean {
    val lower = name.lowercase()
    return ADULT_KEYWORDS.any { lower.contains(it) }
}

data class SectionState(
    val loading: Boolean = false,
    val error: String? = null,
    val categories: List<Category> = emptyList(),
    val selectedCategoryId: String? = null,
    val liveStreams: List<LiveStream> = emptyList(),
    val vodStreams: List<VodStream> = emptyList(),
    val seriesStreams: List<SeriesStream> = emptyList(),
    val query: String = ""
)

data class HomeUiState(
    val account: Account? = null,
    val tab: Tab = Tab.Home,
    val heroLoading: Boolean = true,
    val hero: HeroItem? = null,
    val live: SectionState = SectionState(),
    val movies: SectionState = SectionState(),
    val series: SectionState = SectionState(),
    val searchQuery: String = "",
    val searchResults: SearchResults = SearchResults(),
    val adultUnlocked: Boolean = false,
    val downloads: List<DownloadRecord> = emptyList(),
    val downloadingIds: Set<Int> = emptySet(),
    val isRefreshing: Boolean = false,
    // ── Gravação ao vivo ───────────────────────────────────────
    val activeRecording: ActiveRecording? = null,
    val recordings: List<RecordingRecord> = emptyList()
)

data class SearchResults(
    val live: List<LiveStream> = emptyList(),
    val movies: List<VodStream> = emptyList(),
    val series: List<SeriesStream> = emptyList(),
    val loading: Boolean = false
)

class HomeViewModel(app: Application) : AndroidViewModel(app) {

    private val store = ServiceLocator.credentialsStore(app)
    private val repo  = ServiceLocator.repository()
    private val downloadsStore = ServiceLocator.downloadsStore(app)
    private val recordingsStore = ServiceLocator.recordingsStore(app)
    private val contentCache = ServiceLocator.contentCache(app)

    private val _state = MutableStateFlow(HomeUiState())
    val state: StateFlow<HomeUiState> = _state.asStateFlow()

    // Listas COMPLETAS (sem filtro de categoria) — usadas pra filtrar por categoria
    // localmente, sem ir à rede. Preenchidas do cache ou do refresh.
    private var allLive: List<LiveStream> = emptyList()
    private var allMovies: List<VodStream> = emptyList()
    private var allSeries: List<SeriesStream> = emptyList()

    private fun accountKey(acc: Account): String = "${acc.normalizedDns}|${acc.username}"

    init {
        viewModelScope.launch {
            val acc = store.account.first()
            _state.update { it.copy(account = acc) }
            if (acc != null) {
                // 1. Tenta carregar do cache local (instantâneo, sem rede)
                val cached = contentCache.load(accountKey(acc))
                if (cached != null) {
                    applyContent(
                        cached.live, cached.movies, cached.series,
                        cached.liveCategories, cached.movieCategories, cached.seriesCategories
                    )
                } else {
                    // 2. Sem cache (primeira vez) — busca da rede e salva
                    loadAll(acc, persist = true)
                }
            }
        }
        viewModelScope.launch {
            downloadsStore.records.collect { list ->
                _state.update { it.copy(downloads = list) }
            }
        }
        // Observa gravações salvas
        viewModelScope.launch {
            recordingsStore.records.collect { list ->
                _state.update { it.copy(recordings = list) }
            }
        }
        // Observa estado ativo de gravação (do singleton RecordingManager)
        viewModelScope.launch {
            RecordingManager.active.collect { active ->
                _state.update { it.copy(activeRecording = active) }
            }
        }
    }

    /** Aplica conteúdo (do cache ou da rede) ao estado e guarda as listas completas. */
    private fun applyContent(
        live: List<LiveStream>,
        movies: List<VodStream>,
        series: List<SeriesStream>,
        liveCats: List<Category>,
        movieCats: List<Category>,
        seriesCats: List<Category>
    ) {
        allLive = live
        allMovies = movies
        allSeries = series
        val hero = pickHero(movies, series, live)
        _state.update { s ->
            s.copy(
                heroLoading = false,
                hero = hero,
                live = s.live.copy(liveStreams = live, categories = liveCats, loading = false, selectedCategoryId = null),
                movies = s.movies.copy(vodStreams = movies, categories = movieCats, loading = false, selectedCategoryId = null),
                series = s.series.copy(seriesStreams = series, categories = seriesCats, loading = false, selectedCategoryId = null)
            )
        }
    }

    /** Busca TODO o conteúdo da rede. Se [persist], salva no cache local. */
    private fun loadAll(acc: Account, persist: Boolean) {
        viewModelScope.launch {
            _state.update { it.copy(heroLoading = it.hero == null, isRefreshing = true) }

            val liveDeferred   = async { repo.liveStreams(acc) }
            val moviesDeferred = async { repo.vodStreams(acc) }
            val seriesDeferred = async { repo.seriesList(acc) }
            val liveCats       = async { repo.liveCategories(acc) }
            val movieCats      = async { repo.vodCategories(acc) }
            val seriesCats     = async { repo.seriesCategories(acc) }

            val live   = liveDeferred.await().getOrElse { emptyList() }
            val movies = moviesDeferred.await().getOrElse { emptyList() }
            val series = seriesDeferred.await().getOrElse { emptyList() }
            val lCats  = liveCats.await().getOrElse { emptyList() }
            val mCats  = movieCats.await().getOrElse { emptyList() }
            val sCats  = seriesCats.await().getOrElse { emptyList() }

            applyContent(live, movies, series, lCats, mCats, sCats)
            _state.update { it.copy(isRefreshing = false) }

            // Salva no cache pra próxima abertura não precisar de rede
            if (persist && (live.isNotEmpty() || movies.isNotEmpty() || series.isNotEmpty())) {
                contentCache.save(
                    CachedContent(
                        accountKey = accountKey(acc),
                        live = live, movies = movies, series = series,
                        liveCategories = lCats, movieCategories = mCats, seriesCategories = sCats
                    )
                )
            }
        }
    }

    /** Chamado pelo botão "Atualizar conteúdo" — única forma de buscar conteúdo novo. */
    fun refreshContent() {
        val acc = _state.value.account ?: return
        loadAll(acc, persist = true)
    }

    private fun pickHero(movies: List<VodStream>, series: List<SeriesStream>, live: List<LiveStream>): HeroItem? {
        val fromMovie = movies.firstOrNull { !it.streamIcon.isNullOrBlank() }
        if (fromMovie != null) return HeroItem(fromMovie.name.orEmpty(), fromMovie.streamIcon, null, fromMovie.rating)
        val fromSeries = series.firstOrNull { !it.cover.isNullOrBlank() }
        if (fromSeries != null) return HeroItem(fromSeries.name.orEmpty(), fromSeries.cover, fromSeries.genre, fromSeries.rating)
        val fromLive = live.firstOrNull { !it.streamIcon.isNullOrBlank() }
        if (fromLive != null) return HeroItem(fromLive.name.orEmpty(), fromLive.streamIcon, null, null, isLive = true)
        return null
    }

    fun selectTab(tab: Tab) = _state.update { it.copy(tab = tab) }

    fun selectCategory(section: Tab, categoryId: String?) {
        // Filtra LOCALMENTE a partir das listas completas (cache) — sem rede.
        when (section) {
            Tab.Live -> {
                val list = if (categoryId == null) allLive else allLive.filter { it.categoryId == categoryId }
                _state.update { it.copy(live = it.live.copy(selectedCategoryId = categoryId, liveStreams = list, loading = false)) }
            }
            Tab.Movies -> {
                val list = if (categoryId == null) allMovies else allMovies.filter { it.categoryId == categoryId }
                _state.update { it.copy(movies = it.movies.copy(selectedCategoryId = categoryId, vodStreams = list, loading = false)) }
            }
            Tab.Series -> {
                val list = if (categoryId == null) allSeries else allSeries.filter { it.categoryId == categoryId }
                _state.update { it.copy(series = it.series.copy(selectedCategoryId = categoryId, seriesStreams = list, loading = false)) }
            }
            else -> {}
        }
    }

    fun setQuery(section: Tab, query: String) {
        when (section) {
            Tab.Live   -> _state.update { it.copy(live   = it.live.copy(query = query)) }
            Tab.Movies -> _state.update { it.copy(movies = it.movies.copy(query = query)) }
            Tab.Series -> _state.update { it.copy(series = it.series.copy(query = query)) }
            else -> {}
        }
    }

    fun setSearchQuery(query: String) {
        _state.update { it.copy(searchQuery = query) }
        if (query.isBlank()) { _state.update { it.copy(searchResults = SearchResults()) }; return }
        _state.update { it.copy(searchResults = SearchResults(loading = true)) }
        viewModelScope.launch {
            val q = query.lowercase()
            // Busca nas listas COMPLETAS (não nas filtradas por categoria)
            _state.update { st ->
                st.copy(searchResults = SearchResults(
                    live   = allLive.filter { it.name?.lowercase()?.contains(q) == true },
                    movies = allMovies.filter { it.name?.lowercase()?.contains(q) == true },
                    series = allSeries.filter { it.name?.lowercase()?.contains(q) == true },
                    loading = false
                ))
            }
        }
    }

    fun retry() {
        val acc = _state.value.account ?: return
        loadAll(acc, persist = true)
    }

    fun logout() {
        viewModelScope.launch {
            store.clear()
            contentCache.clear()   // limpa cache pra próxima conta não herdar conteúdo
            allLive = emptyList(); allMovies = emptyList(); allSeries = emptyList()
            _state.update { HomeUiState() }
        }
    }

    // ── Adult content ──────────────────────────────────────────

    fun unlockAdult() {
        _state.update { it.copy(adultUnlocked = true) }
    }

    // ── Downloads ──────────────────────────────────────────────

    fun startDownload(
        streamId: Int,
        title: String,
        imageUrl: String?,
        url: String,
        ext: String,
        type: String
    ) {
        viewModelScope.launch {
            val app = getApplication<Application>()
            val dm = app.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            val safeName = title.replace("[^a-zA-Z0-9 _-]".toRegex(), "").trim().take(60)
            val fileName = "${streamId}_${safeName}.${ext}"
            val dir = app.getExternalFilesDir(Environment.DIRECTORY_MOVIES) ?: app.filesDir
            val destFile = File(dir, fileName)

            val request = DownloadManager.Request(Uri.parse(url)).apply {
                setTitle(title)
                setDescription("Startflix — baixando")
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                setDestinationInExternalFilesDir(app, Environment.DIRECTORY_MOVIES, fileName)
                setAllowedOverMetered(true)
                setAllowedOverRoaming(false)
            }

            val downloadId = dm.enqueue(request)
            val record = DownloadRecord(
                downloadId = downloadId,
                streamId = streamId,
                title = title,
                imageUrl = imageUrl,
                type = type,
                localPath = destFile.absolutePath
            )
            downloadsStore.add(record)
            _state.update { it.copy(downloadingIds = it.downloadingIds + streamId) }
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

    fun getLocalFileUri(record: DownloadRecord): Uri? {
        val file = File(record.localPath)
        return if (file.exists()) Uri.fromFile(file) else null
    }

    fun isDownloaded(streamId: Int): Boolean =
        _state.value.downloads.any { it.streamId == streamId && File(it.localPath).exists() }

    fun isDownloading(streamId: Int): Boolean =
        _state.value.downloadingIds.contains(streamId)

    // ── Gravação ao vivo ───────────────────────────────────────

    fun startRecording(streamId: Int, title: String, logoUrl: String?) {
        val app = getApplication<Application>()
        val acc = _state.value.account ?: return
        val streamUrl = acc.liveStreamUrl(streamId, "ts")

        // Nome do arquivo: ChannelName_2026-05-22_14-30.ts
        val safeTitle = title.replace(Regex("[^a-zA-Z0-9_\\-]"), "_").take(40)
        val dateStr   = SimpleDateFormat("yyyy-MM-dd_HH-mm", Locale.ROOT).format(Date())
        val fileName  = "${safeTitle}_$dateStr.ts"
        val outputDir = app.getExternalFilesDir(Environment.DIRECTORY_MOVIES) ?: app.filesDir
        val outputFile = File(outputDir, fileName)

        val intent = RecordingService.startIntent(app, streamId, streamUrl, title, logoUrl, outputFile)
        app.startService(intent)
    }

    fun stopRecording() {
        val app = getApplication<Application>()
        val snapshot = RecordingManager.active.value ?: return

        // Para o serviço
        app.startService(RecordingService.stopIntent(app))

        // Salva o registro da gravação concluída
        viewModelScope.launch {
            val durationMs = System.currentTimeMillis() - snapshot.startedAt
            val sizeBytes  = if (snapshot.outputFile.exists()) snapshot.outputFile.length() else 0L
            if (sizeBytes > 0L) {
                val record = RecordingRecord(
                    id          = UUID.randomUUID().toString(),
                    streamId    = snapshot.streamId,
                    title       = snapshot.title,
                    logoUrl     = snapshot.logoUrl,
                    localPath   = snapshot.outputFile.absolutePath,
                    startedAt   = snapshot.startedAt,
                    durationMs  = durationMs,
                    sizeBytes   = sizeBytes
                )
                recordingsStore.add(record)
            }
        }
    }

    fun deleteRecording(record: RecordingRecord) {
        viewModelScope.launch {
            File(record.localPath).delete()
            recordingsStore.remove(record.id)
        }
    }

    fun getRecordingUri(record: RecordingRecord): Uri? {
        val file = File(record.localPath)
        return if (file.exists()) Uri.fromFile(file) else null
    }
}

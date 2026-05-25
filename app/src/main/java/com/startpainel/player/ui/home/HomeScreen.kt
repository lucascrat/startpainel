package com.startpainel.player.ui.home

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.ExitToApp
import androidx.compose.material.icons.filled.FiberManualRecord
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LiveTv
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material.icons.filled.VideoLibrary
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.LiveTv
import androidx.compose.material.icons.outlined.Movie
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Tv
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.platform.LocalConfiguration
import android.content.res.Configuration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.startpainel.player.ads.AdmobBanner
import com.startpainel.player.ads.AdmobNativeCard
import com.startpainel.player.util.rememberIsTv
import com.startpainel.player.data.model.DownloadRecord
import com.startpainel.player.data.model.RecordingRecord
import com.startpainel.player.data.remote.dto.Category
import com.startpainel.player.ui.components.ChannelCard
import com.startpainel.player.ui.components.ChannelRow
import com.startpainel.player.ui.components.ContentRow
import com.startpainel.player.ui.components.EmptyBox
import com.startpainel.player.ui.components.ErrorBox
import com.startpainel.player.ui.components.HeroBanner
import com.startpainel.player.ui.components.LoadingBox
import com.startpainel.player.ui.components.PosterCard
import com.startpainel.player.ui.components.SectionTitle
import com.startpainel.player.ui.components.ShimmerHero
import androidx.compose.ui.platform.LocalContext
import com.startpainel.player.ui.theme.Background
import com.startpainel.player.ui.theme.BrandBlue
import com.startpainel.player.ui.theme.ErrorRed
import com.startpainel.player.ui.theme.SuccessGreen
import com.startpainel.player.ui.theme.SurfaceMid
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit

// ─── Nav entries ──────────────────────────────────────────────

private data class NavEntry(
    val tab: Tab,
    val label: String,
    val icon: ImageVector,
    val iconSelected: ImageVector
)

private val NAV_ENTRIES = listOf(
    NavEntry(Tab.Home,       "Início",    Icons.Outlined.Home,          Icons.Filled.Home),
    NavEntry(Tab.Live,       "Ao Vivo",   Icons.Outlined.LiveTv,        Icons.Filled.LiveTv),
    NavEntry(Tab.Movies,     "Filmes",    Icons.Outlined.Movie,         Icons.Filled.Movie),
    NavEntry(Tab.Series,     "Séries",    Icons.Outlined.Tv,            Icons.Filled.Tv),
    NavEntry(Tab.Search,     "Buscar",    Icons.Outlined.Search,        Icons.Filled.Search),
    NavEntry(Tab.Downloads,  "Downloads", Icons.Filled.Download,        Icons.Filled.Download),
    NavEntry(Tab.Recordings, "Gravações", Icons.Filled.VideoLibrary,    Icons.Filled.VideoLibrary),
)

// ─── Root ─────────────────────────────────────────────────────

@Composable
fun HomeScreen(
    onPlayLive: (streamId: Int, title: String) -> Unit,
    onPlayMovie: (streamId: Int, ext: String, title: String) -> Unit,
    onOpenSeries: (seriesId: Int, title: String) -> Unit,
    onPlayLocal: (uri: String, title: String) -> Unit,
    onLogout: () -> Unit,
    vm: HomeViewModel = viewModel()
) {
    val state by vm.state.collectAsStateWithLifecycle()

    // Estado local do PIN dialog
    var showPinDialog by remember { mutableStateOf(false) }
    var pinPendingTab by remember { mutableStateOf<Tab?>(null) }
    var pinPendingCategoryId by remember { mutableStateOf<String?>(null) }

    fun requestAdultPin(tab: Tab, categoryId: String?) {
        pinPendingTab = tab
        pinPendingCategoryId = categoryId
        showPinDialog = true
    }

    if (showPinDialog) {
        AdultPinDialog(
            onConfirm = { pin ->
                if (pin == "0000") {
                    vm.unlockAdult()
                    showPinDialog = false
                    pinPendingTab?.let { t -> vm.selectCategory(t, pinPendingCategoryId) }
                    pinPendingTab = null
                    pinPendingCategoryId = null
                    true
                } else false
            },
            onDismiss = { showPinDialog = false; pinPendingTab = null }
        )
    }

    val isPortrait = LocalConfiguration.current.orientation == Configuration.ORIENTATION_PORTRAIT
    val isTv = rememberIsTv() // AdMob não suporta Android TV — ocultamos os slots na TV

    // Conteúdo das abas — reutilizado nos dois layouts (retrato e paisagem)
    val tabContent: @Composable () -> Unit = {
        AnimatedContent(
            targetState = state.tab,
            transitionSpec = { fadeIn(tween(180)) togetherWith fadeOut(tween(120)) },
            modifier = Modifier.fillMaxSize(),
            label = "tab_content"
        ) { tab ->
            when (tab) {
                Tab.Home   -> HomeTab(state, vm, onPlayLive, onPlayMovie, onOpenSeries)
                Tab.Live   -> LiveTab(
                    section = state.live,
                    adultUnlocked = state.adultUnlocked,
                    vm = vm,
                    onPlayLive = onPlayLive,
                    isPortrait = isPortrait,
                    onAdultLocked = { catId -> requestAdultPin(Tab.Live, catId) },
                    activeRecordingStreamId = state.activeRecording?.streamId,
                    onStartRecord = { id, title, logo -> vm.startRecording(id, title, logo) },
                    onStopRecord = { vm.stopRecording() }
                )
                Tab.Movies -> MoviesTab(state, state.movies, state.adultUnlocked, vm, onPlayMovie, isPortrait,
                    onAdultLocked = { catId -> requestAdultPin(Tab.Movies, catId) })
                Tab.Series -> SeriesTab(state, state.series, state.adultUnlocked, vm, onOpenSeries, isPortrait,
                    onAdultLocked = { catId -> requestAdultPin(Tab.Series, catId) })
                Tab.Search -> SearchTab(state, vm, onPlayLive, onPlayMovie, onOpenSeries)
                Tab.Downloads -> DownloadsTab(
                    downloads = state.downloads,
                    onPlay = { record ->
                        val uri = vm.getLocalFileUri(record)
                        if (uri != null) onPlayLocal(uri.toString(), record.title)
                    },
                    onDelete = { vm.removeDownload(it) }
                )
                Tab.Recordings -> RecordingsTab(
                    recordings = state.recordings,
                    onPlay = { record ->
                        val uri = vm.getRecordingUri(record)
                        if (uri != null) onPlayLocal(uri.toString(), record.title)
                    },
                    onDelete = { vm.deleteRecording(it) }
                )
            }
        }
    }

    if (isPortrait) {
        // ── LAYOUT RETRATO (celular vertical): topo + conteúdo + banner + nav inferior ──
        Column(Modifier.fillMaxSize().background(Background)) {
            PortraitTopBar(
                isRefreshing = state.isRefreshing,
                onRefresh = vm::refreshContent,
                onLogout = { vm.logout(); onLogout() }
            )
            Box(Modifier.weight(1f).fillMaxWidth()) { tabContent() }
            if (!isTv) AdmobBanner(Modifier.background(Color(0xFF0C0C0C)))
            BottomNavBar(current = state.tab, onSelect = vm::selectTab)
        }
    } else {
        // ── LAYOUT PAISAGEM / TV: barra lateral à esquerda ──
        Row(Modifier.fillMaxSize().background(Background)) {
            TvNavRail(
                current = state.tab,
                onSelect = vm::selectTab,
                onRefresh = vm::refreshContent,
                isRefreshing = state.isRefreshing,
                onLogout = { vm.logout(); onLogout() }
            )
            Box(Modifier.fillMaxHeight().width(1.dp).background(Color.White.copy(alpha = 0.07f)))
            Column(Modifier.weight(1f).fillMaxHeight()) {
                Box(Modifier.weight(1f).fillMaxWidth()) { tabContent() }
                if (!isTv) AdmobBanner(Modifier.background(Color(0xFF0C0C0C)))
            }
        }
    }
}

// ─── Barra superior (modo retrato) ────────────────────────────

@Composable
private fun PortraitTopBar(isRefreshing: Boolean, onRefresh: () -> Unit, onLogout: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().background(Color(0xFF0C0C0C)).padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text("S", color = BrandBlue, fontSize = 24.sp, fontWeight = FontWeight.ExtraBold)
        Text("tartflix", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.weight(1f))
        // Atualizar conteúdo
        IconButton(onClick = { if (!isRefreshing) onRefresh() }) {
            if (isRefreshing) {
                CircularProgressIndicator(color = BrandBlue, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
            } else {
                Icon(Icons.Filled.Refresh, "Atualizar", tint = BrandBlue, modifier = Modifier.size(22.dp))
            }
        }
        IconButton(onClick = onLogout) {
            Icon(Icons.Filled.ExitToApp, "Sair", tint = ErrorRed.copy(0.85f), modifier = Modifier.size(22.dp))
        }
    }
}

// ─── Navegação inferior (modo retrato) ────────────────────────

@Composable
private fun BottomNavBar(current: Tab, onSelect: (Tab) -> Unit) {
    Column {
        Box(Modifier.fillMaxWidth().height(1.dp).background(Color.White.copy(0.07f)))
        Row(
            Modifier.fillMaxWidth().background(Color(0xFF0C0C0C)).padding(vertical = 6.dp),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            NAV_ENTRIES.forEach { entry ->
                BottomNavItem(entry = entry, selected = current == entry.tab,
                    onClick = { onSelect(entry.tab) }, modifier = Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun BottomNavItem(entry: NavEntry, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val interaction = remember { MutableInteractionSource() }
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(10.dp))
            .clickable(interactionSource = interaction, indication = null, onClick = onClick)
            .padding(vertical = 5.dp, horizontal = 2.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        Icon(
            if (selected) entry.iconSelected else entry.icon,
            entry.label,
            tint = if (selected) BrandBlue else Color.White.copy(0.45f),
            modifier = Modifier.size(20.dp)
        )
        Text(
            entry.label,
            color = if (selected) Color.White else Color.White.copy(0.45f),
            fontSize = 8.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

// ─── Categorias em chips horizontais (modo retrato) ───────────

@Composable
private fun CategoryChipsRow(
    categories: List<Category>,
    selected: String?,
    adultUnlocked: Boolean,
    onSelect: (String?) -> Unit,
    onAdultLocked: (String?) -> Unit
) {
    if (categories.isEmpty()) return
    LazyRow(
        Modifier.fillMaxWidth().background(Color(0xFF0C0C0C)),
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        item { CategoryChip("Todas", selected = selected == null, isAdult = false) { onSelect(null) } }
        items(categories) { cat ->
            val adult = isAdultCategory(cat.name.orEmpty())
            CategoryChip(
                name = cat.name.orEmpty(),
                selected = selected == cat.id,
                isAdult = adult && !adultUnlocked
            ) {
                if (adult && !adultUnlocked) onAdultLocked(cat.id) else onSelect(cat.id)
            }
        }
    }
}

@Composable
private fun CategoryChip(name: String, selected: Boolean, isAdult: Boolean, onClick: () -> Unit) {
    Row(
        Modifier
            .clip(RoundedCornerShape(20.dp))
            .background(if (selected) BrandBlue else Color.White.copy(0.08f))
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp)
    ) {
        Text(
            name,
            color = if (selected) Color.White else Color.White.copy(0.7f),
            fontSize = 12.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
            maxLines = 1
        )
        if (isAdult) Icon(Icons.Filled.Lock, null, tint = if (selected) Color.White else Color.White.copy(0.5f), modifier = Modifier.size(12.dp))
    }
}

// ─── TV Navigation Rail ───────────────────────────────────────

@Composable
private fun TvNavRail(
    current: Tab,
    onSelect: (Tab) -> Unit,
    onRefresh: () -> Unit,
    isRefreshing: Boolean,
    onLogout: () -> Unit
) {
    Column(
        Modifier.fillMaxHeight().width(82.dp).background(Color(0xFF0C0C0C))
    ) {
        // Logo Startflix
        Box(Modifier.fillMaxWidth().height(50.dp), contentAlignment = Alignment.Center) {
            Text("S", color = BrandBlue, fontSize = 26.sp, fontWeight = FontWeight.ExtraBold)
            Box(
                Modifier.align(Alignment.BottomCenter).width(18.dp).height(3.dp)
                    .clip(RoundedCornerShape(2.dp)).background(BrandBlue)
            )
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(Color.White.copy(0.07f)))

        // Nav items — LazyColumn para scroll quando não couberem todos (ex: landscape)
        LazyColumn(
            modifier = Modifier.weight(1f).fillMaxWidth(),
            contentPadding = PaddingValues(vertical = 4.dp)
        ) {
            items(NAV_ENTRIES) { entry ->
                RailItem(entry = entry, selected = current == entry.tab, onClick = { onSelect(entry.tab) })
            }
        }

        // Ações no rodapé
        Box(Modifier.fillMaxWidth().height(1.dp).background(Color.White.copy(0.07f)))
        // Atualizar conteúdo — única forma de buscar conteúdo novo do servidor
        RefreshAction(isRefreshing = isRefreshing, onClick = { if (!isRefreshing) onRefresh() })
        RailAction(Icons.Filled.ExitToApp, "Sair", ErrorRed.copy(0.7f), ErrorRed, onLogout)
        Spacer(Modifier.height(6.dp))
    }
}

@Composable
private fun RefreshAction(isRefreshing: Boolean, onClick: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val isFocused by interaction.collectIsFocusedAsState()
    val tint = if (isFocused) BrandBlue else BrandBlue.copy(0.85f)
    Box(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 6.dp, vertical = 2.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(if (isFocused) BrandBlue.copy(0.12f) else Color.Transparent)
            .clickable(interactionSource = interaction, indication = null, onClick = onClick)
            .padding(vertical = 12.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            if (isRefreshing) {
                CircularProgressIndicator(color = tint, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
            } else {
                Icon(Icons.Filled.Refresh, "Atualizar", tint = tint, modifier = Modifier.size(20.dp))
            }
            Text(
                if (isRefreshing) "Atualizando" else "Atualizar",
                color = tint, fontSize = 9.sp, textAlign = TextAlign.Center, maxLines = 1
            )
        }
    }
}

@Composable
private fun RailItem(entry: NavEntry, selected: Boolean, onClick: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val isFocused by interaction.collectIsFocusedAsState()
    val highlighted = selected || isFocused

    Box(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 5.dp, vertical = 1.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(if (highlighted) BrandBlue.copy(0.14f) else Color.Transparent)
            .clickable(interactionSource = interaction, indication = null, onClick = onClick)
            .padding(vertical = 8.dp),
        contentAlignment = Alignment.Center
    ) {
        if (selected) {
            Box(
                Modifier.align(Alignment.CenterStart).width(3.dp).height(22.dp)
                    .clip(RoundedCornerShape(topEnd = 3.dp, bottomEnd = 3.dp)).background(BrandBlue)
            )
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Icon(
                if (selected) entry.iconSelected else entry.icon,
                entry.label,
                tint = if (highlighted) BrandBlue else Color.White.copy(0.4f),
                modifier = Modifier.size(20.dp)
            )
            Text(
                entry.label,
                color = if (highlighted) Color.White else Color.White.copy(0.4f),
                fontSize = 8.sp,
                fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                textAlign = TextAlign.Center,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
private fun RailAction(icon: ImageVector, label: String, tint: Color, focusTint: Color, onClick: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val isFocused by interaction.collectIsFocusedAsState()
    Box(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 6.dp, vertical = 2.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(if (isFocused) focusTint.copy(0.12f) else Color.Transparent)
            .clickable(interactionSource = interaction, indication = null, onClick = onClick)
            .padding(vertical = 12.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Icon(icon, null, tint = if (isFocused) focusTint else tint, modifier = Modifier.size(20.dp))
            Text(label, color = if (isFocused) focusTint else tint, fontSize = 9.sp, textAlign = TextAlign.Center)
        }
    }
}

// ─── Category sidebar ─────────────────────────────────────────

@Composable
private fun CategorySidebar(
    categories: List<Category>,
    selected: String?,
    adultUnlocked: Boolean,
    onSelect: (String?) -> Unit,
    onAdultLocked: (String?) -> Unit
) {
    if (categories.isEmpty()) return
    Column(Modifier.fillMaxHeight().width(195.dp).background(Color(0xFF111111))) {
        Box(
            Modifier.fillMaxWidth().height(52.dp).padding(horizontal = 16.dp),
            contentAlignment = Alignment.CenterStart
        ) {
            Text("CATEGORIAS", color = Color.White.copy(0.3f), fontSize = 9.sp,
                fontWeight = FontWeight.Bold, letterSpacing = 1.8.sp)
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(Color.White.copy(0.07f)))
        LazyColumn(contentPadding = PaddingValues(vertical = 4.dp)) {
            item { CategoryItem("Todas", selected = selected == null, isAdult = false, onClick = { onSelect(null) }) }
            items(categories) { cat ->
                val adult = isAdultCategory(cat.name.orEmpty())
                CategoryItem(
                    name = cat.name.orEmpty(),
                    selected = selected == cat.id,
                    isAdult = adult && !adultUnlocked,
                    onClick = {
                        if (adult && !adultUnlocked) onAdultLocked(cat.id)
                        else onSelect(cat.id)
                    }
                )
            }
        }
    }
}

@Composable
private fun CategoryItem(name: String, selected: Boolean, isAdult: Boolean, onClick: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val isFocused by interaction.collectIsFocusedAsState()
    val highlighted = selected || isFocused
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(if (highlighted) BrandBlue.copy(0.16f) else Color.Transparent)
            .clickable(interactionSource = interaction, indication = null, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Box(Modifier.width(3.dp).height(14.dp).clip(RoundedCornerShape(2.dp))
            .background(if (selected) BrandBlue else Color.Transparent))
        Text(
            name, color = if (highlighted) Color.White else Color.White.copy(0.5f),
            fontSize = 13.sp, fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f)
        )
        if (isAdult) Icon(Icons.Filled.Lock, null, tint = Color.White.copy(0.4f), modifier = Modifier.size(14.dp))
    }
}

// ─── Home tab ─────────────────────────────────────────────────

@Composable
private fun HomeTab(
    state: HomeUiState,
    vm: HomeViewModel,
    onPlayLive: (Int, String) -> Unit,
    onPlayMovie: (Int, String, String) -> Unit,
    onOpenSeries: (Int, String) -> Unit
) {
    val isTv = rememberIsTv()
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 20.dp)) {
        item {
            if (state.heroLoading) ShimmerHero()
            else if (state.hero != null) {
                HeroBanner(item = state.hero, onPlay = {
                    val movie = state.movies.vodStreams.firstOrNull { !it.streamIcon.isNullOrBlank() }
                        ?: state.movies.vodStreams.firstOrNull()
                    if (movie != null) {
                        val id = movie.streamId ?: return@HeroBanner
                        onPlayMovie(id, movie.containerExtension ?: "mp4", movie.name.orEmpty())
                    }
                })
            }
        }
        if (state.live.liveStreams.isNotEmpty()) {
            item {
                Spacer(Modifier.height(24.dp))
                ContentRow("Ao Vivo", state.live.liveStreams.take(40), { it.streamId ?: it.hashCode() },
                    icon = Icons.Filled.LiveTv, loading = state.live.loading) { stream ->
                    ChannelCard(stream.name.orEmpty(), stream.streamIcon, onClick = {
                        val id = stream.streamId ?: return@ChannelCard
                        onPlayLive(id, stream.name.orEmpty())
                    })
                }
            }
        }
        // Anúncio nativo no feed — AdMob não suporta Android TV, só exibe em celular/tablet
        if (!isTv) item {
            Spacer(Modifier.height(20.dp))
            AdmobNativeCard(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
                    .clip(RoundedCornerShape(14.dp))
            )
        }
        if (state.movies.vodStreams.isNotEmpty()) {
            item {
                Spacer(Modifier.height(24.dp))
                ContentRow("Filmes em Destaque", state.movies.vodStreams.take(30), { it.streamId ?: it.hashCode() },
                    icon = Icons.Filled.Movie, loading = state.movies.loading) { movie ->
                    PosterCard(
                        title = movie.name.orEmpty(), imageUrl = movie.streamIcon,
                        badge = movie.rating?.let { "★ $it" }, cardWidth = 150.dp,
                        isDownloaded = vm.isDownloaded(movie.streamId ?: -1),
                        isDownloading = vm.isDownloading(movie.streamId ?: -1),
                        onDownload = {
                            val id = movie.streamId ?: return@PosterCard
                            val acc = state.account ?: return@PosterCard
                            vm.startDownload(id, movie.name.orEmpty(), movie.streamIcon,
                                acc.movieStreamUrl(id, movie.containerExtension ?: "mp4"),
                                movie.containerExtension ?: "mp4", "movie")
                        },
                        onClick = {
                            val id = movie.streamId ?: return@PosterCard
                            onPlayMovie(id, movie.containerExtension ?: "mp4", movie.name.orEmpty())
                        }
                    )
                }
            }
        }
        if (state.series.seriesStreams.isNotEmpty()) {
            item {
                Spacer(Modifier.height(24.dp))
                ContentRow("Séries", state.series.seriesStreams.take(30), { it.seriesId ?: it.hashCode() },
                    icon = Icons.Filled.Tv, loading = state.series.loading) { series ->
                    PosterCard(
                        title = series.name.orEmpty(), imageUrl = series.cover, subtitle = series.genre,
                        cardWidth = 150.dp, onClick = {
                            val id = series.seriesId ?: return@PosterCard
                            onOpenSeries(id, series.name.orEmpty())
                        }
                    )
                }
            }
        }
        if (!state.heroLoading && state.live.error != null && state.movies.error != null && state.series.error != null) {
            item { ErrorBox("Falha ao carregar conteúdo", onRetry = vm::retry) }
        }
    }
}

// ─── Live tab ─────────────────────────────────────────────────

// Arranja categorias (sidebar em paisagem / chips em retrato) + conteúdo.
@Composable
private fun SectionScaffold(
    categories: List<Category>,
    selectedCategoryId: String?,
    adultUnlocked: Boolean,
    isPortrait: Boolean,
    onSelectCategory: (String?) -> Unit,
    onAdultLocked: (String?) -> Unit,
    content: @Composable () -> Unit
) {
    if (isPortrait) {
        Column(Modifier.fillMaxSize()) {
            CategoryChipsRow(categories, selectedCategoryId, adultUnlocked, onSelectCategory, onAdultLocked)
            Box(Modifier.weight(1f).fillMaxWidth()) { content() }
        }
    } else {
        Row(Modifier.fillMaxSize()) {
            CategorySidebar(categories, selectedCategoryId, adultUnlocked, onSelectCategory, onAdultLocked)
            if (categories.isNotEmpty()) Box(Modifier.fillMaxHeight().width(1.dp).background(Color.White.copy(0.07f)))
            Box(Modifier.weight(1f).fillMaxHeight()) { content() }
        }
    }
}

@Composable
private fun LiveTab(
    section: SectionState,
    adultUnlocked: Boolean,
    vm: HomeViewModel,
    onPlayLive: (Int, String) -> Unit,
    isPortrait: Boolean,
    onAdultLocked: (String?) -> Unit,
    activeRecordingStreamId: Int? = null,
    onStartRecord: (Int, String, String?) -> Unit = { _, _, _ -> },
    onStopRecord: () -> Unit = {}
) {
    // Dialog de confirmação antes de iniciar gravação
    var pendingRecord by remember { mutableStateOf<Triple<Int, String, String?>?>(null) }

    pendingRecord?.let { (id, title, logo) ->
        RecordConfirmDialog(
            channelName = title,
            onConfirm = {
                onStartRecord(id, title, logo)
                pendingRecord = null
            },
            onDismiss = { pendingRecord = null }
        )
    }

    SectionScaffold(
        section.categories, section.selectedCategoryId, adultUnlocked, isPortrait,
        onSelectCategory = { vm.selectCategory(Tab.Live, it) }, onAdultLocked = onAdultLocked
    ) {
        Column(Modifier.fillMaxSize()) {
            SectionHeader("Ao Vivo", Icons.Filled.LiveTv, section.query) { vm.setQuery(Tab.Live, it) }
            Box(Modifier.weight(1f).fillMaxWidth()) {
                when {
                    section.loading -> LoadingBox()
                    section.error != null -> ErrorBox(section.error, onRetry = vm::retry)
                    section.liveStreams.isEmpty() -> EmptyBox("Nenhum canal")
                    else -> LazyColumn(
                        Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        items(section.liveStreams.filterByQuery(section.query) { it.name },
                            key = { it.streamId ?: it.hashCode() }) { stream ->
                            val id = stream.streamId ?: return@items
                            val recording = activeRecordingStreamId == id
                            ChannelRow(
                                name = stream.name.orEmpty(),
                                logoUrl = stream.streamIcon,
                                isLive = true,
                                canRecord = true,
                                isRecording = recording,
                                onClick = { onPlayLive(id, stream.name.orEmpty()) },
                                onRecord = { pendingRecord = Triple(id, stream.name.orEmpty(), stream.streamIcon) },
                                onStopRecord = { onStopRecord() }
                            )
                        }
                    }
                }
            }
        }
    }
}

// ─── Movies tab ───────────────────────────────────────────────

@Composable
private fun MoviesTab(
    state: HomeUiState,
    section: SectionState,
    adultUnlocked: Boolean,
    vm: HomeViewModel,
    onPlayMovie: (Int, String, String) -> Unit,
    isPortrait: Boolean,
    onAdultLocked: (String?) -> Unit
) {
    SectionScaffold(
        section.categories, section.selectedCategoryId, adultUnlocked, isPortrait,
        onSelectCategory = { vm.selectCategory(Tab.Movies, it) }, onAdultLocked = onAdultLocked
    ) {
        Column(Modifier.fillMaxSize()) {
            SectionHeader("Filmes", Icons.Filled.Movie, section.query) { vm.setQuery(Tab.Movies, it) }
            Box(Modifier.weight(1f).fillMaxWidth()) {
                when {
                    section.loading -> LoadingBox()
                    section.error != null -> ErrorBox(section.error, onRetry = vm::retry)
                    section.vodStreams.isEmpty() -> EmptyBox("Nenhum filme")
                    else -> LazyVerticalGrid(
                        columns = GridCells.Adaptive(if (isPortrait) 110.dp else 150.dp),
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        items(section.vodStreams.filterByQuery(section.query) { it.name },
                            key = { it.streamId ?: it.hashCode() }) { movie ->
                            PosterCard(
                                title = movie.name.orEmpty(), imageUrl = movie.streamIcon,
                                badge = movie.rating?.let { "★ $it" }, cardWidth = if (isPortrait) 110.dp else 150.dp,
                                isDownloaded = vm.isDownloaded(movie.streamId ?: -1),
                                isDownloading = vm.isDownloading(movie.streamId ?: -1),
                                onDownload = {
                                    val id = movie.streamId ?: return@PosterCard
                                    val acc = state.account ?: return@PosterCard
                                    vm.startDownload(id, movie.name.orEmpty(), movie.streamIcon,
                                        acc.movieStreamUrl(id, movie.containerExtension ?: "mp4"),
                                        movie.containerExtension ?: "mp4", "movie")
                                },
                                onClick = {
                                    val id = movie.streamId ?: return@PosterCard
                                    onPlayMovie(id, movie.containerExtension ?: "mp4", movie.name.orEmpty())
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}

// ─── Series tab ───────────────────────────────────────────────

@Composable
private fun SeriesTab(
    state: HomeUiState,
    section: SectionState,
    adultUnlocked: Boolean,
    vm: HomeViewModel,
    onOpenSeries: (Int, String) -> Unit,
    isPortrait: Boolean,
    onAdultLocked: (String?) -> Unit
) {
    SectionScaffold(
        section.categories, section.selectedCategoryId, adultUnlocked, isPortrait,
        onSelectCategory = { vm.selectCategory(Tab.Series, it) }, onAdultLocked = onAdultLocked
    ) {
        Column(Modifier.fillMaxSize()) {
            SectionHeader("Séries", Icons.Filled.Tv, section.query) { vm.setQuery(Tab.Series, it) }
            Box(Modifier.weight(1f).fillMaxWidth()) {
                when {
                    section.loading -> LoadingBox()
                    section.error != null -> ErrorBox(section.error, onRetry = vm::retry)
                    section.seriesStreams.isEmpty() -> EmptyBox("Nenhuma série")
                    else -> LazyVerticalGrid(
                        columns = GridCells.Adaptive(if (isPortrait) 110.dp else 150.dp),
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        items(section.seriesStreams.filterByQuery(section.query) { it.name },
                            key = { it.seriesId ?: it.hashCode() }) { series ->
                            PosterCard(
                                title = series.name.orEmpty(), imageUrl = series.cover, subtitle = series.genre,
                                cardWidth = if (isPortrait) 110.dp else 150.dp, onClick = {
                                    val id = series.seriesId ?: return@PosterCard
                                    onOpenSeries(id, series.name.orEmpty())
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}

// ─── Downloads tab ────────────────────────────────────────────

@Composable
private fun DownloadsTab(
    downloads: List<DownloadRecord>,
    onPlay: (DownloadRecord) -> Unit,
    onDelete: (DownloadRecord) -> Unit
) {
    Column(Modifier.fillMaxSize()) {
        Box(
            Modifier.fillMaxWidth().background(Color(0xFF0E0E0E)).padding(horizontal = 16.dp, vertical = 12.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Icon(Icons.Filled.Download, null, tint = BrandBlue, modifier = Modifier.size(18.dp))
                Text("Downloads Offline", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                Spacer(Modifier.weight(1f))
                Text("${downloads.size} arquivo${if (downloads.size != 1) "s" else ""}",
                    color = Color.White.copy(0.4f), fontSize = 12.sp)
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(Color.White.copy(0.07f)))

        if (downloads.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Icon(Icons.Filled.Download, null, tint = Color.White.copy(0.15f), modifier = Modifier.size(64.dp))
                    Text("Nenhum download", color = Color.White.copy(0.5f),
                        fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    Text("Baixe filmes e séries para assistir sem internet",
                        color = Color.White.copy(0.3f), fontSize = 13.sp, textAlign = TextAlign.Center)
                }
            }
        } else {
            LazyVerticalGrid(
                columns = GridCells.Adaptive(160.dp),
                contentPadding = PaddingValues(16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(downloads, key = { it.downloadId }) { record ->
                    DownloadCard(record = record, onPlay = { onPlay(record) }, onDelete = { onDelete(record) })
                }
            }
        }
    }
}

@Composable
private fun DownloadCard(record: DownloadRecord, onPlay: () -> Unit, onDelete: () -> Unit) {
    val fileExists = remember(record.localPath) { java.io.File(record.localPath).exists() }
    Box(
        Modifier
            .width(160.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(SurfaceMid)
            .clickable(onClick = onPlay)
    ) {
        Column {
            Box(Modifier.fillMaxWidth().height(120.dp)) {
                if (!record.imageUrl.isNullOrBlank()) {
                    AsyncImage(
                        model = record.imageUrl, contentDescription = record.title,
                        contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                        modifier = Modifier.fillMaxSize()
                    )
                } else {
                    Box(Modifier.fillMaxSize().background(Color(0xFF1A1A1A)), contentAlignment = Alignment.Center) {
                        Icon(if (record.type == "series") Icons.Filled.Tv else Icons.Filled.Movie,
                            null, tint = Color.White.copy(0.2f), modifier = Modifier.size(36.dp))
                    }
                }
                // Status badge
                Box(
                    Modifier.align(Alignment.TopStart).padding(6.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .background(if (fileExists) SuccessGreen.copy(0.85f) else BrandBlue.copy(0.85f))
                        .padding(horizontal = 6.dp, vertical = 3.dp)
                ) {
                    Text(
                        if (fileExists) "Disponível" else "Baixando…",
                        color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Bold
                    )
                }
                // Play overlay
                if (fileExists) {
                    Box(
                        Modifier.align(Alignment.Center).size(40.dp).clip(RoundedCornerShape(20.dp))
                            .background(Color.Black.copy(0.5f)), contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Filled.PlayArrow, null, tint = Color.White, modifier = Modifier.size(24.dp))
                    }
                }
            }
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    record.title, color = Color.White, fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )
                IconButton(onClick = onDelete, modifier = Modifier.size(28.dp)) {
                    Icon(Icons.Filled.Delete, null, tint = ErrorRed.copy(0.7f), modifier = Modifier.size(16.dp))
                }
            }
        }
    }
}

// ─── Dialog confirmação de gravação ───────────────────────────

@Composable
private fun RecordConfirmDialog(
    channelName: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = {
            Icon(Icons.Filled.FiberManualRecord, null,
                tint = Color(0xFFE53935), modifier = Modifier.size(32.dp))
        },
        title = { Text("Gravar ao vivo", fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Canal: $channelName", fontWeight = FontWeight.SemiBold)
                Text(
                    "A gravação ficará salva na memória do seu celular e poderá ser assistida offline a qualquer momento.",
                    fontSize = 13.sp, color = Color.White.copy(0.7f)
                )
                Text(
                    "⚠ Cada hora gravada ocupa aproximadamente 1–2 GB.",
                    fontSize = 12.sp, color = Color(0xFFFFAB40)
                )
            }
        },
        confirmButton = {
            Button(
                onClick = onConfirm,
                colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                    containerColor = Color(0xFFE53935)
                )
            ) {
                Icon(Icons.Filled.FiberManualRecord, null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text("Iniciar gravação")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancelar") }
        }
    )
}

// ─── Recordings tab ───────────────────────────────────────────

@Composable
private fun RecordingsTab(
    recordings: List<RecordingRecord>,
    onPlay: (RecordingRecord) -> Unit,
    onDelete: (RecordingRecord) -> Unit
) {
    Column(Modifier.fillMaxSize()) {
        // Cabeçalho
        Box(
            Modifier.fillMaxWidth().background(Color(0xFF0E0E0E))
                .padding(horizontal = 16.dp, vertical = 12.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Icon(Icons.Filled.VideoLibrary, null, tint = Color(0xFFE53935), modifier = Modifier.size(18.dp))
                Text("Gravações ao Vivo", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                Spacer(Modifier.weight(1f))
                Text("${recordings.size} grava${if (recordings.size != 1) "ções" else "ção"}",
                    color = Color.White.copy(0.4f), fontSize = 12.sp)
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(Color.White.copy(0.07f)))

        if (recordings.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Icon(Icons.Filled.FiberManualRecord, null,
                        tint = Color.White.copy(0.15f), modifier = Modifier.size(64.dp))
                    Text("Nenhuma gravação", color = Color.White.copy(0.5f),
                        fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    Text("Vá em Ao Vivo e toque em ⏺ para gravar um canal",
                        color = Color.White.copy(0.3f), fontSize = 13.sp, textAlign = TextAlign.Center,
                        modifier = Modifier.padding(horizontal = 32.dp))
                }
            }
        } else {
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(recordings, key = { it.id }) { record ->
                    RecordingCard(record = record, onPlay = { onPlay(record) }, onDelete = { onDelete(record) })
                }
            }
        }
    }
}

@Composable
private fun RecordingCard(
    record: RecordingRecord,
    onPlay: () -> Unit,
    onDelete: () -> Unit
) {
    val fileExists = remember(record.localPath) { File(record.localPath).exists() }
    var showDeleteDialog by remember { mutableStateOf(false) }

    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text("Excluir gravação?") },
            text = { Text("\"${record.title}\" será removida permanentemente do dispositivo.") },
            confirmButton = {
                Button(
                    onClick = { showDeleteDialog = false; onDelete() },
                    colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                        containerColor = ErrorRed
                    )
                ) { Text("Excluir") }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) { Text("Cancelar") }
            }
        )
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(SurfaceMid)
            .clickable(enabled = fileExists, onClick = onPlay)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Thumbnail / ícone
        Box(
            Modifier.size(56.dp).clip(RoundedCornerShape(8.dp)).background(Color(0xFF1A1A1A)),
            contentAlignment = Alignment.Center
        ) {
            if (!record.logoUrl.isNullOrBlank()) {
                AsyncImage(
                    model = record.logoUrl, contentDescription = record.title,
                    contentScale = androidx.compose.ui.layout.ContentScale.Fit,
                    modifier = Modifier.fillMaxSize().padding(6.dp)
                )
            } else {
                Icon(Icons.Filled.VideoLibrary, null,
                    tint = Color(0xFFE53935).copy(0.6f), modifier = Modifier.size(28.dp))
            }
            if (fileExists) {
                Box(
                    Modifier.align(Alignment.Center).size(28.dp)
                        .clip(RoundedCornerShape(14.dp)).background(Color.Black.copy(0.55f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Filled.PlayArrow, null, tint = Color.White, modifier = Modifier.size(18.dp))
                }
            }
        }

        // Informações
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(record.title, color = Color.White, fontWeight = FontWeight.SemiBold,
                fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val dateStr = remember(record.startedAt) {
                SimpleDateFormat("dd/MM/yyyy HH:mm", Locale("pt", "BR")).format(Date(record.startedAt))
            }
            val durStr = remember(record.durationMs) {
                val h = TimeUnit.MILLISECONDS.toHours(record.durationMs)
                val m = TimeUnit.MILLISECONDS.toMinutes(record.durationMs) % 60
                if (h > 0) "${h}h ${m}min" else "${m}min"
            }
            val sizeStr = remember(record.sizeBytes) {
                when {
                    record.sizeBytes < 1_000_000L -> "${record.sizeBytes / 1_000} KB"
                    record.sizeBytes < 1_000_000_000L -> String.format(Locale.ROOT, "%.1f MB", record.sizeBytes / 1_000_000.0)
                    else -> String.format(Locale.ROOT, "%.2f GB", record.sizeBytes / 1_000_000_000.0)
                }
            }
            Text("$dateStr  •  $durStr  •  $sizeStr",
                color = Color.White.copy(0.5f), fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (!fileExists) {
                Text("Arquivo não encontrado", color = ErrorRed, fontSize = 11.sp)
            }
        }

        // Botão excluir
        IconButton(onClick = { showDeleteDialog = true }, modifier = Modifier.size(32.dp)) {
            Icon(Icons.Filled.Delete, null, tint = ErrorRed.copy(0.7f), modifier = Modifier.size(18.dp))
        }
    }
}

// ─── Search tab ───────────────────────────────────────────────

@Composable
private fun SearchTab(
    state: HomeUiState,
    vm: HomeViewModel,
    onPlayLive: (Int, String) -> Unit,
    onPlayMovie: (Int, String, String) -> Unit,
    onOpenSeries: (Int, String) -> Unit
) {
    val results = state.searchResults
    Column(Modifier.fillMaxSize()) {
        OutlinedTextField(
            value = state.searchQuery, onValueChange = vm::setSearchQuery,
            placeholder = { Text("Buscar canais, filmes, séries…") },
            leadingIcon = { Icon(Icons.Filled.Search, null, tint = Color.White.copy(0.5f)) },
            singleLine = true, colors = searchFieldColors(),
            modifier = Modifier.fillMaxWidth().padding(16.dp)
        )
        when {
            state.searchQuery.isBlank() -> EmptyBox("Digite para buscar")
            results.loading -> LoadingBox()
            else -> LazyColumn(
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                if (results.live.isNotEmpty()) {
                    item { SectionTitle("Canais (${results.live.size})") }
                    items(results.live, key = { it.streamId ?: it.hashCode() }) { stream ->
                        ChannelRow(stream.name.orEmpty(), stream.streamIcon, isLive = true, onClick = {
                            val id = stream.streamId ?: return@ChannelRow
                            onPlayLive(id, stream.name.orEmpty())
                        })
                    }
                }
                if (results.movies.isNotEmpty()) {
                    item { SectionTitle("Filmes (${results.movies.size})") }
                    item {
                        LazyRow(contentPadding = PaddingValues(4.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            items(results.movies, key = { it.streamId ?: it.hashCode() }) { movie ->
                                PosterCard(movie.name.orEmpty(), movie.streamIcon, cardWidth = 150.dp, onClick = {
                                    val id = movie.streamId ?: return@PosterCard
                                    onPlayMovie(id, movie.containerExtension ?: "mp4", movie.name.orEmpty())
                                })
                            }
                        }
                    }
                }
                if (results.series.isNotEmpty()) {
                    item { SectionTitle("Séries (${results.series.size})") }
                    item {
                        LazyRow(contentPadding = PaddingValues(4.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            items(results.series, key = { it.seriesId ?: it.hashCode() }) { series ->
                                PosterCard(series.name.orEmpty(), series.cover, subtitle = series.genre, cardWidth = 150.dp, onClick = {
                                    val id = series.seriesId ?: return@PosterCard
                                    onOpenSeries(id, series.name.orEmpty())
                                })
                            }
                        }
                    }
                }
                if (results.live.isEmpty() && results.movies.isEmpty() && results.series.isEmpty()) {
                    item { EmptyBox("Sem resultados para \"${state.searchQuery}\"") }
                }
            }
        }
    }
}

// ─── Adult PIN Dialog ─────────────────────────────────────────

@Composable
private fun AdultPinDialog(
    onConfirm: (String) -> Boolean,
    onDismiss: () -> Unit
) {
    var pin by remember { mutableStateOf("") }
    var error by remember { mutableStateOf(false) }
    val isLandscape = LocalConfiguration.current.orientation == Configuration.ORIENTATION_LANDSCAPE

    fun press(key: String) {
        error = false
        if (key == "⌫") {
            if (pin.isNotEmpty()) pin = pin.dropLast(1)
        } else if (pin.length < 4) {
            pin += key
            if (pin.length == 4) {
                val ok = onConfirm(pin)
                if (!ok) { error = true; pin = "" }
            }
        }
    }

    // Tamanho das teclas adaptado à orientação (menor em paisagem pra caber na altura).
    val keySize = if (isLandscape) 46.dp else 56.dp
    val keyGap  = if (isLandscape) 6.dp else 8.dp

    // Bloco de informações (ícone, título, dots, erro)
    val info: @Composable () -> Unit = {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(if (isLandscape) 8.dp else 12.dp)
        ) {
            Box(
                Modifier.size(if (isLandscape) 48.dp else 56.dp)
                    .clip(RoundedCornerShape(16.dp)).background(BrandBlue.copy(0.15f)),
                contentAlignment = Alignment.Center
            ) { Text("🔞", fontSize = if (isLandscape) 24.sp else 28.sp) }
            Text("Conteúdo Adulto", color = Color.White, fontSize = if (isLandscape) 15.sp else 17.sp, fontWeight = FontWeight.Bold)
            Text("Digite o PIN", color = Color.White.copy(0.5f), fontSize = 12.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                repeat(4) { i ->
                    Box(
                        Modifier.size(14.dp).clip(RoundedCornerShape(7.dp))
                            .background(if (i < pin.length) BrandBlue else Color.White.copy(0.2f))
                    )
                }
            }
            if (error) Text("PIN incorreto", color = ErrorRed, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        }
    }

    // Teclado numérico
    val numpad: @Composable () -> Unit = {
        Column(verticalArrangement = Arrangement.spacedBy(keyGap)) {
            listOf("1 2 3", "4 5 6", "7 8 9", "  0 ⌫").forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(keyGap)) {
                    row.trim().split(" ").forEach { key ->
                        if (key.isBlank()) {
                            Spacer(Modifier.size(keySize))
                        } else {
                            Box(
                                Modifier.size(keySize).clip(RoundedCornerShape(12.dp))
                                    .background(Color.White.copy(0.1f))
                                    .clickable { press(key) },
                                contentAlignment = Alignment.Center
                            ) {
                                Text(key, color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                }
            }
        }
    }

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(
            Modifier
                .clip(RoundedCornerShape(20.dp))
                .background(Color(0xFF1A1A1A))
                .padding(20.dp)
        ) {
            if (isLandscape) {
                // Paisagem: info à esquerda, teclado à direita (cabe na altura reduzida da TV/celular deitado)
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(24.dp)
                    ) {
                        info()
                        numpad()
                    }
                    Spacer(Modifier.height(8.dp))
                    TextButton(onClick = onDismiss) { Text("Cancelar", color = Color.White.copy(0.4f)) }
                }
            } else {
                // Retrato: layout vertical clássico
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    info()
                    numpad()
                    TextButton(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) {
                        Text("Cancelar", color = Color.White.copy(0.4f))
                    }
                }
            }
        }
    }
}

// ─── Shared UI ────────────────────────────────────────────────

@Composable
private fun SectionHeader(title: String, icon: ImageVector, query: String, onQueryChange: (String) -> Unit) {
    Row(
        Modifier.fillMaxWidth().background(Color(0xFF0E0E0E)).padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Icon(icon, null, tint = BrandBlue, modifier = Modifier.size(18.dp))
        Text(title, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 15.sp, modifier = Modifier.weight(1f))
        OutlinedTextField(
            value = query, onValueChange = onQueryChange,
            placeholder = { Text("Buscar…", fontSize = 12.sp) },
            leadingIcon = { Icon(Icons.Filled.Search, null, tint = Color.White.copy(0.4f), modifier = Modifier.size(16.dp)) },
            singleLine = true, colors = searchFieldColors(),
            modifier = Modifier.width(230.dp),
            textStyle = MaterialTheme.typography.bodySmall.copy(color = Color.White, fontSize = 13.sp)
        )
    }
}

@Composable
private fun searchFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = BrandBlue, unfocusedBorderColor = Color.White.copy(0.15f),
    cursorColor = BrandBlue, focusedTextColor = Color.White, unfocusedTextColor = Color.White,
    focusedPlaceholderColor = Color.White.copy(0.4f), unfocusedPlaceholderColor = Color.White.copy(0.4f),
    focusedContainerColor = Color.Transparent, unfocusedContainerColor = Color.Transparent
)

private fun <T> List<T>.filterByQuery(query: String, selector: (T) -> String?): List<T> =
    if (query.isBlank()) this else filter { selector(it)?.contains(query, ignoreCase = true) == true }

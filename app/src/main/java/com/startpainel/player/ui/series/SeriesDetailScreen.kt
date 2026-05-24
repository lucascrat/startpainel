package com.startpainel.player.ui.series

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.startpainel.player.data.model.DownloadRecord
import com.startpainel.player.ui.components.EmptyBox
import com.startpainel.player.ui.components.ErrorBox
import com.startpainel.player.ui.components.FocusableSurface
import com.startpainel.player.ui.components.LoadingBox
import com.startpainel.player.ui.theme.BrandBlue
import com.startpainel.player.ui.theme.ErrorRed
import com.startpainel.player.ui.theme.SuccessGreen

@Composable
fun SeriesDetailScreen(
    seriesId: Int,
    title: String,
    onBack: () -> Unit,
    onPlayEpisode: (url: String, title: String) -> Unit,
    vm: SeriesDetailViewModel = viewModel()
) {
    val state by vm.state.collectAsStateWithLifecycle()

    LaunchedEffect(seriesId) { vm.load(seriesId) }

    Column(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.Filled.ArrowBack, "Voltar", tint = MaterialTheme.colorScheme.onSurface)
            }
            Text(
                state.info?.name ?: title,
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }

        when {
            state.loading -> LoadingBox()
            state.error != null -> ErrorBox(message = state.error!!, onRetry = { vm.load(seriesId) })
            else -> Content(
                state = state,
                seriesTitle = state.info?.name ?: title,
                onSeasonSelect = vm::selectSeason,
                onPlayEpisode = onPlayEpisode,
                vm = vm
            )
        }
    }
}

@Composable
private fun Content(
    state: SeriesDetailState,
    seriesTitle: String,
    onSeasonSelect: (Int) -> Unit,
    onPlayEpisode: (url: String, title: String) -> Unit,
    vm: SeriesDetailViewModel
) {
    val info = state.info
    val account = state.account ?: return
    val season = state.selectedSeason

    // Diálogo de confirmação para deletar download
    var pendingDelete by remember { mutableStateOf<DownloadRecord?>(null) }
    if (pendingDelete != null) {
        DeleteConfirmDialog(
            title = pendingDelete!!.title,
            onConfirm = { vm.removeDownload(pendingDelete!!); pendingDelete = null },
            onDismiss = { pendingDelete = null }
        )
    }

    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // ── Capa + informações da série ──────────────────────────
        item {
            Row(verticalAlignment = Alignment.Top) {
                Box(
                    Modifier
                        .width(130.dp)
                        .aspectRatio(2f / 3f)
                        .clip(RoundedCornerShape(12.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                ) {
                    if (!info?.cover.isNullOrBlank()) {
                        AsyncImage(
                            model = ImageRequest.Builder(LocalContext.current)
                                .data(info?.cover).crossfade(true).build(),
                            contentDescription = null,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize()
                        )
                    }
                }
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        info?.genre.orEmpty(),
                        color = MaterialTheme.colorScheme.secondary,
                        style = MaterialTheme.typography.labelLarge
                    )
                    Text(
                        info?.releaseDate.orEmpty(),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        info?.plot.orEmpty(),
                        color = MaterialTheme.colorScheme.onSurface,
                        style = MaterialTheme.typography.bodyMedium,
                        maxLines = 6,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }

        // ── Chips de temporada ───────────────────────────────────
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(state.seasons) { s ->
                    FilterChip(
                        selected = s == season,
                        onClick = { onSeasonSelect(s) },
                        label = { Text("Temporada $s") },
                        colors = FilterChipDefaults.filterChipColors(
                            containerColor = MaterialTheme.colorScheme.surface,
                            labelColor = MaterialTheme.colorScheme.onSurfaceVariant,
                            selectedContainerColor = BrandBlue,
                            selectedLabelColor = MaterialTheme.colorScheme.onPrimary
                        )
                    )
                }
            }
        }

        // ── Episódios da temporada selecionada ───────────────────
        val episodes = season?.let { state.episodesBySeason[it] }.orEmpty()
        if (episodes.isEmpty()) {
            item { EmptyBox("Sem episódios.") }
        } else {
            items(episodes, key = { it.id ?: it.hashCode() }) { ep ->
                val episodeId = ep.id?.toIntOrNull()
                val ext = ep.containerExtension ?: "mp4"
                val epTitle = "$seriesTitle T${season}E${ep.episodeNum ?: 0}" +
                        if (!ep.title.isNullOrBlank()) " - ${ep.title}" else ""

                EpisodeRow(
                    number = ep.episodeNum ?: 0,
                    title = ep.title.orEmpty(),
                    plot = ep.info?.plot,
                    image = ep.info?.movieImage,
                    isDownloaded = episodeId != null && vm.isDownloaded(episodeId),
                    isDownloading = episodeId != null && vm.isDownloading(episodeId),
                    onClick = {
                        if (episodeId == null) return@EpisodeRow
                        val url = account.seriesStreamUrl(episodeId, ext)
                        onPlayEpisode(url, "$seriesTitle • E${ep.episodeNum}")
                    },
                    onDownload = {
                        if (episodeId == null) return@EpisodeRow
                        vm.startDownload(episodeId, ext, epTitle, ep.info?.movieImage)
                    },
                    onDeleteDownload = {
                        val record = episodeId?.let { vm.getDownloadRecord(it) }
                        if (record != null) pendingDelete = record
                    }
                )
            }
        }
    }
}

// ─── Linha de episódio com botão de download ─────────────────

@Composable
private fun EpisodeRow(
    number: Int,
    title: String,
    plot: String?,
    image: String?,
    isDownloaded: Boolean,
    isDownloading: Boolean,
    onClick: () -> Unit,
    onDownload: () -> Unit,
    onDeleteDownload: () -> Unit
) {
    FocusableSurface(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .background(MaterialTheme.colorScheme.surface)
                .padding(10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Thumbnail do episódio
            Box(
                Modifier
                    .size(width = 110.dp, height = 64.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant)
            ) {
                if (!image.isNullOrBlank()) {
                    AsyncImage(
                        model = ImageRequest.Builder(LocalContext.current)
                            .data(image).crossfade(true).build(),
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize()
                    )
                } else {
                    Icon(
                        Icons.Filled.PlayArrow,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.align(Alignment.Center)
                    )
                }

                // Badge "Baixado" sobre o thumbnail
                if (isDownloaded) {
                    Box(
                        Modifier
                            .align(Alignment.TopStart)
                            .padding(4.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(SuccessGreen.copy(alpha = 0.9f))
                            .padding(horizontal = 5.dp, vertical = 2.dp)
                    ) {
                        Text("Baixado", color = Color.White, fontSize = 8.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }

            Spacer(Modifier.width(12.dp))

            // Título + sinopse
            Column(Modifier.weight(1f)) {
                Text(
                    "E$number${if (title.isNotBlank()) "  ·  $title" else ""}",
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                if (!plot.isNullOrBlank()) {
                    Text(
                        plot,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            Spacer(Modifier.width(4.dp))

            // Botão de download / progresso / deletar
            DownloadButton(
                isDownloaded = isDownloaded,
                isDownloading = isDownloading,
                onDownload = onDownload,
                onDeleteDownload = onDeleteDownload
            )
        }
    }
}

@Composable
private fun DownloadButton(
    isDownloaded: Boolean,
    isDownloading: Boolean,
    onDownload: () -> Unit,
    onDeleteDownload: () -> Unit
) {
    Box(
        Modifier
            .size(40.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(
                when {
                    isDownloaded -> SuccessGreen.copy(alpha = 0.12f)
                    isDownloading -> BrandBlue.copy(alpha = 0.08f)
                    else -> Color.White.copy(alpha = 0.06f)
                }
            )
            // Clique próprio — não propaga para o FocusableSurface pai
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = when {
                    isDownloaded -> onDeleteDownload
                    isDownloading -> { {} }
                    else -> onDownload
                }
            ),
        contentAlignment = Alignment.Center
    ) {
        when {
            isDownloading -> CircularProgressIndicator(
                color = BrandBlue,
                strokeWidth = 2.dp,
                modifier = Modifier.size(20.dp)
            )
            isDownloaded -> Icon(
                Icons.Filled.Delete,
                contentDescription = "Remover download",
                tint = ErrorRed.copy(alpha = 0.75f),
                modifier = Modifier.size(20.dp)
            )
            else -> Icon(
                Icons.Filled.Download,
                contentDescription = "Baixar episódio",
                tint = Color.White.copy(alpha = 0.65f),
                modifier = Modifier.size(20.dp)
            )
        }
    }
}

// ─── Diálogo de confirmação de exclusão ──────────────────────

@Composable
private fun DeleteConfirmDialog(
    title: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Remover download") },
        text = { Text("Deseja remover \"$title\" dos downloads?") },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text("Remover", color = ErrorRed)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancelar")
            }
        }
    )
}

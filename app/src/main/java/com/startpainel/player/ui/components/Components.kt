package com.startpainel.player.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.FiberManualRecord
import androidx.compose.material.icons.filled.LiveTv
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.startpainel.player.ui.theme.Background
import com.startpainel.player.ui.theme.BrandBlue
import com.startpainel.player.ui.theme.LiveRed
import com.startpainel.player.ui.theme.SuccessGreen
import com.startpainel.player.ui.theme.SurfaceLight
import com.startpainel.player.ui.theme.SurfaceMid

// ─────────────────────────────────────────────────────────────
// Focus-aware pressable surface (TV D-pad + touch)
// ─────────────────────────────────────────────────────────────

@Composable
fun FocusableSurface(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit
) {
    val interaction = remember { MutableInteractionSource() }
    val isFocused by interaction.collectIsFocusedAsState()
    val scale by animateFloatAsState(
        targetValue = if (isFocused) 1.06f else 1f,
        animationSpec = tween(150),
        label = "fs"
    )
    Box(
        modifier = modifier
            .scale(scale)
            .clip(RoundedCornerShape(10.dp))
            .border(2.dp, if (isFocused) BrandBlue else Color.Transparent, RoundedCornerShape(10.dp))
            .clickable(interactionSource = interaction, indication = null, onClick = onClick)
    ) { content() }
}

// ─────────────────────────────────────────────────────────────
// Shimmer skeleton
// ─────────────────────────────────────────────────────────────

@Composable
fun ShimmerBox(modifier: Modifier = Modifier) {
    val transition = rememberInfiniteTransition(label = "shimmer")
    val x by transition.animateFloat(
        initialValue = -600f, targetValue = 600f,
        animationSpec = infiniteRepeatable(tween(1400, easing = LinearEasing), RepeatMode.Restart),
        label = "sx"
    )
    val brush = Brush.linearGradient(
        colors = listOf(
            Color.White.copy(alpha = 0.03f),
            Color.White.copy(alpha = 0.12f),
            Color.White.copy(alpha = 0.03f)
        ),
        start = Offset(x, 0f),
        end = Offset(x + 400f, 400f)
    )
    Box(modifier = modifier.background(SurfaceMid).background(brush))
}

@Composable
fun ShimmerPoster(modifier: Modifier = Modifier) {
    ShimmerBox(modifier.aspectRatio(2f / 3f).clip(RoundedCornerShape(10.dp)))
}

@Composable
fun ShimmerHero(modifier: Modifier = Modifier) {
    ShimmerBox(modifier.fillMaxWidth().height(220.dp))
}

@Composable
fun ShimmerChannelRow(modifier: Modifier = Modifier) {
    Row(modifier.padding(horizontal = 16.dp, vertical = 6.dp), Arrangement.spacedBy(8.dp)) {
        repeat(6) {
            ShimmerBox(
                Modifier
                    .size(width = 90.dp, height = 60.dp)
                    .clip(RoundedCornerShape(10.dp))
            )
        }
    }
}

// ─────────────────────────────────────────────────────────────
// Hero item model
// ─────────────────────────────────────────────────────────────

data class HeroItem(
    val title: String,
    val imageUrl: String?,
    val genre: String?,
    val rating: String?,
    val isLive: Boolean = false
)

// ─────────────────────────────────────────────────────────────
// TV Hero Banner — layout horizontal (info esquerda, imagem direita)
// ─────────────────────────────────────────────────────────────

@Composable
fun HeroBanner(
    item: HeroItem,
    onPlay: () -> Unit,
    onInfo: (() -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    Box(
        modifier
            .fillMaxWidth()
            .height(220.dp)
            .background(Color(0xFF0A0A0A))
    ) {
        // Imagem de fundo com gradiente
        if (!item.imageUrl.isNullOrBlank()) {
            Row(Modifier.fillMaxSize()) {
                Spacer(Modifier.weight(0.38f))
                Box(Modifier.weight(0.62f).fillMaxHeight()) {
                    AsyncImage(
                        model = ImageRequest.Builder(LocalContext.current)
                            .data(item.imageUrl).crossfade(400).build(),
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize()
                    )
                    // Gradiente horizontal da esquerda
                    Box(
                        Modifier.fillMaxSize().background(
                            Brush.horizontalGradient(
                                0f to Color(0xFF0A0A0A),
                                0.35f to Color(0xFF0A0A0A).copy(alpha = 0.7f),
                                1f to Color.Transparent
                            )
                        )
                    )
                }
            }
        }

        // Gradiente de fundo geral
        Box(
            Modifier.fillMaxSize().background(
                Brush.horizontalGradient(
                    0f to Color(0xFF0A0A0A),
                    0.55f to Color.Transparent
                )
            )
        )

        // Conteúdo da esquerda
        Column(
            Modifier
                .fillMaxHeight()
                .fillMaxWidth(0.52f)
                .padding(horizontal = 28.dp, vertical = 20.dp),
            verticalArrangement = Arrangement.Center
        ) {
            if (item.isLive) {
                LiveBadge()
                Spacer(Modifier.height(8.dp))
            }
            Text(
                item.title,
                color = Color.White,
                fontSize = 24.sp,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                lineHeight = 28.sp
            )
            if (!item.genre.isNullOrBlank() || !item.rating.isNullOrBlank()) {
                Spacer(Modifier.height(6.dp))
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    if (!item.rating.isNullOrBlank()) {
                        Text("★ ${item.rating}", color = Color(0xFFFFC300), fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    }
                    if (!item.genre.isNullOrBlank()) {
                        Text(item.genre, color = Color.White.copy(0.6f), fontSize = 12.sp)
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(
                    onClick = onPlay,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color.White,
                        contentColor = Color.Black
                    ),
                    shape = RoundedCornerShape(8.dp),
                    contentPadding = PaddingValues(horizontal = 20.dp, vertical = 10.dp)
                ) {
                    Icon(Icons.Filled.PlayArrow, null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Assistir", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                }
                if (onInfo != null) {
                    OutlinedButton(
                        onClick = onInfo,
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                        border = androidx.compose.foundation.BorderStroke(1.5.dp, Color.White.copy(0.5f)),
                        shape = RoundedCornerShape(8.dp),
                        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 10.dp)
                    ) {
                        Text("Mais info", fontSize = 13.sp)
                    }
                }
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────
// Horizontal content row  (Netflix-style)
// ─────────────────────────────────────────────────────────────

@Composable
fun <T> ContentRow(
    title: String,
    items: List<T>,
    key: (T) -> Any,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    loading: Boolean = false,
    card: @Composable (T) -> Unit
) {
    Column(modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.padding(start = 16.dp, bottom = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            if (icon != null) {
                Icon(icon, null, tint = BrandBlue, modifier = Modifier.size(18.dp))
            }
            Text(
                title,
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = Color.White
            )
        }
        if (loading) {
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(8) { ShimmerPoster(Modifier.width(150.dp)) }
            }
        } else {
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(items, key = key) { item -> card(item) }
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────
// Poster card with gradient overlay
// ─────────────────────────────────────────────────────────────

@Composable
fun PosterCard(
    title: String,
    imageUrl: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    cardWidth: Dp = 130.dp,
    subtitle: String? = null,
    badge: String? = null,
    isDownloaded: Boolean = false,
    isDownloading: Boolean = false,
    onDownload: (() -> Unit)? = null
) {
    FocusableSurface(onClick = onClick, modifier = modifier) {
        Box(
            Modifier
                .width(cardWidth)
                .aspectRatio(2f / 3f)
                .clip(RoundedCornerShape(10.dp))
                .background(SurfaceMid)
        ) {
            if (!imageUrl.isNullOrBlank()) {
                AsyncImage(
                    model = ImageRequest.Builder(LocalContext.current)
                        .data(imageUrl).crossfade(true).build(),
                    contentDescription = title,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize()
                )
            } else {
                Icon(
                    Icons.Filled.Movie, null,
                    tint = Color.White.copy(0.2f),
                    modifier = Modifier.align(Alignment.Center).size(36.dp)
                )
            }
            // Gradient overlay
            Box(
                Modifier.fillMaxSize().background(
                    Brush.verticalGradient(
                        0f to Color.Transparent,
                        0.5f to Color.Transparent,
                        1f to Color.Black.copy(alpha = 0.88f)
                    )
                )
            )
            // Ícone de download (canto superior direito)
            if (onDownload != null || isDownloaded || isDownloading) {
                Box(
                    Modifier
                        .align(Alignment.TopEnd)
                        .padding(6.dp)
                        .size(26.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color.Black.copy(0.6f))
                        .then(if (onDownload != null && !isDownloaded && !isDownloading)
                            Modifier.clickable(onClick = onDownload) else Modifier),
                    contentAlignment = Alignment.Center
                ) {
                    when {
                        isDownloaded -> Icon(Icons.Filled.CheckCircle, null, tint = SuccessGreen, modifier = Modifier.size(16.dp))
                        isDownloading -> CircularProgressIndicator(color = Color.White, strokeWidth = 1.5.dp, modifier = Modifier.size(14.dp))
                        else -> Icon(Icons.Filled.Download, null, tint = Color.White.copy(0.85f), modifier = Modifier.size(16.dp))
                    }
                }
            }
            Column(Modifier.align(Alignment.BottomStart).padding(8.dp)) {
                if (!badge.isNullOrBlank()) {
                    Text(
                        badge,
                        color = Color(0xFFFFC300),
                        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                        modifier = Modifier.padding(bottom = 2.dp)
                    )
                }
                Text(
                    title,
                    color = Color.White,
                    style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                if (!subtitle.isNullOrBlank()) {
                    Text(
                        subtitle,
                        color = Color.White.copy(0.55f),
                        style = MaterialTheme.typography.labelSmall,
                        maxLines = 1
                    )
                }
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────
// Channel card (compact, for live row)
// ─────────────────────────────────────────────────────────────

@Composable
fun ChannelCard(
    name: String,
    logoUrl: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    FocusableSurface(onClick = onClick, modifier = modifier) {
        Column(
            Modifier
                .width(100.dp)
                .background(SurfaceMid, RoundedCornerShape(10.dp))
                .padding(8.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Box(
                Modifier
                    .size(60.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(SurfaceLight),
                contentAlignment = Alignment.Center
            ) {
                if (!logoUrl.isNullOrBlank()) {
                    AsyncImage(
                        model = ImageRequest.Builder(LocalContext.current)
                            .data(logoUrl).crossfade(true).build(),
                        contentDescription = name,
                        contentScale = ContentScale.Fit,
                        modifier = Modifier.fillMaxSize().padding(6.dp)
                    )
                } else {
                    Icon(Icons.Filled.Tv, null, tint = Color.White.copy(0.3f), modifier = Modifier.size(28.dp))
                }
            }
            Spacer(Modifier.height(6.dp))
            Text(
                name,
                color = Color.White.copy(0.85f),
                style = MaterialTheme.typography.labelSmall,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center
            )
        }
    }
}

// ─────────────────────────────────────────────────────────────
// Channel row (TV-optimized, full-width)
// ─────────────────────────────────────────────────────────────

@Composable
fun ChannelRow(
    name: String,
    logoUrl: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    epgNow: String? = null,
    isLive: Boolean = false,
    // ── Gravação ao vivo ──────────────────────────────────────
    isRecording: Boolean = false,          // este canal está sendo gravado agora
    canRecord: Boolean = false,            // mostrar botão de gravar (true = aba Ao Vivo)
    onRecord: (() -> Unit)? = null,        // callback ao tocar "gravar"
    onStopRecord: (() -> Unit)? = null     // callback ao tocar "parar"
) {
    FocusableSurface(onClick = onClick, modifier = modifier) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    if (isRecording) Color(0xFF2D0A0A)   // fundo vermelho escuro quando gravando
                    else SurfaceMid
                )
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // ── Logo / Ícone ───────────────────────────────────
            Box(
                Modifier
                    .size(52.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(SurfaceLight),
                contentAlignment = Alignment.Center
            ) {
                if (!logoUrl.isNullOrBlank()) {
                    AsyncImage(
                        model = ImageRequest.Builder(LocalContext.current)
                            .data(logoUrl).crossfade(true).build(),
                        contentDescription = name,
                        contentScale = ContentScale.Fit,
                        modifier = Modifier.fillMaxSize().padding(6.dp)
                    )
                } else {
                    Icon(Icons.Filled.LiveTv, null, tint = Color.White.copy(0.3f))
                }
            }
            Spacer(Modifier.width(14.dp))

            // ── Nome + EPG ─────────────────────────────────────
            Column(Modifier.weight(1f)) {
                Text(
                    name,
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
                    color = Color.White,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                if (isRecording) {
                    Text(
                        "🔴 Gravando…",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color(0xFFFF5555),
                        maxLines = 1
                    )
                } else if (!epgNow.isNullOrBlank()) {
                    Text(epgNow, style = MaterialTheme.typography.bodySmall, color = Color.White.copy(0.5f), maxLines = 1)
                }
            }

            // ── Badges + Botão Gravar ─────────────────────────
            Spacer(Modifier.width(8.dp))
            if (isLive) LiveBadge()

            if (canRecord) {
                Spacer(Modifier.width(8.dp))
                if (isRecording) {
                    // Botão PARAR (pulsante vermelho)
                    RecordStopButton(onClick = {
                        onStopRecord?.invoke()
                    })
                } else {
                    // Botão GRAVAR
                    RecordStartButton(onClick = {
                        onRecord?.invoke()
                    })
                }
            }
        }
    }
}

// ── Botão ⏺ Gravar ────────────────────────────────────────────

@Composable
private fun RecordStartButton(onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(36.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(Color(0xFF1A1A1A))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick
            ),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            Icons.Filled.FiberManualRecord,
            contentDescription = "Gravar",
            tint = Color(0xFFE53935),
            modifier = Modifier.size(20.dp)
        )
    }
}

// ── Botão ⏹ Parar gravação (ícone pisca) ─────────────────────

@Composable
private fun RecordStopButton(onClick: () -> Unit) {
    val transition = rememberInfiniteTransition(label = "rec_blink")
    val alpha by transition.animateFloat(
        initialValue = 1f, targetValue = 0.3f,
        animationSpec = infiniteRepeatable(
            animation = tween(600),
            repeatMode = RepeatMode.Reverse
        ),
        label = "blink"
    )
    Box(
        modifier = Modifier
            .size(36.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(Color(0xFFE53935))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick
            ),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            Icons.Filled.Stop,
            contentDescription = "Parar gravação",
            tint = Color.White.copy(alpha = alpha),
            modifier = Modifier.size(20.dp)
        )
    }
}

// ─────────────────────────────────────────────────────────────
// Live badge
// ─────────────────────────────────────────────────────────────

@Composable
fun LiveBadge() {
    Box(
        Modifier
            .background(LiveRed, RoundedCornerShape(4.dp))
            .padding(horizontal = 6.dp, vertical = 2.dp)
    ) {
        Text(
            "AO VIVO",
            color = Color.White,
            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.ExtraBold)
        )
    }
}

// ─────────────────────────────────────────────────────────────
// Section title
// ─────────────────────────────────────────────────────────────

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.ExtraBold),
        color = Color.White,
        modifier = modifier.padding(horizontal = 16.dp, vertical = 10.dp)
    )
}

// ─────────────────────────────────────────────────────────────
// States
// ─────────────────────────────────────────────────────────────

@Composable
fun LoadingBox(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize(), Alignment.Center) {
        CircularProgressIndicator(color = BrandBlue, modifier = Modifier.size(36.dp))
    }
}

@Composable
fun ErrorBox(message: String, onRetry: (() -> Unit)? = null, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize().padding(24.dp), Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text(message, color = MaterialTheme.colorScheme.error, textAlign = TextAlign.Center)
            if (onRetry != null) {
                Button(
                    onClick = onRetry,
                    colors = ButtonDefaults.buttonColors(containerColor = BrandBlue)
                ) { Text("Tentar novamente") }
            }
        }
    }
}

@Composable
fun EmptyBox(message: String, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize(), Alignment.Center) {
        Text(message, color = Color.White.copy(0.4f), style = MaterialTheme.typography.bodyLarge)
    }
}

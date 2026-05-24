package com.startpainel.player.ui.player

import android.app.Activity
import android.view.WindowManager
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Forward10
import androidx.compose.material.icons.filled.PictureInPicture
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Replay10
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import com.startpainel.player.ui.theme.BrandBlue
import com.startpainel.player.ui.theme.LiveRed
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun PlayerScreen(
    streamUrl: String,
    title: String,
    isLive: Boolean,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val activity = context as? Activity
    val scope = rememberCoroutineScope()
    val isInPip by PipController.isInPip.collectAsState()

    DisposableEffect(Unit) {
        PipController.isPlayerOpen = true
        val window = activity?.window
        window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        onDispose {
            PipController.isPlayerOpen = false
            window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    val exoPlayer = remember {
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(streamUrl))
            playWhenReady = true
            prepare()
        }
    }

    var isPlaying      by remember { mutableStateOf(true) }
    var isBuffering    by remember { mutableStateOf(true) }
    var position       by remember { mutableLongStateOf(0L) }
    var duration       by remember { mutableLongStateOf(0L) }
    var controlsVisible by remember { mutableStateOf(true) }
    var statusMsg      by remember { mutableStateOf<String?>(null) }
    var retryCount     by remember { mutableIntStateOf(0) }
    val maxRetries = 5

    DisposableEffect(exoPlayer) {
        val listener = object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                isBuffering = state == Player.STATE_BUFFERING
                if (state == Player.STATE_READY) {
                    duration   = exoPlayer.duration.coerceAtLeast(0L)
                    statusMsg  = null
                    retryCount = 0
                }
            }
            override fun onIsPlayingChanged(playing: Boolean) { isPlaying = playing }
            override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                if (retryCount < maxRetries) {
                    scope.launch {
                        retryCount++
                        statusMsg = "Reconectando… ($retryCount/$maxRetries)"
                        delay(3_000L)
                        exoPlayer.setMediaItem(MediaItem.fromUri(streamUrl))
                        exoPlayer.prepare()
                        exoPlayer.playWhenReady = true
                    }
                } else {
                    statusMsg = "Não foi possível reproduzir. Tente outro canal."
                }
            }
        }
        exoPlayer.addListener(listener)
        onDispose { exoPlayer.removeListener(listener); exoPlayer.release() }
    }

    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_PAUSE && !isInPip) exoPlayer.pause()
            if (event == Lifecycle.Event.ON_RESUME) exoPlayer.play()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    LaunchedEffect(isPlaying) {
        while (true) { position = exoPlayer.currentPosition.coerceAtLeast(0L); delay(500) }
    }

    LaunchedEffect(controlsVisible, isPlaying) {
        if (controlsVisible && isPlaying && !isInPip) { delay(4_000); controlsVisible = false }
    }

    BackHandler { if (!isInPip) onBack() }

    Box(
        Modifier
            .fillMaxSize()
            .background(Color.Black)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null
            ) { if (!isInPip) controlsVisible = !controlsVisible }
    ) {
        // Video surface
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx ->
                PlayerView(ctx).apply {
                    player = exoPlayer
                    useController = false
                    resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                }
            }
        )

        // Buffering spinner
        if (isBuffering && statusMsg == null && !isInPip) {
            CircularProgressIndicator(
                color = BrandBlue,
                strokeWidth = 3.dp,
                modifier = Modifier.align(Alignment.Center)
            )
        }

        // Status overlay (reconectando / erro)
        if (statusMsg != null && !isInPip) {
            Box(
                Modifier
                    .align(Alignment.Center)
                    .clip(RoundedCornerShape(16.dp))
                    .background(Color.Black.copy(alpha = 0.75f))
                    .padding(horizontal = 28.dp, vertical = 20.dp)
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    if (retryCount < maxRetries) {
                        CircularProgressIndicator(color = BrandBlue, strokeWidth = 3.dp, modifier = Modifier.size(36.dp))
                        Spacer(Modifier.height(12.dp))
                    }
                    Text(statusMsg!!, color = Color.White, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }

        // Controls (hidden in PiP)
        if (!isInPip) {
            AnimatedVisibility(
                visible = controlsVisible,
                enter = fadeIn(),
                exit  = fadeOut(),
                modifier = Modifier.fillMaxSize()
            ) {
                PlayerControls(
                    title        = title,
                    isLive       = isLive,
                    isPlaying    = isPlaying,
                    position     = position,
                    duration     = duration,
                    onBack       = onBack,
                    onPlayPause  = { if (exoPlayer.isPlaying) exoPlayer.pause() else exoPlayer.play() },
                    onSeek       = { exoPlayer.seekTo(it.toLong()) },
                    onRewind     = { exoPlayer.seekTo((exoPlayer.currentPosition - 10_000).coerceAtLeast(0)) },
                    onForward    = { exoPlayer.seekTo(exoPlayer.currentPosition + 10_000) },
                    onEnterPip   = { activity?.let { PipController.enterPip(it) } }
                )
            }
        }
    }
}

@Composable
private fun PlayerControls(
    title: String,
    isLive: Boolean,
    isPlaying: Boolean,
    position: Long,
    duration: Long,
    onBack: () -> Unit,
    onPlayPause: () -> Unit,
    onSeek: (Float) -> Unit,
    onRewind: () -> Unit,
    onForward: () -> Unit,
    onEnterPip: () -> Unit
) {
    Box(Modifier.fillMaxSize()) {
        // Top gradient bar
        Box(
            Modifier
                .fillMaxWidth()
                .background(
                    Brush.verticalGradient(
                        listOf(Color.Black.copy(0.75f), Color.Transparent)
                    )
                )
                .statusBarsPadding()
                .padding(horizontal = 4.dp, vertical = 4.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.Filled.ArrowBack, "Voltar", tint = Color.White)
                }
                Text(
                    title,
                    color = Color.White,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 16.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )
                if (isLive) {
                    Box(
                        Modifier
                            .background(LiveRed, RoundedCornerShape(4.dp))
                            .padding(horizontal = 8.dp, vertical = 3.dp)
                    ) {
                        Text("● AO VIVO", color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 11.sp)
                    }
                    Spacer(Modifier.width(4.dp))
                }
                IconButton(onClick = onEnterPip) {
                    Icon(Icons.Filled.PictureInPicture, "PiP", tint = Color.White)
                }
            }
        }

        // Center controls
        Row(
            Modifier.align(Alignment.Center),
            horizontalArrangement = Arrangement.spacedBy(24.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (!isLive) {
                IconButton(onClick = onRewind, modifier = Modifier.size(52.dp)) {
                    Icon(Icons.Filled.Replay10, "−10s", tint = Color.White, modifier = Modifier.size(36.dp))
                }
            }
            Box(
                Modifier
                    .size(64.dp)
                    .clip(CircleShape)
                    .background(Color.White.copy(0.15f))
                    .clickable(onClick = onPlayPause),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(36.dp)
                )
            }
            if (!isLive) {
                IconButton(onClick = onForward, modifier = Modifier.size(52.dp)) {
                    Icon(Icons.Filled.Forward10, "+10s", tint = Color.White, modifier = Modifier.size(36.dp))
                }
            }
        }

        // Bottom gradient bar
        Column(
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .background(
                    Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(0.8f)))
                )
                .padding(horizontal = 16.dp, vertical = 12.dp)
        ) {
            if (!isLive && duration > 0) {
                Slider(
                    value = position.coerceAtMost(duration).toFloat(),
                    onValueChange = onSeek,
                    valueRange = 0f..duration.toFloat(),
                    colors = SliderDefaults.colors(
                        thumbColor       = BrandBlue,
                        activeTrackColor = BrandBlue,
                        inactiveTrackColor = Color.White.copy(0.3f)
                    )
                )
                Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween) {
                    Text(formatTime(position), color = Color.White.copy(0.7f), fontSize = 12.sp)
                    Text(formatTime(duration), color = Color.White.copy(0.7f), fontSize = 12.sp)
                }
            } else if (isLive) {
                LinearProgressIndicator(
                    modifier = Modifier.fillMaxWidth().height(2.dp),
                    color = LiveRed,
                    trackColor = Color.White.copy(0.2f)
                )
            }
        }
    }
}

private fun formatTime(ms: Long): String {
    val s = ms / 1000
    val h = s / 3600
    val m = (s % 3600) / 60
    val sec = s % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, sec) else "%d:%02d".format(m, sec)
}

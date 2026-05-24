package com.startpainel.player.navigation

import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.startpainel.player.ServiceLocator
import com.startpainel.player.data.remote.M3uLeaseManager
import com.startpainel.player.ui.home.HomeScreen
import com.startpainel.player.ui.login.LoginScreen
import com.startpainel.player.ui.player.PlayerScreen
import com.startpainel.player.ui.series.SeriesDetailScreen
import kotlinx.coroutines.flow.first

object Routes {
    const val LOGIN = "login"
    const val HOME = "home"
    const val SERIES_DETAIL = "series/{id}/{title}"
    const val PLAYER = "player/{url}/{title}/{live}"

    fun seriesDetail(id: Int, title: String): String =
        "series/$id/${Uri.encode(title)}"

    fun player(url: String, title: String, isLive: Boolean): String =
        "player/${Uri.encode(url)}/${Uri.encode(title)}/$isLive"
}

@Composable
fun PainelNavGraph() {
    val context = LocalContext.current
    val store      = remember { ServiceLocator.credentialsStore(context) }
    val leaseStore = remember { ServiceLocator.m3uLeaseStore(context) }
    val account by store.account.collectAsState(initial = null)

    val navController = rememberNavController()
    var startDestination by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        val initial = store.account.first()

        // Se há uma lease M3U salva, reinicia o heartbeat ao abrir o app
        val savedLease = leaseStore.lease.first()
        if (savedLease != null && !M3uLeaseManager.hasActiveLease) {
            M3uLeaseManager.start(
                code       = savedLease.code,
                leaseId    = savedLease.leaseId,
                repository = ServiceLocator.panelRepository(),
            )
        }

        startDestination = if (initial != null) Routes.HOME else Routes.LOGIN
    }

    val start = startDestination ?: return

    fun playWithAd(destination: String) {
        navController.navigate(destination)
    }

    NavHost(navController = navController, startDestination = start) {
        composable(Routes.LOGIN) {
            LoginScreen(
                onLoggedIn = {
                    navController.navigate(Routes.HOME) {
                        popUpTo(Routes.LOGIN) { inclusive = true }
                    }
                }
            )
        }

        composable(Routes.HOME) {
            HomeScreen(
                onPlayLive = { streamId, title ->
                    val acc = account ?: return@HomeScreen
                    val url = acc.liveStreamUrl(streamId)
                    playWithAd(Routes.player(url, title, isLive = true))
                },
                onPlayMovie = { streamId, ext, title ->
                    val acc = account ?: return@HomeScreen
                    val url = acc.movieStreamUrl(streamId, ext)
                    playWithAd(Routes.player(url, title, isLive = false))
                },
                onOpenSeries = { id, title ->
                    navController.navigate(Routes.seriesDetail(id, title))
                },
                onPlayLocal = { uri, title ->
                    navController.navigate(Routes.player(uri, title, isLive = false))
                },
                onLogout = {
                    // Libera lease M3U ao fazer logout explícito
                    M3uLeaseManager.release()
                    navController.navigate(Routes.LOGIN) {
                        popUpTo(0)
                    }
                }
            )
        }

        composable(
            route = Routes.SERIES_DETAIL,
            arguments = listOf(
                navArgument("id") { type = NavType.IntType },
                navArgument("title") { type = NavType.StringType }
            )
        ) { entry ->
            val id = entry.arguments?.getInt("id") ?: return@composable
            val title = Uri.decode(entry.arguments?.getString("title").orEmpty())
            SeriesDetailScreen(
                seriesId = id,
                title = title,
                onBack = { navController.popBackStack() },
                onPlayEpisode = { url, episodeTitle ->
                    playWithAd(Routes.player(url, episodeTitle, isLive = false))
                }
            )
        }

        composable(
            route = Routes.PLAYER,
            arguments = listOf(
                navArgument("url") { type = NavType.StringType },
                navArgument("title") { type = NavType.StringType },
                navArgument("live") { type = NavType.BoolType }
            )
        ) { entry ->
            val url   = Uri.decode(entry.arguments?.getString("url").orEmpty())
            val title = Uri.decode(entry.arguments?.getString("title").orEmpty())
            val live  = entry.arguments?.getBoolean("live") ?: false
            PlayerScreen(
                streamUrl = url,
                title     = title,
                isLive    = live,
                onBack    = { navController.popBackStack() }
            )
        }
    }
}

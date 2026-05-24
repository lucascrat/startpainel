package com.startpainel.player

import android.content.Context
import com.startpainel.player.data.local.ContentCacheStore
import com.startpainel.player.data.local.CredentialsStore
import com.startpainel.player.data.local.DownloadsStore
import com.startpainel.player.data.local.M3uLeaseStore
import com.startpainel.player.data.local.RecordingsStore
import com.startpainel.player.data.remote.PanelRepository
import com.startpainel.player.data.remote.XtreamRepository

/**
 * Tiny manual DI container. No Hilt — keeps the app light and the build fast.
 */
object ServiceLocator {

    // URL do painel StartPainel — altere antes de compilar se o domínio mudar
    const val PANEL_URL = "https://atendimento.appbr.pro"

    @Volatile private var credentialsStoreRef: CredentialsStore? = null
    @Volatile private var repositoryRef: XtreamRepository? = null
    @Volatile private var panelRepositoryRef: PanelRepository? = null
    @Volatile private var downloadsStoreRef: DownloadsStore? = null
    @Volatile private var recordingsStoreRef: RecordingsStore? = null
    @Volatile private var contentCacheRef: ContentCacheStore? = null
    @Volatile private var m3uLeaseStoreRef: M3uLeaseStore? = null

    fun credentialsStore(context: Context): CredentialsStore =
        credentialsStoreRef ?: synchronized(this) {
            credentialsStoreRef ?: CredentialsStore(context.applicationContext).also {
                credentialsStoreRef = it
            }
        }

    fun repository(): XtreamRepository =
        repositoryRef ?: synchronized(this) {
            repositoryRef ?: XtreamRepository().also { repositoryRef = it }
        }

    fun panelRepository(): PanelRepository =
        panelRepositoryRef ?: synchronized(this) {
            panelRepositoryRef ?: PanelRepository(PANEL_URL).also { panelRepositoryRef = it }
        }

    fun downloadsStore(context: Context): DownloadsStore =
        downloadsStoreRef ?: synchronized(this) {
            downloadsStoreRef ?: DownloadsStore(context.applicationContext).also { downloadsStoreRef = it }
        }

    fun recordingsStore(context: Context): RecordingsStore =
        recordingsStoreRef ?: synchronized(this) {
            recordingsStoreRef ?: RecordingsStore(context.applicationContext).also {
                recordingsStoreRef = it
            }
        }

    fun contentCache(context: Context): ContentCacheStore =
        contentCacheRef ?: synchronized(this) {
            contentCacheRef ?: ContentCacheStore(context.applicationContext).also { contentCacheRef = it }
        }

    fun m3uLeaseStore(context: Context): M3uLeaseStore =
        m3uLeaseStoreRef ?: synchronized(this) {
            m3uLeaseStoreRef ?: M3uLeaseStore(context.applicationContext).also {
                m3uLeaseStoreRef = it
            }
        }
}

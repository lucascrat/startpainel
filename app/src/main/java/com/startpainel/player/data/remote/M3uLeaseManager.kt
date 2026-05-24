package com.startpainel.player.data.remote

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Singleton que gerencia o heartbeat de uma lease M3U ativa.
 *
 * Ciclo de vida:
 *  - start() → chamado após login com código bem-sucedido
 *  - stop()  → cancela heartbeat (sem enviar release — servidor libera após 5 min)
 *  - release() → envia release explícito + para heartbeat (chamado no logout/destroy)
 */
object M3uLeaseManager {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var heartbeatJob: Job? = null

    var currentCode: String? = null
        private set
    var currentLeaseId: Int? = null
        private set
    private var repoRef: PanelRepository? = null

    val hasActiveLease: Boolean
        get() = currentCode != null && currentLeaseId != null

    /** Inicia (ou reinicia) o heartbeat para a lease informada. */
    fun start(code: String, leaseId: Int, repository: PanelRepository) {
        currentCode    = code
        currentLeaseId = leaseId
        repoRef        = repository

        heartbeatJob?.cancel()
        heartbeatJob = null
        resumeHeartbeat()
    }

    /**
     * Para o heartbeat sem enviar release (quando app vai para background).
     * O servidor auto-libera após 5 min sem heartbeat.
     */
    fun stop() {
        heartbeatJob?.cancel()
        heartbeatJob = null
    }

    /**
     * Retoma o heartbeat quando o app volta do background.
     * Só age se há uma lease ativa (currentCode/currentLeaseId definidos).
     */
    fun resumeHeartbeat() {
        val code    = currentCode    ?: return
        val leaseId = currentLeaseId ?: return
        val repo    = repoRef        ?: return
        if (heartbeatJob?.isActive == true) return // já está rodando

        heartbeatJob = scope.launch {
            // Envia um heartbeat imediato ao retornar do background para renovar a lease
            try { repo.m3uHeartbeat(code, leaseId) } catch (_: Exception) { }
            while (isActive) {
                delay(40_000L) // 40s — servidor libera após 100s sem heartbeat
                try { repo.m3uHeartbeat(code, leaseId) } catch (_: Exception) { }
            }
        }
    }

    /**
     * Envia release explícito ao servidor de forma assíncrona (fire-and-forget).
     * Usar apenas quando o processo ainda vai continuar rodando depois (ex: logout).
     */
    fun release() {
        val code      = currentCode    ?: return
        val leaseId   = currentLeaseId ?: return
        val repo      = repoRef        ?: return

        heartbeatJob?.cancel()
        heartbeatJob   = null
        currentCode    = null
        currentLeaseId = null

        scope.launch {
            try { repo.m3uRelease(code, leaseId) } catch (_: Exception) { /* best-effort */ }
        }
    }

    /**
     * Envia release explícito de forma **síncrona** (suspend).
     * Usar em onDestroy() via runBlocking para garantir que a request seja enviada
     * antes do processo ser encerrado pelo Android.
     */
    suspend fun releaseSync() {
        val code    = currentCode    ?: return
        val leaseId = currentLeaseId ?: return
        val repo    = repoRef        ?: return

        heartbeatJob?.cancel()
        heartbeatJob   = null
        currentCode    = null
        currentLeaseId = null

        try {
            withContext(Dispatchers.IO) {
                repo.m3uRelease(code, leaseId)
            }
        } catch (_: Exception) { /* best-effort */ }
    }
}

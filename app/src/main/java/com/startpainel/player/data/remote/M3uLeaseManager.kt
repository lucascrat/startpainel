package com.startpainel.player.data.remote

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

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
        heartbeatJob = scope.launch {
            while (isActive) {
                delay(150_000L) // 2.5 minutos
                try {
                    repository.m3uHeartbeat(code, leaseId)
                } catch (_: Exception) { /* falha silenciosa — servidor libera após 5 min */ }
            }
        }
    }

    /** Para o heartbeat sem enviar release (servidor auto-libera após 5 min sem heartbeat). */
    fun stop() {
        heartbeatJob?.cancel()
        heartbeatJob = null
    }

    /**
     * Envia release explícito ao servidor e para o heartbeat.
     * Deve ser chamado no logout ou ao fechar o app definitivamente.
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
}

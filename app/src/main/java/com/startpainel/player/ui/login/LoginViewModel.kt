package com.startpainel.player.ui.login

import android.app.Application
import android.provider.Settings
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.startpainel.player.ServiceLocator
import com.startpainel.player.data.local.M3uLease
import com.startpainel.player.data.model.Account
import com.startpainel.player.data.remote.M3uLeaseManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LoginUiState(
    // Modo Xtream (padrão)
    val username: String = "",
    val password: String = "",
    // Modo código M3U
    val isCodeMode: Boolean = false,
    val accessCode: String = "",
    // Estado compartilhado
    val loading: Boolean = false,
    val error: String? = null,
    val success: Boolean = false,
    val whatsappNumber: String? = null,
)

class LoginViewModel(app: Application) : AndroidViewModel(app) {

    private val store      = ServiceLocator.credentialsStore(app)
    private val leaseStore = ServiceLocator.m3uLeaseStore(app)
    private val panelRepo  = ServiceLocator.panelRepository()

    /** Device ID estável para identificar o aparelho no pool M3U. */
    private val deviceId: String by lazy {
        Settings.Secure.getString(app.contentResolver, Settings.Secure.ANDROID_ID) ?: "unknown"
    }

    private val _state = MutableStateFlow(LoginUiState())
    val state: StateFlow<LoginUiState> = _state.asStateFlow()

    init {
        // Carrega o número de WhatsApp de suporte do painel (endpoint público)
        viewModelScope.launch {
            panelRepo.fetchSetting("whatsapp_support")
                .onSuccess { number ->
                    if (!number.isNullOrBlank()) {
                        _state.update { it.copy(whatsappNumber = number.trim()) }
                    }
                }
        }
    }

    // ── Modo Xtream ───────────────────────────────────────────────────────────

    fun onUserChange(value: String)     = _state.update { it.copy(username = value, error = null) }
    fun onPasswordChange(value: String) = _state.update { it.copy(password = value, error = null) }

    /** Login padrão com usuário + senha (Xtream). */
    fun submit() {
        val s = _state.value
        if (s.username.isBlank() || s.password.isBlank()) {
            _state.update { it.copy(error = "Preencha usuário e senha") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            panelRepo.login(s.username, s.password)
                .onSuccess { account ->
                    store.save(account)
                    _state.update { it.copy(loading = false, success = true) }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(
                            loading = false,
                            error = e.message ?: "Falha ao conectar. Verifique suas credenciais."
                        )
                    }
                }
        }
    }

    // ── Modo Código M3U ───────────────────────────────────────────────────────

    fun toggleMode() = _state.update { it.copy(isCodeMode = !it.isCodeMode, error = null) }

    fun onCodeChange(value: String) =
        _state.update { it.copy(accessCode = value.uppercase().trim(), error = null) }

    /** Login com código de acesso do pool M3U. */
    fun submitCode() {
        val s = _state.value
        if (s.accessCode.isBlank()) {
            _state.update { it.copy(error = "Digite o código de acesso") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            panelRepo.m3uAccess(code = s.accessCode, deviceId = deviceId)
                .onSuccess { resp ->
                    // Salva lease para heartbeat na próxima abertura
                    val leaseId   = resp.leaseId ?: -1
                    val m3uUrl    = resp.m3uUrl.orEmpty()
                    val listName  = resp.listName.orEmpty()

                    leaseStore.save(M3uLease(
                        code     = s.accessCode,
                        leaseId  = leaseId,
                        m3uUrl   = m3uUrl,
                        listName = listName,
                    ))

                    // Se o servidor retornou credenciais Xtream, usa o player normal
                    if (resp.dns != null && resp.username != null && resp.password != null) {
                        store.save(Account(
                            dns      = resp.dns,
                            username = resp.username,
                            password = resp.password,
                        ))
                    }

                    // Inicia heartbeat para manter a lease viva
                    if (leaseId >= 0) {
                        M3uLeaseManager.start(s.accessCode, leaseId, panelRepo)
                    }

                    _state.update { it.copy(loading = false, success = true) }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(
                            loading = false,
                            error = e.message ?: "Código inválido ou sem listas disponíveis."
                        )
                    }
                }
        }
    }
}

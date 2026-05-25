package com.startpainel.player.ui.login

import android.app.Application
import android.os.Build
import android.provider.Settings
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.startpainel.player.ServiceLocator
import com.startpainel.player.data.local.M3uLease
import com.startpainel.player.data.model.Account
import com.startpainel.player.data.remote.DeviceLockedException
import com.startpainel.player.data.remote.M3uLeaseManager
import com.startpainel.player.util.DeviceType
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
    // Device lock
    val showDeviceConflict: Boolean = false,
    val conflictDeviceName: String? = null,
    // Em TV o acesso por código promocional não é permitido (somente usuário/senha)
    val isTvDevice: Boolean = false,
)

class LoginViewModel(app: Application) : AndroidViewModel(app) {

    private val store      = ServiceLocator.credentialsStore(app)
    private val leaseStore = ServiceLocator.m3uLeaseStore(app)
    private val panelRepo  = ServiceLocator.panelRepository()

    /** Device ID estável para identificar o aparelho. */
    val deviceId: String by lazy {
        Settings.Secure.getString(app.contentResolver, Settings.Secure.ANDROID_ID) ?: "unknown"
    }

    /** Nome legível do aparelho (ex: "Samsung Galaxy S23"). */
    private val deviceName: String by lazy {
        val manufacturer = Build.MANUFACTURER.replaceFirstChar { it.uppercase() }
        val model = Build.MODEL
        if (model.startsWith(manufacturer, ignoreCase = true)) model else "$manufacturer $model"
    }

    private val _state = MutableStateFlow(LoginUiState(isTvDevice = DeviceType.isTv(app)))
    val state: StateFlow<LoginUiState> = _state.asStateFlow()

    init {
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

    /** Login padrão. [force] = true sobrescreve o device lock de outro aparelho. */
    fun submit(force: Boolean = false) {
        val s = _state.value
        if (s.username.isBlank() || s.password.isBlank()) {
            _state.update { it.copy(error = "Preencha usuário e senha") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null, showDeviceConflict = false) }
            panelRepo.login(
                username   = s.username,
                password   = s.password,
                deviceId   = deviceId,
                deviceName = deviceName,
                force      = force,
            )
                .onSuccess { account ->
                    store.save(account)
                    _state.update { it.copy(loading = false, success = true) }
                }
                .onFailure { e ->
                    if (e is DeviceLockedException) {
                        // Conta bloqueada em outro aparelho → mostra diálogo de confirmação
                        _state.update {
                            it.copy(
                                loading             = false,
                                showDeviceConflict  = true,
                                conflictDeviceName  = e.deviceName,
                            )
                        }
                    } else {
                        _state.update {
                            it.copy(
                                loading = false,
                                error   = e.message ?: "Falha ao conectar.",
                            )
                        }
                    }
                }
        }
    }

    /** Chamado quando o usuário confirma "Deslogar aparelho anterior e entrar aqui". */
    fun forceLogin() {
        _state.update { it.copy(showDeviceConflict = false) }
        submit(force = true)
    }

    /** Chamado quando o usuário cancela o diálogo de conflito. */
    fun dismissDeviceConflict() {
        _state.update { it.copy(showDeviceConflict = false) }
    }

    // ── Modo Código M3U ───────────────────────────────────────────────────────

    fun toggleMode() {
        // Em TV o código promocional não é permitido — mantém sempre usuário/senha
        if (_state.value.isTvDevice) return
        _state.update { it.copy(isCodeMode = !it.isCodeMode, error = null) }
    }

    fun onCodeChange(value: String) =
        _state.update { it.copy(accessCode = value.uppercase().trim(), error = null) }

    /** Login com código de acesso do pool M3U. */
    fun submitCode() {
        val s = _state.value
        if (s.isTvDevice) {
            _state.update { it.copy(error = "Acesso por código é exclusivo para celular. Na TV, entre com usuário e senha.") }
            return
        }
        if (s.accessCode.isBlank()) {
            _state.update { it.copy(error = "Digite o código de acesso") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            panelRepo.m3uAccess(code = s.accessCode, deviceId = deviceId)
                .onSuccess { resp ->
                    val leaseId  = resp.leaseId ?: -1
                    val m3uUrl   = resp.m3uUrl.orEmpty()
                    val listName = resp.listName.orEmpty()

                    leaseStore.save(M3uLease(
                        code     = s.accessCode,
                        leaseId  = leaseId,
                        m3uUrl   = m3uUrl,
                        listName = listName,
                    ))

                    if (resp.dns != null && resp.username != null && resp.password != null) {
                        store.save(Account(
                            dns      = resp.dns,
                            username = resp.username,
                            password = resp.password,
                        ))
                    }

                    if (leaseId >= 0) {
                        M3uLeaseManager.start(s.accessCode, leaseId, panelRepo)
                    }

                    _state.update { it.copy(loading = false, success = true) }
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(
                            loading = false,
                            error   = e.message ?: "Código inválido ou sem listas disponíveis.",
                        )
                    }
                }
        }
    }
}

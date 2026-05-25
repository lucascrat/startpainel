package com.startpainel.player.data.remote

import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import com.startpainel.player.data.model.Account
import com.startpainel.player.data.remote.dto.M3uAccessRequest
import com.startpainel.player.data.remote.dto.M3uAccessResponse
import com.startpainel.player.data.remote.dto.M3uLeaseActionRequest
import com.startpainel.player.data.remote.dto.PanelLoginRequest
import com.startpainel.player.data.remote.dto.PanelLoginResponse
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.HttpException
import retrofit2.Retrofit
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Indica que a conta já está logada em outro aparelho. */
class DeviceLockedException(val deviceName: String?) : Exception("device_locked")

class PanelRepository(panelUrl: String) {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private val api: PanelApi = Retrofit.Builder()
        .baseUrl(panelUrl.trimEnd('/') + "/")
        .client(
            OkHttpClient.Builder()
                .connectTimeout(15, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .build()
        )
        .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
        .build()
        .create(PanelApi::class.java)

    /** Busca uma setting pública do painel (sem autenticação). */
    suspend fun fetchSetting(key: String): Result<String?> {
        return try {
            val resp = api.getSetting(key)
            Result.success(resp.value)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Login com usuário e senha.
     * [deviceId] identifica o aparelho; [deviceName] é o nome legível (ex: "Galaxy S23").
     * Se [force] = true, substitui o lock de outro aparelho.
     *
     * Lança [DeviceLockedException] se a conta estiver bloqueada em outro aparelho e force=false.
     */
    suspend fun login(
        username: String,
        password: String,
        deviceId: String? = null,
        deviceName: String? = null,
        force: Boolean = false,
    ): Result<Account> {
        return try {
            val resp = api.login(PanelLoginRequest(
                username   = username,
                password   = password,
                deviceId   = deviceId,
                deviceName = deviceName,
                force      = force,
            ))
            if (resp.ok && resp.server != null) {
                Result.success(Account(
                    dns      = resp.server,
                    username = resp.username ?: username,
                    password = resp.password ?: password,
                ))
            } else {
                Result.failure(Exception(resp.error ?: "Falha ao autenticar."))
            }
        } catch (e: HttpException) {
            if (e.code() == 409) {
                // Device lock — parse o body para saber o nome do aparelho bloqueado
                val devName = try {
                    val body = e.response()?.errorBody()?.string() ?: ""
                    json.decodeFromString(PanelLoginResponse.serializer(), body).deviceName
                } catch (_: Exception) { null }
                return Result.failure(DeviceLockedException(devName))
            }
            val msg = try {
                val body = e.response()?.errorBody()?.string() ?: ""
                json.decodeFromString(PanelLoginResponse.serializer(), body).error
            } catch (_: Exception) { null }
            Result.failure(Exception(msg ?: when (e.code()) {
                401 -> "Usuário ou senha inválidos."
                403 -> "Conta expirada. Contate o suporte."
                429 -> "Muitas tentativas. Aguarde um momento."
                503 -> "Servidor indisponível. Contate o suporte."
                else -> "Erro ao conectar (${e.code()})."
            }))
        } catch (e: IOException) {
            Result.failure(Exception("Sem conexão. Verifique sua internet."))
        } catch (e: Exception) {
            Result.failure(Exception("Erro inesperado. Tente novamente."))
        }
    }

    /** Libera o device lock ao fazer logout voluntário. */
    suspend fun logout(username: String, deviceId: String): Result<Unit> {
        return try {
            api.logout(AppLogoutRequest(username = username, device_id = deviceId))
            Result.success(Unit)
        } catch (_: Exception) {
            Result.success(Unit) // falha silenciosa — o lock expira em 30 dias de qualquer forma
        }
    }

    // ── Pool M3U ──────────────────────────────────────────────────────────────

    /**
     * Acessa uma lista do pool com o código de acesso.
     * Retorna [M3uAccessResponse] com m3u_url e (se Xtream) dns/username/password.
     */
    suspend fun m3uAccess(code: String, deviceId: String? = null): Result<M3uAccessResponse> {
        return try {
            val resp = api.m3uAccess(M3uAccessRequest(code = code, deviceId = deviceId))
            if (resp.success) {
                Result.success(resp)
            } else {
                Result.failure(Exception(resp.error ?: "Código inválido ou sem listas disponíveis."))
            }
        } catch (e: HttpException) {
            val msg = try {
                val body = e.response()?.errorBody()?.string() ?: ""
                json.decodeFromString(M3uAccessResponse.serializer(), body).error
            } catch (_: Exception) { null }
            Result.failure(Exception(msg ?: when (e.code()) {
                403 -> "Código inválido ou desativado."
                503 -> "Todas as listas estão em uso. Tente novamente em alguns minutos."
                else -> "Erro ao conectar (${e.code()})."
            }))
        } catch (e: IOException) {
            Result.failure(Exception("Sem conexão. Verifique sua internet."))
        } catch (e: Exception) {
            Result.failure(Exception("Erro inesperado. Tente novamente."))
        }
    }

    /** Renova o heartbeat da lease (chamado a cada 2.5 min pelo [M3uLeaseManager]). */
    suspend fun m3uHeartbeat(code: String, leaseId: Int): Result<Unit> {
        return try {
            api.m3uHeartbeat(M3uLeaseActionRequest(code = code, leaseId = leaseId))
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /** Libera a lista de volta ao pool explicitamente. */
    suspend fun m3uRelease(code: String, leaseId: Int): Result<Unit> {
        return try {
            api.m3uRelease(M3uLeaseActionRequest(code = code, leaseId = leaseId))
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}

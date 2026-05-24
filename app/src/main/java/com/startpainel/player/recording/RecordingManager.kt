package com.startpainel.player.recording

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.util.concurrent.TimeUnit

// ── Estado da gravação ativo (in-memory apenas) ────────────────
data class ActiveRecording(
    val streamId: Int,
    val title: String,
    val logoUrl: String?,
    val outputFile: File,
    val startedAt: Long = System.currentTimeMillis(),
    val bytesRecorded: Long = 0L,
    val error: String? = null
)

/**
 * Singleton que gerencia a gravação de um stream ao vivo.
 * A gravação usa OkHttp para ler o stream MPEG-TS e escreve diretamente
 * em arquivo. Sem FFmpeg — sem dependência extra, sem peso no APK.
 *
 * Lifecycle: controlado pelo RecordingService (Foreground Service).
 */
object RecordingManager {

    private val _active = MutableStateFlow<ActiveRecording?>(null)
    val active: StateFlow<ActiveRecording?> = _active.asStateFlow()

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var job: Job? = null

    // OkHttp separado do Retrofit: sem timeout de leitura (stream infinito)
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.SECONDS)   // <-- essencial para stream contínuo
        .writeTimeout(0, TimeUnit.SECONDS)
        .build()

    fun start(
        streamId: Int,
        streamUrl: String,
        title: String,
        logoUrl: String?,
        outputFile: File
    ) {
        // Para qualquer gravação anterior
        job?.cancel()

        _active.value = ActiveRecording(
            streamId = streamId,
            title = title,
            logoUrl = logoUrl,
            outputFile = outputFile
        )

        job = scope.launch {
            try {
                val request = Request.Builder().url(streamUrl).build()
                val response = client.newCall(request).execute()
                val body = response.body ?: run {
                    _active.value = _active.value?.copy(error = "Sem resposta do servidor")
                    return@launch
                }

                // Garante que o arquivo de destino existe
                outputFile.parentFile?.mkdirs()

                body.byteStream().use { input ->
                    outputFile.outputStream().use { output ->
                        val buffer = ByteArray(131_072) // 128 KB por chunk
                        while (isActive) {
                            val read = input.read(buffer)
                            if (read == -1) break
                            output.write(buffer, 0, read)
                            _active.value = _active.value?.copy(
                                bytesRecorded = (_active.value?.bytesRecorded ?: 0L) + read
                            )
                        }
                    }
                }
            } catch (e: CancellationException) {
                // Parada normal pelo usuário — não é erro
            } catch (e: Exception) {
                _active.value = _active.value?.copy(error = e.message ?: "Erro na gravação")
            }
        }
    }

    /** Retorna os bytes gravados e zera o estado ativo. */
    fun stop(): ActiveRecording? {
        job?.cancel()
        val snapshot = _active.value
        _active.value = null
        return snapshot
    }

    val isRecording: Boolean get() = _active.value != null && job?.isActive == true
}

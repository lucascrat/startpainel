package com.startpainel.player.data.model

import kotlinx.serialization.Serializable

@Serializable
data class RecordingRecord(
    val id: String,                        // UUID único
    val streamId: Int,
    val title: String,
    val logoUrl: String? = null,
    val localPath: String,                 // caminho absoluto do arquivo .ts
    val startedAt: Long,                   // timestamp de início
    val durationMs: Long,                  // duração real gravada
    val sizeBytes: Long                    // tamanho do arquivo
)

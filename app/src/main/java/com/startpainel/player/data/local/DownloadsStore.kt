package com.startpainel.player.data.local

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.startpainel.player.data.model.DownloadRecord
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

private val Context.downloadsDataStore by preferencesDataStore(name = "downloads")

class DownloadsStore(private val context: Context) {

    private val json = Json { ignoreUnknownKeys = true }
    private val KEY = stringPreferencesKey("records")

    val records: Flow<List<DownloadRecord>> = context.downloadsDataStore.data.map { prefs ->
        decode(prefs[KEY])
    }

    suspend fun add(record: DownloadRecord) {
        context.downloadsDataStore.edit { prefs ->
            val current = decode(prefs[KEY]).toMutableList()
            current.removeAll { it.streamId == record.streamId }
            current.add(0, record)
            prefs[KEY] = json.encodeToString(current)
        }
    }

    suspend fun remove(downloadId: Long) {
        context.downloadsDataStore.edit { prefs ->
            val current = decode(prefs[KEY]).toMutableList()
            current.removeAll { it.downloadId == downloadId }
            prefs[KEY] = json.encodeToString(current)
        }
    }

    private fun decode(raw: String?): List<DownloadRecord> = try {
        if (raw.isNullOrBlank()) emptyList()
        else json.decodeFromString(raw)
    } catch (_: Exception) {
        emptyList()
    }
}

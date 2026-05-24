package com.startpainel.player.data.local

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.startpainel.player.data.model.RecordingRecord
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

private val Context.recordingsDataStore by preferencesDataStore(name = "recordings")

class RecordingsStore(private val context: Context) {

    private val json = Json { ignoreUnknownKeys = true }
    private val KEY = stringPreferencesKey("records")

    val records: Flow<List<RecordingRecord>> = context.recordingsDataStore.data.map { prefs ->
        decode(prefs[KEY])
    }

    suspend fun add(record: RecordingRecord) {
        context.recordingsDataStore.edit { prefs ->
            val current = decode(prefs[KEY]).toMutableList()
            current.removeAll { it.id == record.id }
            current.add(0, record)
            prefs[KEY] = json.encodeToString(current)
        }
    }

    suspend fun remove(id: String) {
        context.recordingsDataStore.edit { prefs ->
            val current = decode(prefs[KEY]).toMutableList()
            current.removeAll { it.id == id }
            prefs[KEY] = json.encodeToString(current)
        }
    }

    private fun decode(raw: String?): List<RecordingRecord> = try {
        if (raw.isNullOrBlank()) emptyList()
        else json.decodeFromString(raw)
    } catch (_: Exception) {
        emptyList()
    }
}

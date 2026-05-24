package com.startpainel.player.data.local

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.m3uDataStore by preferencesDataStore(name = "m3u_lease")

data class M3uLease(
    val code: String,
    val leaseId: Int,
    val m3uUrl: String,
    val listName: String,
)

class M3uLeaseStore(private val context: Context) {

    private val KEY_CODE      = stringPreferencesKey("code")
    private val KEY_LEASE_ID  = intPreferencesKey("lease_id")
    private val KEY_M3U_URL   = stringPreferencesKey("m3u_url")
    private val KEY_LIST_NAME = stringPreferencesKey("list_name")

    val lease: Flow<M3uLease?> = context.m3uDataStore.data.map { prefs ->
        val code    = prefs[KEY_CODE].orEmpty()
        val leaseId = prefs[KEY_LEASE_ID] ?: -1
        if (code.isBlank() || leaseId < 0) null
        else M3uLease(
            code      = code,
            leaseId   = leaseId,
            m3uUrl    = prefs[KEY_M3U_URL].orEmpty(),
            listName  = prefs[KEY_LIST_NAME].orEmpty(),
        )
    }

    suspend fun save(lease: M3uLease) {
        context.m3uDataStore.edit { prefs ->
            prefs[KEY_CODE]      = lease.code
            prefs[KEY_LEASE_ID]  = lease.leaseId
            prefs[KEY_M3U_URL]   = lease.m3uUrl
            prefs[KEY_LIST_NAME] = lease.listName
        }
    }

    suspend fun clear() {
        context.m3uDataStore.edit { it.clear() }
    }
}

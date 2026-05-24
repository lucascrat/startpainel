package com.startpainel.player.data.local

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.startpainel.player.data.model.Account
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "credentials")

class CredentialsStore(private val context: Context) {

    private val KEY_DNS = stringPreferencesKey("dns")
    private val KEY_USER = stringPreferencesKey("user")
    private val KEY_PASS = stringPreferencesKey("pass")

    val account: Flow<Account?> = context.dataStore.data.map { prefs ->
        val dns = prefs[KEY_DNS].orEmpty()
        val user = prefs[KEY_USER].orEmpty()
        val pass = prefs[KEY_PASS].orEmpty()
        if (dns.isBlank() || user.isBlank() || pass.isBlank()) null
        else Account(dns, user, pass)
    }

    suspend fun save(account: Account) {
        context.dataStore.edit { prefs ->
            prefs[KEY_DNS] = account.dns
            prefs[KEY_USER] = account.username
            prefs[KEY_PASS] = account.password
        }
    }

    suspend fun clear() {
        context.dataStore.edit { it.clear() }
    }
}

package com.ferni.voice.services.auth

import android.content.Context
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/** Stores the anonymous Firebase session in app-private SharedPreferences. */
class SharedPrefsAuthTokenStore(context: Context) : AuthTokenStore {
    private val prefs = context.getSharedPreferences("ferni_auth", Context.MODE_PRIVATE)

    override fun load(): StoredSession? =
        prefs.getString(KEY, null)?.let { runCatching { Json.decodeFromString<StoredSession>(it) }.getOrNull() }

    override fun save(session: StoredSession) {
        prefs.edit().putString(KEY, Json.encodeToString(session)).apply()
    }

    override fun clear() {
        prefs.edit().remove(KEY).apply()
    }

    private companion object {
        const val KEY = "firebase_anonymous_session"
    }
}

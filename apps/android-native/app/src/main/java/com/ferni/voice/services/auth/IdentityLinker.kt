package com.ferni.voice.services.auth

import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

/**
 * Carries an anonymous voice user's memory into a signed-in account
 * (`POST /api/identity/link`, the same call the web and iOS apps make).
 *
 * Voice sessions run as an anonymous Firebase user ([FirebaseAnonymousAuth]).
 * When the app signs in to a real account, read the anonymous token first
 * ([FirebaseAnonymousAuth.currentAnonymousIdToken]) and then, once signed in:
 *
 *     identityLinker.linkPriorIdentity(accountIdToken, anonymousIdToken)
 *
 * Best-effort: never throws, and the server makes repeats harmless.
 * Blocking: call from Dispatchers.IO.
 */
class IdentityLinker(
    private val http: OkHttpClient = OkHttpClient(),
    private val baseUrl: String = "https://app.ferni.ai",
) {
    /** True when the server linked it (or it was already linked). */
    fun linkPriorIdentity(
        accountIdToken: String,
        anonymousIdToken: String?,
        deviceId: String? = null,
    ): Boolean {
        if (anonymousIdToken.isNullOrBlank() && deviceId.isNullOrBlank()) return false
        val body = buildJsonObject {
            if (!anonymousIdToken.isNullOrBlank()) put("anonymousIdToken", anonymousIdToken)
            if (!deviceId.isNullOrBlank()) put("deviceId", deviceId)
        }.toString()
        val request = Request.Builder()
            .url("$baseUrl/api/identity/link")
            .header("Authorization", "Bearer $accountIdToken")
            .post(body.toRequestBody(JSON_TYPE))
            .build()
        return try {
            http.newCall(request).execute().use { it.isSuccessful || it.code == 409 }
        } catch (e: Exception) {
            false
        }
    }

    private companion object {
        val JSON_TYPE = "application/json; charset=utf-8".toMediaType()
    }
}

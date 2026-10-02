package com.ferni.voice.services.auth

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.FormBody
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

/**
 * Firebase anonymous sign-in over the public REST API (no Firebase SDK).
 *
 * The voice token endpoint (`GET /token`) requires a verified Firebase ID
 * token. Anonymous accounts are the zero-friction path: sign up once, keep the
 * refresh token, and refresh the 1-hour ID token as needed.
 *
 * Pure JVM (OkHttp + kotlinx.serialization) so it is unit-tested off-device.
 * Blocking: call from Dispatchers.IO.
 */
class FirebaseAnonymousAuth(
    private val apiKey: String,
    private val store: AuthTokenStore,
    private val http: OkHttpClient = OkHttpClient(),
    private val identityBaseUrl: String = "https://identitytoolkit.googleapis.com",
    private val secureTokenBaseUrl: String = "https://securetoken.googleapis.com",
    private val clock: () -> Long = System::currentTimeMillis,
    /** e.g. X-Android-Package / X-Android-Cert when the API key is app-restricted */
    private val extraHeaders: Map<String, String> = emptyMap(),
) {
    private val json = Json { ignoreUnknownKeys = true }

    /** A valid ID token, refreshing or signing up anonymously as needed. */
    @Synchronized
    fun idToken(): String {
        val saved = store.load()
        if (saved != null && saved.expiresAtEpochMs - EXPIRY_MARGIN_MS > clock()) {
            return saved.idToken
        }
        if (saved != null) {
            try {
                return refresh(saved.refreshToken).also(store::save).idToken
            } catch (e: FirebaseAuthException) {
                // Refresh token revoked or account deleted: start a new anonymous account
                if (e.status != 400) throw e
                store.clear()
            }
        }
        return signUp().also(store::save).idToken
    }

    /**
     * The anonymous session's ID token, or null when there is none. Read it
     * before signing in to an account, then hand it to [IdentityLinker] so the
     * anonymous user's memory follows the account. Never signs up.
     */
    @Synchronized
    fun currentAnonymousIdToken(): String? {
        val saved = store.load() ?: return null
        if (saved.expiresAtEpochMs - EXPIRY_MARGIN_MS > clock()) return saved.idToken
        return try {
            refresh(saved.refreshToken).also(store::save).idToken
        } catch (e: Exception) {
            null
        }
    }

    /** Drop cached credentials (e.g. after the server rejects the token). */
    @Synchronized
    fun invalidate() = store.clear()

    private fun signUp(): StoredSession {
        val request = Request.Builder()
            .url("$identityBaseUrl/v1/accounts:signUp?key=$apiKey")
            .post("""{"returnSecureToken":true}""".toRequestBody(JSON_TYPE))
            .withExtraHeaders()
            .build()
        val body = execute(request)
        val r = json.decodeFromString<SignUpResponse>(body)
        return StoredSession(r.idToken, r.refreshToken, expiresAt(r.expiresIn), r.localId)
    }

    private fun refresh(refreshToken: String): StoredSession {
        val request = Request.Builder()
            .url("$secureTokenBaseUrl/v1/token?key=$apiKey")
            .post(
                FormBody.Builder()
                    .add("grant_type", "refresh_token")
                    .add("refresh_token", refreshToken)
                    .build()
            )
            .withExtraHeaders()
            .build()
        val body = execute(request)
        val r = json.decodeFromString<RefreshResponse>(body)
        return StoredSession(r.idToken, r.refreshToken, expiresAt(r.expiresIn), r.userId)
    }

    private fun execute(request: Request): String =
        http.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw FirebaseAuthException(response.code, body.take(300))
            body
        }

    private fun Request.Builder.withExtraHeaders() = apply {
        extraHeaders.forEach { (name, value) -> header(name, value) }
    }

    private fun expiresAt(expiresInSeconds: String): Long =
        clock() + (expiresInSeconds.toLongOrNull() ?: 3600L) * 1000L

    @Serializable
    private data class SignUpResponse(
        val idToken: String,
        val refreshToken: String,
        val expiresIn: String,
        val localId: String,
    )

    @Serializable
    private data class RefreshResponse(
        @SerialName("id_token") val idToken: String,
        @SerialName("refresh_token") val refreshToken: String,
        @SerialName("expires_in") val expiresIn: String,
        @SerialName("user_id") val userId: String,
    )

    private companion object {
        val JSON_TYPE = "application/json; charset=utf-8".toMediaType()
        const val EXPIRY_MARGIN_MS = 60_000L
    }
}

@Serializable
data class StoredSession(
    val idToken: String,
    val refreshToken: String,
    val expiresAtEpochMs: Long,
    val uid: String,
)

/** Persistence for the anonymous session (SharedPreferences on device). */
interface AuthTokenStore {
    fun load(): StoredSession?
    fun save(session: StoredSession)
    fun clear()
}

class FirebaseAuthException(val status: Int, message: String) :
    Exception("Firebase auth failed ($status): $message")

package com.ferni.voice.services.auth

import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import kotlin.test.*

class MemoryStore(var s: StoredSession? = null) : AuthTokenStore {
    override fun load() = s
    override fun save(session: StoredSession) { s = session }
    override fun clear() { s = null }
}

class FirebaseAnonymousAuthTest {
    private val server = MockWebServer().apply { start() }
    private val base = server.url("/").toString().trimEnd('/')
    private var now = 1_000_000L
    private fun auth(store: AuthTokenStore) = FirebaseAnonymousAuth(
        apiKey = "KEY", store = store, identityBaseUrl = base, secureTokenBaseUrl = base,
        clock = { now }, extraHeaders = mapOf("X-Android-Package" to "com.ferni.voice.android"),
    )
    private val signUp = """{"idToken":"id-1","refreshToken":"r-1","expiresIn":"3600","localId":"uid-1"}"""

    @AfterTest fun tearDown() = server.shutdown()

    @Test fun `signs up anonymously when nothing is stored`() {
        server.enqueue(MockResponse().setBody(signUp))
        val store = MemoryStore()
        assertEquals("id-1", auth(store).idToken())
        val req = server.takeRequest()
        assertEquals("/v1/accounts:signUp?key=KEY", req.path)
        assertEquals("""{"returnSecureToken":true}""", req.body.readUtf8())
        assertEquals("com.ferni.voice.android", req.getHeader("X-Android-Package"))
        assertEquals("uid-1", store.s?.uid)
        assertEquals(now + 3_600_000, store.s?.expiresAtEpochMs)
    }

    @Test fun `reuses a fresh token without network`() {
        val store = MemoryStore(StoredSession("cached", "r", now + 10 * 60_000, "u"))
        assertEquals("cached", auth(store).idToken())
        assertEquals(0, server.requestCount)
    }

    @Test fun `refreshes a token that is about to expire`() {
        server.enqueue(MockResponse().setBody("""{"id_token":"id-2","refresh_token":"r-2","expires_in":"3600","user_id":"u"}"""))
        val store = MemoryStore(StoredSession("old", "r-1", now + 30_000, "u"))
        assertEquals("id-2", auth(store).idToken())
        val req = server.takeRequest()
        assertEquals("/v1/token?key=KEY", req.path)
        assertEquals("grant_type=refresh_token&refresh_token=r-1", req.body.readUtf8())
        assertEquals("r-2", store.s?.refreshToken)
    }

    @Test fun `starts a new anonymous account when the refresh token is rejected`() {
        server.enqueue(MockResponse().setResponseCode(400).setBody("""{"error":{"message":"TOKEN_EXPIRED"}}"""))
        server.enqueue(MockResponse().setBody(signUp))
        val store = MemoryStore(StoredSession("old", "dead", now - 1, "u"))
        assertEquals("id-1", auth(store).idToken())
        assertEquals(2, server.requestCount)
    }

    @Test fun `surfaces server errors other than 400`() {
        server.enqueue(MockResponse().setResponseCode(503))
        assertFailsWith<FirebaseAuthException> { auth(MemoryStore()).idToken() }
    }

    @Test fun `invalidate forces a fresh sign-in`() {
        val store = MemoryStore(StoredSession("cached", "r", now + 10 * 60_000, "u"))
        val a = auth(store)
        a.invalidate()
        server.enqueue(MockResponse().setBody(signUp))
        assertEquals("id-1", a.idToken())
    }
}

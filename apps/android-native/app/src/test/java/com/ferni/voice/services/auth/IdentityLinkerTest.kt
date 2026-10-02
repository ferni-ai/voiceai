package com.ferni.voice.services.auth

import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import kotlin.test.*

class IdentityLinkerTest {
    private val server = MockWebServer().apply { start() }
    private val base = server.url("/").toString().trimEnd('/')
    private val linker = IdentityLinker(baseUrl = base)

    @AfterTest fun tearDown() = server.shutdown()

    @Test fun `posts the anonymous token with the account token`() {
        server.enqueue(MockResponse().setBody("""{"linked":true}"""))
        assertTrue(linker.linkPriorIdentity("acct-token", "anon-token"))
        val req = server.takeRequest()
        assertEquals("POST", req.method)
        assertEquals("/api/identity/link", req.path)
        assertEquals("Bearer acct-token", req.getHeader("Authorization"))
        assertEquals("""{"anonymousIdToken":"anon-token"}""", req.body.readUtf8())
    }

    @Test fun `already linked counts as linked, other failures do not`() {
        server.enqueue(MockResponse().setResponseCode(409))
        assertTrue(linker.linkPriorIdentity("a", "anon"))
        server.enqueue(MockResponse().setResponseCode(500))
        assertFalse(linker.linkPriorIdentity("a", "anon"))
    }

    @Test fun `nothing to link sends nothing`() {
        assertFalse(linker.linkPriorIdentity("a", null))
        assertEquals(0, server.requestCount)
    }

    @Test fun `a network error never throws`() {
        server.shutdown()
        assertFalse(IdentityLinker(baseUrl = base).linkPriorIdentity("a", "anon"))
    }
}

class CurrentAnonymousIdTokenTest {
    private val server = MockWebServer().apply { start() }
    private val base = server.url("/").toString().trimEnd('/')
    private val now = 1_000_000L
    private fun auth(store: AuthTokenStore) = FirebaseAnonymousAuth(
        apiKey = "KEY", store = store, identityBaseUrl = base, secureTokenBaseUrl = base,
        clock = { now },
    )

    @AfterTest fun tearDown() = server.shutdown()

    @Test fun `null without an anonymous session, and never signs up`() {
        assertNull(auth(MemoryStore()).currentAnonymousIdToken())
        assertEquals(0, server.requestCount)
    }

    @Test fun `returns a fresh token, refreshing an expired one`() {
        val fresh = MemoryStore(StoredSession("cached", "r", now + 10 * 60_000, "u"))
        assertEquals("cached", auth(fresh).currentAnonymousIdToken())

        server.enqueue(
            MockResponse().setBody(
                """{"id_token":"id-2","refresh_token":"r-2","expires_in":"3600","user_id":"u"}"""
            )
        )
        val stale = MemoryStore(StoredSession("old", "r", now - 1, "u"))
        assertEquals("id-2", auth(stale).currentAnonymousIdToken())
    }

    @Test fun `a revoked session gives null instead of a new anonymous user`() {
        server.enqueue(MockResponse().setResponseCode(400).setBody("TOKEN_EXPIRED"))
        val stale = MemoryStore(StoredSession("old", "r", now - 1, "u"))
        assertNull(auth(stale).currentAnonymousIdToken())
        assertEquals(1, server.requestCount)
    }
}

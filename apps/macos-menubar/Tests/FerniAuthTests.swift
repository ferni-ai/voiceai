import XCTest
@testable import FerniAuth

// MARK: - Test doubles

/// SecretStore in memory, so session tests never touch the real Keychain.
final class InMemoryStore: SecretStore, @unchecked Sendable {
    private var values: [String: String] = [:]
    private let lock = NSLock()

    func read(_ account: String) -> String? { lock.withLock { values[account] } }
    func write(_ value: String, for account: String) -> Bool { lock.withLock { values[account] = value }; return true }
    func delete(_ account: String) -> Bool { lock.withLock { values[account] = nil }; return true }
}

/// Answers each request with the next scripted status code and records what was sent.
final class ScriptedTransport: HTTPTransport, @unchecked Sendable {
    private var statuses: [Int]
    private let body: Data
    private(set) var requests: [URLRequest] = []
    private let lock = NSLock()

    init(_ statuses: [Int], body: Data = Data(#"{"token":"lk","url":"wss://x","room":"r"}"#.utf8)) {
        self.statuses = statuses
        self.body = body
    }

    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let status: Int = lock.withLock {
            requests.append(request)
            return statuses.isEmpty ? 500 : statuses.removeFirst()
        }
        return (body, HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
    }
}

/// Counts refreshes and hands out id-1, id-2, ... (or fails the way Firebase does).
final class CountingRefresher: @unchecked Sendable {
    private(set) var calls = 0
    var rejects = false

    func refresh(_ refreshToken: String) throws -> FirebaseSession {
        calls += 1
        if rejects { throw AuthError.signInRequired }
        return FirebaseSession(uid: "uid-1", idToken: "id-\(calls)", refreshToken: refreshToken,
                               expiresAt: Date().addingTimeInterval(3600))
    }
}

/// A refresher that suspends until the test releases it, to exercise actor reentrancy.
final class SuspendingRefresher: @unchecked Sendable {
    private let lock = NSLock()
    private var waiting: [CheckedContinuation<Void, Never>] = []
    private var count = 0
    /// Fail like Firebase does for a revoked refresh token, once released.
    var rejects = false

    var calls: Int { lock.withLock { count } }

    func refresh(_ refreshToken: String) async throws -> FirebaseSession {
        await withCheckedContinuation { continuation in
            lock.withLock {
                count += 1
                waiting.append(continuation)
            }
        }
        if rejects { throw AuthError.signInRequired }
        return FirebaseSession(uid: "uid-1", idToken: "id-renewed", refreshToken: "refresh-renewed",
                               expiresAt: Date().addingTimeInterval(3600))
    }

    func release() {
        lock.withLock {
            waiting.forEach { $0.resume() }
            waiting = []
        }
    }

    /// Waits (bounded) until `n` refreshes have started.
    func waitForCalls(_ n: Int) async {
        for _ in 0..<200 where calls < n { try? await Task.sleep(nanoseconds: 5_000_000) }
    }
}

private let server = URL(string: "https://app.ferni.ai")!

private func signedInSession(_ refresher: CountingRefresher, expiresIn: TimeInterval = 3600) async -> AuthSession {
    let session = AuthSession(store: InMemoryStore()) { try refresher.refresh($0) }
    await session.adopt(FirebaseSession(uid: "uid-1", idToken: "id-0", refreshToken: "refresh-0",
                                        expiresAt: Date().addingTimeInterval(expiresIn)))
    return session
}

// MARK: - /token request

final class VoiceTokenClientTests: XCTestCase {
    func testRequestCarriesBearerTokenAndUid() throws {
        let auth = FirebaseSession(uid: "uid-1", idToken: "id-0", refreshToken: "r", expiresAt: .distantFuture)
        let request = VoiceTokenClient.request(server: server, room: "ferni-1", username: "user-1", personaId: "ferni",
                                               auth: auth, timeZone: TimeZone(identifier: "America/New_York")!)

        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer id-0")
        let items = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems!
        let query = Dictionary(uniqueKeysWithValues: items.map { ($0.name, $0.value!) })
        XCTAssertEqual(request.url!.path, "/token")
        XCTAssertEqual(query, ["room": "ferni-1", "username": "user-1", "persona_id": "ferni",
                               "firebase_uid": "uid-1", "timezone": "America/New_York"])
    }

    func testFetchSendsTheSessionsToken() async throws {
        let transport = ScriptedTransport([200])
        let client = VoiceTokenClient(server: server, session: await signedInSession(CountingRefresher()), transport: transport)

        _ = try await client.fetch(room: "r", username: "u", personaId: "ferni")

        XCTAssertEqual(transport.requests.map { $0.value(forHTTPHeaderField: "Authorization") }, ["Bearer id-0"])
    }

    func testRetriesOnceWithAFreshTokenAfter401() async throws {
        let refresher = CountingRefresher()
        let transport = ScriptedTransport([401, 200])
        let client = VoiceTokenClient(server: server, session: await signedInSession(refresher), transport: transport)

        let data = try await client.fetch(room: "r", username: "u", personaId: "ferni")

        XCTAssertFalse(data.isEmpty)
        XCTAssertEqual(refresher.calls, 1)
        XCTAssertEqual(transport.requests.map { $0.value(forHTTPHeaderField: "Authorization") },
                       ["Bearer id-0", "Bearer id-1"])
    }

    func testSecond401StopsAndAsksForSignInInsteadOfLooping() async throws {
        let refresher = CountingRefresher()
        let session = await signedInSession(refresher)
        let transport = ScriptedTransport([401, 401, 200, 200])
        let client = VoiceTokenClient(server: server, session: session, transport: transport)

        do {
            _ = try await client.fetch(room: "r", username: "u", personaId: "ferni")
            XCTFail("expected signInRequired")
        } catch {
            XCTAssertEqual(error as? AuthError, .signInRequired)
        }
        XCTAssertEqual(transport.requests.count, 2)
        XCTAssertEqual(refresher.calls, 1)
        let state = await session.state
        XCTAssertEqual(state, .needsSignIn)
    }
}

// MARK: - Session refresh

final class AuthSessionTests: XCTestCase {
    func testReusesATokenFarFromExpiry() async throws {
        let refresher = CountingRefresher()
        let token = try await signedInSession(refresher, expiresIn: 3600).validToken()
        XCTAssertEqual(token.idToken, "id-0")
        XCTAssertEqual(refresher.calls, 0)
    }

    func testRefreshesBeforeExpiry() async throws {
        let refresher = CountingRefresher()
        let token = try await signedInSession(refresher, expiresIn: 60).validToken()
        XCTAssertEqual(token.idToken, "id-1")
        XCTAssertEqual(refresher.calls, 1)
    }

    func testRejectedRefreshTokenDropsCredentialsAndAsksForSignIn() async throws {
        let refresher = CountingRefresher()
        refresher.rejects = true
        let store = InMemoryStore()
        let session = AuthSession(store: store) { try refresher.refresh($0) }
        await session.adopt(FirebaseSession(uid: "uid-1", idToken: "id-0", refreshToken: "refresh-0", expiresAt: .distantPast))

        do {
            _ = try await session.validToken()
            XCTFail("expected signInRequired")
        } catch {
            XCTAssertEqual(error as? AuthError, .signInRequired)
        }
        let state = await session.state
        XCTAssertEqual(state, .needsSignIn)
        XCTAssertNil(store.read(AuthSession.refreshAccount))
    }

    func testSignOutDuringASuspendedRefreshStaysSignedOut() async throws {
        let refresher = SuspendingRefresher()
        let store = InMemoryStore()
        let session = AuthSession(store: store) { try await refresher.refresh($0) }
        await session.adopt(FirebaseSession(uid: "uid-1", idToken: "id-0", refreshToken: "refresh-0", expiresAt: .distantPast))

        let refresh = Task { try await session.validToken() }
        await refresher.waitForCalls(1)
        await session.signOut()
        refresher.release()

        do {
            _ = try await refresh.value
            XCTFail("a refresh that outlived sign-out must not hand back a token")
        } catch {
            XCTAssertEqual(error as? AuthError, .signInRequired)
        }
        let state = await session.state
        XCTAssertEqual(state, .signedOut)
        XCTAssertNil(store.read(AuthSession.refreshAccount))
        XCTAssertNil(store.read(AuthSession.uidAccount))
    }

    func testLateRejectionOfAnOldRefreshDoesNotWipeANewSignIn() async throws {
        let refresher = SuspendingRefresher()
        refresher.rejects = true
        let store = InMemoryStore()
        let session = AuthSession(store: store) { try await refresher.refresh($0) }
        await session.adopt(FirebaseSession(uid: "uid-1", idToken: "id-0", refreshToken: "refresh-0", expiresAt: .distantPast))

        let refresh = Task { try await session.validToken() }
        await refresher.waitForCalls(1)
        await session.adopt(FirebaseSession(uid: "uid-1", idToken: "id-new", refreshToken: "refresh-new",
                                            expiresAt: Date().addingTimeInterval(3600)))
        refresher.release()

        _ = try? await refresh.value
        let state = await session.state
        XCTAssertEqual(state, .signedIn(uid: "uid-1"))
        XCTAssertEqual(store.read(AuthSession.refreshAccount), "refresh-new")
        let token = try await session.validToken()
        XCTAssertEqual(token.idToken, "id-new")
    }

    func testRefreshFromBeforeSignOutCannotOverwriteANewSignInWithTheSameRefreshToken() async throws {
        let refresher = SuspendingRefresher()
        let store = InMemoryStore()
        let session = AuthSession(store: store) { try await refresher.refresh($0) }
        await session.adopt(FirebaseSession(uid: "uid-1", idToken: "id-0", refreshToken: "refresh-0", expiresAt: .distantPast))

        let refresh = Task { try await session.validToken() }
        await refresher.waitForCalls(1)
        await session.signOut()
        // Same refresh-token string, so only the generation can tell this sign-in apart.
        await session.adopt(FirebaseSession(uid: "uid-2", idToken: "id-2", refreshToken: "refresh-0",
                                            expiresAt: Date().addingTimeInterval(3600)))
        refresher.release()

        _ = try? await refresh.value
        let state = await session.state
        XCTAssertEqual(state, .signedIn(uid: "uid-2"))
        XCTAssertEqual(store.read(AuthSession.uidAccount), "uid-2")
        let token = try await session.validToken()
        XCTAssertEqual(token.idToken, "id-2")
    }

    func testConcurrentCallersShareOneRefresh() async throws {
        let refresher = SuspendingRefresher()
        let session = AuthSession(store: InMemoryStore()) { try await refresher.refresh($0) }
        await session.adopt(FirebaseSession(uid: "uid-1", idToken: "id-0", refreshToken: "refresh-0", expiresAt: .distantPast))

        let first = Task { try await session.validToken() }
        await refresher.waitForCalls(1)
        let second = Task { try await session.validToken() }
        try await Task.sleep(nanoseconds: 100_000_000) // let the second caller reach the session
        refresher.release()

        let tokens = try await [first.value.idToken, second.value.idToken]
        XCTAssertEqual(tokens, ["id-renewed", "id-renewed"])
        XCTAssertEqual(refresher.calls, 1)
    }

    func testRestoresSignedInStateFromTheStore() async {
        let store = InMemoryStore()
        store.write("refresh-0", for: AuthSession.refreshAccount)
        store.write("uid-1", for: AuthSession.uidAccount)
        let state = await AuthSession(store: store) { _ in throw AuthError.signInRequired }.state
        XCTAssertEqual(state, .signedIn(uid: "uid-1"))
    }
}

// MARK: - Firebase REST + Keychain + PKCE

final class FirebaseAuthClientTests: XCTestCase {
    func testRefreshParsesSecureTokenResponse() async throws {
        let body = Data(#"{"user_id":"uid-1","id_token":"id-9","refresh_token":"refresh-9","expires_in":"3600"}"#.utf8)
        let transport = ScriptedTransport([200], body: body)
        let session = try await FirebaseAuthClient(apiKey: "public-key", transport: transport).refresh("refresh-0")

        XCTAssertEqual(session.idToken, "id-9")
        XCTAssertEqual(session.refreshToken, "refresh-9")
        XCTAssertEqual(String(data: transport.requests[0].httpBody!, encoding: .utf8),
                       "grant_type=refresh_token&refresh_token=refresh-0")
    }

    func testRefreshRejectionMeansSignInRequired() async {
        let client = FirebaseAuthClient(apiKey: "public-key", transport: ScriptedTransport([400]))
        do {
            _ = try await client.refresh("revoked")
            XCTFail("expected signInRequired")
        } catch {
            XCTAssertEqual(error as? AuthError, .signInRequired)
        }
    }

    func testPKCEChallengeMatchesRFC7636() {
        XCTAssertEqual(GoogleSignIn.challenge(for: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
                       "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
    }
}

final class KeychainStoreTests: XCTestCase {
    private let store = KeychainStore(service: "com.ferni.voice.tests.\(UUID().uuidString)")

    override func tearDown() {
        store.delete("refresh")
        super.tearDown()
    }

    func testRoundTripOverwriteAndDelete() {
        XCTAssertNil(store.read("refresh"))
        XCTAssertTrue(store.write("first", for: "refresh"))
        XCTAssertEqual(store.read("refresh"), "first")
        XCTAssertTrue(store.write("second", for: "refresh"))
        XCTAssertEqual(store.read("refresh"), "second")

        XCTAssertTrue(store.delete("refresh"))
        XCTAssertNil(store.read("refresh"))
        XCTAssertTrue(store.delete("refresh"), "deleting a missing item is not an error")
    }
}

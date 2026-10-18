import Foundation

/// Holds the signed-in user's tokens: the refresh token in a `SecretStore`, the
/// short-lived ID token in memory only. Renews the ID token before it expires.
public actor AuthSession {
    public enum State: Equatable, Sendable {
        case signedOut
        case signedIn(uid: String)
        /// Was signed in, but the server or Firebase refused the credentials.
        case needsSignIn
    }

    static let refreshAccount = "firebase.refreshToken"
    static let uidAccount = "firebase.uid"
    /// Renew this long before expiry so a token never dies mid-request.
    static let refreshMargin: TimeInterval = 300

    public private(set) var state: State
    private let store: SecretStore
    private let refresher: @Sendable (String) async throws -> FirebaseSession
    private let now: @Sendable () -> Date
    private var current: FirebaseSession?
    /// One refresh at a time: concurrent callers share it, and sign-out cancels it.
    private var inFlight: Task<FirebaseSession, Error>?
    /// Bumped by sign-in, sign-out and needs-sign-in. A refresh that started under an older
    /// generation must not write its result back (the actor can re-enter during its await).
    private var generation = 0

    public init(store: SecretStore,
                now: @escaping @Sendable () -> Date = Date.init,
                refresher: @escaping @Sendable (String) async throws -> FirebaseSession) {
        self.store = store
        self.now = now
        self.refresher = refresher
        if store.read(Self.refreshAccount) != nil, let uid = store.read(Self.uidAccount) {
            state = .signedIn(uid: uid)
        } else {
            state = .signedOut
        }
    }

    /// Keeps the session from a completed sign-in, superseding any refresh in flight.
    public func adopt(_ session: FirebaseSession) {
        supersede()
        save(session)
    }

    /// A usable ID token, refreshing first when it is close to expiry or when `forceRefresh`.
    public func validToken(forceRefresh: Bool = false) async throws -> FirebaseSession {
        if !forceRefresh, let session = current, session.expiresAt > now().addingTimeInterval(Self.refreshMargin) {
            return session
        }
        if let inFlight { return try await inFlight.value }
        guard let refreshToken = store.read(Self.refreshAccount) else {
            state = .signedOut
            throw AuthError.signInRequired
        }
        let started = generation
        let task = Task { try await self.finishRefresh(refreshToken, generation: started) }
        inFlight = task
        return try await task.value
    }

    private func finishRefresh(_ refreshToken: String, generation started: Int) async throws -> FirebaseSession {
        defer { if generation == started { inFlight = nil } }
        let renewed: FirebaseSession
        do {
            renewed = try await refresher(refreshToken)
        } catch {
            guard generation == started else { throw AuthError.signInRequired }
            if error as? AuthError == .signInRequired { markNeedsSignIn() }
            throw error
        }
        // Signed out, or signed in as someone else, while the refresh was suspended.
        guard generation == started, store.read(Self.refreshAccount) == refreshToken else {
            throw AuthError.signInRequired
        }
        save(renewed)
        return renewed
    }

    /// Drops the credentials and asks the user to sign in again.
    public func markNeedsSignIn() {
        clear()
        state = .needsSignIn
    }

    public func signOut() {
        clear()
        state = .signedOut
    }

    private func save(_ session: FirebaseSession) {
        current = session
        store.write(session.refreshToken, for: Self.refreshAccount)
        store.write(session.uid, for: Self.uidAccount)
        state = .signedIn(uid: session.uid)
    }

    private func supersede() {
        generation += 1
        inFlight?.cancel()
        inFlight = nil
    }

    private func clear() {
        supersede()
        current = nil
        store.delete(Self.refreshAccount)
        store.delete(Self.uidAccount)
    }
}

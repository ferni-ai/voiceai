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

    /// Keeps a session from a completed sign-in (or a refresh).
    public func adopt(_ session: FirebaseSession) {
        current = session
        store.write(session.refreshToken, for: Self.refreshAccount)
        store.write(session.uid, for: Self.uidAccount)
        state = .signedIn(uid: session.uid)
    }

    /// A usable ID token, refreshing first when it is close to expiry or when `forceRefresh`.
    public func validToken(forceRefresh: Bool = false) async throws -> FirebaseSession {
        if !forceRefresh, let session = current, session.expiresAt > now().addingTimeInterval(Self.refreshMargin) {
            return session
        }
        guard let refreshToken = store.read(Self.refreshAccount) else {
            state = .signedOut
            throw AuthError.signInRequired
        }
        do {
            let renewed = try await refresher(refreshToken)
            adopt(renewed)
            return renewed
        } catch AuthError.signInRequired {
            markNeedsSignIn()
            throw AuthError.signInRequired
        }
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

    private func clear() {
        current = nil
        store.delete(Self.refreshAccount)
        store.delete(Self.uidAccount)
    }
}

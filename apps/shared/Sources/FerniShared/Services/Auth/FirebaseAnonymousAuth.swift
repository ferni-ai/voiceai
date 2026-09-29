import Foundation
#if canImport(Security)
import Security
#endif

/// Firebase anonymous sign-in over the public REST API (no Firebase SDK).
///
/// `GET /token` (voice sessions) requires a verified Firebase ID token.
/// Anonymous accounts are the zero-friction path: sign up once, keep the
/// refresh token, refresh the 1-hour ID token as needed.
///
/// Same protocol and behaviour as the Android `FirebaseAnonymousAuth.kt`
/// (which is unit-tested on the JVM).
public actor FirebaseAnonymousAuth {
    public struct Session: Codable, Equatable, Sendable {
        public let idToken: String
        public let refreshToken: String
        public let expiresAt: Date
        public let uid: String
    }

    public enum AuthError: Error, Equatable {
        case http(status: Int, body: String)
        case malformedResponse
    }

    private let apiKey: String
    private let store: FirebaseSessionStore
    private let session: URLSession
    private let identityBaseURL: URL
    private let secureTokenBaseURL: URL
    private let now: @Sendable () -> Date
    private let extraHeaders: [String: String]
    private let expiryMargin: TimeInterval = 60

    public init(
        apiKey: String,
        store: FirebaseSessionStore = KeychainFirebaseSessionStore(),
        session: URLSession = .shared,
        identityBaseURL: URL = URL(string: "https://identitytoolkit.googleapis.com")!,
        secureTokenBaseURL: URL = URL(string: "https://securetoken.googleapis.com")!,
        now: @escaping @Sendable () -> Date = Date.init,
        /// e.g. X-Ios-Bundle-Identifier when the API key is app-restricted
        extraHeaders: [String: String] = [:]
    ) {
        self.apiKey = apiKey
        self.store = store
        self.session = session
        self.identityBaseURL = identityBaseURL
        self.secureTokenBaseURL = secureTokenBaseURL
        self.now = now
        self.extraHeaders = extraHeaders
    }

    /// A valid ID token, refreshing or signing up anonymously as needed.
    public func idToken() async throws -> String {
        if let saved = store.load() {
            if saved.expiresAt.timeIntervalSince(now()) > expiryMargin {
                return saved.idToken
            }
            do {
                let refreshed = try await refresh(saved.refreshToken)
                store.save(refreshed)
                return refreshed.idToken
            } catch AuthError.http(let status, _) where status == 400 {
                // Refresh token revoked or account deleted: start over
                store.clear()
            }
        }
        let created = try await signUp()
        store.save(created)
        return created.idToken
    }

    /// Drop cached credentials (e.g. after the server rejects the token).
    public func invalidate() {
        store.clear()
    }

    // MARK: - REST

    private struct SignUpResponse: Decodable {
        let idToken: String
        let refreshToken: String
        let expiresIn: String
        let localId: String
    }

    private struct RefreshResponse: Decodable {
        let id_token: String
        let refresh_token: String
        let expires_in: String
        let user_id: String
    }

    private func signUp() async throws -> Session {
        var request = URLRequest(url: endpoint(identityBaseURL, "/v1/accounts:signUp"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = Data(#"{"returnSecureToken":true}"#.utf8)
        let r: SignUpResponse = try await send(request)
        return Session(idToken: r.idToken, refreshToken: r.refreshToken,
                       expiresAt: expiry(r.expiresIn), uid: r.localId)
    }

    private func refresh(_ refreshToken: String) async throws -> Session {
        var request = URLRequest(url: endpoint(secureTokenBaseURL, "/v1/token"))
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var form = URLComponents()
        form.queryItems = [
            URLQueryItem(name: "grant_type", value: "refresh_token"),
            URLQueryItem(name: "refresh_token", value: refreshToken),
        ]
        request.httpBody = Data((form.percentEncodedQuery ?? "").utf8)
        let r: RefreshResponse = try await send(request)
        return Session(idToken: r.id_token, refreshToken: r.refresh_token,
                       expiresAt: expiry(r.expires_in), uid: r.user_id)
    }

    private func endpoint(_ base: URL, _ path: String) -> URL {
        var components = URLComponents(url: base.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "key", value: apiKey)]
        return components.url!
    }

    private func send<T: Decodable>(_ request: URLRequest) async throws -> T {
        var request = request
        for (name, value) in extraHeaders { request.setValue(value, forHTTPHeaderField: name) }
        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            throw AuthError.http(status: status, body: String(decoding: data.prefix(300), as: UTF8.self))
        }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw AuthError.malformedResponse
        }
    }

    private func expiry(_ expiresIn: String) -> Date {
        now().addingTimeInterval(TimeInterval(expiresIn) ?? 3600)
    }
}

// MARK: - Storage

/// Persistence for the anonymous session.
public protocol FirebaseSessionStore: Sendable {
    func load() -> FirebaseAnonymousAuth.Session?
    func save(_ session: FirebaseAnonymousAuth.Session)
    func clear()
}

/// Keychain-backed store (refresh tokens are credentials: not UserDefaults).
public struct KeychainFirebaseSessionStore: FirebaseSessionStore {
    private let service: String
    private let account = "firebase-anonymous-session"

    public init(service: String = "ai.ferni.voice.auth") {
        self.service = service
    }

    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }

    public func load() -> FirebaseAnonymousAuth.Session? {
        var q = query
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &item) == errSecSuccess, let data = item as? Data else {
            return nil
        }
        return try? JSONDecoder().decode(FirebaseAnonymousAuth.Session.self, from: data)
    }

    public func save(_ session: FirebaseAnonymousAuth.Session) {
        guard let data = try? JSONEncoder().encode(session) else { return }
        SecItemDelete(query as CFDictionary)
        var q = query
        q[kSecValueData as String] = data
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(q as CFDictionary, nil)
    }

    public func clear() {
        SecItemDelete(query as CFDictionary)
    }
}

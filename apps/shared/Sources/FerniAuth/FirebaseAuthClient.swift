import Foundation

/// A signed-in Firebase user: a short-lived ID token plus the refresh token that renews it.
public struct FirebaseSession: Equatable, Sendable {
    public let uid: String
    public let idToken: String
    public let refreshToken: String
    public let expiresAt: Date

    public init(uid: String, idToken: String, refreshToken: String, expiresAt: Date) {
        self.uid = uid
        self.idToken = idToken
        self.refreshToken = refreshToken
        self.expiresAt = expiresAt
    }
}

public enum AuthError: Error, Equatable {
    /// The user has to sign in (again): no refresh token, or Firebase rejected it.
    case signInRequired
    case cancelled
    case http(Int)
    case malformedResponse
}

/// One HTTP round trip. URLSession in the apps; a scripted double in tests.
public protocol HTTPTransport: Sendable {
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse)
}

extension URLSession: HTTPTransport {
    public func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (data, response) = try await data(for: request)
        guard let http = response as? HTTPURLResponse else { throw AuthError.malformedResponse }
        return (data, http)
    }
}

/// Firebase Auth over its REST API, so the apps hold their own refresh token
/// (in the Keychain) instead of depending on the Firebase SDK's storage.
public struct FirebaseAuthClient: Sendable {
    public let apiKey: String
    let transport: HTTPTransport
    let now: @Sendable () -> Date

    public init(apiKey: String, transport: HTTPTransport, now: @escaping @Sendable () -> Date = Date.init) {
        self.apiKey = apiKey
        self.transport = transport
        self.now = now
    }

    /// The project's public web config, served by Firebase Hosting (the web app reads the same
    /// file). The API key is a public client identifier, so nothing is baked into the binary.
    public static func load(configURL: URL, transport: HTTPTransport) async throws -> FirebaseAuthClient {
        let (data, response) = try await transport.send(URLRequest(url: configURL))
        guard response.statusCode == 200 else { throw AuthError.http(response.statusCode) }
        struct WebConfig: Decodable { let apiKey: String }
        let config = try JSONDecoder().decode(WebConfig.self, from: data)
        return FirebaseAuthClient(apiKey: config.apiKey, transport: transport)
    }

    /// Exchanges an identity-provider ID token (Google today) for a Firebase session.
    public func signIn(idpToken: String, providerId: String) async throws -> FirebaseSession {
        var request = URLRequest(url: URL(string: "https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=\(apiKey)")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        var postBody = URLComponents()
        postBody.queryItems = [URLQueryItem(name: "id_token", value: idpToken), URLQueryItem(name: "providerId", value: providerId)]
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "postBody": postBody.percentEncodedQuery ?? "",
            "requestUri": "http://localhost",
            "returnSecureToken": true,
        ])
        struct Body: Decodable { let localId, idToken, refreshToken, expiresIn: String }
        let body: Body = try await decode(request)
        return session(uid: body.localId, idToken: body.idToken, refreshToken: body.refreshToken, expiresIn: body.expiresIn)
    }

    /// Mints a fresh ID token. A rejected refresh token means the user must sign in again.
    public func refresh(_ refreshToken: String) async throws -> FirebaseSession {
        var request = URLRequest(url: URL(string: "https://securetoken.googleapis.com/v1/token?key=\(apiKey)")!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var form = URLComponents()
        form.queryItems = [URLQueryItem(name: "grant_type", value: "refresh_token"), URLQueryItem(name: "refresh_token", value: refreshToken)]
        request.httpBody = Data((form.percentEncodedQuery ?? "").utf8)
        struct Body: Decodable { let user_id, id_token, refresh_token, expires_in: String }
        let body: Body = try await decode(request)
        return session(uid: body.user_id, idToken: body.id_token, refreshToken: body.refresh_token, expiresIn: body.expires_in)
    }

    private func decode<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await transport.send(request)
        switch response.statusCode {
        case 200: break
        case 400, 401, 403: throw AuthError.signInRequired
        default: throw AuthError.http(response.statusCode)
        }
        guard let body = try? JSONDecoder().decode(T.self, from: data) else { throw AuthError.malformedResponse }
        return body
    }

    private func session(uid: String, idToken: String, refreshToken: String, expiresIn: String) -> FirebaseSession {
        FirebaseSession(uid: uid, idToken: idToken, refreshToken: refreshToken,
                        expiresAt: now().addingTimeInterval(TimeInterval(expiresIn) ?? 3600))
    }
}

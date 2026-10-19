import Foundation

/// Asks the Ferni server for a LiveKit room token as the signed-in user.
/// `/token` (src/servers/api/routes/token.ts) requires a verified Firebase ID
/// token in `Authorization` and answers 401 without one.
public struct VoiceTokenClient: Sendable {
    let server: URL
    let session: AuthSession
    let transport: HTTPTransport

    public init(server: URL, session: AuthSession, transport: HTTPTransport) {
        self.server = server
        self.session = session
        self.transport = transport
    }

    /// The `/token` request for one user and room.
    public static func request(server: URL, room: String, username: String, personaId: String,
                               auth: FirebaseSession, timeZone: TimeZone = .current) -> URLRequest {
        var components = URLComponents(url: server.appendingPathComponent("token"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "room", value: room),
            URLQueryItem(name: "username", value: username),
            URLQueryItem(name: "persona_id", value: personaId),
            URLQueryItem(name: "firebase_uid", value: auth.uid),
            URLQueryItem(name: "timezone", value: timeZone.identifier),
        ]
        var request = URLRequest(url: components.url!)
        request.setValue("Bearer \(auth.idToken)", forHTTPHeaderField: "Authorization")
        return request
    }

    /// The raw `/token` response body. A 401 gets one forced refresh and one retry; a second
    /// 401 drops the session into `.needsSignIn` and throws, so the caller never loops.
    public func fetch(room: String, username: String, personaId: String) async throws -> Data {
        var auth = try await session.validToken()
        var (data, response) = try await transport.send(
            Self.request(server: server, room: room, username: username, personaId: personaId, auth: auth))
        if response.statusCode == 401 {
            auth = try await session.validToken(forceRefresh: true)
            (data, response) = try await transport.send(
                Self.request(server: server, room: room, username: username, personaId: personaId, auth: auth))
            if response.statusCode == 401 {
                await session.markNeedsSignIn()
                throw AuthError.signInRequired
            }
        }
        guard response.statusCode == 200 else { throw AuthError.http(response.statusCode) }
        return data
    }
}

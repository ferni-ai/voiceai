import FerniKit
import Foundation

/// What `GET /token` answers (src/servers/api/routes/token.ts): a LiveKit
/// token for a room the caller owns, and whether the agent was dispatched.
public struct CallToken: Decodable, Sendable, Equatable {
    public let token: String
    public let url: String
    public let room: String
    /// False when the server couldn't dispatch the agent; the session then
    /// knows not to wait the full arrival timeout.
    public let agentDispatched: Bool?

    enum CodingKeys: String, CodingKey {
        case token, url, room
        case agentDispatched = "agent_dispatched"
    }

    public init(token: String, url: String, room: String, agentDispatched: Bool?) {
        self.token = token
        self.url = url
        self.room = room
        self.agentDispatched = agentDispatched
    }
}

public enum CallTokens {
    /// Asks the server for a call token as the signed-in account. Each call
    /// gets a fresh room name the caller then owns (token-room-owner.ts).
    /// - Parameter origin: where this call started, read at each token request:
    ///   `note:<id>` for Home's note (docs/api/from-note.md). Only that exact
    ///   form is sent, as `from`; anything else is left out.
    public static func fetcher(
        api: FerniAPI, origin: @escaping @Sendable () async -> String? = { nil }
    ) -> @Sendable (_ personaID: String) async throws -> CallToken {
        { personaID in
            let room = "ios-\(UUID().uuidString.lowercased())"
            let data = try await api.data("/token", query: [
                URLQueryItem(name: "room", value: room),
                // "User" is the placeholder the agent knows not to say aloud
                // (isRealName in user-identification-handler.ts), as the web sends.
                URLQueryItem(name: "username", value: "User"),
                URLQueryItem(name: "persona_id", value: personaID),
                URLQueryItem(name: "timezone", value: TimeZone.current.identifier),
            ] + (Self.from(await origin()).map { [URLQueryItem(name: "from", value: $0)] } ?? []))
            return try JSONDecoder().decode(CallToken.self, from: data)
        }
    }

    static func from(_ origin: String?) -> String? {
        guard let origin, origin.hasPrefix("note:"), HomeLineStore.validNoteID(String(origin.dropFirst(5))) else { return nil }
        return origin
    }
}

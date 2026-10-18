import Foundation

/// Who's on your team right now, as the server decides it: the same rule the
/// voice agent accepts handoffs by (GET /api/relationship/team-unlocks), so
/// the app never offers a teammate the agent would refuse. Until the server
/// answers, it's Ferni alone.
@MainActor
@Observable
public final class TeamStore {
    public private(set) var unlocked: Set<String> = [PersonaRegistry.ferni.id]
    /// The server's words for why a teammate isn't here yet.
    public private(set) var teasers: [String: String] = [:]
    /// Who answers the next call.
    public var chosen: String = PersonaRegistry.ferni.id

    private let fetch: @Sendable () async throws -> Data
    /// Bumped on every reset: an answer requested for an earlier person is dropped.
    private var generation = 0

    public init(fetch: @escaping @Sendable () async throws -> Data) {
        self.fetch = fetch
    }

    public convenience init(api: FerniAPI) {
        self.init(fetch: { try await api.data("/api/relationship/team-unlocks") })
    }

    public func isOnTeam(_ id: String) -> Bool { unlocked.contains(id) }

    /// Picks who answers next; only teammates who are on the team.
    @discardableResult
    public func choose(_ id: String) -> Bool {
        guard isOnTeam(id) else { return false }
        chosen = id
        return true
    }

    /// A different person: back to Ferni alone until the server answers for them.
    public func reset() {
        generation += 1
        unlocked = [PersonaRegistry.ferni.id]
        teasers = [:]
        chosen = PersonaRegistry.ferni.id
    }

    /// Refreshes from the server; on failure the last answer stays.
    public func refresh() async {
        let asked = generation
        guard let data = try? await fetch(), asked == generation, let parsed = Self.parse(data) else { return }
        unlocked = parsed.unlocked.union([PersonaRegistry.ferni.id])
        teasers = parsed.teasers
        if !unlocked.contains(chosen) { chosen = PersonaRegistry.ferni.id }
    }

    /// The server names teammates by full id ("maya-santos"); the app by first name ("maya").
    static func personaID(_ serverID: String) -> String {
        String(serverID.split(separator: "-").first ?? Substring(serverID)).lowercased()
    }

    static func parse(_ data: Data) -> (unlocked: Set<String>, teasers: [String: String])? {
        struct Body: Decodable {
            struct Member: Decodable { let id: String?; let unlocked: Bool?; let teaserMessage: String? }
            let unlockedMembers: [String]?
            let members: [Member]?
        }
        guard let body = try? JSONDecoder().decode(Body.self, from: data), let ids = body.unlockedMembers else {
            return nil
        }
        let known = Set(PersonaRegistry.all.map(\.id))
        let unlocked = Set(ids.map(personaID)).intersection(known)
        var teasers: [String: String] = [:]
        for member in body.members ?? [] where member.unlocked == false {
            if let id = member.id.map(personaID), known.contains(id), let teaser = member.teaserMessage {
                teasers[id] = teaser
            }
        }
        return (unlocked, teasers)
    }
}

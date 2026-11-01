import AppIntents
import CoreSpotlight
import FerniKit

/// A teammate in Spotlight and Shortcuts (ecosystem plan item 8), found by
/// what they're good for ("money" finds Peter). Only teammates the person has
/// met are indexed or offered; memories, people and follow-ups never are.
struct TeamMember: AppEntity, IndexedEntity {
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Teammate"
    static let defaultQuery = TeamMemberQuery()

    let id: String
    let name: String
    let role: String
    let specialty: String

    init(_ persona: Persona) {
        id = persona.id
        name = persona.name
        role = persona.role
        specialty = persona.specialty
    }

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)", subtitle: "\(role)")
    }

    var attributeSet: CSSearchableItemAttributeSet {
        let set = defaultAttributeSet
        set.title = name
        set.contentDescription = specialty
        set.keywords = (role + " " + specialty).lowercased().split { !$0.isLetter }.map(String.init)
        return set
    }
}

/// Shortcuts' picker: the teammates the person has met.
struct TeamMemberQuery: EntityQuery {
    /// Set by the app: who's on the team now.
    @MainActor static var met: (@MainActor () -> Set<String>)?

    private func members() async -> [TeamMember] {
        let met = await MainActor.run { Self.met?() ?? [PersonaRegistry.ferni.id] }
        return PersonaRegistry.all.filter { met.contains($0.id) }.map(TeamMember.init)
    }

    func entities(for identifiers: [String]) async throws -> [TeamMember] {
        await members().filter { identifiers.contains($0.id) }
    }

    func suggestedEntities() async throws -> [TeamMember] { await members() }
}

/// A teammate opened from Spotlight: the same door as Talk, so consent is
/// asked first and someone not on the team means Ferni answers.
struct TalkToTeammateIntent: OpenIntent {
    static let title: LocalizedStringResource = "Talk to a teammate"

    @Parameter(title: "Teammate") var target: TeamMember

    func perform() async throws -> some IntentResult {
        let handler = await TalkIntent.handler
        await handler?(target.id)
        return .result()
    }
}

@MainActor protocol SpotlightIndexing {
    func index(_ members: [TeamMember]) async throws
    func remove(_ ids: [String]) async throws
}

/// The device's Spotlight index.
struct SystemSpotlight: SpotlightIndexing {
    func index(_ members: [TeamMember]) async throws { try await CSSearchableIndex.default().indexAppEntities(members) }
    func remove(_ ids: [String]) async throws {
        try await CSSearchableIndex.default().deleteAppEntities(identifiedBy: ids, ofType: TeamMember.self)
    }
}

/// Keeps Spotlight to the team as it is: met teammates in, anyone no longer
/// on the team (another person signed in, or the account was deleted) out.
@MainActor final class TeamSpotlight {
    private let index: SpotlightIndexing
    private var indexed: Set<String> = []

    init(index: SpotlightIndexing = SystemSpotlight()) { self.index = index }

    func sync(met: Set<String>) async {
        let members = PersonaRegistry.all.filter { met.contains($0.id) }.map(TeamMember.init)
        let now = Set(members.map(\.id))
        let gone = indexed.subtracting(now)
        try? await index.index(members)
        if !gone.isEmpty { try? await index.remove(Array(gone)) }
        indexed = now
    }
}

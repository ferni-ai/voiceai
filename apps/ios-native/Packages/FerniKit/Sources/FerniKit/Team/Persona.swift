import Foundation

/// A member of Ferni's team. Ids match the server's persona ids
/// (src/personas/bundles/<id>); colors live in FerniDesign.
public struct Persona: Identifiable, Equatable, Sendable {
    public let id: String
    public let name: String
    public let role: String
    public let specialty: String
}

/// Everyone on the team, in the order the app shows them. Roles are the web's
/// role labels (aiLabel.role in apps/web's en-US.json), in sentence case like
/// every other label, except Alex: Seth made him the chief of staff
/// (2026-10-18). One table: TeamUnlock reads its roles from here (design audit
/// P2 #14: two tables, six names that disagreed, mixed capitals).
public enum PersonaRegistry {
    public static let ferni = Persona(
        id: "ferni", name: "Ferni", role: "Life coach",
        specialty: "Life direction, and bringing in the right teammate")
    public static let maya = Persona(
        id: "maya", name: "Maya", role: "Habits coach",
        specialty: "Building habits, breaking bad ones")
    public static let alex = Persona(
        id: "alex", name: "Alex", role: "Chief of staff",
        specialty: "Hard conversations, relationships, your calendar")
    public static let jordan = Persona(
        id: "jordan", name: "Jordan", role: "Life planner",
        specialty: "Goals, plans and life's big moments")
    public static let peter = Persona(
        id: "peter", name: "Peter", role: "Insights mentor",
        specialty: "Patterns, research and finding answers")
    public static let nayan = Persona(
        id: "nayan", name: "Nayan", role: "Wisdom guide",
        specialty: "Mindfulness and the bigger questions")

    public static let all: [Persona] = [ferni, maya, alex, jordan, peter, nayan]

    /// The persona for an id; Ferni for an id the app doesn't know yet.
    public static func get(_ id: String) -> Persona {
        all.first { $0.id == id.lowercased() } ?? ferni
    }

    /// The teammate a server persona id names, or nil when it isn't one of
    /// them. The server's canonical ids are full names (src/personas/persona-ids.ts);
    /// an explicit table, because "peter-lynch" is not Peter.
    public static func known(serverID: String) -> Persona? {
        let canonical = ["ferni": "ferni", "maya-santos": "maya", "alex-chen": "alex",
                         "jordan-taylor": "jordan", "peter-john": "peter", "nayan-patel": "nayan"]
        let id = serverID.lowercased()
        let appID = canonical[id] ?? id
        return all.first { $0.id == appID }
    }
}

/// How far the relationship with Ferni has come. Raw values are the server's
/// stage ids (src/types/relationship-stages.ts); teammates join as it grows
/// (TeamUnlock).
public enum RelationshipStage: String, Codable, CaseIterable, Sendable {
    case firstMeeting = "first-meeting"
    case gettingStarted = "getting-started"
    case buildingTrust = "building-trust"
    case established = "established"
    case deepPartnership = "deep-partnership"

    public var ordinal: Int { Self.allCases.firstIndex(of: self) ?? 0 }

    public var title: String {
        switch self {
        case .firstMeeting: return "First Meeting"
        case .gettingStarted: return "Getting Started"
        case .buildingTrust: return "Building Trust"
        case .established: return "Established"
        case .deepPartnership: return "Deep Partnership"
        }
    }
}

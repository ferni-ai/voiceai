import Foundation
import Observation

/// Home's greeting and Ferni's note, from `GET /api/home?tz=<IANA>`
/// (docs/api/home.md, server branch feat/api-home, review split as #2169):
///
///     { "greeting": { "kind": "followUp" | "firstVisit" | "timeOfDay", "text", "topicId"? },
///       "note"?: { "id", "text", "createdAt" } }
///
/// A follow-up's text is in the person's own words; the app frames it. The
/// server sends no name. The note id is what a call started from it carries
/// (`from=note:<id>`, docs/api/from-note.md), so only the documented form
/// (16 lowercase hex) is kept. The route may not be deployed: then (404), on
/// any error, or with nothing usable, there's nothing and Home shows its own
/// time-of-day words.
@MainActor
@Observable
public final class HomeLineStore {
    public struct Home: Equatable, Sendable {
        public enum Greeting: Equatable, Sendable {
            case followUp(text: String, topicID: String?), firstVisit, timeOfDay
        }
        public struct Note: Equatable, Sendable {
            public let id: String, text: String, createdAt: Date?
            public init(id: String, text: String, createdAt: Date?) { self.id = id; self.text = text; self.createdAt = createdAt }
        }
        public let greeting: Greeting?
        public let note: Note?
        public init(greeting: Greeting?, note: Note?) { self.greeting = greeting; self.note = note }
    }

    /// Longer than this doesn't belong on Home; it isn't shown.
    static let maxText = 160

    public private(set) var current: Home?
    @ObservationIgnored private let api: FerniAPI
    @ObservationIgnored private let timeZone: @Sendable () -> TimeZone
    /// Bumped by reset(): an answer for the previous person is dropped.
    @ObservationIgnored private var generation = 0

    public init(api: FerniAPI, timeZone: @escaping @Sendable () -> TimeZone = { .current }) {
        self.api = api
        self.timeZone = timeZone
    }

    /// Fetch again. A failure clears what was shown rather than keeping it.
    public func refresh() async {
        let asked = generation
        let home: Home?
        do {
            let data = try await api.data("/api/home", query: [URLQueryItem(name: "tz", value: timeZone().identifier)])
            home = Self.parse(try JSONDecoder().decode(Wire.self, from: data))
        } catch {
            home = nil
        }
        guard asked == generation else { return } // someone else signed in meanwhile
        current = home
    }

    /// The person signed out or changed.
    public func reset() {
        generation += 1
        current = nil
    }

    // MARK: Wire

    struct Wire: Decodable {
        struct Greeting: Decodable { let kind: String; let text: String?; let topicId: String? }
        struct Note: Decodable { let id: String; let text: String; let createdAt: String? }
        let greeting: Greeting?
        let note: Note?
    }

    static func parse(_ wire: Wire) -> Home? {
        func text(_ s: String?) -> String? {
            guard let t = s?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty, t.count <= maxText else { return nil }
            return t
        }
        let greeting: Home.Greeting? = switch wire.greeting?.kind {
        case "followUp": text(wire.greeting?.text).map { .followUp(text: $0, topicID: wire.greeting?.topicId) }
        case "firstVisit": .firstVisit
        case "timeOfDay": .timeOfDay
        default: nil
        }
        let note = wire.note.flatMap { n -> Home.Note? in
            guard validNoteID(n.id), let t = text(n.text) else { return nil }
            return Home.Note(id: n.id, text: t, createdAt: n.createdAt.flatMap { ISO8601DateFormatter().date(from: $0) })
        }
        return greeting == nil && note == nil ? nil : Home(greeting: greeting, note: note)
    }

    /// docs/api/from-note.md: exactly 16 lowercase hex characters.
    public nonisolated static func validNoteID(_ id: String) -> Bool {
        id.count == 16 && id.unicodeScalars.allSatisfy { ("0"..."9").contains($0) || ("a"..."f").contains($0) }
    }
}

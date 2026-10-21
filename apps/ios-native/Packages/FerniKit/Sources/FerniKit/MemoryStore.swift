import Foundation

/// What Ferni remembers about you, from the same endpoints as the web:
/// GET /api/cognitive/memories, DELETE /api/cognitive/memories/:id.
/// There's no edit endpoint, so a note can be forgotten but not reworded.
@MainActor
@Observable
public final class MemoryStore {
    public struct Note: Identifiable, Equatable, Sendable {
        public let id: String
        public let content: String
        /// fact, preference, goal or pattern (the server's UI types).
        public let kind: String
        public let learnedAt: Date?
        /// Only notes Ferni wrote down can be forgotten; profile-derived ones aren't stored.
        public let canForget: Bool
    }

    public enum Load: Equatable, Sendable { case idle, loading, loaded, failed }

    public private(set) var notes: [Note] = []
    public private(set) var load: Load = .idle
    /// Bumped by every forget the server accepts: what shows a note elsewhere
    /// (the "I'll remember" card) looks again (critic L).
    public private(set) var forgotten = 0

    private let api: FerniAPI
    /// Bumped on every reset: an answer requested for an earlier person is dropped.
    private var generation = 0

    public init(api: FerniAPI) { self.api = api }

    public func refresh() async {
        let asked = generation
        load = .loading
        do {
            let fetched = try Self.parse(await api.data("/api/cognitive/memories"))
            guard asked == generation else { return } // someone else signed in meanwhile
            notes = fetched
            load = .loaded
        } catch {
            guard asked == generation else { return }
            // Signed out or refused: whatever was shown belonged to someone else.
            if let error = error as? FerniAPIError, error == .notSignedIn || error == .status(401) || error == .status(403) {
                notes = []
            }
            load = .failed
        }
    }

    /// A different person (sign-out, a new account): nothing of the last one stays.
    public func reset() {
        generation += 1
        notes = []
        load = .idle
    }

    /// Notes learned at or after `since` (the call that just ended), newest first.
    public func learned(since: Date, limit: Int = 3) -> [Note] {
        Array(notes.filter { ($0.learnedAt ?? .distantPast) >= since }
            .sorted { ($0.learnedAt ?? .distantPast) > ($1.learnedAt ?? .distantPast) }
            .prefix(limit))
    }

    /// Forgets a note; it disappears at once and comes back if the server refuses.
    @discardableResult
    public func forget(_ note: Note) async -> Bool {
        guard note.canForget, let index = notes.firstIndex(of: note) else { return false }
        let asked = generation
        notes.remove(at: index)
        do {
            let id = note.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? note.id
            _ = try await api.data("/api/cognitive/memories/\(id)", method: "DELETE")
            forgotten += 1
            return true
        } catch {
            if asked == generation { notes.insert(note, at: min(index, notes.count)) }
            return false
        }
    }

    static func parse(_ data: Data) throws -> [Note] {
        struct Body: Decodable {
            struct Memory: Decodable {
                let id: String?
                let content: String?
                let type: String?
                let learnedAt: String?
                let sourceType: String?
            }
            let memories: [Memory]?
        }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        return try JSONDecoder().decode(Body.self, from: data).memories?.compactMap { m in
            guard let id = m.id, !id.isEmpty,
                  let content = m.content?.trimmingCharacters(in: .whitespacesAndNewlines), !content.isEmpty
            else { return nil }
            let date = m.learnedAt.flatMap { iso.date(from: $0) ?? plain.date(from: $0) }
            return Note(id: id, content: content, kind: m.type ?? "fact", learnedAt: date,
                        canForget: m.sourceType == "persona_memory")
        } ?? []
    }
}

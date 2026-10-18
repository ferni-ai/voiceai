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

    private let api: FerniAPI

    public init(api: FerniAPI) { self.api = api }

    public func refresh() async {
        load = .loading
        do {
            notes = try Self.parse(await api.data("/api/cognitive/memories"))
            load = .loaded
        } catch {
            load = .failed
        }
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
        notes.remove(at: index)
        do {
            let id = note.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? note.id
            _ = try await api.data("/api/cognitive/memories/\(id)", method: "DELETE")
            return true
        } catch {
            notes.insert(note, at: min(index, notes.count))
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

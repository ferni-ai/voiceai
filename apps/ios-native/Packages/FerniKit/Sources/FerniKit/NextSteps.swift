import Foundation

/// What the person said they'd do in the call that just ended, from
/// `GET /api/commitments?status=active` (src/api/routes/commitments.ts):
/// items `{id, description, topic?, dueDate?, createdAt}`, times in epoch
/// milliseconds. Shown after a call so the step can go to their calendar or
/// task app (ecosystem plan items 1 and 2). Stateless: the card keeps what it
/// shows, and that goes with the view on sign-out.
@MainActor
public final class NextSteps {
    public struct Step: Identifiable, Equatable, Sendable {
        public let id: String, text: String, due: Date?, topic: String?
        public init(id: String, text: String, due: Date?, topic: String?) { self.id = id; self.text = text; self.due = due; self.topic = topic }
    }

    static let maxText = 160

    private let api: FerniAPI
    public init(api: FerniAPI) { self.api = api }

    /// The steps made since `start` (the call's start), newest first, at most
    /// three; empty on any failure.
    public func since(_ start: Date) async -> [Step] {
        struct Item: Decodable { let id: String; let description: String?; let topic: String?; let dueDate: Double?; let createdAt: Double }
        struct Answer: Decodable { let items: [Item] }
        do {
            let data = try await api.data("/api/commitments", query: [
                URLQueryItem(name: "status", value: "active"), URLQueryItem(name: "limit", value: "20"),
            ])
            let since = start.timeIntervalSince1970 * 1000
            return Array(try JSONDecoder().decode(Answer.self, from: data).items
                .filter { $0.createdAt >= since }
                .sorted { $0.createdAt > $1.createdAt }
                .compactMap { item -> Step? in
                    guard let text = item.description?.trimmingCharacters(in: .whitespacesAndNewlines),
                          !text.isEmpty, text.count <= Self.maxText else { return nil }
                    return Step(id: item.id, text: text, due: item.dueDate.map { Date(timeIntervalSince1970: $0 / 1000) }, topic: item.topic)
                }
                .prefix(3))
        } catch {
            return []
        }
    }
}

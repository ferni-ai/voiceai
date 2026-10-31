import Foundation
import os

/// What Ferni kept from the call that just ended, as the "I'll remember" card
/// shows it (docs/api/call-remembered.md):
///
/// - GET    /api/memories/from-call?since=<call start, epoch ms>: up to three items
/// - DELETE /api/memories/remembered/:id: Forget
/// - PATCH  /api/memories/remembered/:id `{ "value": "…" }`: Not quite (a correction)
///
/// The server leaves the route off (404) unless its memory view is on; that,
/// an error or an empty answer all mean the card shows nothing.
@MainActor
public final class CallRemembered {
    public struct Item: Identifiable, Equatable, Decodable, Sendable {
        public let id: String
        /// "you", or who it's about.
        public let subject: String
        /// "key: value" (or just the value).
        public let detail: String

        public init(id: String, subject: String, detail: String) {
            self.id = id
            self.subject = subject
            self.detail = detail
        }

        /// The part a correction replaces ("Biscuit" in "dog name: Biscuit").
        public var value: String { parts.value }
        /// What it's about ("dog name"), or nil.
        public var key: String? { parts.key }

        private var parts: (key: String?, value: String) {
            guard let colon = detail.range(of: ": ") else { return (nil, detail) }
            return (String(detail[..<colon.lowerBound]), String(detail[colon.upperBound...]))
        }

        /// The line the card shows: the detail, with who it's about unless it's you.
        public var sentence: String {
            let line = subject.lowercased() == "you" ? detail : "\(subject): \(detail)"
            return line.prefix(1).uppercased() + line.dropFirst()
        }
    }

    /// The server's limit on a correction.
    public static let maxCorrection = 200

    private let api: FerniAPI
    private let log = Logger(subsystem: "com.sethdford.ferni", category: "memory")

    public init(api: FerniAPI) { self.api = api }

    /// The items learned since `start` (at most three); empty on any failure.
    public func items(since start: Date) async -> [Item] {
        struct Answer: Decodable { let items: [Item] }
        let ms = String(Int64((start.timeIntervalSince1970 * 1000).rounded(.down)))
        do {
            let data = try await api.data("/api/memories/from-call", query: [URLQueryItem(name: "since", value: ms)])
            let items = try JSONDecoder().decode(Answer.self, from: data).items
            return Array(items.filter { Self.validID($0.id) }.prefix(3))
        } catch {
            return []
        }
    }

    /// Forget one. True when the server confirmed it.
    public func forget(_ item: Item) async -> Bool {
        guard Self.validID(item.id) else { return false }
        do {
            _ = try await api.data("/api/memories/remembered/\(item.id)", method: "DELETE")
            return true
        } catch {
            log.error("Forget failed: \(String(describing: error), privacy: .public)")
            return false
        }
    }

    /// Correct one to `value`. The corrected item, or nil if it couldn't be saved
    /// (empty, too long, or the server said no).
    public func correct(_ item: Item, to value: String) async -> Item? {
        guard Self.validID(item.id), let clean = Self.cleaned(value) else { return nil }
        struct Body: Encodable, Sendable { let value: String }
        struct Answer: Decodable { let fact: Item }
        do {
            let data = try await api.data("/api/memories/remembered/\(item.id)", method: "PATCH", json: Body(value: clean))
            return try JSONDecoder().decode(Answer.self, from: data).fact
        } catch {
            log.error("Correction failed: \(String(describing: error), privacy: .public)")
            return nil
        }
    }

    /// The correction as the server will store it, or nil if it would refuse it.
    static func cleaned(_ value: String) -> String? {
        let clean = value.unicodeScalars.map { CharacterSet.controlCharacters.contains($0) ? " " : String($0) }.joined()
            .split(whereSeparator: \.isWhitespace).joined(separator: " ")
        return clean.isEmpty || clean.count > maxCorrection ? nil : clean
    }

    /// Fact ids as the server accepts them; anything else never reaches a URL path.
    static func validID(_ id: String) -> Bool {
        !id.isEmpty && id.count <= 200 && id.unicodeScalars.allSatisfy {
            CharacterSet.alphanumerics.contains($0) && $0.isASCII || $0 == "_" || $0 == "-"
        }
    }
}

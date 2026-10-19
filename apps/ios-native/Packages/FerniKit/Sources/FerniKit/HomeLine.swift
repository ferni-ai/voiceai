import Foundation
import Observation

/// Home's line from Ferni, from `GET /api/home` (delight plan §1.6, delight
/// gap 1): `{ "name"?: String, "line"?: String }`. The name only when the
/// person said it, the line one light thread from last time; the server
/// filters out heavy topics. The route may not exist yet: then (404), on any
/// error, or with nothing usable, there's no line and Home shows its
/// time-of-day words.
@MainActor
@Observable
public final class HomeLineStore {
    public struct Line: Equatable, Sendable, Decodable {
        public let name: String?
        public let line: String?
        public init(name: String?, line: String?) { self.name = name; self.line = line }
    }

    /// Longer than this doesn't belong on Home; it isn't shown.
    static let maxLine = 160, maxName = 40

    public private(set) var current: Line?
    @ObservationIgnored private let api: FerniAPI

    public init(api: FerniAPI) { self.api = api }

    /// Fetch again. A failure clears the line rather than keeping a stale one.
    public func refresh() async {
        do {
            let data = try await api.data("/api/home")
            current = Self.cleaned(try JSONDecoder().decode(Line.self, from: data))
        } catch {
            current = nil
        }
    }

    /// The person signed out or changed.
    public func reset() { current = nil }

    static func cleaned(_ raw: Line) -> Line? {
        func clean(_ s: String?, max: Int) -> String?? {
            guard let s else { return .some(nil) }
            let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
            if t.isEmpty { return .some(nil) }
            return t.count > max ? .none : .some(t)
        }
        guard let name = clean(raw.name, max: maxName), let line = clean(raw.line, max: maxLine) else { return nil }
        return name == nil && line == nil ? nil : Line(name: name, line: line)
    }
}

import Foundation

/// Whether this build is too old to keep using, from the server's app config.
///
/// Contract (proposed; no server route yet, so nothing is ever required):
/// GET /api/app-config/ios → `{ "minimumBuild": 42, "message": "…" }`.
/// A missing route, an error or a malformed answer means no requirement:
/// the check can only block a build the server explicitly names as too old.
@MainActor
@Observable
public final class MinimumBuild {
    public private(set) var updateRequired = false
    /// The server's words for the update screen, if it sent any.
    public private(set) var message: String?

    private let api: FerniAPI
    private let currentBuild: Int?

    /// - Parameter currentBuild: this build's CFBundleVersion.
    public init(api: FerniAPI, currentBuild: Int?) {
        self.api = api
        self.currentBuild = currentBuild
    }

    public func check() async {
        guard let data = try? await api.data("/api/app-config/ios"),
              let answer = Self.parse(data) else { return }
        updateRequired = Self.required(current: currentBuild, minimum: answer.minimumBuild)
        message = updateRequired ? answer.message : nil
    }

    struct Answer: Decodable { let minimumBuild: Int?; let message: String? }

    static func parse(_ data: Data) -> Answer? { try? JSONDecoder().decode(Answer.self, from: data) }

    /// Only a known build below a known minimum must update.
    static func required(current: Int?, minimum: Int?) -> Bool {
        guard let current, let minimum else { return false }
        return current < minimum
    }
}

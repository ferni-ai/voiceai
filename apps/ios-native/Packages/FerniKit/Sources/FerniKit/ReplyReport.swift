import Foundation

/// Reporting something Ferni said (App Store guideline 1.2): POST /api/reports
/// (#2038). The server finds the reply in the caller's own transcript by time
/// and stores its text, never the app's; `textHint` only helps it pick.
public enum ReplyReport {
    public enum Reason: String, CaseIterable, Sendable {
        case harmful, wrong, inappropriate, other

        public var label: String {
            switch self {
            case .harmful: "It could hurt someone"
            case .wrong: "It's not true"
            case .inappropriate: "It's inappropriate"
            case .other: "Something else"
            }
        }
    }

    public static func send(
        using api: FerniAPI, sessionID: String, saidAt: Date, reason: Reason,
        note: String?, textHint: String?, appVersion: String?
    ) async throws {
        struct Body: Encodable, Sendable {
            let sessionId: String
            let messageAt: Int
            let reason: String
            let note: String?
            let textHint: String?
            let appVersion: String?
            let platform = "ios"
        }
        let trimmed = note?.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = Body(
            sessionId: String(sessionID.prefix(200)),
            messageAt: Int(saidAt.timeIntervalSince1970 * 1000),
            reason: reason.rawValue,
            note: trimmed?.isEmpty == false ? String(trimmed!.prefix(500)) : nil,
            textHint: textHint.map { String($0.prefix(400)) },
            appVersion: appVersion.map { String($0.prefix(40)) }
        )
        _ = try await api.data("/api/reports", method: "POST", json: body)
    }
}

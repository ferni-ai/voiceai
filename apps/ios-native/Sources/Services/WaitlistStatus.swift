import Foundation

// MARK: - Waitlist Status
/// Where a signed-in person stands in line: the shared waitlist contract
/// (GET /api/waitlist/me, and the body of a 403 { code: "WAITLISTED" } from
/// /token while the gate is on). Lets the app show a waiting screen instead
/// of "Failed to get token".

struct WaitlistStatus: Decodable, Equatable, Identifiable {
    struct Referrals: Decodable, Equatable {
        let verified: Int
        let creditedDays: Int
        let max: Int
    }

    let status: String  // waiting | admitted | expired | not_joined
    let position: Int?
    let wavesAway: Int?
    let nextWaveAt: String?
    let referralUrl: String?
    let referrals: Referrals?
    let foundingMember: Bool?
    let foundingWave: Int?

    var id: String { "\(status)-\(position ?? 0)" }
    var isAdmitted: Bool { status == "admitted" }

    /// A /token refusal that means "you're in line": status 403 with code WAITLISTED.
    static func fromRefusal(statusCode: Int, body: Data) -> WaitlistStatus? {
        guard statusCode == 403,
              let object = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
              object["code"] as? String == "WAITLISTED",
              let status = try? JSONDecoder().decode(WaitlistStatus.self, from: body),
              ["waiting", "admitted"].contains(status.status)
        else { return nil }
        return status
    }

    /// Only https links go on the share sheet.
    var inviteURL: URL? {
        guard let referralUrl, referralUrl.hasPrefix("https://") else { return nil }
        return URL(string: referralUrl)
    }

    /// "You're #432 — about 4 waves away"
    var positionLine: String {
        let place = position.map { "You’re #\($0)" } ?? "You’re on the list"
        guard let waves = wavesAway else { return place }
        return waves > 1 ? "\(place) — about \(waves) waves away" : "\(place) — you’re in the very next wave"
    }

    /// "The next wave opens Thursday, October 22."
    func nextWaveLine(locale: Locale = .current, timeZone: TimeZone = .current) -> String? {
        guard let nextWaveAt else { return nil }
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = parser.date(from: nextWaveAt) ?? ISO8601DateFormatter().date(from: nextWaveAt) else { return nil }
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = timeZone
        formatter.setLocalizedDateFormatFromTemplate("EEEEMMMMd")
        return "The next wave opens \(formatter.string(from: date))."
    }

    /// "Founding member · Wave 7"
    var badge: String? {
        guard foundingMember == true else { return nil }
        return foundingWave.map { "Founding member · Wave \($0)" } ?? "Founding member"
    }
}

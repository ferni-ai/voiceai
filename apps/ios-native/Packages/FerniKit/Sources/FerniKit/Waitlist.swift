import Foundation

/// Where a signed-in person stands in line: the waitlist contract shared with
/// the web and Android (GET /api/waitlist/me, #2033). With the gate on (#1953),
/// /token refuses someone who isn't admitted yet with a 403 the app reads into
/// this, so Talk shows their place in line instead of an error.
public struct WaitlistStatus: Decodable, Equatable, Sendable, Identifiable {
    public struct Referrals: Decodable, Equatable, Sendable {
        public let verified: Int
        public let creditedDays: Int
        public let max: Int
    }

    /// waiting | admitted | not_joined (expired never reaches the screen).
    public let status: String
    public let position: Int?
    public let wavesAway: Int?
    public let nextWaveAt: String?
    public let referralUrl: String?
    public let referrals: Referrals?
    public let foundingMember: Bool?
    public let foundingWave: Int?

    public var id: String { "\(status)-\(position ?? 0)" }
    public var isAdmitted: Bool { status == "admitted" }

    /// The refusal said "waitlisted" without saying where; /me can fill it in.
    public var detailsUnknown: Bool { status == "waiting" && position == nil }

    /// Not on the list at all: the server never puts an anonymous account on it
    /// (isAdmitted refuses anonymous; /me answers not_joined). They have no place,
    /// no invite link and no email to be told at, so the screen asks them to
    /// sign in instead of promising an email (critic H1, 2026-10-20).
    public var notJoined: Bool { status == "not_joined" }

    /// Someone who isn't on the list yet: not_joined, or an anonymous account
    /// whose place couldn't be read.
    public func needsToJoin(anonymous: Bool) -> Bool {
        !isAdmitted && (notJoined || (anonymous && position == nil))
    }

    public static let notJoinedStatus = WaitlistStatus(status: "not_joined")

    public init(
        status: String, position: Int? = nil, wavesAway: Int? = nil, nextWaveAt: String? = nil,
        referralUrl: String? = nil, referrals: Referrals? = nil, foundingMember: Bool? = nil, foundingWave: Int? = nil
    ) {
        self.status = status
        self.position = position
        self.wavesAway = wavesAway
        self.nextWaveAt = nextWaveAt
        self.referralUrl = referralUrl
        self.referrals = referrals
        self.foundingMember = foundingMember
        self.foundingWave = foundingWave
    }

    /// Waiting, place not known yet.
    public static let unknownPosition = WaitlistStatus(status: "waiting")

    /// A refusal that means "you're in line". The contract sends
    /// 403 `{ code: "WAITLISTED", ...the /me fields }`; the gate's first version
    /// (#1953) sends 403 `{ error: "not_admitted", waitlisted: true }` with no
    /// details, which reads as waiting, place unknown. Anything else (another
    /// 403, a 503 `admission_unavailable`) is not the waitlist.
    public static func fromRefusal(statusCode: Int, body: Data) -> WaitlistStatus? {
        guard statusCode == 403,
              let object = try? JSONSerialization.jsonObject(with: body) as? [String: Any]
        else { return nil }
        if object["code"] as? String == "WAITLISTED" { return fromMe(body) }
        let waitlisted = object["error"] as? String == "not_admitted" || object["waitlisted"] as? Bool == true
        return waitlisted ? unknownPosition : nil
    }

    /// The body of GET /api/waitlist/me (or a contract refusal); nil unless
    /// waiting, admitted or not_joined.
    public static func fromMe(_ body: Data) -> WaitlistStatus? {
        guard let status = try? JSONDecoder().decode(WaitlistStatus.self, from: body),
              ["waiting", "admitted", "not_joined"].contains(status.status)
        else { return nil }
        return status
    }

    /// What POST /api/waitlist/join did (src/api/waitlist-queue-routes.ts on main).
    public enum JoinOutcome: Equatable, Sendable {
        /// In line now: the answer is /me's.
        case joined(WaitlistStatus)
        /// The server joins only a sign-in with a verified email (401
        /// sign_in_required): a phone number alone can't join.
        case needsEmail
        case failed
    }

    /// POST /api/waitlist/join as the signed-in account (critic H1: someone
    /// signed in but not on the list had no way onto it from the app).
    public static func join(api: FerniAPI) async -> JoinOutcome {
        do {
            let body = try await api.data("/api/waitlist/join", method: "POST", json: [String: String]())
            return fromMe(body).map { .joined($0) } ?? .failed
        } catch let error as FerniAPIError where error == .status(401) || error == .notSignedIn {
            return .needsEmail
        } catch {
            return .failed
        }
    }

    /// GET /api/waitlist/me as the signed-in account; nil when it can't be read.
    public static func me(api: FerniAPI) async -> WaitlistStatus? {
        guard let body = try? await api.data("/api/waitlist/me") else { return nil }
        return fromMe(body)
    }

    /// Only https links go on the share sheet.
    public var inviteURL: URL? {
        guard let referralUrl, referralUrl.hasPrefix("https://") else { return nil }
        return URL(string: referralUrl)
    }

    /// "You're #432, about 4 waves away"; nil while the place isn't known.
    public var positionLine: String? {
        guard let position else { return nil }
        guard let waves = wavesAway else { return String(localized: "You’re #\(position)") }
        return waves > 1
            ? String(localized: "You’re #\(position), about \(waves) waves away")
            : String(localized: "You’re #\(position), in the very next wave")
    }

    /// "The next wave opens Thursday, October 22."
    public func nextWaveLine(locale: Locale = .current, timeZone: TimeZone = .current) -> String? {
        guard let nextWaveAt else { return nil }
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = parser.date(from: nextWaveAt) ?? ISO8601DateFormatter().date(from: nextWaveAt) else { return nil }
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = timeZone
        formatter.setLocalizedDateFormatFromTemplate("EEEEMMMMd")
        return String(localized: "The next wave opens \(formatter.string(from: date)).")
    }

    /// "Founding member · Wave 7"
    public var badge: String? {
        guard foundingMember == true else { return nil }
        return foundingWave.map { String(localized: "Founding member · Wave \($0)") } ?? String(localized: "Founding member")
    }
}

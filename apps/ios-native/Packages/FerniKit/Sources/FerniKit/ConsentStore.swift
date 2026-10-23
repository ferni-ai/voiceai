import Foundation

/// Agreement that what you say goes to the services that let Ferni hear,
/// think and speak (App Store guideline 5.1.2(i)). Asked before any audio
/// leaves the phone; withdrawable in Settings, which stops calls until you
/// agree again. A new `currentVersion` (changed wording or providers) asks again.
///
/// Agreements belong to a person, not a phone: each is kept under the Firebase
/// uid that gave it, and only the signed-in uid's own agreement counts. A new
/// person on the same phone, or a replaced anonymous account, is asked again.
@MainActor
@Observable
public final class ConsentStore {
    public static let currentVersion = "2026-10-18"

    public struct Agreement: Codable, Equatable, Sendable {
        public let uid: String
        public let version: String
        public let agreedAt: Date
    }

    /// The signed-in person's agreement, if they gave one.
    public private(set) var agreement: Agreement?
    public private(set) var uid: String?

    /// Sends the agreement to the server, where it's kept with the account.
    // TODO(ios-rebuild, server lane): no route stores this consent yet (only family-call
    // and SMS consent exist). Until one lands this stays nil and the agreement lives on
    // the device, per uid; once it exists the server's record should be authoritative.
    public var upload: (@Sendable (Agreement?) async throws -> Void)?

    private let defaults: UserDefaults
    private static let key = "ferni.consent.processing.byUID"

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    /// True only for this uid's agreement to today's wording.
    public var hasAgreed: Bool {
        guard let uid, let agreement else { return false }
        return agreement.uid == uid && agreement.version == Self.currentVersion
    }

    /// Call on every sign-in change: the agreement shown is the new person's.
    public func use(uid: String?) {
        self.uid = uid
        agreement = uid.flatMap { stored()[$0] }
    }

    /// Records agreement for the signed-in uid. False (nothing stored) without one.
    @discardableResult
    public func agree(now: Date = .now) -> Bool {
        guard let uid else { return false }
        set(Agreement(uid: uid, version: Self.currentVersion, agreedAt: now), for: uid)
        return true
    }

    public func withdraw() {
        guard let uid else { return }
        set(nil, for: uid)
    }

    /// Sign-out and account deletion: this uid's agreement leaves the phone.
    public func forget(uid gone: String) {
        var all = stored()
        all[gone] = nil
        save(all)
        if gone == uid { agreement = nil }
    }

    private func set(_ new: Agreement?, for uid: String) {
        var all = stored()
        all[uid] = new
        save(all)
        agreement = new
        if let upload { Task { try? await upload(new) } }
    }

    private func stored() -> [String: Agreement] {
        defaults.data(forKey: Self.key).flatMap { try? JSONDecoder().decode([String: Agreement].self, from: $0) } ?? [:]
    }

    private func save(_ all: [String: Agreement]) {
        defaults.set(try? JSONEncoder().encode(all), forKey: Self.key)
    }
}

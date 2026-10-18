import Foundation

/// Agreement that what you say goes to the services that let Ferni hear,
/// think and speak (App Store guideline 5.1.2(i)). Asked once, before any
/// audio leaves the phone; withdrawable in Settings, which stops calls until
/// you agree again. A new `currentVersion` (changed wording or providers) asks
/// again.
@MainActor
@Observable
public final class ConsentStore {
    public static let currentVersion = "2026-10-18"

    public struct Agreement: Codable, Equatable, Sendable {
        public let version: String
        public let agreedAt: Date
    }

    public private(set) var agreement: Agreement?

    /// Sends the agreement to the server, where it's kept with the account.
    // TODO(ios-rebuild, needs a server route): there is no endpoint for this consent
    // yet (only family-call and SMS consent exist). Until one lands this stays nil and
    // the agreement lives on the device only.
    public var upload: (@Sendable (Agreement?) async throws -> Void)?

    private let defaults: UserDefaults
    private static let key = "ferni.consent.processing"

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        agreement = defaults.data(forKey: Self.key).flatMap { try? JSONDecoder().decode(Agreement.self, from: $0) }
    }

    /// True only for an agreement to the wording shown today.
    public var hasAgreed: Bool { agreement?.version == Self.currentVersion }

    public func agree(now: Date = .now) {
        set(Agreement(version: Self.currentVersion, agreedAt: now))
    }

    public func withdraw() { set(nil) }

    private func set(_ new: Agreement?) {
        agreement = new
        if let new, let data = try? JSONEncoder().encode(new) {
            defaults.set(data, forKey: Self.key)
        } else {
            defaults.removeObject(forKey: Self.key)
        }
        if let upload { Task { try? await upload(new) } }
    }
}

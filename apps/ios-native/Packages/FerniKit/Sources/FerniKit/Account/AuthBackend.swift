import Foundation

/// The signed-in person, as far as the app needs to know.
public struct AccountUser: Equatable, Sendable {
    public let uid: String
    public let isAnonymous: Bool
    /// Firebase provider ids linked to the account, e.g. "apple.com".
    public let providerIDs: [String]
    public let email: String?

    public init(uid: String, isAnonymous: Bool, providerIDs: [String] = [], email: String? = nil) {
        self.uid = uid
        self.isAnonymous = isAnonymous
        self.providerIDs = providerIDs
        self.email = email
    }

    public var isSignedInWithApple: Bool { providerIDs.contains("apple.com") }
}

/// The identity service behind the account. Firebase Auth in the app
/// (`FirebaseAuthBackend`); a fake in tests.
public protocol AuthBackend: Sendable {
    func currentUser() async -> AccountUser?
    func signInAnonymously() async throws -> AccountUser
    /// Firebase refreshes an expiring token on its own; `forceRefresh` asks anyway.
    func idToken(forceRefresh: Bool) async throws -> String?
}

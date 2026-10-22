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

/// What Sign in with Apple hands back, ready for Firebase and the server.
public struct AppleCredential: Sendable {
    public let idToken: String
    /// The unhashed nonce whose SHA-256 went into the Apple request.
    public let rawNonce: String
    /// One-time code (5 minutes) the server trades for a revocable grant.
    public let authorizationCode: String?
    public let fullName: PersonNameComponents?

    public init(idToken: String, rawNonce: String, authorizationCode: String?, fullName: PersonNameComponents?) {
        self.idToken = idToken
        self.rawNonce = rawNonce
        self.authorizationCode = authorizationCode
        self.fullName = fullName
    }
}

/// The identity service behind the account. Firebase Auth in the app
/// (`FirebaseAuthBackend`); a fake in tests.
public protocol AuthBackend: Sendable {
    func currentUser() async -> AccountUser?
    func signInAnonymously() async throws -> AccountUser
    /// Firebase refreshes an expiring token on its own; `forceRefresh` asks anyway.
    func idToken(forceRefresh: Bool) async throws -> String?
    /// Adds Apple to the current account. When that Apple ID already belongs
    /// to a Ferni account, signs into that account instead.
    func linkOrSignIn(apple: AppleCredential) async throws -> AccountUser
    func signOut() async throws
}

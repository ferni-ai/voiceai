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

/// A way to prove who you are to Firebase.
public enum SignInCredential: Sendable {
    case apple(AppleCredential)
    /// The code texted by `AuthBackend.sendPhoneCode`.
    case phone(verificationID: String, code: String)
    /// What Google Sign-In hands back.
    case google(idToken: String, accessToken: String)
}

/// The anonymous account a person left when they signed in to an account
/// they already had. Its ID token, taken before leaving (it's the proof the
/// server needs, and can't be had after), lets the server merge what they
/// said into the account they're on now.
public struct LeftBehindAccount: Equatable, Sendable {
    public let uid: String
    public let idToken: String?

    public init(uid: String, idToken: String?) {
        self.uid = uid
        self.idToken = idToken
    }
}

public struct SignInResult: Equatable, Sendable {
    public let user: AccountUser
    /// Set only when an anonymous account was left for one the credential already had.
    public let leftBehind: LeftBehindAccount?

    public init(user: AccountUser, leftBehind: LeftBehindAccount?) {
        self.user = user
        self.leftBehind = leftBehind
    }
}

/// Why a sign-in didn't go through, in words a person can act on.
public enum SignInError: Error, Equatable, Sendable {
    case invalidPhoneNumber, invalidCode, tooManyAttempts, offline, cancelled, other

    /// Nil when there's nothing to say (the person cancelled).
    public var message: String? {
        switch self {
        case .invalidPhoneNumber: "That number doesn't look right. Try it with the country code, like +1."
        case .invalidCode: "That code didn't match. Check the text and try again."
        case .tooManyAttempts: "Too many tries for now. Give it a few minutes, then try again."
        case .offline: "Couldn't reach Ferni. Check your connection and try again."
        case .cancelled: nil
        case .other: "That didn't go through. Try again?"
        }
    }
}

/// Phone numbers as Firebase wants them (E.164). A number without a country
/// code is taken as US/Canada (+1), where the app is offered first.
public enum PhoneNumber {
    public static func e164(_ typed: String) -> String? {
        let digits = typed.filter(\.isASCII).filter(\.isNumber)
        if typed.trimmingCharacters(in: .whitespaces).hasPrefix("+") {
            return (8...15).contains(digits.count) ? "+" + digits : nil
        }
        switch digits.count {
        case 10: return "+1" + digits
        case 11 where digits.hasPrefix("1"): return "+" + digits
        default: return nil
        }
    }
}

/// Whether a real (not anonymous) account has signed in on this device.
/// Once one has, the app never quietly starts someone new: it asks them to
/// sign in. Account deletion clears it (`AccountDeletion.localKeys`).
public struct AccountMemory: Sendable {
    public static let key = "ferni.account.hadRealAccount"
    let get: @Sendable () -> Bool
    let set: @Sendable (Bool) -> Void

    public init(get: @escaping @Sendable () -> Bool, set: @escaping @Sendable (Bool) -> Void) {
        self.get = get
        self.set = set
    }

    public static let device = AccountMemory(
        get: { UserDefaults.standard.bool(forKey: key) },
        set: { UserDefaults.standard.set($0, forKey: key) }
    )
}

/// The identity service behind the account. Firebase Auth in the app
/// (`FirebaseAuthBackend`); a fake in tests.
public protocol AuthBackend: Sendable {
    func currentUser() async -> AccountUser?
    func signInAnonymously() async throws -> AccountUser
    /// Firebase refreshes an expiring token on its own; `forceRefresh` asks anyway.
    func idToken(forceRefresh: Bool) async throws -> String?
    /// Texts a sign-in code to an E.164 number; returns the verification ID.
    func sendPhoneCode(to phoneNumber: String) async throws -> String
    /// Adds the credential to the current account, keeping its uid. When the
    /// credential already belongs to a Ferni account, signs into that one
    /// instead, and says which anonymous account was left behind.
    func linkOrSignIn(_ credential: SignInCredential) async throws -> SignInResult
    func signOut() async throws
}

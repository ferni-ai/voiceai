import FirebaseAuth
import FirebaseCore
import Foundation
import os

/// Firebase Auth, the same project the web app signs into, so an account is
/// the same person on the phone and in the browser.
public struct FirebaseAuthBackend: AuthBackend {
    public init() {}

    public func currentUser() async -> AccountUser? {
        Auth.auth().currentUser.map(Self.account)
    }

    public func signInAnonymously() async throws -> AccountUser {
        Self.account(try await Auth.auth().signInAnonymously().user)
    }

    public func idToken(forceRefresh: Bool) async throws -> String? {
        guard let user = Auth.auth().currentUser else { return nil }
        return try await user.getIDTokenResult(forcingRefresh: forceRefresh).token
    }

    public func linkOrSignIn(apple: AppleCredential) async throws -> AccountUser {
        let credential = OAuthProvider.appleCredential(
            withIDToken: apple.idToken, rawNonce: apple.rawNonce, fullName: apple.fullName
        )
        guard let user = Auth.auth().currentUser else {
            return Self.account(try await Auth.auth().signIn(with: credential).user)
        }
        do {
            return Self.account(try await user.link(with: credential).user)
        } catch let error as NSError where error.code == AuthErrorCode.credentialAlreadyInUse.rawValue {
            // This Apple ID already has a Ferni account: continue as that person.
            // Apple's nonce is single use, so Firebase hands back a fresh credential.
            let updated = error.userInfo[AuthErrorUserInfoUpdatedCredentialKey] as? AuthCredential ?? credential
            return Self.account(try await Auth.auth().signIn(with: updated).user)
        }
    }

    public func signOut() async throws {
        try Auth.auth().signOut()
    }

    private static func account(_ user: User) -> AccountUser {
        AccountUser(
            uid: user.uid,
            isAnonymous: user.isAnonymous,
            providerIDs: user.providerData.map(\.providerID),
            email: user.email
        )
    }
}

/// Starts Firebase from the bundled GoogleService-Info.plist, refusing a file
/// made for another app: Firebase's iOS API key only answers the bundle id it
/// was issued for, so a mismatched file fails every sign-in with a 403.
public enum FerniFirebase {
    public enum Problem: Equatable, Sendable {
        case missingConfig
        case wrongApp(configFor: String, app: String)
    }

    /// Nil when the plist is usable for this app.
    public static func problem(config: [String: Any]?, bundleID: String?) -> Problem? {
        guard let config, config["API_KEY"] is String, config["GOOGLE_APP_ID"] is String else {
            return .missingConfig
        }
        let configured = config["BUNDLE_ID"] as? String ?? ""
        let app = bundleID ?? ""
        return configured == app ? nil : .wrongApp(configFor: configured, app: app)
    }

    @MainActor private static var isConfigured = false

    /// Configures Firebase once. Returns false (and logs why) when it can't.
    @MainActor
    @discardableResult
    public static func configure(bundle: Bundle = .main) -> Bool {
        // Not FirebaseApp.app(): asking before configure() logs an error.
        if isConfigured { return true }
        let path = bundle.path(forResource: "GoogleService-Info", ofType: "plist")
        let config = path.flatMap { NSDictionary(contentsOfFile: $0) as? [String: Any] }
        if let problem = problem(config: config, bundleID: bundle.bundleIdentifier) {
            Logger(subsystem: "com.sethdford.ferni", category: "account")
                .error("Firebase not started: \(String(describing: problem), privacy: .public)")
            return false
        }
        guard let path, let options = FirebaseOptions(contentsOfFile: path) else { return false }
        FirebaseApp.configure(options: options)
        isConfigured = true
        return true
    }
}

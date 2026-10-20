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

    /// Without APNs (the build has no push entitlement) Firebase proves the app
    /// with a reCAPTCHA page, which comes back on the reversed client ID URL
    /// scheme (project.yml; `FerniFirebase.canHandle`).
    public func sendPhoneCode(to phoneNumber: String) async throws -> String {
        do {
            return try await PhoneAuthProvider.provider().verifyPhoneNumber(phoneNumber, uiDelegate: nil)
        } catch {
            throw Self.signInError(error)
        }
    }

    public func linkOrSignIn(_ credential: SignInCredential) async throws -> SignInResult {
        let firebase: AuthCredential = switch credential {
        case .apple(let apple):
            OAuthProvider.appleCredential(withIDToken: apple.idToken, rawNonce: apple.rawNonce, fullName: apple.fullName)
        case .phone(let verificationID, let code):
            PhoneAuthProvider.provider().credential(withVerificationID: verificationID, verificationCode: code)
        case .google(let idToken, let accessToken):
            GoogleAuthProvider.credential(withIDToken: idToken, accessToken: accessToken)
        }
        guard let current = Auth.auth().currentUser else {
            return SignInResult(user: try await Self.signIn(with: firebase), leftBehind: nil)
        }
        // Before anything changes: once signed into another account, the
        // anonymous one's token can't be had, and it's the server's proof.
        let anonymous = current.isAnonymous ? current.uid : nil
        let anonymousToken = current.isAnonymous ? try? await current.getIDToken() : nil
        do {
            return SignInResult(user: Self.account(try await current.link(with: firebase).user), leftBehind: nil)
        } catch let error as NSError where error.code == AuthErrorCode.credentialAlreadyInUse.rawValue {
            // The credential already has a Ferni account: continue as that person.
            // Apple's nonce and the texted code are single use, so Firebase hands back a fresh credential.
            let updated = error.userInfo[AuthErrorUserInfoUpdatedCredentialKey] as? AuthCredential ?? firebase
            let user = try await Self.signIn(with: updated)
            let leftBehind = anonymous.flatMap { $0 == user.uid ? nil : LeftBehindAccount(uid: $0, idToken: anonymousToken) }
            return SignInResult(user: user, leftBehind: leftBehind)
        } catch {
            throw Self.signInError(error)
        }
    }

    private static func signIn(with credential: AuthCredential) async throws -> AccountUser {
        do {
            return account(try await Auth.auth().signIn(with: credential).user)
        } catch {
            throw signInError(error)
        }
    }

    /// Firebase's errors as the few a person can act on; others pass through.
    /// Every one is logged with its code and name (nothing personal in them).
    static func signInError(_ error: Error) -> Error {
        let nsError = error as NSError
        let name = nsError.userInfo["FIRAuthErrorUserInfoNameKey"] as? String ?? "-"
        Logger(subsystem: "com.sethdford.ferni", category: "account")
            .error("Firebase sign-in error \(nsError.domain, privacy: .public) \(nsError.code, privacy: .public) \(name, privacy: .public)")
        guard nsError.domain == AuthErrorDomain, let code = AuthErrorCode(rawValue: nsError.code) else { return error }
        switch code {
        case .networkError: return SignInError.offline
        case .invalidPhoneNumber, .missingPhoneNumber: return SignInError.invalidPhoneNumber
        case .invalidVerificationCode, .missingVerificationCode, .sessionExpired: return SignInError.invalidCode
        case .tooManyRequests, .quotaExceeded: return SignInError.tooManyAttempts
        case .webContextCancelled: return SignInError.cancelled
        default: return error
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

    /// Firebase phone sign-in sends itself a probe notification before texting
    /// a code; the app delegate hands every remote notification here. Firebase
    /// starts in didFinishLaunching, before any notification can arrive.
    @MainActor public static func canHandleNotification(_ userInfo: [AnyHashable: Any]) -> Bool {
        isConfigured && Auth.auth().canHandleNotification(userInfo)
    }

    /// Whether the bundled GoogleService-Info.plist can start Firebase for this
    /// app, without starting it (the app model is built before launch finishes).
    public static func isUsable(bundle: Bundle = .main) -> Bool {
        let path = bundle.path(forResource: "GoogleService-Info", ofType: "plist")
        let config = path.flatMap { NSDictionary(contentsOfFile: $0) as? [String: Any] }
        return problem(config: config, bundleID: bundle.bundleIdentifier) == nil
    }

    /// With push on, phone sign-in proves the app by a silent notification
    /// instead of reCAPTCHA.
    @MainActor public static func setAPNSToken(_ token: Data) {
        guard isConfigured else { return }
        Auth.auth().setAPNSToken(token, type: .unknown)
    }

    /// The reCAPTCHA page's return trip during phone sign-in.
    @MainActor public static func canHandle(_ url: URL) -> Bool {
        isConfigured && Auth.auth().canHandle(url)
    }

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

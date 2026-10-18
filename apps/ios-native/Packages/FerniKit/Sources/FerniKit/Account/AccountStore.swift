import CryptoKit
import Foundation
import os

/// The person using the app. On first launch it signs in anonymously and
/// silently (the server accepts anonymous Firebase users, src/servers/api/routes/token.ts),
/// so talking to Ferni never waits on a sign-in screen. Sign in with Apple
/// later links to that same account, keeping everything said so far.
@MainActor
@Observable
public final class AccountStore {
    public enum State: Equatable, Sendable {
        case starting
        case signedIn(AccountUser)
        /// Signing in failed; `message` is safe to show.
        case unavailable(String)
    }

    public private(set) var state: State = .starting
    /// An Apple sign-in or sign-out is in flight.
    public private(set) var isWorking = false
    /// The last thing worth telling the person, e.g. why Apple sign-in failed.
    public private(set) var notice: String?

    private let backend: (any AuthBackend)?
    /// Sends Apple's authorization code to the server so a deleted account can
    /// revoke the grant (`AppleAuthorizationUpload`). Set once the API exists,
    /// since the API itself asks this store for tokens.
    public var uploadAppleCode: (@Sendable (String) async throws -> Void)?
    private let retryDelays: [Duration]
    private var startTask: Task<Void, Never>?
    private let log = Logger(subsystem: "com.sethdford.ferni", category: "account")

    /// - Parameter backend: nil when Firebase couldn't start; the account is then unavailable.
    public init(
        backend: (any AuthBackend)?,
        uploadAppleCode: (@Sendable (String) async throws -> Void)? = nil,
        retryDelays: [Duration] = [.seconds(1), .seconds(3)]
    ) {
        self.backend = backend
        self.uploadAppleCode = uploadAppleCode
        self.retryDelays = retryDelays
    }

    public var user: AccountUser? {
        if case .signedIn(let user) = state { return user }
        return nil
    }

    /// Signs in (anonymously when there's no one yet). Safe to call again:
    /// concurrent callers share one attempt, and a failed state tries afresh.
    public func start() async {
        if user != nil { return }
        if let startTask { return await startTask.value }
        let task = Task { await self.signInSilently() }
        startTask = task
        await task.value
        startTask = nil
    }

    /// The ID token for server calls, signing in first if needed.
    public func idToken(forceRefresh: Bool = false) async -> String? {
        await start()
        guard user != nil, let backend else { return nil }
        do {
            return try await backend.idToken(forceRefresh: forceRefresh)
        } catch {
            log.error("ID token unavailable: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    public func signInWithApple(_ credential: AppleCredential) async {
        guard let backend, !isWorking else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            state = .signedIn(try await backend.linkOrSignIn(apple: credential))
            notice = nil
        } catch {
            log.error("Apple sign-in failed: \(error.localizedDescription, privacy: .public)")
            notice = "That didn't go through. Your conversations are still here. Try again?"
            return
        }
        // Only after the account holds Apple: the server checks the code's Apple ID
        // against the account's linked Apple provider. Never blocks the sign-in.
        guard let code = credential.authorizationCode, let uploadAppleCode else { return }
        do {
            try await uploadAppleCode(code)
        } catch {
            log.error("Apple authorization code not stored: \(String(describing: error), privacy: .public)")
        }
    }

    /// Sign out, then carry on as a new anonymous account on this device.
    public func signOut() async {
        guard let backend, !isWorking else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            try await backend.signOut()
        } catch {
            notice = "Couldn't sign out. Try again?"
            return
        }
        state = .starting
        await start()
    }

    public func clearNotice() { notice = nil }

    /// The server API, asking this account for its ID token on every call.
    public func api(baseURL: URL) -> FerniAPI {
        FerniAPI(baseURL: baseURL, idToken: { [weak self] force in await self?.idToken(forceRefresh: force) })
    }

    private func signInSilently() async {
        guard let backend else {
            state = .unavailable("Ferni can't reach your account on this build.")
            return
        }
        if let existing = await backend.currentUser() {
            state = .signedIn(existing)
            return
        }
        state = .starting
        for delay in [Duration.zero] + retryDelays {
            if delay > .zero { try? await Task.sleep(for: delay) }
            do {
                state = .signedIn(try await backend.signInAnonymously())
                log.info("Signed in anonymously")
                return
            } catch {
                log.error("Anonymous sign-in failed: \(error.localizedDescription, privacy: .public)")
            }
        }
        state = .unavailable("Ferni can't reach your account right now. Check your connection and try again.")
    }
}

/// The nonce for a Sign in with Apple request: Apple gets the SHA-256, Firebase
/// gets the raw value, so a stolen Apple token can't be replayed.
public struct AppleNonce: Sendable {
    public let raw: String
    public var sha256: String { Self.sha256(raw) }

    public init() {
        raw = Self.random()
    }

    static func sha256(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    private static func random(length: Int = 32) -> String {
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._")
        var generator = SystemRandomNumberGenerator()
        return String((0..<length).map { _ in charset.randomElement(using: &generator)! })
    }
}

/// Hands Apple's one-time authorization code to the server, which trades it
/// for the refresh token it revokes when the account is deleted (App Store
/// guideline 5.1.1(v)).
public enum AppleAuthorizationUpload {
    /// `POST /api/account/apple-authorization {authorizationCode, client: "native"}`.
    // TODO(#2004, feat/siwa-revoke-on-delete): the route lands with that PR. Until it
    // merges the server answers 404, the code (valid 5 minutes) is dropped and logged,
    // and deleting the account can't revoke this grant.
    public static func uploader(api: FerniAPI) -> @Sendable (String) async throws -> Void {
        { code in
            struct Body: Encodable, Sendable {
                let authorizationCode: String
                let client = "native"
            }
            _ = try await api.data(
                "/api/account/apple-authorization", method: "POST", json: Body(authorizationCode: code)
            )
        }
    }
}

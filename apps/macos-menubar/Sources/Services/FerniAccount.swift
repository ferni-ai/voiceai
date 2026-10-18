import AppKit
import FerniAuth
import os

/// The Mac app's signed-in Ferni account: Google sign-in exchanged for a Firebase
/// session, refresh token in the Keychain, and the authed `/token` request.
/// `state` changes only on the main actor, where AppKit reads it for the menu.
final class FerniAccount: NSObject {
    static let shared = FerniAccount()

    /// Public OAuth client ID from the iOS app's GoogleService-Info.plist (same Firebase project).
    /// FERNI_GOOGLE_CLIENT_ID overrides it, e.g. for a dedicated macOS client.
    private static let googleClientID = ProcessInfo.processInfo.environment["FERNI_GOOGLE_CLIENT_ID"]
        ?? "1031920444452-li5t2hm9b0eq5g9k7qh886f3jthnfh1v.apps.googleusercontent.com"

    private(set) var state: AuthSession.State = .signedOut
    private let session: AuthSession
    private let firebase: FirebaseClientCache
    private let log = Logger(subsystem: "com.ferni.voice", category: "Account")

    private override init() {
        let firebase = FirebaseClientCache()
        self.firebase = firebase
        session = AuthSession(store: KeychainStore(service: "com.ferni.voice.auth")) { refreshToken in
            try await firebase.client().refresh(refreshToken)
        }
        super.init()
        Task { await syncState() }
    }

    var isSignedIn: Bool {
        if case .signedIn = state { return true }
        return false
    }

    /// The `/token` response body for a new room, as the signed-in user.
    /// `state` is current when this returns or throws, so callers can tell "sign in" from other failures.
    @MainActor
    func voiceToken(server: String, room: String, username: String, personaId: String) async throws -> Data {
        guard let url = URL(string: server) else { throw AuthError.malformedResponse }
        do {
            let data = try await VoiceTokenClient(server: url, session: session, transport: URLSession.shared)
                .fetch(room: room, username: username, personaId: personaId)
            await syncState()
            return data
        } catch {
            await syncState()
            throw error
        }
    }

    @MainActor
    func signInWithGoogle() async {
        do {
            NSApp.activate(ignoringOtherApps: true) // a menubar app has no key window to anchor the sign-in sheet
            let google = GoogleSignIn(clientID: Self.googleClientID, transport: URLSession.shared) {
                NSApp.keyWindow ?? NSWindow()
            }
            let idToken = try await google.idToken()
            await session.adopt(try await firebase.client().signIn(idpToken: idToken, providerId: "google.com"))
            log.info("Signed in")
        } catch AuthError.cancelled {
            log.info("Sign-in cancelled")
        } catch {
            log.error("Sign-in failed: \(String(describing: error), privacy: .public)")
        }
        await syncState()
    }

    /// Account rows for the menubar menu: a sign-in action, or the signed-in state and sign out.
    func menuItems() -> [NSMenuItem] {
        switch state {
        case .signedIn:
            let status = NSMenuItem(title: "Signed in to Ferni", action: nil, keyEquivalent: "")
            status.isEnabled = false
            return [status, item("Sign Out", #selector(signOutClicked))]
        case .needsSignIn:
            return [item("Sign in again with Google…", #selector(signInClicked))]
        case .signedOut:
            return [item("Sign in with Google…", #selector(signInClicked))]
        }
    }

    private func item(_ title: String, _ action: Selector) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
        item.target = self
        return item
    }

    @objc private func signInClicked() {
        Task { await signInWithGoogle() }
    }

    @objc private func signOutClicked() {
        Task {
            await session.signOut()
            await syncState()
        }
    }

    @MainActor
    private func syncState() async {
        state = await session.state
    }
}

/// Loads the Firebase web config once (it carries the public API key) and reuses it.
private actor FirebaseClientCache {
    private static let configURL = URL(string: "https://app.ferni.ai/__/firebase/init.json")!
    private var cached: FirebaseAuthClient?

    func client() async throws -> FirebaseAuthClient {
        if let cached { return cached }
        let loaded = try await FirebaseAuthClient.load(configURL: Self.configURL, transport: URLSession.shared)
        cached = loaded
        return loaded
    }
}

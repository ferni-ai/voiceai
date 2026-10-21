import Foundation
import os

/// The person using the app. On first launch it signs in anonymously and
/// silently (the server accepts anonymous Firebase users, src/servers/api/routes/token.ts),
/// so talking to Ferni never waits on a sign-in screen. Sign in with Apple
/// (next PR) links to that same account, keeping everything said so far.
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

    private let backend: (any AuthBackend)?
    private let retryDelays: [Duration]
    private var startTask: Task<Void, Never>?
    private let log = Logger(subsystem: "com.sethdford.ferni", category: "account")

    /// - Parameter backend: nil when Firebase couldn't start; the account is then unavailable.
    public init(
        backend: (any AuthBackend)?,
        retryDelays: [Duration] = [.seconds(1), .seconds(3)]
    ) {
        self.backend = backend
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

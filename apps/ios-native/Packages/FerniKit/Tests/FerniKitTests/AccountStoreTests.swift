import Foundation
import XCTest
@testable import FerniKit

/// The account a fresh install talks with.
@MainActor
final class AccountStoreTests: XCTestCase {

    /// Firebase stand-in: records calls; failures are scripted per call.
    private final class FakeBackend: AuthBackend, @unchecked Sendable {
        var existing: AccountUser?
        var anonymousFailures = 0
        private(set) var anonymousCalls = 0
        private(set) var tokenRequests: [Bool] = []
        private var next = 0

        func currentUser() async -> AccountUser? { existing }
        func signInAnonymously() async throws -> AccountUser {
            anonymousCalls += 1
            if anonymousCalls <= anonymousFailures { throw URLError(.notConnectedToInternet) }
            next += 1
            existing = AccountUser(uid: "anon-\(next)", isAnonymous: true, providerIDs: [])
            return existing!
        }
        func idToken(forceRefresh: Bool) async throws -> String? {
            tokenRequests.append(forceRefresh)
            return existing.map { "token-for-\($0.uid)" }
        }
    }

    private func store(_ backend: FakeBackend?) -> AccountStore {
        AccountStore(backend: backend, retryDelays: [.zero, .zero])
    }

    func testFirstLaunchSignsInAnonymouslyOnceEvenWhenAskedTwice() async {
        let backend = FakeBackend()
        let account = store(backend)
        XCTAssertEqual(account.state, .starting)

        async let first: Void = account.start()
        async let second: Void = account.start()
        _ = await (first, second)

        XCTAssertEqual(backend.anonymousCalls, 1)
        XCTAssertEqual(account.user?.isAnonymous, true)
    }

    func testAReturningPersonKeepsTheirAccount() async {
        let backend = FakeBackend()
        backend.existing = AccountUser(uid: "returning-uid", isAnonymous: false, providerIDs: ["apple.com"])
        let account = store(backend)

        await account.start()

        XCTAssertEqual(account.user?.uid, "returning-uid")
        XCTAssertEqual(backend.anonymousCalls, 0)
    }

    func testOfflineAtLaunchRetriesThenSaysSo() async {
        let backend = FakeBackend()
        backend.anonymousFailures = 99
        let account = store(backend)

        await account.start()

        XCTAssertEqual(backend.anonymousCalls, 3, "one try and two retries")
        guard case .unavailable(let message) = account.state else { return XCTFail("\(account.state)") }
        XCTAssertTrue(message.contains("connection"), message)
    }

    func testTheNextAskAfterAFailureTriesAgain() async {
        let backend = FakeBackend()
        backend.anonymousFailures = 3
        let account = store(backend)
        await account.start()
        XCTAssertNil(account.user)

        await account.start()

        XCTAssertEqual(account.user?.isAnonymous, true)
    }

    func testIDTokenSignsInFirstAndPassesForceRefresh() async {
        let backend = FakeBackend()
        let account = store(backend)

        let token = await account.idToken()
        let fresh = await account.idToken(forceRefresh: true)

        XCTAssertEqual(token, "token-for-anon-1")
        XCTAssertEqual(fresh, "token-for-anon-1")
        XCTAssertEqual(backend.tokenRequests, [false, true])
    }

    func testNoFirebaseMeansNoTokenAndAPlainReason() async {
        let account = store(nil)
        let token = await account.idToken()
        XCTAssertNil(token)
        guard case .unavailable = account.state else { return XCTFail("\(account.state)") }
    }

    func testFirebaseConfigForAnotherAppIsRefused() {
        let config: [String: Any] = ["API_KEY": "k", "GOOGLE_APP_ID": "1:2:ios:3", "BUNDLE_ID": "com.ferni.signin"]
        XCTAssertEqual(
            FerniFirebase.problem(config: config, bundleID: "com.sethdford.ferni"),
            .wrongApp(configFor: "com.ferni.signin", app: "com.sethdford.ferni")
        )
        var mine = config
        mine["BUNDLE_ID"] = "com.sethdford.ferni"
        XCTAssertNil(FerniFirebase.problem(config: mine, bundleID: "com.sethdford.ferni"))
        XCTAssertEqual(FerniFirebase.problem(config: nil, bundleID: "com.sethdford.ferni"), .missingConfig)
    }
}

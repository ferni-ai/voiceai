import Foundation
import XCTest
@testable import FerniKit

/// The account a fresh install talks with, and the upgrade to Sign in with Apple.
@MainActor
final class AccountStoreTests: XCTestCase {

    /// Firebase stand-in: records calls; failures are scripted per call.
    private final class FakeBackend: AuthBackend, @unchecked Sendable {
        var existing: AccountUser?
        var anonymousFailures = 0
        var linkError: Error?
        /// The Apple ID already has its own Ferni account (Firebase signs into it instead).
        var appleAccount: String?
        private(set) var anonymousCalls = 0
        private(set) var linked: [String] = []
        private(set) var signOuts = 0
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
        func linkOrSignIn(apple: AppleCredential) async throws -> AccountUser {
            if let linkError { throw linkError }
            linked.append(apple.idToken)
            existing = AccountUser(uid: appleAccount ?? existing?.uid ?? "apple", isAnonymous: false, providerIDs: ["apple.com"])
            return existing!
        }
        func signOut() async throws {
            signOuts += 1
            existing = nil
        }
    }

    private final class Uploads: @unchecked Sendable { var codes: [String] = [] }

    private func store(_ backend: FakeBackend?, uploads: Uploads = Uploads(), uploadFails: Bool = false) -> AccountStore {
        AccountStore(
            backend: backend,
            uploadAppleCode: { code in
                uploads.codes.append(code)
                if uploadFails { throw FerniAPIError.status(404) }
            },
            retryDelays: [.zero, .zero]
        )
    }

    private let apple = AppleCredential(idToken: "apple-jwt", rawNonce: "n", authorizationCode: "code-1", fullName: nil)

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

    func testAppleLinksTheSameAccountThenSendsTheCode() async {
        let backend = FakeBackend()
        let uploads = Uploads()
        let account = store(backend, uploads: uploads)
        await account.start()
        let uid = account.user?.uid

        await account.signInWithApple(apple)

        XCTAssertEqual(backend.linked, ["apple-jwt"])
        XCTAssertEqual(account.user?.uid, uid, "the conversations so far stay with the person")
        XCTAssertEqual(account.user?.isSignedInWithApple, true)
        XCTAssertEqual(uploads.codes, ["code-1"])
        XCTAssertNil(account.notice)
    }

    /// Critic M3: when the Apple ID already has a Ferni account, the person
    /// continues there, and is told, since this phone's conversations so far
    /// stay with the account they leave.
    func testLandingOnAnExistingAppleAccountSaysSo() async {
        let backend = FakeBackend()
        backend.appleAccount = "existing-apple-user"
        let account = store(backend)
        await account.start()
        await account.signInWithApple(apple)
        XCTAssertEqual(account.user?.uid, "existing-apple-user")
        XCTAssertEqual(account.notice, AccountStore.switchedNotice)
    }

    func testAFailedAppleSignInKeepsTheAnonymousAccountAndSendsNothing() async {
        let backend = FakeBackend()
        backend.linkError = URLError(.timedOut)
        let uploads = Uploads()
        let account = store(backend, uploads: uploads)
        await account.start()

        await account.signInWithApple(apple)

        XCTAssertEqual(account.user?.isAnonymous, true)
        XCTAssertTrue(uploads.codes.isEmpty, "the server only gets a code for a linked Apple ID")
        XCTAssertNotNil(account.notice)
        XCTAssertFalse(account.isWorking)
    }

    /// The server route may not be deployed yet (#2004): sign-in still counts.
    func testServerRefusingTheCodeDoesNotUndoTheSignIn() async {
        let backend = FakeBackend()
        let account = store(backend, uploadFails: true)
        await account.start()

        await account.signInWithApple(apple)

        XCTAssertEqual(account.user?.isSignedInWithApple, true)
        XCTAssertNil(account.notice)
    }

    func testSigningOutStartsAFreshAnonymousAccount() async {
        let backend = FakeBackend()
        let account = store(backend)
        await account.start()
        await account.signInWithApple(apple)

        await account.signOut()

        XCTAssertEqual(backend.signOuts, 1)
        XCTAssertEqual(account.user?.isAnonymous, true)
        XCTAssertEqual(account.user?.uid, "anon-2")
    }

    func testNonceHashIsSHA256OfTheRawValue() {
        XCTAssertEqual(
            AppleNonce.sha256("abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        )
        let a = AppleNonce(), b = AppleNonce()
        XCTAssertEqual(a.raw.count, 32)
        XCTAssertNotEqual(a.raw, b.raw)
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

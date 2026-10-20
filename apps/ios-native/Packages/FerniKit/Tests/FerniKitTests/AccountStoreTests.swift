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
        /// Phone numbers that already have their own Ferni account.
        var phoneAccounts: [String: String] = [:]
        var sendError: Error?
        private(set) var anonymousCalls = 0
        private(set) var linked: [String] = []
        private(set) var codesSent: [String] = []
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
        func sendPhoneCode(to phoneNumber: String) async throws -> String {
            if let sendError { throw sendError }
            codesSent.append(phoneNumber)
            return "verification-\(phoneNumber)"
        }
        func linkOrSignIn(_ credential: SignInCredential) async throws -> SignInResult {
            if let linkError { throw linkError }
            let before = existing
            let user: AccountUser
            switch credential {
            case .apple(let apple):
                linked.append(apple.idToken)
                user = AccountUser(uid: appleAccount ?? before?.uid ?? "apple", isAnonymous: false, providerIDs: ["apple.com"])
            case .phone(let verificationID, let code):
                guard code == "123456" else { throw SignInError.invalidCode }
                let number = String(verificationID.dropFirst("verification-".count))
                linked.append(number)
                user = AccountUser(uid: phoneAccounts[number] ?? before?.uid ?? "phone", isAnonymous: false, providerIDs: ["phone"])
            case .google(let idToken, _):
                linked.append(idToken)
                user = AccountUser(uid: before?.uid ?? "google", isAnonymous: false, providerIDs: ["google.com"])
            }
            existing = user
            let leftBehind = before.flatMap { $0.isAnonymous && $0.uid != user.uid
                ? LeftBehindAccount(uid: $0.uid, idToken: "token-for-\($0.uid)") : nil }
            return SignInResult(user: user, leftBehind: leftBehind)
        }
        func signOut() async throws {
            signOuts += 1
            existing = nil
        }
    }

    /// The device's memory of a real sign-in, without UserDefaults.
    private final class Memory: @unchecked Sendable { var hadRealAccount = false }

    private final class Uploads: @unchecked Sendable { var codes: [String] = [] }
    private final class Merges: @unchecked Sendable { var accounts: [LeftBehindAccount] = [] }

    private func store(
        _ backend: FakeBackend?, uploads: Uploads = Uploads(), uploadFails: Bool = false, memory: Memory = Memory()
    ) -> AccountStore {
        AccountStore(
            backend: backend,
            uploadAppleCode: { code in
                uploads.codes.append(code)
                if uploadFails { throw FerniAPIError.status(404) }
            },
            retryDelays: [.zero, .zero],
            memory: AccountMemory(get: { memory.hadRealAccount }, set: { memory.hadRealAccount = $0 })
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

    func testSigningOutOfAnAnonymousAccountStartsAFreshOne() async {
        let backend = FakeBackend()
        let account = store(backend)
        await account.start()

        await account.signOut()

        XCTAssertEqual(backend.signOuts, 1)
        XCTAssertEqual(account.user?.uid, "anon-2")
    }

    // MARK: Signing in to an existing account (P0 2026-10-19: Seth's calls ran
    // as a new anonymous account, and nothing in the app reached his real one)

    func testPhoneNumbersBecomeE164() {
        XCTAssertEqual(PhoneNumber.e164("(415) 555-0134"), "+14155550134")
        XCTAssertEqual(PhoneNumber.e164("1 415 555 0134"), "+14155550134")
        XCTAssertEqual(PhoneNumber.e164("+44 20 7946 0958"), "+442079460958")
        XCTAssertNil(PhoneNumber.e164("555-0134"), "too short to be anyone's number")
        XCTAssertNil(PhoneNumber.e164("not a number"))
    }

    func testANewPhoneNumberJoinsThisAccount() async throws {
        let backend = FakeBackend()
        let merged = Merges()
        let account = store(backend)
        account.mergeLeftBehind = { merged.accounts.append($0); return true }
        await account.start()

        let verification = await account.sendPhoneCode(to: "(415) 555-0134")
        XCTAssertEqual(backend.codesSent, ["+14155550134"])
        await account.signIn(phoneVerification: try XCTUnwrap(verification), code: "123456")

        XCTAssertEqual(account.user?.uid, "anon-1", "the conversations so far stay with the person")
        XCTAssertEqual(account.user?.isAnonymous, false)
        XCTAssertTrue(merged.accounts.isEmpty)
        XCTAssertNil(account.notice)
    }

    /// The case that bit Seth: his number already has a Ferni account.
    func testAPhoneNumberWithAnAccountSignsIntoItAndHandsOverTheAnonymousOne() async throws {
        let backend = FakeBackend()
        backend.phoneAccounts["+14155550134"] = "seths-real-uid"
        let merged = Merges()
        let account = store(backend)
        account.mergeLeftBehind = { merged.accounts.append($0); return true }
        await account.start()

        let verification = await account.sendPhoneCode(to: "4155550134")
        await account.signIn(phoneVerification: try XCTUnwrap(verification), code: "123456")

        XCTAssertEqual(account.user?.uid, "seths-real-uid")
        XCTAssertEqual(merged.accounts, [LeftBehindAccount(uid: "anon-1", idToken: "token-for-anon-1")])
        XCTAssertEqual(account.notice, AccountStore.welcomeBackNotice)
    }

    func testAWrongCodeKeepsTheAccountAndSaysSo() async throws {
        let backend = FakeBackend()
        let account = store(backend)
        await account.start()
        let verification = await account.sendPhoneCode(to: "4155550134")

        await account.signIn(phoneVerification: try XCTUnwrap(verification), code: "000000")

        XCTAssertEqual(account.user?.uid, "anon-1")
        XCTAssertEqual(account.notice, SignInError.invalidCode.message)
        XCTAssertFalse(account.isWorking)
    }

    func testANumberThatCantBeTextedSaysWhy() async {
        let backend = FakeBackend()
        let account = store(backend)
        await account.start()

        let unreadable = await account.sendPhoneCode(to: "555")
        XCTAssertNil(unreadable)
        XCTAssertEqual(account.notice, SignInError.invalidPhoneNumber.message)
        XCTAssertTrue(backend.codesSent.isEmpty)

        backend.sendError = SignInError.tooManyAttempts
        let refused = await account.sendPhoneCode(to: "4155550134")
        XCTAssertNil(refused)
        XCTAssertEqual(account.notice, SignInError.tooManyAttempts.message)
    }

    /// Never silently anonymous after a real sign-in on this phone.
    func testAfterARealSignInNoAccountMeansAskingNotAnonymous() async {
        let memory = Memory()
        let first = FakeBackend()
        let account = store(first, memory: memory)
        await account.start()
        await account.signInWithApple(apple)
        XCTAssertTrue(memory.hadRealAccount)

        // Later, the account is gone from the phone (signed out elsewhere, keychain lost).
        let later = FakeBackend()
        let relaunched = store(later, memory: memory)
        await relaunched.start()
        let token = await relaunched.idToken()

        XCTAssertEqual(later.anonymousCalls, 0)
        XCTAssertEqual(relaunched.state, .needsSignIn)
        XCTAssertNil(token, "Talk can't run as someone new")
    }

    func testSigningOutOfARealAccountAsksToSignInAgain() async {
        let backend = FakeBackend()
        let account = store(backend)
        await account.start()
        await account.signInWithApple(apple)

        await account.signOut()

        XCTAssertEqual(backend.signOuts, 1)
        XCTAssertEqual(backend.anonymousCalls, 1, "only the first launch's")
        XCTAssertEqual(account.state, .needsSignIn)
    }

    func testSigningInFromNeedsSignInReachesTheAccount() async throws {
        let memory = Memory()
        memory.hadRealAccount = true
        let backend = FakeBackend()
        backend.phoneAccounts["+14155550134"] = "seths-real-uid"
        let account = store(backend, memory: memory)
        await account.start()
        XCTAssertEqual(account.state, .needsSignIn)

        let verification = await account.sendPhoneCode(to: "4155550134")
        await account.signIn(phoneVerification: try XCTUnwrap(verification), code: "123456")

        XCTAssertEqual(account.user?.uid, "seths-real-uid")
        XCTAssertEqual(backend.anonymousCalls, 0)
    }

    /// Firebase's codes become words a person can act on (P0 2026-10-19: all of
    /// them were "That didn't go through").
    func testFirebaseErrorsBecomeSpecificWords() {
        func mapped(_ code: Int) -> SignInError? {
            FirebaseAuthBackend.signInError(NSError(domain: "FIRAuthErrorDomain", code: code)) as? SignInError
        }
        XCTAssertEqual(mapped(17020), .offline, "network error")
        XCTAssertEqual(mapped(17042), .invalidPhoneNumber)
        XCTAssertEqual(mapped(17044), .invalidCode)
        XCTAssertEqual(mapped(17010), .tooManyAttempts)
        XCTAssertNotNil(SignInError.offline.message)
    }

    /// Deleting the account is the one way back to a fresh anonymous start.
    func testTheDeletionKeysIncludeTheRealAccountMemory() {
        XCTAssertTrue(AccountDeletion.localKeys.contains(AccountMemory.key))
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

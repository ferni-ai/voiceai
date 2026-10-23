import FerniKit
import UIKit
import XCTest
@testable import Ferni

/// Notes from Ferni are on (IB1): the build compiles them in, and a token
/// APNs hands the app reaches the server for someone who said yes.
/// scripts/check-push-build.sh checks the Release configuration the same way.
/// The token follows the person (security review of IB1): signing out
/// unbinds it as them first, and the next account takes it over.
@MainActor
final class PushNotesTests: XCTestCase {
    func testThisBuildCarriesNotesFromFerni() {
        XCTAssertTrue(FerniBuild.pushNotes, "FERNI_PUSH in SWIFT_ACTIVE_COMPILATION_CONDITIONS")
    }

    /// APNs gives the app delegate a token; it goes to the person's PushStore,
    /// which registers it with the server for someone who allowed notes.
    func testAGrantedTokenIsRegisteredWithTheServer() async throws {
        let server = Server()
        let api = FerniAPI(baseURL: URL(string: "https://app.example.test")!, idToken: { _ in "uid-a" }) { request in
            if request.httpMethod == "POST" {
                let body = (try? JSONSerialization.jsonObject(with: request.httpBody ?? Data()) as? [String: String]) ?? [:]
                server.record(request.url?.path ?? "", body)
            }
            return (Data(#"{"success":true}"#.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        let push = PushStore(api: api, vault: Vault(), bundleID: "com.sethdford.ferni", environment: "sandbox",
                             appVersion: "1.0.0 (1)", currentUID: { "uid-a" })
        await push.optIn(uid: "uid-a") // "Yes, check in": notifications granted
        XCTAssertTrue(server.posts.isEmpty, "no token yet")

        let saved = FerniAppDelegate.onToken
        defer { FerniAppDelegate.onToken = saved }
        let delivered = expectation(description: "registered")
        FerniAppDelegate.onToken = { token in
            Task { await push.received(deviceToken: token, uid: "uid-a"); delivered.fulfill() }
        }
        FerniAppDelegate().application(UIApplication.shared, didRegisterForRemoteNotificationsWithDeviceToken: Data([0x0a, 0xff]))
        await fulfillment(of: [delivered], timeout: 5)

        let posts = server.posts
        XCTAssertEqual(posts.count, 1)
        XCTAssertEqual(posts.first?.path, "/api/push/devices")
        XCTAssertEqual(posts.first?.body["token"], "0aff")
        XCTAssertEqual(posts.first?.body["platform"], "ios")
    }

    // MARK: - The token follows the person

    /// Signing out sends the DELETE for the stored token as the person
    /// leaving, before the sign-out itself.
    func testSigningOutUnbindsTheTokenAsThePersonLeaving() async {
        let auth = Auth(uid: "uid-a"), server = Server()
        let model = await model(auth, server, PushBinding(token: "0aff", owner: "uid-a", optedIn: ["uid-a"]))

        await model.signOut()
        XCTAssertEqual(server.calls.first, "DELETE 0aff as uid-a", "\(server.calls)")
        XCTAssertEqual(auth.signedOutAfter, 1, "after the DELETE, not before")
        XCTAssertNil(model.push.binding.owner)
    }

    /// The next person signs in: the token is registered to them (they said yes).
    func testAnAccountSwitchRegistersTheTokenToTheNewPerson() async throws {
        let auth = Auth(uid: "uid-b"), server = Server()
        let model = await model(auth, server, PushBinding(token: "0aff", owner: "uid-a", optedIn: ["uid-b"]))

        model.accountChanged(from: "uid-a", to: "uid-b")
        for _ in 0..<500 where model.push.binding.owner != "uid-b" { try await Task.sleep(for: .milliseconds(10)) }
        XCTAssertEqual(server.calls, ["POST 0aff as uid-b"])
        XCTAssertEqual(model.push.binding.owner, "uid-b")
    }

    private func model(_ auth: Auth, _ server: Server, _ binding: PushBinding) async -> AppModel {
        let account = AccountStore(backend: auth, memory: AccountMemory(get: { true }, set: { _ in }))
        await account.start()
        let vault = Vault()
        vault.stored = binding
        return AppModel(config: .production, firebaseReady: false, account: account) { account, _ in
            let api = FerniAPI(baseURL: URL(string: "https://app.example.test")!,
                               idToken: { [weak account] force in await account?.idToken(forceRefresh: force) }) { request in
                let body = (try? JSONSerialization.jsonObject(with: request.httpBody ?? Data()) as? [String: String]) ?? [:]
                server.call("\(request.httpMethod ?? "") \(body["token"] ?? "-") as \(auth.uid ?? "nobody")")
                if request.httpMethod == "DELETE" { auth.deletes += 1 }
                return (Data(#"{"success":true}"#.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            }
            return PushStore(api: api, vault: vault, bundleID: "com.sethdford.ferni", environment: "sandbox",
                             appVersion: "1.0.0 (1)", currentUID: { [weak account] in account?.user?.uid })
        }
    }

    /// Sign-in for these tests: one person, then (after sign-out) an anonymous one.
    final class Auth: AuthBackend, @unchecked Sendable {
        var uid: String?
        var deletes = 0
        /// How many DELETEs had been sent when the sign-out happened.
        var signedOutAfter: Int?
        init(uid: String) { self.uid = uid }
        func currentUser() async -> AccountUser? { uid.map { AccountUser(uid: $0, isAnonymous: $0.hasPrefix("anon")) } }
        func signInAnonymously() async throws -> AccountUser { uid = "anon-1"; return AccountUser(uid: "anon-1", isAnonymous: true) }
        func idToken(forceRefresh: Bool) async throws -> String? { uid.map { "token-\($0)" } }
        func sendPhoneCode(to phoneNumber: String) async throws -> String { "" }
        func linkOrSignIn(_ credential: SignInCredential) async throws -> SignInResult { throw URLError(.cancelled) }
        func signOut() async throws { signedOutAfter = deletes; uid = nil }
    }

    /// The POSTs the server received.
    final class Server: @unchecked Sendable {
        private let lock = NSLock()
        private var received: [(path: String, body: [String: String])] = []
        var posts: [(path: String, body: [String: String])] { lock.withLock { received } }
        func record(_ path: String, _ body: [String: String]) { lock.withLock { received.append((path, body)) } }
        private var log: [String] = []
        var calls: [String] { lock.withLock { log } }
        func call(_ line: String) { lock.withLock { log.append(line) } }
    }

    final class Vault: PushVault, @unchecked Sendable {
        var stored = PushBinding()
        func load() -> PushBinding { stored }
        func save(_ binding: PushBinding) { stored = binding }
    }
}

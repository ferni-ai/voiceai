import Foundation
import XCTest
@testable import FerniKit

/// The phone's push token is bound only to someone who said yes, and a
/// signed-out person's notes stop even when the sign-out unbind fails (#1991).
@MainActor
final class PushStoreTests: XCTestCase {
    final class Vault: PushVault, @unchecked Sendable {
        var stored = PushBinding()
        func load() -> PushBinding { stored }
        func save(_ binding: PushBinding) { stored = binding }
    }

    /// Records calls as "POST as a" / "DELETE as b"; can be told to fail
    /// deletes, answer POSTs a given way, or hold a POST until released.
    final class Server: @unchecked Sendable {
        enum PostAnswer { case ok, timeout, status(Int) }
        var signedIn: String? = "a"
        var failDeletes = false
        var postAnswer = PostAnswer.ok
        var postBody = #"{"success":true}"#
        var holdPosts = false
        var heldPost: CheckedContinuation<Void, Never>?
        var calls: [String] = []
        var bodies: [[String: String]] = []

        /// Waits until a held POST is in flight.
        func postInFlight() async throws {
            for _ in 0..<400 where heldPost == nil { try await Task.sleep(for: .milliseconds(5)) }
            XCTAssertNotNil(heldPost, "a POST should be in flight")
        }

        func releasePost() { heldPost?.resume(); heldPost = nil }
    }

    private func store(_ server: Server, _ vault: Vault) -> PushStore {
        PushStore(
            api: FerniAPI(baseURL: URL(string: "https://app.example.test")!, idToken: { _ in server.signedIn }) { request in
                let method = request.httpMethod ?? ""
                server.calls.append("\(method) as \(server.signedIn ?? "nobody")")
                server.bodies.append((try? JSONSerialization.jsonObject(with: request.httpBody ?? Data()) as? [String: String]) ?? [:])
                var status = method == "DELETE" && server.failDeletes ? 503 : 200
                var body = #"{"success":true}"#
                if method == "POST" {
                    if server.holdPosts { await withCheckedContinuation { server.heldPost = $0 } }
                    switch server.postAnswer {
                    case .ok: body = server.postBody
                    case .timeout: throw URLError(.timedOut)
                    case .status(let code): status = code
                    }
                }
                return (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
            },
            vault: vault, bundleID: "com.sethdford.ferni", environment: "sandbox", appVersion: "1.0.0 (7)",
            currentUID: { server.signedIn }
        )
    }

    private let token = Data([0x0a, 0xff])

    func testATokenIsRegisteredOnlyForSomeoneWhoSaidYes() async {
        let server = Server(), vault = Vault()
        let push = store(server, vault)
        await push.received(deviceToken: token, uid: "a")
        XCTAssertTrue(server.calls.isEmpty, "no yes, no registration")

        await push.optIn(uid: "a")
        XCTAssertEqual(server.calls, ["POST as a"])
        XCTAssertEqual(server.bodies.first, [
            "platform": "ios", "token": "0aff", "bundleId": "com.sethdford.ferni",
            "environment": "sandbox", "appVersion": "1.0.0 (7)",
        ])
        XCTAssertEqual(vault.stored.owner, "a")
    }

    func testSigningOutUnbindsAsThePersonLeaving() async {
        let server = Server(), vault = Vault()
        let push = store(server, vault)
        await push.received(deviceToken: token, uid: "a")
        await push.optIn(uid: "a")
        let unbound = await push.unbindBeforeSignOut(uid: "a")
        XCTAssertTrue(unbound)
        XCTAssertEqual(server.calls.last, "DELETE as a")
        XCTAssertNil(vault.stored.owner)
        XCTAssertFalse(vault.stored.optedIn.contains("a"))
    }

    /// The failure case from the security review: DELETE fails, the binding is
    /// kept (in the Keychain, so a relaunch still knows), and the next account
    /// takes the token over and unbinds it.
    func testAFailedUnbindIsFinishedByTheNextSignIn() async {
        let server = Server(), vault = Vault()
        let push = store(server, vault)
        await push.received(deviceToken: token, uid: "a")
        await push.optIn(uid: "a")
        server.failDeletes = true
        let unbound = await push.unbindBeforeSignOut(uid: "a")
        XCTAssertFalse(unbound)
        XCTAssertEqual(vault.stored.owner, "a", "kept until it's finished")

        // Relaunch, B signs in (anonymous), the network works again.
        server.failDeletes = false
        server.signedIn = "b"
        let relaunched = store(server, vault)
        await relaunched.reconcile(uid: "b")
        XCTAssertEqual(Array(server.calls.suffix(2)), ["POST as b", "DELETE as b"])
        XCTAssertNil(vault.stored.owner)
    }

    func testIfTheNextPersonSaidYesTheTokenIsTheirs() async {
        let server = Server(), vault = Vault()
        vault.stored = PushBinding(token: "0aff", owner: "a", optedIn: ["b"])
        server.signedIn = "b"
        await store(server, vault).reconcile(uid: "b")
        XCTAssertEqual(server.calls, ["POST as b"])
        XCTAssertEqual(vault.stored.owner, "b")
    }

    func testOfflineReconcileTriesAgainLater() async {
        let server = Server(), vault = Vault()
        vault.stored = PushBinding(token: "0aff", owner: "a")
        server.signedIn = "b"
        server.failDeletes = true
        let push = store(server, vault)
        await push.reconcile(uid: "b")
        XCTAssertEqual(vault.stored.owner, "b", "taken over, not yet unbound")
        server.failDeletes = false
        await push.reconcile(uid: "b")
        XCTAssertNil(vault.stored.owner)
    }

    func testANewTokenStartsUnbound() async {
        let server = Server(), vault = Vault()
        vault.stored = PushBinding(token: "0001", owner: "a", optedIn: ["a"])
        await store(server, vault).received(deviceToken: token, uid: "a")
        XCTAssertEqual(server.calls, ["POST as a"])
        XCTAssertEqual(vault.stored.token, "0aff")
    }

    // MARK: - Security review of 7e7edf62c

    /// Finding 1: sign-out while the opt-in POST is still in flight. The unbind
    /// must wait for it and then DELETE, not skip because no owner was set yet.
    func testSignOutWaitsForAnInFlightRegistration() async throws {
        let server = Server(), vault = Vault()
        let push = store(server, vault)
        await push.received(deviceToken: token, uid: "a")
        server.holdPosts = true
        let optIn = Task { await push.optIn(uid: "a") }
        try await server.postInFlight()
        let signOut = Task { await push.unbindBeforeSignOut(uid: "a") }
        try await Task.sleep(for: .milliseconds(20))
        server.holdPosts = false
        server.releasePost()
        await optIn.value
        let unbound = await signOut.value
        XCTAssertTrue(unbound)
        XCTAssertEqual(server.calls, ["POST as a", "DELETE as a"])
        XCTAssertNil(vault.stored.owner)
        XCTAssertNil(vault.stored.unsure)
    }

    /// Finding 1: the account changes while the POST is in flight. The answer
    /// can't be credited to the old account; the store hands the token to the
    /// account signed in now and unbinds it (B never said yes).
    func testARegistrationThatFinishesAfterAnAccountSwitchIsNotCreditedToTheOldAccount() async throws {
        let server = Server(), vault = Vault()
        let push = store(server, vault)
        await push.received(deviceToken: token, uid: "a")
        server.holdPosts = true
        let optIn = Task { await push.optIn(uid: "a") }
        try await server.postInFlight()
        server.signedIn = "b"
        server.holdPosts = false
        server.releasePost()
        await optIn.value
        XCTAssertNotEqual(vault.stored.owner, "a")
        XCTAssertEqual(Array(server.calls.suffix(2)), ["POST as b", "DELETE as b"])
        XCTAssertNil(vault.stored.owner)
        XCTAssertNil(vault.stored.unsure)
    }

    /// Finding 2: nobody is signed in, so nothing can be sent; the binding
    /// stays marked, and the first account that exists finishes the unbind.
    func testWithNobodySignedInTheUnbindWaitsForTheNextAccount() async {
        let server = Server(), vault = Vault()
        vault.stored = PushBinding(token: "0aff", owner: "a")
        server.signedIn = nil
        let push = store(server, vault)
        await push.reconcile(uid: nil)
        XCTAssertTrue(server.calls.isEmpty)
        XCTAssertTrue(push.needsAccount, "the app starts an account to finish this")
        server.signedIn = "c"
        await push.reconcile(uid: "c")
        XCTAssertEqual(server.calls, ["POST as c", "DELETE as c"])
        XCTAssertFalse(push.needsAccount)
    }

    /// Finding 3: a POST that timed out may have reached the server, so the
    /// person stays a maybe-owner and signing out still sends the DELETE.
    func testATimedOutRegistrationIsStillUnboundAtSignOut() async {
        let server = Server(), vault = Vault()
        let push = store(server, vault)
        await push.received(deviceToken: token, uid: "a")
        server.postAnswer = .timeout
        await push.optIn(uid: "a")
        XCTAssertEqual(vault.stored.unsure, "a", "recorded before the POST was sent")
        let unbound = await push.unbindBeforeSignOut(uid: "a")
        XCTAssertTrue(unbound)
        XCTAssertEqual(server.calls.last, "DELETE as a")
        XCTAssertNil(vault.stored.unsure)
    }

    /// Finding 3: an explicit rejection means the server changed nothing.
    func testARejectedRegistrationLeavesNothingToUnbind() async {
        let server = Server(), vault = Vault()
        let push = store(server, vault)
        await push.received(deviceToken: token, uid: "a")
        server.postAnswer = .status(400)
        await push.optIn(uid: "a")
        XCTAssertNil(vault.stored.unsure)
        XCTAssertNil(vault.stored.owner)
        let unbound = await push.unbindBeforeSignOut(uid: "a")
        XCTAssertTrue(unbound)
        XCTAssertEqual(server.calls, ["POST as a"], "no DELETE needed")
    }

    /// Finding 3: with an unknown owner, "nobody owns it and B said no" is not
    /// a reason to do nothing.
    func testAnUnknownOwnerIsResolvedEvenForSomeoneWhoSaidNo() async {
        let server = Server(), vault = Vault()
        vault.stored = PushBinding(token: "0aff", unsure: "a")
        server.signedIn = "b"
        await store(server, vault).reconcile(uid: "b")
        XCTAssertEqual(server.calls, ["POST as b", "DELETE as b"])
        XCTAssertNil(vault.stored.unsure)
    }

    /// The server's recipient tag (after #1991) is kept for the notification
    /// extension, and dropped once the token is unbound.
    func testTheRecipientTagIsKeptWhileBound() async {
        let server = Server(), vault = Vault()
        server.postBody = #"{"success":true,"recipientTag":"r-0123456789abcdefghij"}"#
        let push = store(server, vault)
        await push.received(deviceToken: token, uid: "a")
        await push.optIn(uid: "a")
        XCTAssertEqual(vault.stored.recipientTag, "r-0123456789abcdefghij")
        let unbound = await push.unbindBeforeSignOut(uid: "a")
        XCTAssertTrue(unbound)
        XCTAssertNil(vault.stored.recipientTag)
    }
}

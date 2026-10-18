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

    /// Records calls as "POST as a" / "DELETE as b"; can be told to fail deletes.
    final class Server: @unchecked Sendable {
        var signedIn = "a"
        var failDeletes = false
        var calls: [String] = []
        var bodies: [[String: String]] = []
    }

    private func store(_ server: Server, _ vault: Vault) -> PushStore {
        PushStore(
            api: FerniAPI(baseURL: URL(string: "https://app.example.test")!, idToken: { _ in server.signedIn }) { request in
                let method = request.httpMethod ?? ""
                server.calls.append("\(method) as \(server.signedIn)")
                server.bodies.append((try? JSONSerialization.jsonObject(with: request.httpBody ?? Data()) as? [String: String]) ?? [:])
                let status = method == "DELETE" && server.failDeletes ? 503 : 200
                return (Data("{}".utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
            },
            vault: vault, bundleID: "com.sethdford.ferni", environment: "sandbox", appVersion: "1.0.0 (7)"
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
}

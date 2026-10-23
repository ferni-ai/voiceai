import FerniKit
import UIKit
import XCTest
@testable import Ferni

/// Notes from Ferni are on (IB1): the build compiles them in, and a token
/// APNs hands the app reaches the server for someone who said yes.
/// scripts/check-push-build.sh checks the Release configuration the same way.
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

    /// The POSTs the server received.
    final class Server: @unchecked Sendable {
        private let lock = NSLock()
        private var received: [(path: String, body: [String: String])] = []
        var posts: [(path: String, body: [String: String])] { lock.withLock { received } }
        func record(_ path: String, _ body: [String: String]) { lock.withLock { received.append((path, body)) } }
    }

    final class Vault: PushVault, @unchecked Sendable {
        var stored = PushBinding()
        func load() -> PushBinding { stored }
        func save(_ binding: PushBinding) { stored = binding }
    }
}

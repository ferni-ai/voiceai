import Foundation
import XCTest
@testable import FerniKit

/// The phone's push address follows the signed-in person (#1991's contract).
@MainActor
final class PushStoreTests: XCTestCase {
    private final class Server: @unchecked Sendable { var requests: [URLRequest] = [] }

    private func store(_ server: Server) -> PushStore {
        PushStore(
            api: FerniAPI(baseURL: URL(string: "https://app.example.test")!, idToken: { _ in "t" }) { request in
                server.requests.append(request)
                return (Data("{}".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            },
            bundleID: "com.sethdford.ferni", environment: "sandbox", appVersion: "1.0.0 (7)"
        )
    }

    private func body(_ request: URLRequest?) throws -> [String: String] {
        try XCTUnwrap(JSONSerialization.jsonObject(with: try XCTUnwrap(request?.httpBody)) as? [String: String])
    }

    func testANewTokenIsRegisteredAsHex() async throws {
        let server = Server()
        let push = store(server)
        let ok = await push.received(deviceToken: Data([0x0a, 0xff, 0x01]))
        XCTAssertTrue(ok)
        XCTAssertEqual(server.requests.first?.httpMethod, "POST")
        XCTAssertEqual(server.requests.first?.url?.path, "/api/push/devices")
        XCTAssertEqual(try body(server.requests.first), [
            "platform": "ios", "token": "0aff01", "bundleId": "com.sethdford.ferni",
            "environment": "sandbox", "appVersion": "1.0.0 (7)",
        ])
    }

    func testSigningOutUnregistersTheToken() async throws {
        let server = Server()
        let push = store(server)
        await push.received(deviceToken: Data([0x01]))
        await push.unregister()
        XCTAssertEqual(server.requests.last?.httpMethod, "DELETE")
        XCTAssertEqual(try body(server.requests.last), ["token": "01"])
    }

    func testNothingToRegisterWithoutAToken() async {
        let server = Server()
        let push = store(server)
        let registered = await push.register()
        await push.unregister()
        XCTAssertFalse(registered)
        XCTAssertTrue(server.requests.isEmpty)
    }
}

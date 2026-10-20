import Foundation
import XCTest
@testable import FerniKit

/// P0 2026-10-19: signing in to an account you already had brings this
/// phone's anonymous conversations with you (server contract from the lead).
final class AnonymousMergeTests: XCTestCase {
    private final class Server: @unchecked Sendable {
        var answers: [Result<(Int, String), URLError>]
        private(set) var requests: [URLRequest] = []
        init(_ answers: [Result<(Int, String), URLError>]) { self.answers = answers }

        func send(_ request: URLRequest) throws -> (Data, URLResponse) {
            requests.append(request)
            let (status, body) = try answers.removeFirst().get()
            return (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
        }
    }

    private func merge(_ server: Server, _ leftBehind: LeftBehindAccount) async -> Bool {
        let api = FerniAPI(baseURL: URL(string: "https://ferni.test")!, idToken: { _ in "real-account-token" }) {
            try server.send($0)
        }
        return await AnonymousMerge.merger(api: api, retryDelays: [.zero])(leftBehind)
    }

    private let anon = LeftBehindAccount(uid: "anon-1", idToken: "anon-token")

    func testPostsTheAnonymousTokenAsTheRealAccount() async throws {
        let server = Server([.success((200, #"{"merged":true,"conversations":3,"memories":5}"#))])

        let merged = await merge(server, anon)

        XCTAssertTrue(merged)
        let request = try XCTUnwrap(server.requests.first)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.url?.path, "/api/identity/merge-anonymous")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer real-account-token")
        let body = try JSONSerialization.jsonObject(with: try XCTUnwrap(request.httpBody)) as? [String: String]
        XCTAssertEqual(body, ["anonIdToken": "anon-token"])
    }

    func testANetworkFailureIsRetriedOnceThenSucceeds() async {
        let server = Server([.failure(URLError(.timedOut)), .success((200, #"{"merged":true}"#))])
        let merged = await merge(server, anon)
        XCTAssertTrue(merged)
        XCTAssertEqual(server.requests.count, 2)
    }

    /// 500 `{merged: false, error}` is worth one more try, and only one.
    func testAServerErrorIsRetriedOnce() async {
        let server = Server([.success((500, #"{"merged":false,"error":"x"}"#)), .success((500, #"{"merged":false,"error":"x"}"#))])
        let merged = await merge(server, anon)
        XCTAssertFalse(merged)
        XCTAssertEqual(server.requests.count, 2)
    }

    /// 403: the token wasn't anonymous. Nothing to merge, nothing to say.
    func testAForbiddenTokenIsAQuietNo() async {
        let server = Server([.success((403, #"{"merged":false,"reason":"not anonymous"}"#))])
        let merged = await merge(server, anon)
        XCTAssertFalse(merged)
        XCTAssertEqual(server.requests.count, 1)
    }

    func testARefusalIsFinal() async {
        let server = Server([.success((409, #"{"merged":false,"reason":"token too old"}"#))])
        let merged = await merge(server, anon)
        XCTAssertFalse(merged)
        XCTAssertEqual(server.requests.count, 1, "409 isn't retried")
    }

    /// Before the route reaches an environment: the same quiet no as a 409.
    func testAMissingRouteIsAQuietNo() async {
        let server = Server([.success((404, "Not found"))])
        let merged = await merge(server, anon)
        XCTAssertFalse(merged)
        XCTAssertEqual(server.requests.count, 1)
    }

    func testTheAppRetriesOnceAtMost() {
        XCTAssertEqual(AnonymousMerge.retryDelays.count, 1)
    }

    func testNoTokenMeansNoRequest() async {
        let server = Server([])
        let merged = await merge(server, LeftBehindAccount(uid: "anon-1", idToken: nil))
        XCTAssertFalse(merged)
        XCTAssertTrue(server.requests.isEmpty)
    }
}

import Foundation
import XCTest
@testable import FerniKit

/// The "I'll remember" card's server calls, against the shapes in
/// docs/api/call-remembered.md and src/api/routes/remembered.ts.
@MainActor
final class CallRememberedTests: XCTestCase {
    final class Server: @unchecked Sendable {
        var status = 200
        var body = ""
        var requests: [URLRequest] = []
    }

    private func client(_ server: Server) -> CallRemembered {
        CallRemembered(api: FerniAPI(baseURL: URL(string: "https://app.example.test")!, idToken: { _ in "t" }) { request in
            server.requests.append(request)
            return (Data(server.body.utf8), HTTPURLResponse(url: request.url!, statusCode: server.status, httpVersion: nil, headerFields: nil)!)
        })
    }

    private let item = CallRemembered.Item(id: "3f9a_x-1", subject: "you", detail: "dog name: Biscuit")

    func testTheCardAsksForThisCallsItems() async throws {
        let server = Server()
        server.body = #"{"items":[{"id":"3f9a","subject":"you","detail":"dog name: Biscuit","learnedAt":"2026-10-18T19:41:02.000Z"},{"id":"77b","subject":"Ana","detail":"birthday: June 3"}]}"#
        let items = await client(server).items(since: Date(timeIntervalSince1970: 1_760_000_000.5))
        XCTAssertEqual(items.map(\.sentence), ["Dog name: Biscuit", "Ana: birthday: June 3"])
        let url = try XCTUnwrap(server.requests.first?.url)
        XCTAssertEqual(url.path, "/api/memories/from-call")
        XCTAssertEqual(url.query, "since=1760000000500", "epoch milliseconds")
    }

    /// Off on the server (404), an error, or nonsense: the card shows nothing.
    func testNothingShowsWhenTheServerHasNothing() async {
        for (status, body) in [(404, ""), (500, ""), (200, "nope"), (200, #"{"items":[]}"#)] {
            let server = Server()
            server.status = status
            server.body = body
            let items = await client(server).items(since: .now)
            XCTAssertTrue(items.isEmpty, "\(status) \(body)")
        }
    }

    func testAtMostThreeAndOnlySafeIDs() async {
        let server = Server()
        server.body = #"{"items":[{"id":"a","subject":"you","detail":"1"},{"id":"../x","subject":"you","detail":"2"},{"id":"b","subject":"you","detail":"3"},{"id":"c","subject":"you","detail":"4"},{"id":"d","subject":"you","detail":"5"}]}"#
        let items = await client(server).items(since: .now)
        XCTAssertEqual(items.map(\.id), ["a", "b", "c"])
    }

    func testForgetDeletesThatItem() async throws {
        let server = Server()
        server.body = #"{"success":true,"id":"3f9a_x-1"}"#
        let forgotten = await client(server).forget(item)
        XCTAssertTrue(forgotten)
        let request = try XCTUnwrap(server.requests.first)
        XCTAssertEqual(request.httpMethod, "DELETE")
        XCTAssertEqual(request.url?.path, "/api/memories/remembered/3f9a_x-1")
    }

    func testNotQuiteSendsTheCorrectedValue() async throws {
        let server = Server()
        server.body = #"{"success":true,"fact":{"id":"f_new","subject":"you","detail":"dog name: Biscotti","fromYou":true}}"#
        let corrected = await client(server).correct(item, to: "  Biscotti\n ")
        XCTAssertEqual(corrected, CallRemembered.Item(id: "f_new", subject: "you", detail: "dog name: Biscotti"))
        let request = try XCTUnwrap(server.requests.first)
        XCTAssertEqual(request.httpMethod, "PATCH")
        XCTAssertEqual(request.url?.path, "/api/memories/remembered/3f9a_x-1")
        let sent = try JSONSerialization.jsonObject(with: try XCTUnwrap(request.httpBody)) as? [String: String]
        XCTAssertEqual(sent, ["value": "Biscotti"])
    }

    /// What the server would refuse never goes out.
    func testAnEmptyOrTooLongCorrectionIsNeverSent() async {
        let server = Server()
        let c = client(server)
        let empty = await c.correct(item, to: " \n ")
        let long = await c.correct(item, to: String(repeating: "a", count: 201))
        XCTAssertNil(empty)
        XCTAssertNil(long)
        XCTAssertTrue(server.requests.isEmpty)
        let refused = await c.correct(CallRemembered.Item(id: "a/b", subject: "you", detail: "x"), to: "y")
        XCTAssertNil(refused)
        XCTAssertTrue(server.requests.isEmpty, "an id that isn't one never reaches the URL")
    }

    func testTheValueIsWhatACorrectionReplaces() {
        XCTAssertEqual(item.key, "dog name")
        XCTAssertEqual(item.value, "Biscuit")
        let plain = CallRemembered.Item(id: "a", subject: "you", detail: "loves hiking")
        XCTAssertNil(plain.key)
        XCTAssertEqual(plain.value, "loves hiking")
    }
}

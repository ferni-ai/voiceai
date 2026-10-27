import Foundation
import XCTest
@testable import FerniKit

/// Delight gap 1: Home's line from Ferni, from GET /api/home. The route may
/// not exist yet; then (404), on an error or with nothing to say, Home shows
/// its time-of-day line.
@MainActor
final class HomeLineTests: XCTestCase {
    final class Server: @unchecked Sendable {
        var status = 200, body = "", requests: [URLRequest] = []
    }

    private func store(_ server: Server) -> HomeLineStore {
        HomeLineStore(api: FerniAPI(baseURL: URL(string: "https://app.example.test")!, idToken: { _ in "t" }) { request in
            server.requests.append(request)
            return (Data(server.body.utf8), HTTPURLResponse(url: request.url!, statusCode: server.status, httpVersion: nil, headerFields: nil)!)
        })
    }

    func testItReadsHomesLineAndTheNameIfThereIsOne() async throws {
        let server = Server()
        server.body = #"{"name":"Sam","line":"How did the interview go?"}"#
        let home = store(server)
        await home.refresh()
        XCTAssertEqual(home.current, .init(name: "Sam", line: "How did the interview go?"))
        let request = try XCTUnwrap(server.requests.first)
        XCTAssertEqual(request.url?.path, "/api/home")
        XCTAssertEqual(request.httpMethod ?? "GET", "GET")
    }

    func testNoRouteNoErrorJustNoLine() async {
        for (status, body) in [(404, ""), (500, ""), (200, "nope"), (200, "{}"), (200, #"{"line":"  ","name":""}"#)] {
            let server = Server()
            server.status = status
            server.body = body
            let home = store(server)
            await home.refresh()
            XCTAssertNil(home.current, "\(status) \(body)")
        }
    }

    /// A stale line never survives a failed refresh, and it leaves with the person.
    func testAFailedRefreshOrSignOutClearsIt() async {
        let server = Server()
        server.body = #"{"line":"How was the hike?"}"#
        let home = store(server)
        await home.refresh()
        XCTAssertEqual(home.current?.line, "How was the hike?")
        server.status = 500
        await home.refresh()
        XCTAssertNil(home.current)
        server.status = 200
        await home.refresh()
        home.reset()
        XCTAssertNil(home.current)
    }

    /// Security review (2026-10-19): a response still in flight when the
    /// person signs out or switches must not land on the next person's Home.
    func testALineInFlightAtSignOutNeverShows() async throws {
        let home = HomeLineStore(api: FerniAPI(baseURL: URL(string: "https://app.example.test")!, idToken: { _ in "t" }) { request in
            try await Task.sleep(for: .milliseconds(300))
            let body = #"{"name":"Sam","line":"How did the interview go?"}"#
            return (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        })
        let inFlight = Task { await home.refresh() }
        try await Task.sleep(for: .milliseconds(50))
        home.reset()
        await inFlight.value
        XCTAssertNil(home.current, "the previous person's line")
        await home.refresh()
        XCTAssertEqual(home.current?.name, "Sam", "a refresh after the switch still works")
    }

    /// Home is not the place for a paragraph: overlong text is not shown.
    func testOnlyAShortLineAndAShortName() async {
        let server = Server()
        server.body = #"{"name":"\#(String(repeating: "n", count: 41))","line":"\#(String(repeating: "w", count: 161))"}"#
        let home = store(server)
        await home.refresh()
        XCTAssertNil(home.current)
    }
}

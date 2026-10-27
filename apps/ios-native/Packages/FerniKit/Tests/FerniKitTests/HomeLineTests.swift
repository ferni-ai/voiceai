import Foundation
import XCTest
@testable import FerniKit

/// Delight gap 1: Home's greeting and Ferni's note, from GET /api/home
/// (docs/api/home.md on feat/api-home). Fixtures are the doc's own examples.
@MainActor
final class HomeLineTests: XCTestCase {
    final class Server: @unchecked Sendable {
        var status = 200, body = "", requests: [URLRequest] = []
    }

    private func store(_ server: Server, zone: String = "America/New_York") -> HomeLineStore {
        HomeLineStore(api: FerniAPI(baseURL: URL(string: "https://app.example.test")!, idToken: { _ in "t" }) { request in
            server.requests.append(request)
            return (Data(server.body.utf8), HTTPURLResponse(url: request.url!, statusCode: server.status, httpVersion: nil, headerFields: nil)!)
        }, timeZone: { TimeZone(identifier: zone)! })
    }

    nonisolated private static let docExample = """
        {
          "greeting": { "kind": "followUp", "text": "the interview on Thursday", "topicId": "9f2c..." },
          "note": { "id": "6e0d15668ef07049", "text": "your sister moving to Denver", "createdAt": "2026-10-13T03:00:00Z" }
        }
        """

    func testTheDocsExample() async throws {
        let server = Server()
        server.body = Self.docExample
        let home = store(server)
        await home.refresh()
        XCTAssertEqual(home.current?.greeting, .followUp(text: "the interview on Thursday", topicID: "9f2c..."))
        XCTAssertEqual(home.current?.note?.id, "6e0d15668ef07049")
        XCTAssertEqual(home.current?.note?.text, "your sister moving to Denver")
        XCTAssertEqual(home.current?.note?.createdAt, ISO8601DateFormatter().date(from: "2026-10-13T03:00:00Z"))
    }

    func testItAsksForThePersonsTimeZone() async throws {
        let server = Server()
        server.body = Self.docExample
        await store(server, zone: "Europe/Berlin").refresh()
        let url = try XCTUnwrap(server.requests.first?.url)
        XCTAssertEqual(url.path, "/api/home")
        XCTAssertEqual(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems, [URLQueryItem(name: "tz", value: "Europe/Berlin")])
    }

    func testFirstVisitAndTimeOfDayWithoutANote() async {
        for (json, expected) in [
            (#"{"greeting":{"kind":"firstVisit","text":"Hi, I'm Ferni."}}"#, HomeLineStore.Home.Greeting.firstVisit),
            (#"{"greeting":{"kind":"timeOfDay","text":"Good morning."}}"#, .timeOfDay),
        ] {
            let server = Server()
            server.body = json
            let home = store(server)
            await home.refresh()
            XCTAssertEqual(home.current?.greeting, expected, json)
            XCTAssertNil(home.current?.note)
        }
    }

    /// The note id goes into the token URL later (from=note:<id>), so only the
    /// documented form survives: 16 lowercase hex characters.
    func testANoteWithAnyOtherIdIsDropped() async {
        for id in ["6E0D15668EF07049", "6e0d", "6e0d15668ef07049x", "../../x", ""] {
            let server = Server()
            server.body = #"{"greeting":{"kind":"timeOfDay","text":"Hi."},"note":{"id":"\#(id)","text":"a walk","createdAt":"2026-10-13T03:00:00Z"}}"#
            let home = store(server)
            await home.refresh()
            XCTAssertEqual(home.current?.greeting, .timeOfDay, id)
            XCTAssertNil(home.current?.note, id)
        }
    }

    /// No route yet, an error, nonsense, or nothing usable: nothing, and Home
    /// shows its own time-of-day words.
    func testNoRouteNoErrorJustNothing() async {
        for (status, body) in [(404, ""), (500, ""), (200, "nope"), (200, "{}"),
                               (200, #"{"greeting":{"kind":"somethingNew","text":"x"}}"#),
                               (200, #"{"greeting":{"kind":"followUp","text":"   "}}"#)] {
            let server = Server()
            server.status = status
            server.body = body
            let home = store(server)
            await home.refresh()
            XCTAssertNil(home.current, "\(status) \(body)")
        }
    }

    /// Home is not the place for a paragraph.
    func testOverlongTextIsNotShown() async {
        let long = String(repeating: "w", count: 161)
        let server = Server()
        server.body = #"{"greeting":{"kind":"followUp","text":"\#(long)"},"note":{"id":"6e0d15668ef07049","text":"\#(long)"}}"#
        let home = store(server)
        await home.refresh()
        XCTAssertNil(home.current)
    }

    func testAFailedRefreshOrSignOutClearsIt() async {
        let server = Server()
        server.body = Self.docExample
        let home = store(server)
        await home.refresh()
        XCTAssertNotNil(home.current)
        server.status = 500
        await home.refresh()
        XCTAssertNil(home.current)
        server.status = 200
        await home.refresh()
        home.reset()
        XCTAssertNil(home.current)
    }

    /// Security review (2026-10-19): an answer still in flight when the person
    /// signs out or switches never lands on the next person's Home.
    func testAnAnswerInFlightAtSignOutNeverShows() async throws {
        let home = HomeLineStore(api: FerniAPI(baseURL: URL(string: "https://app.example.test")!, idToken: { _ in "t" }) { request in
            try await Task.sleep(for: .milliseconds(300))
            return (Data(Self.docExample.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        })
        let inFlight = Task { await home.refresh() }
        try await Task.sleep(for: .milliseconds(50))
        home.reset()
        await inFlight.value
        XCTAssertNil(home.current, "the previous person's follow-up")
        await home.refresh()
        XCTAssertNotNil(home.current, "a refresh after the switch still works")
    }
}

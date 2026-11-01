import Foundation
import XCTest
@testable import FerniKit

/// The next steps from a call, from GET /api/commitments (src/api/routes/
/// commitments.ts on main): items {id, type, description, topic, dueDate?,
/// createdAt, ...}, times in epoch milliseconds.
@MainActor
final class NextStepsTests: XCTestCase {
    final class Server: @unchecked Sendable { var status = 200, body = "", requests: [URLRequest] = [] }

    private func steps(_ server: Server) -> NextSteps {
        NextSteps(api: FerniAPI(baseURL: URL(string: "https://app.example.test")!, idToken: { _ in "t" }) { request in
            server.requests.append(request)
            return (Data(server.body.utf8), HTTPURLResponse(url: request.url!, statusCode: server.status, httpVersion: nil, headerFields: nil)!)
        })
    }

    private let start = Date(timeIntervalSince1970: 1_760_000_000)

    func testOnlyWhatWasSaidInThisCall() async throws {
        let server = Server()
        server.body = """
            {"success":true,"items":[
              {"id":"c3","type":"task","description":"call the pharmacy","topic":"errands","dueDate":1760014800000,"status":"active","createdAt":1760000300000},
              {"id":"c2","type":"task","description":"download last year's statements","topic":"money","status":"active","createdAt":1760000100000},
              {"id":"c1","type":"task","description":"an older promise","status":"active","createdAt":1759990000000}
            ],"count":3,"total":3}
            """
        let found = await steps(server).since(start)
        XCTAssertEqual(found.map(\.id), ["c3", "c2"], "made during this call, newest first")
        XCTAssertEqual(found.first?.due, Date(timeIntervalSince1970: 1_760_014_800))
        XCTAssertNil(found.last?.due)
        XCTAssertEqual(found.last?.topic, "money")
        let url = try XCTUnwrap(server.requests.first?.url)
        XCTAssertEqual(url.path, "/api/commitments")
        XCTAssertEqual(Set(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []),
                       [URLQueryItem(name: "status", value: "active"), URLQueryItem(name: "limit", value: "20")])
    }

    func testAtMostThreeAndNothingBlank() async {
        let server = Server()
        let items = (0..<5).map { #"{"id":"s\#($0)","description":"step \#($0)","createdAt":\#(1_760_000_100_000 + $0)}"# }
            + [#"{"id":"blank","description":"   ","createdAt":1760000200000}"#]
        server.body = #"{"success":true,"items":[\#(items.joined(separator: ","))]}"#
        let found = await steps(server).since(start)
        XCTAssertEqual(found.count, 3)
        XCTAssertFalse(found.contains { $0.id == "blank" })
    }

    func testNothingWhenTheServerHasNothing() async {
        for (status, body) in [(500, ""), (404, ""), (200, "nope"), (200, #"{"items":[]}"#)] {
            let server = Server()
            server.status = status
            server.body = body
            let found = await steps(server).since(start)
            XCTAssertTrue(found.isEmpty, "\(status) \(body)")
        }
    }
}

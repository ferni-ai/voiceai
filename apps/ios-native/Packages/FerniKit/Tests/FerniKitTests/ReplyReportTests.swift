import Foundation
import XCTest
@testable import FerniKit

/// The report matches the server's schema (src/api/reply-reports/reply-report-input.ts).
final class ReplyReportTests: XCTestCase {
    func testAReportCarriesWhatTheServerNeedsAndNoMore() async throws {
        final class Seen: @unchecked Sendable { var request: URLRequest? }
        let seen = Seen()
        let api = FerniAPI(baseURL: URL(string: "https://app.example.test")!, idToken: { _ in "t" }, send: { request in
            seen.request = request
            return (Data(#"{"ok":true}"#.utf8), HTTPURLResponse(url: request.url!, statusCode: 201, httpVersion: nil, headerFields: nil)!)
        })
        let note = String(repeating: "x", count: 600)
        try await ReplyReport.send(
            using: api, sessionID: "ios-room-1", saidAt: Date(timeIntervalSince1970: 1_792_300_000.5),
            reason: .wrong, note: "  " + note, textHint: "Paris is in Spain", appVersion: "1.0.0 (6)"
        )

        let request = try XCTUnwrap(seen.request)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.url?.path, "/api/reports")
        let body = try XCTUnwrap(JSONSerialization.jsonObject(with: try XCTUnwrap(request.httpBody)) as? [String: Any])
        XCTAssertEqual(body["sessionId"] as? String, "ios-room-1")
        XCTAssertEqual(body["messageAt"] as? Int, 1_792_300_000_500)
        XCTAssertEqual(body["reason"] as? String, "wrong")
        XCTAssertEqual((body["note"] as? String)?.count, 500, "the server's 500-character limit")
        XCTAssertEqual(body["textHint"] as? String, "Paris is in Spain")
        XCTAssertEqual(body["platform"] as? String, "ios")
    }

    func testReasonsAreTheServersFour() {
        XCTAssertEqual(ReplyReport.Reason.allCases.map(\.rawValue), ["harmful", "wrong", "inappropriate", "other"])
    }
}

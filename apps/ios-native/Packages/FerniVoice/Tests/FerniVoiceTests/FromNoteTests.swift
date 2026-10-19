import FerniKit
import Foundation
import XCTest
@testable import FerniVoice

/// A call started from Home's note carries `from=note:<id>` on the token
/// request (docs/api/from-note.md); nothing else ever does.
final class FromNoteTests: XCTestCase {
    final class Seen: @unchecked Sendable { var url: URL? }

    private func fetch(origin: String?) async throws -> [String: String] {
        let seen = Seen()
        let api = FerniAPI(baseURL: URL(string: "https://app.example.test")!, idToken: { _ in "t" }) { request in
            seen.url = request.url
            let body = #"{"token":"t","url":"wss://x","room":"ios-r","agent_dispatched":true}"#
            return (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
        _ = try await CallTokens.fetcher(api: api, origin: { origin })("ferni")
        let items = URLComponents(url: try XCTUnwrap(seen.url), resolvingAgainstBaseURL: false)?.queryItems ?? []
        return Dictionary(items.map { ($0.name, $0.value ?? "") }, uniquingKeysWith: { a, _ in a })
    }

    func testANoteCallCarriesItsId() async throws {
        let query = try await fetch(origin: "note:6e0d15668ef07049")
        XCTAssertEqual(query["from"], "note:6e0d15668ef07049")
        XCTAssertEqual(query["persona_id"], "ferni", "everything else as before")
    }

    func testAnOrdinaryCallCarriesNoFrom() async throws {
        let query = try await fetch(origin: nil)
        XCTAssertNil(query["from"])
    }

    /// Only the documented form reaches the server.
    func testAnythingElseIsNotSent() async throws {
        for bad in ["note:6E0D15668EF07049", "note:6e0d", "other:6e0d15668ef07049", "note:6e0d15668ef07049&x=1", ""] {
            let query = try await fetch(origin: bad)
            XCTAssertNil(query["from"], bad)
        }
    }
}

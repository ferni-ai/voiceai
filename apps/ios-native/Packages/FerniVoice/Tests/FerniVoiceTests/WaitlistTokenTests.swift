import FerniKit
import Foundation
import XCTest
@testable import FerniVoice

/// /token as the gate answers it (#1953), and /api/waitlist/me (#2033) asked
/// only when the refusal didn't say where the person stands.
final class WaitlistTokenTests: XCTestCase {
    final class Server: @unchecked Sendable {
        var answers: [String: (Int, String)]
        var paths: [String] = []
        init(_ answers: [String: (Int, String)]) { self.answers = answers }
    }

    private static let firstRefusal = #"{"error":"not_admitted","status":"pending","waitlisted":true,"message":"x"}"#
    private static let me = #"{"status":"waiting","position":432,"wavesAway":4,"nextWaveAt":"2026-10-22T17:00:00.000Z","referralUrl":"https://ferni.ai/?ref=abc123-fern","referrals":{"verified":1,"creditedDays":3,"max":5},"admittedAt":null,"seatExpiresAt":null,"foundingMember":false,"foundingWave":null}"#

    private func fetch(_ server: Server) async throws -> CallToken {
        let api = FerniAPI(baseURL: URL(string: "https://app.example.test")!, idToken: { _ in "t" }) { request in
            let path = request.url?.path ?? ""
            server.paths.append(path)
            let (status, body) = server.answers.first { path.hasSuffix($0.key) }?.value ?? (404, "{}")
            return (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
        }
        return try await CallTokens.fetcher(api: api)("ferni")
    }

    private func place(_ server: Server) async -> WaitlistStatus? {
        do {
            _ = try await fetch(server)
            return nil
        } catch FerniAPIError.waitlisted(let place) {
            return place
        } catch {
            XCTFail("\(error)")
            return nil
        }
    }

    func testTheGatesRefusalAsksWhereThePersonStands() async throws {
        let server = Server(["/token": (403, Self.firstRefusal), "/api/waitlist/me": (200, Self.me)])
        let place = await place(server)
        XCTAssertEqual(place?.position, 432)
        XCTAssertEqual(place?.inviteURL?.absoluteString, "https://ferni.ai/?ref=abc123-fern")
        XCTAssertEqual(server.paths, ["/token", "/api/waitlist/me"])
    }

    func testWhenMeCantBeReadTheScreenStillShowsWithoutAPlace() async {
        let server = Server(["/token": (403, Self.firstRefusal), "/api/waitlist/me": (500, "{}")])
        let found = await place(server)
        XCTAssertEqual(found, .unknownPosition)
    }

    func testAContractRefusalIsReadAsIsWithoutAskingAgain() async {
        let refusal = #"{"code":"WAITLISTED","status":"waiting","position":7,"wavesAway":1}"#
        let server = Server(["/token": (403, refusal)])
        let found = await place(server)
        XCTAssertEqual(found?.position, 7)
        XCTAssertEqual(server.paths, ["/token"])
    }

    func testAnAdmittedAccountGetsItsTokenAndNoWaitlistRequest() async throws {
        let server = Server(["/token": (200, #"{"token":"t","url":"wss://x","room":"ios-r","agent_dispatched":true}"#)])
        let token = try await fetch(server)
        XCTAssertEqual(token.room, "ios-r")
        XCTAssertEqual(server.paths, ["/token"])
    }
}

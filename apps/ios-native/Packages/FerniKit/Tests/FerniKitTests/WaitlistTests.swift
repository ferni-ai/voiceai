import Foundation
import XCTest
@testable import FerniKit

/// The waitlist contract (#2033's /me, #1953's /token refusal) read into what
/// the waiting screen shows; #1988's cases, plus how FerniAPI surfaces it.
final class WaitlistTests: XCTestCase {
    private func body(_ json: String) -> Data { Data(json.utf8) }

    private let waiting = """
    {"code":"WAITLISTED","status":"waiting","position":432,"wavesAway":4,
     "nextWaveAt":"2026-10-22T17:00:00.000Z","referralUrl":"https://ferni.ai/?ref=abc123",
     "referrals":{"verified":1,"creditedDays":3,"max":5},"admittedAt":null,"seatExpiresAt":null,
     "foundingMember":false,"foundingWave":null}
    """

    func testAWaitlistedRefusalGivesPlaceWavesNextWaveAndLink() throws {
        let place = try XCTUnwrap(WaitlistStatus.fromRefusal(statusCode: 403, body: body(waiting)))
        XCTAssertFalse(place.isAdmitted)
        XCTAssertEqual(place.positionLine, "You’re #432, about 4 waves away")
        let utc = try XCTUnwrap(TimeZone(identifier: "UTC"))
        XCTAssertEqual(place.nextWaveLine(locale: Locale(identifier: "en_US"), timeZone: utc), "The next wave opens Thursday, October 22.")
        XCTAssertEqual(place.inviteURL?.absoluteString, "https://ferni.ai/?ref=abc123")
        XCTAssertEqual(place.referrals?.creditedDays, 3)
    }

    func testOtherRefusalsAreNotTheWaitlist() {
        XCTAssertNil(WaitlistStatus.fromRefusal(statusCode: 401, body: body(waiting)))
        XCTAssertNil(WaitlistStatus.fromRefusal(statusCode: 200, body: body(waiting)))
        XCTAssertNil(WaitlistStatus.fromRefusal(statusCode: 403, body: body(#"{"error":"identity mismatch"}"#)))
        XCTAssertNil(WaitlistStatus.fromRefusal(statusCode: 403, body: body("not json")))
        // #1953's "couldn't check" answer is a 503: try again, not the waitlist.
        XCTAssertNil(WaitlistStatus.fromRefusal(statusCode: 503, body: body(#"{"error":"admission_unavailable","retryable":true}"#)))
    }

    func testTheGatesFirstRefusalIsWaitingWithThePlaceUnknown() throws {
        let json = #"{"error":"not_admitted","status":"pending","waitlisted":true,"message":"x"}"#
        let place = try XCTUnwrap(WaitlistStatus.fromRefusal(statusCode: 403, body: body(json)))
        XCTAssertTrue(place.detailsUnknown)
        XCTAssertNil(place.positionLine)
        XCTAssertNil(place.inviteURL)
    }

    func testAdmittedShowsTheFoundingBadgeAndDropsNonHttpsLinks() throws {
        let json = #"{"code":"WAITLISTED","status":"admitted","referralUrl":"javascript:x","foundingMember":true,"foundingWave":7}"#
        let place = try XCTUnwrap(WaitlistStatus.fromRefusal(statusCode: 403, body: body(json)))
        XCTAssertTrue(place.isAdmitted)
        XCTAssertFalse(place.detailsUnknown)
        XCTAssertEqual(place.badge, "Founding member · Wave 7")
        XCTAssertNil(place.inviteURL)
    }

    func testOneWaveAwayIsTheVeryNextWave() {
        let json = #"{"code":"WAITLISTED","status":"waiting","position":12,"wavesAway":1}"#
        XCTAssertEqual(WaitlistStatus.fromRefusal(statusCode: 403, body: body(json))?.positionLine, "You’re #12, in the very next wave")
    }

    /// Expired and not-joined accounts don't get the waiting screen.
    func testOnlyWaitingAndAdmittedReachTheScreen() {
        XCTAssertNil(WaitlistStatus.fromMe(body(#"{"status":"expired","position":1}"#)))
        XCTAssertNil(WaitlistStatus.fromMe(body(#"{"status":"not_joined","position":null}"#)))
        XCTAssertNotNil(WaitlistStatus.fromMe(body(#"{"status":"waiting","position":null}"#)))
    }

    func testTheWordsHaveNoEmDashesOrEllipses() throws {
        let place = try XCTUnwrap(WaitlistStatus.fromRefusal(statusCode: 403, body: body(waiting)))
        let utc = try XCTUnwrap(TimeZone(identifier: "UTC"))
        for line in [place.positionLine, place.nextWaveLine(locale: Locale(identifier: "en_US"), timeZone: utc), place.badge] {
            XCTAssertFalse((line ?? "").contains("\u{2014}") || (line ?? "").contains("\u{2026}"))
        }
    }

    // MARK: - FerniAPI

    private func api(status: Int, body: String) -> FerniAPI {
        FerniAPI(baseURL: URL(string: "https://api.example.test")!, idToken: { _ in "t" }) { request in
            (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
        }
    }

    func testARequestThatReadsTheWaitlistGetsThePlace() async {
        do {
            _ = try await api(status: 403, body: waiting).data("/token", readsWaitlist: true)
            XCTFail("a refusal")
        } catch FerniAPIError.waitlisted(let place) {
            XCTAssertEqual(place.position, 432)
        } catch {
            XCTFail("\(error)")
        }
    }

    /// Every other caller keeps reading a 403 as a 403 (memory, push, merge).
    func testOtherRequestsStillSeeA403() async {
        do {
            _ = try await api(status: 403, body: waiting).data("/api/cognitive/memories")
            XCTFail("a refusal")
        } catch {
            XCTAssertEqual(error as? FerniAPIError, .status(403))
        }
    }

    func testAnAdmittedAccountGetsItsAnswer() async throws {
        let data = try await api(status: 200, body: #"{"token":"t"}"#).data("/token", readsWaitlist: true)
        XCTAssertEqual(String(decoding: data, as: UTF8.self), #"{"token":"t"}"#)
    }
}

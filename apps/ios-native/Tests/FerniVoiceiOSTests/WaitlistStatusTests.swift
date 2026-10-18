import XCTest
@testable import FerniVoice

/// The 403 WAITLISTED body from /token, read into what the waiting screen shows.
final class WaitlistStatusTests: XCTestCase {
    private func body(_ json: String) -> Data { Data(json.utf8) }

    private let waiting = """
    {"code":"WAITLISTED","status":"waiting","position":432,"wavesAway":4,
     "nextWaveAt":"2026-10-22T17:00:00.000Z","referralUrl":"https://ferni.ai/?ref=abc123",
     "referrals":{"verified":1,"creditedDays":3,"max":5},"admittedAt":null,"seatExpiresAt":null,
     "foundingMember":false,"foundingWave":null}
    """

    func testWaitlistedRefusalGivesPositionWavesNextWaveAndLink() throws {
        let status = try XCTUnwrap(WaitlistStatus.fromRefusal(statusCode: 403, body: body(waiting)))
        XCTAssertEqual(status.positionLine, "You’re #432, about 4 waves away")
        let utc = try XCTUnwrap(TimeZone(identifier: "UTC"))
        XCTAssertEqual(status.nextWaveLine(locale: Locale(identifier: "en_US"), timeZone: utc), "The next wave opens Thursday, October 22.")
        XCTAssertEqual(status.inviteURL?.absoluteString, "https://ferni.ai/?ref=abc123")
        XCTAssertEqual(status.referrals?.creditedDays, 3)
    }

    func testOtherRefusalsAreNotTheWaitlist() {
        XCTAssertNil(WaitlistStatus.fromRefusal(statusCode: 401, body: body(waiting)))
        XCTAssertNil(WaitlistStatus.fromRefusal(statusCode: 403, body: body(#"{"error":"identity mismatch"}"#)))
        XCTAssertNil(WaitlistStatus.fromRefusal(statusCode: 403, body: body("not json")))
    }

    func testAdmittedShowsFoundingBadgeAndDropsNonHttpsLinks() throws {
        let json = #"{"code":"WAITLISTED","status":"admitted","referralUrl":"javascript:x","foundingMember":true,"foundingWave":7}"#
        let status = try XCTUnwrap(WaitlistStatus.fromRefusal(statusCode: 403, body: body(json)))
        XCTAssertTrue(status.isAdmitted)
        XCTAssertEqual(status.badge, "Founding member · Wave 7")
        XCTAssertNil(status.inviteURL)
    }

    func testOneWaveAwayReadsAsTheVeryNextWave() {
        let json = #"{"code":"WAITLISTED","status":"waiting","position":12,"wavesAway":1}"#
        XCTAssertEqual(WaitlistStatus.fromRefusal(statusCode: 403, body: body(json))?.positionLine, "You’re #12, in the very next wave")
    }

    func testTheGatesFirstRefusalShapeReadsAsWaitlistedWithDetailsUnknown() throws {
        let json = #"{"error":"not_admitted","status":"pending","waitlisted":true,"message":"x"}"#
        let status = try XCTUnwrap(WaitlistStatus.fromRefusal(statusCode: 403, body: body(json)))
        XCTAssertTrue(status.detailsUnknown)
        XCTAssertNil(status.positionLine)
        XCTAssertNil(status.inviteURL)
    }

    func testCopyHasNoEmDashesOrEllipses() throws {
        let status = try XCTUnwrap(WaitlistStatus.fromRefusal(statusCode: 403, body: body(waiting)))
        let utc = try XCTUnwrap(TimeZone(identifier: "UTC"))
        for line in [status.positionLine, status.nextWaveLine(locale: Locale(identifier: "en_US"), timeZone: utc), status.badge] {
            XCTAssertFalse((line ?? "").contains("\u{2014}") || (line ?? "").contains("\u{2026}"))
        }
    }
}

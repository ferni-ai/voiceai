import XCTest
@testable import Ferni

/// Delight gap 1: coming back the next day isn't frozen mid-goodbye.
final class NextDayTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_760_000_000)

    func testAnEndedCallIsForgottenAfterTwentyMinutesAway() {
        XCTAssertTrue(Welcome.onReturn(callEndedAt: now - 21 * 60, wasActiveAt: now - 21 * 60, inCall: false, now: now).forgetCall)
        XCTAssertFalse(Welcome.onReturn(callEndedAt: now - 10 * 60, wasActiveAt: now - 10 * 60, inCall: false, now: now).forgetCall)
        XCTAssertFalse(Welcome.onReturn(callEndedAt: nil, wasActiveAt: now - 3600, inCall: false, now: now).forgetCall)
    }

    func testALongTimeAwayWakesFerni() {
        XCTAssertTrue(Welcome.onReturn(callEndedAt: nil, wasActiveAt: now - 9 * 3600, inCall: false, now: now).wake)
        XCTAssertFalse(Welcome.onReturn(callEndedAt: nil, wasActiveAt: now - 3 * 3600, inCall: false, now: now).wake)
        XCTAssertFalse(Welcome.onReturn(callEndedAt: nil, wasActiveAt: nil, inCall: false, now: now).wake, "a cold launch already wakes him")
    }

    func testNothingChangesUnderACall() {
        let r = Welcome.onReturn(callEndedAt: now - 9 * 3600, wasActiveAt: now - 9 * 3600, inCall: true, now: now)
        XCTAssertFalse(r.forgetCall)
        XCTAssertFalse(r.wake)
    }

    /// The name only when the person said it (the server sends it only then).
    func testTheGreetingUsesTheNameWhenThereIsOne() {
        XCTAssertEqual(Greeting.headline(hour: 9, firstVisit: false, name: "Sam"), "Good morning, Sam.")
        XCTAssertEqual(Greeting.headline(hour: 9, firstVisit: false, name: nil), "Good morning.")
        XCTAssertEqual(Greeting.headline(hour: 2, firstVisit: false, name: "Sam"), "Up late, Sam? I'm here.")
        XCTAssertEqual(Greeting.headline(hour: 9, firstVisit: true, name: "Sam"), "Hi, I'm Ferni.")
    }

    /// Home's thread from last time replaces the generic line; the ended
    /// call's goodbye still wins right after a call.
    func testHomesLineWhenThereIsOne() {
        XCTAssertEqual(RestingWords.detail(ended: false, homeLine: "How did the interview go?"), "How did the interview go?")
        XCTAssertEqual(RestingWords.detail(ended: false, homeLine: nil), "Whenever you're ready, I'm here.")
        XCTAssertEqual(RestingWords.detail(ended: true, homeLine: "How did the interview go?"), "I'm here whenever you want to talk again.")
    }
}

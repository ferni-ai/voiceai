import FerniKit
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

    private func words(_ home: HomeLineStore.Home?, ended: Bool = false, hour: Int = 9, hasTalked: Bool = true) -> [String] {
        let w = RestingWords.words(home: home, ended: ended, hour: hour, hasTalked: hasTalked)
        return [w.headline, w.detail]
    }

    /// The follow-up is in the person's own words; Ferni frames it as a question.
    func testAFollowUpBecomesFernisQuestion() {
        let home = HomeLineStore.Home(greeting: .followUp(text: "the interview on Thursday", topicID: "9f2c"), note: nil)
        XCTAssertEqual(words(home), ["Good morning.", "How's the interview on Thursday going?"])
    }

    func testTimeOfDayAndNothingUseTheClockAndTheOpenInvitation() {
        let home = HomeLineStore.Home(greeting: .timeOfDay, note: nil)
        XCTAssertEqual(words(home, hour: 20), ["Good evening.", "Whenever you're ready, I'm here."])
        XCTAssertEqual(words(nil, hour: 20), ["Good evening.", "Whenever you're ready, I'm here."])
    }

    /// The server knows about calls on other devices: its firstVisit (or not)
    /// wins; without an answer, this device's own history decides.
    func testFirstVisitFollowsTheServerWhenItAnswers() {
        XCTAssertEqual(words(.init(greeting: .firstVisit, note: nil), hasTalked: true)[0], "Hi, I'm Ferni.")
        XCTAssertEqual(words(.init(greeting: .timeOfDay, note: nil), hasTalked: false)[0], "Good morning.")
        XCTAssertEqual(words(nil, hasTalked: false)[0], "Hi, I'm Ferni.")
    }

    func testRightAfterACallItsTheGoodbye() {
        let home = HomeLineStore.Home(greeting: .followUp(text: "the move", topicID: nil), note: nil)
        XCTAssertEqual(words(home, ended: true), ["Talk soon.", "I'm here whenever you want to talk again."])
    }
}

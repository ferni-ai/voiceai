import XCTest

/// Design audit P2 #20: the call's connecting, reconnecting, on-hold and failed
/// states were never exercised by a scenario. Each says what's happening and
/// leaves the right way out.
@MainActor
final class CallStatesUITests: XCTestCase {
    private func state(_ app: XCUIApplication, _ words: String) -> XCUIElement {
        app.staticTexts.matching(NSPredicate(format: "label == %@", words)).firstMatch
    }

    /// Calling: it says so, Cancel ends it, and Mute waits for the call.
    func testCallingCanBeCancelled() {
        let app = XCUIApplication.ferni(.connecting)
        XCTAssertTrue(Screen.connecting.ready(in: app).waitForExistence(timeout: 20), "Cancel while calling")
        XCTAssertTrue(state(app, "Calling Ferni…").exists, "it says it's calling")
        XCTAssertFalse(app.buttons["Mute"].isEnabled, "nothing to mute yet")
        XCTAssertFalse(app.buttons["End call"].exists, "Cancel, not End, before Ferni's there")
        attachScreenshot("call-connecting")
        app.buttons["Cancel"].tap()
        let talk = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Talk'")).firstMatch
        XCTAssertTrue(talk.waitForExistence(timeout: 5), "back to Talk")
    }

    /// Reconnecting: it says so, End is there, Mute waits.
    func testReconnectingKeepsEndInReach() {
        let app = XCUIApplication.ferni(.reconnecting)
        XCTAssertTrue(Screen.reconnecting.ready(in: app).waitForExistence(timeout: 20), "Reconnecting…")
        XCTAssertTrue(app.buttons["End call"].exists)
        XCTAssertFalse(app.buttons["Mute"].isEnabled, "no muting a line that's down")
        XCTAssertTrue(app.staticTexts["call.nameChip"].exists, "still who you're with")
        attachScreenshot("call-reconnecting")
        app.buttons["End call"].tap()
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Talk'")).firstMatch.waitForExistence(timeout: 5))
    }

    /// On hold: it says so, and Resume brings the call back.
    func testOnHoldResumes() {
        let app = XCUIApplication.ferni(.onHold)
        XCTAssertTrue(Screen.onHold.ready(in: app).waitForExistence(timeout: 20), "Resume call")
        XCTAssertTrue(state(app, "On hold").exists, "it says it's on hold")
        attachScreenshot("call-on-hold")
        app.buttons["Resume call"].tap()
        XCTAssertTrue(app.buttons["Mute"].waitForExistence(timeout: 5), "Mute is back")
        XCTAssertFalse(state(app, "On hold").exists, "and the hold is over")
    }

    /// Failed: the problem in words and Try again, no call controls left behind.
    func testAFailedCallSaysWhyAndOffersTryAgain() {
        let app = XCUIApplication.ferni(.failed)
        XCTAssertTrue(Screen.failed.ready(in: app).waitForExistence(timeout: 20), "Try again")
        XCTAssertTrue(app.staticTexts["Couldn't reach Ferni. Check your connection and try again."].exists, "why, in words")
        XCTAssertFalse(app.buttons["End call"].exists)
        XCTAssertFalse(app.buttons["Cancel"].exists)
        attachScreenshot("call-failed")
    }
}

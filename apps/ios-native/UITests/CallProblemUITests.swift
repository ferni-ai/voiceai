import XCTest

/// A call that can't be heard says so: never a silent "live" with End call.
@MainActor
final class CallProblemUITests: XCTestCase {
    /// The January 2026 App Review rejection: the system takes the call and
    /// its audio never starts, and the app can't start it either. Within
    /// seconds the call says why, in words, and offers Try again.
    func testACallWhoseSoundNeverStartsSaysSoAndOffersTryAgain() {
        let app = XCUIApplication.ferni(.silentAudio)
        XCTAssertTrue(Screen.silentAudio.ready(in: app).waitForExistence(timeout: 20), "Try again")
        XCTAssertTrue(app.staticTexts["The sound didn't start. Try again in a moment."].exists, "why, in words")
        XCTAssertFalse(app.buttons["End call"].exists)
        attachScreenshot("call-silent-audio")
    }
}

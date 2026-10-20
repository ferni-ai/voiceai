import XCTest

/// Talk for an account still on the waitlist (#1988, in the new app): the
/// scripted server refuses /token as the gate does and /api/waitlist/me says
/// where they stand. They see their place in line, never an error.
@MainActor
final class WaitingScreenTests: XCTestCase {
    func testTalkOnTheWaitlistShowsYourPlaceNotAnError() {
        let app = XCUIApplication.ferni(.waitlist)
        XCTAssertTrue(Screen.waitlist.ready(in: app).waitForExistence(timeout: 20))
        XCTAssertTrue(app.staticTexts["You’re #432, about 4 waves away"].exists, "the place /me gave")
        XCTAssertTrue(app.descendants(matching: .any)["Your invite link, ready to share"].exists)
        XCTAssertTrue(app.buttons["Copy link"].exists)
        XCTAssertTrue(app.staticTexts["Each friend who joins moves you up a few days."].exists)
        XCTAssertFalse(app.buttons["Try again"].exists, "not an error")
        attachScreenshot("waitlist")
        app.buttons["Not now"].tap()
        XCTAssertTrue(Screen.home.ready(in: app).waitForExistence(timeout: 5), "Not now goes back to the room")
        XCTAssertFalse(Screen.waitlist.ready(in: app).exists)
    }

    /// An admitted account's Talk goes straight into the call.
    func testAnAdmittedAccountNeverSeesIt() {
        let app = XCUIApplication.ferni(.call)
        XCTAssertTrue(Screen.call.ready(in: app).waitForExistence(timeout: 20))
        XCTAssertFalse(Screen.waitlist.ready(in: app).exists)
    }
}

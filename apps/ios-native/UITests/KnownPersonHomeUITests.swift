import XCTest

/// Design audit P2 #11: signed out, Home introduced Ferni to someone he knows.
@MainActor
final class KnownPersonHomeUITests: XCTestCase {
    func testSignedOutHomeWelcomesYouBack() {
        let app = XCUIApplication.ferni(.home, account: "needsSignIn")
        XCTAssertTrue(app.staticTexts["Welcome back."].waitForExistence(timeout: 20), "welcomed back")
        XCTAssertFalse(app.staticTexts["Hi, I'm Ferni."].exists, "not introduced")
        XCTAssertTrue(app.staticTexts["Sign in and we'll pick up where we left off."].exists)
        attachScreenshot("home-known-signed-out")
    }
}

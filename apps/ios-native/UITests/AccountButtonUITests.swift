import XCTest

/// Design audit P2 #5: the account button stayed in the corner during a call.
/// In a call it steps out; at home it's there.
@MainActor
final class AccountButtonUITests: XCTestCase {
    func testTheAccountButtonStepsOutDuringACall() {
        let app = XCUIApplication.ferni(.call)
        XCTAssertTrue(Screen.call.ready(in: app).waitForExistence(timeout: 20))
        sleep(1)
        XCTAssertFalse(app.buttons["Account and settings"].exists, "no account button in a call")
        attachScreenshot("call-no-account-button")
    }

    func testTheAccountButtonIsThereAtHome() {
        let app = XCUIApplication.ferni(.home)
        XCTAssertTrue(Screen.home.ready(in: app).waitForExistence(timeout: 20))
        XCTAssertTrue(app.buttons["Account and settings"].waitForExistence(timeout: 5), "the account button at home")
    }
}

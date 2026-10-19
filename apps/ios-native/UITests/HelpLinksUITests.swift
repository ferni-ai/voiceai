import XCTest

/// Critic L4: Help reaches people outside the US too, and More can text 988
/// as well as call it.
@MainActor
final class HelpLinksUITests: XCTestCase {
    func testHelpHasAHelplineOutsideTheUS() {
        let app = XCUIApplication.ferni(.settings)
        XCTAssertTrue(Screen.settings.ready(in: app).waitForExistence(timeout: 20))
        app.buttons["Help"].tap()
        XCTAssertTrue(app.links["Find a helpline outside the US"].waitForExistence(timeout: 5)
                      || app.buttons["Find a helpline outside the US"].exists)
    }

    func testMoreCanTextOrCall988() {
        let app = XCUIApplication.ferni(.call)
        XCTAssertTrue(Screen.call.ready(in: app).waitForExistence(timeout: 20))
        app.buttons["More"].tap()
        let text = app.descendants(matching: .any)["Text 988"].firstMatch
        XCTAssertTrue(text.waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["Get help now (988)"].firstMatch.exists)
    }
}

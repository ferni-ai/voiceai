import XCTest

/// Design audit P2 #9 and #13: Delete account sat mid-Settings, between Help
/// and Privacy, with long legal copy that named check-ins this build doesn't have.
@MainActor
final class DeleteAccountUITests: XCTestCase {
    func testDeleteAccountIsLastAndPlain() throws {
        try XCTSkipIf(UIDevice.current.userInterfaceIdiom == .pad, "iPad reaches Settings from the sidebar")
        let app = XCUIApplication.ferni(.settings)
        XCTAssertTrue(Screen.settings.ready(in: app).waitForExistence(timeout: 20))
        // At the end of Settings: About's last link, then Delete account.
        for _ in 0..<5 { app.swipeUp() }
        let delete = app.buttons["Delete account"].firstMatch
        let terms = app.links["Terms of Service"].exists ? app.links["Terms of Service"] : app.buttons["Terms of Service"]
        XCTAssertTrue(terms.exists, "scrolled to About")
        XCTAssertTrue(delete.exists && delete.isHittable, "Delete account at the end")
        XCTAssertGreaterThan(delete.frame.minY, terms.frame.maxY, "Delete account after everything else, About included")
        attachScreenshot("settings-end")
        delete.tap()
        XCTAssertTrue(app.navigationBars["Delete account"].waitForExistence(timeout: 10))
        let words = app.staticTexts.allElementsBoundByIndex.map(\.label).joined(separator: " ")
        XCTAssertFalse(words.localizedCaseInsensitiveContains("check-in"), "no check-ins in this build: \(words)")
        let body = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Your account goes'")).firstMatch
        XCTAssertTrue(body.exists, "the plain line")
        XCTAssertLessThanOrEqual(body.label.split(separator: " ").count, 16, "short: \(body.label)")
        XCTAssertTrue(app.buttons["Delete my account"].exists)
        attachScreenshot("delete-account")
    }
}

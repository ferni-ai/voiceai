import XCTest

/// Blocker (2): the web's Apple Health link opens Ferni with a calm note.
@MainActor
final class DeepLinkUITests: XCTestCase {
    func testTheHealthLinkOpensFerniWithANote() {
        let app = XCUIApplication.ferni(.home)
        XCTAssertTrue(Screen.home.ready(in: app).waitForExistence(timeout: 20))
        app.open(URL(string: "ferniapp://healthkit/authorize")!)
        let note = app.alerts["Health sharing isn't in the iPhone app yet."]
        XCTAssertTrue(note.waitForExistence(timeout: 5))
        note.buttons["OK"].tap()
        XCTAssertFalse(note.exists)
        XCTAssertFalse(app.buttons["End call"].exists, "a link never starts a call")
        XCTAssertFalse(app.buttons["Not now"].exists, "or asks to")
    }
}

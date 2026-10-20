import XCTest

/// Design audit P0-2 (2026-10-20): a wrong code's message sat behind the
/// floating button and the keyboard. The message shows under the field,
/// clear of both.
@MainActor
final class SignInProblemTests: XCTestCase {
    private func openSignIn(size: TextSize = .standard) -> XCUIApplication {
        let app = XCUIApplication.ferni(.home, size: size, account: "needsSignIn")
        let talk = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Talk'")).firstMatch
        XCTAssertTrue(talk.waitForExistence(timeout: 20))
        talk.tap()
        XCTAssertTrue(app.textFields["Phone number"].waitForExistence(timeout: 5))
        return app
    }

    private func assertClear(_ element: XCUIElement, of others: [XCUIElement], _ what: String) {
        for other in others where other.exists && !other.frame.isEmpty {
            XCTAssertFalse(element.frame.intersects(other.frame), "\(what) \(element.frame) overlaps \(other.frame)")
        }
    }

    func testAWrongCodeSaysSoInView() {
        let app = openSignIn()
        let number = app.textFields["Phone number"]
        number.tap()
        number.typeText("4155550134")
        app.buttons["signIn.continue"].tap()
        let code = app.textFields["Code from the text"]
        XCTAssertTrue(code.waitForExistence(timeout: 5))
        code.tap()
        code.typeText("000000")
        app.buttons["signIn.continue"].tap()
        let problem = app.staticTexts["signIn.problem"]
        XCTAssertTrue(problem.waitForExistence(timeout: 5), "the problem is shown")
        sleep(1) // the scroll into view
        attachScreenshot("wrong-code")
        let window = app.windows.firstMatch.frame
        XCTAssertTrue(window.contains(problem.frame), "on screen: \(problem.frame)")
        assertClear(problem, of: [app.buttons["signIn.continue"], app.keyboards.firstMatch], "the problem")
        XCTAssertTrue(problem.frame.minY > code.frame.minY, "under the field it's about")
    }
}

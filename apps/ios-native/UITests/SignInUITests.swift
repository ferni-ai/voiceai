import XCTest

/// P0 2026-10-19: Seth's calls ran as a new anonymous account, and nothing in
/// the app could reach the account he already had. A stand-in for Firebase
/// (UITestScenario: any number, code 123456) drives the real screens.
@MainActor
final class SignInUITests: XCTestCase {
    private func talk(_ app: XCUIApplication) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Talk'")).firstMatch
    }

    /// A real account was here before: Talk asks for sign-in instead of
    /// starting someone new, and signing in by phone gets them talking.
    func testTalkAsksASignedOutPersonToSignInByPhone() {
        let app = XCUIApplication.ferni(.home, account: "needsSignIn")
        XCTAssertTrue(talk(app).waitForExistence(timeout: 20))
        XCTAssertTrue(app.staticTexts["Sign in so Ferni remembers you."].exists)

        talk(app).tap()
        let number = app.textFields["Phone number"]
        XCTAssertTrue(number.waitForExistence(timeout: 5), "Talk opens sign-in, not a call")
        XCTAssertFalse(app.buttons["Not now"].exists, "no consent, no call as someone new")
        number.tap()
        number.typeText("4155550134")
        app.buttons["Text me a code"].tap()
        let code = app.textFields["Code from the text"]
        XCTAssertTrue(code.waitForExistence(timeout: 5))
        code.tap()
        code.typeText("123456")
        app.collectionViews.buttons["Sign in"].tap() // the sheet's, not Home's behind it

        XCTAssertTrue(number.waitForNonExistence(timeout: 5) && code.waitForNonExistence(timeout: 5), "the sheet closes")
        XCTAssertFalse(app.staticTexts["Sign in so Ferni remembers you."].exists)
        talk(app).tap()
        XCTAssertTrue(app.buttons["Not now"].waitForExistence(timeout: 5), "now Talk goes on to consent")
    }

    /// Someone who already uses Ferni (on the web) can reach that account
    /// from Home, the consent screen and Settings.
    func testAlreadyUseFerniIsOfferedWhileAnonymous() {
        for screen in [Screen.home, .consent, .settings] {
            let app = XCUIApplication.ferni(screen, account: "anonymous")
            XCTAssertTrue(screen.ready(in: app).waitForExistence(timeout: 20), "\(screen)")
            // Home's own offer stays behind the consent and Settings sheets.
            let offer = app.buttons.matching(NSPredicate(
                format: "label == 'Already use Ferni? Sign in' AND identifier != %@", screen == .home ? "" : "home.signIn"
            )).firstMatch
            XCTAssertTrue(offer.waitForExistence(timeout: 5), "\(screen)")
            offer.tap()
            XCTAssertTrue(app.textFields["Phone number"].waitForExistence(timeout: 5), "\(screen)")
            XCTAssertTrue(app.buttons["Continue with Google"].exists, "\(screen)")
            app.terminate()
        }
    }
}

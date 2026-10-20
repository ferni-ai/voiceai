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
        XCTAssertTrue(app.staticTexts["Sign in and we'll pick up where we left off."].exists)

        talk(app).tap()
        let number = app.textFields["Phone number"]
        XCTAssertTrue(number.waitForExistence(timeout: 5), "Talk opens sign-in, not a call")
        XCTAssertFalse(app.buttons["Not now"].exists, "no consent, no call as someone new")
        number.tap()
        number.typeText("4155550134")
        app.buttons["signIn.continue"].tap() // "Text me a code"
        let code = app.textFields["Code from the text"]
        XCTAssertTrue(code.waitForExistence(timeout: 5))
        code.tap()
        code.typeText("123456")
        app.buttons["signIn.continue"].tap() // "Sign in", the sheet's, not Home's behind it

        XCTAssertTrue(number.waitForNonExistence(timeout: 5) && code.waitForNonExistence(timeout: 5), "the sheet closes")
        XCTAssertFalse(app.staticTexts["Sign in and we'll pick up where we left off."].exists)
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

    /// One designed sheet (design audit P1-6): Apple first, then Google's
    /// button, then the phone number. A sheet that offers Google offers Apple
    /// too (App Review 4.8).
    func testTheSheetOffersAppleThenGoogleThenThePhone() {
        let app = XCUIApplication.ferni(.home, account: "anonymous")
        let offer = app.buttons["home.signIn"]
        XCTAssertTrue(offer.waitForExistence(timeout: 20))
        offer.tap()
        let number = app.textFields["Phone number"]
        XCTAssertTrue(number.waitForExistence(timeout: 5))
        let apple = app.buttons["Sign in with Apple"], google = app.buttons["Continue with Google"]
        XCTAssertTrue(apple.exists, "Apple is offered")
        XCTAssertTrue(google.exists, "Google is offered")
        XCTAssertLessThan(apple.frame.minY, google.frame.minY, "Apple comes first")
        XCTAssertLessThan(google.frame.maxY, number.frame.minY, "then Google, then the phone number")
        XCTAssertGreaterThanOrEqual(apple.frame.height, 44)
        XCTAssertEqual(apple.frame.height, google.frame.height, accuracy: 1, "the two buttons match")
    }

    /// Critic H3: phone sign-in fails on hardware until the key changes, so
    /// Release hides it unless the server's app config turns it on. Hidden is
    /// hidden: no field, no "or with your phone number", no Text me a code;
    /// Apple and Google stay.
    func testWithPhoneSignInOffOnlyAppleAndGoogleShow() {
        let app = XCUIApplication.ferni(.home, account: "anonymous", extra: ["-FerniPhoneSignIn", "NO"])
        let offer = app.buttons["home.signIn"]
        XCTAssertTrue(offer.waitForExistence(timeout: 20))
        offer.tap()
        XCTAssertTrue(app.buttons["Sign in with Apple"].waitForExistence(timeout: 5), "Apple is offered")
        XCTAssertTrue(app.buttons["Continue with Google"].exists, "Google is offered")
        XCTAssertFalse(app.textFields["Phone number"].exists, "no phone field")
        XCTAssertFalse(app.staticTexts["or with your phone number"].exists)
        XCTAssertFalse(app.buttons["signIn.continue"].exists, "no Text me a code")
        attachScreenshot("signin-no-phone")
    }

    /// The button is never greyed out (its dimmed label failed the contrast
    /// audit): a tap with nothing typed says what to type, right there.
    func testTheButtonSaysWhatToTypeFirst() {
        let app = XCUIApplication.ferni(.home, account: "anonymous")
        let offer = app.buttons["home.signIn"]
        XCTAssertTrue(offer.waitForExistence(timeout: 20))
        offer.tap()
        let send = app.buttons["signIn.continue"]
        XCTAssertTrue(send.waitForExistence(timeout: 5))
        XCTAssertTrue(send.isEnabled)
        send.tap()
        XCTAssertTrue(app.staticTexts["Type your phone number first."].waitForExistence(timeout: 3))
        let number = app.textFields["Phone number"]
        number.tap()
        number.typeText("4")
        XCTAssertTrue(app.staticTexts["Type your phone number first."].waitForNonExistence(timeout: 3), "typing clears it")
    }
}

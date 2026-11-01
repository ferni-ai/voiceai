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

    /// Critic L6: an account that can't be set up comes with a way to get help
    /// (the UI-test build has no account, so it's in exactly that state).
    func testAnAccountProblemComesWithHelp() {
        let app = XCUIApplication.ferni(.settings)
        XCTAssertTrue(Screen.settings.ready(in: app).waitForExistence(timeout: 20))
        let help = app.descendants(matching: .any)["Get help with your account"].firstMatch
        XCTAssertTrue(help.waitForExistence(timeout: 5))
    }

    /// The help link grows with the text size (the audit's "partially
    /// unsupported" on it at the default size is accepted on this evidence).
    func testAccountHelpGrowsWithTextSize() {
        func height(at size: TextSize) -> CGFloat {
            let app = XCUIApplication.ferni(.settings, size: size)
            XCTAssertTrue(Screen.settings.ready(in: app).waitForExistence(timeout: 20))
            let help = app.descendants(matching: .any)["Get help with your account"].firstMatch
            // At AX5 it's below the fold, and the List only builds what's on screen.
            for _ in 0..<4 where !help.waitForExistence(timeout: 2) { app.swipeUp() }
            XCTAssertTrue(help.exists, "\(size)")
            defer { app.terminate() }
            return help.frame.height
        }
        let standard = height(at: .standard), ax5 = height(at: .ax5)
        XCTAssertGreaterThan(ax5, standard * 1.5, "standard \(standard) pt, AX5 \(ax5) pt")
    }

    func testMoreCanTextOrCall988() {
        let app = XCUIApplication.ferni(.call)
        XCTAssertTrue(Screen.call.ready(in: app).waitForExistence(timeout: 20))
        app.buttons["More"].tap()
        let text = app.descendants(matching: .any)["Text 988"].firstMatch
        XCTAssertTrue(text.waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["Get help now (988)"].firstMatch.exists)
    }

    /// "Get help now" from the Home Screen opens Help over whatever is up,
    /// and Done goes back to it. A sheet used to swallow it.
    func testGetHelpNowOpensOverAnySheet() {
        for screen in [Screen.home, .consent, .settings] {
            let app = XCUIApplication.ferni(screen)
            XCTAssertTrue(screen.ready(in: app).waitForExistence(timeout: 20), "\(screen)")
            pressGetHelpNow()
            assertHelpIsUp(in: app, "\(screen)")
            app.navigationBars["Help"].buttons["Done"].tap()
            XCTAssertTrue(app.navigationBars["Help"].waitForNonExistence(timeout: 5), "\(screen)")
            XCTAssertTrue(screen.ready(in: app).exists, "\(screen) is still there")
            pressGetHelpNow()
            assertHelpIsUp(in: app, "\(screen), a second time")
            app.terminate()
        }
    }

    /// Over the sign-in sheet, on top of Home.
    func testGetHelpNowOpensOverSignIn() {
        let app = XCUIApplication.ferni(.home, account: "needsSignIn")
        XCTAssertTrue(Screen.home.ready(in: app).waitForExistence(timeout: 20))
        Screen.home.ready(in: app).tap()
        XCTAssertTrue(app.textFields["Phone number"].waitForExistence(timeout: 5))
        pressGetHelpNow()
        assertHelpIsUp(in: app, "sign-in")
    }

    /// UITestScenario.helpShortcutNotification: the quick action, as the Home Screen sends it.
    private func pressGetHelpNow() {
        CFNotificationCenterPostNotification(
            CFNotificationCenterGetDarwinNotifyCenter(),
            CFNotificationName("com.sethdford.ferni.uitest.helpShortcut" as CFString), nil, nil, true
        )
    }

    private func assertHelpIsUp(in app: XCUIApplication, _ context: String) {
        XCTAssertTrue(app.navigationBars["Help"].waitForExistence(timeout: 10), context)
        for line in ["Call 988", "Text 988"] {
            XCTAssertTrue(app.descendants(matching: .any)[line].firstMatch.exists, "\(context): \(line)")
        }
        let footer = app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'call 911'")).firstMatch
        XCTAssertTrue(footer.exists, "\(context): the 911 line")
    }
}

import XCTest

/// App Store story frames (appstore-pkg). Debug scenarios with a fake API and
/// fake first names only. Run by scripts/store-screenshots.sh, which exports
/// the attachments as <n>-<name>.png.
@MainActor
final class StoreScreenshotTests: XCTestCase {
    private var isPad: Bool { UIDevice.current.userInterfaceIdiom == .pad }

    private func launch(_ scenario: String, hour: Int = 9, dark: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = [
            "-FerniUITest", scenario, "-FerniStoreData", "YES", "-FerniHour", String(hour), "-FerniDark", dark ? "YES" : "NO",
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL",
            "-FerniReduceMotion", "NO", "-FerniReduceTransparency", "NO",
        ]
        app.launch()
        return app
    }

    private func shoot(_ name: String, after seconds: TimeInterval = 3) {
        Thread.sleep(forTimeInterval: seconds)
        attachScreenshot(name)
    }

    private func talkButton(_ app: XCUIApplication) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Talk'")).firstMatch
    }

    func testStoryFrames() {
        // 1. Home, morning, with a team.
        var app = launch("home", hour: 9)
        XCTAssertTrue(talkButton(app).waitForExistence(timeout: 20))
        shoot("01-home")
        app.terminate()

        // 2. A call.
        app = launch("call")
        XCTAssertTrue(app.buttons["End call"].waitForExistence(timeout: 20))
        shoot("02-call", after: 4)
        app.terminate()

        // 3. The family table: Maya arriving, then Maya talking.
        app = launch("handoff")
        XCTAssertTrue(app.buttons["End call"].waitForExistence(timeout: 20))
        shoot("03-handoff-mid", after: 3.6)
        shoot("04-handoff", after: 5)
        app.terminate()

        // 4. "I'll remember" after the call.
        app = launch("remember")
        XCTAssertTrue(app.staticTexts["I'll remember"].waitForExistence(timeout: 30))
        shoot("05-remember", after: 2)
        app.terminate()

        // 5. What Ferni remembers.
        app = launch(isPad ? "home" : "settings")
        if isPad {
            let item = app.staticTexts["What Ferni remembers"].firstMatch
            XCTAssertTrue(item.waitForExistence(timeout: 20)); item.tap()
        } else {
            let link = app.memoryLink
            XCTAssertTrue(link.waitForExistence(timeout: 20)); link.tap()
        }
        XCTAssertTrue(app.staticTexts["Walk before work, three mornings a week"].waitForExistence(timeout: 20))
        shoot("06-memories", after: 2)
        app.terminate()

        // 6. Late at night, in the dark.
        app = launch("home", hour: 23, dark: true)
        XCTAssertTrue(talkButton(app).waitForExistence(timeout: 20))
        shoot("07-night")
        app.terminate()

        app = launch("call", dark: true)
        XCTAssertTrue(app.buttons["End call"].waitForExistence(timeout: 20))
        shoot("08-call-dark", after: 4)
        app.terminate()

        // 7. Consent, before anything leaves the phone.
        app = launch("consent")
        XCTAssertTrue(app.buttons["Not now"].waitForExistence(timeout: 20))
        shoot("09-consent", after: 2)
        app.terminate()

        // 8. The team.
        if isPad {
            app = launch("home")
            let item = app.staticTexts["Team"].firstMatch
            XCTAssertTrue(item.waitForExistence(timeout: 20)); item.tap()
        } else {
            app = launch("settings")
            let link = app.buttons["Your team"].firstMatch
            XCTAssertTrue(link.waitForExistence(timeout: 20)); link.tap()
        }
        shoot("10-team", after: 3)
        app.terminate()
    }

    /// The Home Screen widget, added the way a person would (iPhone only).
    func testWidgetOnHomeScreen() throws {
        try XCTSkipIf(isPad)
        let app = launch("home")
        XCTAssertTrue(talkButton(app).waitForExistence(timeout: 20))
        app.terminate()
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        XCUIDevice.shared.press(.home)
        Thread.sleep(forTimeInterval: 1.5)
        // Swipe to an empty page so the widget sits alone.
        springboard.swipeLeft()
        Thread.sleep(forTimeInterval: 1)
        springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.45)).press(forDuration: 1.6)
        let edit = springboard.buttons["Edit"].firstMatch
        if edit.waitForExistence(timeout: 5) {
            edit.tap()
            let add = springboard.buttons["Add Widget"].firstMatch
            XCTAssertTrue(add.waitForExistence(timeout: 5)); add.tap()
        } else {
            let plus = springboard.buttons["Add Widget"].firstMatch
            XCTAssertTrue(plus.waitForExistence(timeout: 5)); plus.tap()
        }
        let search = springboard.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 8))
        search.tap(); search.typeText("Ferni")
        Thread.sleep(forTimeInterval: 1.5)
        attachScreenshot("w0-gallery-search")
        let result = springboard.cells.containing(NSPredicate(format: "label CONTAINS 'Ferni'")).firstMatch
        if result.waitForExistence(timeout: 5) { result.tap() } else {
            springboard.staticTexts.matching(NSPredicate(format: "label == 'Ferni'")).element(boundBy: 0).tap()
        }
        Thread.sleep(forTimeInterval: 1.5)
        // Medium: Ferni peeking beside the Talk button.
        springboard.swipeLeft()
        Thread.sleep(forTimeInterval: 1)
        attachScreenshot("w1-gallery-medium")
        let adds = springboard.buttons.matching(NSPredicate(format: "label CONTAINS 'Add Widget'"))
        XCTAssertTrue(adds.firstMatch.waitForExistence(timeout: 5))
        adds.element(boundBy: adds.count - 1).tap()
        Thread.sleep(forTimeInterval: 1.5)
        let done = springboard.buttons["Done"].firstMatch
        if done.waitForExistence(timeout: 3) { done.tap() }
        Thread.sleep(forTimeInterval: 2)
        attachScreenshot("11-widget")
    }

    /// A retake of the frames after the dark ones (a run can be cut short).
    func testLateFrames() {
        var app = launch("home", hour: 23, dark: true)
        XCTAssertTrue(talkButton(app).waitForExistence(timeout: 20))
        shoot("07-night")
        app.terminate()
        app = launch("consent")
        XCTAssertTrue(app.buttons["Not now"].waitForExistence(timeout: 20))
        shoot("09-consent", after: 2)
        app.terminate()
    }
}

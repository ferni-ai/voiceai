import XCTest

/// Design audit P1-5: after a call, "Not quite" opened a one-line field that
/// didn't take the keyboard, and "Not quite" and "Forget" were 16 pt tall.
@MainActor
final class RememberEditUITests: XCTestCase {
    private func launch() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-FerniUITest", "remember", "-FerniStoreData", "YES", "-FerniSounds", "NO"]
        app.launch()
        XCTAssertTrue(app.staticTexts["I'll remember"].waitForExistence(timeout: 30), "the remember card")
        return app
    }

    func testTheCardsActionsAreFullSizeTargets() {
        let app = launch()
        for prefix in ["Not quite", "Forget"] {
            let button = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", prefix)).firstMatch
            XCTAssertTrue(button.waitForExistence(timeout: 5), prefix)
            XCTAssertGreaterThanOrEqual(button.frame.height, 44, "\(prefix) is \(button.frame.height) pt tall")
            XCTAssertGreaterThanOrEqual(button.frame.width, 44, "\(prefix) is \(button.frame.width) pt wide")
        }
    }

    func testNotQuiteOpensAWrappingFieldWithTheKeyboard() throws {
        let app = launch()
        let notQuite = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Not quite'")).firstMatch
        XCTAssertTrue(notQuite.waitForExistence(timeout: 5))
        // Above the floating Talk button before tapping.
        for _ in 0..<3 where !notQuite.isHittable { app.swipeUp() }
        notQuite.tap()
        let field = app.descendants(matching: .any)["remember.correction"]
        XCTAssertTrue(field.waitForExistence(timeout: 5), "the correction field")
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5), "the keyboard comes up without a second tap")
        XCTAssertEqual(field.value(forKey: "hasKeyboardFocus") as? Bool, true, "and the field has it")
        // Room for several lines (a line of body text is about 22 pt).
        XCTAssertGreaterThan(field.frame.height, 22 * 3, "a field for a sentence or two, not one line: \(field.frame.height) pt")
        field.typeText(" and she moved to Lisbon in the spring with her two cats, and she starts the new job at the bakery in June")
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "shot-remember-editing"
        shot.lifetime = .keepAlways
        add(shot)
        // Nothing floats over what you're writing or its Save, and the
        // keyboard leaves them in view.
        let save = app.buttons["Save"]
        XCTAssertTrue(save.exists)
        let keyboard = app.keyboards.firstMatch.frame
        XCTAssertLessThanOrEqual(field.frame.maxY, keyboard.minY + 1, "the keyboard covers the field")
        XCTAssertLessThanOrEqual(save.frame.maxY, keyboard.minY + 1, "the keyboard covers Save")
        let talk = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Talk'")).firstMatch
        if talk.exists {
            XCTAssertFalse(talk.frame.intersects(field.frame), "Talk covers the field")
            XCTAssertFalse(talk.frame.intersects(save.frame), "Talk covers Save")
        }
    }
}

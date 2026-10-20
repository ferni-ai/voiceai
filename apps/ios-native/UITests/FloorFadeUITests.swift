import XCTest

/// Design audit P1-4: after a call, the floating Talk button covered the team
/// row and the "I'll remember" card's actions. Scrolled to the end, nothing
/// you can press sits behind it.
@MainActor
final class FloorFadeUITests: XCTestCase {
    func testScrolledToTheEndNothingHidesBehindTalk() {
        let app = XCUIApplication()
        app.launchArguments = ["-FerniUITest", "remember", "-FerniStoreData", "YES", "-FerniSounds", "NO"]
        app.launch()
        let talk = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Talk'")).firstMatch
        XCTAssertTrue(talk.waitForExistence(timeout: 20))
        XCTAssertTrue(app.staticTexts["I'll remember"].waitForExistence(timeout: 30), "the remember card")
        // At rest, what's below the fold fades into the floor behind Talk (evidence).
        let rest = XCTAttachment(screenshot: app.screenshot())
        rest.name = "shot-remember-at-rest"
        rest.lifetime = .keepAlways
        add(rest)
        for _ in 0..<4 { app.swipeUp() }
        let top = talk.frame.minY
        let pressable = app.buttons.allElementsBoundByIndex.filter {
            $0.exists && $0.frame.height > 0 && $0.label != talk.label
                && $0.frame.midY > top - 200 && $0.frame.midY < app.frame.maxY
        }
        XCTAssertFalse(pressable.isEmpty, "the team row and the card's actions are near the bottom")
        for button in pressable where button.frame.maxY > top {
            XCTFail("'\(button.label)' sits behind Talk (\(button.frame.maxY) > \(top))")
        }
    }
}

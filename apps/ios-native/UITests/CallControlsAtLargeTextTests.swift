import XCTest

/// Design audit P0-1 (2026-10-20): at accessibility text sizes End, Mute and
/// More scrolled off the call screen with the captions. They're pinned at
/// every size, on screen and tappable without scrolling, and so is Talk.
@MainActor
final class CallControlsAtLargeTextTests: XCTestCase {
    private func assertOnScreen(_ element: XCUIElement, in app: XCUIApplication, _ what: String) {
        XCTAssertTrue(element.waitForExistence(timeout: 20), "\(what) exists")
        let window = app.windows.firstMatch.frame, frame = element.frame
        XCTAssertTrue(window.contains(frame), "\(what) is on screen without scrolling: \(frame) in \(window)")
        XCTAssertTrue(element.isHittable, "\(what) can be tapped")
    }

    func testTheCallControlsStayOnScreenAtEveryTextSize() {
        for size in [TextSize.standard, .ax5] {
            let app = XCUIApplication.ferni(.call, size: size)
            assertOnScreen(app.buttons["End call"], in: app, "End at \(size)")
            // Pinned, not part of what scrolls: a swipe through the captions
            // leaves End where it was (on a tall phone the old layout still
            // fit on screen, but moved with the words).
            let before = app.buttons["End call"].frame
            app.scrollViews.firstMatch.swipeUp()
            XCTAssertEqual(app.buttons["End call"].frame, before, "End stays put when the words scroll at \(size)")
            assertOnScreen(app.buttons["Mute"], in: app, "Mute at \(size)")
            assertOnScreen(app.buttons["More"], in: app, "More at \(size)")
            attachScreenshot("call-\(size)")
            app.terminate()
        }
    }

    func testTalkIsOnTheFirstScreenAtTheLargestTextSize() {
        let app = XCUIApplication.ferni(.home, size: .ax5)
        assertOnScreen(Screen.home.ready(in: app), in: app, "Talk at AX5")
        app.terminate()
    }

    /// Design audit P1-9 and critic M-A: at rest, every word of Ferni's hello
    /// sits whole above the floor (the fade over Talk's padding), at AX5, by
    /// day and at night, with and without a follow-up line. On an SE the
    /// greeting ran under Talk, and later the second line into the fade.
    func testHisWordsAreWholeAboveTheFloorAtRest() {
        for (hour, store) in [(20, false), (2, false), (14, true)] {
            let app = XCUIApplication.ferni(.home, size: .ax5, hour: hour, extra: store ? ["-FerniStoreData", "YES"] : [])
            let talk = Screen.home.ready(in: app)
            XCTAssertTrue(talk.waitForExistence(timeout: 20))
            sleep(1)
            let floor = talk.frame.minY - 21 // FerniSpace.rest: the fade over Talk's padding
            for id in ["home.headline", "home.detail"] {
                let text = app.staticTexts[id]
                XCTAssertTrue(text.waitForExistence(timeout: 5), "\(id) at \(hour)h")
                XCTAssertLessThanOrEqual(text.frame.maxY, floor + 0.5,
                                         "\(id) at \(hour)h\(store ? " with a follow-up" : ""): \(text.frame) runs into the floor at \(floor)")
            }
            attachScreenshot("home-ax5-\(hour)h\(store ? "-store" : "")")
            app.terminate()
        }
    }
}

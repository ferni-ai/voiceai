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
        let talk = Screen.home.ready(in: app)
        assertOnScreen(talk, in: app, "Talk at AX5")
        // And Ferni's hello is read above it, not behind it (design audit
        // P1-9: on an SE at AX5 the greeting ran under Talk).
        let hello = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Hi' OR label BEGINSWITH 'Good' OR label BEGINSWITH 'Up late'")).firstMatch
        XCTAssertTrue(hello.exists, "the greeting")
        XCTAssertLessThanOrEqual(hello.frame.maxY, talk.frame.minY, "the greeting is above Talk: \(hello.frame) / \(talk.frame)")
        // With a full line of what he says after it (an AX5 line is about 50 pt).
        let detail = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Whenever' OR label BEGINSWITH 'How'")).firstMatch
        XCTAssertTrue(detail.exists, "what he says")
        XCTAssertLessThanOrEqual(detail.frame.minY + 50, talk.frame.minY, "a line of it above Talk: \(detail.frame) / \(talk.frame)")
        attachScreenshot("home-ax5")
    }
}

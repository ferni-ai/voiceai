import XCTest

/// Design audit P2 #19: in a call at AX5 the name chip scrolled up under the
/// status bar with the captions. It stays put, below the bar.
@MainActor
final class NameChipUITests: XCTestCase {
    func testTheNameChipStaysInViewAtTheLargestSize() throws {
        let app = XCUIApplication.ferni(.call, size: .ax5)
        XCTAssertTrue(Screen.call.ready(in: app).waitForExistence(timeout: 20))
        let chip = app.staticTexts["call.nameChip"]
        XCTAssertTrue(chip.waitForExistence(timeout: 10))
        sleep(2)
        let before = chip.frame
        let line = app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'garden'")).firstMatch
        let lineBefore = line.frame
        let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.55))
        start.press(forDuration: 0.05, thenDragTo: start.withOffset(CGVector(dx: 0, dy: -300)), withVelocity: 600, thenHoldForDuration: 0.3)
        sleep(1)
        attachScreenshot("call-ax5-scrolled")
        // Only a call that scrolls can carry the chip away (the SE at AX5; a 17 Pro fits it all).
        try XCTSkipIf(abs(line.frame.minY - lineBefore.minY) < 20, "the call fits without scrolling here")
        XCTAssertTrue(chip.exists)
        XCTAssertEqual(chip.frame.minY, before.minY, accuracy: 2, "the chip moved with the captions: \(before) then \(chip.frame)")
        // Below the status bar (the window's top safe area: 62 pt on a 17 Pro, 20 on an SE).
        XCTAssertGreaterThanOrEqual(chip.frame.minY, 20, "under the status bar: \(chip.frame)")
    }
}

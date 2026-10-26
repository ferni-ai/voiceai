import XCTest

/// P0 (2026-10-19, Seth's iPhone): "the Talk to Ferni button doesn't work".
/// The glass capsule is what people see and tap; every part of it has to
/// start the call, not only the words in the middle. The same holds for the
/// call's Mute, End and More circles.
@MainActor
final class TalkButtonTests: XCTestCase {
    /// Taps `element` near its leading edge, in the middle vertically.
    private func tapNearEdge(_ element: XCUIElement, x: CGFloat = 0.08) {
        element.coordinate(withNormalizedOffset: CGVector(dx: x, dy: 0.5)).tap()
    }

    func testTheWholeTalkCapsuleStartsTalking() {
        let app = XCUIApplication.ferni(.home)
        let talk = Screen.home.ready(in: app)
        XCTAssertTrue(talk.waitForExistence(timeout: 20))
        // The button's frame is the capsule people see (420 x 56 at most).
        XCTAssertGreaterThanOrEqual(talk.frame.height, 56, "the hit area is only the words: \(talk.frame)")
        // On the glass, outside the words: 20 pt in from the capsule's leading
        // edge. The capsule is centred on the words, at most 420 wide and inset
        // 21 pt from the screen (or, on iPad, the detail pane) edge.
        let half = min(210, talk.frame.midX - 21)
        let x = talk.frame.midX - half + 20
        app.windows.firstMatch.coordinate(withNormalizedOffset: .zero)
            .withOffset(CGVector(dx: x, dy: talk.frame.midY)).tap()
        // Not agreed yet in a fresh launch, so Talk opens the consent screen.
        XCTAssertTrue(app.buttons["Not now"].waitForExistence(timeout: 5), "a tap on the capsule did nothing")
    }

    func testTheCallCirclesAreFullSize() {
        let app = XCUIApplication.ferni(.call)
        XCTAssertTrue(Screen.call.ready(in: app).waitForExistence(timeout: 20))
        for label in ["Mute", "End call", "More"] {
            let button = app.buttons[label]
            XCTAssertTrue(button.exists, label)
            XCTAssertGreaterThanOrEqual(min(button.frame.width, button.frame.height), 60, "\(label): \(button.frame)")
        }
        tapNearEdge(app.buttons["More"], x: 0.12)
        XCTAssertTrue(app.navigationBars["More"].waitForExistence(timeout: 5), "a tap on the More circle did nothing")
    }
}

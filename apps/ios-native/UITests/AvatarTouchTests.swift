import XCTest

/// Delight gap 2: Ferni can be touched at rest, only Ferni himself takes the
/// touch, and it never gets in the way of Talk or of a call.
@MainActor
final class AvatarTouchTests: XCTestCase {
    private func ferni(_ app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)
            .matching(NSPredicate(format: "label == 'Ferni' AND value BEGINSWITH 'Ferni is'")).firstMatch
    }

    private func touches(_ app: XCUIApplication) -> String {
        app.descendants(matching: .any)["uitest.touches"].firstMatch.value as? String ?? "missing"
    }

    func testTappingFerniTouchesHimAndTalkStillWorks() {
        let app = XCUIApplication.ferni(.home)
        let avatar = ferni(app)
        XCTAssertTrue(avatar.waitForExistence(timeout: 20))
        XCTAssertEqual(touches(app), "0")
        avatar.tap()
        XCTAssertTrue(app.descendants(matching: .any)["uitest.touches"].firstMatch
            .waitForValue("1", timeout: 3), "a tap on Ferni at rest is a touch: \(touches(app))")
        XCTAssertFalse(app.buttons["Not now"].exists, "touching Ferni doesn't start talking")

        let talk = Screen.home.ready(in: app)
        talk.tap()
        XCTAssertTrue(app.buttons["Not now"].waitForExistence(timeout: 5), "Talk still works after touching Ferni")
    }

    /// Only Ferni takes a touch, not the empty space beside him.
    func testTheSpaceBesideFerniIsNotFerni() {
        let app = XCUIApplication.ferni(.home)
        let avatar = ferni(app)
        XCTAssertTrue(avatar.waitForExistence(timeout: 20))
        // Ferni's slot on Home at rest is 200 pt (HomeView); the element's frame
        // follows the touch shape, so only its centre is used.
        let f = avatar.frame, side: CGFloat = 200
        let centre = CGPoint(x: f.midX, y: f.midY)
        // Beside Ferni, still inside his square: 24 pt outside his touch circle
        // (0.35 of the slot), clear of the area a fingertip covers.
        let corner = CGPoint(x: centre.x - 0.47 * side, y: centre.y)
        app.windows.firstMatch.coordinate(withNormalizedOffset: .zero)
            .withOffset(CGVector(dx: corner.x, dy: corner.y)).tap()
        sleep(1)
        XCTAssertEqual(touches(app), "0", "frame \(f) side \(side) tapped \(corner)")
    }

    /// In a call a tap on Ferni is the call's (interrupt while he speaks), never a touch.
    func testInACallTappingFerniIsNotATouch() {
        let app = XCUIApplication.ferni(.call)
        XCTAssertTrue(Screen.call.ready(in: app).waitForExistence(timeout: 20))
        let avatar = ferni(app)
        XCTAssertTrue(avatar.exists)
        avatar.tap()
        sleep(1)
        XCTAssertEqual(touches(app), "0")
        XCTAssertTrue(app.buttons["End call"].exists, "still in the call")
    }
}

private extension XCUIElement {
    func waitForValue(_ value: String, timeout: TimeInterval) -> Bool {
        let expectation = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", value), object: self)
        return XCTWaiter.wait(for: [expectation], timeout: timeout) == .completed
    }
}

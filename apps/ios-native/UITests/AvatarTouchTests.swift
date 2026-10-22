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
        XCTAssertEqual(app.descendants(matching: .any)["uitest.foley"].firstMatch.value as? String, "0", "Sounds are off")

        let talk = Screen.home.ready(in: app)
        talk.tap()
        XCTAssertTrue(app.buttons["Not now"].waitForExistence(timeout: 5), "Talk still works after touching Ferni")
    }

    private func notices(_ app: XCUIApplication) -> String {
        app.descendants(matching: .any)["uitest.notices"].firstMatch.value as? String ?? "missing"
    }

    /// Parity item 6: a finger held still on Ferni is noticed (he leans toward
    /// it), and is never also a tap. A quick tap after it is still a touch.
    func testAFingerHeldOnFerniIsNoticedNotTapped() {
        let app = XCUIApplication.ferni(.home)
        let avatar = ferni(app)
        XCTAssertTrue(avatar.waitForExistence(timeout: 20))
        XCTAssertEqual(notices(app), "0")
        avatar.press(forDuration: 1.4)
        XCTAssertTrue(app.descendants(matching: .any)["uitest.notices"].firstMatch
            .waitForValue("1", timeout: 3), "held still, he notices: \(notices(app))")
        XCTAssertEqual(touches(app), "0", "a hold isn't a tap")
        avatar.tap()
        XCTAssertTrue(app.descendants(matching: .any)["uitest.touches"].firstMatch
            .waitForValue("1", timeout: 3), "a tap still touches him: \(touches(app))")
        XCTAssertEqual(notices(app), "1", "a tap isn't a hold")
        avatar.press(forDuration: 1.4)
        XCTAssertTrue(app.descendants(matching: .any)["uitest.notices"].firstMatch
            .waitForValue("2", timeout: 3), "let go, then held again: noticed again: \(notices(app))")
        avatar.swipeUp()
        sleep(1)
        XCTAssertEqual(notices(app), "2", "a swipe isn't a hold")
        XCTAssertEqual(touches(app), "1", "or a tap")
    }

    /// The whole double-take path on the real app (parity item 5): Home goes
    /// to the background for 5 s, comes back, and Ferni starts (the snap back
    /// of his double take reaches the app as a cue).
    func testComingBackAfterAFewSecondsHeDoesADoubleTake() {
        let app = XCUIApplication.ferni(.home)
        XCTAssertTrue(ferni(app).waitForExistence(timeout: 20))
        let startles = app.descendants(matching: .any)["uitest.startles"].firstMatch
        XCTAssertEqual(startles.value as? String, "0")
        XCUIDevice.shared.press(.home)
        sleep(5)
        app.activate()
        XCTAssertTrue(startles.waitForValue("1", timeout: 5), "a double take: \(startles.value ?? "missing")")
    }

    /// Parity item 8: with Sounds on, a touch at rest makes a soft boop (a
    /// system sound the silent switch mutes); in a call it makes none.
    func testWithSoundsOnATouchBoops() {
        let app = XCUIApplication.ferni(.home, sounds: true)
        let avatar = ferni(app)
        XCTAssertTrue(avatar.waitForExistence(timeout: 20))
        let foley = app.descendants(matching: .any)["uitest.foley"].firstMatch
        XCTAssertEqual(foley.value as? String, "0")
        avatar.tap()
        XCTAssertTrue(foley.waitForValue("1", timeout: 3), "a boop: \(foley.value ?? "missing")")
    }

    /// Only Ferni takes a touch, not the empty space beside him.
    func testTheSpaceBesideFerniIsNotFerni() {
        let app = XCUIApplication.ferni(.home)
        let avatar = ferni(app)
        XCTAssertTrue(avatar.waitForExistence(timeout: 20))
        // His touch circle is 0.35 of his slot, and the element's frame follows
        // the circle. The slot depends on the room (HomeView.restSize: up to
        // 280 pt on a phone, 440 on iPad), so the circle is read from the frame
        // and held to 0.35 of the largest slot: a wider circle still fails here.
        let f = avatar.frame, radius = f.width / 2
        XCTAssertLessThanOrEqual(radius, 0.35 * (app.buttons["Hide Sidebar"].exists ? 440 : 280) + 0.5,
                                 "a touch circle wider than 0.35 of his slot: \(f)")
        let centre = CGPoint(x: f.midX, y: f.midY)
        // Beside Ferni, clear of the area a fingertip covers. A touch counts when
        // its area overlaps the circle, and fingertips reach farther on iPad:
        // measured on the simulators (2026-10-20), under 24 pt past the circle on
        // iPhone and 28-35 pt on iPad (a circle shrunk to 50 pt reached 75 pt but
        // not 85). So 24 pt past it on iPhone, inside his square, and 36 pt on
        // iPad.
        let iPad = app.buttons["Hide Sidebar"].exists
        let beside = CGPoint(x: centre.x - (radius + (iPad ? 36 : 24)), y: centre.y)
        app.windows.firstMatch.coordinate(withNormalizedOffset: .zero)
            .withOffset(CGVector(dx: beside.x, dy: beside.y)).tap()
        sleep(1)
        XCTAssertEqual(touches(app), "0", "frame \(f) tapped \(beside) iPad \(iPad)")
    }

    /// In a call a tap on Ferni is a touch and never cuts him off; a finger
    /// held on him while he talks interrupts him (Seth, 2026-10-22: a stray
    /// tap used to stop him mid-sentence).
    func testInACallATapIsATouchAndOnlyAHoldInterrupts() {
        let app = XCUIApplication.ferni(.call)
        XCTAssertTrue(Screen.call.ready(in: app).waitForExistence(timeout: 20))
        let avatar = ferni(app)
        XCTAssertTrue(avatar.waitForValue("Ferni is speaking", timeout: 10), "he's talking: \(avatar.value ?? "")")
        XCTAssertEqual(interrupts(app), "0")

        avatar.tap()
        sleep(1)
        XCTAssertEqual(interrupts(app), "0", "a tap doesn't interrupt")
        XCTAssertEqual(touches(app), "1", "a tap is a touch")

        avatar.press(forDuration: 0.8)
        XCTAssertTrue(app.descendants(matching: .any)["uitest.interrupts"].firstMatch
            .waitForValue("1", timeout: 5), "a hold interrupts: \(interrupts(app))")
        XCTAssertEqual(touches(app), "1", "and isn't a touch as well")
        XCTAssertTrue(app.buttons["End call"].exists, "still in the call")
    }

    private func interrupts(_ app: XCUIApplication) -> String {
        app.descendants(matching: .any)["uitest.interrupts"].firstMatch.value as? String ?? "missing"
    }
}

private extension XCUIElement {
    func waitForValue(_ value: String, timeout: TimeInterval) -> Bool {
        let expectation = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", value), object: self)
        return XCTWaiter.wait(for: [expectation], timeout: timeout) == .completed
    }
}

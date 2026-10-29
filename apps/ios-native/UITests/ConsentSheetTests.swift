import XCTest

/// Delight gap 3: consent is a sheet over the room, in Ferni's own voice, and
/// it stays until the person chooses (never swiped away, never pre-agreed).
@MainActor
final class ConsentSheetTests: XCTestCase {
    func testConsentStaysUntilYouChooseAndSpeaksAsFerni() {
        let app = XCUIApplication.ferni(.consent)
        let notNow = Screen.consent.ready(in: app)
        XCTAssertTrue(notNow.waitForExistence(timeout: 20))
        let words = app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'I keep notes from our talks'")).firstMatch
        XCTAssertTrue(words.exists, "the notes paragraph is in Ferni's voice")
        app.swipeDown(velocity: .fast)
        sleep(1)
        XCTAssertTrue(notNow.exists, "a swipe doesn't dismiss it")
        attachScreenshot("consent-sheet")
        notNow.tap()
        XCTAssertTrue(Screen.home.ready(in: app).waitForExistence(timeout: 5), "Not now goes back to the room")
    }
}

import XCTest

/// Design audit P2 #6: the memory list read like a database (third person,
/// grouped by type, Forget hidden in a swipe). It reads like a journal.
@MainActor
final class MemoryJournalUITests: XCTestCase {
    private func openMemories() throws -> XCUIApplication {
        try XCTSkipIf(UIDevice.current.userInterfaceIdiom == .pad, "iPad reaches it from the sidebar")
        let app = XCUIApplication()
        app.launchArguments = ["-FerniUITest", "settings", "-FerniStoreData", "YES", "-FerniSounds", "NO"]
        app.launch()
        let link = app.buttons["What Ferni remembers"].firstMatch
        XCTAssertTrue(link.waitForExistence(timeout: 20))
        for _ in 0..<3 where !link.isHittable { app.swipeUp() }
        link.tap()
        XCTAssertTrue(app.navigationBars["What Ferni remembers"].waitForExistence(timeout: 10))
        return app
    }

    func testItReadsLikeAJournal() throws {
        let app = try openMemories()
        let biscuit = app.staticTexts["You have a dog called Biscuit"]
        XCTAssertTrue(biscuit.waitForExistence(timeout: 10), "said to you, not \"Has a dog called Biscuit\"")
        XCTAssertTrue(app.staticTexts["Your sister Ana's birthday is Friday"].exists)
        XCTAssertFalse(app.staticTexts["Has a dog called Biscuit"].exists)
        // When, newest first; not the server's types.
        XCTAssertTrue(app.staticTexts["This week"].exists || app.staticTexts["THIS WEEK"].exists, "a This week section")
        for type in ["Things you're working on", "Things you like", "About you", "Your rhythms"] {
            XCTAssertFalse(app.staticTexts[type].exists || app.staticTexts[type.uppercased()].exists, "grouped by type: \(type)")
        }
        let walk = app.staticTexts["Walk before work, three mornings a week"]
        XCTAssertLessThan(walk.frame.minY, biscuit.frame.minY, "today's note above one from three days ago")
        // The visible Forget and the date line pass Apple's audit (contrast, size, labels).
        // Rows sliding under the floating search bar (or the home indicator)
        // fade into its edge effect; scrolled up they're read in full, so the
        // audit's verdicts there aren't this screen's. The search field's own
        // placeholder (an unnamed node: the finding goes when the search modifier
        // is removed) is the system's.
        let search = app.searchFields.firstMatch
        let edge = (search.exists ? search.frame.minY : app.frame.maxY) - 80
        try app.performAccessibilityAudit { issue in
            guard let element = issue.element else { return search.exists && issue.auditType == .contrast }
            return element.frame.maxY > edge
        }
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "shot-memory-journal"
        shot.lifetime = .keepAlways
        add(shot)
    }

    /// Forget is on the row, not in a swipe, and asks first.
    func testForgetIsInViewAndAsksFirst() throws {
        let app = try openMemories()
        let forget = app.buttons["Forget: You have a dog called Biscuit"]
        XCTAssertTrue(forget.waitForExistence(timeout: 10), "a Forget on the row")
        XCTAssertTrue(forget.isHittable, "in view, without a swipe")
        XCTAssertGreaterThanOrEqual(forget.frame.height, 44)
        forget.tap()
        let confirm = app.sheets.buttons["Forget"].exists ? app.sheets.buttons["Forget"] : app.buttons["Forget"].firstMatch
        XCTAssertTrue(confirm.waitForExistence(timeout: 5), "it asks first")
        XCTAssertTrue(app.staticTexts["You have a dog called Biscuit"].exists, "nothing forgotten before you say so")
        confirm.tap()
        let gone = NSPredicate(format: "exists == false")
        expectation(for: gone, evaluatedWith: app.staticTexts["You have a dog called Biscuit"])
        waitForExpectations(timeout: 5)
    }
}

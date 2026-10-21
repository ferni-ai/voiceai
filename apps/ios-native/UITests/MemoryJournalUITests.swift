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
        let link = app.memoryLink
        XCTAssertTrue(link.waitForExistence(timeout: 20))
        for _ in 0..<3 where !link.isHittable { app.swipeUp() }
        link.tap()
        XCTAssertTrue(app.navigationBars["What Ferni remembers"].waitForExistence(timeout: 10))
        return app
    }

    /// Scrolls the list until `element` is on screen: on an SE, with the search
    /// row and the people first, Biscuit is below the fold.
    private func scrollTo(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<5 where !(element.exists && element.isHittable) { app.collectionViews.firstMatch.swipeUp(velocity: .slow) }
    }

    func testItReadsLikeAJournal() throws {
        let app = try openMemories()
        let biscuit = app.staticTexts["You have a dog called Biscuit"]
        XCTAssertTrue(app.staticTexts["Your sister Ana's birthday is Friday"].waitForExistence(timeout: 10))
        scrollTo(biscuit, in: app)
        XCTAssertTrue(biscuit.exists, "said to you, not \"Has a dog called Biscuit\"")
        XCTAssertFalse(app.staticTexts["Has a dog called Biscuit"].exists)
        // When, newest first; not the server's types.
        XCTAssertTrue(app.staticTexts["This week"].exists || app.staticTexts["THIS WEEK"].exists, "a This week section")
        for type in ["Things you're working on", "Things you like", "About you", "Your rhythms"] {
            XCTAssertFalse(app.staticTexts[type].exists || app.staticTexts[type.uppercased()].exists, "grouped by type: \(type)")
        }
        let walk = app.staticTexts["Walk before work, three mornings a week"]
        XCTAssertLessThan(walk.frame.minY, biscuit.frame.minY, "today's note above one from three days ago")
        // Apple's audit of this screen is AccessibilityAuditTests.testMemoryJournal:
        // by day, at night and at AX5, through the same edge and floor rules as
        // every other screen. The handler here ignored every finding within 80 pt
        // of the floating search bar and every unnamed contrast finding (critic
        // H-C); the search is a row now, and that audit waves nothing of the kind.
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "shot-memory-journal"
        shot.lifetime = .keepAlways
        add(shot)
    }

    /// Award upgrade 7: one tap from Home, and the people in your life first,
    /// each under their own name, before the rest by week.
    func testFromHomeThePeopleComeFirst() throws {
        try XCTSkipIf(UIDevice.current.userInterfaceIdiom == .pad, "iPad reaches it from the sidebar")
        let app = XCUIApplication.ferni(.home, extra: ["-FerniStoreData", "YES"])
        let open = app.buttons["home.memory"]
        XCTAssertTrue(open.waitForExistence(timeout: 20), "What Ferni remembers on Home")
        XCTAssertEqual(open.label, "What Ferni remembers")
        XCTAssertGreaterThanOrEqual(open.frame.height, 43.5)
        open.tap()
        let sister = app.staticTexts["Your sister Ana's birthday is Friday"]
        XCTAssertTrue(sister.waitForExistence(timeout: 10))
        func header(_ text: String) -> XCUIElement {
            app.staticTexts.matching(NSPredicate(format: "label ==[c] %@", text)).firstMatch
        }
        XCTAssertTrue(header("Your mom").exists, "a section for your mom")
        XCTAssertTrue(header("Your sister").exists, "and your sister")
        XCTAssertLessThan(header("Your sister").frame.minY, header("Your mom").frame.minY,
                          "most recently learned first: Ana's birthday today, the knee two days ago")
        let week = header("This week")
        XCTAssertTrue(week.exists)
        XCTAssertLessThan(sister.frame.minY, week.frame.minY, "people before the weeks")
        attachScreenshot("memory-people-first")
        app.buttons["Done"].tap()
        XCTAssertTrue(open.waitForExistence(timeout: 5), "back on Home")
    }

    /// Forget is on the row, not in a swipe, and asks first.
    func testForgetIsInViewAndAsksFirst() throws {
        let app = try openMemories()
        let forget = app.buttons["Forget: You have a dog called Biscuit"]
        _ = app.staticTexts["Your sister Ana's birthday is Friday"].waitForExistence(timeout: 10)
        scrollTo(forget, in: app)
        XCTAssertTrue(forget.exists, "a Forget on the row")
        // On the row, not behind a swipe action. On an SE the floating search
        // bar covered it (critic M-D): there, but not hittable.
        XCTAssertTrue(forget.isHittable, "in view on the row")
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

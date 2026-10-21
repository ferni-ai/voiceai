import XCTest

/// Design audit P2 #7: when the notes couldn't load, the memory screen still
/// offered search over nothing; and its last words sat under the search bar.
@MainActor
final class MemoryEdgesUITests: XCTestCase {
    private func openMemories(storeData: Bool) throws -> XCUIApplication {
        try XCTSkipIf(UIDevice.current.userInterfaceIdiom == .pad, "iPad reaches it from the sidebar")
        let app = XCUIApplication()
        app.launchArguments = ["-FerniUITest", "settings", "-FerniSounds", "NO"] + (storeData ? ["-FerniStoreData", "YES"] : [])
        app.launch()
        let link = app.memoryLink
        XCTAssertTrue(link.waitForExistence(timeout: 20))
        for _ in 0..<3 where !link.isHittable { app.swipeUp() }
        link.tap()
        XCTAssertTrue(app.navigationBars["What Ferni remembers"].waitForExistence(timeout: 10))
        return app
    }

    func testNoSearchWhenThereAreNoNotesToSearch() throws {
        let app = try openMemories(storeData: false)
        XCTAssertTrue(app.buttons["Try again"].waitForExistence(timeout: 15), "the error state")
        XCTAssertFalse(app.textFields["memory.search"].exists, "search over nothing")
        attachScreenshot("memory-error")
    }

    /// Return in the search row searches (it wraps, so Return is caught, not typed).
    func testReturnSearches() throws {
        let app = try openMemories(storeData: true)
        let search = app.textFields["memory.search"]
        try XCTSkipUnless(search.waitForExistence(timeout: 10), "no on-device search on this simulator")
        search.tap()
        search.typeText("dog\n")
        let header = app.staticTexts.matching(NSPredicate(format: "label ==[c] %@", "From your notes")).firstMatch
        XCTAssertTrue(header.waitForExistence(timeout: 20), "the search ran")
        XCTAssertEqual(search.value as? String, "dog", "Return searched; it wasn't typed")
    }

    /// The search is a row at the top (critic M-D), and the last words still
    /// clear the screen's bottom edge.
    func testTheSearchIsOnTopAndTheLastWordsClearTheEdge() throws {
        let app = try openMemories(storeData: true)
        // The newest note, first on every phone (Biscuit is below the fold on an SE).
        let first = app.staticTexts["Your sister Ana's birthday is Friday"]
        XCTAssertTrue(first.waitForExistence(timeout: 10))
        let search = app.textFields["memory.search"]
        try XCTSkipUnless(search.exists, "no on-device search on this simulator")
        XCTAssertFalse(app.searchFields.firstMatch.exists, "no floating search bar")
        XCTAssertLessThan(search.frame.maxY, first.frame.minY, "above the notes")
        for _ in 0..<4 { app.swipeUp() }
        sleep(1)
        let footer = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH \"Ferni's team shares\"")).firstMatch
        XCTAssertTrue(footer.exists)
        // Whole on screen: on an SE (no home indicator) the list ends at the edge.
        XCTAssertLessThanOrEqual(footer.frame.maxY, app.frame.maxY + 0.5, "footer \(footer.frame) whole on screen")
        XCTAssertTrue(footer.isHittable, "not under anything")
        attachScreenshot("memory-bottom")
    }
}

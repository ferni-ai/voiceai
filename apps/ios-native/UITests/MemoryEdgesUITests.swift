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
        let link = app.buttons["What Ferni remembers"].firstMatch
        XCTAssertTrue(link.waitForExistence(timeout: 20))
        for _ in 0..<3 where !link.isHittable { app.swipeUp() }
        link.tap()
        XCTAssertTrue(app.navigationBars["What Ferni remembers"].waitForExistence(timeout: 10))
        return app
    }

    func testNoSearchWhenThereAreNoNotesToSearch() throws {
        let app = try openMemories(storeData: false)
        XCTAssertTrue(app.buttons["Try again"].waitForExistence(timeout: 15), "the error state")
        XCTAssertFalse(app.searchFields.firstMatch.exists, "search over nothing")
        attachScreenshot("memory-error")
    }

    func testTheLastWordsClearTheSearchBar() throws {
        let app = try openMemories(storeData: true)
        XCTAssertTrue(app.staticTexts["You have a dog called Biscuit"].waitForExistence(timeout: 10))
        let search = app.searchFields.firstMatch
        try XCTSkipUnless(search.exists, "no on-device search on this simulator")
        for _ in 0..<4 { app.swipeUp() }
        sleep(1)
        let footer = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH \"Ferni's team shares\"")).firstMatch
        XCTAssertTrue(footer.exists)
        XCTAssertLessThanOrEqual(footer.frame.maxY, search.frame.minY, "footer \(footer.frame) under the search bar \(search.frame)")
        attachScreenshot("memory-bottom")
    }
}

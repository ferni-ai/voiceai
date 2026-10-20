import XCTest

/// Award upgrade 2: a Home that's never half empty. At rest on a phone Ferni
/// is as big as the room allows (up to 280 pt; he was 200), with one thread
/// to pick up, and his words and the thread clear of Talk on the first screen.
@MainActor
final class HomeFullnessUITests: XCTestCase {
    func testFerniFillsTheRoomAndEverythingStillFits() throws {
        try XCTSkipIf(UIDevice.current.userInterfaceIdiom == .pad, "IPadHomeUITests covers iPad")
        let app = XCUIApplication()
        app.launchArguments = ["-FerniUITest", "home", "-FerniStoreData", "YES", "-FerniSounds", "NO"]
        app.launch()
        let ferni = app.descendants(matching: .any)["home.avatar"].firstMatch
        XCTAssertTrue(ferni.waitForExistence(timeout: 30))
        sleep(1)
        let talk = Screen.home.ready(in: app)
        let maya = app.buttons["team.maya"]
        XCTAssertTrue(maya.waitForExistence(timeout: 10))
        // One thread to pick up: Ferni's note, with a way to talk about it.
        let thread = app.buttons["Talk about this"]
        XCTAssertTrue(thread.waitForExistence(timeout: 10), "the thread card")
        XCTAssertTrue(app.staticTexts["How's the garden going?"].exists, "and the follow-up in the greeting")
        attachScreenshot("home-full")
        // Ferni's own shape is 0.7 of his slot: 140 pt at the old 200.
        XCTAssertGreaterThan(ferni.frame.width, 141, "Ferni is \(ferni.frame.width) pt")
        XCTAssertLessThanOrEqual(thread.frame.maxY, talk.frame.minY + 1, "the thread sits above Talk, not behind it")
        // Where the team row shows on the first screen, its names clear the fade over Talk.
        if maya.frame.maxY < talk.frame.minY {
            let name = app.staticTexts["Maya"].firstMatch
            XCTAssertLessThanOrEqual(name.frame.maxY, talk.frame.minY - 24, "Maya's name in the fade over Talk: \(name.frame) vs \(talk.frame)")
        }
        XCTAssertGreaterThanOrEqual(ferni.frame.minY, app.navigationBars.firstMatch.frame.maxY - 1, "and Ferni below the bar")

    }
}

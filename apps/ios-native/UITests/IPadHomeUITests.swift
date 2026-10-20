import XCTest

/// Design audit P1-14: on iPad Home was a phone column (Ferni 200 pt, ~65%
/// of the screen empty). Ferni is sized to the room and the team sits on a
/// shelf of bigger faces.
@MainActor
final class IPadHomeUITests: XCTestCase {
    func testFerniFillsTheRoomAndTheTeamHasAShelf() throws {
        try XCTSkipIf(UIDevice.current.userInterfaceIdiom != .pad, "iPad only")
        let app = XCUIApplication()
        app.launchArguments = ["-FerniUITest", "home", "-FerniStoreData", "YES", "-FerniSounds", "NO"]
        app.launch()
        let ferni = app.descendants(matching: .any)["home.avatar"].firstMatch
        XCTAssertTrue(ferni.waitForExistence(timeout: 30))
        // Ferni's own shape (0.7 of his slot; at the phone's 200 pt, 140).
        XCTAssertGreaterThanOrEqual(ferni.frame.width, 220, "Ferni is \(ferni.frame.width) pt")
        let maya = app.buttons["team.maya"]
        XCTAssertTrue(maya.waitForExistence(timeout: 10))
        XCTAssertGreaterThanOrEqual(maya.frame.width, 72, "a shelf face is \(maya.frame.width) pt")
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "shot-ipad-home"
        shot.lifetime = .keepAlways
        add(shot)
    }
}

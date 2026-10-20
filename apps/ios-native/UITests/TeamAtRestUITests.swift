import XCTest

/// Design audit P1-1/P1-2: at home, choosing a teammate seats them in the
/// middle (Ferni in the corner) and greets them; the team row says who's who.
@MainActor
final class TeamAtRestUITests: XCTestCase {
    func testChoosingMayaSeatsAndGreetsHer() {
        let app = XCUIApplication()
        app.launchArguments = ["-FerniUITest", "home", "-FerniStoreData", "YES", "-FerniSounds", "NO"]
        app.launch()
        let maya = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Maya'")).firstMatch
        XCTAssertTrue(maya.waitForExistence(timeout: 30), "Maya in the team row")
        for _ in 0..<4 where !maya.isHittable { app.swipeUp() }
        maya.tap()
        for _ in 0..<4 { app.swipeDown() }
        XCTAssertTrue(app.staticTexts["Maya's here."].waitForExistence(timeout: 5), "greeted on Home")
        XCTAssertTrue(app.otherElements["Maya"].waitForExistence(timeout: 5), "and in the middle")
        sleep(4)
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "shot-team-at-rest-maya"
        shot.lifetime = .keepAlways
        add(shot)
    }
}

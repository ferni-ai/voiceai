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

    /// Each face has its name under it (the button grows a line taller than
    /// the 44 pt face), and press and hold says who they are.
    func testTheTeamRowNamesEachTeammateAndPeeks() {
        let app = XCUIApplication()
        app.launchArguments = ["-FerniUITest", "home", "-FerniStoreData", "YES", "-FerniSounds", "NO"]
        app.launch()
        let maya = app.buttons["team.maya"]
        XCTAssertTrue(maya.waitForExistence(timeout: 30))
        for id in ["ferni", "maya", "peter", "alex", "jordan"] {
            let face = app.buttons["team.\(id)"]
            XCTAssertTrue(face.exists, id)
            XCTAssertGreaterThan(face.frame.height, 56, "\(id): a name under the face (\(face.frame.height) pt)")
        }
        for _ in 0..<4 where !maya.isHittable { app.swipeUp() }
        maya.press(forDuration: 1.2)
        XCTAssertTrue(app.buttons["Talk to Maya next"].waitForExistence(timeout: 5), "the peek's action")
        // The preview card (who she is, in Ferni's words) isn't in the
        // accessibility tree; the screenshot shows it.
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "shot-team-peek-maya"
        shot.lifetime = .keepAlways
        add(shot)
        app.buttons["Talk to Maya next"].tap()
        XCTAssertTrue(app.staticTexts["Maya's here."].waitForExistence(timeout: 5), "choosing from the peek")
    }
}

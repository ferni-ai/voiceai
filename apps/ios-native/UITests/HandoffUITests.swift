import XCTest

/// Design audit P1-3, on the real screens (the scripted handoff: Maya is
/// announced at 3 s, takes the call at 5.5 s, speaks at 6.5 s; the stage
/// swap ends about 2.15 s after she takes it).
@MainActor
final class HandoffUITests: XCTestCase {
    func testTheNameChangesWithTheStageAndHerWordsAreNamed() {
        let app = XCUIApplication()
        app.launchArguments = ["-FerniUITest", "handoff", "-FerniReduceMotion", "NO", "-FerniSounds", "NO"]
        app.launch()
        let chip = app.staticTexts["call.nameChip"]
        XCTAssertTrue(chip.waitForExistence(timeout: 20))
        XCTAssertTrue(chip.label.hasPrefix("Ferni"), chip.label)
        // Maya's first words: the stage is still swapping, so the name hasn't changed yet.
        let hers = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Maya: Hi!'")).firstMatch
        XCTAssertTrue(hers.waitForExistence(timeout: 15), "her words are named as hers")
        XCTAssertTrue(chip.label.hasPrefix("Ferni"), "the name waits for the swap: \(chip.label)")
        // Then it's hers.
        let maya = NSPredicate(format: "label BEGINSWITH 'Maya'")
        expectation(for: maya, evaluatedWith: chip)
        waitForExpectations(timeout: 5)
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "shot-handoff-maya"
        shot.lifetime = .keepAlways
        add(shot)
    }
}

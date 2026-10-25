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
        // Award upgrade 4: the captions say she came in.
        XCTAssertTrue(app.descendants(matching: .any)["captions.joined.maya"].waitForExistence(timeout: 15), "Maya joined")
        XCTAssertEqual(app.descendants(matching: .any)["captions.joined.maya"].label, "Maya joined")
        // Maya's first words: the chip is hers as they show (trust panel R5:
        // it said Ferni for ~2 s while she talked, waiting on the stage swap).
        let hers = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Maya: Hi!'")).firstMatch
        XCTAssertTrue(hers.waitForExistence(timeout: 15), "her words are named as hers")
        let maya = NSPredicate(format: "label BEGINSWITH 'Maya'")
        expectation(for: maya, evaluatedWith: chip)
        waitForExpectations(timeout: 0.5)
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "shot-handoff-maya"
        shot.lifetime = .keepAlways
        add(shot)
    }

    /// Trust panel T1: through the handoff the state line says Ferni's
    /// bringing in Maya, and never that anyone is listening.
    func testAHandoffIsNeverListening() {
        let app = XCUIApplication()
        app.launchArguments = ["-FerniUITest", "handoff", "-FerniReduceMotion", "NO", "-FerniSounds", "NO"]
        app.launch()
        XCTAssertTrue(app.staticTexts["call.nameChip"].waitForExistence(timeout: 20))
        let listening = app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'listening'")).firstMatch
        let bringing = app.staticTexts.matching(NSPredicate(format: "label == %@", "Ferni's bringing in Maya…")).firstMatch
        let hers = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Maya: Hi!'")).firstMatch
        var sawHandoff = false
        let deadline = Date.now.addingTimeInterval(20)
        while !hers.exists, Date.now < deadline {
            XCTAssertFalse(listening.exists, "nobody is listening in a handoff")
            if bringing.exists { sawHandoff = true }
        }
        XCTAssertTrue(hers.exists, "Maya spoke")
        XCTAssertTrue(sawHandoff, "the line said Ferni's bringing in Maya")
        XCTAssertFalse(listening.exists)
    }
}


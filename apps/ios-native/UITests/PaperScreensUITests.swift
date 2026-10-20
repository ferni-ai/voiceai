import XCTest

/// Design audit P1-13: Settings, Team, Memory and Help sat on the system's
/// grouped grey (#F2F2F7), so they read as system screens. They're on
/// Ferni's paper (#FAF8F5): warm, a little more red than blue, where the
/// grey is a little more blue than red.
@MainActor
final class PaperScreensUITests: XCTestCase {
    /// The colour of the margin beside the list's cards, half way down.
    private func margin(_ app: XCUIApplication) -> (r: Int, g: Int, b: Int) {
        let shot = app.screenshot()
        guard let cg = shot.image.cgImage else { return (0, 0, 0) }
        let w = cg.width, h = cg.height
        var bytes = [UInt8](repeating: 0, count: w * h * 4)
        let ctx = CGContext(data: &bytes, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                            space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
        let scale = Double(w) / app.frame.width
        let i = (Int(app.frame.height * 0.6 * scale) * w + Int(5 * scale)) * 4
        return (Int(bytes[i]), Int(bytes[i + 1]), Int(bytes[i + 2]))
    }

    /// Ferni's green just before the intro's words (a 44 pt Ferni).
    private func greenBeside(_ intro: XCUIElement, in app: XCUIApplication) -> Int {
        let shot = app.screenshot()
        guard let cg = shot.image.cgImage else { return 0 }
        let w = cg.width, h = cg.height
        var bytes = [UInt8](repeating: 0, count: w * h * 4)
        let ctx = CGContext(data: &bytes, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                            space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
        let scale = Double(w) / app.frame.width
        var green = 0
        for y in stride(from: intro.frame.midY - 22, through: intro.frame.midY + 22, by: 2) {
            // Ferni is just before the line's words.
            for x in stride(from: max(0, intro.frame.minX - 60), to: intro.frame.minX, by: 2) {
                let i = (Int(y * scale) * w + Int(x * scale)) * 4
                if Int(bytes[i + 1]) > Int(bytes[i]) + 15 { green += 1 }
            }
        }
        return green
    }

    private func assertIntro(_ app: XCUIApplication, _ screen: String, _ line: String) {
        // Earlier screens stay in the tree under a pushed one: this screen's line by its words.
        let intro = app.staticTexts.matching(identifier: "screen.intro").matching(NSPredicate(format: "label == %@", line)).firstMatch
        XCTAssertTrue(intro.waitForExistence(timeout: 5), "\(screen): an intro line")
        XCTAssertGreaterThan(greenBeside(intro, in: app), 40, "\(screen): a small Ferni beside it (line at \(intro.frame))")
    }

    private func assertPaper(_ app: XCUIApplication, _ screen: String) {
        sleep(1)
        let c = margin(app)
        XCTAssertGreaterThanOrEqual(c.r - c.b, 3, "\(screen) is on grey, not paper: rgb \(c)")
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "shot-paper-\(screen)"
        shot.lifetime = .keepAlways
        add(shot)
    }

    func testTheSettingsScreensAreOnPaper() throws {
        try XCTSkipIf(UIDevice.current.userInterfaceIdiom == .pad, "iPad reaches these from the sidebar")
        let app = XCUIApplication()
        app.launchArguments = ["-FerniUITest", "settings", "-FerniStoreData", "YES", "-FerniSounds", "NO"]
        app.launch()
        XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: 20))
        assertPaper(app, "settings")
        assertIntro(app, "settings", "Make me yours.")
        for (link, title, line) in [("Your team", "Team", "The people I work with."),
                                    ("What Ferni remembers", "What Ferni remembers", "Here's what I keep about you. Change anything."),
                                    ("Help", "Help", "You're not alone in this.")] {
            let row = app.buttons[link].firstMatch
            for _ in 0..<3 where !row.isHittable { app.swipeUp() }
            row.tap()
            XCTAssertTrue(app.navigationBars[title].waitForExistence(timeout: 10), title)
            assertPaper(app, title)
            assertIntro(app, title, line)
            let back = app.navigationBars[title].buttons["Settings"].exists
                ? app.navigationBars[title].buttons["Settings"] : app.navigationBars[title].buttons["Back"]
            back.tap()
            XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: 10))
        }
    }

    /// At AX3 the intro steps aside so the screen's own words get the room.
    func testAtAX3TheIntroStepsAside() throws {
        try XCTSkipIf(UIDevice.current.userInterfaceIdiom == .pad, "iPad reaches these from the sidebar")
        let app = XCUIApplication()
        app.launchArguments = ["-FerniUITest", "settings", "-FerniStoreData", "YES", "-FerniSounds", "NO",
                               "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXL"]
        app.launch()
        XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: 20))
        sleep(1)
        XCTAssertFalse(app.staticTexts["screen.intro"].exists, "no intro at AX3")
    }
}

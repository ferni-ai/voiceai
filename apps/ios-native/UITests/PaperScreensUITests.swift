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
        for (link, title) in [("Your team", "Team"), ("What Ferni remembers", "What Ferni remembers"), ("Help", "Help")] {
            let row = app.buttons[link].firstMatch
            for _ in 0..<3 where !row.isHittable { app.swipeUp() }
            row.tap()
            XCTAssertTrue(app.navigationBars[title].waitForExistence(timeout: 10), title)
            assertPaper(app, title)
            let back = app.navigationBars[title].buttons["Settings"].exists
                ? app.navigationBars[title].buttons["Settings"] : app.navigationBars[title].buttons["Back"]
            back.tap()
            XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: 10))
        }
    }
}

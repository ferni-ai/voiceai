import XCTest

/// Critic L4: Help reaches people outside the US too, and More can text 988
/// as well as call it.
@MainActor
final class HelpLinksUITests: XCTestCase {
    func testHelpHasAHelplineOutsideTheUS() {
        let app = XCUIApplication.ferni(.settings)
        XCTAssertTrue(Screen.settings.ready(in: app).waitForExistence(timeout: 20))
        app.buttons["Help"].tap()
        XCTAssertTrue(app.links["Find a helpline outside the US"].waitForExistence(timeout: 5)
                      || app.buttons["Find a helpline outside the US"].exists)
    }

    /// Critic L6: an account that can't be set up comes with a way to get help
    /// (the UI-test build has no account, so it's in exactly that state).
    func testAnAccountProblemComesWithHelp() {
        let app = XCUIApplication.ferni(.settings)
        XCTAssertTrue(Screen.settings.ready(in: app).waitForExistence(timeout: 20))
        let help = app.descendants(matching: .any)["Get help with your account"].firstMatch
        XCTAssertTrue(help.waitForExistence(timeout: 5))
    }

    /// The help link grows with the text size (the audit's "partially
    /// unsupported" on it at the default size is accepted on this evidence).
    func testAccountHelpGrowsWithTextSize() {
        func height(at size: TextSize) -> CGFloat {
            let app = XCUIApplication.ferni(.settings, size: size)
            XCTAssertTrue(Screen.settings.ready(in: app).waitForExistence(timeout: 20))
            let help = app.descendants(matching: .any)["Get help with your account"].firstMatch
            // At AX5 it's below the fold, and the List only builds what's on screen.
            for _ in 0..<4 where !help.waitForExistence(timeout: 2) { app.swipeUp() }
            XCTAssertTrue(help.exists, "\(size)")
            defer { app.terminate() }
            return help.frame.height
        }
        let standard = height(at: .standard), ax5 = height(at: .ax5)
        XCTAssertGreaterThan(ax5, standard * 1.5, "standard \(standard) pt, AX5 \(ax5) pt")
    }

    func testMoreCanTextOrCall988() {
        let app = XCUIApplication.ferni(.call)
        XCTAssertTrue(Screen.call.ready(in: app).waitForExistence(timeout: 20))
        app.buttons["More"].tap()
        let text = app.descendants(matching: .any)["Text 988"].firstMatch
        XCTAssertTrue(text.waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["Get help now (988)"].firstMatch.exists)
    }

    /// Design audit P1-7: on an SE, 988 was below the fold of More's half
    /// sheet. Help comes first, on the sheet's first screen, on every phone.
    func testMoreShows988FirstWithoutScrolling() {
        let app = XCUIApplication.ferni(.call)
        XCTAssertTrue(Screen.call.ready(in: app).waitForExistence(timeout: 20))
        app.buttons["More"].tap()
        let help = app.descendants(matching: .any)["Get help now (988)"].firstMatch
        let text = app.descendants(matching: .any)["Text 988"].firstMatch
        XCTAssertTrue(help.waitForExistence(timeout: 5))
        sleep(1)
        for (name, row) in [("call", help), ("text", text)] {
            XCTAssertTrue(row.isHittable, "988 \(name) is out of reach")
            XCTAssertLessThanOrEqual(row.frame.maxY, app.frame.maxY - 8, "988 \(name) is below the screen (\(row.frame))")
        }
        let captions = app.switches["Captions"].firstMatch
        if captions.exists { XCTAssertLessThan(help.frame.minY, captions.frame.minY, "help comes before the settings") }
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "shot-more-988"
        shot.lifetime = .keepAlways
        add(shot)
    }

    /// Design audit P2 #3: More was glass, and the call (Ferni, the captions,
    /// End) showed through it. On paper, the sheet between its sections is
    /// Ferni's paper, whatever is behind it.
    func testMoreIsOnPaperNotGlass() {
        let app = XCUIApplication.ferni(.call)
        XCTAssertTrue(Screen.call.ready(in: app).waitForExistence(timeout: 20))
        app.buttons["More"].tap()
        let footer = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH '988 is'")).firstMatch
        let captions = app.switches["Captions"].firstMatch
        XCTAssertTrue(footer.waitForExistence(timeout: 5) && captions.exists)
        sleep(1)
        guard let cg = app.screenshot().image.cgImage else { return XCTFail("no screenshot") }
        let w = cg.width, h = cg.height
        var bytes = [UInt8](repeating: 0, count: w * h * 4)
        let ctx = CGContext(data: &bytes, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                            space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
        let scale = Double(w) / app.frame.width
        // The gap between the help section's footer and the settings below, across the middle,
        // where Ferni's body sits behind the sheet.
        let y = (footer.frame.maxY + captions.frame.minY) / 2 - 14
        var worst = 0
        for x in stride(from: app.frame.width * 0.3, through: app.frame.width * 0.7, by: 8) {
            let i = (Int(y * scale) * w + Int(x * scale)) * 4
            let rgb = [Int(bytes[i]), Int(bytes[i + 1]), Int(bytes[i + 2])]
            worst = max(worst, abs(rgb[0] - 250), abs(rgb[1] - 248), abs(rgb[2] - 245))
        }
        XCTAssertLessThanOrEqual(worst, 6, "the call shows through the sheet (off paper by \(worst))")
    }

    // MARK: - Crisis mode (trust panel R16)

    private func crisisCall(modeOn: Bool) -> XCUIApplication {
        let app = XCUIApplication.ferni(.crisisDuringTool, extra: ["-ferni.call.crisisMode", modeOn ? "YES" : "NO", "-FerniStoreData", "YES"])
        XCTAssertTrue(Screen.crisisDuringTool.ready(in: app).waitForExistence(timeout: 20))
        return app
    }

    private func goodbye(_ app: XCUIApplication) -> String {
        app.descendants(matching: .any)["uitest.goodbye"].firstMatch.value as? String ?? "missing"
    }

    /// On: a tool starts, then the agent's crisis level. One tap to call or
    /// text 988 on the call screen itself, More never opened, no activity
    /// line; after End the row stays, with no "I'll remember" and no playful
    /// goodbye (its chime and heart).
    func testInACrisis988IsUpFrontWithoutOpeningMore() {
        let app = crisisCall(modeOn: true)
        let help = app.descendants(matching: .any)["call.helpNow"].firstMatch
        XCTAssertTrue(help.waitForExistence(timeout: 10), "no 988 row on the call screen")
        for name in ["Get help now (988)", "Text 988"] {
            let link = help.descendants(matching: .any)[name].firstMatch
            XCTAssertTrue(link.exists, name)
            XCTAssertTrue(link.isHittable, "\(name) is covered or off screen")
        }
        XCTAssertFalse(app.navigationBars["More"].exists, "More was never opened")
        // The activity line (R9) isn't built yet; when it is, it carries this id.
        XCTAssertFalse(app.descendants(matching: .any)["call.activity"].exists)
        attachScreenshot("crisis-call")

        app.buttons["End call"].tap()
        XCTAssertTrue(Screen.home.ready(in: app).waitForExistence(timeout: 10))
        XCTAssertTrue(help.waitForExistence(timeout: 5), "988 left with the call")
        sleep(5) // the goodbye would be over, and the remember card loaded
        XCTAssertTrue(help.exists, "988 stays on the screen after the call")
        XCTAssertFalse(app.staticTexts["I'll remember"].exists, "nothing from this call shown back")
        XCTAssertEqual(goodbye(app), "chime=0 heart=0")
        attachScreenshot("crisis-after")
    }

    /// Off (an explicit NO): the same call looks as every call does. No 988
    /// row, and after End the remember card and the usual goodbye.
    func testWithCrisisModeOffTheSameCallIsUnchanged() {
        let app = crisisCall(modeOn: false)
        sleep(4) // the crisis level arrives 2 s after Ferni joins
        XCTAssertFalse(app.descendants(matching: .any)["call.helpNow"].exists)
        app.buttons["End call"].tap()
        XCTAssertTrue(app.staticTexts["I'll remember"].waitForExistence(timeout: 30), "the remember card")
        XCTAssertFalse(app.descendants(matching: .any)["call.helpNow"].exists)
        for _ in 0..<10 where goodbye(app) != "chime=1 heart=1" { sleep(1) }
        XCTAssertEqual(goodbye(app), "chime=1 heart=1", "the usual goodbye")
    }
}

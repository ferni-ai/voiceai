import XCTest

/// Design audit P1-5: after a call, "Not quite" opened a one-line field that
/// didn't take the keyboard, and "Not quite" and "Forget" were 16 pt tall.
@MainActor
final class RememberEditUITests: XCTestCase {
    private func launch() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-FerniUITest", "remember", "-FerniStoreData", "YES", "-FerniSounds", "NO"]
        app.launch()
        XCTAssertTrue(app.staticTexts["I'll remember"].waitForExistence(timeout: 30), "the remember card")
        return app
    }

    /// Design audit P2 #8: one quiet way to change each thing, not two links
    /// under every line, and every one a full-size target.
    func testOneQuietChangePerThingAtFullSize() {
        let app = launch()
        let changes = app.buttons.matching(identifier: "remember.change")
        XCTAssertTrue(changes.firstMatch.waitForExistence(timeout: 5))
        XCTAssertEqual(changes.count, 3, "one per remembered thing")
        XCTAssertFalse(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Not quite'")).firstMatch.exists,
                       "no pairs of links until you ask")
        for i in 0..<changes.count {
            let change = changes.element(boundBy: i)
            // 44 pt, give or take snapping to the pixel grid.
            XCTAssertGreaterThanOrEqual(change.frame.height, 43.5, "\(change.label) is \(change.frame.height) pt tall")
            XCTAssertGreaterThanOrEqual(change.frame.width, 43.5, "\(change.label) is \(change.frame.width) pt wide")
        }
        let first = changes.firstMatch
        for _ in 0..<3 where !first.isHittable { app.swipeUp() }
        attachScreenshot("remember-card")
        first.tap()
        XCTAssertTrue(app.buttons["Not quite"].waitForExistence(timeout: 5), "Not quite in the menu")
        XCTAssertTrue(app.buttons["Forget"].exists, "and Forget")
    }

    /// Design audit P2 #8: your words are in ink, not grey.
    func testYourWordsAreInInk() {
        let app = launch()
        let line = app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'garden'")).firstMatch
        XCTAssertTrue(line.waitForExistence(timeout: 5))
        for _ in 0..<3 where !line.isHittable { app.swipeUp() }
        sleep(1)
        guard let cg = app.screenshot().image.cgImage else { return XCTFail("no screenshot") }
        let w = cg.width, h = cg.height
        var bytes = [UInt8](repeating: 0, count: w * h * 4)
        let ctx = CGContext(data: &bytes, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                            space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
        let scale = Double(w) / app.frame.width
        // The darkest the glyphs get: ink is near black, the secondary grey isn't.
        var darkest = 1.0
        let f = line.frame
        for y in stride(from: f.minY, to: f.maxY, by: 0.5) {
            for x in stride(from: f.minX, to: min(f.maxX, f.minX + 160), by: 0.5) {
                let i = (Int(y * scale) * w + Int(x * scale)) * 4
                darkest = min(darkest, (0.2126 * Double(bytes[i]) + 0.7152 * Double(bytes[i + 1]) + 0.0722 * Double(bytes[i + 2])) / 255)
            }
        }
        XCTAssertLessThan(darkest, 0.25, "the words' darkest luma \(darkest): grey, not ink")
    }

    func testNotQuiteOpensAWrappingFieldWithTheKeyboard() throws {
        let app = launch()
        let change = app.buttons.matching(identifier: "remember.change").firstMatch
        XCTAssertTrue(change.waitForExistence(timeout: 5))
        // Above the floating Talk button before tapping.
        for _ in 0..<3 where !change.isHittable { app.swipeUp() }
        change.tap()
        let notQuite = app.buttons["Not quite"]
        XCTAssertTrue(notQuite.waitForExistence(timeout: 5))
        notQuite.tap()
        let field = app.descendants(matching: .any)["remember.correction"]
        XCTAssertTrue(field.waitForExistence(timeout: 5), "the correction field")
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5), "the keyboard comes up without a second tap")
        XCTAssertEqual(field.value(forKey: "hasKeyboardFocus") as? Bool, true, "and the field has it")
        // Room for several lines (a line of body text is about 22 pt).
        XCTAssertGreaterThan(field.frame.height, 22 * 3, "a field for a sentence or two, not one line: \(field.frame.height) pt")
        field.typeText(" and she moved to Lisbon in the spring with her two cats, and she starts the new job at the bakery in June")
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "shot-remember-editing"
        shot.lifetime = .keepAlways
        add(shot)
        // Nothing floats over what you're writing or its Save, and the
        // keyboard leaves them in view.
        let save = app.buttons["Save"]
        XCTAssertTrue(save.exists)
        let keyboard = app.keyboards.firstMatch.frame
        XCTAssertLessThanOrEqual(field.frame.maxY, keyboard.minY + 1, "the keyboard covers the field")
        XCTAssertLessThanOrEqual(save.frame.maxY, keyboard.minY + 1, "the keyboard covers Save")
        let talk = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Talk'")).firstMatch
        if talk.exists {
            XCTAssertFalse(talk.frame.intersects(field.frame), "Talk covers the field")
            XCTAssertFalse(talk.frame.intersects(save.frame), "Talk covers Save")
        }
    }
}

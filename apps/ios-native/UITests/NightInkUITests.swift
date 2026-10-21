import XCTest

/// Award upgrade 3: Night Ink after 22:00. On a phone in light mode, Home is
/// the dark room from ten at night until five, unless Settings' "Dark at
/// night" is off.
@MainActor
final class NightInkUITests: XCTestCase {
    /// The room's mean luma in a band near the top, clear of Ferni and the words.
    private func roomLuma(_ app: XCUIApplication) -> Double {
        guard let cg = app.screenshot().image.cgImage else { return -1 }
        let w = cg.width, h = cg.height
        var bytes = [UInt8](repeating: 0, count: w * h * 4)
        let ctx = CGContext(data: &bytes, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                            space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
        var sum = 0.0, n = 0.0
        for y in stride(from: h / 10, to: h / 6, by: 4) {
            for x in stride(from: w / 20, to: w / 4, by: 4) {
                let i = (y * w + x) * 4
                sum += (0.2126 * Double(bytes[i]) + 0.7152 * Double(bytes[i + 1]) + 0.0722 * Double(bytes[i + 2])) / 255
                n += 1
            }
        }
        return sum / max(n, 1)
    }

    private func home(hour: Int, extra: [String] = []) -> Double {
        let app = XCUIApplication.ferni(.home, hour: hour, extra: extra)
        XCTAssertTrue(Screen.home.ready(in: app).waitForExistence(timeout: 20))
        sleep(1)
        attachScreenshot("home-\(hour)h\(extra.isEmpty ? "" : "-off")")
        let luma = roomLuma(app)
        app.terminate()
        return luma
    }

    func testTheRoomIsDarkFromTenUntilFive() {
        XCTAssertGreaterThan(home(hour: 21), 0.8, "9 pm: the paper room")
        XCTAssertLessThan(home(hour: 22), 0.2, "10 pm: Night Ink")
        XCTAssertLessThan(home(hour: 4), 0.2, "4 am: still Night Ink")
        XCTAssertGreaterThan(home(hour: 5), 0.8, "5 am: paper again")
    }

    /// Critic M-C: the first night it comes on, a note says so and where to
    /// change it, then goes by itself. (Every UI-test launch starts fresh, so
    /// only this test asks for it; NightInkTests pins "once".)
    func testTheFirstNightANoteSaysSo() {
        let app = XCUIApplication.ferni(.home, hour: 23, extra: ["-FerniNightNote", "YES"])
        let note = app.descendants(matching: .any)["nightInk.note"]
        XCTAssertTrue(note.waitForExistence(timeout: 20), "the note")
        XCTAssertTrue(note.label.contains("Settings"), "where to change it: \(note.label)")
        attachScreenshot("night-ink-note")
        let gone = NSPredicate(format: "exists == false")
        expectation(for: gone, evaluatedWith: note)
        waitForExpectations(timeout: 12)
        let day = XCUIApplication.ferni(.home, hour: 14, extra: ["-FerniNightNote", "YES"])
        XCTAssertTrue(Screen.home.ready(in: day).waitForExistence(timeout: 20))
        sleep(2)
        XCTAssertFalse(day.descendants(matching: .any)["nightInk.note"].exists, "not by day")
    }

    func testTurnedOffItStaysLight() {
        XCTAssertGreaterThan(home(hour: 23, extra: ["-ferni.nightInk", "NO"]), 0.8, "Dark at night off")
    }
}

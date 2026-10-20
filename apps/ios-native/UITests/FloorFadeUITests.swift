import XCTest

/// Design audit P1-4: after a call, the floating Talk button covered the team
/// row and the "I'll remember" card's actions. Scrolled to the end, nothing
/// you can press sits behind it.
@MainActor
final class FloorFadeUITests: XCTestCase {
    /// How uneven (0-1 luma) Talk's glass may be: with the fade 0.004 (one level,
    /// the dither), without its room above the button 0.0067, with no fade 0.012
    /// (iPhone 17 Pro, 2026-10-20).
    static let fadeTolerance = 0.0055

    /// The largest luma difference across Talk's glass, away from its label:
    /// each row against the same row near the button's left end. With the fade,
    /// the glass shows only the floor behind it; without, the team row showed
    /// through as darker circles (design audit P1-4).
    static func strayLuma(_ image: UIImage, behind talk: CGRect, in screen: CGRect) -> Double {
        guard let cg = image.cgImage else { return 1 }
        let scale = Double(cg.width) / screen.width
        let w = cg.width, h = cg.height
        var bytes = [UInt8](repeating: 0, count: w * h * 4)
        let ctx = CGContext(data: &bytes, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                            space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
        func luma(_ x: Double, _ y: Double) -> Double {
            let i = (Int(y * scale) * w + Int(x * scale)) * 4
            return (0.2126 * Double(bytes[i]) + 0.7152 * Double(bytes[i + 1]) + 0.0722 * Double(bytes[i + 2])) / 255
        }
        var worst = 0.0
        for y in stride(from: talk.minY + 6, through: talk.maxY - 6, by: 2) {
            let glass = luma(talk.minX + 24, y)
            for x in stride(from: talk.minX + 24, through: talk.maxX - 24, by: 2) where abs(x - talk.midX) > 80 {
                worst = max(worst, abs(luma(x, y) - glass))
            }
        }
        return worst
    }

    func testScrolledToTheEndNothingHidesBehindTalk() throws {
        try XCTSkipIf(UIDevice.current.userInterfaceIdiom == .pad, "iPad: the team is in the sidebar and Home fits the screen")
        let app = XCUIApplication()
        app.launchArguments = ["-FerniUITest", "remember", "-FerniStoreData", "YES", "-FerniSounds", "NO"]
        app.launch()
        let talk = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Talk'")).firstMatch
        XCTAssertTrue(talk.waitForExistence(timeout: 20))
        XCTAssertTrue(app.staticTexts["I'll remember"].waitForExistence(timeout: 30), "the remember card")
        // At rest, what's below the fold fades into the floor behind Talk: its glass
        // is even, with no team row showing through.
        let screenshot = app.screenshot()
        let rest = XCTAttachment(screenshot: screenshot)
        rest.name = "shot-remember-at-rest"
        rest.lifetime = .keepAlways
        add(rest)
        let worst = Self.strayLuma(screenshot.image, behind: talk.frame, in: app.frame)
        XCTAssertLessThan(worst, Self.fadeTolerance, "something shows through Talk's glass (luma off by \(worst))")
        for _ in 0..<4 { app.swipeUp() }
        let top = talk.frame.minY
        let pressable = app.buttons.allElementsBoundByIndex.filter {
            $0.exists && $0.frame.height > 0 && $0.label != talk.label
                && $0.frame.midY > top - 200 && $0.frame.midY < app.frame.maxY
        }
        XCTAssertFalse(pressable.isEmpty, "the team row and the card's actions are near the bottom")
        for button in pressable where button.frame.maxY > top {
            XCTFail("'\(button.label)' sits behind Talk (\(button.frame.maxY) > \(top))")
        }
    }
}

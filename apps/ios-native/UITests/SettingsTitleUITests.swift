import XCTest

/// Design audit P2 #10: scrolled, Settings' title sat on top of the black
/// Sign in with Apple button, which showed through the bar's soft edge.
@MainActor
final class SettingsTitleUITests: XCTestCase {
    /// At the default size the pinned intro (Ferni and "Make me yours.") is
    /// paper the list scrolls under; at AX3+ it steps aside and the bar is all
    /// there is.
    func testTheBarKeepsItsPaperWhenTheAppleButtonScrollsUnder() throws {
        try XCTSkipIf(UIDevice.current.userInterfaceIdiom == .pad, "iPad reaches Settings from the sidebar")
        // On a tall phone the list can end before the button reaches the bar;
        // the SE lane is where it does at every size.
        let checked = try [TextSize.standard, .ax5].filter { try scrollUnder($0) }
        try XCTSkipIf(checked.isEmpty, "the list never scrolls the button under the bar on this screen")
    }

    /// The mean luma of the screen in a band, beside where the title sits.
    private func luma(_ app: XCUIApplication, x: ClosedRange<CGFloat>, y: ClosedRange<CGFloat>) -> Double {
        guard let cg = app.screenshot().image.cgImage else { return -1 }
        let w = cg.width, h = cg.height
        var bytes = [UInt8](repeating: 0, count: w * h * 4)
        let ctx = CGContext(data: &bytes, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                            space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
        let scale = Double(w) / app.frame.width
        var sum = 0.0, n = 0.0
        for py in stride(from: y.lowerBound, through: y.upperBound, by: 1) {
            for px in stride(from: x.lowerBound, through: x.upperBound, by: 2) {
                let i = (Int(py * scale) * w + Int(px * scale)) * 4
                sum += (0.2126 * Double(bytes[i]) + 0.7152 * Double(bytes[i + 1]) + 0.0722 * Double(bytes[i + 2])) / 255
                n += 1
            }
        }
        return sum / max(n, 1)
    }

    /// Whether the button went under the bar at `size`: false only when the
    /// list ended first.
    private func scrollUnder(_ size: TextSize) throws -> Bool {
        let app = XCUIApplication.ferni(.settings, size: size, account: "anonymous")
        XCTAssertTrue(Screen.settings.ready(in: app).waitForExistence(timeout: 20))
        let bar = app.navigationBars["Settings"]
        let apple = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Apple'")).firstMatch
        // The list in 60 pt steps (shorter than the button), dragged on the
        // margin so no row takes the touch; each step with the button across the
        // bar, the bar is checked for the button's black.
        var seen = false, darkest = 1.0, ended = false, lastY: CGFloat?
        for _ in 0..<40 {
            if apple.exists {
                // The list stopped: the drag moved nothing.
                if let y = lastY, abs(apple.frame.minY - y) < 1 { ended = true; break }
                lastY = apple.frame.minY
                seen = true
                let f = apple.frame, b = bar.frame
                if f.minY < b.maxY - 6, f.maxY > b.minY + 6 {
                    let y = max(f.minY, b.minY) + 3...min(f.maxY, b.maxY) - 3
                    let first = darkest == 1.0
                    darkest = min(darkest, luma(app, x: f.minX + 30...f.minX + 100, y: y))
                    if first || darkest < 0.7 { attachScreenshot("settings-\(size)-button-under-bar") }
                }
                if f.maxY < b.minY { break }
            } else if seen {
                break
            }
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.03, dy: 0.7))
            start.press(forDuration: 0.05, thenDragTo: start.withOffset(CGVector(dx: 0, dy: -60)), withVelocity: 200, thenHoldForDuration: 0.3)
        }
        XCTAssertTrue(seen, "\(size): the Apple button")
        if ended && darkest == 1.0 { app.terminate(); return false }
        XCTAssertLessThan(darkest, 1.0, "\(size): never caught the button under the bar")
        XCTAssertGreaterThan(darkest, 0.7, "\(size): the button's black shows through the bar (mean luma \(darkest))")
        app.terminate()
        return true
    }
}

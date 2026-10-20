import XCTest

/// Design audit P2 #4: muted barely looked different. Muted, the button is an
/// ink circle with the glyph in paper.
@MainActor
final class MuteLookUITests: XCTestCase {
    private func centreLuma(_ button: XCUIElement, in app: XCUIApplication) -> Double {
        guard let cg = app.screenshot().image.cgImage else { return -1 }
        let w = cg.width, h = cg.height
        var bytes = [UInt8](repeating: 0, count: w * h * 4)
        let ctx = CGContext(data: &bytes, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                            space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
        let scale = Double(w) / app.frame.width
        // A ring inside the circle, off the glyph.
        var sum = 0.0, n = 0.0
        for a in stride(from: 0.0, to: 2 * .pi, by: .pi / 8) {
            let x = button.frame.midX + cos(a) * 22, y = button.frame.midY + sin(a) * 22
            let i = (Int(y * scale) * w + Int(x * scale)) * 4
            sum += (0.2126 * Double(bytes[i]) + 0.7152 * Double(bytes[i + 1]) + 0.0722 * Double(bytes[i + 2])) / 255
            n += 1
        }
        return sum / n
    }

    func testMutedIsPlainAtAGlance() {
        let app = XCUIApplication.ferni(.call)
        XCTAssertTrue(Screen.call.ready(in: app).waitForExistence(timeout: 20))
        let mute = app.buttons["Mute"]
        XCTAssertTrue(mute.waitForExistence(timeout: 5))
        sleep(1)
        let before = centreLuma(mute, in: app)
        mute.tap()
        let unmute = app.buttons["Unmute"]
        XCTAssertTrue(unmute.waitForExistence(timeout: 5))
        sleep(1)
        let after = centreLuma(unmute, in: app)
        attachScreenshot("call-muted")
        XCTAssertGreaterThan(before - after, 0.35, "muted \(after) against \(before): it has to read at a glance")
    }
}

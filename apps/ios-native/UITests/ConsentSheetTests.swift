import UIKit
import XCTest

/// Delight gap 3: consent is a sheet over the room on iPhone (the whole screen
/// on iPad), in Ferni's own voice, and it stays until the person chooses (never
/// swiped away, never pre-agreed).
@MainActor
final class ConsentSheetTests: XCTestCase {
    func testConsentStaysUntilYouChooseAndSpeaksAsFerni() {
        let app = XCUIApplication.ferni(.consent)
        let notNow = Screen.consent.ready(in: app)
        XCTAssertTrue(notNow.waitForExistence(timeout: 20))
        let words = app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'I keep notes from our talks'")).firstMatch
        XCTAssertTrue(words.exists, "the notes paragraph is in Ferni's voice")
        app.swipeDown(velocity: .fast)
        sleep(1)
        XCTAssertTrue(notNow.exists, "a swipe doesn't dismiss it")
        attachScreenshot("consent-sheet")
        notNow.tap()
        XCTAssertTrue(Screen.home.ready(in: app).waitForExistence(timeout: 5), "Not now goes back to the room")
    }

    /// The presentation itself, read from the screen's top edge. iPhone: a sheet,
    /// so the dimmed room shows above it. iPad: the whole screen (the form sheet
    /// failed the audit), so the top edge is consent's own colour.
    func testConsentIsASheetOnIPhoneAndTheWholeScreenOnIPad() {
        let app = XCUIApplication.ferni(.consent)
        XCTAssertTrue(Screen.consent.ready(in: app).waitForExistence(timeout: 20))
        sleep(1) // let the sheet finish rising
        let top = Self.topEdgeLuminance(XCUIScreen.main.screenshot().image)
        attachScreenshot("consent-presentation")
        if UIDevice.current.userInterfaceIdiom == .pad {
            XCTAssertGreaterThan(top, 0.9, "on iPad consent reaches the top of the screen")
        } else {
            XCTAssertLessThan(top, 0.8, "on iPhone the room shows above the consent sheet")
        }
    }

    /// iPad: the words and the buttons stay together, centred, in both
    /// orientations, instead of the buttons waiting at the bottom of the screen.
    func testOnIPadTheButtonsSitRightBelowTheWords() throws {
        guard UIDevice.current.userInterfaceIdiom == .pad else {
            throw XCTSkip("iPhone keeps the buttons at the bottom, in thumb reach")
        }
        for orientation in [UIDeviceOrientation.portrait, .landscapeLeft] {
            XCUIDevice.shared.orientation = orientation
            let app = XCUIApplication.ferni(.consent)
            XCTAssertTrue(Screen.consent.ready(in: app).waitForExistence(timeout: 20))
            sleep(1)
            let terms = app.descendants(matching: .any).matching(NSPredicate(format: "label == 'Terms'")).firstMatch
            let agree = app.buttons["I agree, let's talk"].firstMatch
            XCTAssertTrue(terms.exists && agree.exists)
            let gap = agree.frame.minY - terms.frame.maxY
            XCTAssertTrue((0..<80).contains(gap), "\(orientation.rawValue): \(gap) pt between Terms and the buttons")
            let notNow = Screen.consent.ready(in: app), height = app.windows.firstMatch.frame.height
            XCTAssertLessThan(notNow.frame.maxY / height, 0.85, "\(orientation.rawValue): the buttons aren't at the bottom")
            app.terminate()
        }
        XCUIDevice.shared.orientation = .portrait
    }

    /// Mean WCAG relative luminance of one pixel row a few points below the top
    /// edge, under the status bar's words: the room dimmed behind a sheet measures
    /// about 0.55, consent's background (#faf8f5) 0.94.
    nonisolated static func topEdgeLuminance(_ image: UIImage) -> Double {
        guard let cg = image.cgImage, let space = CGColorSpace(name: CGColorSpace.sRGB) else { return .nan }
        let width = cg.width, row = 12
        var px = [UInt8](repeating: 0, count: width * 4)
        let drawn: Bool = px.withUnsafeMutableBytes { buffer in
            guard let ctx = CGContext(data: buffer.baseAddress, width: width, height: 1, bitsPerComponent: 8,
                                      bytesPerRow: width * 4, space: space,
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            // CoreGraphics counts rows from the bottom: shift the image so `row` lands on the context's one row.
            ctx.draw(cg, in: CGRect(x: 0, y: -(cg.height - row - 1), width: width, height: cg.height))
            return true
        }
        guard drawn else { return .nan }
        func channel(_ v: UInt8) -> Double {
            let c = Double(v) / 255
            return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
        }
        let lums = stride(from: 0, to: px.count, by: 4).map {
            0.2126 * channel(px[$0]) + 0.7152 * channel(px[$0 + 1]) + 0.0722 * channel(px[$0 + 2])
        }
        return lums.reduce(0, +) / Double(lums.count)
    }
}

import XCTest

/// App Store screenshots (item 10): run on the 6.9", 6.3" and iPad 13"
/// simulators by scripts/store-screenshots.sh, which exports the attachments.
@MainActor
final class StoreScreenshotTests: XCTestCase {
    func testScreenshots() {
        for (n, screen) in [Screen.home, .call].enumerated() {
            let app = XCUIApplication.ferni(screen)
            XCTAssertTrue(screen.ready(in: app).waitForExistence(timeout: 20), "\(screen)")
            // Let the avatar's arrival settle before the picture.
            _ = app.wait(for: .runningForeground, timeout: 1)
            Thread.sleep(forTimeInterval: 3)
            attachScreenshot("\(n + 1)-\(screen)")
            app.terminate()
        }
    }
}

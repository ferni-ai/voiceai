import XCTest

/// Design audit P2 #17: at AX5 the iPad sidebar broke "Settings" across two
/// lines with a hyphen ("Set-tings"). Single words stay whole.
@MainActor
final class IPadSidebarUITests: XCTestCase {
    func testSidebarWordsStayWholeAtTheLargestSize() throws {
        try XCTSkipIf(UIDevice.current.userInterfaceIdiom != .pad, "iPad only")
        let app = XCUIApplication.ferni(.home, size: .ax5)
        let talk = app.staticTexts["Talk"].firstMatch
        XCTAssertTrue(talk.waitForExistence(timeout: 30))
        let settings = app.staticTexts["Settings"].firstMatch
        XCTAssertTrue(settings.exists)
        // One line each: as tall as "Talk", give or take, never two of its lines.
        for word in [settings, app.staticTexts["Team"].firstMatch] {
            XCTAssertLessThan(word.frame.height, talk.frame.height * 1.5,
                              "\(word.label) wraps: \(word.frame.height) pt against Talk's \(talk.frame.height)")
        }
        attachScreenshot("ipad-sidebar-ax5")
    }
}

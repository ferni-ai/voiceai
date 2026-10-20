import XCTest

/// Design audit P2 #2: Home sat in the top half, the bottom 40% empty. At
/// rest Ferni and his words sit in the room's middle.
@MainActor
final class HomeBalanceUITests: XCTestCase {
    func testHomeIsNotHalfEmpty() {
        let app = XCUIApplication.ferni(.home)
        let talk = Screen.home.ready(in: app)
        XCTAssertTrue(talk.waitForExistence(timeout: 20))
        sleep(1)
        let ferni = app.descendants(matching: .any)["home.avatar"].firstMatch
        let words = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Whenever' OR label BEGINSWITH 'How'")).firstMatch
        XCTAssertTrue(ferni.exists && words.exists)
        let top = app.navigationBars.firstMatch.frame.maxY, bottom = talk.frame.minY
        let above = ferni.frame.minY - top, below = bottom - words.frame.maxY
        attachScreenshot("home-balance")
        XCTAssertLessThan(below / (bottom - top), 0.35, "the bottom is \(Int(100 * below / (bottom - top)))% empty")
        XCTAssertLessThan(abs(above - below) / (bottom - top), 0.25, "space above \(above), below \(below)")
    }
}

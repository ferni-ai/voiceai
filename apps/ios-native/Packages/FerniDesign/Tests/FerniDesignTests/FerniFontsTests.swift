import UIKit
import XCTest
@testable import FerniDesign

final class FerniFontsTests: XCTestCase {
    /// Registration makes the brand's named weights real fonts, not the SF fallback.
    func testRegisteringGivesTheBrandDisplayWeights() throws {
        XCTAssertTrue(FerniFonts.register())
        XCTAssertTrue(FerniFonts.register(), "a second call is still fine")
        for name in [FerniFonts.displayName, FerniFonts.greetingName] {
            let font = try XCTUnwrap(UIFont(name: name, size: 34), name)
            XCTAssertEqual(font.fontName, name, "a named weight, not a fallback")
        }
        // ExtraBold (800) is visibly heavier than Bold (700): the variable axis works.
        let bold = try XCTUnwrap(UIFont(name: FerniFonts.greetingName, size: 34))
        let extra = try XCTUnwrap(UIFont(name: FerniFonts.displayName, size: 34))
        XCTAssertNotEqual(bold.fontName, extra.fontName)
    }

    /// The OFL requires the license to travel with the font.
    func testTheLicenseShipsWithTheFont() throws {
        let url = try XCTUnwrap(FerniFonts.licenseURL)
        let text = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(text.contains("SIL Open Font License, Version 1.1"))
    }

    private func size(_ attributes: [NSAttributedString.Key: Any]?) -> CGFloat {
        (attributes?[.font] as? UIFont)?.pointSize ?? 0
    }

    /// Critic L2: the titles were scaled once at launch. A text-size change
    /// re-sets them, on a bar already on screen too.
    @MainActor
    func testTitlesFollowATextSizeChange() throws {
        XCTAssertTrue(FerniFonts.useForNavigationTitles())
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 400, height: 800))
        let bar = UINavigationBar()
        window.addSubview(bar)
        FerniFonts.retitle(size: .large, windows: [window])
        XCTAssertEqual(size(bar.largeTitleTextAttributes), 34, accuracy: 0.5)
        XCTAssertEqual(size(bar.titleTextAttributes), 17, accuracy: 0.5)
        FerniFonts.retitle(size: .accessibilityExtraExtraExtraLarge, windows: [window])
        XCTAssertGreaterThan(size(bar.titleTextAttributes), 17 * 1.5, "the bar on screen grows")
        XCTAssertGreaterThan(size(bar.largeTitleTextAttributes), 34, "and its large title")
        XCTAssertEqual(size(UINavigationBar.appearance().titleTextAttributes), size(bar.titleTextAttributes),
                       "and bars made later")

        // The app's notification gets there by itself.
        NotificationCenter.default.post(name: UIContentSizeCategory.didChangeNotification, object: nil,
                                        userInfo: [UIContentSizeCategory.newValueUserInfoKey: UIContentSizeCategory.extraSmall])
        XCTAssertLessThan(size(UINavigationBar.appearance().titleTextAttributes), 17, "smaller after the change")
        FerniFonts.retitle(size: .large, windows: [])
    }
}

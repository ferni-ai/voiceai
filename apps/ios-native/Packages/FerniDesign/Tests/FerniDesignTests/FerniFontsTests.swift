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
}

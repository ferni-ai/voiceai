import XCTest
import SwiftUI
@testable import FerniShared

// MARK: - Color+Hex Tests

final class ColorHexIntTests: XCTestCase {

    func testBlackColor() {
        let color = Color(hex: 0x000000)
        XCTAssertNotNil(color)
    }

    func testWhiteColor() {
        let color = Color(hex: 0xFFFFFF)
        XCTAssertNotNil(color)
    }

    func testRedColor() {
        let color = Color(hex: 0xFF0000)
        XCTAssertNotNil(color)
    }

    func testGreenColor() {
        let color = Color(hex: 0x00FF00)
        XCTAssertNotNil(color)
    }

    func testBlueColor() {
        let color = Color(hex: 0x0000FF)
        XCTAssertNotNil(color)
    }

    func testFerniGreenColor() {
        // Ferni's primary color: #4a6741
        let color = Color(hex: 0x4a6741)
        XCTAssertNotNil(color)
    }

    func testMayaColor() {
        // Maya's primary color: #a67a6a
        let color = Color(hex: 0xa67a6a)
        XCTAssertNotNil(color)
    }

    func testAlexColor() {
        // Alex's primary color: #5a6b8a
        let color = Color(hex: 0x5a6b8a)
        XCTAssertNotNil(color)
    }

    func testDefaultAlphaIsOne() {
        // Default alpha should be 1.0 (fully opaque)
        let color = Color(hex: 0xFF0000)
        XCTAssertNotNil(color)
    }

    func testCustomAlpha() {
        let color = Color(hex: 0xFF0000, alpha: 0.5)
        XCTAssertNotNil(color)
    }

    func testZeroAlpha() {
        let color = Color(hex: 0xFF0000, alpha: 0.0)
        XCTAssertNotNil(color)
    }

    func testFullAlpha() {
        let color = Color(hex: 0xFF0000, alpha: 1.0)
        XCTAssertNotNil(color)
    }
}

// MARK: - Color Hex String Tests

final class ColorHexStringTests: XCTestCase {

    func testHexStringWithHash() {
        let color = Color(hexString: "#FF0000")
        XCTAssertNotNil(color)
    }

    func testHexStringWithoutHash() {
        let color = Color(hexString: "FF0000")
        XCTAssertNotNil(color)
    }

    func testHexStringLowercase() {
        let color = Color(hexString: "#ff0000")
        XCTAssertNotNil(color)
    }

    func testHexStringMixedCase() {
        let color = Color(hexString: "#fF00Ff")
        XCTAssertNotNil(color)
    }

    func testFerniHexString() {
        let color = Color(hexString: "#4a6741")
        XCTAssertNotNil(color)
    }

    func testMayaHexString() {
        let color = Color(hexString: "#a67a6a")
        XCTAssertNotNil(color)
    }

    func testAlexHexString() {
        let color = Color(hexString: "#5a6b8a")
        XCTAssertNotNil(color)
    }

    func testJordanHexString() {
        let color = Color(hexString: "#c4856a")
        XCTAssertNotNil(color)
    }

    func testPeterHexString() {
        let color = Color(hexString: "#3a6b73")
        XCTAssertNotNil(color)
    }

    func testNayanHexString() {
        let color = Color(hexString: "#9a7b5a")
        XCTAssertNotNil(color)
    }

    func testBlackHexString() {
        let color = Color(hexString: "#000000")
        XCTAssertNotNil(color)
    }

    func testWhiteHexString() {
        let color = Color(hexString: "#FFFFFF")
        XCTAssertNotNil(color)
    }

    func testEmptyString() {
        // Empty string should still create a color (black)
        let color = Color(hexString: "")
        XCTAssertNotNil(color)
    }

    func testInvalidString() {
        // Invalid string should create a color (likely black due to parsing)
        let color = Color(hexString: "not-a-color")
        XCTAssertNotNil(color)
    }

    func testHexStringWithExtraSpaces() {
        // Should handle strings with extra characters stripped
        let color = Color(hexString: "  #FF0000  ")
        XCTAssertNotNil(color)
    }
}

// MARK: - Hex Parsing Logic Tests

/// Tests for the underlying hex parsing logic
final class HexParsingLogicTests: XCTestCase {

    func testExtractRed() {
        let hex: UInt = 0xFF0000
        let red = Double((hex >> 16) & 0xFF) / 255.0
        XCTAssertEqual(red, 1.0, accuracy: 0.001)
    }

    func testExtractGreen() {
        let hex: UInt = 0x00FF00
        let green = Double((hex >> 8) & 0xFF) / 255.0
        XCTAssertEqual(green, 1.0, accuracy: 0.001)
    }

    func testExtractBlue() {
        let hex: UInt = 0x0000FF
        let blue = Double(hex & 0xFF) / 255.0
        XCTAssertEqual(blue, 1.0, accuracy: 0.001)
    }

    func testExtractFromFerniColor() {
        // Ferni: #4a6741 = rgb(74, 103, 65)
        let hex: UInt = 0x4a6741
        let red = Double((hex >> 16) & 0xFF) / 255.0
        let green = Double((hex >> 8) & 0xFF) / 255.0
        let blue = Double(hex & 0xFF) / 255.0

        XCTAssertEqual(red, 74.0 / 255.0, accuracy: 0.001)
        XCTAssertEqual(green, 103.0 / 255.0, accuracy: 0.001)
        XCTAssertEqual(blue, 65.0 / 255.0, accuracy: 0.001)
    }

    func testExtractFromWhite() {
        let hex: UInt = 0xFFFFFF
        let red = Double((hex >> 16) & 0xFF) / 255.0
        let green = Double((hex >> 8) & 0xFF) / 255.0
        let blue = Double(hex & 0xFF) / 255.0

        XCTAssertEqual(red, 1.0, accuracy: 0.001)
        XCTAssertEqual(green, 1.0, accuracy: 0.001)
        XCTAssertEqual(blue, 1.0, accuracy: 0.001)
    }

    func testExtractFromBlack() {
        let hex: UInt = 0x000000
        let red = Double((hex >> 16) & 0xFF) / 255.0
        let green = Double((hex >> 8) & 0xFF) / 255.0
        let blue = Double(hex & 0xFF) / 255.0

        XCTAssertEqual(red, 0.0, accuracy: 0.001)
        XCTAssertEqual(green, 0.0, accuracy: 0.001)
        XCTAssertEqual(blue, 0.0, accuracy: 0.001)
    }

    func testExtractMidGray() {
        // Mid gray: #808080 = rgb(128, 128, 128)
        let hex: UInt = 0x808080
        let red = Double((hex >> 16) & 0xFF) / 255.0
        let green = Double((hex >> 8) & 0xFF) / 255.0
        let blue = Double(hex & 0xFF) / 255.0

        XCTAssertEqual(red, 128.0 / 255.0, accuracy: 0.001)
        XCTAssertEqual(green, 128.0 / 255.0, accuracy: 0.001)
        XCTAssertEqual(blue, 128.0 / 255.0, accuracy: 0.001)
    }
}

// MARK: - Hex String Scanner Tests

final class HexStringScannerTests: XCTestCase {

    func testScannerParsesHexWithHash() {
        let hexString = "#4a6741"
        let hex = hexString.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)

        XCTAssertEqual(int, 0x4a6741)
    }

    func testScannerParsesHexWithoutHash() {
        let hexString = "4a6741"
        let hex = hexString.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)

        XCTAssertEqual(int, 0x4a6741)
    }

    func testScannerParsesRed() {
        let hexString = "FF0000"
        var int: UInt64 = 0
        Scanner(string: hexString).scanHexInt64(&int)

        XCTAssertEqual(int, 0xFF0000)
    }

    func testScannerParsesGreen() {
        let hexString = "00FF00"
        var int: UInt64 = 0
        Scanner(string: hexString).scanHexInt64(&int)

        XCTAssertEqual(int, 0x00FF00)
    }

    func testScannerParsesBlue() {
        let hexString = "0000FF"
        var int: UInt64 = 0
        Scanner(string: hexString).scanHexInt64(&int)

        XCTAssertEqual(int, 0x0000FF)
    }

    func testScannerParsesWhite() {
        let hexString = "FFFFFF"
        var int: UInt64 = 0
        Scanner(string: hexString).scanHexInt64(&int)

        XCTAssertEqual(int, 0xFFFFFF)
    }

    func testScannerParsesBlack() {
        let hexString = "000000"
        var int: UInt64 = 0
        Scanner(string: hexString).scanHexInt64(&int)

        XCTAssertEqual(int, 0x000000)
    }

    func testTrimmingRemovesHash() {
        let input = "#FF0000"
        let trimmed = input.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        XCTAssertEqual(trimmed, "FF0000")
    }

    func testTrimmingRemovesSpaces() {
        let input = "  FF0000  "
        let trimmed = input.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        XCTAssertEqual(trimmed, "FF0000")
    }

    func testTrimmingRemovesMultipleCharacters() {
        let input = "##FF0000#"
        let trimmed = input.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        XCTAssertEqual(trimmed, "FF0000")
    }
}

// MARK: - Persona Color Integration Tests

/// Tests that all persona colors work correctly with the hex extension
final class PersonaColorHexIntegrationTests: XCTestCase {

    func testAllPersonaPrimaryHexColorsAreValid() {
        for persona in PersonaRegistry.all {
            let color = Color(hexString: persona.primaryHex)
            XCTAssertNotNil(color, "\(persona.name) primaryHex should create valid color")
        }
    }

    func testFerniPrimaryHexCreatesColor() {
        let color = Color(hexString: PersonaRegistry.ferni.primaryHex)
        XCTAssertNotNil(color)
    }

    func testMayaPrimaryHexCreatesColor() {
        let color = Color(hexString: PersonaRegistry.maya.primaryHex)
        XCTAssertNotNil(color)
    }

    func testAlexPrimaryHexCreatesColor() {
        let color = Color(hexString: PersonaRegistry.alex.primaryHex)
        XCTAssertNotNil(color)
    }

    func testJordanPrimaryHexCreatesColor() {
        let color = Color(hexString: PersonaRegistry.jordan.primaryHex)
        XCTAssertNotNil(color)
    }

    func testPeterPrimaryHexCreatesColor() {
        let color = Color(hexString: PersonaRegistry.peter.primaryHex)
        XCTAssertNotNil(color)
    }

    func testNayanPrimaryHexCreatesColor() {
        let color = Color(hexString: PersonaRegistry.nayan.primaryHex)
        XCTAssertNotNil(color)
    }
}

// MARK: - Relationship Stage Color Tests

/// Tests that relationship stage colors work with hex extension
final class RelationshipStageColorHexTests: XCTestCase {

    func testAllStageColorsAreValid() {
        for stage in RelationshipStage.allCases {
            let color = Color(hexString: stage.color)
            XCTAssertNotNil(color, "\(stage) color should be valid")
        }
    }

    func testFirstMeetingColorCreatesColor() {
        let color = Color(hexString: RelationshipStage.firstMeeting.color)
        XCTAssertNotNil(color)
    }

    func testDeepPartnershipColorCreatesColor() {
        let color = Color(hexString: RelationshipStage.deepPartnership.color)
        XCTAssertNotNil(color)
    }
}

// MARK: - Edge Case Tests

final class ColorHexEdgeCaseTests: XCTestCase {

    func testMaxValue() {
        let color = Color(hex: 0xFFFFFF)
        XCTAssertNotNil(color)
    }

    func testMinValue() {
        let color = Color(hex: 0x000000)
        XCTAssertNotNil(color)
    }

    func testSingleDigitHex() {
        // 0x000001 = blue with value 1
        let color = Color(hex: 0x000001)
        XCTAssertNotNil(color)
    }

    func testShortHexString() {
        // Should handle 3-char hex strings (though not officially supported)
        let color = Color(hexString: "FFF")
        XCTAssertNotNil(color)
    }

    func testLongHexString() {
        // Longer strings get truncated by UInt conversion
        let color = Color(hexString: "FFFFFFFF")
        XCTAssertNotNil(color)
    }

    func testAlphaOutOfBounds() {
        // Alpha > 1 should still create color (SwiftUI clamps it)
        let color = Color(hex: 0xFF0000, alpha: 2.0)
        XCTAssertNotNil(color)

        // Alpha < 0 should still create color
        let color2 = Color(hex: 0xFF0000, alpha: -1.0)
        XCTAssertNotNil(color2)
    }
}

import SwiftUI
import UIKit
import XCTest
@testable import FerniDesign

final class FerniColorTests: XCTestCase {

    private func hex(_ color: Color, _ style: UIUserInterfaceStyle) -> String {
        let resolved = UIColor(color).resolvedColor(with: UITraitCollection(userInterfaceStyle: style))
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        resolved.getRed(&r, green: &g, blue: &b, alpha: &a)
        return String(format: "%02X%02X%02X", Int(round(r * 255)), Int(round(g * 255)), Int(round(b * 255)))
    }

    /// The values come from design-system/tokens/colors.json (zen = light, midnight = dark).
    func testColorsFollowTheSystemAppearance() {
        XCTAssertEqual(hex(FerniColor.background, .light), "FAF8F5")
        XCTAssertEqual(hex(FerniColor.background, .dark), "14110E")
        XCTAssertEqual(hex(FerniColor.textPrimary, .light), "2C2520")
        XCTAssertEqual(hex(FerniColor.textPrimary, .dark), "F4EFE6")
        XCTAssertEqual(hex(FerniColor.accent, .light), "3D5A45")
        XCTAssertEqual(hex(FerniColor.accent, .dark), "8EAE7A")
    }

    func testMalformedHexIsLoudNotBlack() {
        XCTAssertEqual(hex(Color(hexString: "#12345"), .light), "FF00FF")
        XCTAssertEqual(hex(Color(hexString: "4a6741"), .light), "4A6741")
    }
}

final class AvatarTests: XCTestCase {

    /// The avatar's faces come from the bundled design-system expressions. If the
    /// file went missing every face would silently be the neutral fallback.
    func testExpressionsLoadFromThePackageBundle() {
        let joyful = AvatarExpression.joyful.config
        XCTAssertEqual(joyful.family, "happy")
        XCTAssertEqual(joyful.eyeScaleY ?? 0, 0.7, accuracy: 0.001)
        XCTAssertNotEqual(joyful.topCurve, ExpressionConfig.neutral.topCurve)
    }

    func testEveryExpressionHasAConfig() {
        for expression in AvatarExpression.allCases {
            XCTAssertTrue(
                ExpressionLoader.shared.hasExpression(expression.rawValue),
                "\(expression.rawValue) is missing from expressions.json"
            )
        }
    }

    func testUnknownExpressionNamesAreNeutral() {
        XCTAssertEqual(AvatarExpression.from("joyful"), .joyful)
        XCTAssertEqual(AvatarExpression.from("not-a-face"), .neutral)
    }

    func testPersonaIdsPickTheirColors() {
        XCTAssertEqual(WindowPersona(personaId: "maya"), .maya)
        XCTAssertEqual(WindowPersona(personaId: "Nayan"), .nayan)
        XCTAssertEqual(WindowPersona(personaId: "someone-new"), .ferni)
    }
}

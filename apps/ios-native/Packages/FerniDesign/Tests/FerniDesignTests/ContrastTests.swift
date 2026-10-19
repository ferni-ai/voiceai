import SwiftUI
import UIKit
import XCTest
@testable import FerniDesign

/// Critic M10: what's written on the call's tinted buttons reads in both
/// themes (WCAG AA, 4.5:1). White on the dark theme's sage was about 2.3:1.
final class ContrastTests: XCTestCase {
    private func luminance(_ color: Color, _ style: UIUserInterfaceStyle) -> Double {
        let c = UIColor(color).resolvedColor(with: UITraitCollection(userInterfaceStyle: style))
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        c.getRed(&r, green: &g, blue: &b, alpha: &a)
        func lin(_ v: CGFloat) -> Double { let v = Double(v); return v <= 0.03928 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4) }
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    }

    private func ratio(_ a: Color, _ b: Color, _ style: UIUserInterfaceStyle) -> Double {
        let (x, y) = (luminance(a, style), luminance(b, style))
        return (max(x, y) + 0.05) / (min(x, y) + 0.05)
    }

    func testTextOnTheCallButtonsReadsInBothThemes() {
        for style in [UIUserInterfaceStyle.light, .dark] {
            XCTAssertGreaterThanOrEqual(ratio(FerniColor.onAccent, FerniColor.accent, style), 4.5, "Talk, \(style.rawValue)")
            XCTAssertGreaterThanOrEqual(ratio(FerniColor.onError, FerniColor.error, style), 4.5, "End, \(style.rawValue)")
        }
    }

    /// The old choice, for the record: white on the dark sage doesn't read.
    func testWhiteOnTheDarkSageWasTheBug() {
        XCTAssertLessThan(ratio(.white, FerniColor.accent, .dark), 4.5)
    }
}

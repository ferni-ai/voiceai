import SwiftUI
import UIKit
import XCTest
@testable import FerniDesign

/// Design audit P2 #15: in the Dynamic Island Ferni was dark green on black,
/// about 3.3:1. On black, every teammate's face now reads at 4.5:1 or more
/// (its body's mean luminance against black), as the island draws it.
@MainActor
final class IslandPortraitTests: XCTestCase {
    /// Relative luminance of the face's body (its opaque, non-white middle) on black.
    static func bodyContrast(_ view: some View, side: CGFloat = 64) throws -> Double {
        let renderer = ImageRenderer(content: ZStack { Color.black; view }.frame(width: side, height: side))
        renderer.scale = 3
        let cg = try XCTUnwrap(renderer.cgImage)
        let w = cg.width, h = cg.height
        var px = [UInt8](repeating: 0, count: w * h * 4)
        let ctx = try XCTUnwrap(CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                                          space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
        func ch(_ v: UInt8) -> Double { let v = Double(v) / 255; return v <= 0.04045 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4) }
        var sum = 0.0, n = 0.0
        for y in Int(Double(h) * 0.2)..<Int(Double(h) * 0.8) {
            for x in Int(Double(w) * 0.2)..<Int(Double(w) * 0.8) {
                let i = (y * w + x) * 4
                let l = 0.2126 * ch(px[i]) + 0.7152 * ch(px[i + 1]) + 0.0722 * ch(px[i + 2])
                guard l > 0.005, l < 0.6 else { continue } // the body: not the black around it, not the eyes
                sum += l; n += 1
            }
        }
        return (sum / max(n, 1) + 0.05) / 0.05
    }

    func testEveryFaceReadsOnTheIslandsBlack() throws {
        for persona in WindowPersona.allCases {
            for scheme in [ColorScheme.light, .dark] {
                let island = AvatarPortrait(persona: persona, onBlack: true).environment(\.colorScheme, scheme)
                let contrast = try Self.bodyContrast(island)
                XCTAssertGreaterThanOrEqual(contrast, 4.5, "\(persona) on the island, \(scheme): \(contrast):1")
            }
        }
    }

    /// The finding, measured the same way: the dark-room portrait on black.
    func testTheDarkPortraitWasTheProblem() throws {
        let before = try Self.bodyContrast(AvatarPortrait(persona: .ferni).environment(\.colorScheme, .dark))
        XCTAssertLessThan(before, 4.0, "Ferni's dark portrait on black: \(before):1")
    }
}

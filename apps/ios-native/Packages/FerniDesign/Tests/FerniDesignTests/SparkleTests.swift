import SwiftUI
import UIKit
import XCTest
@testable import FerniDesign

/// Expression audit P1 #3: the sparkles were cream #FFF2C7 on the light room
/// (#FAF8F5), 1.1:1, so a happy Ferni sparkled with nothing anyone could see.
/// They're the web's gold now, with its glow.
@MainActor
final class SparkleTests: XCTestCase {
    static func luminance(_ rgb: UInt32) -> Double {
        func lin(_ v: UInt32) -> Double { let c = Double(v) / 255; return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4) }
        return 0.2126 * lin((rgb >> 16) & 0xFF) + 0.7152 * lin((rgb >> 8) & 0xFF) + 0.0722 * lin(rgb & 0xFF)
    }

    static func contrast(_ a: UInt32, _ b: UInt32) -> Double {
        let la = luminance(a), lb = luminance(b)
        return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
    }

    /// A graphic needs 3:1 against what's behind it (WCAG 1.4.11), in both rooms.
    func testASparkleShowsOnBothRooms() {
        XCTAssertGreaterThanOrEqual(Self.contrast(AliveParticles.sparkleCore.light, 0xFAF8F5), 3, "light room")
        XCTAssertGreaterThanOrEqual(Self.contrast(AliveParticles.sparkleCore.dark, 0x14110E), 3, "dark room")
        XCTAssertLessThan(Self.contrast(0xFFF2C7, 0xFAF8F5), 1.2, "the old cream, for the record")
    }

    func testTheGlowIsTheWebsGold() {
        XCTAssertEqual(AliveParticles.sparkleGlow.light, 0xB8956A)
    }

    /// Drawn, on the light room: the middle of a sparkle is the gold core.
    func testASparkleIsDrawnInGold() throws {
        let sparkle = AliveRig.Particle(kind: .sparkle, x: 0, y: 0, size: 0.2, alpha: 1)
        let view = AliveParticles(particles: [sparkle], centre: CGPoint(x: 50, y: 50), radius: 100)
            .frame(width: 100, height: 100)
            .background(Color(red: 0.98, green: 0.973, blue: 0.961))
            .environment(\.colorScheme, .light)
        let renderer = ImageRenderer(content: view)
        renderer.scale = 1
        let image = try XCTUnwrap(renderer.uiImage?.cgImage)
        let ctx = try XCTUnwrap(CGContext(data: nil, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                                          space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        ctx.draw(image, in: CGRect(x: -50, y: -49, width: 100, height: 100))
        let px = try XCTUnwrap(ctx.data?.assumingMemoryBound(to: UInt8.self))
        let rgb = UInt32(px[0]) << 16 | UInt32(px[1]) << 8 | UInt32(px[2])
        XCTAssertGreaterThanOrEqual(Self.contrast(rgb, 0xFAF8F5), 3, String(format: "the sparkle's middle is #%06X", rgb))
    }
}

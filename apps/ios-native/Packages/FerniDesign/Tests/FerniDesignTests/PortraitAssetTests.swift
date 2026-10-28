import CoreGraphics
import ImageIO
import simd
import UIKit
import UniformTypeIdentifiers
import XCTest
@testable import FerniDesign

/// The bundled teammate portraits: one per persona and theme, each in its own
/// brand colour.
///
/// To regenerate after a shader or token change, run this suite with
/// FERNI_RENDER_PORTRAITS=1 (xcodebuild: TEST_RUNNER_FERNI_RENDER_PORTRAITS=1);
/// it writes the PNGs into Sources/FerniDesign/Resources.
final class PortraitAssetTests: XCTestCase {
    static let resources = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        .appending(path: "../../Sources/FerniDesign/Resources").standardized

    func testRegenerateWhenAsked() throws {
        guard ProcessInfo.processInfo.environment["FERNI_RENDER_PORTRAITS"] == "1" else {
            throw XCTSkip("set FERNI_RENDER_PORTRAITS=1 to regenerate")
        }
        let renderer = try XCTUnwrap(AliveRenderer.shared)
        let n = AlivePortraits.pixels
        for persona in WindowPersona.allCases {
            for dark in [false, true] {
                let bytes = try XCTUnwrap(renderer.image(AlivePortraits.uniforms(for: persona, dark: dark), width: n, height: n))
                let url = Self.resources.appending(path: AlivePortraits.name(persona, dark: dark) + ".png")
                try XCTUnwrap(Self.png(bytes, size: n)).write(to: url)
            }
        }
    }

    /// Every teammate has both portraits, each in its own brand hue (lit, so
    /// lighter or darker, never grey), and no two look alike.
    func testEveryTeammateHasPortraitsInItsOwnColour() throws {
        for dark in [false, true] {
            var seen: [(WindowPersona, SIMD3<Float>)] = []
            for persona in WindowPersona.allCases {
                let image = try XCTUnwrap(AlivePortraits.image(persona, dark: dark), "\(persona) \(dark)")
                XCTAssertEqual(image.size.width * image.scale, CGFloat(AlivePortraits.pixels), accuracy: 1)
                let body = try XCTUnwrap(Self.pixel(image, x: 0.5, y: 0.72), "lower body")
                XCTAssertEqual(body.a, 1, accuracy: 0.02)
                let (hue, saturation) = Self.hueSaturation(body.rgb)
                let brand = Self.hueSaturation(Self.srgb(AliveRig.colours(persona).body))
                let apart = abs(hue - brand.hue), wrapped = min(apart, 360 - apart)
                XCTAssertLessThan(wrapped, 16, "\(persona) \(dark ? "dark" : "light") keeps its brand hue")
                XCTAssertGreaterThan(saturation, 0.2, "\(persona) is in colour, not grey")
                for (other, rgb) in seen {
                    XCTAssertGreaterThan(simd_distance(rgb, body.rgb), 0.06, "\(persona) and \(other) look alike")
                }
                seen.append((persona, body.rgb))
                XCTAssertLessThan(try XCTUnwrap(Self.pixel(image, x: 0.02, y: 0.02)).a, 0.05, "see-through corners")
            }
        }
    }

    static func hueSaturation(_ c: SIMD3<Float>) -> (hue: Float, saturation: Float) {
        let hi = c.max(), lo = c.min(), d = hi - lo
        guard d > 0 else { return (0, 0) }
        var h: Float = hi == c.x ? (c.y - c.z) / d : hi == c.y ? 2 + (c.z - c.x) / d : 4 + (c.x - c.y) / d
        h *= 60
        if h < 0 { h += 360 }
        return (h, d / hi)
    }

    // MARK: Helpers

    static func srgb(_ linear: SIMD3<Float>) -> SIMD3<Float> {
        simd_max(linear, .zero).applying { c in
            c <= 0.0031308 ? c * 12.92 : 1.055 * pow(c, 1 / 2.4) - 0.055
        }
    }

    static func png(_ bytes: [UInt8], size: Int) -> Data? {
        let info = CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)
        guard let provider = CGDataProvider(data: Data(bytes) as CFData),
              let image = CGImage(width: size, height: size, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: size * 4,
                                  space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: info, provider: provider,
                                  decode: nil, shouldInterpolate: false, intent: .defaultIntent) else { return nil }
        let data = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil) else { return nil }
        CGImageDestinationAddImage(dest, image, nil)
        return CGImageDestinationFinalize(dest) ? data as Data : nil
    }

    /// One pixel, unpremultiplied, at fractional coordinates from the top left.
    static func pixel(_ image: UIImage, x: CGFloat, y: CGFloat) -> (rgb: SIMD3<Float>, a: Float)? {
        guard let cg = image.cgImage else { return nil }
        var px = [UInt8](repeating: 0, count: 4)
        let info = CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue)
        guard let ctx = CGContext(data: &px, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                                  space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: info.rawValue) else { return nil }
        let w = CGFloat(cg.width), h = CGFloat(cg.height)
        ctx.draw(cg, in: CGRect(x: -(x * w).rounded(.down), y: -(h - 1 - (y * h).rounded(.down)), width: w, height: h))
        let a = Float(px[3]) / 255
        guard a > 0 else { return (.zero, 0) }
        return (SIMD3(Float(px[0]), Float(px[1]), Float(px[2])) / 255 / a, a)
    }
}

private extension SIMD3 where Scalar == Float {
    func applying(_ f: (Float) -> Float) -> SIMD3<Float> { SIMD3(f(x), f(y), f(z)) }
}

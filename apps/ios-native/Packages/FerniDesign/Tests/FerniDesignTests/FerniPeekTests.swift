import SwiftUI
import XCTest
@testable import FerniDesign

/// The widget's Ferni, rendered: peeking up from the bottom edge in full
/// colour, and eyes on a plain body in tinted and clear modes.
@MainActor
final class FerniPeekTests: XCTestCase {
    private func render(accented: Bool) throws -> (CGImage, [UInt8]) {
        let renderer = ImageRenderer(content: FerniPeek(accented: accented, dark: false).frame(width: 160, height: 160))
        renderer.scale = 1
        let image = try XCTUnwrap(renderer.cgImage)
        var px = [UInt8](repeating: 0, count: 160 * 160 * 4)
        let ctx = try XCTUnwrap(CGContext(data: &px, width: 160, height: 160, bitsPerComponent: 8, bytesPerRow: 640,
                                          space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: 160, height: 160))
        if let dir = ProcessInfo.processInfo.environment["FERNI_SNAPSHOT_DIR"] {
            let url = URL(fileURLWithPath: dir).appending(path: "widget-peek-\(accented ? "accented" : "full").png")
            try? UIImage(cgImage: image).pngData()?.write(to: url)
        }
        return (image, px)
    }

    /// RGBA at (x, y) from the top left.
    private func px(_ data: [UInt8], _ x: Int, _ y: Int) -> (r: Int, g: Int, b: Int, a: Int) {
        let i = (y * 160 + x) * 4 // a bitmap context's memory starts with the top row
        return (Int(data[i]), Int(data[i + 1]), Int(data[i + 2]), Int(data[i + 3]))
    }

    func testFerniPeeksUpFromTheBottomEdge() throws {
        let (_, data) = try render(accented: false)
        XCTAssertEqual(px(data, 80, 6).a, 0, "the top is empty: Ferni is below")
        let low = px(data, 80, 150)
        XCTAssertGreaterThan(low.a, 250, "Ferni reaches the bottom edge")
        XCTAssertGreaterThan(low.g, low.r, "in Ferni green")
    }

    func testTintedModesDrawTheEyesAsTheAccent() throws {
        let (_, data) = try render(accented: true)
        let white = (0..<160).flatMap { x in (0..<160).map { (x, $0) } }
            .filter { px(data, $0.0, $0.1).a > 200 && px(data, $0.0, $0.1).r > 200 }.count
        XCTAssertGreaterThan(white, 300, "two solid eyes")
    }
}

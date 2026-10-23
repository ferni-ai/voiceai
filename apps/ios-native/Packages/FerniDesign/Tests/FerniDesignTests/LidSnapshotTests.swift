import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
import XCTest
@testable import FerniDesign

/// For review, not a check: the faces with lid caps, Ferni and Maya, on the
/// page as the app shows it, light and dark (Seth, 2026-10-22: "where are the
/// white caps?"). Writes avatar-lids-white-light.png and avatar-lids-white-dark.png to
/// FERNI_SNAPSHOT_DIR; skipped without it.
final class LidSnapshotTests: XCTestCase {
    static let faces = ["neutral", "happy", "sleepy", "drowsy", "exhausted", "joyful", "winking"]
    static let cell = 240, radius: Float = 70

    func testRenderTheLidsForReview() throws {
        guard let dir = ProcessInfo.processInfo.environment["FERNI_SNAPSHOT_DIR"] else { throw XCTSkip("FERNI_SNAPSHOT_DIR unset") }
        let renderer = try XCTUnwrap(AliveRenderer.shared)
        let personas = [(linear(hex: "#4a6741"), linear(hex: "#6b8760")), (linear(hex: "#a67a6a"), linear(hex: "#c69a8a"))]
        for dark in [false, true] {
            let w = Self.cell * Self.faces.count, h = Self.cell * personas.count
            var out = [UInt8](repeating: 0, count: w * h * 4)
            var page = SIMD3<Float>()
            for (row, colours) in personas.enumerated() {
                for (column, id) in Self.faces.enumerated() {
                    var u = AliveUniforms.settled(Face.of(id), body: colours.0, glow: colours.1)
                    u.light(dark: dark, roomTop: linear(hex: dark ? "#1e1a16" : "#faf8f5"), roomBottom: linear(hex: dark ? "#14110e" : "#efe9e0"))
                    page = srgb(hex: dark ? "#14110e" : "#faf8f5")   // FerniColor.background
                    u.frame(size: SIMD2(Float(Self.cell), Float(Self.cell)), radius: Self.radius)
                    let bytes = try XCTUnwrap(renderer.image(u, width: Self.cell, height: Self.cell))
                    // Over the page, as the app composites the premultiplied canvas.
                    let bgr = [page.z, page.y, page.x].map { Double($0) * 255 }
                    for y in 0..<Self.cell { for x in 0..<Self.cell {
                        let i = (y * Self.cell + x) * 4, o = ((row * Self.cell + y) * w + column * Self.cell + x) * 4
                        let a = Double(bytes[i + 3]) / 255
                        for c in 0..<3 { out[o + c] = UInt8(min(255, (Double(bytes[i + c]) + bgr[c] * (1 - a)).rounded())) }
                        out[o + 3] = 255
                    } }
                }
            }
            let info = CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)
            let provider = try XCTUnwrap(CGDataProvider(data: Data(out) as CFData))
            let image = try XCTUnwrap(CGImage(width: w, height: h, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: w * 4,
                                              space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: info, provider: provider,
                                              decode: nil, shouldInterpolate: false, intent: .defaultIntent))
            let url = URL(fileURLWithPath: dir).appending(path: "avatar-lids-white-\(dark ? "dark" : "light").png")
            let dest = try XCTUnwrap(CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil))
            CGImageDestinationAddImage(dest, image, nil)
            XCTAssertTrue(CGImageDestinationFinalize(dest), "\(url.path)")
        }
    }
}

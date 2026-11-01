import XCTest
@testable import FerniDesign

/// Delight gap 8: Ferni is the sharpest thing on screen, not the softest.
final class RenderQualityTests: XCTestCase {
    func testFerniRendersAtTheScreensOwnScale() {
        XCTAssertEqual(AvatarView.renderScale(display: 3, throttled: false), 3, "3x iPhones")
        XCTAssertEqual(AvatarView.renderScale(display: 2, throttled: false), 2, "iPad")
        XCTAssertEqual(AvatarView.renderScale(display: 3, throttled: true), 1.5, "Low Power Mode or hot: lighter")
        XCTAssertEqual(AvatarView.renderScale(display: 4, throttled: false), 3, "never past 3x")
    }

    /// The presence ring's thin edge read as a target outline in dark mode.
    /// It may glow there, but its sharp line is no stronger than in light mode.
    func testTheDarkRingIsSoftNotATarget() throws {
        let renderer = try XCTUnwrap(AliveRenderer.shared)
        let size = 240, radius: Float = 60
        func edge(dark: Bool) throws -> Double {
            var u = AliveUniforms.settled(Face.of("neutral"), body: linear(hex: "#4a6741"), glow: linear(hex: "#6b8760"))
            u.arch.z = 1
            u.res.w = dark ? 1 : 0
            u.light(dark: dark, roomTop: linear(hex: dark ? "#1e1a16" : "#faf8f5"), roomBottom: linear(hex: dark ? "#14110e" : "#efe9e0"))
            u.frame(size: SIMD2(Float(size), Float(size)), radius: radius)
            let bytes = try XCTUnwrap(renderer.image(u, width: size, height: size))
            // Added light (premultiplied) along a horizontal line through Ferni's centre, to the right.
            func light(_ x: Int) -> Double {
                let i = (size / 2 * size + x) * 4
                return 0.0722 * Double(bytes[i]) + 0.7152 * Double(bytes[i + 1]) + 0.2126 * Double(bytes[i + 2])
            }
            // The ring as a bump: how far it rises above a straight line between
            // the window's ends, so the body's smooth glow falling away doesn't count.
            let a = size / 2 + Int(radius * 1.12), b = min(size - 1, size / 2 + Int(radius * 1.45))
            let (la, lb) = (light(a), light(b))
            return (a...b).map { x in light(x) - (la + (lb - la) * Double(x - a) / Double(b - a)) }.max() ?? 0
        }
        let light = try edge(dark: false), dark = try edge(dark: true)
        XCTAssertGreaterThan(light, 1, "the ring is there in light mode (measured \(light))")
        XCTAssertLessThanOrEqual(dark, light, "dark \(dark) vs light \(light)")
    }
}

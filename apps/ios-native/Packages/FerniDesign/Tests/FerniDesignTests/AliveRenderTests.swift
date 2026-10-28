import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
import XCTest
@testable import FerniDesign

/// Ferni rendered offscreen by the real shader, checked pixel by pixel:
/// round all the way round (no flat clip), Ferni's colour, eyes where eyes
/// go, a squint, a wink, and two characters at the family table.
final class AliveRenderTests: XCTestCase {
    static let size = 240, radius: Float = 60
    let ferni = linear(hex: "#4a6741"), ferniLight = linear(hex: "#6b8760")
    let maya = linear(hex: "#a67a6a"), mayaLight = linear(hex: "#c69a8a")

    struct Image {
        let bytes: [UInt8], w: Int, h: Int
        func px(_ x: Int, _ y: Int) -> (r: Double, g: Double, b: Double, a: Double) {
            let i = (y * w + x) * 4
            let a = Double(bytes[i + 3]) / 255
            func c(_ v: UInt8) -> Double { a > 0 ? min(1, Double(v) / 255 / a) : 0 }
            return (c(bytes[i + 2]), c(bytes[i + 1]), c(bytes[i]), a)
        }
        /// Opaque columns in a row (alpha > 0.5).
        func width(row y: Int) -> Int { (0..<w).filter { px($0, y).a > 0.5 }.count }
        /// Near-white pixels (the eye whites) in a region.
        func whites(x: Range<Int>, y: Range<Int>) -> Int {
            x.reduce(0) { n, i in n + y.filter { j in let p = px(i, j); return p.a > 0.9 && min(p.r, p.g, p.b) > 0.75 }.count }
        }
    }

    private func render(_ u: AliveUniforms, name: String) throws -> Image {
        let renderer = try XCTUnwrap(AliveRenderer.shared, "the shader compiles on this device")
        var u = u
        u.light(dark: false, roomTop: linear(hex: "#faf8f5"), roomBottom: linear(hex: "#efe9e0"))
        u.frame(size: SIMD2(Float(Self.size), Float(Self.size)), radius: Self.radius)
        let bytes = try XCTUnwrap(renderer.image(u, width: Self.size, height: Self.size))
        Self.save(bytes, name: name)
        return Image(bytes: bytes, w: Self.size, h: Self.size)
    }

    private func face(_ id: String) throws -> Image {
        try render(.settled(Face.of(id), body: ferni, glow: ferniLight), name: id)
    }

    func testTheUniformsAreTwentyOneFloat4Slots() {
        XCTAssertEqual(MemoryLayout<AliveUniforms>.size, AliveUniforms.slots * 16)
    }

    /// The owner's note: the old avatar was "clipped flat at top and bottom".
    /// This body narrows smoothly into its top and bottom like an ellipse, and
    /// never touches the canvas edge.
    func testTheBodyIsRoundAllTheWayRound() throws {
        let img = try face("neutral")
        let rows = (0..<img.h).filter { img.width(row: $0) > 0 }
        let top = try XCTUnwrap(rows.first), bottom = try XCTUnwrap(rows.last)
        XCTAssertGreaterThan(top, 20, "headroom above")
        XCTAssertLessThan(bottom, img.h - 20, "room below")
        let middle = img.width(row: (top + bottom) / 2)
        XCTAssertEqual(Double(middle), Double(Self.radius) * 2, accuracy: 8, "about one diameter across")
        let height = Double(bottom - top)
        for (fraction, maxShare) in [(0.03, 0.45), (0.97, 0.45), (0.15, 0.8), (0.85, 0.8)] {
            let row = top + Int(height * fraction)
            XCTAssertLessThan(Double(img.width(row: row)), Double(middle) * maxShare,
                              "row at \(fraction) of the height is an ellipse's width, not a flat cut")
        }
    }

    func testFerniIsFerniGreenWithTwoOpenEyes() throws {
        let img = try face("neutral")
        let c = img.px(120, 150) // lower body, below the eyes
        XCTAssertEqual(c.a, 1, accuracy: 0.01)
        XCTAssertGreaterThan(c.g, c.r)
        XCTAssertGreaterThan(c.g, c.b)
        XCTAssertLessThan(img.px(4, 4).a, 0.05, "the corner is see-through (the room is SwiftUI's)")
        let left = img.whites(x: 80..<118, y: 90..<125), right = img.whites(x: 122..<160, y: 90..<125)
        XCTAssertGreaterThan(left, 150)
        XCTAssertGreaterThan(right, 150)
        XCTAssertEqual(Double(left), Double(right), accuracy: Double(max(left, right)) * 0.15, "symmetric at rest")
    }

    func testJoyfulSquintsIntoSmallerEyes() throws {
        let neutral = try face("neutral"), joyful = try face("joyful")
        let n = neutral.whites(x: 80..<160, y: 80..<130), j = joyful.whites(x: 80..<160, y: 80..<130)
        XCTAssertLessThan(Double(j), Double(n) * 0.75, "lids and the happy arch cover part of each eye")
        XCTAssertGreaterThan(j, 40, "but the eyes are still there")
    }

    func testAWinkClosesOnlyOneEye() throws {
        let img = try face("winking")
        let left = img.whites(x: 70..<120, y: 80..<130), right = img.whites(x: 120..<170, y: 80..<130)
        XCTAssertGreaterThan(right, 120, "the open eye")
        XCTAssertLessThan(Double(left), Double(right) * 0.2, "the winking eye is a closed arc")
    }

    /// The family table: Maya steps up, Ferni waits small in the corner.
    func testTheFamilyTableShowsBothCharacters() throws {
        var u = AliveUniforms.settled(Face.of("happy"), body: maya, glow: mayaLight)
        u.pos.x = 0.35
        u.guest = SIMD4(-1.2, -0.62, 0.42, 1)
        u.guestEye = SIMD4(0.5, 0.3, 0, 1)
        u.guestCol = SIMD4(ferni, 0)
        let img = try render(u, name: "family-table")
        let main = img.px(Int(120 + 0.35 * Self.radius), 150)
        XCTAssertEqual(main.a, 1, accuracy: 0.01)
        XCTAssertGreaterThan(main.r, main.g, "Maya is warm")
        let guest = img.px(Int(120 - 1.2 * Self.radius), Int(120 + 0.62 * Self.radius) + 8)
        XCTAssertEqual(guest.a, 1, accuracy: 0.01, "Ferni is in the corner")
        XCTAssertGreaterThan(guest.g, guest.r, "and Ferni is green")
        XCTAssertGreaterThan(img.whites(x: 30..<66, y: 140..<160), 4, "with eyes")
    }

    /// Writes the frame as a PNG when FERNI_SNAPSHOT_DIR is set (evidence for review).
    static func save(_ bytes: [UInt8], name: String) {
        guard let dir = ProcessInfo.processInfo.environment["FERNI_SNAPSHOT_DIR"] else { return }
        let info = CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)
        guard let provider = CGDataProvider(data: Data(bytes) as CFData),
              let image = CGImage(width: size, height: size, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: size * 4,
                                  space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: info, provider: provider,
                                  decode: nil, shouldInterpolate: false, intent: .defaultIntent),
              let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: dir).appending(path: "alive-\(name).png") as CFURL,
                                                         UTType.png.identifier as CFString, 1, nil) else { return }
        CGImageDestinationAddImage(dest, image, nil)
        CGImageDestinationFinalize(dest)
    }
}

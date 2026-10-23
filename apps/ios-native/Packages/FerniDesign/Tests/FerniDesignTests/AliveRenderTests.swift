import CoreGraphics
import ImageIO
import SwiftUI
import UIKit
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
        /// Near-white pixels (the eye whites) in a region. The lid caps are the
        /// page's colour, as light as a white in light mode: with `bare` (the
        /// same face without caps), a pixel the caps changed isn't a white.
        func whites(x: Range<Int>, y: Range<Int>, bare: Image? = nil) -> Int {
            x.reduce(0) { n, i in n + y.filter { j in
                let p = px(i, j)
                if let b = bare?.px(i, j), abs(b.r - p.r) + abs(b.g - p.g) + abs(b.b - p.b) > 0.06 { return false }
                return p.a > 0.9 && min(p.r, p.g, p.b) > 0.75
            }.count }
        }
    }

    /// The app's room, top and bottom, light and dark (AvatarView.frame).
    static let room = (light: (top: "#faf8f5", bottom: "#efe9e0"), dark: (top: "#1e1a16", bottom: "#14110e"))

    private func render(_ u: AliveUniforms, name: String, dark: Bool = false) throws -> Image {
        let renderer = try XCTUnwrap(AliveRenderer.shared, "the shader compiles on this device")
        var u = u
        let room = dark ? Self.room.dark : Self.room.light
        u.light(dark: dark, roomTop: linear(hex: room.top), roomBottom: linear(hex: room.bottom))
        u.frame(size: SIMD2(Float(Self.size), Float(Self.size)), radius: Self.radius)
        let bytes = try XCTUnwrap(renderer.image(u, width: Self.size, height: Self.size))
        Self.save(bytes, name: name)
        return Image(bytes: bytes, w: Self.size, h: Self.size)
    }

    private func face(_ id: String, caps: Bool = true) throws -> Image {
        var u = AliveUniforms.settled(Face.of(id), body: ferni, glow: ferniLight)
        if !caps { u.caps = .zero }
        return try render(u, name: caps ? id : "\(id)-bare")
    }

    func testTheUniformsAreWholeFloat4Slots() {
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

    /// A lid cap is solid, one colour per theme, for every persona (Seth,
    /// 2026-10-23: "use white rather than transparent, similar to the web
    /// app"; then "in dark mode, pure white is a bit too much"): pure white in
    /// light mode, warm ivory #E6DFD4 in dark mode, as the web (#2550). It was
    /// the page's colour (51f3fe702), which on the dark page (#14110e)
    /// vanished and read as see-through; before that, a darker shade of the
    /// face (40d4177f46). On the orb, not cut out of it: opaque where the face was.
    func testALidIsTheThemesCapColour() throws {
        for dark in [false, true] {
            for (name, body, light) in [("ferni", ferni, ferniLight), ("maya", maya, mayaLight)] {
                let mode = dark ? "dark" : "light"
                let lidded = AliveUniforms.settled(Face.of("sleepy"), body: body, glow: light)
                var open = lidded
                open.caps = .zero
                let a = try render(lidded, name: "lid-\(name)-\(mode)", dark: dark)
                let b = try render(open, name: "lid-\(name)-\(mode)-open", dark: dark)
                let x = Self.size / 2, y0 = try XCTUnwrap((0..<Self.size).first { a.px(x, $0).a > 0.99 })
                for y in [y0 + 4, y0 + 8] {
                    let lid = a.px(x, y), face = b.px(x, y)
                    let got = [lid.r, lid.g, lid.b].map { $0 * 255 }
                    if dark {
                        let off = zip(got, Self.ivory).map { abs($0 - $1) }.max() ?? 255
                        XCTAssertLessThanOrEqual(off, Self.ivoryLevels, "\(name) dark row \(y): lid \(got) isn't ivory \(Self.ivory)")
                        let luma = 0.2126 * lid.r + 0.7152 * lid.g + 0.0722 * lid.b
                        XCTAssertTrue(Self.darkBand.contains(luma), "\(name) dark row \(y): lid luminance \(luma) outside \(Self.darkBand)")
                    } else {
                        XCTAssertLessThanOrEqual(got.map { 255 - $0 }.max() ?? 255, Self.whiteLevels,
                                                 "\(name) light row \(y): lid \(got) isn't white")
                    }
                    let fromFace = abs(lid.r - face.r) + abs(lid.g - face.g) + abs(lid.b - face.b)
                    XCTAssertGreaterThan(fromFace, 0.15, "\(name) \(mode): the lid isn't the face's colour")
                    XCTAssertEqual(lid.a, 1, accuracy: 0.01, "\(name) \(mode): on the orb, not cut out of it")
                }
            }
        }
    }

    /// Levels (of 255) a light-mode lid may sit from pure white: the dither and rounding.
    static let whiteLevels = 3.0
    /// The dark-mode cap, #E6DFD4 (the web's, #2550), and how many levels a lid may sit from it.
    static let ivory = [230.0, 223, 212]
    static let ivoryLevels = 4.0
    /// The dark cap's luminance: soft against the dark page, but still a cap (not white, not the room).
    static let darkBand: OpenRange = OpenRange(0.6, 0.95)

    /// The caps are a constant per theme; the evening tint warms them as it
    /// does the page. At every hour the light caps still read as white
    /// (luminance 0.92 or more) and the dark caps stay in their band.
    func testTheCapsKeepTheirColourAllDay() {
        for dark in [false, true] {
            var u = AliveUniforms()
            u.light(dark: dark, roomTop: .zero, roomBottom: .zero)
            let base = SIMD3(u.cap.x, u.cap.y, u.cap.z)
            let want0 = dark ? SIMD3<Float>(230, 223, 212) / 255 : SIMD3<Float>(1, 1, 1)
            for (got, w) in zip([base.x, base.y, base.z], [want0.x, want0.y, want0.z]) {
                XCTAssertEqual(got, w, accuracy: 0.5 / 255, "\(dark ? "dark" : "light") before any tint: \(base)")
            }
            for hour in 0..<24 {
                var t = u
                let light = RoomLight(hour: hour)
                t.roomLight(light)
                let luma = Double(0.2126 * t.cap.x + 0.7152 * t.cap.y + 0.0722 * t.cap.z)
                if dark {
                    XCTAssertTrue(Self.darkBand.contains(luma), "dark \(hour):00: luminance \(luma) outside \(Self.darkBand)")
                } else {
                    XCTAssertGreaterThanOrEqual(luma, 0.92, "light \(hour):00: \(t.cap)")
                }
                let op = Float(light.tintOpacity(dark: dark))
                let tint = SIMD3<Float>(Float(light.tintRGB.x), Float(light.tintRGB.y), Float(light.tintRGB.z))
                let want = base * (1 - op) + tint * op
                for (got, w) in zip([t.cap.x, t.cap.y, t.cap.z], [want.x, want.y, want.z]) { XCTAssertEqual(got, w, accuracy: 1e-5) }
            }
        }
    }

    /// An open interval: lo < x < hi.
    struct OpenRange: CustomStringConvertible {
        let lo: Double, hi: Double
        init(_ lo: Double, _ hi: Double) { self.lo = lo; self.hi = hi }
        func contains(_ x: Double) -> Bool { x > lo && x < hi }
        var description: String { "(\(lo), \(hi))" }
    }

    func testAWinkClosesOnlyOneEye() throws {
        let img = try face("winking"), bare = try face("winking", caps: false)
        let left = img.whites(x: 70..<120, y: 80..<130, bare: bare), right = img.whites(x: 120..<170, y: 80..<130, bare: bare)
        XCTAssertGreaterThan(right, 120, "the open eye")
        // A gentle closed arc: a thin band of white, well under the open eye's.
        XCTAssertLessThan(Double(left), Double(right) * 0.6, "the winking eye is a closed arc")
        XCTAssertGreaterThan(left, 10, "drawn as an arc of white, not a dark notch")
    }

    /// A yawn scrunches both eyes into tight arcs of white, narrower and
    /// thinner than a wink's closed eye. It shut them to the fold, a blank
    /// face with two tiny brackets (expression audit P1 #6).
    func testAYawnScrunchesBothEyes() throws {
        let yawn = try face("yawning"), wink = try face("winking")
        let yawnBare = try face("yawning", caps: false), winkBare = try face("winking", caps: false)
        let winked = wink.whites(x: 70..<120, y: 80..<130, bare: winkBare)
        for (side, x) in [("left", 70..<120), ("right", 120..<170)] {
            let white = yawn.whites(x: x, y: 80..<130, bare: yawnBare)
            XCTAssertGreaterThan(white, 8, "\(side): an arc of white, not a blank")
            XCTAssertLessThan(white, winked, "\(side): tighter than a wink's closed eye (\(white) against \(winked))")
        }
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

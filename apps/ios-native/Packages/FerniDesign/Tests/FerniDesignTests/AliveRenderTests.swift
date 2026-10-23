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

    /// A lid cap is the page as it shows there (Seth, 2026-10-11; the web's
    /// .avatar-lid-overlay fills with --color-background-primary): cream in
    /// light mode, the dark page in dark, for every persona, with the room's
    /// glow over it as beside him (so never a darker hole). It regressed to an
    /// 18% darker shade of the face on 10-20 (40d4177f46). The room at a
    /// pixel is the same frame with Ferni shrunk to a point (the glow is
    /// measured from his centre, not his size); the ring is left out of both.
    /// On the orb, not cut out of it: the cap is opaque where the face was.
    func testALidIsTheRoomAtThatPixel() throws {
        let renderer = try XCTUnwrap(AliveRenderer.shared)
        for dark in [false, true] {
            // The page as measured on the web's themes (Chromium): cream #faf8f5, dark #14110e.
            let token = srgb(hex: dark ? "#14110e" : "#faf8f5")
            let page = [Double(token.x), Double(token.y), Double(token.z)].map { $0 * 255 }
            for (name, body, light) in [("ferni", ferni, ferniLight), ("maya", maya, mayaLight)] {
                let mode = dark ? "dark" : "light"
                var lidded = AliveUniforms.settled(Face.of("sleepy"), body: body, glow: light)
                lidded.arch.z = 0
                var open = lidded
                open.caps = .zero
                let a = try render(lidded, name: "lid-\(name)-\(mode)", dark: dark)
                let b = try render(open, name: "lid-\(name)-\(mode)-open", dark: dark)
                // The room alone: the same frame, Ferni a point.
                var roomU = lidded
                let room = dark ? Self.room.dark : Self.room.light
                roomU.light(dark: dark, roomTop: linear(hex: room.top), roomBottom: linear(hex: room.bottom))
                roomU.frame(size: SIMD2(Float(Self.size), Float(Self.size)), radius: Self.radius)
                roomU.bg0.w = 0.001
                let roomBytes = try XCTUnwrap(renderer.image(roomU, width: Self.size, height: Self.size))
                let x = Self.size / 2, y0 = try XCTUnwrap((0..<Self.size).first { a.px(x, $0).a > 0.99 })
                for y in [y0 + 4, y0 + 8] {
                    let lid = a.px(x, y), face = b.px(x, y)
                    let got = [lid.r, lid.g, lid.b].map { $0 * 255 }
                    // The room on screen: premultiplied over the page.
                    let i = (y * Self.size + x) * 4, alpha = Double(roomBytes[i + 3]) / 255
                    let seen = [2, 1, 0].enumerated().map { Double(roomBytes[i + $0.element]) + page[$0.offset] * (1 - alpha) }
                    let off = zip(got, seen).map { abs($0 - $1) }.max() ?? 0
                    XCTAssertLessThanOrEqual(off, Self.pageLevels, "\(name) \(mode) row \(y): lid \(got) against the room \(seen)")
                    // Page-coloured, not face-coloured: far nearer the page than the face is.
                    let fromPage = zip(got, page).map { abs($0 - $1) }.max() ?? 0
                    let faceFromPage = zip([face.r, face.g, face.b].map { $0 * 255 }, page).map { abs($0 - $1) }.max() ?? 0
                    XCTAssertLessThan(fromPage, faceFromPage * 0.5, "\(name) \(mode) row \(y): lid \(got), page \(page), face \(faceFromPage) off")
                    let fromFace = abs(lid.r - face.r) + abs(lid.g - face.g) + abs(lid.b - face.b)
                    XCTAssertGreaterThan(fromFace, 0.15, "\(name) \(mode): the lid isn't the face's colour")
                    XCTAssertEqual(lid.a, 1, accuracy: 0.01, "\(name) \(mode): on the orb, not cut out of it")
                }
            }
        }
    }

    /// Levels (of 255) a lid may sit from the page: the dither (half a level)
    /// and rounding.
    static let pageLevels = 3.0

    /// The caps' page is the app's own page behind Ferni (FerniColor.background),
    /// in each theme.
    func testThePageIsTheAppsBackground() {
        for (style, hex) in [(UIUserInterfaceStyle.light, AliveUniforms.pageHex.light), (.dark, AliveUniforms.pageHex.dark)] {
            let c = UIColor(FerniColor.background).resolvedColor(with: UITraitCollection(userInterfaceStyle: style))
            var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
            c.getRed(&r, green: &g, blue: &b, alpha: &a)
            let want = srgb(hex: hex)
            XCTAssertEqual(Float(r), want.x, accuracy: 1.0 / 255, "\(style.rawValue)")
            XCTAssertEqual(Float(g), want.y, accuracy: 1.0 / 255)
            XCTAssertEqual(Float(b), want.z, accuracy: 1.0 / 255)
        }
    }

    /// In the evening the room's tint lies over the whole page; the caps take it too.
    func testThePageTakesTheRoomsTint() {
        for dark in [false, true] {
            var u = AliveUniforms()
            u.light(dark: dark, roomTop: .zero, roomBottom: .zero)
            let base = srgb(hex: dark ? AliveUniforms.pageHex.dark : AliveUniforms.pageHex.light)
            XCTAssertEqual(SIMD3(u.page.x, u.page.y, u.page.z), base)
            let evening = RoomLight(hour: 22)
            u.roomLight(evening)
            let op = Float(evening.tintOpacity(dark: dark))
            let tint = SIMD3<Float>(Float(evening.tintRGB.x), Float(evening.tintRGB.y), Float(evening.tintRGB.z))
            let want = base * (1 - op) + tint * op
            XCTAssertGreaterThan(op, 0, "the evening has a tint")
            for (got, w) in zip([u.page.x, u.page.y, u.page.z], [want.x, want.y, want.z]) { XCTAssertEqual(got, w, accuracy: 1e-5) }
        }
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

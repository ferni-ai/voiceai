import XCTest
@testable import FerniDesign

/// The lid caps are the web's domes on the top and bottom of the head (Seth,
/// 2026-10-23: "just those white caps on the top and bottom of the head like
/// on the web app"), white in light mode, ivory in dark. A dome starts at the
/// head's edge, clipped to the circle, and never reaches the eye line: on the
/// web the deepest top cap is 27.5/100 down the orb, the eyes about 47.
@MainActor
final class DomeCapTests: XCTestCase {
    typealias Render = LidCapTests.Render
    static let side = 240, radius: Float = 70
    static let personas: [(String, SIMD3<Float>, SIMD3<Float>)] = [
        ("ferni", linear(hex: "#4a6741"), linear(hex: "#6b8760")), ("maya", linear(hex: "#a67a6a"), linear(hex: "#c69a8a")),
    ]
    /// A pixel is a cap's when the caps change it by more than this (of 255).
    static let changed = 2
    /// Clearly visible: at least this many cap pixels on a 240 px canvas
    /// (Ferni 140 px across; sleepy's domes cover a few thousand).
    static let visible = 1000

    /// Every face's caps, deepest first.
    static var byDepth: [(id: String, top: Double, bottom: Double)] {
        ExpressionTokens.all.keys.map { ($0, Face.of($0).capTop, Face.of($0).capBottom) }.sorted { max($0.1, $0.2) > max($1.1, $1.2) }
    }

    /// The deepest squint and sleepy faces: sleepy, the deepest top cap, and the deepest bottom cap.
    static var deepest: [String] {
        let faces = byDepth
        let top = faces.max { $0.top < $1.top }!.id, bottom = faces.max { $0.bottom < $1.bottom }!.id
        return Array(Set(["sleepy", "exhausted", top, bottom])).sorted()
    }

    static func image(_ u: AliveUniforms, dark: Bool) throws -> Render {
        var u = u
        u.light(dark: dark, roomTop: linear(hex: dark ? "#1e1a16" : "#faf8f5"), roomBottom: linear(hex: dark ? "#14110e" : "#efe9e0"))
        u.frame(size: SIMD2(Float(side), Float(side)), radius: radius)
        let bytes = try XCTUnwrap(AliveRenderer.shared?.image(u, width: side, height: side))
        return (bytes, side, side, u)
    }

    /// Which pixels the caps change, against the same face without them.
    static func caps(_ u: AliveUniforms, dark: Bool) throws -> (render: Render, capped: [Bool]) {
        var bare = u
        bare.caps.x = 0; bare.caps.y = 0
        let r = try image(u, dark: dark), b = try image(bare, dark: dark)
        let capped = stride(from: 0, to: r.bytes.count, by: 4).map { i in
            (0..<3).map { abs(Int(r.bytes[i + $0]) - Int(b.bytes[i + $0])) }.max()! > changed
        }
        return (r, capped)
    }

    /// The eye line's row: the eyes' centres, as `LidCapTests.nearEye` places them.
    static func eyeRow(_ r: Render) -> Double {
        let u = r.u, radius = Double(u.fill.w), scale = Double(u.bg0.w)
        let cy = Double(r.h) / 2 - Double(u.rim.w) * Double(r.h) - Double(u.pos.y) * radius
        let gy = Double(u.gaze.y + u.gaze.w) / 2
        return cy - (0.05 + gy * 0.13) * scale * 1.2 * radius
    }

    func testNoFaceIsDeeperThanTheGuard() {
        XCTAssertEqual(AliveShader.capTopMax, 0.8, accuracy: 1e-9)
        XCTAssertLessThan(AliveShader.capTopMax / 2, AliveShader.eyeLine, "the deepest top dome stops above the eye line")
        XCTAssertLessThan(AliveShader.capBottomMax / 2, 1 - AliveShader.eyeLine, "and the bottom one below it")
        for f in Self.byDepth {
            XCTAssertLessThanOrEqual(f.top, AliveShader.capTopMax, f.id)
            XCTAssertLessThanOrEqual(f.bottom, AliveShader.capBottomMax, f.id)
        }
    }

    /// Down the middle (between the eyes, where a dome is deepest), the top
    /// cap's lowest pixel and the bottom cap's highest stay clear of the eye
    /// line, at the deepest faces and at caps forced deeper than any face.
    func testTheDomesStopShortOfTheEyeLine() throws {
        guard AliveRenderer.shared != nil else { throw XCTSkip("no Metal device") }
        for (name, body, glow) in Self.personas {
            var faces = Self.deepest.map { ($0, AliveUniforms.settled(Face.of($0), body: body, glow: glow)) }
            var forced = AliveUniforms.settled(Face.of("sleepy"), body: body, glow: glow)
            forced.caps.x = 1.5; forced.caps.y = 1.5
            faces.append(("sleepy, caps forced to 1.5", forced))
            for (id, u) in faces {
                for dark in [false, true] {
                    let (r, capped) = try Self.caps(u, dark: dark)
                    let x = r.w / 2, eye = Self.eyeRow(r)
                    // Half the clearance on screen: the blend and the perspective take the rest.
                    let margin = AliveShader.capClearance * Double(r.u.fill.w) * Double(r.u.bg0.w)
                    let rows = (0..<r.h).filter { capped[$0 * r.w + x] }
                    let top = rows.filter { Double($0) < eye }.max(), bottom = rows.filter { Double($0) > eye }.min()
                    let mode = dark ? "dark" : "light"
                    if let top { XCTAssertGreaterThan(eye - Double(top), margin, "\(name) \(mode) \(id): the top dome comes to row \(top), the eye line \(eye)") }
                    if let bottom { XCTAssertGreaterThan(Double(bottom) - eye, margin, "\(name) \(mode) \(id): the bottom dome comes to row \(bottom), the eye line \(eye)") }
                }
            }
        }
    }

    /// And they show: the deepest faces' domes are clearly there, in both themes.
    func testTheDomesAreClearlyVisible() throws {
        guard AliveRenderer.shared != nil else { throw XCTSkip("no Metal device") }
        for (name, body, glow) in Self.personas {
            for id in Self.deepest {
                for dark in [false, true] {
                    let n = try Self.caps(AliveUniforms.settled(Face.of(id), body: body, glow: glow), dark: dark).capped.filter { $0 }.count
                    XCTAssertGreaterThanOrEqual(n, Self.visible, "\(name) \(dark ? "dark" : "light") \(id): \(n) cap pixels")
                }
            }
        }
    }
}

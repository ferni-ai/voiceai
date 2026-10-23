import XCTest
@testable import FerniDesign

/// The lid caps stay inside the eyes (design panel, 2026-10-23). Reaching
/// past them, the deep faces' caps painted an ivory or white skullcap and chin
/// strap over the orb (sleepy, drowsy, the squints) and over the moving orb
/// mid-handoff (avatar-lids-white-dark.png: the domes). Now no cap pixel lands
/// outside the eyes' bounds, worked out from the face geometry (`nearEye`),
/// and none at all while the orb travels between teammates. The eyes' own lids
/// carry squint and sleepy, as goodbye's happy eyes always have.
@MainActor
final class CrescentCapTests: XCTestCase {
    typealias Render = LidCapTests.Render
    static let side = 240, radius: Float = 70
    static let personas: [(String, SIMD3<Float>, SIMD3<Float>)] = [
        ("ferni", linear(hex: "#4a6741"), linear(hex: "#6b8760")), ("maya", linear(hex: "#a67a6a"), linear(hex: "#c69a8a")),
    ]
    /// Every face with a cap (the squints, the tired faces, the web's table),
    /// plus the deepest caps the shader takes, forced onto sleepy's eyes.
    static let capped = ["sleepy", "drowsy", "exhausted", "yawning", "sad", "happy", "delighted", "celebrating", "reconnecting"]
    /// A pixel is a cap's when the caps change it by more than this (of 255).
    static let changed = 2
    /// The eyes' bounds: each eye's ellipse from the face geometry, grown 10%
    /// for its blended edge and the perspective `nearEye` approximates.
    static let bounds = 1.1

    static func image(_ u: AliveUniforms, dark: Bool) throws -> Render {
        var u = u
        u.light(dark: dark, roomTop: linear(hex: dark ? "#1e1a16" : "#faf8f5"), roomBottom: linear(hex: dark ? "#14110e" : "#efe9e0"))
        u.frame(size: SIMD2(Float(side), Float(side)), radius: radius)
        let bytes = try XCTUnwrap(AliveRenderer.shared?.image(u, width: side, height: side))
        return (bytes, side, side, u)
    }

    /// The pixels the caps change: the render against the same face without caps.
    static func capPixels(_ u: AliveUniforms, dark: Bool) throws -> (render: Render, pixels: [(x: Int, y: Int)], outline: Int) {
        var bare = u
        bare.caps.x = 0; bare.caps.y = 0
        let r = try image(u, dark: dark), b = try image(bare, dark: dark)
        var out: [(Int, Int)] = [], outline = 0
        for y in 0..<r.h { for x in 0..<r.w {
            let i = (y * r.w + x) * 4
            let d = (0..<3).map { abs(Int(r.bytes[i + $0]) - Int(b.bytes[i + $0])) }.max() ?? 0
            if d > changed { out.append((x, y)) }
            outline = max(outline, abs(Int(r.bytes[i + 3]) - Int(b.bytes[i + 3])))
        } }
        return (r, out, outline)
    }

    func testNoCapPixelLeavesTheEyes() throws {
        guard AliveRenderer.shared != nil else { throw XCTSkip("no Metal device") }
        for (name, body, glow) in Self.personas {
            for dark in [false, true] {
                let mode = dark ? "dark" : "light"
                var faces = Self.capped.map { ($0, AliveUniforms.settled(Face.of($0), body: body, glow: glow)) }
                var deepest = AliveUniforms.settled(Face.of("sleepy"), body: body, glow: glow)
                deepest.caps.x = 1; deepest.caps.y = 1
                var open = AliveUniforms.settled(Face.of("neutral"), body: body, glow: glow)
                open.caps.x = 1; open.caps.y = 1
                faces += [("sleepy, deepest caps", deepest), ("neutral, deepest caps", open)]
                for (id, u) in faces {
                    let (r, pixels, outline) = try Self.capPixels(u, dark: dark)
                    let outside = pixels.filter { !LidCapTests.nearEye(r, $0.x, $0.y, grow: Self.bounds) }
                    XCTAssertEqual(outside.count, 0, "\(name) \(mode) \(id): \(outside.count) cap pixels outside the eyes, first \(outside.prefix(3))")
                    XCTAssertLessThanOrEqual(outline, 2, "\(name) \(mode) \(id): the caps move the outline")
                }
                // Not vacuous: a cap deep enough to reach the open eye does paint there.
                let reached = try Self.capPixels(open, dark: dark).pixels.count
                XCTAssertGreaterThan(reached, 20, "\(name) \(mode): the deepest caps paint inside the open eye")
            }
        }
    }

    /// A handoff, from `from` to `to`, at 60 fps on the face `id`: each frame's
    /// time from the start, its uniforms, and whether the orb is travelling.
    static func handoff(from: WindowPersona, to: WindowPersona, id: String) -> [(t: Double, u: AliveUniforms, travelling: Bool)] {
        let rig = AliveRig(persona: from, seed: 7)
        rig.expression = id
        var t = 0.0
        while t < 1.5 { t += 1.0 / 60; _ = rig.frame(at: t) }
        rig.handOff(to: to)
        let start = t
        var out: [(Double, AliveUniforms, Bool)] = []
        while t < start + 5 { t += 1.0 / 60; let u = rig.frame(at: t); out.append((t - start, u, rig.travelling)) }
        return out
    }

    /// While the orb travels (the roll and shrink, until it's home), the caps
    /// fade to nothing; after, they're back.
    func testNoCapsWhileTheOrbTravelsBetweenTeammates() throws {
        guard AliveRenderer.shared != nil else { throw XCTSkip("no Metal device") }
        for (from, to) in [(WindowPersona.ferni, WindowPersona.maya), (.maya, .ferni)] {
            let id = "sleepy", frames = Self.handoff(from: from, to: to, id: id)
            let before = Double(frames[0].u.caps.x)
            XCTAssertGreaterThan(before, 0.3, "\(from): sleepy's caps before the handoff")
            // After the fade (the caps' own springs, which overshoot and settle like the
            // web's: about half a second), nothing while it travels.
            let moving = frames.filter { $0.travelling && $0.t > 0.6 }
            XCTAssertGreaterThan(moving.count, 60, "\(from) → \(to): the orb travels")
            let worst = moving.max { max($0.u.caps.x, $0.u.caps.y) < max($1.u.caps.x, $1.u.caps.y) }
            let w = worst.map { max($0.u.caps.x, $0.u.caps.y) } ?? 1
            XCTAssertLessThan(w, 0.01, "\(from) → \(to): caps while travelling up to \(w) at \(worst?.t ?? -1) s")
            // Mid-handoff on screen, light and dark: the greeting, the swap, the shrink.
            for t in [1.0, 1.7, 2.1, 2.4] {
                let f = try XCTUnwrap(frames.first { $0.t >= t })
                XCTAssertTrue(f.travelling, "\(from) → \(to) at \(t) s")
                for dark in [false, true] {
                    let n = try Self.capPixels(f.u, dark: dark).pixels.count
                    XCTAssertEqual(n, 0, "\(from) → \(to) at \(t) s \(dark ? "dark" : "light"): \(n) cap pixels")
                }
            }
            // Home again: the caps come back.
            let home = try XCTUnwrap(frames.last)
            XCTAssertFalse(home.travelling, "\(from) → \(to): home by 5 s")
            XCTAssertEqual(Double(home.u.caps.x), Face.of(id).capTop, accuracy: 0.02, "\(from) → \(to): the caps are back")
        }
    }
}

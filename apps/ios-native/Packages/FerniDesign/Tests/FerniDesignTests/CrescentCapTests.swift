import XCTest
@testable import FerniDesign

/// The lid caps hide while the orb travels between teammates (design panel,
/// 2026-10-23): over the handoff's moving, shrinking orb the deep caps read
/// as an ivory or white skullcap and chin strap. At rest they stay the web's
/// domes, white in light mode and ivory in dark (Seth, 2026-10-23).
@MainActor
final class CrescentCapTests: XCTestCase {
    typealias Render = LidCapTests.Render
    static let side = 240, radius: Float = 70
    /// A pixel is a cap's when the caps change it by more than this (of 255).
    static let changed = 2

    static func image(_ u: AliveUniforms, dark: Bool) throws -> Render {
        var u = u
        u.light(dark: dark, roomTop: linear(hex: dark ? "#1e1a16" : "#faf8f5"), roomBottom: linear(hex: dark ? "#14110e" : "#efe9e0"))
        u.frame(size: SIMD2(Float(side), Float(side)), radius: radius)
        let bytes = try XCTUnwrap(AliveRenderer.shared?.image(u, width: side, height: side))
        return (bytes, side, side, u)
    }

    /// How many pixels the caps change: the render against the same frame without caps.
    static func capPixels(_ u: AliveUniforms, dark: Bool) throws -> Int {
        var bare = u
        bare.caps.x = 0; bare.caps.y = 0
        let r = try image(u, dark: dark), b = try image(bare, dark: dark)
        var n = 0
        for i in stride(from: 0, to: r.bytes.count, by: 4) {
            let d = (0..<3).map { abs(Int(r.bytes[i + $0]) - Int(b.bytes[i + $0])) }.max() ?? 0
            if d > changed { n += 1 }
        }
        return n
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

    /// While the orb travels (the roll and shrink, until it's settled home),
    /// the caps fade to nothing; after, they're back.
    func testNoCapsWhileTheOrbTravelsBetweenTeammates() throws {
        guard AliveRenderer.shared != nil else { throw XCTSkip("no Metal device") }
        for (from, to) in [(WindowPersona.ferni, WindowPersona.maya), (.maya, .ferni)] {
            let id = "sleepy", frames = Self.handoff(from: from, to: to, id: id)
            let before = Double(frames[0].u.caps.x)
            XCTAssertGreaterThan(before, 0.3, "\(from): sleepy's caps before the handoff")
            // Not vacuous: at rest, sleepy's caps do paint (the domes).
            XCTAssertGreaterThan(try Self.capPixels(frames[0].u, dark: true), 100, "\(from): sleepy's domes at rest")
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
                    let n = try Self.capPixels(f.u, dark: dark)
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

import XCTest
@testable import FerniDesign

/// Parity item 4a: the prototype's firefly sneeze. After 20 s at rest the
/// firefly wanders, lands on Ferni's head (he looks up at it), and he winds
/// up (ah... ah...), sneezes it away (choo), then giggles with a few sparkles.
@MainActor
final class SneezeTests: XCTestCase {
    struct Frame { var t: Double, u: AliveUniforms, face: String, cues: [KeyedCue], sparkles: Int }

    /// A visit, frame by frame from a quiet start.
    private func visit(_ rig: AliveRig, to end: Double = 45, poke: Double? = nil) -> [Frame] {
        var out: [Frame] = [], t = 0.0, poked = false
        while t < end {
            t += 1.0 / 60
            if let poke, t >= poke, !poked { poked = true; rig.poke(at: SIMD2(0.9, -0.5)) }
            let u = rig.frame(at: t)
            out.append(Frame(t: t, u: u, face: rig.faceID(), cues: rig.cues, sparkles: rig.particles.filter { $0.kind == .sparkle }.count))
        }
        return out
    }

    /// The frames where the firefly sits on top of his head.
    private func landed(_ frames: [Frame]) -> [Frame] {
        frames.filter { $0.u.fly.w > 0 && abs($0.u.fly.x) < 0.1 && abs($0.u.fly.y - 1.07) < 0.15 }
    }

    func testItLandsOnHisHeadAndHeSneezesItAway() throws {
        let frames = visit(AliveRig(seed: 41))
        let sat = landed(frames)
        let landedAt = try XCTUnwrap(sat.first?.t, "it lands on his head")
        XCTAssertGreaterThan((sat.last?.t ?? 0) - landedAt, 1.4, "and rests there")
        let windUp = try XCTUnwrap(frames.first { $0.face == "yawning" }?.t, "ah... ah...")
        // It rests 1.6 s (the frames above include the last of its approach).
        XCTAssertTrue((1.6...1.85).contains(windUp - landedAt), "\(windUp - landedAt) s on his head")
        let giggle = try XCTUnwrap(frames.first { $0.cues.contains(.giggle) }?.t, "a giggle")
        XCTAssertEqual(giggle - windUp, 0.72, accuracy: 0.05, "choo at 0.46 s, the giggle 0.26 s after")
        XCTAssertEqual(frames.filter { $0.cues.contains(.giggle) }.count, 1)
        XCTAssertEqual(frames.first { $0.t > giggle }?.face, "amused")
        XCTAssertGreaterThanOrEqual(frames.first { $0.t > giggle + 0.05 }?.sparkles ?? 0, 4, "and sparkles")
        // Sent off: it rises out of sight, and the visit is over.
        let after = frames.filter { $0.t > windUp + 0.5 }
        XCTAssertGreaterThan(after.map { $0.u.fly.y }.max() ?? 0, 2.5, "away up")
        XCTAssertEqual(frames.last?.u.fly.w, 0)
    }

    /// He looks up at it while it sits on his head, his eyes a touch crossed.
    func testHeLooksUpAtItCrossEyed() {
        let sat = landed(visit(AliveRig(seed: 42), to: 40)).dropFirst(30)
        XCTAssertFalse(sat.isEmpty)
        for f in sat.prefix(40) {
            XCTAssertGreaterThan(f.u.gaze.y, 0.4, "looking up at \\(f.t)")
            XCTAssertGreaterThan(f.u.gaze.x - f.u.gaze.z, 0.03, "crossed at \\(f.t)")
        }
    }

    /// The wind-up is a held inhale (stretched tall), then the choo jolts him.
    func testAHeldInhaleThenTheJolt() throws {
        let frames = visit(AliveRig(seed: 43))
        let windUp = try XCTUnwrap(frames.first { $0.face == "yawning" }?.t)
        let inhale = frames.filter { $0.t > windUp + 0.2 && $0.t < windUp + 0.4 }.map(\.u.body.w)
        XCTAssertGreaterThan(inhale.min() ?? 0, 1.05)
        let jolt = frames.filter { $0.t > windUp + 0.46 && $0.t < windUp + 0.8 }.map(\.u.body.w)
        XCTAssertLessThan(jolt.min() ?? 1, 0.92)
    }

    /// A touch while it sits there sends it off with no sneeze.
    func testATouchSendsItOffWithoutASneeze() throws {
        let rig = AliveRig(seed: 44)
        let sat = landed(visit(AliveRig(seed: 44), to: 40))
        let poke = try XCTUnwrap(sat.first?.t) + 0.5
        let frames = visit(rig, to: 45, poke: poke)
        XCTAssertFalse(frames.contains { $0.face == "yawning" }, "no wind-up")
        XCTAssertFalse(frames.contains { $0.cues.contains(.giggle) })
        XCTAssertEqual(frames.first { $0.t > poke + 0.05 }?.u.fly.w, 0, "gone")
    }

    /// Mid-sneeze (ah... ah...) a touch sends it off too: no choo, no giggle.
    func testATouchDuringTheWindUpStopsTheSneeze() throws {
        let windUp = try XCTUnwrap(visit(AliveRig(seed: 45)).first { $0.face == "yawning" }?.t)
        let frames = visit(AliveRig(seed: 45), to: 45, poke: windUp + 0.2)
        XCTAssertFalse(frames.contains { $0.cues.contains(.giggle) })
        XCTAssertFalse(frames.contains { $0.face == "amused" })
    }
}

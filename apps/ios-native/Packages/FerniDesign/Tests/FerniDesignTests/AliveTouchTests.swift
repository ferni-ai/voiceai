import XCTest
@testable import FerniDesign

/// Delight gap 2: Ferni can be touched, and the prototype's tears, firefly,
/// sparkles and hearts reach the screen.
@MainActor
final class AliveTouchTests: XCTestCase {
    private func run(_ rig: AliveRig, from t0: Double, to t1: Double, each: (Double, AliveUniforms) -> Void = { _, _ in }) -> AliveUniforms {
        var u = AliveUniforms(), t = t0
        while t < t1 { t += 1.0 / 60; u = rig.frame(at: t); each(t, u) }
        return u
    }

    func testAPokeDentsWhereTouchedAndSettles() {
        let rig = AliveRig(seed: 1)
        _ = run(rig, from: 0, to: 1)
        rig.poke(at: SIMD2(0.5, 0.3))
        var peak: Float = 0
        _ = run(rig, from: 1, to: 1.4) { _, u in peak = max(peak, abs(u.poke.w)) }
        XCTAssertGreaterThan(peak, 0.15, "a visible dent")
        let after = rig.frame(at: 1.41)
        XCTAssertGreaterThan(after.poke.x, 0.3, "the dent is where the finger was")
        XCTAssertGreaterThan(after.poke.y, 0.15)
        let settled = run(rig, from: 1.41, to: 4)
        XCTAssertLessThan(abs(settled.poke.w), 0.02, "and it settles")
    }

    func testAPokeLooksTowardTheFinger() {
        let rig = AliveRig(seed: 2)
        rig.still = false
        _ = run(rig, from: 0, to: 1)
        rig.poke(at: SIMD2(0.8, 0))
        let u = run(rig, from: 1, to: 1.5)
        XCTAssertGreaterThan(u.gaze.x, 0.3)
    }

    func testUnderReduceMotionAPokeIsOnlyAGlanceAndABlink() {
        let rig = AliveRig(seed: 3)
        rig.reduceMotion = true
        _ = run(rig, from: 0, to: 1)
        rig.poke(at: SIMD2(0.6, 0.2))
        var peak: Float = 0
        let u = run(rig, from: 1, to: 1.5) { _, u in peak = max(peak, abs(u.poke.w)) }
        XCTAssertLessThan(peak, 0.01, "no dent")
        XCTAssertGreaterThan(u.gaze.x, 0.1, "a glance")
    }

    func testOneSoftTapInTheHandAtMostEveryTwoSeconds() {
        let rig = AliveRig(seed: 4)
        var touches = 0
        _ = run(rig, from: 0, to: 1)
        for i in 0..<3 {
            rig.poke(at: SIMD2(0.2, 0.2))
            _ = run(rig, from: 1 + Double(i) * 0.3, to: 1.3 + Double(i) * 0.3) { _, _ in touches += rig.cues.filter { $0 == .touch }.count }
        }
        XCTAssertEqual(touches, 1)
        _ = run(rig, from: 1.9, to: 3.2)
        rig.poke(at: SIMD2(0.2, 0.2))
        _ = run(rig, from: 3.2, to: 3.4) { _, _ in touches += rig.cues.filter { $0 == .touch }.count }
        XCTAssertEqual(touches, 2)
    }

    /// No escalation and nothing counted: after a run of pokes Ferni just
    /// gives a calm "I'm here" look, and the jiggle gets smaller, not bigger.
    func testManyPokesGetACalmLookNotMore() {
        let rig = AliveRig(seed: 5)
        _ = run(rig, from: 0, to: 1)
        var t = 1.0, peaks: [Float] = []
        for _ in 0..<6 {
            rig.poke(at: SIMD2(0.3, 0.3))
            var peak: Float = 0
            _ = run(rig, from: t, to: t + 1) { _, u in peak = max(peak, abs(u.poke.w)) }
            peaks.append(peak); t += 1
        }
        XCTAssertLessThan(peaks[5], peaks[0])
        rig.poke(at: SIMD2(0.3, 0.3))
        _ = rig.frame(at: t + 0.05)
        XCTAssertEqual(rig.faceID(), "content")
    }

    func testTearsOnlyWhileCrying() {
        let rig = AliveRig(seed: 6)
        rig.expression = "crying"
        var u = run(rig, from: 0, to: 2)
        XCTAssertGreaterThan(u.tear.z, 0.5)
        let before = u.tear.x
        u = run(rig, from: 2, to: 2.5)
        XCTAssertNotEqual(u.tear.x, before, "the tears run")
        rig.expression = "neutral"
        u = run(rig, from: 2.5, to: 5)
        XCTAssertLessThan(u.tear.z, 0.02)
    }

    func testTheFireflyComesOnceAfterALongQuietRest() {
        let rig = AliveRig(seed: 7)
        var firstLight: Double?
        _ = run(rig, from: 0, to: 30) { t, u in if u.fly.w > 0, firstLight == nil { firstLight = t } }
        XCTAssertNotNil(firstLight)
        XCTAssertGreaterThanOrEqual(firstLight ?? 0, 20)
        XCTAssertTrue(rig.particles.contains { $0.kind == .firefly } || firstLight != nil)
        var again = false
        _ = run(rig, from: 40, to: 120) { _, u in if u.fly.w > 0 { again = true } }
        XCTAssertFalse(again, "once per session")
    }

    func testATouchResetsTheQuietAndTheFireflyNeverVisitsACall() {
        let rig = AliveRig(seed: 8)
        var lit: Double?
        _ = run(rig, from: 0, to: 15)
        rig.poke(at: SIMD2(0, 0))
        _ = run(rig, from: 15, to: 34) { t, u in if u.fly.w > 0, lit == nil { lit = t } }
        XCTAssertNil(lit, "20 s from the last touch")
        let call = AliveRig(seed: 9)
        call.activity = .listening
        var inCall = false
        _ = run(call, from: 0, to: 60) { _, u in if u.fly.w > 0 { inCall = true } }
        XCTAssertFalse(inCall)
    }

    func testSparkleAndHeartCuesBecomeParticles() {
        let rig = AliveRig(seed: 10)
        rig.play(.goodbye)
        var hearts = false
        _ = run(rig, from: 0, to: 3) { _, _ in hearts = hearts || rig.particles.contains { $0.kind == .heart } }
        XCTAssertTrue(hearts)
        let handoff = AliveRig(seed: 11)
        handoff.handOff(to: .maya)
        var sparkles = false
        _ = run(handoff, from: 0, to: 4) { _, _ in sparkles = sparkles || handoff.particles.contains { $0.kind == .sparkle } }
        XCTAssertTrue(sparkles)
    }

    func testReduceMotionDrawsNoParticles() {
        let rig = AliveRig(seed: 12)
        rig.reduceMotion = true
        rig.play(.goodbye)
        var any = false
        _ = run(rig, from: 0, to: 3) { _, _ in any = any || !rig.particles.isEmpty }
        XCTAssertFalse(any)
    }
}

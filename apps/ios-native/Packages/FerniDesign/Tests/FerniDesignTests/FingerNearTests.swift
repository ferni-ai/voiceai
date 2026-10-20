import XCTest
@testable import FerniDesign

/// Parity items 4b and 6: a finger held on Ferni at rest. He notices it once
/// (a flash of noticing and the notice cue), leans in, his eyes follow it,
/// and they cross when it's close to his face (the prototype's stepFinger).
@MainActor
final class FingerNearTests: XCTestCase {
    @discardableResult
    private func run(_ rig: AliveRig, from t0: Double, to t1: Double, each: (Double, AliveUniforms) -> Void = { _, _ in }) -> AliveUniforms {
        var u = AliveUniforms(), t = t0
        while t < t1 { t += 1.0 / 60; u = rig.frame(at: t); each(t, u) }
        return u
    }

    private func notices(_ rig: AliveRig, from t0: Double, to t1: Double) -> Int {
        var n = 0
        run(rig, from: t0, to: t1) { _, _ in n += rig.cues.filter { $0 == .notice }.count }
        return n
    }

    /// Left eye minus right eye: positive when they cross.
    private func cross(_ u: AliveUniforms) -> Float { u.gaze.x - u.gaze.z }

    func testHeNoticesOnceAndHisEyesFollowTheFinger() {
        let rig = AliveRig(seed: 31)
        run(rig, from: 0, to: 1)
        rig.fingerHeld(at: SIMD2(0.8, 0.2))
        var noticed = false
        var n = 0
        let right = run(rig, from: 1, to: 1.6) { t, _ in
            n += rig.cues.filter { $0 == .notice }.count
            if t < 1.12, rig.faceID() == "intrigued" { noticed = true }
        }
        XCTAssertEqual(n, 1)
        XCTAssertTrue(noticed, "a flash of noticing")
        XCTAssertGreaterThan(right.gaze.x, 0.25, "eyes on the finger")
        rig.fingerHeld(at: SIMD2(-0.8, 0.2))
        n += notices(rig, from: 1.6, to: 2.2)
        XCTAssertLessThan(rig.frame(at: 2.21).gaze.x, -0.25, "and follow it")
        XCTAssertEqual(n, 1, "noticed once while it stays")
    }

    func testHisEyesCrossWhenItsCloseToHisFace() {
        let rig = AliveRig(seed: 32)
        run(rig, from: 0, to: 1)
        rig.fingerHeld(at: SIMD2(0, 0.3))
        XCTAssertGreaterThan(cross(run(rig, from: 1, to: 1.6)), 0.3, "cross-eyed")
        rig.fingerHeld(at: SIMD2(1.6, 0))
        XCTAssertLessThan(abs(cross(run(rig, from: 1.6, to: 2.2))), 0.08, "not for a finger out at his side")
        rig.fingerHeld(at: SIMD2(0, 0.3))
        _ = run(rig, from: 2.2, to: 2.8)
        rig.fingerLifted()
        XCTAssertLessThan(abs(cross(run(rig, from: 2.8, to: 3.5))), 0.02, "let go")
    }

    /// The same rig twice, one with a finger held (before it has moved): he
    /// leans in and his eyes open a little wider.
    func testHeLeansInWideEyed() {
        let held = AliveRig(seed: 33), alone = AliveRig(seed: 33)
        run(held, from: 0, to: 1); run(alone, from: 0, to: 1)
        held.fingerHeld(at: nil)
        let a = run(held, from: 1, to: 1.6), b = run(alone, from: 1, to: 1.6)
        XCTAssertLessThan(a.lean.y, b.lean.y - 0.03, "leans toward it")
        XCTAssertGreaterThan(a.eyes.y / b.eyes.y, 1.05, "eyes wider")
    }

    func testNotFarAwayNotInACallAndAgainAfterLetGo() {
        let far = AliveRig(seed: 34)
        run(far, from: 0, to: 1)
        far.fingerHeld(at: SIMD2(2.2, 0))
        XCTAssertEqual(notices(far, from: 1, to: 1.5), 0, "too far to be near")

        let call = AliveRig(seed: 35)
        call.activity = .listening
        run(call, from: 0, to: 1)
        call.fingerHeld(at: SIMD2(0, 0.3))
        XCTAssertEqual(notices(call, from: 1, to: 1.5), 0, "a call's own gestures only")

        let rig = AliveRig(seed: 36)
        run(rig, from: 0, to: 1)
        rig.fingerHeld(at: SIMD2(0.3, 0.3))
        XCTAssertEqual(notices(rig, from: 1, to: 1.5), 1)
        rig.fingerLifted()
        XCTAssertEqual(notices(rig, from: 1.5, to: 2), 0)
        rig.fingerHeld(at: SIMD2(0.3, 0.3))
        XCTAssertEqual(notices(rig, from: 2, to: 2.5), 1, "a new hold is noticed again")
    }
}

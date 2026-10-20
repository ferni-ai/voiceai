import simd
import XCTest
@testable import FerniDesign

/// Parity item 5: back after a little while away, Ferni does the prototype's
/// double take: a glance at you, a look away, then the snap back with a start.
@MainActor
final class DoubleTakeTests: XCTestCase {
    private func run(_ rig: AliveRig, from t0: Double, to t1: Double, each: (Double, AliveUniforms) -> Void = { _, _ in }) {
        var t = t0
        while t < t1 { t += 1.0 / 60; each(t, rig.frame(at: t)) }
    }

    private func gaze(_ u: AliveUniforms) -> Double { Double(simd_length(SIMD2(u.gaze.x, u.gaze.y))) }

    func testAGlanceALookAwayThenTheSnapBack() {
        let rig = AliveRig(seed: 21)
        run(rig, from: 0, to: 2)
        rig.doubleTake()
        var glance: [Double] = [], away: [Double] = [], back: [Double] = [], surprised = false
        run(rig, from: 2, to: 3.6) { t, u in
            let e = t - 2
            if (0.12...0.2).contains(e) { glance.append(gaze(u)) }
            if (0.4...0.62).contains(e) { away.append(gaze(u)) }
            if (1.0...1.5).contains(e) { back.append(gaze(u)) }
            if (0.66...0.8).contains(e), rig.faceID() == "surprised" { surprised = true }
        }
        XCTAssertLessThan(glance.max() ?? 1, 0.15, "at you")
        XCTAssertGreaterThan(away.min() ?? 0, 0.3, "away")
        XCTAssertLessThan(back.max() ?? 1, 0.15, "back at you")
        XCTAssertTrue(surprised, "with a flash of surprise")
    }

    /// He holds his breath (squashed a little) just before the snap, then
    /// starts upward.
    func testHeHoldsHisBreathThenStarts() {
        let rig = AliveRig(seed: 22)
        run(rig, from: 0, to: 2)
        rig.doubleTake()
        var held: [Float] = [], rise: Float = 0, y0: Float?
        run(rig, from: 2, to: 3) { t, u in
            let e = t - 2
            if (0.6...0.66).contains(e) { held.append(u.body.w) }
            if e >= 0.67 {
                if y0 == nil { y0 = u.pos.y }
                rise = max(rise, u.pos.y - (y0 ?? 0))
            }
        }
        XCTAssertLessThan(held.min() ?? 1, 0.97, "a held breath")
        XCTAssertGreaterThan(rise, 0.02, "a little start")
    }

    func testNotInAStillFrameAndNotTwiceAtOnce() {
        let still = AliveRig(seed: 23)
        still.still = true
        still.doubleTake()
        var squash: Float = 1
        run(still, from: 0, to: 1) { _, u in squash = min(squash, u.body.w) }
        XCTAssertEqual(still.faceID(), "neutral")
        XCTAssertGreaterThan(squash, 0.99, "no held breath in a still frame")

        let rig = AliveRig(seed: 24)
        run(rig, from: 0, to: 2)
        rig.doubleTake()
        run(rig, from: 2, to: 2.5)
        rig.doubleTake() // ignored: the first is still playing, on its own beat
        var surprises: [Double] = [], wasSurprised = false
        run(rig, from: 2.5, to: 4) { t, _ in
            let now = rig.faceID() == "surprised"
            if now, !wasSurprised { surprises.append(t) }
            wasSurprised = now
        }
        XCTAssertEqual(surprises.count, 1)
        XCTAssertEqual(surprises.first ?? 0, 2.68, accuracy: 0.04)
    }
}

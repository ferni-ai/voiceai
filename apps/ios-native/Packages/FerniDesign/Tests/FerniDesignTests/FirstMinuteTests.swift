import XCTest
@testable import FerniDesign

/// Delight gap 3: one continuous first minute. Ferni is already in the room
/// when the app opens and wakes up there; he doesn't drop in from above.
@MainActor
final class FirstMinuteTests: XCTestCase {
    private func run(_ rig: AliveRig, from t0: Double, to t1: Double, each: (Double, AliveUniforms) -> Void = { _, _ in }) -> AliveUniforms {
        var u = AliveUniforms(), t = t0
        while t < t1 { t += 1.0 / 60; u = rig.frame(at: t); each(t, u) }
        return u
    }

    func testOpeningTheAppWakesFerniRatherThanDroppingHimIn() {
        XCTAssertEqual(AvatarView.launchMoment(reduceMotion: false), .wake)
        XCTAssertNil(AvatarView.launchMoment(reduceMotion: true), "Reduce Motion: he's simply there")
    }

    func testWakeOpensHisEyesInPlace() {
        let rig = AliveRig(seed: 1)
        rig.play(.wake)
        let first = rig.frame(at: 0.001)
        XCTAssertGreaterThan(first.lids.x, 0.9, "eyes closed on the first frame")
        var lowest: Float = 0, cues: [KeyedCue] = []
        let last = run(rig, from: 0.001, to: 1.2) { _, u in lowest = min(lowest, u.pos.y); cues += rig.cues }
        XCTAssertGreaterThan(lowest, -0.1, "in place the whole time, never coming from off-canvas")
        XCTAssertLessThan(last.lids.x, 0.35, "eyes open")
        XCTAssertTrue(cues.isEmpty, "silent: no chime when you only opened the app")
    }

    func testWakeIsShortAndBrightensTheGlow() {
        XCTAssertGreaterThan(KeyedMoment.wake.end, 30)
        XCTAssertLessThanOrEqual(KeyedMoment.wake.end, 72, "about a second at most")
        let rig = AliveRig(seed: 2)
        rig.play(.wake)
        let start = rig.frame(at: 0.001).bg1.w
        var peak: Float = 0
        _ = run(rig, from: 0.001, to: 0.8) { _, u in peak = max(peak, u.bg1.w) }
        XCTAssertGreaterThan(peak, start + 0.2)
    }

    /// While someone reads the consent sheet, Ferni reads along: eyes down.
    func testReadingLooksDown() {
        func meanGazeY(_ reading: Bool) -> Float {
            let rig = AliveRig(seed: 3)
            rig.reading = reading
            var sum: Float = 0, n: Float = 0
            _ = run(rig, from: 0, to: 6) { t, u in if t > 1 { sum += u.gaze.y; n += 1 } }
            return sum / n
        }
        XCTAssertLessThan(meanGazeY(true), meanGazeY(false) - 0.15)
    }
}

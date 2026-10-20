import XCTest
@testable import FerniDesign

/// The small Ferni beside a screen's intro line: at rest, blinking, nothing
/// else (no wandering eyes, no breath or bob).
@MainActor
final class BlinksOnlyTests: XCTestCase {
    private func run(_ quiet: Bool) -> (moved: Float, blinked: Bool) {
        let rig = AliveRig(persona: .ferni, seed: 81)
        rig.blinksOnly = quiet
        var t = 0.0, first: AliveUniforms?
        var moved: Float = 0, lids: [Float] = []
        while t < 14 {
            t += 1.0 / 60
            let u = rig.frame(at: t)
            guard t > 2 else { continue }   // settled
            if first == nil { first = u }
            if let f = first {
                moved = max(moved, abs(u.gaze.x - f.gaze.x), abs(u.gaze.y - f.gaze.y), abs(u.pos.y - f.pos.y),
                            abs(u.body.w - f.body.w), abs(u.lean.x - f.lean.x), abs(u.lean.y - f.lean.y))
            }
            lids.append(u.lids.x)
        }
        return (moved, (lids.max() ?? 0) > 0.8)
    }

    func testOnlyTheLidsMove() {
        let quiet = run(true), alive = run(false)
        XCTAssertLessThan(quiet.moved, 1e-3, "no wander, breath or bob")
        XCTAssertTrue(quiet.blinked, "but he blinks")
        XCTAssertGreaterThan(alive.moved, 0.01, "an ordinary rig does move")
    }
}

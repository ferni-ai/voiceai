import XCTest
@testable import FerniDesign

/// Delight gap 4: when Ferni joins a call his body arrives (a hop, a settle,
/// one note on the landing), instead of the sound arriving over a still body.
@MainActor
final class JoinTests: XCTestCase {
    private func run(_ rig: AliveRig, from t0: Double, to t1: Double, each: (Double, AliveUniforms) -> Void = { _, _ in }) -> AliveUniforms {
        var u = AliveUniforms(), t = t0
        while t < t1 { t += 1.0 / 60; u = rig.frame(at: t); each(t, u) }
        return u
    }

    func testTheJoinHopsInPlaceWithOneChimeThenOneLanding() {
        let rig = AliveRig(seed: 1)
        _ = run(rig, from: 0, to: 1)
        rig.play(.join)
        var low: Float = 9, high: Float = -9, cues: [(Double, KeyedCue)] = []
        _ = run(rig, from: 1, to: 2.6) { t, u in low = min(low, u.pos.y); high = max(high, u.pos.y); cues += rig.cues.map { (t, $0) } }
        XCTAssertGreaterThan(low, -0.15, "Ferni stays in the room; nothing comes from off-canvas")
        XCTAssertGreaterThan(high, 0.12, "a visible hop")
        let chimes = cues.filter { $0.1 == .arrivalChime }, lands = cues.filter { $0.1 == .land }
        XCTAssertEqual(chimes.count, 1)
        XCTAssertEqual(lands.count, 1)
        XCTAssertLessThan(chimes.first?.0 ?? 9, lands.first?.0 ?? 0, "the note, then the landing")
        XCTAssertLessThan((lands.first?.0 ?? 9) - 1, 0.7, "it all happens within the first second")
    }

    func testWhenTheJoinPlays() {
        typealias P = AvatarView.JoinPlan
        XCTAssertEqual(AvatarView.joinPlan(from: .arriving, to: .listening, waited: 2, reduceMotion: false, arrived: false), P.hop)
        XCTAssertEqual(AvatarView.joinPlan(from: .arriving, to: .speaking, waited: 2, reduceMotion: false, arrived: false), P.hop)
        XCTAssertEqual(AvatarView.joinPlan(from: .arriving, to: .listening, waited: 0.2, reduceMotion: false, arrived: false), P.settle,
                       "a join faster than ~300 ms never feels slowed down")
        XCTAssertEqual(AvatarView.joinPlan(from: .arriving, to: .listening, waited: 2, reduceMotion: true, arrived: false), P.none,
                       "Reduce Motion: the director's note and tap only")
        XCTAssertEqual(AvatarView.joinPlan(from: .arriving, to: .listening, waited: 2, reduceMotion: false, arrived: true), P.none,
                       "once per call: a handoff isn't a second arrival")
        XCTAssertEqual(AvatarView.joinPlan(from: .listening, to: .speaking, waited: 2, reduceMotion: false, arrived: false), P.none)
        XCTAssertEqual(AvatarView.joinPlan(from: .reconnecting, to: .listening, waited: 2, reduceMotion: false, arrived: false), P.none)
    }

    /// While connecting Ferni leans in: his light rises and he looks up.
    func testWhileConnectingFerniLooksForward() {
        func sample(_ activity: AvatarActivity) -> (glow: Float, gazeY: Float) {
            let rig = AliveRig(seed: 2)
            rig.activity = activity
            let u = run(rig, from: 0, to: 2)
            return (u.bg1.w, u.gaze.y)
        }
        let waiting = sample(.arriving), resting = sample(.idle)
        XCTAssertGreaterThan(waiting.glow, resting.glow + 0.15)
        XCTAssertGreaterThan(waiting.gazeY, resting.gazeY + 0.2)
    }
}

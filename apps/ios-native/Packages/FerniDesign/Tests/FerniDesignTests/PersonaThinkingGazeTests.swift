import simd
import XCTest
@testable import FerniDesign

/// Thinking, each persona looks away its own way, a long think (a tool call)
/// holds the look, and the eyes come back to the caller as the first word
/// comes (avatar red team 2026-10-22). Every persona looked up-right before.
@MainActor
final class PersonaThinkingGazeTests: XCTestCase {
    // MARK: The policy

    func testEachPersonaThinksInItsOwnDirection() {
        let spots = WindowPersona.allCases.map { ($0, ThinkingGaze.spot($0)) }
        for (i, a) in spots.enumerated() {
            for b in spots[(i + 1)...] {
                XCTAssertGreaterThan(simd_distance(a.1, b.1), 0.2, "\(a.0) and \(b.0) look to the same place")
            }
        }
        let quadrants = Set(spots.map { "\($0.1.x >= 0 ? "right" : "left") \($0.1.y >= 0 ? "up" : "down")" })
        XCTAssertGreaterThanOrEqual(quadrants.count, 3, "not all up and to one side: \(quadrants)")
        XCTAssertEqual(ThinkingGaze.spot(.ferni), SIMD2(0.5, 0.42), "Ferni keeps his look")
    }

    func testALongThinkHoldsTheLook() {
        XCTAssertEqual(ThinkingGaze.hold(thinkingFor: 0.5), 1.1...3.4)
        XCTAssertEqual(ThinkingGaze.hold(thinkingFor: 1.6), 3.0...5.0)
    }

    func testTheEyesComeBackOnTheFirstWord() {
        XCTAssertTrue(ThinkingGaze.backToCaller(thinking: true, activity: .speaking, voiceLevel: 0))
        XCTAssertTrue(ThinkingGaze.backToCaller(thinking: true, activity: .thinking, voiceLevel: 0.1), "his voice before the state")
        XCTAssertFalse(ThinkingGaze.backToCaller(thinking: true, activity: .thinking, voiceLevel: 0))
        XCTAssertFalse(ThinkingGaze.backToCaller(thinking: false, activity: .speaking, voiceLevel: 0.3), "only from a think")
    }

    // MARK: Through the rig

    /// The eyes' target (gaze channels) at each frame, at 120 fps.
    private func gaze(_ persona: WindowPersona, seed: UInt64, until end: Double,
                      script: (AliveRig, Double) -> Void) -> [(t: Double, g: SIMD2<Double>)] {
        let rig = AliveRig(persona: persona, seed: seed)
        var t = 0.0, out: [(Double, SIMD2<Double>)] = []
        while t < end {
            t += 1.0 / 120
            script(rig, t)
            _ = rig.frame(at: t)
            out.append((t, SIMD2(rig[.gx].t, rig[.gy].t)))
        }
        return out
    }

    func testTheRigLooksToEachPersonasSpotSoonAfterAThinkStarts() {
        for persona in WindowPersona.allCases {
            let spot = ThinkingGaze.spot(persona)
            for seed: UInt64 in 1...3 {
                let trace = gaze(persona, seed: seed, until: 3.5) { rig, t in rig.activity = t < 2 ? .listening : .thinking }
                let at = trace.first { $0.t >= 2.5 }!.g
                // The spot, give or take its jitter (±0.1, ±0.06) and the slow drift.
                XCTAssertLessThan(simd_distance(at, spot), 0.2, "\(persona) seed \(seed): looks at \(at), its spot \(spot)")
            }
        }
    }

    /// Saccades: frames where the gaze target jumps (the drift moves far less a frame).
    private func saccades(_ trace: [(t: Double, g: SIMD2<Double>)], from: Double, to: Double) -> Int {
        zip(trace.dropFirst(), trace).filter { $0.0.t > from && $0.0.t <= to && simd_distance($0.0.g, $0.1.g) > 0.05 }.count
    }

    func testALongThinkLooksAroundLess() {
        var long = 0, seeds = 0
        for seed: UInt64 in 1...6 {
            let trace = gaze(.ferni, seed: seed, until: 25) { rig, _ in rig.activity = .thinking }
            long += saccades(trace, from: 5, to: 25)
            seeds += 1
        }
        // 20 s at holds of 3-5 s is 4-7 looks; at 1.1-3.4 s it was about 9.
        XCTAssertLessThanOrEqual(Double(long) / Double(seeds), 6.5, "\(long) looks in \(seeds) × 20 s of a long think")
    }

    func testTheEyesReturnAsHeStartsToSpeakAndStay() {
        let caller = SIMD2<Double>.zero
        for persona in WindowPersona.allCases {
            let trace = gaze(persona, seed: 2, until: 5) { rig, t in rig.activity = t < 3 ? .thinking : .speaking }
            let away = trace.first { $0.t >= 2.9 }!.g
            XCTAssertGreaterThan(simd_distance(away, caller), 0.2, "\(persona): away while thinking")
            for sample in trace where sample.t >= 3.02 && sample.t <= 3.85 {
                XCTAssertLessThan(simd_distance(sample.g, caller), 0.1,
                                  "\(persona): on the caller at \(sample.t), \(sample.g)")
            }
        }
    }

    func testHisVoiceBringsTheEyesBackBeforeTheStateDoes() {
        let caller = SIMD2<Double>.zero
        let trace = gaze(.maya, seed: 2, until: 4) { rig, t in
            rig.activity = .thinking
            rig.voiceLevel = t < 3 ? 0 : 0.4
        }
        for sample in trace where sample.t >= 3.02 && sample.t <= 3.85 {
            XCTAssertLessThan(simd_distance(sample.g, caller), 0.1, "on the caller at \(sample.t), \(sample.g)")
        }
    }
}

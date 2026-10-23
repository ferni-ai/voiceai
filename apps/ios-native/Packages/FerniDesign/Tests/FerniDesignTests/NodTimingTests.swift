import XCTest
@testable import FerniDesign

/// Listening nods land in the caller's pauses, 0.2-0.6 s in, never over a
/// word (avatar red team 2026-10-22): they came every 1.6-3 s on a clock.
@MainActor
final class NodTimingTests: XCTestCase {
    private func due(_ now: Double, speaking: Bool = false, pause: Double? = 10, delay: Double = 0.3,
                     nodded: Bool = false, lastNod: Double = -.infinity) -> Bool {
        NodTiming.due(now: now, personSpeaking: speaking, pauseStart: pause, delay: delay, nodded: nodded, lastNod: lastNod)
    }

    // MARK: The policy

    func testANodComesItsDelayIntoAPause() {
        XCTAssertFalse(due(10.1), "too soon: they may only be between words")
        XCTAssertTrue(due(10.3), "at the pause's delay")
        XCTAssertTrue(due(10.6))
    }

    func testNeverWhileTheyreSpeaking() {
        XCTAssertFalse(due(10.4, speaking: true))
        XCTAssertFalse(due(10.4, pause: nil), "no pause yet, or they spoke again")
    }

    func testOncePerPause() {
        XCTAssertFalse(due(10.4, nodded: true))
    }

    func testALateNodIsDropped() {
        XCTAssertTrue(due(10.79))
        XCTAssertFalse(due(10.85), "past 0.8 s it reads as random")
    }

    func testNodsAreSpacedOut() {
        XCTAssertFalse(due(10.4, lastNod: 9.5), "under 1.2 s since the last")
        XCTAssertTrue(due(10.4, lastNod: 9.1))
    }

    func testTheDelayIsTheBackchannelWindow() {
        XCTAssertEqual(NodTiming.delay.lowerBound, 0.2)
        XCTAssertEqual(NodTiming.delay.upperBound, 0.6)
    }

    // MARK: Through the rig

    /// A scripted caller: (from, to, speaking). Returns every nod's time.
    private func nods(_ script: [(Double, Double, Bool)], seed: UInt64) -> [Double] {
        let rig = AliveRig(persona: .ferni, seed: seed)
        rig.activity = .listening
        var t = 0.0, nods: [Double] = [], last = rig.lastNod
        let end = script.last?.1 ?? 0
        while t < end {
            t += 1.0 / 120
            rig.personSpeaking = script.first { t >= $0.0 && t < $0.1 }?.2 ?? false
            _ = rig.frame(at: t)
            if rig.lastNod != last { last = rig.lastNod; nods.append(t) }
        }
        return nods
    }

    func testTheRigNodsInPausesNeverOverWords() {
        // Speaks 0-3 s, pauses 3-4.5, speaks 4.5-8, a breath 8-8.1, speaks 8.1-11, pauses 11-13.
        let script: [(Double, Double, Bool)] = [(0, 3, true), (3, 4.5, false), (4.5, 8, true), (8, 8.1, false),
                                                (8.1, 11, true), (11, 13, false)]
        for seed: UInt64 in [1, 2, 3, 4, 5] {
            let times = nods(script, seed: seed)
            XCTAssertEqual(times.count, 2, "seed \(seed): one nod in each real pause, none in the breath: \(times)")
            for t in times {
                guard let p = script.first(where: { !$0.2 && t >= $0.0 && t < $0.1 }) else {
                    XCTFail("seed \(seed): a nod at \(t) while they spoke"); continue
                }
                XCTAssertGreaterThanOrEqual(t - p.0, 0.2 - 1e-9, "seed \(seed): \(t - p.0) s into the pause")
                XCTAssertLessThanOrEqual(t - p.0, 0.6 + 1.0 / 120, "seed \(seed)")
            }
        }
    }

    func testNoNodsWithoutAnyVoice() {
        XCTAssertEqual(nods([(0, 15, false)], seed: 1), [], "no pause signal, no backchannel")
    }

}

import XCTest
@testable import FerniDesign

/// Persona acting, nods (SPEC + decisions 2 and 3): each persona nods its own
/// size, every nod halves under a caring face (presence, concern), and Maya
/// nods "yes, yes!" to the small win's signals.
@MainActor
final class PersonaNodTests: XCTestCase {
    // MARK: The policy

    func testEachPersonaNodsItsOwnSize() {
        XCTAssertEqual(NodTiming.gain(.jordan, family: "listening", acting: true), 1.35)
        XCTAssertEqual(NodTiming.gain(.alex, family: "listening", acting: true), 0.7)
        XCTAssertEqual(NodTiming.gain(.maya, family: "listening", acting: true), 1.2)
    }

    func testACaringFaceHalvesEveryonesNod() {
        for p in WindowPersona.allCases {
            let own = NodTiming.gain(p, family: "listening", acting: true)
            for family in ["concern", "presence"] {
                XCTAssertLessThanOrEqual(NodTiming.gain(p, family: family, acting: true), own * 0.5 + 1e-9, "\(p) under \(family)")
            }
            XCTAssertEqual(NodTiming.gain(p, family: "happy", acting: true), own, "\(p): only the caring families")
        }
    }

    func testFlagOffEveryNodIsTheSharedOne() {
        for p in WindowPersona.allCases {
            for family in ["listening", "concern", "presence"] { XCTAssertEqual(NodTiming.gain(p, family: family, acting: false), 1) }
        }
    }

    func testOnlyMayaDoubleNodsAndOnlyToGoodNews() {
        XCTAssertTrue(NodTiming.doubleNod(.maya, acting: true, news: .delight))
        XCTAssertTrue(NodTiming.doubleNod(.maya, acting: true, news: .smallWin))
        XCTAssertFalse(NodTiming.doubleNod(.maya, acting: true, news: nil))
        XCTAssertFalse(NodTiming.doubleNod(.maya, acting: false, news: .delight), "flag off")
        for p in WindowPersona.allCases where p != .maya { XCTAssertFalse(NodTiming.doubleNod(p, acting: true, news: .delight), "\(p)") }
    }

    // MARK: Through the rig

    /// Listening with the flag on; the caller speaks 0-2 s, then pauses: the
    /// pitch's deepest dip in the 0.8 s after the nod, below where it was.
    private func nodDepth(_ persona: WindowPersona, expression: String) throws -> Double {
        let rig = AliveRig(persona: persona, seed: 5)
        rig.personaActing = true
        rig.activity = .listening
        rig.expression = expression
        var t = 0.0, start: (t: Double, pitch: Double)?, deepest = 0.0
        while t < 4 {
            t += 1.0 / 240
            rig.personSpeaking = t < 2
            let before = rig.nodsGiven, pitch = rig[.pitch].x
            _ = rig.frame(at: t)
            if start == nil, rig.nodsGiven > before { start = (t, pitch) }
            if let s = start, t - s.t <= 0.8 { deepest = max(deepest, s.pitch - rig[.pitch].x) }
        }
        _ = try XCTUnwrap(start, "\(persona) nodded")
        return deepest
    }

    func testJordanNodsAtMostHalfAsDeepUnderConcern() throws {
        let own = try nodDepth(.jordan, expression: "neutral"), hushed = try nodDepth(.jordan, expression: "concerned")
        XCTAssertGreaterThan(own, 0.02, "a nod you can see: \(own)")
        XCTAssertLessThanOrEqual(hushed, own * 0.5 + 0.005, "Jordan under concern dips \(hushed), his own nod \(own)")
    }

    func testJordanNodsDeeperThanAlex() throws {
        XCTAssertGreaterThan(try nodDepth(.jordan, expression: "neutral"), try nodDepth(.alex, expression: "neutral") * 1.5)
    }

    /// The small win (high_engagement) brings delight and celebration_small together.
    private func nodsToTheSmallWin(_ persona: WindowPersona, acting: Bool) -> Int {
        let rig = AliveRig(persona: persona, seed: 5)
        rig.personaActing = acting
        var t = 0.0
        while t < 1 { t += 1.0 / 120; _ = rig.frame(at: t) }
        let before = rig.nodsGiven
        rig.micro(.delight)
        _ = rig.play(sequence: NodTiming.smallWinMoment)
        while t < 1.6 { t += 1.0 / 120; _ = rig.frame(at: t) }
        return rig.nodsGiven - before
    }

    func testMayaNodsYesYesToTheSmallWin() {
        XCTAssertEqual(nodsToTheSmallWin(.maya, acting: true), 2, "one double nod for the pair of signals")
        XCTAssertEqual(nodsToTheSmallWin(.maya, acting: false), 0, "flag off")
        XCTAssertEqual(nodsToTheSmallWin(.ferni, acting: true), 0, "Maya's own")
    }
}

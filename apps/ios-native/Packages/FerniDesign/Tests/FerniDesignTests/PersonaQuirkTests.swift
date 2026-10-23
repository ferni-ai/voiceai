import XCTest
@testable import FerniDesign

/// Persona acting, idle quirks (SPEC + decision 1): each persona's own small
/// move at rest, every 10-20 s; never in a call, never with the flag off.
@MainActor
final class PersonaQuirkTests: XCTestCase {
    // MARK: The policy

    func testAQuirkIsDueOnlyAtHomeWithNothingElseGoingOn() {
        XCTAssertTrue(IdleQuirk.due(now: 12, nextAt: 11, activity: .idle, acting: true, busy: false))
        XCTAssertFalse(IdleQuirk.due(now: 10, nextAt: 11, activity: .idle, acting: true, busy: false), "not yet")
        XCTAssertFalse(IdleQuirk.due(now: 12, nextAt: 11, activity: .idle, acting: true, busy: true), "over something else")
        XCTAssertFalse(IdleQuirk.due(now: 12, nextAt: 11, activity: .idle, acting: false, busy: false), "flag off")
        for a in [AvatarActivity.arriving, .listening, .thinking, .speaking, .reconnecting, .error] {
            XCTAssertFalse(IdleQuirk.due(now: 12, nextAt: 11, activity: a, acting: true, busy: false), "never in a call: \(a)")
        }
    }

    func testEachPersonaHasItsOwnQuirk() {
        XCTAssertEqual(Set(WindowPersona.allCases.map { "\(IdleQuirk.kind($0))" }).count, WindowPersona.allCases.count)
    }

    // MARK: Through the rig

    private func quirks(_ persona: WindowPersona, activity: AvatarActivity, acting: Bool, seconds: Double = 60) -> Int {
        let rig = AliveRig(persona: persona, seed: 9)
        rig.personaActing = acting
        rig.activity = activity
        var t = 0.0
        while t < seconds { t += 1.0 / 60; _ = rig.frame(at: t) }
        return rig.quirksPlayed
    }

    func testAtHomeEachPersonaHasItsQuirks() {
        for p in WindowPersona.allCases { XCTAssertGreaterThanOrEqual(quirks(p, activity: .idle, acting: true), 2, "\(p)") }
    }

    func testNeverInACall() {
        for p in WindowPersona.allCases {
            for a in [AvatarActivity.listening, .thinking, .speaking] {
                XCTAssertEqual(quirks(p, activity: a, acting: true), 0, "\(p) \(a)")
            }
        }
    }

    func testNoneWithTheFlagOff() {
        XCTAssertEqual(quirks(.jordan, activity: .idle, acting: false), 0)
    }

    /// The first quirk's window at home: how far its own channel moves from where it was.
    private func firstQuirk(_ persona: WindowPersona, _ channel: (AliveUniforms) -> Float) -> Float {
        let rig = AliveRig(persona: persona, seed: 9)
        rig.personaActing = true
        var t = 0.0, start: Float?, peak: Float = 0
        while t < 25 {
            t += 1.0 / 120
            let before = rig.quirksPlayed
            let u = rig.frame(at: t)
            if start == nil, rig.quirksPlayed > before { start = channel(u) }
            if let s = start {
                peak = max(peak, abs(channel(u) - s))
                if rig.quirksPlayed > 1 { break }
            }
            if let _ = start, t > 25 { break }
        }
        return peak
    }

    func testEachQuirkMovesItsOwnPart() {
        XCTAssertGreaterThan(firstQuirk(.ferni) { $0.lean.x }, 0.03, "Ferni tilts his head")
        XCTAssertGreaterThan(firstQuirk(.maya) { $0.pos.y }, 0.03, "Maya lifts")
        XCTAssertGreaterThan(firstQuirk(.peter) { $0.eyes.y }, 0.03, "Peter's eyes widen")
        XCTAssertGreaterThan(firstQuirk(.jordan) { $0.pos.x }, 0.03, "Jordan sways")
        XCTAssertGreaterThan(firstQuirk(.alex) { $0.gaze.y }, 0.15, "Alex glances down at the list")
        XCTAssertGreaterThan(firstQuirk(.nayan) { $0.lids.x }, 0.25, "Nayan's lids sink")
    }
}

import XCTest
@testable import FerniDesign

/// Critic M4: hanging up after a handoff played the goodbye and a reverse
/// handoff at once. The call's teammate says goodbye in the middle; only then
/// does Ferni take it back.
@MainActor
final class HangUpAfterHandoffTests: XCTestCase {
    private func run(_ rig: AliveRig, from t0: Double, to t1: Double) -> Double {
        var t = t0
        while t < t1 { t += 1.0 / 60; _ = rig.frame(at: t) }
        return t
    }

    func testTheGoodbyeComesFirstThenFerniTakesItBack() {
        let rig = AliveRig(seed: 81)
        var t = run(rig, from: 0, to: 0.5)
        rig.activity = .speaking
        rig.handOff(to: .maya)
        t = run(rig, from: t, to: t + 4)
        XCTAssertEqual(rig.persona, .maya, "Maya took the call")
        // Hang up: the view plays the goodbye and asks for Ferni at rest, in that order.
        rig.activity = .idle
        rig.play(.goodbye)
        rig.rest(with: .ferni)
        let goodbye = KeyedMoment.goodbye.end / 60 * rig.tempo
        var swapped: Double?
        let hungUp = t
        while t < hungUp + goodbye + 4 {
            t += 1.0 / 60
            _ = rig.frame(at: t)
            if swapped == nil, rig.persona == .ferni { swapped = t - hungUp }
        }
        XCTAssertEqual(rig.persona, .ferni, "Ferni has the middle again")
        XCTAssertGreaterThanOrEqual(swapped ?? 0, goodbye - 0.05, "nothing moved until Maya's goodbye ended (\\(goodbye) s): \\(swapped ?? -1)")
    }

    /// The view's guard: a hang-up's persona change that runs before the
    /// activity's handler is left to it.
    func testAPersonaChangeAtHangUpWaitsForTheActivity() {
        XCTAssertTrue(AvatarView.callJustEnded(seenActivity: .speaking))
        XCTAssertTrue(AvatarView.callJustEnded(seenActivity: .listening))
        XCTAssertFalse(AvatarView.callJustEnded(seenActivity: .idle), "at home a choice rests at once")
        XCTAssertFalse(AvatarView.callJustEnded(seenActivity: .arriving), "a cancelled call has no goodbye")
    }
}

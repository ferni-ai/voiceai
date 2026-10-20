import XCTest
@testable import FerniDesign

/// Design audit P1-1: at home, choosing who answers next changed only Talk's
/// label. Now they sit at the family table: the teammate in the middle,
/// Ferni small in the corner; choosing Ferni again, the teammate steps out.
@MainActor
final class RestWithTests: XCTestCase {
    private func run(_ rig: AliveRig, from t0: Double, to t1: Double) -> Double {
        var t = t0
        while t < t1 { t += 1.0 / 60; _ = rig.frame(at: t) }
        return t
    }

    func testChoosingATeammateSeatsThemWithFerniInTheCorner() {
        let rig = AliveRig(seed: 61)
        var t = run(rig, from: 0, to: 1)
        rig.rest(with: .maya)
        t = run(rig, from: t, to: t + 0.3)
        XCTAssertEqual(rig.persona, .ferni, "staged, not a cut: Ferni greets her first")
        XCTAssertEqual(rig.guestPersona, .maya, "she peeks in")
        t = run(rig, from: t, to: t + 3)
        XCTAssertEqual(rig.persona, .maya, "she has the middle")
        XCTAssertEqual(rig.guestPersona, .ferni, "and Ferni waits in the corner")
        rig.rest(with: .ferni)
        _ = run(rig, from: t, to: t + 4)
        XCTAssertEqual(rig.persona, .ferni, "Ferni again")
        XCTAssertNil(rig.guestPersona, "and she steps out")
    }

    func testAChoiceMidHandoffWaitsForTheSwap() {
        let rig = AliveRig(seed: 62)
        var t = run(rig, from: 0, to: 1)
        rig.rest(with: .maya)
        t = run(rig, from: t, to: t + 0.5)
        rig.rest(with: .ferni)
        _ = run(rig, from: t, to: t + 8)
        XCTAssertEqual(rig.persona, .ferni)
        XCTAssertNil(rig.guestPersona)
    }

    /// Opening the app with a teammate chosen, and after a call with one
    /// (whose corner was empty), Ferni is in his corner.
    func testFerniTakesHisCornerAtOnceAndAfterACall() {
        let opened = AliveRig(seed: 63)
        opened.rest(with: .peter, animated: false)
        XCTAssertEqual(opened.persona, .peter)
        XCTAssertEqual(opened.guestPersona, .ferni)

        let after = AliveRig(persona: .maya, seed: 64)
        let t = run(after, from: 0, to: 1)
        XCTAssertNil(after.guestPersona)
        after.rest(with: .maya)
        _ = run(after, from: t, to: t + 1.5)
        XCTAssertEqual(after.persona, .maya)
        XCTAssertEqual(after.guestPersona, .ferni)
    }

    /// One teammate to another: the colours change; Ferni stays in his corner.
    func testTeammateToTeammateKeepsFerniInTheCorner() {
        let rig = AliveRig(seed: 65)
        rig.rest(with: .maya, animated: false)
        let t = run(rig, from: 0, to: 0.5)
        rig.rest(with: .jordan)
        _ = run(rig, from: t, to: t + 1.5)
        XCTAssertEqual(rig.persona, .jordan)
        XCTAssertEqual(rig.guestPersona, .ferni)
    }
}

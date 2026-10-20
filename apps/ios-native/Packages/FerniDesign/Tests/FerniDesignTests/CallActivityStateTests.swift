import XCTest
@testable import FerniDesign

/// Delight gap 6: the Lock Screen tells the truth after you hang up.
final class CallActivityStateTests: XCTestCase {
    func testAnEndedCallSaysGoodbyeAndHasNothingToPress() {
        XCTAssertEqual(CallActivityState.ended.words("Ferni"), "Talk soon.")
        XCTAssertFalse(CallActivityState.ended.hasControls, "no End or Mute on a call that's over")
        for state in [CallActivityState.calling, .arriving, .listening, .thinking, .speaking, .reconnecting, .onHold] {
            XCTAssertTrue(state.hasControls, "\(state): End always works while there's a call")
        }
    }

    /// Calling, then on the way, then (if Ferni never comes) saying so, with
    /// nothing to press (2026-10-19).
    func testCallingOnTheWayAndCouldntJoin() {
        XCTAssertEqual(CallActivityState.calling.words("Ferni"), "Calling Ferni")
        XCTAssertEqual(CallActivityState.arriving.words("Ferni"), "Ferni's on the way")
        XCTAssertEqual(CallActivityState.couldNotJoin.words("Ferni"), "Ferni couldn't join right now")
        XCTAssertFalse(CallActivityState.couldNotJoin.hasControls)
    }

    /// Activities in flight keep decoding after the new field arrives.
    func testAnOlderStateWithoutMutedStillDecodes() throws {
        let old = #"{"state":"listening","personaID":"ferni","personaName":"Ferni"}"#
        let state = try JSONDecoder().decode(CallActivityAttributes.ContentState.self, from: Data(old.utf8))
        XCTAssertFalse(state.muted)
    }
}

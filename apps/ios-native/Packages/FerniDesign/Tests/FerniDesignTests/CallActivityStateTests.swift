import XCTest
@testable import FerniDesign

/// Delight gap 6: the Lock Screen tells the truth after you hang up.
final class CallActivityStateTests: XCTestCase {
    func testAnEndedCallSaysGoodbyeAndHasNothingToPress() {
        XCTAssertEqual(CallActivityState.ended.words("Ferni"), "Talk soon.")
        XCTAssertFalse(CallActivityState.ended.hasControls, "no End or Mute on a call that's over")
        for state in [CallActivityState.arriving, .listening, .thinking, .speaking, .reconnecting, .onHold] {
            XCTAssertTrue(state.hasControls, "\(state): End always works while there's a call")
        }
    }

    /// Activities in flight keep decoding after the new field arrives.
    func testAnOlderStateWithoutMutedStillDecodes() throws {
        let old = #"{"state":"listening","personaID":"ferni","personaName":"Ferni"}"#
        let state = try JSONDecoder().decode(CallActivityAttributes.ContentState.self, from: Data(old.utf8))
        XCTAssertFalse(state.muted)
    }
}

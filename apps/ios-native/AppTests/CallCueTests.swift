import FerniDesign
import FerniVoice
import XCTest
@testable import Ferni

/// What each cue from Ferni's body becomes. Earcons still go through the
/// sound director's gates (never over speech, a few per call).
final class CallCueTests: XCTestCase {
    func testTheJoinsCuesAreTheArrivalNoteAndTap() {
        XCTAssertEqual(CallFeedback.effect(for: .arrivalChime), .earcon(.arrival))
        XCTAssertEqual(CallFeedback.effect(for: .land), .haptic(.presence))
        XCTAssertEqual(CallFeedback.effect(for: .touch), .haptic(.touch))
    }

    func testTheRestStaySilent() {
        for cue in [KeyedCue.pop, .sparkle, .hop, .whoosh, .giggle, .heart] {
            XCTAssertNil(CallFeedback.effect(for: cue), "\(cue)")
        }
    }
}

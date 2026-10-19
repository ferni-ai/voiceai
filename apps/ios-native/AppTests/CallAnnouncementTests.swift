import FerniVoice
import XCTest
@testable import Ferni

/// Critic M4: VoiceOver hears what needs attention (trouble, being put on
/// hold), not every turn of the conversation over Ferni's voice.
final class CallAnnouncementTests: XCTestCase {
    func testOnlyTroubleIsAnnounced() {
        XCTAssertEqual(CallAnnouncement.text(phase: .reconnecting, onHold: false), "Reconnecting…")
        XCTAssertEqual(CallAnnouncement.text(phase: .live, onHold: true), "On hold")
        XCTAssertEqual(CallAnnouncement.text(phase: .failed(.offline), onHold: false), CallProblem.offline.message)
        for quiet: CallSession.Phase in [.idle, .connecting, .waitingForFerni, .live, .ended] {
            XCTAssertNil(CallAnnouncement.text(phase: quiet, onHold: false), "\(quiet)")
        }
    }
}

import FerniDesign
import FerniVoice
import XCTest
@testable import Ferni

/// Critic M11: what the Lock Screen and Dynamic Island show for each moment
/// of a call, and that there's nothing to show without one.
@MainActor
final class LiveActivityContentTests: XCTestCase {
    private func state(_ phase: CallSession.Phase, onHold: Bool = false, pose: AvatarPose = .listening) -> CallActivityState? {
        LiveActivityController.content(phase: phase, onHold: onHold, pose: pose, personaID: "ferni")?.state
    }

    func testEachMomentOfTheCall() {
        XCTAssertEqual(state(.connecting), .arriving)
        XCTAssertEqual(state(.waitingForFerni), .arriving)
        XCTAssertEqual(state(.reconnecting), .reconnecting)
        XCTAssertEqual(state(.live, pose: .speaking), .speaking)
        XCTAssertEqual(state(.live, pose: .thinking), .thinking)
        XCTAssertEqual(state(.live, pose: .listening), .listening)
        XCTAssertEqual(state(.live, pose: .arriving), .listening, "anything else in a live call is listening")
    }

    func testHoldWinsOverWhatFerniIsDoing() {
        XCTAssertEqual(state(.live, onHold: true, pose: .speaking), .onHold)
    }

    func testNoCallNoActivity() {
        for phase: CallSession.Phase in [.idle, .ended, .failed(.offline)] {
            XCTAssertNil(state(phase), "\(phase)")
        }
    }

    func testItNamesWhoIsOnTheCall() {
        let content = LiveActivityController.content(phase: .live, onHold: false, pose: .speaking, personaID: "maya")
        XCTAssertEqual(content?.personaID, "maya")
        XCTAssertEqual(content?.personaName, "Maya")
    }
}

import FerniDesign
import XCTest
@testable import FerniVoice

/// #2868 item 2: once a call is marked crisis, decoration stops and only what
/// the person relies on still plays.
final class CrisisFeedbackTests: XCTestCase {
    private let kept: [AvatarEffect] = [.announce("Maya joined."), .haptic(.error), .haptic(.reconnected)]
    private let silenced: [AvatarEffect] = [
        .earcon(.arrival), .earcon(.handoff(to: "maya")), .earcon(.goodbye),
        .haptic(.presence), .haptic(.firstWord), .haptic(.handoff), .haptic(.goodbye), .haptic(.touch),
    ]

    func testVoiceOverTheCallFailingAndReconnectingStillPlay() {
        for effect in kept { XCTAssertTrue(effect.playsDuringCrisis, "\(effect)") }
    }

    func testEverySoundAndTheDecorativeHapticsStop() {
        for effect in silenced { XCTAssertFalse(effect.playsDuringCrisis, "\(effect)") }
    }

    /// Every haptic the call has is decided above, on one side or the other.
    func testEveryHapticIsDecided() {
        let decided = (kept + silenced).compactMap { effect -> HapticCue? in
            if case .haptic(let cue) = effect { cue } else { nil }
        }
        XCTAssertEqual(Set(decided), Set(HapticCue.allCases))
        XCTAssertEqual(decided.count, HapticCue.allCases.count, "each haptic listed once")
    }
}

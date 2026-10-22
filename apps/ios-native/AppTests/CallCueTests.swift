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

    /// In a call the arrival note plays inside the call's audio engine, never
    /// from a player of its own (the mic heard those as the person speaking).
    @MainActor
    func testInACallTheNotePlaysInTheCallsEngine() {
        let key = CallFeedback.soundsKey
        let saved = UserDefaults.standard.object(forKey: key)
        defer { UserDefaults.standard.set(saved, forKey: key) }
        UserDefaults.standard.set(true, forKey: key)
        let feedback = CallFeedback()
        var played: [String] = []
        feedback.playInCall = { played.append($0.deletingPathExtension().lastPathComponent); return true }
        feedback.isAtRest = { false }
        feedback.play(.earcon(.arrival))
        XCTAssertEqual(played, ["arrival"])
    }

    /// At rest nothing goes to the call's engine (there's no call).
    @MainActor
    func testAtRestTheCallsEngineIsLeftAlone() {
        let key = CallFeedback.soundsKey
        let saved = UserDefaults.standard.object(forKey: key)
        defer { UserDefaults.standard.set(saved, forKey: key) }
        UserDefaults.standard.set(true, forKey: key)
        let feedback = CallFeedback()
        var played = 0
        feedback.playInCall = { _ in played += 1; return true }
        feedback.isAtRest = { true }
        feedback.play(.earcon(.arrival))
        XCTAssertEqual(played, 0)
    }
}

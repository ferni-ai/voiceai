import FerniDesign
import XCTest
@testable import FerniVoice

/// Trust panel R4 and R5: one truth for the state line, the name chip and
/// the Live Activity, row by row.
final class CallTruthTests: XCTestCase {
    private func truth(_ phase: CallSession.Phase, pose: AvatarPose = .listening, onHold: Bool = false, muted: Bool = false,
                       persona: String = "ferni", voice: String = "ferni") -> CallTruth {
        CallTruth.of(phase: phase, onHold: onHold, muted: muted, pose: pose, personaID: persona, voicePersonaID: voice)
    }

    func testEachMomentOfACall() {
        let rows: [(CallSession.Phase, AvatarPose, String?, CallActivityState?)] = [
            (.idle, .idle, nil, nil),
            (.connecting, .arriving, "Calling Ferni…", .calling),
            (.waitingForFerni, .arriving, "Ferni's on the way…", .arriving),
            (.live, .speaking, nil, .speaking),
            (.live, .thinking, "Ferni's thinking", .thinking),
            (.live, .listening, "Ferni's listening", .listening),
            (.live, .idle, "Ferni's here", .here),
            (.live, .arriving, "Ferni's here", .here),
            (.reconnecting, .reconnecting, "Reconnecting…", .reconnecting),
            (.failed(.ferniDidNotJoin), .error, nil, .couldNotJoin),
            (.failed(.offline), .error, nil, nil),
            (.ended, .departing, nil, nil),
        ]
        for (phase, pose, line, state) in rows {
            let t = truth(phase, pose: pose)
            XCTAssertEqual(t.line, line, "\(phase) \(pose)")
            XCTAssertEqual(t.activity?.state, state, "\(phase) \(pose)")
            XCTAssertEqual(t.chipPersonaID, "ferni")
            XCTAssertEqual(t.activity?.personaName ?? "Ferni", "Ferni")
        }
    }

    /// "Listening" only when Ferni's turn state is listening: nowhere else.
    func testListeningOnlyWhenListening() {
        let poses: [AvatarPose] = [.idle, .arriving, .listening, .thinking, .speaking, .handoffArriving(to: "maya"), .reconnecting, .error, .departing]
        for pose in poses {
            for muted in [false, true] {
                let t = truth(.live, pose: pose, muted: muted)
                let says = t.line?.contains("listening") == true || t.activity?.state == .listening
                XCTAssertEqual(says, pose == .listening && true, "\(pose) muted \(muted): \(t.line ?? "nil")")
                if muted, pose == .listening { XCTAssertEqual(t.line, "You're muted") }
            }
        }
    }

    func testHoldAndMuteSayWhatTheyAre() {
        XCTAssertEqual(truth(.live, pose: .speaking, onHold: true).line, "On hold")
        XCTAssertEqual(truth(.live, pose: .speaking, onHold: true).activity?.state, .onHold)
        XCTAssertEqual(truth(.live, pose: .speaking, muted: true).line, "You're muted")
        XCTAssertEqual(truth(.live, pose: .thinking, muted: true).activity?.state, .thinking)
        XCTAssertEqual(truth(.live, pose: .thinking, muted: true).activity?.muted, true)
        XCTAssertEqual(truth(.live, pose: .thinking, muted: true).activity.map { $0.state.words($0.personaName, muted: true) }, "You're muted")
    }

    /// Announced: Ferni's bringing in Maya, on screen and on the Lock Screen;
    /// the chip still names Ferni, whose voice it is.
    func testAHandoffSaysWhoIsBringingInWhom() {
        let t = truth(.live, pose: .handoffArriving(to: "maya"))
        XCTAssertEqual(t.line, "Ferni's bringing in Maya…")
        XCTAssertEqual(t.chipPersonaID, "ferni")
        XCTAssertEqual(t.activity?.state, .bringingIn)
        XCTAssertEqual(t.activity?.personaName, "Maya")
        XCTAssertEqual(t.activity.map { $0.state.words($0.personaName) }, "Bringing in Maya")
        XCTAssertEqual(truth(.live, pose: .handoffArriving(to: "maya"), muted: true).line, "Ferni's bringing in Maya…",
                       "the handoff is what's happening, muted or not")
    }

    /// Maya has the call but hasn't been heard: still the handoff, chip Ferni.
    /// Her first words: the chip and every line are hers.
    func testTheChipChangesWithHerVoice() {
        let taking = truth(.live, pose: .speaking, persona: "maya", voice: "ferni")
        XCTAssertEqual(taking.line, "Ferni's bringing in Maya…")
        XCTAssertEqual(taking.chipPersonaID, "ferni")
        let heard = truth(.live, pose: .speaking, persona: "maya", voice: "maya")
        XCTAssertNil(heard.line)
        XCTAssertEqual(heard.chipPersonaID, "maya")
        XCTAssertEqual(heard.activity?.state, .speaking)
        XCTAssertEqual(heard.activity?.personaName, "Maya")
        XCTAssertEqual(truth(.live, pose: .thinking, persona: "maya", voice: "maya").line, "Maya's thinking")
    }

    /// A handoff to whoever is already talking is no handoff.
    func testAHandoffToTheVoiceYouHearIsNone() {
        XCTAssertEqual(truth(.live, pose: .handoffArriving(to: "ferni")).line, "Ferni's here")
    }
}

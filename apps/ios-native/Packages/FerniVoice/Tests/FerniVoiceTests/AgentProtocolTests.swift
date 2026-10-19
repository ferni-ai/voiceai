import FerniKit
import XCTest
@testable import FerniVoice

/// The agent's real wire payloads, parsed the way a live call parses them.
///
/// The JSON below is what the agent publishes: it was printed by running
/// src/agents/realtime/speech-state-dispatcher.ts through
/// src/agents/shared/data-message-envelope.ts `encodeDataMessage`.
/// The attribute values are the @livekit/agents `AgentState` set.
final class AgentProtocolTests: XCTestCase {

    // MARK: - Real agent payloads

    private let speechStart = #"{"speechRateWPM":150,"emotion":"calm","timestamp":1792256813833,"type":"speech_state","innerType":"speech_start"}"#
    private let speechPause = #"{"durationMs":900,"pauseType":"emphasis","nodType":"visible","breathRate":15,"speechRateWPM":150,"timestamp":1792256813834,"type":"speech_state","innerType":"speech_pause"}"#
    private let speechEnd = #"{"durationMs":4200,"breathRate":15,"timestamp":1792256813834,"type":"speech_state","innerType":"speech_end"}"#

    private func json(_ text: String) -> [String: Any] {
        (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [String: Any] ?? [:]
    }

    // MARK: - speech_state parsing

    func testSpeechStartEnvelopeIsCallerStartedSpeaking() {
        XCTAssertEqual(AgentSignals.userSpeech(from: json(speechStart)), .started)
    }

    func testSpeechPauseEnvelopeCarriesDuration() {
        XCTAssertEqual(AgentSignals.userSpeech(from: json(speechPause)), .paused(durationMs: 900))
    }

    func testSpeechEndEnvelopeIsCallerStoppedSpeaking() {
        XCTAssertEqual(AgentSignals.userSpeech(from: json(speechEnd)), .ended)
    }

    func testPhaseAsMessageTypeIsAccepted() {
        XCTAssertEqual(AgentSignals.userSpeech(from: ["type": "speech_start"]), .started)
    }

    func testUnknownSpeechPhaseIsIgnored() {
        XCTAssertNil(AgentSignals.userSpeech(from: ["type": "speech_state", "innerType": "breath_detected"]))
        XCTAssertNil(AgentSignals.userSpeech(from: ["type": "speech_state", "state": "speaking"]))
    }

    // MARK: - lk.agent.state parsing

    func testAgentStateAttributeIsRead() {
        XCTAssertEqual(AgentSignals.agentActivity(from: ["lk.agent.state": "speaking"]), .speaking)
        XCTAssertEqual(AgentSignals.agentActivity(from: ["lk.agent.state": "thinking"]), .thinking)
        XCTAssertEqual(AgentSignals.agentActivity(from: ["lk.agent.state": "listening"]), .listening)
    }

    func testMissingOrUnknownAgentStateIsNil() {
        XCTAssertNil(AgentSignals.agentActivity(from: [:]))
        XCTAssertNil(AgentSignals.agentActivity(from: ["lk.agent.state": "dancing"]))
    }

}

/// The agent's handoff messages, as the server sends them today.
final class HandoffSignalTests: XCTestCase {
    private func parse(_ json: String) -> AgentSignals.Handoff? {
        AgentSignals.handoff(from: (try? JSONSerialization.jsonObject(with: Data(json.utf8))) as? [String: Any] ?? [:])
    }

    func testTheServersHandoffShapesParse() {
        XCTAssertEqual(parse(#"{"type":"handoff_started","target":"maya-santos","newAgent":"maya-santos","previousAgent":"ferni"}"#),
                       .started(to: "maya-santos"))
        XCTAssertEqual(parse(#"{"type":"handoff_complete","from":"ferni","target":"alex-chen"}"#), .completed(to: "alex-chen"))
        XCTAssertEqual(parse(#"{"type":"handoff_failed","target":"unknown","error":"Unknown persona","rollbackTo":"ferni"}"#), .failed)
        XCTAssertNil(parse(#"{"type":"handoff_progress","target":"maya-santos"}"#))
        XCTAssertNil(parse(#"{"type":"handoff_complete","from":"ferni"}"#), "no target, no handoff")
    }

    func testOnlyTheTeamReachesTheScreen() {
        XCTAssertEqual(PersonaRegistry.known(serverID: "maya-santos")?.id, "maya")
        XCTAssertEqual(PersonaRegistry.known(serverID: "Jordan-Taylor")?.id, "jordan")
        XCTAssertEqual(PersonaRegistry.known(serverID: "nayan")?.id, "nayan")
        XCTAssertEqual(PersonaRegistry.known(serverID: "ferni")?.id, "ferni")
        XCTAssertNil(PersonaRegistry.known(serverID: "peter-lynch"), "a financial legend, not Peter")
        XCTAssertNil(PersonaRegistry.known(serverID: "john-bogle"))
        XCTAssertNil(PersonaRegistry.known(serverID: ""))
    }
}

import FerniDesign
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

    /// Lets the session's main-queue updates land.
    private func drainMainQueue() {
        let done = expectation(description: "main queue drained")
        DispatchQueue.main.async { done.fulfill() }
        wait(for: [done], timeout: 1)
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

    func testAvatarKeepsAnEmotionalExpression() {
        let result = AgentSignals.avatar(for: .speaking, current: .warm)
        XCTAssertTrue(result.isSpeaking)
        XCTAssertEqual(result.expression, .warm)
    }

    // MARK: - Session: the published state a view reads

    func testSessionMarksCallerSpeakingFromRealSpeechStart() {
        let session = IOSLiveKitSession()
        XCTAssertFalse(session.isUserSpeaking)

        session.handleDataMessage(Data(speechStart.utf8))
        drainMainQueue()

        XCTAssertTrue(session.isUserSpeaking)
    }

    func testSessionClearsCallerSpeakingFromRealSpeechEnd() {
        let session = IOSLiveKitSession()
        session.handleDataMessage(Data(speechStart.utf8))
        drainMainQueue()
        XCTAssertTrue(session.isUserSpeaking)

        session.handleDataMessage(Data(speechEnd.utf8))
        drainMainQueue()

        XCTAssertFalse(session.isUserSpeaking)
    }

    func testSessionShowsFerniSpeakingFromAgentState() {
        let session = IOSLiveKitSession()
        XCTAssertFalse(session.isAgentSpeaking)
        XCTAssertEqual(session.currentExpression, .neutral)

        session.applyAgentAttributes(["lk.agent.state": "speaking"])
        drainMainQueue()

        XCTAssertTrue(session.isAgentSpeaking)
        XCTAssertEqual(session.currentExpression, .speaking)
    }

    func testSessionShowsFerniThinkingThenListening() {
        let session = IOSLiveKitSession()
        session.applyAgentAttributes(["lk.agent.state": "speaking"])
        drainMainQueue()

        session.applyAgentAttributes(["lk.agent.state": "thinking"])
        drainMainQueue()
        XCTAssertFalse(session.isAgentSpeaking)
        XCTAssertEqual(session.currentExpression, .thinking)

        session.applyAgentAttributes(["lk.agent.state": "listening"])
        drainMainQueue()
        XCTAssertFalse(session.isAgentSpeaking)
        XCTAssertEqual(session.currentExpression, .listening)
    }
}

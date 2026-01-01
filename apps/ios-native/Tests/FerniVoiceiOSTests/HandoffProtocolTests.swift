import XCTest
@testable import FerniVoice

/// Tests for the persona handoff protocol between native apps and backend.
/// Validates the data channel messaging for seamless persona switches.
final class HandoffProtocolTests: XCTestCase {

    // MARK: - Properties

    private var dataChannel: MockDataChannel!
    private var stateMachine: HandoffStateMachine!

    // MARK: - Setup

    override func setUp() {
        super.setUp()
        dataChannel = MockDataChannel()
        stateMachine = HandoffStateMachine()
    }

    override func tearDown() {
        dataChannel = nil
        stateMachine = nil
        super.tearDown()
    }

    // MARK: - Handoff Request Tests

    func testHandoffRequestMessage() {
        // When: Client sends a handoff request
        dataChannel.sendHandoffRequest(targetPersona: "maya")

        // Then: The message has correct format
        XCTAssertEqual(dataChannel.sentMessages.count, 1)

        let message = dataChannel.sentMessages.first!
        XCTAssertEqual(message["type"] as? String, "handoff_request")
        XCTAssertEqual(message["target"] as? String, "maya")
        XCTAssertNotNil(message["timestamp"])
    }

    func testHandoffRequestForAllPersonas() {
        // All personas should be valid handoff targets
        let personas = ["ferni", "maya", "peter", "alex", "jordan", "nayan"]

        for persona in personas {
            dataChannel.sendHandoffRequest(targetPersona: persona)
            XCTAssertTrue(dataChannel.hasHandoffRequestFor(persona: persona),
                          "Handoff request should be sent for \(persona)")
        }

        XCTAssertEqual(dataChannel.sentMessages.count, personas.count)
    }

    // MARK: - Handoff Acknowledgment Tests

    func testHandoffStartedAcknowledgment() {
        // Given: A handoff request was sent
        dataChannel.sendHandoffRequest(targetPersona: "maya")
        stateMachine.transition(with: dataChannel.sentMessages.last!)

        // When: Server acknowledges with handoff_started
        dataChannel.simulateHandoffStarted(currentAgent: "ferni", newAgent: "maya")
        stateMachine.transition(with: dataChannel.receivedMessages.last!)

        // Then: State machine is in progress
        if case .inProgress(let from, let to) = stateMachine.currentState {
            XCTAssertEqual(from, "ferni")
            XCTAssertEqual(to, "maya")
        } else {
            XCTFail("Expected inProgress state")
        }
    }

    func testHandoffComplete() {
        // Given: Handoff is in progress
        dataChannel.sendHandoffRequest(targetPersona: "peter")
        stateMachine.transition(with: dataChannel.sentMessages.last!)

        dataChannel.simulateHandoffStarted(currentAgent: "ferni", newAgent: "peter")
        stateMachine.transition(with: dataChannel.receivedMessages.last!)

        // When: Server sends handoff_complete
        dataChannel.simulateHandoffComplete(newAgent: "peter")
        stateMachine.transition(with: dataChannel.receivedMessages.last!)

        // Then: State machine is completed
        if case .completed(let newPersona) = stateMachine.currentState {
            XCTAssertEqual(newPersona, "peter")
        } else {
            XCTFail("Expected completed state")
        }

        XCTAssertTrue(stateMachine.isValidHandoffSequence)
    }

    func testHandoffFailed() {
        // Given: Handoff request sent
        dataChannel.sendHandoffRequest(targetPersona: "nayan")
        stateMachine.transition(with: dataChannel.sentMessages.last!)

        // When: Server sends handoff_failed (e.g., persona not unlocked)
        dataChannel.simulateHandoffFailed(reason: "Persona not unlocked - requires Partner subscription")
        stateMachine.transition(with: dataChannel.receivedMessages.last!)

        // Then: State machine is in failed state
        if case .failed(let reason) = stateMachine.currentState {
            XCTAssertTrue(reason.contains("subscription"))
        } else {
            XCTFail("Expected failed state")
        }

        XCTAssertFalse(stateMachine.isValidHandoffSequence)
    }

    // MARK: - Full Handoff Flow Tests

    func testCompleteHandoffSequence() {
        // Simulate complete handoff from Ferni → Maya

        // 1. Client initiates handoff
        dataChannel.sendHandoffRequest(targetPersona: "maya")
        stateMachine.transition(with: dataChannel.sentMessages.last!)

        // 2. Server acknowledges start
        dataChannel.simulateHandoffStarted(currentAgent: "ferni", newAgent: "maya")
        stateMachine.transition(with: dataChannel.receivedMessages.last!)

        // 3. Server confirms completion
        dataChannel.simulateHandoffComplete(newAgent: "maya")
        stateMachine.transition(with: dataChannel.receivedMessages.last!)

        // Validate sequence
        XCTAssertTrue(stateMachine.isValidHandoffSequence)
        XCTAssertEqual(stateMachine.stateHistory.count, 4) // idle → request → inProgress → completed
    }

    func testChainedHandoffs() {
        // Test multiple handoffs in sequence: Ferni → Maya → Peter

        // First handoff: Ferni → Maya
        dataChannel.sendHandoffRequest(targetPersona: "maya")
        stateMachine.transition(with: dataChannel.sentMessages.last!)

        dataChannel.simulateHandoffStarted(currentAgent: "ferni", newAgent: "maya")
        stateMachine.transition(with: dataChannel.receivedMessages.last!)

        dataChannel.simulateHandoffComplete(newAgent: "maya")
        stateMachine.transition(with: dataChannel.receivedMessages.last!)

        XCTAssertTrue(stateMachine.isValidHandoffSequence)

        // Reset for second handoff
        stateMachine.reset()
        dataChannel.reset()

        // Second handoff: Maya → Peter
        dataChannel.sendHandoffRequest(targetPersona: "peter")
        stateMachine.transition(with: dataChannel.sentMessages.last!)

        dataChannel.simulateHandoffStarted(currentAgent: "maya", newAgent: "peter")
        stateMachine.transition(with: dataChannel.receivedMessages.last!)

        dataChannel.simulateHandoffComplete(newAgent: "peter")
        stateMachine.transition(with: dataChannel.receivedMessages.last!)

        XCTAssertTrue(stateMachine.isValidHandoffSequence)
    }

    // MARK: - Edge Case Tests

    func testHandoffToSamePersona() {
        // Technically allowed - should still follow protocol
        dataChannel.sendHandoffRequest(targetPersona: "ferni")

        XCTAssertTrue(dataChannel.hasHandoffRequestFor(persona: "ferni"))
    }

    func testHandoffWithMissingFields() {
        // Simulate malformed messages
        let malformedMessage: [String: Any] = [
            "type": "handoff_started"
            // Missing current_agent and new_agent
        ]

        dataChannel.simulateReceive(malformedMessage)
        stateMachine.transition(with: malformedMessage)

        // Should not crash, state should remain idle
        XCTAssertEqual(stateMachine.currentState, .idle)
    }

    func testUnknownMessageType() {
        // Unknown message types should be ignored
        let unknownMessage: [String: Any] = [
            "type": "some_future_type",
            "data": "something"
        ]

        dataChannel.simulateReceive(unknownMessage)
        stateMachine.transition(with: unknownMessage)

        XCTAssertEqual(stateMachine.currentState, .idle)
    }

    // MARK: - Timing Tests

    func testHandoffMessagesHaveTimestamp() {
        dataChannel.sendHandoffRequest(targetPersona: "alex")

        let message = dataChannel.sentMessages.first!
        let timestamp = message["timestamp"] as? Double

        XCTAssertNotNil(timestamp)

        // Timestamp should be recent (within last second)
        let now = Date().timeIntervalSince1970 * 1000
        XCTAssertTrue(abs(now - timestamp!) < 1000)
    }

    // MARK: - Message Type Validation

    func testAllHandoffMessageTypes() {
        // Ensure all message types are properly defined
        XCTAssertEqual(DataChannelMessageType.handoffRequest.rawValue, "handoff_request")
        XCTAssertEqual(DataChannelMessageType.handoffStarted.rawValue, "handoff_started")
        XCTAssertEqual(DataChannelMessageType.handoffComplete.rawValue, "handoff_complete")
        XCTAssertEqual(DataChannelMessageType.handoffFailed.rawValue, "handoff_failed")
    }

    // MARK: - Subscription Tier Tests

    func testHandoffFailsWithoutSubscription() {
        // Simulate handoff to Partner-tier persona without subscription
        dataChannel.sendHandoffRequest(targetPersona: "nayan")
        stateMachine.transition(with: dataChannel.sentMessages.last!)

        // Server rejects due to subscription
        dataChannel.simulateHandoffFailed(reason: "Partner subscription required for Nayan")
        stateMachine.transition(with: dataChannel.receivedMessages.last!)

        XCTAssertFalse(stateMachine.isValidHandoffSequence)

        if case .failed(let reason) = stateMachine.currentState {
            XCTAssertTrue(reason.lowercased().contains("subscription") ||
                          reason.lowercased().contains("partner"))
        }
    }

    func testHandoffSucceedsWithValidSubscription() {
        // Friend tier persona should always work
        let friendTierPersonas = ["maya", "peter", "alex", "jordan"]

        for persona in friendTierPersonas {
            stateMachine.reset()

            dataChannel.sendHandoffRequest(targetPersona: persona)
            stateMachine.transition(with: dataChannel.sentMessages.last!)

            dataChannel.simulateHandoffStarted(currentAgent: "ferni", newAgent: persona)
            stateMachine.transition(with: dataChannel.receivedMessages.last!)

            dataChannel.simulateHandoffComplete(newAgent: persona)
            stateMachine.transition(with: dataChannel.receivedMessages.last!)

            XCTAssertTrue(stateMachine.isValidHandoffSequence,
                          "Handoff to \(persona) should succeed")
        }
    }
}

// MARK: - Transcript Integration Tests

extension HandoffProtocolTests {

    func testTranscriptMessagesDuringHandoff() {
        // Transcripts should continue during handoff transition

        // Start handoff
        dataChannel.sendHandoffRequest(targetPersona: "maya")

        // Simulate some transcripts before handoff completes
        dataChannel.simulateTranscript(text: "Let me connect you with Maya...",
                                       isFinal: true,
                                       isAgent: true,
                                       personaId: "ferni")

        // Handoff starts
        dataChannel.simulateHandoffStarted(currentAgent: "ferni", newAgent: "maya")

        // Maya's welcome message
        dataChannel.simulateTranscript(text: "Hi! I'm Maya. Ferni told me you wanted to talk.",
                                       isFinal: true,
                                       isAgent: true,
                                       personaId: "maya")

        // Validate transcript messages were received
        let transcripts = dataChannel.receivedMessages.filter {
            ($0["type"] as? String) == DataChannelMessageType.transcript.rawValue
        }

        XCTAssertEqual(transcripts.count, 2)

        // First transcript is from Ferni
        XCTAssertEqual(transcripts[0]["personaId"] as? String, "ferni")

        // Second transcript is from Maya
        XCTAssertEqual(transcripts[1]["personaId"] as? String, "maya")
    }

    func testEmotionEventsDuringHandoff() {
        // Emotion events should work during handoff

        dataChannel.sendHandoffRequest(targetPersona: "maya")
        dataChannel.simulateHandoffStarted(currentAgent: "ferni", newAgent: "maya")

        // Maya detects user emotion
        dataChannel.simulateEmotionEvent(type: "emotion_event",
                                         emotion: "warmth",
                                         confidence: 0.85)

        let emotionEvents = dataChannel.receivedMessages.filter {
            ($0["type"] as? String) == DataChannelMessageType.emotionEvent.rawValue
        }

        XCTAssertEqual(emotionEvents.count, 1)
        XCTAssertEqual(emotionEvents[0]["emotion"] as? String, "warmth")
    }
}

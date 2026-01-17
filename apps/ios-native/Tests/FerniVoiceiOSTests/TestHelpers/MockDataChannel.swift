import Foundation
@testable import FerniVoice

// MARK: - Data Channel Message Types

/// Simulates data channel messages for handoff testing
enum DataChannelMessageType: String {
    case handoffRequest = "handoff_request"
    case handoffStarted = "handoff_started"
    case handoffComplete = "handoff_complete"
    case handoffFailed = "handoff_failed"
    case transcript = "transcript"
    case emotionEvent = "emotion_event"
    case humanizationSignal = "humanization_signal"
    case agentSpeaking = "agent_speaking"
}

// MARK: - Mock Data Channel

/// Mock implementation of data channel for testing handoff protocol
final class MockDataChannel {
    private(set) var sentMessages: [[String: Any]] = []
    private(set) var receivedMessages: [[String: Any]] = []

    var onMessageSent: (([String: Any]) -> Void)?
    var onMessageReceived: (([String: Any]) -> Void)?

    // MARK: - Sending

    func send(_ message: [String: Any]) {
        sentMessages.append(message)
        onMessageSent?(message)
    }

    // MARK: - Receiving (Simulated)

    func simulateReceive(_ message: [String: Any]) {
        receivedMessages.append(message)
        onMessageReceived?(message)
    }

    // MARK: - Handoff Protocol Helpers

    /// Simulates sending a handoff request (from client)
    func sendHandoffRequest(targetPersona: String) {
        let message: [String: Any] = [
            "type": DataChannelMessageType.handoffRequest.rawValue,
            "target": targetPersona,
            "timestamp": Date().timeIntervalSince1970 * 1000
        ]
        send(message)
    }

    /// Simulates receiving handoff started acknowledgment (from server)
    func simulateHandoffStarted(currentAgent: String, newAgent: String) {
        let message: [String: Any] = [
            "type": DataChannelMessageType.handoffStarted.rawValue,
            "current_agent": currentAgent,
            "new_agent": newAgent,
            "timestamp": Date().timeIntervalSince1970 * 1000
        ]
        simulateReceive(message)
    }

    /// Simulates receiving handoff complete (from server)
    func simulateHandoffComplete(newAgent: String) {
        let message: [String: Any] = [
            "type": DataChannelMessageType.handoffComplete.rawValue,
            "new_agent": newAgent,
            "timestamp": Date().timeIntervalSince1970 * 1000
        ]
        simulateReceive(message)
    }

    /// Simulates receiving handoff failed (from server)
    func simulateHandoffFailed(reason: String) {
        let message: [String: Any] = [
            "type": DataChannelMessageType.handoffFailed.rawValue,
            "reason": reason,
            "timestamp": Date().timeIntervalSince1970 * 1000
        ]
        simulateReceive(message)
    }

    // MARK: - Transcript Helpers

    /// Simulates receiving a transcript message
    func simulateTranscript(text: String, isFinal: Bool, isAgent: Bool, personaId: String = "ferni") {
        let message: [String: Any] = [
            "type": DataChannelMessageType.transcript.rawValue,
            "text": text,
            "isFinal": isFinal,
            "isAgent": isAgent,
            "personaId": personaId,
            "timestamp": Date().timeIntervalSince1970 * 1000
        ]
        simulateReceive(message)
    }

    // MARK: - Emotion Event Helpers

    /// Simulates receiving an emotion event (Better Than Human)
    func simulateEmotionEvent(type: String, emotion: String, confidence: Float = 0.8) {
        let message: [String: Any] = [
            "type": DataChannelMessageType.emotionEvent.rawValue,
            "emotion": emotion,
            "confidence": confidence,
            "timestamp": Date().timeIntervalSince1970 * 1000
        ]
        simulateReceive(message)
    }

    // MARK: - Validation Helpers

    /// Checks if a handoff request was sent for the given persona
    func hasHandoffRequestFor(persona: String) -> Bool {
        return sentMessages.contains { message in
            guard let type = message["type"] as? String,
                  let target = message["target"] as? String else {
                return false
            }
            return type == DataChannelMessageType.handoffRequest.rawValue && target == persona
        }
    }

    /// Returns all messages of a specific type
    func messages(ofType type: DataChannelMessageType) -> [[String: Any]] {
        return sentMessages.filter { ($0["type"] as? String) == type.rawValue }
    }

    func reset() {
        sentMessages.removeAll()
        receivedMessages.removeAll()
    }
}

// MARK: - Handoff State Machine

/// Validates the handoff protocol state transitions
final class HandoffStateMachine {
    enum State: Equatable {
        case idle
        case requestSent(target: String)
        case inProgress(from: String, to: String)
        case completed(newPersona: String)
        case failed(reason: String)
    }

    private(set) var currentState: State = .idle
    private(set) var stateHistory: [State] = [.idle]

    func transition(with message: [String: Any]) {
        guard let type = message["type"] as? String else { return }

        switch type {
        case DataChannelMessageType.handoffRequest.rawValue:
            if let target = message["target"] as? String {
                currentState = .requestSent(target: target)
            }

        case DataChannelMessageType.handoffStarted.rawValue:
            if let from = message["current_agent"] as? String,
               let to = message["new_agent"] as? String {
                currentState = .inProgress(from: from, to: to)
            }

        case DataChannelMessageType.handoffComplete.rawValue:
            if let newAgent = message["new_agent"] as? String {
                currentState = .completed(newPersona: newAgent)
            }

        case DataChannelMessageType.handoffFailed.rawValue:
            let reason = message["reason"] as? String ?? "Unknown error"
            currentState = .failed(reason: reason)

        default:
            break
        }

        stateHistory.append(currentState)
    }

    /// Validates a complete successful handoff sequence
    var isValidHandoffSequence: Bool {
        guard stateHistory.count >= 4 else { return false }

        // Must follow: idle → requestSent → inProgress → completed
        var foundRequest = false
        var foundInProgress = false
        var foundCompleted = false

        for state in stateHistory {
            switch state {
            case .idle:
                break
            case .requestSent:
                foundRequest = true
            case .inProgress:
                guard foundRequest else { return false }
                foundInProgress = true
            case .completed:
                guard foundInProgress else { return false }
                foundCompleted = true
            case .failed:
                return false
            }
        }

        return foundCompleted
    }

    func reset() {
        currentState = .idle
        stateHistory = [.idle]
    }
}

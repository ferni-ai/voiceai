import XCTest
@testable import FerniShared

// MARK: - CallStatus Tests

final class CallStatusTests: XCTestCase {

    func testAllCallStatusCases() {
        let statuses: [CallStatus] = [.connecting, .connected, .thinking, .handoff, .reconnecting, .ended]
        XCTAssertEqual(statuses.count, 6)
    }

    func testCallStatusRawValues() {
        XCTAssertEqual(CallStatus.connecting.rawValue, "connecting")
        XCTAssertEqual(CallStatus.connected.rawValue, "connected")
        XCTAssertEqual(CallStatus.thinking.rawValue, "thinking")
        XCTAssertEqual(CallStatus.handoff.rawValue, "handoff")
        XCTAssertEqual(CallStatus.reconnecting.rawValue, "reconnecting")
        XCTAssertEqual(CallStatus.ended.rawValue, "ended")
    }

    func testCallStatusCodable() {
        for status in [CallStatus.connecting, .connected, .thinking, .handoff, .reconnecting, .ended] {
            do {
                let encoded = try JSONEncoder().encode(status)
                let decoded = try JSONDecoder().decode(CallStatus.self, from: encoded)
                XCTAssertEqual(status, decoded)
            } catch {
                XCTFail("Failed to encode/decode \(status): \(error)")
            }
        }
    }

    func testCallStatusDecodingFromString() {
        let jsonStrings = [
            ("\"connecting\"", CallStatus.connecting),
            ("\"connected\"", CallStatus.connected),
            ("\"thinking\"", CallStatus.thinking),
            ("\"handoff\"", CallStatus.handoff),
            ("\"reconnecting\"", CallStatus.reconnecting),
            ("\"ended\"", CallStatus.ended)
        ]

        for (jsonString, expectedStatus) in jsonStrings {
            guard let data = jsonString.data(using: .utf8) else {
                XCTFail("Failed to create data from \(jsonString)")
                continue
            }

            do {
                let decoded = try JSONDecoder().decode(CallStatus.self, from: data)
                XCTAssertEqual(decoded, expectedStatus)
            } catch {
                XCTFail("Failed to decode \(jsonString): \(error)")
            }
        }
    }

    func testCallStatusHashable() {
        var statusSet: Set<CallStatus> = []
        statusSet.insert(.connecting)
        statusSet.insert(.connected)
        statusSet.insert(.connecting) // Duplicate

        XCTAssertEqual(statusSet.count, 2)
    }

    func testCallStatusEquatable() {
        XCTAssertEqual(CallStatus.connecting, CallStatus.connecting)
        XCTAssertNotEqual(CallStatus.connecting, CallStatus.connected)
    }
}

// MARK: - SpeakingState Tests

final class SpeakingStateTests: XCTestCase {

    func testAllSpeakingStateCases() {
        let states: [SpeakingState] = [.idle, .userSpeaking, .agentSpeaking, .listening]
        XCTAssertEqual(states.count, 4)
    }

    func testSpeakingStateRawValues() {
        XCTAssertEqual(SpeakingState.idle.rawValue, "idle")
        XCTAssertEqual(SpeakingState.userSpeaking.rawValue, "userSpeaking")
        XCTAssertEqual(SpeakingState.agentSpeaking.rawValue, "agentSpeaking")
        XCTAssertEqual(SpeakingState.listening.rawValue, "listening")
    }

    func testSpeakingStateCodable() {
        for state in [SpeakingState.idle, .userSpeaking, .agentSpeaking, .listening] {
            do {
                let encoded = try JSONEncoder().encode(state)
                let decoded = try JSONDecoder().decode(SpeakingState.self, from: encoded)
                XCTAssertEqual(state, decoded)
            } catch {
                XCTFail("Failed to encode/decode \(state): \(error)")
            }
        }
    }

    func testSpeakingStateHashable() {
        var stateSet: Set<SpeakingState> = []
        stateSet.insert(.idle)
        stateSet.insert(.userSpeaking)
        stateSet.insert(.idle) // Duplicate

        XCTAssertEqual(stateSet.count, 2)
    }

    func testSpeakingStateEquatable() {
        XCTAssertEqual(SpeakingState.idle, SpeakingState.idle)
        XCTAssertNotEqual(SpeakingState.idle, SpeakingState.userSpeaking)
    }
}

// MARK: - EmotionalTone Tests

final class EmotionalToneTests: XCTestCase {

    func testAllEmotionalToneCases() {
        let tones: [EmotionalTone] = [.neutral, .warm, .concerned, .excited, .calm, .focused]
        XCTAssertEqual(tones.count, 6)
    }

    func testEmotionalToneRawValues() {
        XCTAssertEqual(EmotionalTone.neutral.rawValue, "neutral")
        XCTAssertEqual(EmotionalTone.warm.rawValue, "warm")
        XCTAssertEqual(EmotionalTone.concerned.rawValue, "concerned")
        XCTAssertEqual(EmotionalTone.excited.rawValue, "excited")
        XCTAssertEqual(EmotionalTone.calm.rawValue, "calm")
        XCTAssertEqual(EmotionalTone.focused.rawValue, "focused")
    }

    func testEmotionalToneCodable() {
        for tone in [EmotionalTone.neutral, .warm, .concerned, .excited, .calm, .focused] {
            do {
                let encoded = try JSONEncoder().encode(tone)
                let decoded = try JSONDecoder().decode(EmotionalTone.self, from: encoded)
                XCTAssertEqual(tone, decoded)
            } catch {
                XCTFail("Failed to encode/decode \(tone): \(error)")
            }
        }
    }

    func testEmotionalToneHashable() {
        var toneSet: Set<EmotionalTone> = []
        toneSet.insert(.neutral)
        toneSet.insert(.warm)
        toneSet.insert(.neutral) // Duplicate

        XCTAssertEqual(toneSet.count, 2)
    }

    func testEmotionalToneEquatable() {
        XCTAssertEqual(EmotionalTone.neutral, EmotionalTone.neutral)
        XCTAssertNotEqual(EmotionalTone.neutral, EmotionalTone.warm)
    }
}

// MARK: - Duration Formatting Tests (Logic Only)

/// These tests verify the duration formatting logic independent of ContentState
final class DurationFormattingLogicTests: XCTestCase {

    func formatDuration(_ seconds: Int) -> String {
        let minutes = seconds / 60
        let secs = seconds % 60
        return String(format: "%d:%02d", minutes, secs)
    }

    func testZeroDuration() {
        XCTAssertEqual(formatDuration(0), "0:00")
    }

    func testSingleDigitSeconds() {
        XCTAssertEqual(formatDuration(5), "0:05")
    }

    func testDoubleDigitSeconds() {
        XCTAssertEqual(formatDuration(45), "0:45")
    }

    func testExactMinute() {
        XCTAssertEqual(formatDuration(60), "1:00")
    }

    func testMinutesAndSeconds() {
        XCTAssertEqual(formatDuration(90), "1:30")
    }

    func testMultipleMinutes() {
        XCTAssertEqual(formatDuration(125), "2:05")
    }

    func testLongDuration() {
        XCTAssertEqual(formatDuration(3661), "61:01")
    }

    func testOneHour() {
        XCTAssertEqual(formatDuration(3600), "60:00")
    }
}

// MARK: - Status Text Logic Tests

/// These tests verify the status text logic independent of ContentState
final class StatusTextLogicTests: XCTestCase {

    func statusText(for status: CallStatus) -> String {
        switch status {
        case .connecting: return "Connecting..."
        case .connected: return "In call"
        case .thinking: return "Thinking..."
        case .handoff: return "Transferring..."
        case .reconnecting: return "Reconnecting..."
        case .ended: return "Call ended"
        }
    }

    func testConnectingStatusText() {
        XCTAssertEqual(statusText(for: .connecting), "Connecting...")
    }

    func testConnectedStatusText() {
        XCTAssertEqual(statusText(for: .connected), "In call")
    }

    func testThinkingStatusText() {
        XCTAssertEqual(statusText(for: .thinking), "Thinking...")
    }

    func testHandoffStatusText() {
        XCTAssertEqual(statusText(for: .handoff), "Transferring...")
    }

    func testReconnectingStatusText() {
        XCTAssertEqual(statusText(for: .reconnecting), "Reconnecting...")
    }

    func testEndedStatusText() {
        XCTAssertEqual(statusText(for: .ended), "Call ended")
    }

    func testAllStatusesHaveText() {
        let statuses: [CallStatus] = [.connecting, .connected, .thinking, .handoff, .reconnecting, .ended]
        for status in statuses {
            XCTAssertFalse(statusText(for: status).isEmpty, "\(status) should have status text")
        }
    }
}

// MARK: - Active Status Logic Tests

/// These tests verify the isActive logic independent of ContentState
final class ActiveStatusLogicTests: XCTestCase {

    func isActive(for status: CallStatus) -> Bool {
        switch status {
        case .connected, .thinking, .handoff:
            return true
        case .connecting, .reconnecting, .ended:
            return false
        }
    }

    func testConnectedIsActive() {
        XCTAssertTrue(isActive(for: .connected))
    }

    func testThinkingIsActive() {
        XCTAssertTrue(isActive(for: .thinking))
    }

    func testHandoffIsActive() {
        XCTAssertTrue(isActive(for: .handoff))
    }

    func testConnectingNotActive() {
        XCTAssertFalse(isActive(for: .connecting))
    }

    func testReconnectingNotActive() {
        XCTAssertFalse(isActive(for: .reconnecting))
    }

    func testEndedNotActive() {
        XCTAssertFalse(isActive(for: .ended))
    }

    func testActiveStatusCount() {
        let statuses: [CallStatus] = [.connecting, .connected, .thinking, .handoff, .reconnecting, .ended]
        let activeCount = statuses.filter { isActive(for: $0) }.count
        XCTAssertEqual(activeCount, 3) // connected, thinking, handoff
    }

    func testInactiveStatusCount() {
        let statuses: [CallStatus] = [.connecting, .connected, .thinking, .handoff, .reconnecting, .ended]
        let inactiveCount = statuses.filter { !isActive(for: $0) }.count
        XCTAssertEqual(inactiveCount, 3) // connecting, reconnecting, ended
    }
}

// MARK: - iOS-Only Tests (FerniActivityAttributes)

#if os(iOS)
import ActivityKit

final class FerniActivityAttributesTests: XCTestCase {

    func testAttributesInitialization() {
        let attributes = FerniActivityAttributes(
            personaId: "ferni",
            personaName: "Ferni",
            personaColorHex: "#4a6741",
            sessionId: "session-123"
        )

        XCTAssertEqual(attributes.personaId, "ferni")
        XCTAssertEqual(attributes.personaName, "Ferni")
        XCTAssertEqual(attributes.personaColorHex, "#4a6741")
        XCTAssertEqual(attributes.sessionId, "session-123")
        XCTAssertNil(attributes.userName)
    }

    func testAttributesWithUserName() {
        let attributes = FerniActivityAttributes(
            personaId: "maya",
            personaName: "Maya",
            personaColorHex: "#a67a6a",
            sessionId: "session-456",
            userName: "Sarah"
        )

        XCTAssertEqual(attributes.personaId, "maya")
        XCTAssertEqual(attributes.userName, "Sarah")
    }

    func testContentStateDefaultInit() {
        let state = FerniActivityAttributes.ContentState()

        XCTAssertEqual(state.status, .connecting)
        XCTAssertEqual(state.durationSeconds, 0)
        XCTAssertFalse(state.isMuted)
        XCTAssertEqual(state.speakingState, .idle)
        XCTAssertNil(state.transcriptSnippet)
        XCTAssertEqual(state.emotionalTone, .neutral)
        XCTAssertFalse(state.showingConcern)
    }

    func testContentStateCustomInit() {
        let state = FerniActivityAttributes.ContentState(
            status: .connected,
            durationSeconds: 120,
            isMuted: true,
            speakingState: .agentSpeaking,
            transcriptSnippet: "I hear you...",
            emotionalTone: .warm,
            showingConcern: true
        )

        XCTAssertEqual(state.status, .connected)
        XCTAssertEqual(state.durationSeconds, 120)
        XCTAssertTrue(state.isMuted)
        XCTAssertEqual(state.speakingState, .agentSpeaking)
        XCTAssertEqual(state.transcriptSnippet, "I hear you...")
        XCTAssertEqual(state.emotionalTone, .warm)
        XCTAssertTrue(state.showingConcern)
    }

    func testFormattedDuration() {
        var state = FerniActivityAttributes.ContentState(durationSeconds: 0)
        XCTAssertEqual(state.formattedDuration, "0:00")

        state = FerniActivityAttributes.ContentState(durationSeconds: 5)
        XCTAssertEqual(state.formattedDuration, "0:05")

        state = FerniActivityAttributes.ContentState(durationSeconds: 65)
        XCTAssertEqual(state.formattedDuration, "1:05")

        state = FerniActivityAttributes.ContentState(durationSeconds: 3661)
        XCTAssertEqual(state.formattedDuration, "61:01")
    }

    func testStatusText() {
        XCTAssertEqual(FerniActivityAttributes.ContentState(status: .connecting).statusText, "Connecting...")
        XCTAssertEqual(FerniActivityAttributes.ContentState(status: .connected).statusText, "In call")
        XCTAssertEqual(FerniActivityAttributes.ContentState(status: .thinking).statusText, "Thinking...")
        XCTAssertEqual(FerniActivityAttributes.ContentState(status: .handoff).statusText, "Transferring...")
        XCTAssertEqual(FerniActivityAttributes.ContentState(status: .reconnecting).statusText, "Reconnecting...")
        XCTAssertEqual(FerniActivityAttributes.ContentState(status: .ended).statusText, "Call ended")
    }

    func testIsActive() {
        XCTAssertFalse(FerniActivityAttributes.ContentState(status: .connecting).isActive)
        XCTAssertTrue(FerniActivityAttributes.ContentState(status: .connected).isActive)
        XCTAssertTrue(FerniActivityAttributes.ContentState(status: .thinking).isActive)
        XCTAssertTrue(FerniActivityAttributes.ContentState(status: .handoff).isActive)
        XCTAssertFalse(FerniActivityAttributes.ContentState(status: .reconnecting).isActive)
        XCTAssertFalse(FerniActivityAttributes.ContentState(status: .ended).isActive)
    }

    func testContentStateCodable() {
        let original = FerniActivityAttributes.ContentState(
            status: .connected,
            durationSeconds: 180,
            isMuted: false,
            speakingState: .userSpeaking,
            transcriptSnippet: "How are you?",
            emotionalTone: .excited,
            showingConcern: false
        )

        do {
            let encoded = try JSONEncoder().encode(original)
            let decoded = try JSONDecoder().decode(FerniActivityAttributes.ContentState.self, from: encoded)
            XCTAssertEqual(original, decoded)
        } catch {
            XCTFail("Failed to encode/decode ContentState: \(error)")
        }
    }

    func testContentStateHashable() {
        let state1 = FerniActivityAttributes.ContentState(status: .connected, durationSeconds: 60)
        let state2 = FerniActivityAttributes.ContentState(status: .connected, durationSeconds: 60)
        let state3 = FerniActivityAttributes.ContentState(status: .ended, durationSeconds: 120)

        var stateSet: Set = [state1]
        stateSet.insert(state2) // Should not increase count
        stateSet.insert(state3)

        XCTAssertEqual(stateSet.count, 2)
    }
}
#endif

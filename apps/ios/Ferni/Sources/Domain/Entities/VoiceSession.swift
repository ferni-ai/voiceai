//
//  VoiceSession.swift
//  Ferni
//
//  Represents a voice conversation session with Ferni.
//

import Foundation

// MARK: - Voice Session

/// A voice conversation session
public struct VoiceSession: Identifiable, Equatable {
    public let id: String
    public let userId: String
    public let persona: Persona
    public let startedAt: Date
    public var state: VoiceSessionState
    public var duration: TimeInterval {
        Date().timeIntervalSince(startedAt)
    }
    
    public init(
        id: String = UUID().uuidString,
        userId: String,
        persona: Persona,
        startedAt: Date = Date(),
        state: VoiceSessionState = .connecting
    ) {
        self.id = id
        self.userId = userId
        self.persona = persona
        self.startedAt = startedAt
        self.state = state
    }
}

// MARK: - Voice Session State

/// The current state of a voice session
public enum VoiceSessionState: Equatable, Hashable {
    case disconnected
    case connecting
    case connected
    case speaking(who: Speaker)
    case listening
    case thinking
    case error(VoiceSessionError)
    
    public var isActive: Bool {
        switch self {
        case .connected, .speaking, .listening, .thinking:
            return true
        default:
            return false
        }
    }
    
    public var displayName: String {
        switch self {
        case .disconnected: return "Disconnected"
        case .connecting: return "Connecting..."
        case .connected: return "Connected"
        case .speaking(let who):
            return who == .agent ? "Speaking" : "Listening to you"
        case .listening: return "Listening"
        case .thinking: return "Thinking..."
        case .error: return "Error"
        }
    }
}

/// Who is currently speaking
public enum Speaker: Equatable, Hashable {
    case user
    case agent
}

// MARK: - Voice Session Error

/// Errors that can occur during a voice session
public enum VoiceSessionError: Error, Equatable, Hashable {
    case connectionFailed(String)
    case audioPermissionDenied
    case networkUnavailable
    case serverError(String)
    case tokenExpired
    case unknown(String)
    
    public var localizedDescription: String {
        switch self {
        case .connectionFailed(let reason):
            return "Connection failed: \(reason)"
        case .audioPermissionDenied:
            return "Microphone access is required for voice conversations"
        case .networkUnavailable:
            return "No network connection available"
        case .serverError(let message):
            return "Server error: \(message)"
        case .tokenExpired:
            return "Session expired. Please reconnect."
        case .unknown(let message):
            return "An error occurred: \(message)"
        }
    }
}

// MARK: - Voice Session Event

/// Events that occur during a voice session
public enum VoiceSessionEvent: Equatable {
    case connected
    case disconnected
    case stateChanged(VoiceSessionState)
    case transcriptReceived(TranscriptEvent)
    case emotionDetected(EmotionEvent)
    case audioLevelChanged(Float)
    case error(VoiceSessionError)
}

// MARK: - Transcript Event

/// A transcript event from speech recognition
public struct TranscriptEvent: Equatable, Identifiable {
    public let id: String
    public let text: String
    public let speaker: Speaker
    public let isFinal: Bool
    public let timestamp: Date
    
    public init(
        id: String = UUID().uuidString,
        text: String,
        speaker: Speaker,
        isFinal: Bool = false,
        timestamp: Date = Date()
    ) {
        self.id = id
        self.text = text
        self.speaker = speaker
        self.isFinal = isFinal
        self.timestamp = timestamp
    }
}

// MARK: - Emotion Event

/// An emotion detected during conversation
public struct EmotionEvent: Equatable {
    public let emotion: VoiceEmotion
    public let intensity: Float // 0.0 to 1.0
    public let timestamp: Date
    
    public init(
        emotion: VoiceEmotion,
        intensity: Float,
        timestamp: Date = Date()
    ) {
        self.emotion = emotion
        self.intensity = min(1.0, max(0.0, intensity))
        self.timestamp = timestamp
    }
}

/// Emotions that can be detected or expressed
public enum VoiceEmotion: String, Codable, CaseIterable {
    case neutral
    case happy
    case excited
    case calm
    case anxious
    case sad
    case frustrated
    
    public var displayName: String {
        rawValue.capitalized
    }
}

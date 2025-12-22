import Foundation

// MARK: - Voice State

/// Represents the current state of the voice session
public enum VoiceState: Equatable {
    case disconnected
    case connecting
    case connected
    case listening
    case speaking
    case thinking
    case error(String)

    /// User-friendly title for the state
    public var title: String {
        switch self {
        case .disconnected: return "Ready"
        case .connecting: return "Connecting..."
        case .connected: return "Connected"
        case .listening: return "Listening"
        case .speaking: return "Speaking"
        case .thinking: return "Thinking"
        case .error: return "Connection Issue"
        }
    }

    /// Whether the session is active (not disconnected or error)
    public var isActive: Bool {
        switch self {
        case .disconnected, .error:
            return false
        default:
            return true
        }
    }

    /// Whether audio visualization should be shown
    public var showWaveform: Bool {
        switch self {
        case .connected, .listening, .speaking:
            return true
        default:
            return false
        }
    }

    /// Breathing animation intensity multiplier
    /// NOTE: All active states use same intensity - no listening/speaking distinction
    public var breathingIntensity: Double {
        switch self {
        case .connected, .listening, .speaking:
            // All active conversation states use same intensity
            return 1.0
        case .thinking:
            return 0.8
        default:
            return 0.6
        }
    }
}

// MARK: - Voice Event

/// Events emitted during voice session
public enum VoiceEvent {
    case stateChanged(VoiceState)
    case transcription(text: String, isAgent: Bool, isFinal: Bool)
    case handoff(from: String, to: String)
    case audioLevel(Float)
    case error(Error)
}

// MARK: - Audio Level Sample

/// Audio level sample for waveform visualization
public struct AudioLevelSample: Identifiable {
    public let id = UUID()
    public let level: Float
    public let timestamp: Date

    public init(level: Float) {
        self.level = max(0, min(1, level))
        self.timestamp = Date()
    }
}

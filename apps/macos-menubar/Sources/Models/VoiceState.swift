import Foundation

// MARK: - Voice State

/// Represents the current state of the voice session
enum VoiceState: Equatable {
    case disconnected
    case connecting
    case connected
    case listening
    case speaking
    case thinking
    case error(String)
    
    /// User-friendly title for the state
    var title: String {
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
    var isActive: Bool {
        switch self {
        case .disconnected, .error:
            return false
        default:
            return true
        }
    }
    
    /// Whether audio visualization should be shown
    var showWaveform: Bool {
        switch self {
        case .connected, .listening, .speaking:
            return true
        default:
            return false
        }
    }
    
    /// Breathing animation intensity multiplier
    /// NOTE: All active states use same intensity - no listening/speaking distinction
    var breathingIntensity: Double {
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
enum VoiceEvent {
    case stateChanged(VoiceState)
    case transcription(text: String, isAgent: Bool, isFinal: Bool)
    case handoff(from: String, to: String)
    case audioLevel(Float)
    case error(Error)
}

// MARK: - Audio Level Sample

/// Audio level sample for waveform visualization
struct AudioLevelSample: Identifiable {
    let id = UUID()
    let level: Float
    let timestamp: Date
    
    init(level: Float) {
        self.level = max(0, min(1, level))
        self.timestamp = Date()
    }
}


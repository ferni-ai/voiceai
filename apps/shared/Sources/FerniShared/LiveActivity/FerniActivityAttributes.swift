import Foundation

// MARK: - Call Status
/// Status of the voice call, available on all platforms.

public enum CallStatus: String, Codable, Hashable {
    case connecting
    case connected
    case thinking      // Agent is processing
    case handoff       // Transferring to another persona
    case reconnecting
    case ended
}

// MARK: - Speaking State
/// Who is currently speaking, available on all platforms.

public enum SpeakingState: String, Codable, Hashable {
    case idle          // No one speaking
    case userSpeaking  // User is talking
    case agentSpeaking // Agent is responding
    case listening     // Agent showing active listening
}

// MARK: - Emotional Tone
/// Emotional tone for UI feedback, available on all platforms.

public enum EmotionalTone: String, Codable, Hashable {
    case neutral
    case warm          // Positive, supportive
    case concerned     // Empathetic, careful
    case excited       // Energetic, enthusiastic
    case calm          // Peaceful, grounding
    case focused       // Serious, attentive
}

// MARK: - iOS-only Live Activity Support

#if os(iOS)
import ActivityKit

// MARK: - Ferni Live Activity Attributes
/// Defines the data model for Ferni's Dynamic Island and Live Activity.
///
/// Architecture:
/// - Static attributes: Set when activity starts (persona, session ID)
/// - Content state: Updates during the activity (duration, speaking state)
///
/// Dynamic Island States:
/// - Compact: Shows persona avatar + call duration
/// - Expanded: Shows full avatar animation + transcript snippet + controls

public struct FerniActivityAttributes: ActivityAttributes {

    // MARK: - Static Content (set at activity start)

    /// Current persona ID
    public var personaId: String

    /// Persona display name
    public var personaName: String

    /// Persona color hex for the orb glow
    public var personaColorHex: String

    /// Session ID for deep linking back to call
    public var sessionId: String

    /// User's name for personalization
    public var userName: String?

    // MARK: - Content State (updates during activity)

    public struct ContentState: Codable, Hashable {

        // MARK: - Call State

        /// Call status
        public var status: CallStatus

        /// Call duration in seconds
        public var durationSeconds: Int

        /// Whether the user is currently muted
        public var isMuted: Bool

        // MARK: - Speaking State (for avatar animation hints)

        /// Who is currently speaking
        public var speakingState: SpeakingState

        // MARK: - Better Than Human State

        /// Current emotional tone (for subtle color shifts)
        public var emotionalTone: EmotionalTone

        /// Whether concern was recently detected
        public var showingConcern: Bool

        public init(
            status: CallStatus = .connecting,
            durationSeconds: Int = 0,
            isMuted: Bool = false,
            speakingState: SpeakingState = .idle,
            emotionalTone: EmotionalTone = .neutral,
            showingConcern: Bool = false
        ) {
            self.status = status
            self.durationSeconds = durationSeconds
            self.isMuted = isMuted
            self.speakingState = speakingState
            self.emotionalTone = emotionalTone
            self.showingConcern = showingConcern
        }
    }

    // MARK: - Initialization

    public init(
        personaId: String,
        personaName: String,
        personaColorHex: String,
        sessionId: String,
        userName: String? = nil
    ) {
        self.personaId = personaId
        self.personaName = personaName
        self.personaColorHex = personaColorHex
        self.sessionId = sessionId
        self.userName = userName
    }
}

// MARK: - Convenience Extensions

public extension FerniActivityAttributes.ContentState {

    /// Formatted duration string (mm:ss)
    var formattedDuration: String {
        let minutes = durationSeconds / 60
        let seconds = durationSeconds % 60
        return String(format: "%d:%02d", minutes, seconds)
    }

    /// Status text for display
    var statusText: String {
        switch status {
        case .connecting: return "Connecting..."
        case .connected: return "In call"
        case .thinking: return "Thinking..."
        case .handoff: return "Transferring..."
        case .reconnecting: return "Reconnecting..."
        case .ended: return "Call ended"
        }
    }

    /// Whether the call is active
    var isActive: Bool {
        switch status {
        case .connected, .thinking, .handoff:
            return true
        case .connecting, .reconnecting, .ended:
            return false
        }
    }
}

#endif

import Foundation

/// Parses what the voice agent tells the app during a call into plain values,
/// so the session (and the tests) do not read raw JSON or attributes.
///
/// Wire contract, both set by the agent:
/// - `speech_state` data messages describe the CALLER's speech as the agent hears
///   it. The envelope (src/agents/shared/data-message-envelope.ts) keeps
///   `type: "speech_state"` and puts the phase in `innerType`
///   (`speech_start`, `speech_pause`, `speech_end`, `breath_detected`),
///   sent by src/agents/realtime/speech-state-dispatcher.ts.
/// - Ferni's own turn state is the `lk.agent.state` participant attribute that
///   @livekit/agents sets on the agent participant (`initializing`, `idle`,
///   `listening`, `thinking`, `speaking`). The web reads the same attribute
///   (apps/web/src/ui/speaker-cues-signals.ts).
public enum AgentSignals {

    /// The caller's speech, from `speech_state` messages.
    public enum UserSpeech: Equatable, Sendable {
        case started
        case paused(durationMs: Double)
        case ended
    }

    /// Ferni's turn state, from the `lk.agent.state` attribute.
    public enum AgentActivity: String, Equatable, Sendable {
        case initializing, idle, listening, thinking, speaking
    }

    /// Participant attribute the agent framework uses for its turn state.
    public static let agentStateAttribute = "lk.agent.state"

    /// Reads a `speech_state` message. Also accepts the phase as the message
    /// `type` itself, as the web receiver does for older senders.
    public static func userSpeech(from json: [String: Any]) -> UserSpeech? {
        guard let type = json["type"] as? String else { return nil }
        let phase = type == "speech_state" ? json["innerType"] as? String : type
        switch phase {
        case "speech_start":
            return .started
        case "speech_pause":
            let durationMs = (json["durationMs"] as? NSNumber)?.doubleValue ?? 0
            return .paused(durationMs: durationMs)
        case "speech_end":
            return .ended
        default:
            return nil
        }
    }

    /// A handoff between teammates, with the server's persona id. Shapes from
    /// src/agents/voice-agent/phases/multi-agent-mode.ts (`handoff_complete`
    /// with `target`) and src/agents/multi-agent/handoff-messages.ts
    /// (`handoff_started` with `newAgent`/`target`, `handoff_failed`).
    public enum Handoff: Equatable, Sendable {
        case started(to: String)
        case completed(to: String)
        case failed
    }

    public static func handoff(from json: [String: Any]) -> Handoff? {
        switch json["type"] as? String {
        case "handoff_started":
            return ((json["newAgent"] ?? json["target"]) as? String).map { .started(to: $0) }
        case "handoff_complete", "handoff_completed":
            return ((json["target"] ?? json["newAgent"]) as? String).map { .completed(to: $0) }
        case "handoff_failed":
            return .failed
        default:
            return nil
        }
    }

    /// How worried the agent is about the caller, lowest first. Two senders:
    /// - `humanization_signal` with `signalType: "concern_detected"` and a
    ///   `concernLevel` (src/config/emotion-thresholds.ts:15 lists
    ///   none/mild/moderate/elevated/crisis), sent by
    ///   src/agents/realtime/emotion-event-dispatcher.ts (from the distress
    ///   score, and `crisis` when the turn's holistic read says crisis).
    /// - `crisis_detected` (`severity`, `indicators`), sent by
    ///   src/agents/voice-agent/turn-handler.ts when the crisis guard takes
    ///   over the reply. Always the crisis level.
    /// Mild and moderate don't change the call screen, so they read as nil.
    public enum Concern: Int, Comparable, Sendable {
        case none, elevated, crisis
        public static func < (a: Concern, b: Concern) -> Bool { a.rawValue < b.rawValue }
    }

    public static func concern(from json: [String: Any]) -> Concern? {
        switch json["type"] as? String {
        case "crisis_detected":
            return .crisis
        case "humanization_signal" where json["signalType"] as? String == "concern_detected":
            switch json["concernLevel"] as? String {
            case "crisis": return .crisis
            case "elevated": return .elevated
            default: return nil
            }
        default:
            return nil
        }
    }

    /// Reads Ferni's turn state from a participant's attributes (or an
    /// attribute diff). Nil when the attribute is absent or unknown.
    public static func agentActivity(from attributes: [String: String]) -> AgentActivity? {
        attributes[agentStateAttribute].flatMap(AgentActivity.init(rawValue:))
    }
}

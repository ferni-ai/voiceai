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

    /// Reads Ferni's turn state from a participant's attributes (or an
    /// attribute diff). Nil when the attribute is absent or unknown.
    public static func agentActivity(from attributes: [String: String]) -> AgentActivity? {
        attributes[agentStateAttribute].flatMap(AgentActivity.init(rawValue:))
    }
}

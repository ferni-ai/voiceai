import ActivityKit
import Foundation

/// A call on the Lock Screen and in the Dynamic Island (ios-motion-spec §6.8).
/// Shared by the app (which starts and updates it) and the FerniLive extension
/// (which draws it).
public struct CallActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable, Sendable {
        public var state: CallActivityState
        public var personaID: String
        public var personaName: String
        public var muted = false

        public init(state: CallActivityState, personaID: String, personaName: String, muted: Bool = false) {
            self.state = state
            self.personaID = personaID
            self.personaName = personaName
            self.muted = muted
        }

        // `muted` arrived after activities were already running: absent means not muted.
        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            state = try c.decode(CallActivityState.self, forKey: .state)
            personaID = try c.decode(String.self, forKey: .personaID)
            personaName = try c.decode(String.self, forKey: .personaName)
            muted = try c.decodeIfPresent(Bool.self, forKey: .muted) ?? false
        }
    }

    /// When the call began; the duration is drawn from it, so there are no
    /// per-second updates.
    public var startedAt: Date

    public init(startedAt: Date) { self.startedAt = startedAt }
}

public enum CallActivityState: String, Codable, Hashable, Sendable {
    case calling, arriving, listening, thinking, speaking, reconnecting, onHold, ended
    /// Ferni never arrived, even in a fresh room: the call's last word.
    case couldNotJoin

    /// End and Mute, on every state of a call; nothing to press once it's over.
    public var hasControls: Bool { self != .ended && self != .couldNotJoin }

    /// From the caller's side, like the call screen's state line.
    public func words(_ name: String) -> String {
        switch self {
        case .calling: "Calling \(name)"
        case .arriving: "\(name)'s on the way"
        case .listening: "\(name)'s listening"
        case .thinking: "\(name)'s thinking"
        case .speaking: "\(name)'s talking"
        case .reconnecting: "Reconnecting"
        case .onHold: "On hold"
        case .ended: "Talk soon."
        case .couldNotJoin: "\(name) couldn't join right now"
        }
    }
}

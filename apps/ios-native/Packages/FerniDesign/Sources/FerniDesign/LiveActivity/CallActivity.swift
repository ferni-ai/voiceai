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

        public init(state: CallActivityState, personaID: String, personaName: String) {
            self.state = state
            self.personaID = personaID
            self.personaName = personaName
        }
    }

    /// When the call began; the duration is drawn from it, so there are no
    /// per-second updates.
    public var startedAt: Date

    public init(startedAt: Date) { self.startedAt = startedAt }
}

public enum CallActivityState: String, Codable, Hashable, Sendable {
    case arriving, listening, thinking, speaking, reconnecting, onHold

    /// From the caller's side, like the call screen's state line.
    public func words(_ name: String) -> String {
        switch self {
        case .arriving: "\(name)'s on the way"
        case .listening: "\(name)'s listening"
        case .thinking: "\(name)'s thinking"
        case .speaking: "\(name)'s talking"
        case .reconnecting: "Reconnecting"
        case .onHold: "On hold"
        }
    }
}

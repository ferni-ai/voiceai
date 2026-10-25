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
    /// A teammate is on the way in (the activity names the teammate). Never
    /// "listening" while nobody is (trust panel T1).
    case bringingIn
    /// On the call, but neither listening, thinking nor talking (the agent
    /// is idle or starting up): nothing is claimed.
    case here

    /// End and Mute, on every state of a call; nothing to press once it's over.
    public var hasControls: Bool { self != .ended && self != .couldNotJoin }

    /// The Dynamic Island's compact trailing glyph. Once the call is over, a
    /// wave goodbye: the waveform stayed there ~4.5 s after hang-up, as if the
    /// call were still on (design audit P1-11).
    public func islandSymbol(muted: Bool) -> String {
        guard hasControls else { return "hand.wave.fill" }
        return muted ? "mic.slash.fill" : "waveform"
    }

    /// The running time shows only while there's a call; after it, it kept
    /// counting under "Talk soon." until the activity went.
    public var showsDuration: Bool { hasControls }

    /// From the caller's side, like the call screen's state line. Muted in a
    /// live call, it says so, as the call screen does: the Lock Screen said
    /// "Ferni's listening" to a muted mic (award upgrade 9).
    public func words(_ name: String, muted: Bool = false) -> String {
        if muted, [.listening, .thinking, .speaking, .here].contains(self) { return "You're muted" }
        return switch self {
        case .calling: "Calling \(name)"
        case .arriving: "\(name)'s on the way"
        case .listening: "\(name)'s listening"
        case .thinking: "\(name)'s thinking"
        case .speaking: "\(name)'s talking"
        case .reconnecting: "Reconnecting"
        case .onHold: "On hold"
        case .ended: "Talk soon."
        case .couldNotJoin: "\(name) couldn't join right now"
        case .bringingIn: "Bringing in \(name)"
        case .here: "\(name)'s here"
        }
    }
}

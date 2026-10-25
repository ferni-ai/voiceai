import FerniDesign
import FerniKit
import Foundation

/// What's happening in a call, said once for every surface that says it
/// (trust panel R4, R5): the state line under the captions, the name chip and
/// the Live Activity. They used to decide separately, and two of them lied:
/// "Ferni's listening" through a handoff while nobody was, on screen and on
/// the Lock Screen, and the chip said Ferni for about 2 s while Maya talked.
///
/// - "Listening" only when the agent's turn state is listening.
/// - In a handoff, who is bringing in whom, never "listening".
/// - The chip names whose voice the caller hears (`voicePersonaID`, which
///   moves on that teammate's first words), never a timer.
public struct CallTruth: Equatable, Sendable {
    /// The line under the captions. Nil while someone is talking (their words
    /// say it) and outside a call.
    public let line: String?
    /// Who the name chip names: whoever the caller hears.
    public let chipPersonaID: String
    /// The Lock Screen and Dynamic Island; nil when there's no call.
    public let activity: CallActivityAttributes.ContentState?

    /// - Parameters:
    ///   - personaID: who the call is with now (it changes when a handoff completes).
    ///   - voicePersonaID: whose voice the caller last heard (CallSession).
    public static func of(
        phase: CallSession.Phase, onHold: Bool, muted: Bool, pose: AvatarPose,
        personaID: String, voicePersonaID: String
    ) -> CallTruth {
        let name = PersonaRegistry.get(voicePersonaID).name
        func activity(_ state: CallActivityState, _ id: String = voicePersonaID) -> CallActivityAttributes.ContentState {
            .init(state: state, personaID: id, personaName: PersonaRegistry.get(id).name, muted: muted)
        }
        func truth(_ line: String?, _ state: CallActivityState?, _ id: String = voicePersonaID) -> CallTruth {
            CallTruth(line: line, chipPersonaID: voicePersonaID, activity: state.map { activity($0, id) })
        }
        switch phase {
        case .connecting:
            return truth(String(localized: "Calling \(name)…"), .calling)
        case .waitingForFerni:
            return truth(String(localized: "\(name)'s on the way…"), .arriving)
        case .reconnecting:
            return truth(String(localized: "Reconnecting…"), .reconnecting)
        case .failed(.ferniDidNotJoin):
            return truth(nil, .couldNotJoin)
        case .live:
            if onHold { return truth(String(localized: "On hold"), .onHold) }
            if let teammate = incoming(pose: pose, personaID: personaID, voicePersonaID: voicePersonaID) {
                let theirs = PersonaRegistry.get(teammate).name
                return truth(String(localized: "\(name)'s bringing in \(theirs)…"), .bringingIn, teammate)
            }
            let (line, state): (String?, CallActivityState) = switch pose {
            case .speaking: (nil, .speaking)
            case .thinking: (String(localized: "\(name)'s thinking"), .thinking)
            case .listening: (String(localized: "\(name)'s listening"), .listening)
            default: (String(localized: "\(name)'s here"), .here)
            }
            // Muted, the line says so; the Live Activity says so from its own muted flag.
            return truth(muted ? String(localized: "You're muted") : line, state)
        default:
            return truth(nil, nil)
        }
    }

    /// The teammate on the way in: announced (the handoff pose), or already
    /// taking the call but not yet heard.
    static func incoming(pose: AvatarPose, personaID: String, voicePersonaID: String) -> String? {
        if case .handoffArriving(let to) = pose, to != voicePersonaID { return to }
        return personaID != voicePersonaID ? personaID : nil
    }

    @MainActor public static func of(_ call: CallSession) -> CallTruth {
        of(phase: call.phase, onHold: call.isOnHold, muted: call.isMuted, pose: call.avatar.pose,
           personaID: call.personaID, voicePersonaID: call.voicePersonaID)
    }
}

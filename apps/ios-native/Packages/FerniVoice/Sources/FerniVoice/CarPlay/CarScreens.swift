import CarPlay
import FerniDesign
import FerniKit
import UIKit

/// What Ferni shows in the car, as plain values (tested without CarPlay):
/// pick who to talk to, then a voice screen with Mute and End. No captions,
/// nothing to read while driving: only who and what's happening.
public enum CarScreens {
    public struct Row: Equatable, Sendable {
        public let personaID: String
        public let title: String
    }

    /// "Continue with" whoever answers next, then the rest of your team.
    public static func rows(team unlocked: Set<String>, chosen: String) -> [Row] {
        let next = PersonaRegistry.get(chosen)
        let others = PersonaRegistry.all.filter { unlocked.contains($0.id) && $0.id != next.id }
        return [Row(personaID: next.id, title: String(localized: "Continue with \(next.name)"))]
            + others.map { Row(personaID: $0.id, title: $0.name) }
    }

    /// The voice screen's state for this moment of the call.
    public enum VoiceState: String, CaseIterable, Sendable {
        case connecting, listening, thinking, speaking, onHold

        public static func of(phase: CallSession.Phase, pose: AvatarPose, onHold: Bool) -> VoiceState {
            if onHold { return .onHold }
            switch phase {
            case .connecting, .waitingForFerni, .reconnecting: return .connecting
            default: break
            }
            switch pose {
            case .speaking: return .speaking
            case .thinking: return .thinking
            default: return .listening
            }
        }

        /// Short titles, longest first (CarPlay picks the longest that fits).
        public func titles(name: String) -> [String] {
            switch self {
            case .connecting: [String(localized: "Calling \(name)…"), String(localized: "Calling…")]
            case .listening: [String(localized: "\(name)'s listening"), String(localized: "Listening")]
            case .thinking: [String(localized: "\(name)'s thinking"), String(localized: "Thinking")]
            case .speaking: [name]
            case .onHold: [String(localized: "On hold")]
            }
        }
    }
}

/// The CarPlay templates for those screens. Voice-based conversation apps get
/// Mute and End on the voice screen from iOS 26.4, so the whole thing waits for
/// it; the app registers its CarPlay scene only once Apple grants the
/// carplay-voice-based-conversation entitlement (see project.yml).
@available(iOS 26.4, *)
@MainActor
public enum CarTemplates {
    public static func team(_ rows: [CarScreens.Row], talk: @escaping @MainActor (String) -> Void) -> CPListTemplate {
        let items = rows.map { row in
            let item = CPListItem(text: row.title, detailText: nil,
                                  image: AlivePortraits.image(WindowPersona(personaId: row.personaID), dark: false))
            item.handler = { _, done in
                talk(row.personaID)
                done()
            }
            return item
        }
        return CPListTemplate(title: "Ferni", sections: [CPListSection(items: items)])
    }

    public static func voice(name: String, muted: Bool, mute: @escaping @MainActor () -> Void,
                             end: @escaping @MainActor () -> Void) -> CPVoiceControlTemplate {
        func buttons() -> [CPButton] {
            let muteButton = CPButton(image: UIImage(systemName: muted ? "mic.slash.fill" : "mic.fill")!) { _ in mute() }
            muteButton.title = muted ? String(localized: "Unmute") : String(localized: "Mute")
            let endButton = CPButton(image: UIImage(systemName: "phone.down.fill")!) { _ in end() }
            endButton.title = String(localized: "End")
            return [muteButton, endButton]
        }
        // Mute and End on every state, so they're there whatever Ferni is doing.
        let states = CarScreens.VoiceState.allCases.map { state in
            let voice = CPVoiceControlState(identifier: state.rawValue, titleVariants: state.titles(name: name),
                                            image: nil, repeats: false)
            voice.actionButtons = buttons()
            return voice
        }
        return CPVoiceControlTemplate(voiceControlStates: states)
    }
}
